"""
MCP File System Server - 阶段 4：MCP 协议集成

使用 FastMCP 实现文件系统工具：
- read_file: 读取文件内容
- list_directory: 列出目录内容
- write_file: 写入文件

启动方式：python mcp_servers/file_server.py（stdio transport）
"""

import os
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("file-system-server")


@mcp.tool()
def read_file(path: str) -> str:
    """读取文件内容。path 为相对于项目根目录的文件路径。"""
    if not os.path.exists(path):
        return f"错误：文件不存在 {path}"
    if not os.path.isfile(path):
        return f"错误：路径不是文件 {path}"
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        # 限制返回长度，避免上下文溢出
        max_chars = 5000
        if len(content) > max_chars:
            content = content[:max_chars] + f"\n\n... (文件共 {len(content)} 字符，已截断)"
        return content
    except Exception as e:
        return f"读取文件失败：{e}"


@mcp.tool()
def list_directory(path: str) -> str:
    """列出目录内容。path 为相对于项目根目录的目录路径。"""
    if not os.path.exists(path):
        return f"错误：目录不存在 {path}"
    if not os.path.isdir(path):
        return f"错误：路径不是目录 {path}"
    try:
        entries = os.listdir(path)
        if not entries:
            return f"目录 {path} 为空"
        result = f"目录 {path} 内容（{len(entries)} 项）：\n"
        for entry in sorted(entries):
            full_path = os.path.join(path, entry)
            prefix = "[DIR] " if os.path.isdir(full_path) else "[FILE]"
            result += f"  {prefix} {entry}\n"
        return result
    except Exception as e:
        return f"列出目录失败：{e}"


@mcp.tool()
def write_file(path: str, content: str) -> str:
    """写入文件。path 为相对于项目根目录的文件路径，content 为文件内容。"""
    try:
        dir_name = os.path.dirname(path)
        if dir_name:
            os.makedirs(dir_name, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"已写入 {path}（{len(content)} 字符）"
    except Exception as e:
        return f"写入文件失败：{e}"


if __name__ == "__main__":
    mcp.run()