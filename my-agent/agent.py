"""
ToolAgent - 阶段 2：支持工具调用的 Agent

在 SimpleAgent 基础上新增：
- 工具调用循环（最多 max_turns 轮）
- last_tool_calls 记录（供评估器使用）
- 使用 ToolRegistry 管理工具

关键约束：
- 不硬编码 API Key，从 .env 读取
- model 从 LLM_MODEL 环境变量读取，默认 gpt-4o
- calculate 工具使用 ast.parse + 白名单，禁止 eval()
"""

import json
import os
from dotenv import load_dotenv
from openai import OpenAI

from tools import ToolRegistry, create_default_registry

# 加载 .env 环境变量（override=True：强制覆盖系统环境变量，确保 .env 中的值生效）
load_dotenv(override=True)


class ToolAgent:
    """支持工具调用的 Agent：循环调用 LLM + 工具，直到得到最终回复。"""

    def __init__(self, system_prompt: str = None, max_turns: int = 10):
        # 从环境变量读取配置（不硬编码密钥）
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.model = os.getenv("LLM_MODEL", "gpt-4o")

        if not self.api_key:
            raise ValueError(
                "未找到 OPENAI_API_KEY，请从 .env.example 复制为 .env 并填入真实 Key"
            )

        # 初始化 OpenAI 客户端
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

        # System Prompt
        self.system_prompt = system_prompt or (
            "你是一个友好且有帮助的 AI 助手。"
            "你可以使用工具来获取信息、计算或搜索。"
            "请用简洁、清晰的中文回答用户的问题。"
        )

        # 对话历史
        self.history = []

        # 阶段 2 新增：工具相关
        self.tool_registry = create_default_registry()
        self.max_turns = max_turns
        self.last_tool_calls = []  # 供评估器使用

    def chat(self, user_message: str) -> str:
        """
        与 Agent 对话：支持多轮工具调用循环。

        流程：
        1. 追加用户消息到 history
        2. 循环调用 LLM（最多 max_turns 次）：
           a. 若 LLM 返回 tool_calls → 执行工具 → 追加结果 → continue
           b. 若 LLM 返回 content → 追加到 history → 返回
        3. 超过 max_turns 返回提示语

        Args:
            user_message: 用户输入消息

        Returns:
            LLM 生成的最终回复文本
        """
        # 1. 追加用户消息到历史
        self.history.append({"role": "user", "content": user_message})

        # 2. 清空本轮工具调用记录
        self.last_tool_calls = []

        # 3. 工具调用循环
        for turn in range(self.max_turns):
            # 构造消息列表
            messages = [{"role": "system", "content": self.system_prompt}] + self.history

            # 调用 LLM（传入工具 schema）
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=self.tool_registry.get_schemas(),
                tool_choice="auto",
            )

            choice = response.choices[0]
            message = choice.message

            # 情况 A：LLM 决定调用工具
            if message.tool_calls:
                # 记录本轮工具调用
                turn_calls = []
                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        arguments = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        arguments = {}
                    tool_result = self.tool_registry.execute(tool_name, arguments)
                    turn_calls.append({
                        "name": tool_name,
                        "arguments": arguments,
                        "result": tool_result,
                    })
                    self.last_tool_calls.append(turn_calls[-1])

                # 追加 assistant 消息（含 tool_calls）到 history
                self.history.append({
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in message.tool_calls
                    ],
                })

                # 追加 tool 消息（工具执行结果）到 history
                for tc in message.tool_calls:
                    tool_name = tc.function.name
                    try:
                        arguments = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        arguments = {}
                    result = self.tool_registry.execute(tool_name, arguments)
                    self.history.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    })

                # 继续下一轮
                continue

            # 情况 B：LLM 返回最终回复
            if message.content:
                reply = message.content
                self.history.append({"role": "assistant", "content": reply})
                return reply

            # 情况 C：既无 tool_calls 也无 content（异常情况）
            return "（Agent 未生成有效回复）"

        # 超过最大轮次
        return "（已达到最大工具调用轮次，请简化您的问题）"

    def reset(self):
        """清空对话历史。"""
        self.history = []
        self.last_tool_calls = []


def main():
    """REPL 入口：循环读取用户输入，输入 exit/quit 退出。"""
    print("=" * 50)
    print("  ToolAgent - 支持工具调用的 Agent")
    print("  可用工具：get_current_time, calculate, search_web")
    print("  输入 'exit' 或 'quit' 退出")
    print("=" * 50)
    print()

    try:
        agent = ToolAgent()
    except ValueError as e:
        print(f"初始化失败：{e}")
        print("请执行：cp .env.example .env，并填入你的 OPENAI_API_KEY")
        return

    while True:
        try:
            user_input = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit"):
            print("再见！")
            break

        try:
            reply = agent.chat(user_input)
            print(f"AI: {reply}\n")
        except Exception as e:
            print(f"调用失败：{e}\n")


if __name__ == "__main__":
    main()
