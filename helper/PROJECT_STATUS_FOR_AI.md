# 项目状态与共识（AI 阅读版）

> **文档用途**：供 AI 编码助手（Cline/Claude Code 等）快速了解项目当前进度、重要共识与用户要求，避免重复探索。
> **更新时间**：2026-07-06
> **维护原则**：每次开发进展后更新此文件，保持与实际状态一致。**每完成一个阶段，必须更新本文档的进度表、文件清单、Git 状态和下一步行动，确保 AI 下次读取时获得最新上下文。**

---

## 一、项目概览

- **项目名称**：My Agent（智能化软件工程训练营项目）
- **项目目标**：构建一个类似 Claude Code / Codex 的简易但完整的 AI Agent 系统
- **仓库地址**：https://github.com/yaorz26/SETraingingCampProject.git
- **本地路径**：`d:\yaorz\学习\大二下\智能化软件工程训练营\project`
- **技术栈**：Python 3.10+、OpenAI SDK、MCP SDK、ChromaDB、pytest
- **核心公式**：`Agent = LLM + 工具 + 记忆 + 规划`，强调"可信性判断"

---

## 二、项目当前进度

### 总体阶段：阶段 5（Skill 设计）✅ 已完成

| 阶段 | 名称 | 状态 | 说明 |
|------|------|------|------|
| 阶段 0 | 项目初始化 | ✅ 完成 | 目录结构、配置文件、虚拟环境、依赖安装、Git 管理 |
| 阶段 1 | 最小可行 Agent（Hello World） | ✅ 完成 | `agent.py` - SimpleAgent 类，对话历史维护，REPL 入口 |
| 阶段 2 | 工具调用（Tool Use） | ✅ 完成 | `tools.py` - ToolRegistry，时间/计算/搜索工具；`agent.py` 升级为 ToolAgent |
| 阶段 3 | 上下文工程 | ✅ 完成 | `context_manager.py` - ContextManager、SimpleRAG、Prompt 模板 |
| 阶段 4 | MCP 协议集成 | ✅ 完成 | `mcp_servers/file_server.py`、`mcp_client.py`、MCPAgent |
| 阶段 5 | Skill 设计 | ✅ 完成 | `skills/` - Skill 抽象基类、CodeReviewSkill、WebDevSkill、SkillRouter |
| 阶段 6 | Harness 工程 | ⏳ 待开始 | `harness/` - 日志、配置、错误恢复、沙箱 |
| 阶段 7 | 可信性判断与评估 | ⏳ 待开始 | `evaluation/` - AgentEvaluator、SecurityAuditor |
| 阶段 8 | 系统集成与交付 | ⏳ 待开始 | `main.py` 集成、测试、文档 |

### 已完成的文件清单

```
project/
├── helper/                              # 辅助文档
│   ├── Agent开发指南_AI版.md             # 分阶段执行指令（权威文档）
│   ├── Agent开发指南_已弃用.md           # 旧版（已弃用，勿参考）
│   ├── helper_pdf/                       # 训练营 PDF 与 OCR 输出
│   └── PROJECT_STATUS_FOR_AI.md          # 本文件
└── my-agent/                            # 主项目
    ├── .env.example                      # 环境变量模板
    ├── .gitignore                        # Git 忽略规则
    ├── config.yaml                       # 项目配置
    ├── requirements.txt                  # Python 依赖
    ├── README.md                         # 项目说明
    ├── agent.py                          # ToolAgent + MCPAgent 类（阶段 4 升级）
    ├── tools.py                          # ToolRegistry + 3 个工具（阶段 2）
    ├── context_manager.py                # ContextManager + SimpleRAG + Prompt 模板（阶段 3）
    ├── mcp_client.py                     # MCPToolManager（Stdio 连接 + 工具转换）
    ├── evaluation/.gitkeep               # 评估模块（空）
    ├── harness/.gitkeep                  # 基础设施（空）
    ├── knowledge/.gitkeep                # 知识库（空）
    ├── mcp_servers/                      # MCP Server 模块
    │   ├── __init__.py                   # 包初始化
    │   └── file_server.py                # FastMCP 文件系统 Server（read_file/list_directory/write_file）
    ├── skills/                           # Skill 模块（阶段 5）
    │   ├── __init__.py                   # 包初始化
    │   ├── base.py                       # Skill 抽象基类（name, description, trigger_keywords, should_activate, get_system_prompt, get_tools, get_knowledge）
    │   ├── code_review_skill.py          # CodeReviewSkill（5 维度审查框架：正确性/安全性/性能/可读性/最佳实践）
    │   ├── web_dev_skill.py              # WebDevSkill（前端规范 + 后端规范 + RESTful API）
    │   └── router.py                     # SkillRouter（注册/注销/路由/激活检测/知识库聚合）
    └── tests/test_all.py                 # 完整测试套件（129 tests, 阶段 0~5）
```

