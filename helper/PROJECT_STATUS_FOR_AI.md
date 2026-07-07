# 项目状态与共识（AI 阅读版）

> **文档用途**：供 AI 编码助手（Cline/Claude Code 等）在新对话上下文中快速理解项目全貌，避免重复探索。
> **更新时间**：2026-07-07
> **当前阶段**：**过渡期** — 旧版分阶段开发已完成阶段 0~6，现需按期末通用要求重构流程

---

## 一、项目概览

- **项目名称**：My Agent — 一个类似 Claude Code / Codex 的简易但完整的 AI Agent 系统
- **课程**：AI4SE（智能化软件工程训练营）期末项目
- **项目类型**：A · Coding Agent Harness（首选）
- **仓库地址**：https://github.com/yaorz26/SETraingingCampProject.git
- **本地路径**：`d:\yaorz\学习\大二下\智能化软件工程训练营\project`
- **技术栈**：Python 3.13、OpenAI SDK、MCP SDK、ChromaDB、pytest、PyYAML
- **核心公式**：`Agent = LLM + 工具 + 记忆 + 规划`，强调"可信性判断"

---

## 二、重要：两份文档的定位与关系

本项目存在**两份开发指南**，一份是旧版（已完成），一份是期末通用要求（待执行）：

| 文档 | 路径 | 定位 | 状态 |
|------|------|------|------|
| 旧版分阶段指南 | `helper/Agent开发指南_AI版.md` | 阶段 0→8 手动编码指令 | **阶段 0~6 已完成，阶段 7~8 未完成** |
| 期末通用要求 | `docs/general_require.md` | 强制使用 Superpowers 框架的期末项目要求 | **待执行** |
| 项目类型 A 文件 | `docs/AI4SE_Final_Project_A_Coding_Agent_Harness.md` | A 类项目额外要求（领域设计、mock-LLM 测试、机制演示） | **尚未提供** |

**关键事实**：`docs/general_require.md` 是**期末评分依据**，它要求使用 Superpowers 框架（brainstorming → SPEC → PLAN → subagent + TDD + PR 工作流），与旧版指南的"手动分阶段编码"流程完全不同。旧版指南产出的代码是**可复用资产**，但后续工作必须按新通用要求执行。

---

## 三、旧版指南的执行进度（阶段 0~6 已完成）

### 进度总览

| 阶段 | 名称 | 状态 | 产出 |
|------|------|------|------|
| 阶段 0 | 项目初始化 | ✅ 完成 | 目录结构、虚拟环境、配置、Git 管理 |
| 阶段 1 | 最小可行 Agent | ✅ 完成 | `agent.py` — SimpleAgent 类 |
| 阶段 2 | 工具调用 | ✅ 完成 | `tools.py` — ToolRegistry + 3 工具；ToolAgent 升级 |
| 阶段 3 | 上下文工程 | ✅ 完成 | `context_manager.py` — ContextManager、SimpleRAG、Prompt 模板 |
| 阶段 4 | MCP 协议集成 | ✅ 完成 | `mcp_servers/file_server.py`、`mcp_client.py`、MCPAgent |
| 阶段 5 | Skill 设计 | ✅ 完成 | `skills/` — Skill 基类、CodeReviewSkill、WebDevSkill、SkillRouter |
| 阶段 6 | Harness 工程 | ✅ 完成 | `harness/` — AgentConfig、AgentLogger、ErrorRecovery、Sandbox |
| 阶段 7 | 可信性判断与评估 | ⏳ 未开始 | `evaluation/` — AgentEvaluator、SecurityAuditor |
| 阶段 8 | 系统集成与交付 | ⏳ 未开始 | `main.py` 集成、README 完善 |

### 完整文件清单

