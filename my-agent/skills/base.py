"""
Skill 抽象基类 — 阶段 5

定义 Skill 接口：每个 Skill 提供 system prompt、工具列表、知识库，并通过关键词匹配决定是否激活。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class Skill(ABC):
    """Skill 抽象基类。

    每个 Skill 代表 Agent 在某领域的能力模块。
    通过触发关键词匹配，SkillRouter 自动激活对应的 Skill。

    Attributes:
        name: Skill 唯一名称
        description: Skill 功能描述
        trigger_keywords: 触发关键词列表，匹配即激活
    """

    name: str = ""
    description: str = ""
    trigger_keywords: list = field(default_factory=list)

    @abstractmethod
    def get_system_prompt(self) -> str:
        """返回此 Skill 的 system prompt 片段。

        Returns:
            该 Skill 注入到 system prompt 的指令文本
        """
        ...

    def get_tools(self) -> list:
        """返回此 Skill 需要的额外工具 schema 列表。

        默认返回空列表。子类可重写以提供 Skill 专属工具。
        每个元素为 OpenAI function calling 格式的 dict。

        Returns:
            工具 schema 列表
        """
        return []

    def get_knowledge(self) -> list:
        """返回此 Skill 的知识库条目。

        默认返回空列表。子类可重写以提供领域知识。
        每条知识为一个 str。

        Returns:
            知识条目列表
        """
        return []

    def should_activate(self, user_message: str) -> bool:
        """判断此 Skill 是否应被激活。

        默认实现：检查 user_message 是否包含任一触发关键词。
        子类可重写以实现更复杂的匹配逻辑。

        Args:
            user_message: 用户输入消息

        Returns:
            是否激活
        """
        if not self.trigger_keywords:
            return False
        message_lower = user_message.lower()
        return any(kw.lower() in message_lower for kw in self.trigger_keywords)