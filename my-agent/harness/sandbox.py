"""
Sandbox — 阶段 6：路径安全沙箱

限制文件操作只能在允许的目录中进行，防止路径穿越攻击。

用法：
    sandbox = Sandbox(allowed_dirs=["./workspace", "./output"])
    sandbox.is_path_safe("./workspace/test.txt")  # True
    sandbox.is_path_safe("../etc/passwd")         # False
    content = sandbox.safe_read_file("./workspace/test.txt")
    sandbox.safe_write_file("./workspace/test.txt", "hello")
"""

import os
import shlex
from pathlib import Path
from typing import Optional


class Sandbox:
    """文件系统沙箱：限制文件操作在允许的目录范围内。

    防止路径穿越攻击（如 ../etc/passwd）、符号链接绕过等。

    属性：
        allowed_dirs: 允许访问的目录绝对路径列表
    """

    def __init__(self, allowed_dirs: list[str]):
        """初始化沙箱。

        Args:
            allowed_dirs: 允许访问的目录列表（相对路径或绝对路径）。
                          会自动创建不存在的目录。
        """
        self.allowed_dirs: list[str] = []
        for d in allowed_dirs:
            abs_path = os.path.abspath(d)
            os.makedirs(abs_path, exist_ok=True)
            self.allowed_dirs.append(abs_path)

    def is_path_safe(self, path: str) -> bool:
        """检查路径是否在允许的目录范围内。

        使用 os.path.realpath 解析符号链接，防止符号链接绕过。

        Args:
            path: 要检查的路径

        Returns:
            True 如果路径安全，False 否则
        """
        try:
            real_path = os.path.realpath(path)
        except (ValueError, OSError):
            return False

        for allowed_dir in self.allowed_dirs:
            allowed_dir_real = os.path.realpath(allowed_dir)
            if real_path == allowed_dir_real or real_path.startswith(
                allowed_dir_real + os.sep
            ):
                return True

        return False

    def safe_read_file(self, path: str, encoding: str = "utf-8") -> str:
        """安全读取文件内容。

        Args:
            path: 文件路径
            encoding: 文件编码

        Returns:
            文件内容字符串

        Raises:
            PermissionError: 路径不在允许范围内
            FileNotFoundError: 文件不存在
            IsADirectoryError: 路径是目录
        """
        if not self.is_path_safe(path):
            raise PermissionError(f"路径访问被沙箱拒绝: {path}")

        if not os.path.exists(path):
            raise FileNotFoundError(f"文件不存在: {path}")

        if os.path.isdir(path):
            raise IsADirectoryError(f"路径是目录，不能作为文件读取: {path}")

        with open(path, "r", encoding=encoding) as f:
            return f.read()

    def safe_write_file(
        self, path: str, content: str, encoding: str = "utf-8"
    ) -> None:
        """安全写入文件内容。

        自动创建父目录。

        Args:
            path: 文件路径
            content: 要写入的内容
            encoding: 文件编码

        Raises:
            PermissionError: 路径不在允许范围内
        """
        if not self.is_path_safe(path):
            raise PermissionError(f"路径访问被沙箱拒绝: {path}")

        parent_dir = os.path.dirname(os.path.abspath(path))
        os.makedirs(parent_dir, exist_ok=True)

        with open(path, "w", encoding=encoding) as f:
            f.write(content)

    def safe_list_directory(self, path: str = ".") -> list[str]:
        """安全列出目录内容。

        Args:
            path: 目录路径

        Returns:
            目录中的文件名列表

        Raises:
            PermissionError: 路径不在允许范围内
            NotADirectoryError: 路径不是目录
        """
        if not self.is_path_safe(path):
            raise PermissionError(f"路径访问被沙箱拒绝: {path}")

        if not os.path.isdir(path):
            raise NotADirectoryError(f"路径不是目录: {path}")

        return os.listdir(path)

    def is_command_blocked(self, command: str, blocked_commands: list[str]) -> bool:
        """检查命令是否在阻止列表中。

        使用子字符串匹配（不区分大小写）。

        Args:
            command: 要检查的命令字符串
            blocked_commands: 被阻止的命令列表

        Returns:
            True 如果命令被阻止，False 否则
        """
        command_lower = command.lower()
        for blocked in blocked_commands:
            if blocked.lower() in command_lower:
                return True
        return False

    def sanitize_path(self, path: str) -> str:
        """清理路径中的危险字符，防止路径穿越。

        处理空字节注入和路径规范化。

        Args:
            path: 原始路径

        Returns:
            清理后的规范化路径
        """
        # 移除空字节（空字节注入攻击）
        path = path.replace("\0", "")
        # 规范化路径（解析 .. 和 .）
        normalized = os.path.normpath(path)
        return normalized

    def is_safe_command(self, command: str, blocked_commands: list[str]) -> bool:
        """检查 shell 命令是否安全。

        结合命令阻止列表检查。

        Args:
            command: 要执行的命令
            blocked_commands: 被阻止的命令列表

        Returns:
            True 如果命令安全，False 否则
        """
        return not self.is_command_blocked(command, blocked_commands)

    def add_allowed_directory(self, path: str) -> None:
        """动态添加允许访问的目录。

        Args:
            path: 要添加的目录路径
        """
        abs_path = os.path.abspath(path)
        os.makedirs(abs_path, exist_ok=True)
        if abs_path not in self.allowed_dirs:
            self.allowed_dirs.append(abs_path)

    def remove_allowed_directory(self, path: str) -> None:
        """移除允许访问的目录。

        Args:
            path: 要移除的目录路径
        """
        abs_path = os.path.abspath(path)
        if abs_path in self.allowed_dirs:
            self.allowed_dirs.remove(abs_path)