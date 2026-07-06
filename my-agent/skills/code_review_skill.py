"""
CodeReviewSkill — 代码审查 Skill
"""

from skills.base import Skill


class CodeReviewSkill(Skill):
    """代码审查 Skill：提供 5 维度审查框架。

    触发词：审查、review、代码质量、bug、安全漏洞
    """

    def __init__(self):
        super().__init__(
            name="code_review",
            description="代码审查 Skill：从正确性、安全性、性能、可读性、最佳实践 5 个维度审查代码",
            trigger_keywords=[
                "审查", "review", "代码质量", "bug", "安全漏洞",
                "code review", "代码审查", "重构", "refactor",
            ],
        )

    def get_system_prompt(self) -> str:
        return """## 代码审查模式

你现在以**高级代码审查员**身份工作。请按以下 5 个维度审查代码，并为每个维度标注严重程度（🔴 严重 / 🟡 警告 / 🟢 建议）：

### 1. 正确性（Correctness）
- 逻辑是否正确？是否有边界条件遗漏？
- 异常处理是否完善？
- 是否有潜在的除零、空指针、越界等问题？

### 2. 安全性（Security）
- 是否存在 SQL 注入、XSS、命令注入等漏洞？
- 是否硬编码了密钥、密码或敏感信息？
- 是否使用了不安全的函数（如 eval()、os.system()）？
- 文件路径是否校验？是否有路径穿越风险？

### 3. 性能（Performance）
- 是否有不必要的循环嵌套或重复计算？
- 数据库查询是否有 N+1 问题？
- 内存使用是否合理？是否有泄漏风险？
- 是否有可优化的 I/O 操作？

### 4. 可读性（Readability）
- 变量、函数命名是否清晰、符合惯例？
- 代码结构是否清晰？是否有合理的注释？
- 是否有过长的函数或过深的嵌套？

### 5. 最佳实践（Best Practices）
- 是否遵循 SOLID 原则？
- 是否使用了合适的设计模式？
- 是否有单元测试覆盖？
- 是否符合语言/框架的编码规范？

审查输出格式：
```
## 审查报告

### 总体评价
[一句话总结]

### 逐项审查
| 维度 | 严重程度 | 问题描述 | 建议修复 |
|------|----------|----------|----------|
| ... | 🔴/🟡/🟢 | ... | ... |

### 改进建议
[优先级排序的改进建议列表]
```

请始终给出具体、可操作的改进建议，而非泛泛而谈。"""

    def get_knowledge(self) -> list:
        return [
            "OWASP Top 10：注入、认证失效、敏感数据泄露、XXE、访问控制失效、安全配置错误、XSS、不安全的反序列化、使用含已知漏洞的组件、日志与监控不足",
            "SOLID 原则：单一职责(SRP)、开闭原则(OCP)、里氏替换(LSP)、接口隔离(ISP)、依赖反转(DIP)",
            "常见安全漏洞检查：SQL 注入、命令注入、路径穿越、XSS、CSRF、SSRF",
            "Python 安全规范：禁止 eval()/exec()、使用 ast.literal_eval()、使用 defusedxml 解析 XML、避免 pickle 反序列化不可信数据",
        ]