"""
AgentConfig — 阶段 6：配置管理

从 config.yaml 加载 Agent 配置，提供类型安全的配置访问。

用法：
    config = AgentConfig.from_yaml("config.yaml")
    print(config.llm_model)
    print(config.allowed_directories)
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class McpServerConfig:
    """MCP Server 配置。"""
    name: str = "unknown"
    command: str = "python"
    args: list[str] = field(default_factory=list)


@dataclass
class AgentConfig:
    """Agent 全局配置，从 config.yaml 加载。

    属性：
        llm_model: 主 LLM 模型名称
        llm_fallback_model: 降级模型名称（上下文超长时使用）
        max_turns: 最大工具调用轮次
        max_tokens_per_turn: 每轮最大 token 数
        temperature: LLM 温度参数
        enable_cache: 是否启用缓存
        allowed_directories: 沙箱允许访问的目录列表
        blocked_commands: 被阻止的命令列表
        mcp_servers: MCP Server 配置列表
    """

    llm_model: str = "gpt-4o"
    llm_fallback_model: str = "gpt-4o-mini"
    max_turns: int = 10
    max_tokens_per_turn: int = 8000
    temperature: float = 0.7
    enable_cache: bool = True
    allowed_directories: list[str] = field(default_factory=lambda: ["./workspace", "./output"])
    blocked_commands: list[str] = field(default_factory=lambda: ["rm -rf", "format"])
    mcp_servers: list[McpServerConfig] = field(default_factory=list)

    @classmethod
    def from_yaml(cls, path: str = "config.yaml") -> "AgentConfig":
        """从 YAML 文件加载配置。

        Args:
            path: config.yaml 文件路径（相对于当前工作目录或绝对路径）

        Returns:
            AgentConfig 实例

        Raises:
            FileNotFoundError: 配置文件不存在
            ValueError: YAML 解析失败
        """
        import yaml

        config_path = Path(path)
        if not config_path.is_absolute():
            # 相对于 my-agent 目录
            base_dir = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            config_path = base_dir / path

        if not config_path.exists():
            raise FileNotFoundError(f"配置文件不存在: {config_path}")

        with open(config_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        # 解析 MCP Server 配置
        mcp_servers = []
        for server_cfg in raw.get("mcp_servers", []):
            mcp_servers.append(McpServerConfig(
                name=server_cfg.get("name", "unknown"),
                command=server_cfg.get("command", "python"),
                args=server_cfg.get("args", []),
            ))

        return cls(
            llm_model=raw.get("llm_model", "gpt-4o"),
            llm_fallback_model=raw.get("llm_fallback_model", "gpt-4o-mini"),
            max_turns=int(raw.get("max_turns", 10)),
            max_tokens_per_turn=int(raw.get("max_tokens_per_turn", 8000)),
            temperature=float(raw.get("temperature", 0.7)),
            enable_cache=bool(raw.get("enable_cache", True)),
            allowed_directories=raw.get("allowed_directories", ["./workspace", "./output"]),
            blocked_commands=raw.get("blocked_commands", ["rm -rf", "format"]),
            mcp_servers=mcp_servers,
        )

    def __repr__(self) -> str:
        return (
            f"AgentConfig(model={self.llm_model}, fallback={self.llm_fallback_model}, "
            f"max_turns={self.max_turns}, temperature={self.temperature})"
        )