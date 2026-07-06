"""
WebDevSkill — Web 开发 Skill
"""

from skills.base import Skill


class WebDevSkill(Skill):
    """Web 开发 Skill：提供现代前端/后端开发规范指引。

    触发词：网页、前端、后端、API、React、HTML、CSS
    """

    def __init__(self):
        super().__init__(
            name="web_dev",
            description="Web 开发 Skill：提供现代前端与后端开发的最佳实践指引",
            trigger_keywords=[
                "网页", "前端", "后端", "API", "React", "HTML", "CSS",
                "web", "网站", "接口", "REST", "Vue", "JavaScript",
                "TypeScript", "Node", "Django", "Flask", "FastAPI",
                "响应式", "组件", "路由", "状态管理",
            ],
        )

    def get_system_prompt(self) -> str:
        return """## Web 开发模式

你现在以**全栈 Web 开发专家**身份工作。请遵循以下规范：

### 前端规范
- **HTML**：使用语义化标签（`<header>`、`<nav>`、`<main>`、`<article>`、`<section>`、`<footer>`），确保无障碍访问（ARIA 属性）
- **CSS**：优先使用 Flexbox / Grid 布局，考虑移动端响应式设计（Mobile First），使用 CSS 变量管理主题色
- **JavaScript/TypeScript**：优先使用 TypeScript，使用 `const`/`let` 替代 `var`，使用 async/await 处理异步
- **React**：函数组件 + Hooks，使用 Context 或状态管理库，组件拆分遵循单一职责
- 考虑性能：代码分割、懒加载、图片优化、CDN

### 后端规范
- **RESTful API**：使用标准 HTTP 方法（GET/POST/PUT/DELETE），资源命名用复数名词，版本控制（/api/v1/）
- **错误处理**：统一错误响应格式 `{"error": {"code": "...", "message": "..."}}`
- **安全**：输入校验、参数化查询防注入、CORS 配置、Rate Limiting、JWT 或 Session 认证
- **数据库**：使用 ORM 或参数化查询，做好索引优化，考虑事务一致性

### 通用规范
- 代码可维护性：清晰的目录结构、合理的模块划分
- 环境配置：使用环境变量管理敏感信息，区分开发/测试/生产环境
- 测试：单元测试 + 集成测试，关键路径覆盖率 ≥ 80%
- 日志：结构化日志，包含请求 ID 便于追踪

输出格式：
- 代码示例请使用 Markdown 代码块，标注语言
- 项目结构用树形图展示
- 给出可直接运行的代码片段"""

    def get_knowledge(self) -> list:
        return [
            "React 最佳实践：使用函数组件 + Hooks，避免 class 组件；使用 React.memo 和 useMemo/useCallback 优化渲染；使用 Error Boundary 处理错误",
            "CSS 布局：Flexbox 适合一维布局，Grid 适合二维布局；使用 clamp()/min()/max() 实现流式排版；媒体查询断点建议：576px, 768px, 992px, 1200px",
            "RESTful API 设计：资源用复数名词(/users, /posts)；用嵌套表示关系(/users/1/posts)；用查询参数做过滤/排序/分页(?page=1&limit=20&sort=created_at)",
            "安全最佳实践：HTTPS 强制、CSP 头、X-Frame-Options、输入验证与净化、密码 bcrypt 哈希、JWT 短期有效 + refresh token",
            "性能优化：前端—代码分割、Tree Shaking、图片 WebP 格式、CDN；后端—数据库索引、查询优化、缓存(Redis)、连接池",
        ]