```
project/
├── docs/
│   └── general_require.md                        # 期末通用要求（评分依据）
├── helper/                                        # 辅助文档
│   ├── Agent开发指南_AI版.md                       # 旧版分阶段执行指令（阶段 0~8）
│   ├── Agent开发指南_已弃用.md                     # 旧版（已弃用，勿参考）
│   ├── helper_pdf/                                 # 训练营 PDF 与 OCR 输出
│   └── PROJECT_STATUS_FOR_AI.md                    # 本文件 — AI 上下文文档
└── my-agent/                                      # 主项目代码
    ├── .env.example                                # 环境变量模板
    ├── .gitignore                                  # Git 忽略规则（venv/, .env, __pycache__/, chroma_db/）
    ├── config.yaml                                 # 项目配置（LLM 模型、MCP Server、路径、命令阻止列表）
    ├── requirements.txt                            # Python 依赖（openai, mcp, chromadb, pyyaml, pytest 等）
    ├── README.md                                   # 项目说明（需按新要求重写）
    ├── agent.py                                    # ToolAgent + MCPAgent 类（async，含 last_tool_calls）
    ├── tools.py                                    # ToolRegistry + 3 工具（get_current_time, calculate, search_web）
    ├── context_manager.py                          # ContextManager + SimpleRAG（字符级 2-gram Jaccard）+ Prompt 模板
    ├── mcp_client.py                               # MCPToolManager（Stdio 连接 + 工具转换 + AsyncExitStack）
    ├── evaluation/.gitkeep                         # 评估模块（空，阶段 7 待实现）
    ├── harness/                                    # 基础设施（阶段 6 完成）
    │   ├── __init__.py                             # 包初始化
    │   ├── config.py                               # AgentConfig（YAML 加载）+ McpServerConfig
    │   ├── logger.py                               # AgentLogger（文件 + 内存 trace，链路追踪）
    │   ├── recovery.py                             # ErrorRecovery（错误分类 + 指数退避重试）
    │   └── sandbox.py                              # Sandbox（路径安全 + 命令阻止）
    ├── knowledge/.gitkeep                          # 知识库（空）
    ├── mcp_servers/                                # MCP Server 模块
    │   ├── __init__.py                             # 包初始化
    │   └── file_server.py                          # FastMCP 文件系统 Server（read_file/list_directory/write_file）
    ├── skills/                                     # Skill 模块（阶段 5 完成）
    │   ├── __init__.py                             # 包初始化
    │   ├── base.py                                 # Skill 抽象基类（name, description, trigger_keywords, should_activate）
    │   ├── code_review_skill.py                    # CodeReviewSkill（5 维度审查框架）
    │   ├── web_dev_skill.py                        # WebDevSkill（前端 + 后端 + RESTful 规范）
    │   └── router.py                               # SkillRouter（注册/注销/路由/多 Skill 合并）
    └── tests/test_all.py                           # 完整测试套件（177 tests, 阶段 0~6，全部通过）

# 注意：以下文件尚未创建（旧版阶段 7~8）
#   main.py, evaluation/tester.py, evaluation/security.py
```

### Git 状态

- **分支**：`main`
- **远程**：`origin` → https://github.com/yaorz26/SETraingingCampProject.git
- **最新提交**：`ed71802` docs: 更新PROJECT_STATUS_FOR_AI.md，修正过时的阶段状态和Git信息
- **工作区**：干净（已全部提交）
- **提交历史**（10 个提交，按时间倒序）：
  ```
  ed71802 docs: 更新PROJECT_STATUS_FOR_AI.md
  8d11bd8 feat: stage 6 - Harness工程 (AgentConfig, AgentLogger, ErrorRecovery, Sandbox)
  2de90dc Add harness __init__.py
  c00f4ff feat: stage 5 - Skill design framework (CodeReview + WebDev + SkillRouter)
  e83de78 feat: stage 4 - MCP protocol integration (MCPAgent, file_server, MCPToolManager)
  8280a4b docs: update PROJECT_STATUS_FOR_AI.md with test suite info
  162249b test: add comprehensive test suite (83 tests, stages 0-3)
  5316ce9 docs: update PROJECT_STATUS_FOR_AI.md - stage 3 completed
  6322a43 feat: stage 3 - ContextManager, SimpleRAG, Prompt template
  f6c2db8 docs: update PROJECT_STATUS_FOR_AI.md - stage 2 completed
  ```

### 测试状态

- **测试数量**：177 个（阶段 0~6）
- **通过率**：100%（177/177 passed）
- **运行方式**：`cd my-agent && ..\venv\Scripts\python.exe -m pytest tests/test_all.py -v`
- **测试覆盖**：
  - 阶段 1：SimpleAgent 基础（对话、历史维护）
  - 阶段 2：ToolRegistry、calculate（安全计算，无 eval）、get_current_time、search_web
  - 阶段 3：SimpleRAG（中文 2-gram）、ContextManager、System Prompt 模板
  - 阶段 4：MCPToolManager、MCPAgent、file_server 工具
  - 阶段 5：Skill 基类、CodeReviewSkill、WebDevSkill、SkillRouter
  - 阶段 6：AgentConfig（5）、AgentLogger（12）、ErrorRecovery（15）、Sandbox（16）

