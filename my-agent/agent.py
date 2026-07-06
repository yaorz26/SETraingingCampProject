"""
SimpleAgent - 最小可行 Agent（Hello World）

阶段 1 目标：跑通"用户输入 → LLM 回复"链路，维护对话历史。

关键约束：
- 不硬编码 API Key，从 .env 读取
- model 从 LLM_MODEL 环境变量读取，默认 gpt-4o
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

# 加载 .env 环境变量（override=True：强制覆盖系统环境变量，确保 .env 中的值生效）
load_dotenv(override=True)


class SimpleAgent:
    """最小可行 Agent：维护多轮对话历史，调用 LLM 生成回复。"""

    def __init__(self, system_prompt: str = None):
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
            "请用简洁、清晰的中文回答用户的问题。"
        )

        # 对话历史
        self.history = []

    def chat(self, user_message: str) -> str:
        """
        与 Agent 对话：追加用户消息 → 调用 LLM → 追加回复 → 返回回复文本。

        Args:
            user_message: 用户输入消息

        Returns:
            LLM 生成的回复文本
        """
        # 1. 追加用户消息到历史
        self.history.append({"role": "user", "content": user_message})

        # 2. 构造消息列表：system + 完整历史
        messages = [{"role": "system", "content": self.system_prompt}] + self.history

        # 3. 调用 LLM
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
        )

        # 4. 取回复内容，追加到历史，返回
        reply = response.choices[0].message.content
        self.history.append({"role": "assistant", "content": reply})

        return reply

    def reset(self):
        """清空对话历史。"""
        self.history = []


def main():
    """REPL 入口：循环读取用户输入，输入 exit/quit 退出。"""
    print("=" * 50)
    print("  SimpleAgent - 最小可行 Agent")
    print("  输入 'exit' 或 'quit' 退出")
    print("=" * 50)
    print()

    try:
        agent = SimpleAgent()
    except ValueError as e:
        print(f"❌ 初始化失败：{e}")
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
            print(f"❌ 调用失败：{e}\n")


if __name__ == "__main__":
    main()