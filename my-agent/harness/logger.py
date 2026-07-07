"""
AgentLogger — 阶段 6：日志记录

同时输出到文件（DEBUG 级别）和控制台（INFO 级别），维护完整链路追踪。

用法：
    logger = AgentLogger(log_dir="./logs")
    logger.log_turn_start(1, "现在几点了？")
    logger.log_llm_call("gpt-4o", 350, 0.5)
    logger.log_tool_call("get_current_time", {}, "2026-07-07 12:00:00")
    logger.log_error("网络超时")
    logger.log_turn_end(1, "现在是2026年7月7日12:00:00")
    logger.trace  # 完整链路记录
"""

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional


class AgentLogger:
    """Agent 日志记录器：双输出（文件 + 控制台），维护完整链路追踪。

    日志级别：
        - 文件：DEBUG（所有细节）
        - 控制台：INFO（关键事件）
    """

    def __init__(self, log_dir: str = "./logs", name: str = "agent"):
        """初始化日志记录器。

        Args:
            log_dir: 日志文件存放目录
            name: 日志记录器名称
        """
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        # 创建 logger
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.DEBUG)
        self.logger.handlers.clear()  # 防止重复添加 handler

        # 文件 handler：DEBUG 级别
        log_file = self.log_dir / f"agent_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        self.logger.addHandler(file_handler)

        # 控制台 handler：INFO 级别
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(logging.Formatter(
            "[%(levelname)s] %(message)s"
        ))
        self.logger.addHandler(console_handler)

        # 链路追踪记录
        self.trace: list[dict] = []
        self._turn_counter = 0
        self._start_time = time.time()

    # ---- 日志方法 ----

    def log_turn_start(self, turn: int, user_message: str) -> None:
        """记录新一轮对话开始。

        Args:
            turn: 轮次编号
            user_message: 用户输入消息
        """
        self._turn_counter = turn
        msg = f"第 {turn} 轮对话开始 | 用户输入: {user_message[:200]}"
        self.logger.info(msg)
        self._trace_add("turn_start", {
            "turn": turn,
            "user_message": user_message,
            "timestamp": datetime.now().isoformat(),
        })

    def log_llm_call(
        self,
        model: str,
        tokens_used: int,
        response_time: float,
        finish_reason: str = "stop",
    ) -> None:
        """记录 LLM 调用详情。

        Args:
            model: 使用的模型名称
            tokens_used: 消耗的 token 数
            response_time: 响应耗时（秒）
            finish_reason: 完成原因（stop/tool_calls/length）
        """
        msg = (
            f"LLM 调用 | 模型: {model} | "
            f"Token: {tokens_used} | "
            f"耗时: {response_time:.2f}s | "
            f"完成: {finish_reason}"
        )
        self.logger.debug(msg)
        self._trace_add("llm_call", {
            "model": model,
            "tokens_used": tokens_used,
            "response_time": response_time,
            "finish_reason": finish_reason,
        })

    def log_tool_call(self, name: str, arguments: dict, result: str, duration: float = 0.0) -> None:
        """记录工具调用。

        Args:
            name: 工具名称
            arguments: 工具参数
            result: 工具返回结果
            duration: 工具执行耗时（秒）
        """
        result_preview = result[:200] if len(result) > 200 else result
        msg = (
            f"工具调用 | 工具: {name} | "
            f"参数: {arguments} | "
            f"结果: {result_preview}"
        )
        self.logger.debug(msg)
        self._trace_add("tool_call", {
            "name": name,
            "arguments": arguments,
            "result": result,
            "duration": duration,
        })

    def log_error(self, error: str, severity: str = "ERROR") -> None:
        """记录错误。

        Args:
            error: 错误描述
            severity: 错误严重程度（ERROR/WARNING）
        """
        if severity.upper() == "WARNING":
            self.logger.warning(f"错误: {error}")
        else:
            self.logger.error(f"错误: {error}")
        self._trace_add("error", {
            "error": error,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        })

    def log_turn_end(self, turn: int, response: str, total_time: float = 0.0) -> None:
        """记录一轮对话结束。

        Args:
            turn: 轮次编号
            response: Agent 最终回复
            total_time: 本轮总耗时（秒）
        """
        response_preview = response[:200] if len(response) > 200 else response
        msg = (
            f"第 {turn} 轮对话结束 | "
            f"回复: {response_preview} | "
            f"耗时: {total_time:.2f}s"
        )
        self.logger.info(msg)
        self._trace_add("turn_end", {
            "turn": turn,
            "response": response,
            "total_time": total_time,
            "timestamp": datetime.now().isoformat(),
        })

    def log_info(self, message: str) -> None:
        """记录一般信息。"""
        self.logger.info(message)

    def log_debug(self, message: str) -> None:
        """记录调试信息。"""
        self.logger.debug(message)

    def log_warning(self, message: str) -> None:
        """记录警告信息。"""
        self.logger.warning(message)

    # ---- 辅助方法 ----

    def _trace_add(self, event_type: str, data: dict) -> None:
        """向链路追踪列表添加一条记录。"""
        self.trace.append({
            "type": event_type,
            "data": data,
            "elapsed": time.time() - self._start_time,
        })

    def get_trace_summary(self) -> dict:
        """获取链路追踪摘要。

        Returns:
            包含总轮次、LLM 调用次数、工具调用次数、错误次数的摘要字典。
        """
        llm_calls = sum(1 for t in self.trace if t["type"] == "llm_call")
        tool_calls = sum(1 for t in self.trace if t["type"] == "tool_call")
        errors = sum(1 for t in self.trace if t["type"] == "error")
        return {
            "total_events": len(self.trace),
            "llm_calls": llm_calls,
            "tool_calls": tool_calls,
            "errors": errors,
            "total_time": time.time() - self._start_time,
        }

    def clear_trace(self) -> None:
        """清空链路追踪记录。"""
        self.trace = []
        self._start_time = time.time()

    def get_log_file(self) -> Optional[str]:
        """获取当前日志文件路径。"""
        for handler in self.logger.handlers:
            if isinstance(handler, logging.FileHandler):
                return handler.baseFilename
        return None

    def close(self) -> None:
        """关闭日志记录器，释放所有文件句柄。"""
        for handler in self.logger.handlers[:]:
            handler.flush()
            handler.close()
            self.logger.removeHandler(handler)
