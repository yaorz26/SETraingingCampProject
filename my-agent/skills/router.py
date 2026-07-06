"""
SkillRouter — 阶段 5：Skill 路由器

管理 Skill 注册、激活与路由，将激活 Skill 的 prompt 与工具动态注入 Agent。
"""

from skills.base import Skill


class SkillRouter:
    """Skill 路由器：管理 Skill 注册、激活与路由。

    用法：
        router = SkillRouter()
        router.register(CodeReviewSkill())
        router.register(WebDevSkill())
        prompt = router.route("帮我审查这段代码")  # 返回含审查 Skill 的完整 prompt
        tools = router.get_active_tools("帮我审查这段代码")  # 返回激活 Skill 的工具
    """

    def __init__(self):
        self._skills: dict[str, Skill] = {}

    def register(self, skill: Skill) -> None:
        """注册一个 Skill。

        Args:
            skill: Skill 实例，按 name 去重（后注册的覆盖先注册的）
        """
        self._skills[skill.name] = skill

    def unregister(self, name: str) -> bool:
        """注销一个 Skill。

        Returns:
            是否成功注销（Skill 存在时返回 True）
        """
        if name in self._skills:
            del self._skills[name]
            return True
        return False

    def get_skill(self, name: str) -> Skill | None:
        """按名称获取 Skill。"""
        return self._skills.get(name)

    def list_skills(self) -> list[str]:
        """列出所有已注册 Skill 的名称。"""
        return list(self._skills.keys())

    def route(self, user_message: str) -> str:
        """根据用户消息路由，收集所有激活 Skill 的 prompt 并拼接。

        激活规则：
        1. 遍历所有已注册 Skill
        2. 调用 skill.should_activate(user_message) 判断是否激活
        3. 将所有激活 Skill 的 system_prompt 与默认 prompt 拼接

        Args:
            user_message: 用户输入消息

        Returns:
            拼接后的完整 system prompt（含默认 prompt + 所有激活 Skill 的 prompt）
        """
        default_prompt = (
            "你是一个友好且有帮助的 AI 助手。"
            "你可以使用工具来获取信息、计算或搜索。"
            "请用简洁、清晰的中文回答用户的问题。"
        )

        parts = [default_prompt]

        active_count = 0
        for skill in self._skills.values():
            if skill.should_activate(user_message):
                skill_prompt = skill.get_system_prompt()
                parts.append(skill_prompt)
                active_count += 1

                # 注入知识库
                knowledge = skill.get_knowledge()
                if knowledge:
                    knowledge_text = "\n".join(f"- {k}" for k in knowledge)
                    parts.append(f"\n### 参考知识库\n{knowledge_text}")

        if active_count > 1:
            parts.append(
                "\n\n**注意**：多个 Skill 同时激活，请在回答时综合各 Skill 的要求，"
                "确保不冲突、不遗漏。"
            )

        return "\n\n".join(parts)

    def get_active_tools(self, user_message: str) -> list:
        """收集所有激活 Skill 的附加工具。

        Args:
            user_message: 用户输入消息

        Returns:
            所有激活 Skill 的工具 schema 列表（去重）
        """
        tools = []
        seen = set()

        for skill in self._skills.values():
            if skill.should_activate(user_message):
                for tool in skill.get_tools():
                    name = tool.get("function", {}).get("name", "")
                    if name and name not in seen:
                        seen.add(name)
                        tools.append(tool)

        return tools

    def get_active_knowledge(self, user_message: str) -> list[str]:
        """收集所有激活 Skill 的知识库条目。

        Args:
            user_message: 用户输入消息

        Returns:
            知识库条目列表
        """
        knowledge = []
        for skill in self._skills.values():
            if skill.should_activate(user_message):
                knowledge.extend(skill.get_knowledge())
        return knowledge

    def get_active_skill_names(self, user_message: str) -> list[str]:
        """获取当前消息激活的所有 Skill 名称。

        Args:
            user_message: 用户输入消息

        Returns:
            激活的 Skill 名称列表
        """
        return [
            skill.name
            for skill in self._skills.values()
            if skill.should_activate(user_message)
        ]