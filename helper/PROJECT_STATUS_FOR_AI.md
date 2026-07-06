# 项目状态与共识（AI 阅读版）

> **文档用途**：供 AI 编码助手（Cline/Claude Code 等）快速了解项目当前进度、重要共识与用户要求，避免重复探索。
> **更新时间**：2026-07-06
> **维护原则**：每次开发进展后更新此文件，保持与实际状态一致。

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

### 总体阶段：阶段 1（最小可行 Agent）✅ 已完成

| 阶段 | 名称 | 状态 | 说明 |
|------|------|------|------|
| 阶段 0 | 项目初始化 | ✅ 完成 | 目录结构、配置文件、虚拟环境、依赖安装、Git 管理 |
| 阶段 1 | 最小可行 Agent（Hello World） | ✅ 完成 | `agent.py` - SimpleAgent 类，对话历史维护，REPL 入口 |
| 阶段 2 | 工具调用（Tool Use） | ⏳ 待开始 | `tools.py` - ToolRegistry，时间/计算/搜索工具 |
| 阶段 3 | 上下文工程 | ⏳ 待开始 | `context_manager.py` - 历史压缩、RAG、Prompt 模板 |
| 阶段 4 | MCP 协议集成 | ⏳ 待开始 | `mcp_servers/file_server.py`、`mcp_client.py`、MCPAgent |
| 阶段 5 | Skill 设计 | ⏳ 待开始 | `skills/` - CodeReview、WebDev、SkillRouter |
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
    ├── agent.py                          # SimpleAgent 类（阶段 1）
    ├── evaluation/.gitkeep               # 评估模块（空）
    ├── harness/.gitkeep                  # 基础设施（空）
    ├── knowledge/.gitkeep                # 知识库（空）
    ├── mcp_servers/.gitkeep              # MCP Server（空）
    ├── skills/.gitkeep                   # Skill 模块（空）
    └── tests/.gitkeep                    # 测试（空）
```

### Git 状态
- **分支**：`main`
- **远程**：`origin` → https://github.com/yaorz26/SETraingingCampProject.git
- **最新提交**：阶段 1 提交后更新
- **工作区**：干净

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

**当前任务**：开始阶段 2 - 工具调用（Tool Use）

**阶段 1 完成情况**：
- ✅ `my-agent/agent.py` 已创建，包含 `SimpleAgent` 类
- ✅ `__init__`：从 `.env` 读取 `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`LLM_MODEL`，初始化 OpenAI 客户端
- ✅ `chat(user_message) -> str`：维护多轮对话历史，调用 LLM，返回回复
- ✅ `reset()`：清空对话历史
- ✅ `main()`：REPL 入口，输入 `exit`/`quit` 退出
- ✅ 语法验证通过（`SimpleAgent` 类 + 4 个方法）
- ✅ 依赖已安装（openai 2.44.0、python-dotenv）
- ⚠️ 实际 API 调用需用户创建 `.env` 并填入真实 Key（`.env` 已被 .gitignore 排除）

**待创建文件（阶段 2）**：
- `my-agent/tools.py`：`ToolRegistry` 类 + 具体工具
  - `get_current_time`：返回当前时间
  - `calculate`：用 `ast.parse` + 白名单安全实现（禁用 `eval`）
  - `search`：简单搜索（可后续接 RAG）

**验证标准（阶段 2）**：
- [ ] Agent 能识别工具调用意图并选择正确工具
- [ ] `calculate` 拒绝危险输入（如 `__import__`、`os.system`）
- [ ] 工具结果正确回传给 LLM 生成最终回复

**关键约束**：
- `calculate` 必须用 `ast.parse` + 白名单，禁止 `eval()`
- 工具注册采用声明式（装饰器或显式注册）

---

## 六、环境信息

- **操作系统**：Windows 11
- **Shell**：PowerShell（注意：`&&` 不是有效分隔符，用 `;` 或分步执行）
- **Python**：3.13（venv 已创建于 `my-agent/venv/`）
- **IDE**：Visual Studio Code
- **Git**：已配置，远程仓库已关联