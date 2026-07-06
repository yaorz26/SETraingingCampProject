"""ToolRegistry + 工具函数 - 阶段 2: 工具调用 (Tool Use)"""

import ast
import operator
from datetime import datetime
from typing import Any, Callable

_ALLOWED_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv,
}
_ALLOWED_UNARYOPS = {ast.USub: operator.neg, ast.UAdd: operator.pos}


def _eval_node(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.BinOp):
        op = _ALLOWED_BINOPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported op: {type(node.op).__name__}")
        return op(_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp):
        op = _ALLOWED_UNARYOPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported unary: {type(node.op).__name__}")
        return op(_eval_node(node.operand))
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    raise ValueError(f"Unsupported node: {type(node).__name__}")


def _safe_calculate(expression: str) -> str:
    try:
        dangerous = ["__", "import", "exec", "eval", "open", "os", "sys",
                     "subprocess", "compile", "globals", "locals", "getattr",
                     "setattr", "delattr", "hasattr", "class", "lambda"]
        for kw in dangerous:
            if kw in expression.lower():
                return f"Error: dangerous keyword '{kw}' rejected"
        node = ast.parse(expression, mode="eval").body
        return str(_eval_node(node))
    except Exception as e:
        return f"Error: {e}"


def get_current_time() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def calculate(expression: str) -> str:
    return _safe_calculate(expression)


def search_web(query: str) -> str:
    return (
        f"Search '{query}' mock results:\n"
        f"1. Info about '{query}'\n"
        f"2. Encyclopedia of {query}\n"
        f"3. Latest news of {query}"
    )


class ToolRegistry:
    def __init__(self):
        self.tools: dict[str, dict] = {}

    def register(self, func: Callable, schema: dict) -> None:
        self.tools[func.__name__] = {"function": func, "schema": schema}

    def get_schemas(self) -> list[dict]:
        return [t["schema"] for t in self.tools.values()]

    def execute(self, name: str, arguments: dict) -> str:
        tool = self.tools.get(name)
        if not tool:
            return f"Error: tool '{name}' not found"
        try:
            return str(tool["function"](**arguments))
        except Exception as e:
            return f"Tool error ({name}): {e}"


def create_default_registry() -> ToolRegistry:
    r = ToolRegistry()
    r.register(get_current_time, {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Get current date and time.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    })
    r.register(calculate, {
        "type": "function",
        "function": {
            "name": "calculate",
            "description": "Safely calculate a math expression. Supports + - * / ** // % and ().",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Math expression, e.g. '100 * 25 + 3'"
                    }
                },
                "required": ["expression"]
            }
        }
    })
    r.register(search_web, {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword"
                    }
                },
                "required": ["query"]
            }
        }
    })
    return r