---

## 四、期末通用要求（docs/general_require.md）摘要

### 4.1 核心要求

| 要求 | 说明 | 当前状态 |
|------|------|----------|
| **Superpowers 框架** | 必须使用 Superpowers 七步工作流 | ❌ 未安装/未使用 |
| **SPEC.md** | 设计文档（10 个必含章节） | ❌ 未创建 |
| **PLAN.md** | 细粒度 task 列表 | ❌ 未创建 |
| **SPEC_PROCESS.md** | brainstorming 过程记录（≥3 轮迭代） | ❌ 未创建 |
| **TDD 强制** | 先红后绿再重构 | ❌ 当前测试是后补的 |
| **subagent 驱动开发** | 每个 task 派 subagent + git worktree | ❌ 未使用 |
| **PR 工作流** | 每个 worktree 对应一个 PR | ❌ 当前直接 push main |
| **GitHub Actions CI** | 必须配置 unit-test job | ❌ 未配置 |
| **凭据安全存储** | keyring / 加密，首次引导录入 | ❌ 当前仅 .env |
| **分发** | 容器/二进制/包 三选一 | ❌ 未实现 |
| **AGENT_LOG.md** | 按时间戳记录关键节点 | ❌ 未创建 |
| **REFLECTION.md** | 1500-2500 字反思报告 | ❌ 未创建 |
| **线上部署 URL** | 可访问的 WebUI 接口 | ❌ 未部署 |

### 4.2 Superpowers 七步工作流

```
brainstorming → writing-plans → using-git-worktrees
    → subagent-driven-development / executing-plans
    → test-driven-development → requesting-code-review
    → finishing-a-development-branch
```

### 4.3 最终交付物清单（来自通用要求 §五）

1. `SPEC.md`、`PLAN.md`、`SPEC_PROCESS.md`
2. 完整源代码（带规范的 commit / PR 历史，无任何真实凭据）
3. 分发产物与说明（Dockerfile 或二进制构建脚本）
4. `README.md`（含架构图、安装、运行、分发、安全边界）
5. `AGENT_LOG.md`
6. CI 配置（`.github/workflows/`，含 unit-test job）
7. CI/CD 执行记录（最后一次必须 pass）
8. `REFLECTION.md`（1500-2500 字反思）
9. 线上部署 URL（WebUI 可访问）

---

## 五、旧版代码资产的可复用性分析

| 模块 | 在新流程中的角色 | 需要调整的部分 |
|------|-----------------|---------------|
| `agent.py` | Harness 内核，subagent 可调用的核心 Agent | 需补充 mock-LLM 支持（A 类项目要求） |
| `tools.py` | 工具系统 | 可基本保留，需补充 TDD 测试 |
| `context_manager.py` | Prompt 工程基础设施 | 可基本保留 |
| `mcp_client.py` + `mcp_servers/` | MCP 协议集成 | 可基本保留 |
| `skills/` | Skill 框架 | 可基本保留 |
| `harness/config.py` | 配置管理 | 可基本保留，需扩展凭据安全相关配置 |
| `harness/logger.py` | 日志系统 | 可基本保留 |
| `harness/recovery.py` | 错误恢复 | 可基本保留 |
| `harness/sandbox.py` | 安全沙箱 | 可基本保留 |
| `tests/test_all.py` | 现有测试 | 需按模块拆分，补充 TDD 风格测试 |
| `evaluation/` | 待实现 | 需按旧版阶段 7 实现 + 新要求扩展 |

---

## 六、重要共识

### 6.1 技术共识（从旧版指南继承）

1. **安全优先**：禁止 `eval()`、`os.system()` 硬编码；密钥只从环境变量读取。
2. **异步统一**：所有 Agent 方法统一为 `async def`。
3. **资源管理**：MCP 连接用 `contextlib.AsyncExitStack` 管理。
4. **中文友好**：RAG 使用字符级 2-gram Jaccard 相似度。
5. **MCP SDK**：使用 `mcp.server.fastmcp.FastMCP` 简化实现。