### Git 状态
- **分支**：`main`
- **远程**：`origin` → https://github.com/yaorz26/SETraingingCampProject.git
- **最新提交**：`162249b` test: add comprehensive test suite (83 tests, stages 0-3)
- **工作区**：有未提交更改（阶段 4 + 阶段 5 文件）

---

## 三、重要共识

### 3.1 开发流程共识
1. **分阶段递进**：严格按阶段 0→1→2→...→8 顺序执行，不可跳级。
2. **每阶段验证**：每阶段完成后必须运行检查点验证，未通过不进入下一阶段。
3. **增量交付**：每阶段都有可独立运行的验证命令，不依赖未完成阶段。
4. **权威文档**：`helper/Agent开发指南_AI版.md` 是执行的权威指南，已弃用版不要参考。

### 3.2 技术共识
1. **安全优先**：
   - 禁止使用 `eval()`、`os.system()` 硬编码。
   - 密钥只从环境变量（`.env`）读取，不可硬编码。
   - `calculate` 工具必须用 `ast.parse` + 白名单实现。
2. **异步统一**：从 MCPAgent（阶段 4）开始，所有 Agent 方法统一为 `async def`。
3. **资源管理**：MCP 连接用 `contextlib.AsyncExitStack` 管理，`shutdown()` 必须实现。
4. **可观测性**：每个 LLM 调用、工具调用都记日志（阶段 6 Harness）。
5. **中文友好**：RAG 使用字符级 2-gram Jaccard 相似度（非空格分词），适配中文。
6. **MCP SDK**：使用 `mcp.server.fastmcp.FastMCP` 简化实现，不用旧版手动 `__aenter__`。

### 3.3 可信性判断共识
- 每阶段完成后，先回答"**这次输出我能信任吗？为什么？**"再进入下一阶段。
- 最终交付要求：评估通过率 ≥ 80%。

---

## 四、用户给出的重要要求

### 4.1 项目管理要求
1. **Git 管理**：项目必须纳入 Git 版本管理，推送到指定 GitHub 仓库。
2. **.gitignore 规范**：`venv/`、`.env`、`__pycache__/`、`chroma_db/` 等必须排除。
3. **目录结构保留**：空目录使用 `.gitkeep` 保留结构。
4. **提交规范**：使用 `feat:`/`fix:` 等约定式提交前缀。

### 4.2 文档要求
1. **AI 可读文档**：在 `helper/` 中维护供 AI 阅读的状态文件（本文件）。
2. **README 完整**：`my-agent/README.md` 须含架构图、安装步骤、运行命令、评估结果。
3. **开发日志**：每阶段在 README 中记录问题与解决方案。

