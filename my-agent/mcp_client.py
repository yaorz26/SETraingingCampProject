"""
MCPToolManager - 阶段 4：MCP 协议集成

管理 MCP Server 的 stdio 连接、工具发现与调用。
使用 AsyncExitStack 管理资源生命周期，避免手动 __aenter__/__aexit__。

关键约束：
- 所有方法统一为 async def
- 使用 contextlib.AsyncExitStack 管理连接
- 工具 schema 转为 OpenAI function calling 格式
"""

import json
import os
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class MCPToolManager:
    """管理多个 MCP Server 的 stdio 连接、工具发现与调用。

    用法：
        manager = MCPToolManager()
        await manager.connect_server("filesystem", "python", ["mcp_servers/file_server.py"])
        tools = manager.get_openai_tools()
        result = await manager.execute_tool("read_file", {"path": "README.md"})
        await manager.close_all()
    """

    def __init__(self):
        self._exit_stack = AsyncExitStack()
        self._sessions: dict[str, ClientSession] = {}       # server_name → session
        self._tools: dict[str, str] = {}                     # tool_name → server_name
        self._tool_schemas: list[dict] = []                  # OpenAI function schema 列表

    async def connect_server(self, name: str, command: str, args: list[str]) -> None:
        """连接一个 MCP Server（stdio transport）。

        Args:
            name: Server 名称（唯一标识）
            command: 启动命令（如 "python"）
            args: 命令参数（如 ["mcp_servers/file_server.py"]）
        """
        server_params = StdioServerParameters(command=command, args=args)

        # 使用 AsyncExitStack 管理 stdio_client 和 session 的生命周期
        stdio_transport = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )
        read, write = stdio_transport

        session = await self._exit_stack.enter_async_context(
            ClientSession(read, write)
        )
        await session.initialize()

        self._sessions[name] = session

        # 发现该 Server 提供的工具
        tools_result = await session.list_tools()
        for tool in tools_result.tools:
            # 转为 OpenAI function calling 格式
            schema = self._mcp_tool_to_openai_schema(tool)
            self._tool_schemas.append(schema)
            self._tools[tool.name] = name

    async def execute_tool(self, name: str, arguments: dict) -> str:
        """执行指定工具。

        Args:
            name: 工具名称
            arguments: 工具参数

        Returns:
            工具执行结果字符串
        """
        server_name = self._tools.get(name)
        if server_name is None:
            return f"Error: tool '{name}' not found in any MCP server"

        session = self._sessions.get(server_name)
        if session is None:
            return f"Error: server '{server_name}' not connected"

        try:
            result = await session.call_tool(name, arguments)
            # 提取文本内容
            parts = []
            for content_item in result.content:
                if hasattr(content_item, "text"):
                    parts.append(content_item.text)
                else:
                    parts.append(str(content_item))
            return "\n".join(parts) if parts else str(result)
        except Exception as e:
            return f"Error executing MCP tool '{name}': {e}"

    def get_openai_tools(self) -> list[dict]:
        """返回所有 MCP 工具的 OpenAI function calling schema 列表。"""
        return self._tool_schemas

    def get_tool_names(self) -> list[str]:
        """返回所有可用工具名称列表。"""
        return list(self._tools.keys())

    async def close_all(self) -> None:
        """关闭所有 MCP 连接，释放资源。"""
        try:
            await self._exit_stack.aclose()
        except Exception:
            pass
        self._sessions.clear()
        self._tools.clear()
        self._tool_schemas.clear()

    @staticmethod
    def _mcp_tool_to_openai_schema(tool) -> dict:
        """将 MCP Tool 对象转为 OpenAI function calling schema。

        MCP Tool 属性：
        - name: 工具名称
        - description: 工具描述
        - inputSchema: JSON Schema 格式的参数定义
        """
        schema = {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or f"Tool: {tool.name}",
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        }

        # 转换 inputSchema 到 OpenAI 格式
        input_schema = getattr(tool, "inputSchema", None)
        if input_schema:
            props = input_schema.get("properties", {})
            required = input_schema.get("required", [])
            schema["function"]["parameters"]["properties"] = props
            schema["function"]["parameters"]["required"] = required

        return schema