### 6.2 新流程共识

1. **Superpowers 是强制工具链**，不可跳过。
2. **TDD 是硬性要求**：先红、再绿、再重构。
3. **PR 工作流**：每个 worktree 对应一个 PR，不可直接 push main。
4. **凭据绝不提交**：`.env` 已在 `.gitignore`，但还需实现 keyring 安全存储。
5. **SPEC 质量决定实现质量**：必须通过冷启动验证（换一个 agent 测试 spec 清晰度）。

---

## 七、环境信息

- **操作系统**：Windows 11
- **Shell**：PowerShell（注意：`&&` 不是有效分隔符，用 `;` 或分步执行）
- **Python**：3.13（venv 已创建于 `my-agent/venv/`）
- **IDE**：Visual Studio Code
- **Git**：已配置，远程仓库已关联
- **编码智能体**：Cline（当前使用中）

---

## 八、给下一个 AI 会话的指令

### 你需要做的事情（按顺序）：

#### 第一步：获取完整要求
1. 阅读 `docs/general_require.md`（已读取）
2. 等待用户提供 `docs/AI4SE_Final_Project_A_Coding_Agent_Harness.md`（A 类项目额外要求，如领域设计、mock-LLM 单元测试、机制演示）
3. 将两份文档拼接为完整要求

#### 第二步：安装 Superpowers
4. 在当前编码智能体（Cline）中安装 Superpowers 插件
5. 确认 Superpowers 的 brainstorming、writing-plans、TDD、subagent 等技能可用

#### 第三步：启动 brainstorming → 产出 SPEC.md
6. 触发 brainstorming 技能，与用户共同设计项目
7. 产出 `SPEC.md`，必须包含：
   - 问题陈述、用户故事（≥5 个，INVEST 原则）
   - 功能规约（按模块，输入/行为/输出/边界/错误处理）
   - 非功能性需求（性能、安全含凭据威胁模型、可用性、可观测性）
   - 系统架构（组件图、数据流、外部依赖）
   - 数据模型
   - 凭据与分发设计
   - 技术选型与理由
   - 验收标准
   - 风险与未决问题
   - **A 类额外：领域与机制设计**（见 A 类文件）

#### 第四步：writing-plans → 产出 PLAN.md
8. 将 SPEC 分解为细粒度 task 列表
9. 每个 task：2-5 分钟、明确文件路径、明确验证步骤
10. 标出依赖与可并行部分

#### 第五步：记录过程 → SPEC_PROCESS.md
11. 记录 brainstorming 关键节点（≥3 轮迭代）
12. 记录 AI 追问的好问题、你采纳/推翻的建议

#### 第六步：冷启动验证
13. 换一个不同的智能体，仅凭 SPEC + PLAN 尝试实现 1-2 个 task
14. 记录暴露的问题，修订 SPEC/PLAN

#### 第七步：实现（subagent + TDD + worktree）
15. 按 PLAN 创建 git worktrees
16. 每个 task 派 subagent，TDD 执行
17. 两阶段评审（spec 合规 → 代码质量）
18. 更新 PLAN.md + AGENT_LOG.md

#### 第八步：基础设施
19. 配置 GitHub Actions CI（unit-test job）
20. 实现凭据安全存储（keyring）
21. 选定分发方案 + Dockerfile
22. 实现 WebUI（如 A 类要求）

#### 第九步：交付
23. 编写/重写 README.md
24. 编写 AGENT_LOG.md
25. 编写 REFLECTION.md（1500-2500 字）
26. 部署线上 URL
27. 最终 CI 全绿验证

### 旧版代码的处理策略

- **保留所有现有代码**作为参考实现和可复用资产
- 在 SPEC 中重新设计架构时，**优先复用现有模块**
- 但必须按 TDD 方式重新走一遍实现（不可直接"补测试"）
- 旧版阶段 7（evaluation）和阶段 8（main.py 集成）的设计思路可作为 SPEC 参考

### 关键提醒

- 本项目是**个人项目**，不允许组队
- 工程深度优先于代码量
- 至少 3 个以上职责清晰的功能模块
- 最终评估通过率 ≥ 80%
- 仓库内**不得出现任何真实凭据**