### 4.3 交付清单（阶段 8 终态）
| 序号 | 交付物 | 要求 |
|------|--------|------|
| 1 | 源代码 | 完整可运行 |
| 2 | README.md | 含架构图与运行方法 |
| 3 | config.yaml + .env.example | 配置完整 |
| 4 | ≥ 1 个 MCP Server | 文件系统 Server 可运行 |
| 5 | ≥ 2 个 Skill | CodeReview + WebDev |
| 6 | 评估报告 | 通过率 ≥ 80% |
| 7 | 演示截图/视频 | Agent 完成实际任务 |
| 8 | 开发日志 | 每阶段问题与解决方案 |

---

## 五、下一步行动

**当前任务**：开始阶段 6 - Harness 工程

**阶段 5 完成情况**：
- ✅ `my-agent/skills/__init__.py` 已创建 — 包初始化
- ✅ `my-agent/skills/base.py` 已创建 — Skill 抽象基类
  - 属性：`name`、`description`、`trigger_keywords`
  - 方法：`should_activate(user_message)` 关键词匹配（不区分大小写）
  - 抽象方法：`get_system_prompt()`、`get_tools()`、`get_knowledge()`
- ✅ `my-agent/skills/code_review_skill.py` 已创建 — CodeReviewSkill
  - 触发关键词：审查、review、代码质量、bug、安全漏洞、code review、代码审查、重构、refactor
  - System prompt：5 维度审查框架（正确性/安全性/性能/可读性/最佳实践）
  - 知识库：OWASP Top 10、SOLID 原则、代码审查清单等 5 条知识
- ✅ `my-agent/skills/web_dev_skill.py` 已创建 — WebDevSkill
  - 触发关键词：网页、前端、后端、API、React、HTML、CSS、网站、接口、Vue、JavaScript、TypeScript
  - System prompt：前端规范（HTML/CSS/JS/React）+ 后端规范（RESTful API）+ 通用规范
  - 知识库：React 最佳实践、RESTful 设计原则、CSS 布局、Web 安全等 5 条知识
- ✅ `my-agent/skills/router.py` 已创建 — SkillRouter
  - `register(skill)` / `unregister(name)` 管理 Skill
  - `route(user_message)` 激活匹配的 Skill 并构建合并 prompt
  - `get_skill(name)` / `list_skills()` 查询接口
  - `get_active_tools(user_message)` / `get_active_knowledge(user_message)` / `get_active_skill_names(user_message)` 获取激活 Skill 的详细信息
  - 支持多 Skill 同时激活，知识库合并去重
  - 删除 `skills/.gitkeep`
- ✅ 测试验证通过：129 个测试全部通过（阶段 0~5）
  - 新增 28 个阶段 5 测试：SkillBase（6）、CodeReviewSkill（3）、WebDevSkill（4）、SkillRouter（15）
  - 覆盖：抽象基类约束、关键词激活（含大小写）、System prompt 内容、知识库、路由注册/注销/激活/多 Skill 合并
  - 运行方式：`cd my-agent && .\venv\Scripts\python.exe -m pytest tests/test_all.py -v`

**阶段 4 完成情况**（已提交）：
- ✅ `my-agent/mcp_servers/file_server.py` — FastMCP 文件系统 Server（3 工具）
- ✅ `my-agent/mcp_client.py` — MCPToolManager（Stdio 连接 + 工具转换）
- ✅ `my-agent/agent.py` — 升级为 MCPAgent（异步统一）
- ✅ 测试验证通过：101 个测试全部通过（阶段 0~4）

**后续阶段任务**：
- 阶段 6：`harness/` — 日志、配置、错误恢复、沙箱
- 阶段 7：`evaluation/` — AgentEvaluator、SecurityAuditor
- 阶段 8：系统集成与交付

---

## 六、环境信息

- **操作系统**：Windows 11
- **Shell**：PowerShell（注意：`&&` 不是有效分隔符，用 `;` 或分步执行）
- **Python**：3.13（venv 已创建于 `my-agent/venv/`）
- **IDE**：Visual Studio Code
- **Git**：已配置，远程仓库已关联