"""
ErrorRecovery — 阶段 6：错误恢复

对 LLM 调用错误进行分类（可重试/可降级/致命），并提供指数退避重试
和自动降级机制。

用法：
    recovery = ErrorRecovery(fallback_model="gpt-4o-mini")
    severity = recovery.classify_error(exception)
    result = await recovery.execute_with_recovery(async_func, arg1, arg2)
"""

import asyncio
import enum
import time
from typing import Any, Callable, Optional, TypeVar, Union

T = TypeVar("T")


class ErrorSeverity(enum.Enum):
    """错误严重程度分类。

    - RETRYABLE: 可重试（网络超时、限流）
    - DEGRADABLE: 可降级（上下文超长、token 超限）
    - FATAL: 致命错误（认证失败、无效请求）
    """

    RETRYABLE = "retryable"
    DEGRADABLE = "degradable"
    FATAL = "fatal"


# 错误分类关键词映射
_ERROR_PATTERNS: dict[ErrorSeverity, list[str]] = {
    ErrorSeverity.RETRYABLE: [
        "timeout",
        "timed out",
        "rate limit",
        "rate_limit",
        "too many requests",
        "429",
        "503",
        "service unavailable",
        "connection",
        "network",
        "reset by peer",
        "broken pipe",
    ],
    ErrorSeverity.DEGRADABLE: [
        "context length",
        "context_length",
        "maximum context",
        "token limit",
        "token_limit",
        "max_tokens",
        "too long",
        "reduce",
        "truncat",
    ],
    ErrorSeverity.FATAL: [
        "invalid api key",
        "invalid_api_key",
        "unauthorized",
        "401",
        "403",
        "authentication",
        "not found",
        "invalid request",
        "permission",
    ],
}


class ErrorRecovery:
    """错误恢复：分类 + 指数退避重试 + 降级。

    属性：
        fallback_model: 降级模型名称（上下文超长时使用）
        max_retries: 最大重试次数
        base_delay: 基础退避延迟（秒）
        max_delay: 最大退避延迟（秒）
    """

    def __init__(
        self,
        fallback_model: str = "gpt-4o-mini",
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
    ):
        """初始化错误恢复器。

        Args:
            fallback_model: 降级模型名称
            max_retries: 最大重试次数
            base_delay: 基础退避延迟（秒）
            max_delay: 最大退避延迟（秒）
        """
        self.fallback_model = fallback_model
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay

        # 统计
        self.retry_count = 0
        self.fallback_count = 0
        self.fatal_count = 0

    @classmethod
    def classify_error(cls, error: Union[Exception, str]) -> ErrorSeverity:
        """根据错误信息分类严重程度。

        Args:
            error: 异常对象或错误消息字符串

        Returns:
            错误严重程度枚举值
        """
        error_str = str(error).lower()

        # 先检查致命错误（优先级最高）
        for pattern in _ERROR_PATTERNS[ErrorSeverity.FATAL]:
            if pattern in error_str:
                return ErrorSeverity.FATAL

        # 再检查可降级错误
        for pattern in _ERROR_PATTERNS[ErrorSeverity.DEGRADABLE]:
            if pattern in error_str:
                return ErrorSeverity.DEGRADABLE

        # 再检查可重试错误
        for pattern in _ERROR_PATTERNS[ErrorSeverity.RETRYABLE]:
            if pattern in error_str:
                return ErrorSeverity.RETRYABLE

        # 默认视为致命错误
        return ErrorSeverity.FATAL

    def _compute_delay(self, attempt: int) -> float:
        """计算指数退避延迟。

        Args:
            attempt: 当前重试次数（从 1 开始）

        Returns:
            延迟秒数
        """
        delay = self.base_delay * (2 ** (attempt - 1))
        return min(delay, self.max_delay)

    async def execute_with_recovery(
        self,
        func: Callable[..., Any],
        *args: Any,
        fallback_func: Optional[Callable[..., Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """带错误恢复的函数执行。

        策略：
        - RETRYABLE: 指数退避重试（最多 max_retries 次）
        - DEGRADABLE: 调用 fallback_func（如果提供），否则重试 1 次后抛出
        - FATAL: 直接抛出，不重试

        Args:
            func: 要执行的异步函数
            *args: 传递给 func 的位置参数
            fallback_func: 降级函数（用于 DEGRADABLE 错误）
            **kwargs: 传递给 func 的关键字参数

        Returns:
            func 执行成功时的返回值

        Raises:
            原始异常（重试全部失败后）
        """
        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                result = func(*args, **kwargs)
                # 如果是协程，await 它
                if asyncio.iscoroutine(result):
                    result = await result
                return result
            except Exception as e:
                last_error = e
                severity = self.classify_error(e)

                if severity == ErrorSeverity.FATAL:
                    self.fatal_count += 1
                    raise

                if severity == ErrorSeverity.DEGRADABLE:
                    self.fallback_count += 1
                    if fallback_func is not None:
                        result = fallback_func(*args, **kwargs)
                        if asyncio.iscoroutine(result):
                            result = await result
                        return result
                    # 没有降级函数，重试一次
                    if attempt >= self.max_retries:
                        raise
                    delay = self._compute_delay(attempt)
                    await asyncio.sleep(delay)
                    continue

                if severity == ErrorSeverity.RETRYABLE:
                    self.retry_count += 1
                    if attempt >= self.max_retries:
                        raise
                    delay = self._compute_delay(attempt)
                    await asyncio.sleep(delay)
                    continue

        # 所有重试都失败
        if last_error:
            raise last_error
        raise RuntimeError("未知错误：所有重试均失败")

    def execute_sync_with_recovery(
        self,
        func: Callable[..., Any],
        *args: Any,
        fallback_func: Optional[Callable[..., Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """同步版本：带错误恢复的函数执行。

        Args:
            func: 要执行的同步函数
            *args: 位置参数
            fallback_func: 降级函数
            **kwargs: 关键字参数

        Returns:
            func 执行成功时的返回值

        Raises:
            原始异常（重试全部失败后）
        """
        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_error = e
                severity = self.classify_error(e)

                if severity == ErrorSeverity.FATAL:
                    self.fatal_count += 1
                    raise

                if severity == ErrorSeverity.DEGRADABLE:
                    self.fallback_count += 1
                    if fallback_func is not None:
                        return fallback_func(*args, **kwargs)
                    if attempt >= self.max_retries:
                        raise
                    delay = self._compute_delay(attempt)
                    time.sleep(delay)
                    continue

                if severity == ErrorSeverity.RETRYABLE:
                    self.retry_count += 1
                    if attempt >= self.max_retries:
                        raise
                    delay = self._compute_delay(attempt)
                    time.sleep(delay)
                    continue

        if last_error:
            raise last_error
        raise RuntimeError("未知错误：所有重试均失败")

    def reset_stats(self) -> None:
        """重置统计计数器。"""
        self.retry_count = 0
        self.fallback_count = 0
        self.fatal_count = 0

    def get_stats(self) -> dict:
        """获取错误恢复统计。

        Returns:
            包含重试次数、降级次数、致命错误次数的字典。
        """
        return {
            "retry_count": self.retry_count,
            "fallback_count": self.fallback_count,
            "fatal_count": self.fatal_count,
        }