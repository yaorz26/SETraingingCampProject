# CodeHarness — PLAN.md

> **角色**：本文档供 AI 编码智能体阅读并分步执行。每个 task 目标明确、涉及文件清晰、验证步骤可执行。  
> **阅读前提**：AI 必须先阅读 `docs/SPEC/SPEC.md` 理解完整设计后再开始执行。  
> **约定**：每个 task 先写失败的测试（红），再写最小实现使其变绿（绿），最后重构。标记 [P] 表示可并行执行。

---

## 阶段 0：项目脚手架

### T0.1 — 初始化项目骨架

- **目标**：创建 TypeScript + Jest 项目，配置编译与测试
- **涉及文件**：`package.json`, `tsconfig.json`, `jest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.c8rc.json`, `.gitignore`, `.gitlab-ci.yml`
- **实现要点**：
  1. `npm init` 初始化 Node.js 项目（包管理器使用 pnpm）
  2. 安装 TypeScript、Jest、ts-jest、@types/jest、eslint、prettier、c8
  3. 配置 `tsconfig.json`（target ES2022, module NodeNext, moduleResolution NodeNext, strict true）
  4. 配置 `jest.config.ts`（ts-jest, testMatch 指向 `tests/`）
  5. 配置 `.eslintrc.cjs`（@typescript-eslint 严格规则集）
  6. 配置 `.prettierrc`（singleQuote: true, trailingComma: 'all'）
  7. 配置 `.c8rc.json`（include: src/**/*.ts, exclude: index.ts/setup-wizard.ts/*.d.ts/pricing.ts, lines: 80%, functions: 80%, branches: 75%, statements: 80%）
  8. 创建 `.gitignore`（node_modules, dist, .codeharness, .env, *.key, *secret*）
  9. 创建 `.gitlab-ci.yml`（unit-test job: `npm ci && npm test -- --coverage`，三平台矩阵 ubuntu/macos/windows）
  10. 创建 `src/index.ts` 空入口文件
  11. 创建 `tests/unit/`、`tests/integration/`、`tests/e2e/` 目录结构
  12. 配置 `husky` + `lint-staged` 实现 pre-commit 钩子（自动 prettier + eslint 检查）
- **验证**：`npm test` 跑通（即使 0 个测试），`npx tsc --noEmit` 通过
- **依赖**：无

---

## 阶段 1：基础设施层

### T1.1 — 工作区根目录检测 [P]

- **目标**：实现 `WorkspaceDetector.detect()` 四级检测策略
- **涉及文件**：`src/utils/workspace.ts`, `tests/unit/utils/workspace.test.ts`
- **实现要点**：
  1. 四级检测: 显式参数 → 环境变量 `CODEHARNESS_WORKSPACE` → 向上查找项目标记 → `process.cwd()`
  2. 项目标记: `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `setup.py`, `requirements.txt`
  3. 返回绝对路径，检测目录是否存在
- **验证（先写测试）**：
  - 显式参数优先
  - 环境变量次之
  - 在包含 `package.json` 的目录下运行，检测到项目标记
  - 无任何标记时回退到 `cwd`
  - 指定路径不存在时抛出错误
  - Python 项目（含 `pyproject.toml`）正确检测

### T1.2 — Shell 命令执行器 [P]

- **目标**：实现 `ShellExecutor` 封装子进程执行
- **涉及文件**：`src/utils/shell.ts`, `tests/unit/utils/shell.test.ts`
- **实现要点**：
  1. 使用 `child_process.exec` 或 `spawn`
  2. 支持 `timeout` 参数（默认 60s）
  3. `cwd` 设置为工作区根目录
  4. 不分配 TTY（禁止交互式命令）
  5. 收集 stdout + stderr
  6. 超时后 kill 子进程
  7. 返回 `{ exitCode, stdout, stderr, duration_ms }`
  8. 支持实时流式透传 stdout/stderr 到终端（可选参数）
- **验证（先写测试）**：
  - `echo hello` 返回 stdout 含 "hello"，exitCode 0
  - `exit 1` 返回 exitCode 1
  - 超时命令（如 `sleep 10`）被 kill，返回超时错误
  - 命令不存在时返回错误

### T1.3 — 文件操作工具（含原子性）[P]

- **目标**：实现安全文件读写，含原子写入和备份
- **涉及文件**：`src/tools/file-ops.ts`, `tests/unit/tools/file-ops.test.ts`
- **实现要点**：
  1. `atomicWrite(filePath, content)`: 写入临时文件 → rename
  2. `backupFile(filePath)`: 备份到 `.codeharness/backups/<timestamp>/`
  3. `rollback(filePath)`: 从备份恢复
  4. `cleanupOldBackups(keepCount)`: 保留最近 N 次备份
  5. 临时文件名格式: `<filename>.codeharness-tmp-<uuid>`
  6. 大文件拒绝全量读取（> 1MB），返回错误提示分段读取
- **验证（先写测试）**：
  - 写入中途失败（模拟磁盘满），原始文件不变
  - 备份文件内容与原始一致
  - 回滚后文件恢复为备份版本
  - 旧备份被正确清理
  - 超大文件读取被拒绝

### T1.4 — 凭据存储 [P]

- **目标**：实现 OS 钥匙串凭据管理
- **涉及文件**：`src/utils/credential.ts`, `tests/unit/utils/credential.test.ts`
- **实现要点**：
  1. 使用 `keytar` 库（跨平台 OS 钥匙串）
  2. Key 格式: `codeharness/<provider>`
  3. `setCredential(provider, key)`: 存入钥匙串
  4. `getCredential(provider)`: 从钥匙串读取
  5. `deleteCredential(provider)`: 从钥匙串删除
  6. `hasCredential(provider)`: 检查是否已配置
  7. 读取后不在日志中回显明文
  8. 使用后立即内存覆盖（零填充）
  9. 测试时使用 mock（不依赖真实钥匙串）
- **验证（先写测试）**：
  - 存储后能读取到相同值
  - 删除后读取返回 null
  - `hasCredential` 正确反映状态
  - 凭据值不泄露到日志

### T1.5 — 日志系统（Pino 结构化日志）[P]

- **目标**：实现三层日志体系（审计 / 运行 / 调试），使用 pino 输出 JSONL
- **涉及文件**：`src/logging/audit-logger.ts`, `src/logging/runtime-logger.ts`, `tests/unit/logging/audit-logger.test.ts`
- **实现要点**：
  1. 使用 `pino` 库，输出 JSONL 格式
  2. **审计日志**：所有动作 + 护栏结果 + 审批结果 + LLM 调用摘要，存储到 `~/.codeharness/logs/audit/{date}.jsonl`，始终记录不可关闭
  3. **运行日志**：任务开始/结束、每轮摘要、错误恢复、降级事件，存储到 `~/.codeharness/logs/runtime/{date}.log`，默认 INFO 级别
  4. **调试日志**：完整 LLM 请求/响应、上下文构建细节、token 估算过程，存储到 `~/.codeharness/logs/debug/{date}.log`，DEBUG 级别（`--log-level debug` 开启）
  5. 日志轮转：单文件最大 10 MB，保留最近 7 天，每种类型最多 10 个轮转文件
  6. 凭据过滤：输出前过滤 `sk-`、`ant-` 等前缀模式
  7. 日志级别控制：`--log-level debug|silent`、`--quiet`
- **验证（先写测试）**：
  - 审计日志正确记录所有动作
  - 凭据模式被过滤
  - 日志格式为合法 JSONL
  - 日志级别控制生效

---

## 阶段 2：LLM 抽象层

### T2.1 — LLMProvider 接口定义 [P]

- **目标**：定义统一的 LLM 抽象接口
- **涉及文件**：`src/llm/provider.ts`, `tests/unit/llm/provider.test.ts`
- **实现要点**：
  1. 定义 `LLMProvider` 接口（见 SPEC §6.2）：`name`, `supportsToolUse`, `contextWindow`, `chat()`, `countTokens()`
  2. 定义 `ChatOptions`、`ChatResponse`、`Message`、`ToolCall` 类型
  3. 定义 `ToolDefinition` 类型（Tool Use 工具描述）
  4. 所有实现必须 `supportsToolUse = true`
- **验证（先写测试）**：
  - 接口类型编译通过
  - Mock 实现满足接口契约

### T2.2 — MockLLMProvider 实现

- **目标**：实现可控的 Mock LLM，用于所有确定性测试
- **涉及文件**：`src/llm/mock-provider.ts`, `tests/unit/llm/mock-provider.test.ts`
- **实现要点**：
  1. 接受预设的响应序列 `MockResponse[]`
  2. 每次 `chat()` 调用按序列返回下一个响应
  3. 支持输入匹配：根据 `messages` 内容匹配特定响应
  4. 序列耗尽时抛出错误（防止测试无限循环）
  5. 实现 `countTokens`（简单近似）
  6. 记录所有请求历史供测试断言
- **验证（先写测试）**：
  - 按序列返回响应
  - 输入匹配正确
  - 序列耗尽抛出错误
  - 请求历史正确记录

### T2.3 — OpenAI Provider 适配器

- **目标**：实现 OpenAI API 适配器
- **涉及文件**：`src/llm/adapters/openai.ts`, `tests/unit/llm/adapters/openai.test.ts`
- **实现要点**：
  1. 使用 `openai` npm 包
  2. API Key 从凭据存储读取（不硬编码）
  3. 实现 `chat()` 方法，调用 Chat Completions API
  4. 强制使用 Tool Use（`tool_choice: "required"` 或 `"auto"`）
  5. 解析 Tool Call 响应为统一格式
  6. 实现 `countTokens`（使用 `tiktoken`）
  7. 错误处理：401（凭据错误，不可重试）、429（限流，可重试）、5xx（服务端错误，可重试）
  8. 实现速率限制重试：最多 3 次，指数退避 + 抖动（1s+jitter → 2s+jitter → 4s+jitter），优先读取 `Retry-After` 响应头
- **验证（先写测试）**：
  - 使用 mock HTTP 服务器测试正常响应
  - 401 错误正确抛出
  - 429 错误触发重试
  - Token 计数正确

### T2.4 — Anthropic Provider 适配器 [P]

- **目标**：实现 Anthropic API 适配器
- **涉及文件**：`src/llm/adapters/anthropic.ts`, `tests/unit/llm/adapters/anthropic.test.ts`
- **实现要点**：
  1. 使用 `@anthropic-ai/sdk` npm 包
  2. 实现 `chat()` 方法，调用 Messages API
  3. 强制使用 Tool Use
  4. 解析 Tool Use 响应
  5. 实现 `countTokens`（使用 Anthropic 的 token 计数）
  6. 实现速率限制重试（同 T2.3）
- **验证（先写测试）**：
  - 使用 mock HTTP 服务器测试正常响应
  - 401 错误正确抛出

### T2.5 — Ollama Provider 适配器 [P]

- **目标**：实现 Ollama 本地模型适配器
- **涉及文件**：`src/llm/adapters/ollama.ts`, `tests/unit/llm/adapters/ollama.test.ts`
- **实现要点**：
  1. 使用 OpenAI 兼容 API（`/v1/chat/completions`）
  2. 默认 base URL: `http://localhost:11434/v1`
  3. 检测模型是否支持 Tool Use
  4. 不支持时抛出明确错误
- **验证（先写测试）**：
  - 使用 mock HTTP 服务器测试正常响应
  - 不支持 Tool Use 时正确报错

### T2.6 — LLM 降级链（LLMProviderChain）

- **目标**：实现多供应商降级链
- **涉及文件**：`src/llm/provider-chain.ts`, `tests/unit/llm/provider-chain.test.ts`
- **实现要点**：
  1. 实现 `LLMProviderChain` 类（见 SPEC §6.2）
  2. 按配置的 fallbacks 顺序尝试
  3. 降级触发条件：网络错误、5xx、超时；4xx 不降级
  4. 降级后打印提示 + 说明切换原因
  5. 降级后自动重新计算上下文预算（不同模型窗口不同）
  6. 同任务中不回升（一旦降级保持降级模型）
  7. 全部不可用 → 进入暂停状态，保存进度
- **验证（先写测试）**：
  - 主模型正常 → 使用主模型
  - 主模型 5xx → 降级到备用模型
  - 主模型 401 → 不降级，直接抛出
  - 降级后保持降级模型（不回升）
  - 全部不可用 → 抛出错误

---

## 阶段 3：核心 Harness

### T3.1 — 动作类型定义与 Schema 验证

- **目标**：定义 12 种动作类型，实现 Schema 验证
- **涉及文件**：`src/core/action-parser.ts`, `tests/unit/core/action-parser.test.ts`
- **实现要点**：
  1. 定义 `Action` 联合类型（12 种，见 SPEC §3.5.1）：read_file, write_file, delete_file, list_dir, search_file, grep, run_command, run_tests, run_lint, run_type_check, ask_user, finish
  2. 定义 `ActionResult` 类型
  3. 定义 `DriftCheckResult` 类型（SPEC §6.1）
  4. 定义 `FinishResult` 类型（SPEC §6.1）
  5. 定义 `StopDecision` 类型（SPEC §6.1）
  6. 实现 `parseAction(raw: string): Action`：解析 LLM 输出的 JSON/Tool Call
  7. 实现 `validateAction(action: unknown): Action`：zod Schema 验证
  8. 解析失败返回详细错误（哪个字段缺少/类型错误）
- **验证（先写测试）**：
  - 12 种动作类型各至少一个正确解析用例
  - 缺少 `type` 字段 → 解析失败
  - `write_file` 缺少 `content` → 解析失败
  - 路径包含 `../` → 验证失败
  - 未知动作类型 → 解析失败

### T3.2 — 动作分发器

- **目标**：实现所有动作的执行逻辑
- **涉及文件**：`src/core/action-dispatcher.ts`, `tests/unit/core/action-dispatcher.test.ts`
- **实现要点**：
  1. 实现 `dispatch(action, workspaceRoot): Promise<ActionResult>`
  2. `read_file`: 读取文件，支持 start_line/end_line，大文件（>1MB）拒绝
  3. `write_file`: 原子写入 + 备份
  4. `delete_file`: 删除文件（需通过护栏检查）
  5. `list_dir`: 列出目录，最多 500 条目，超出截断+提示
  6. `search_file`: 按 glob 搜索，最多 200 匹配，超出截断+提示
  7. `grep`: 文本搜索，最多 500 行结果，超出截断+提示
  8. `run_command`: 通过 ShellExecutor 执行
  9. `run_tests`: 执行测试命令
  10. `run_lint`: 执行 lint 命令
  11. `run_type_check`: 执行类型检查命令
  12. `ask_user`: 向用户提问（非交互模式下跳过）
  13. `finish`: 返回完成信号
  14. 路径验证：所有文件操作路径必须相对路径或绝对路径在工作区内
  15. 自动创建父目录
  16. 默认排除目录：node_modules, .git, dist, build, .next, __pycache__, .venv, venv, vendor, .cache, coverage, .nyc_output
  17. Dry-run 模式：写操作仅记录到计划，不实际执行
- **验证（先写测试）**：
  - 每种动作类型至少一个正确执行用例
  - `read_file` 不存在的文件 → 返回错误
  - `write_file` 创建新文件 → 文件存在且内容正确
  - `run_command` 超时 → 返回超时错误
  - 路径越界 → 在 action-dispatcher 层拒绝（护栏层之前）
  - 超大文件读取被拒绝
  - list_dir 超 500 条目截断

### T3.3 — 停机检测器

- **目标**：实现所有停机条件判断逻辑
- **涉及文件**：`src/core/stop-detector.ts`, `tests/unit/core/stop-detector.test.ts`
- **实现要点**：
  1. 实现 `shouldStop(context: StopContext): StopDecision`
  2. 条件 1: LLM 返回 `finish` 动作
  3. 条件 2: 达到 `max_rounds` 上限
  4. 条件 3: 连续 3 轮产生相同文件修改（diff 无变化）
  5. 条件 4: 全局超时（`Date.now() - startTime > globalTimeout`）
  6. 条件 5: 护栏硬拦截且无替代方案
  7. 条件 6: 用户中断（外部信号，通过 AbortSignal）
  8. 条件 7: 成本预算上限（`--max-cost`）
- **验证（先写测试）**：
  - `finish` 动作 → 停机，reason = 'finish_action'
  - 达到 `max_rounds` → 停机，reason = 'max_rounds'
  - 连续 3 轮相同 diff → 停机，reason = 'stall_detected'
  - 超时 → 停机，reason = 'global_timeout'
  - 正常情况 → 不停机

### T3.4 — 目标漂移检测器（DriftDetector）

- **目标**：实现三层目标漂移防护中的代码级偏离检测
- **涉及文件**：`src/core/drift-detector.ts`, `tests/unit/core/drift-detector.test.ts`
- **实现要点**：
  1. 实现 `DriftDetector` 类（见 SPEC §3.7）
  2. 规则 1：修改文件数量突然暴增（> 初始数量 × 3）
  3. 规则 2：动作涉及与任务无关的目录（关键词匹配）
  4. 规则 3：修改配置文件但任务不涉及配置
  5. 返回 `DriftCheckResult`（drifting, risk: none/low/medium/high, reason）
  6. 低风险 → 下一轮上下文追加提醒
  7. 高风险 → 暂停执行，使用 ask_user 询问
- **验证（先写测试）**：
  - 正常操作 → 无偏离
  - 修改文件数暴增 → high 风险
  - 修改无关文件 → low 风险
  - 修改配置文件 → medium 风险

### T3.5 — Finish 拦截器

- **目标**：实现 finish 动作的客观验证拦截
- **涉及文件**：`src/core/finish-interceptor.ts`, `tests/unit/core/finish-interceptor.test.ts`
- **实现要点**：
  1. 实现 `interceptFinish(action, state): FinishResult`（见 SPEC §3.1.3）
  2. 检查 1：Agent 声称成功但测试未通过 → 拦截，回灌矛盾信息
  3. 检查 2：Agent 声称成功但 Diff 有意外修改 → 拦截
  4. 检查 3：偏离检测结果异常 → 拦截
  5. 通过检查 → 允许 finish
- **验证（先写测试）**：
  - 测试全部通过 → 允许 finish
  - 测试未通过 → 拦截，reason 含失败数量
  - 意外文件修改 → 拦截，reason 含文件列表

### T3.6 — Agent 主循环

- **目标**：串联所有模块，实现完整的 Agent 主循环
- **涉及文件**：`src/core/agent-loop.ts`, `tests/unit/core/agent-loop.test.ts`
- **实现要点**：
  1. 实现 `runAgent(task, config, llmProviderChain, contextManager, driftDetector, actionParser, guardrailPipeline, actionDispatcher, finishInterceptor, feedbackCollector, stopDetector): Promise<TaskResult>`
  2. 所有核心依赖通过构造函数注入（DI 模式），便于单元测试时 mock
  3. 主循环流程（见 SPEC §3.1.1 和 §5.2 数据流）：
     - 构建上下文（含原始任务注入）→ 调用 LLM（通过降级链）→ 解析动作（含重试 2 次）→ 偏离检测 → 护栏检查 → 执行/拒绝 → 反馈收集 → finish 拦截 → 停机判断 → 回灌/输出
  3. 动作解析重试：解析失败时回灌错误，最多重试 2 次
  4. 护栏拒绝后：将拒绝信息回灌给 LLM
  5. 反馈回灌：一次性汇总所有反馈信号
  6. 每轮上下文注入原始任务描述（防漂移第一层）
  7. 记录所有轮次数据
  8. 返回 `TaskResult`（含 exitCode）
  9. 使用 mock LLM 进行所有测试
  10. 支持 dry-run 模式（写操作仅记录不执行）
  11. 支持 `--non-interactive` 模式（审批自动处理）
- **验证（先写测试）**：
  - Mock LLM 返回 `finish` → 主循环正常结束
  - Mock LLM 返回 `write_file` + `run_tests` + `finish` → 完整三轮执行
  - 动作解析失败 2 次后 → 主循环中止
  - 护栏拒绝后 → 下一轮 LLM 收到拒绝反馈
  - 反馈收集失败后 → 失败信息回灌给 LLM
  - finish 被拦截 → 矛盾信息回灌，Agent 继续修正
  - 偏离检测触发 → 高风险暂停

---

## 阶段 4：治理护栏（重点维度）

### T4.1 — 危险模式注册表

- **目标**：实现 L1 模式匹配，8 类危险模式的检测
- **涉及文件**：`src/guardrails/pattern-registry.ts`, `tests/unit/guardrails/pattern-registry.test.ts`
- **实现要点**：
  1. 定义 `DangerCategory` 枚举（8 类，见 SPEC §3.2.2）：
     - FILE_DESTRUCTION（dangerous）
     - FILE_DESTRUCTION_WORKSPACE（caution）
     - GIT_DESTRUCTIVE（dangerous）
     - GIT_REWRITE_HISTORY（caution）
     - PUBLISH（dangerous）
     - ARBITRARY_CODE（fatal）
     - DATABASE_DESTRUCTIVE（fatal）
     - PRIVILEGE_ESCALATION（fatal）
  2. 实现 8 类危险模式的正则表达式
  3. 实现 `detectDangerousPatterns(command: string): MatchResult[]`
  4. 支持双平台语法（Unix + Windows）
  5. 支持用户自定义额外模式（从配置加载）
  6. 返回命中的模式列表和对应的危险类别
- **验证（先写测试）**：
  - `rm -rf /` → 命中 FILE_DESTRUCTION
  - `git push --force` → 命中 GIT_DESTRUCTIVE
  - `npm publish` → 命中 PUBLISH
  - `npm test` → 无命中
  - `del /f /s` → 命中 FILE_DESTRUCTION（Windows）
  - `curl \| bash` → 命中 ARBITRARY_CODE
  - `sudo rm` → 命中 PRIVILEGE_ESCALATION
  - 自定义模式生效

### T4.2 — 路径围栏

- **目标**：实现 L2 路径边界检查
- **涉及文件**：`src/guardrails/boundary-check.ts`, `tests/unit/guardrails/boundary-check.test.ts`
- **实现要点**：
  1. 实现 `checkPath(path: string, workspaceRoot: string): PathCheckResult`
  2. 解析路径为绝对路径
  3. 检查是否在 `workspaceRoot` 内
  4. 敏感路径检测：`~/.ssh`, `/etc/passwd`, `.env`, `*.key`, `*secret*`（即使在工作区内也硬拦截）
  5. 越界 → 硬拦截（不可审批）
  6. 支持 Windows 路径（`C:\` 跨盘符检测）
- **验证（先写测试）**：
  - 工作区内路径 → 通过
  - `/etc/passwd` → 越界拦截
  - `../../../` 逃逸 → 越界拦截
  - `.env` 在工作区内 → 敏感路径硬拦截
  - 符号链接指向工作区外 → 需检测（如可能）

### T4.3 — 风险分级

- **目标**：实现 L3 风险分级逻辑
- **涉及文件**：`src/guardrails/guardrail.ts`, `tests/unit/guardrails/guardrail.test.ts`
- **实现要点**：
  1. 实现 `assessRisk(action: Action, patternMatches: MatchResult[], pathCheck: PathCheckResult): RiskLevel`
  2. 四级风险：SAFE / CAUTION / DANGEROUS / FATAL
  3. 分级规则（见 SPEC §3.2.4）：
     - 越界访问 → FATAL
     - 敏感路径 → FATAL
     - 命中 ARBITRARY_CODE / DATABASE_DESTRUCTIVE / PRIVILEGE_ESCALATION → FATAL
     - 命中 GIT_DESTRUCTIVE / FILE_DESTRUCTION / PUBLISH → DANGEROUS
     - 命中 GIT_REWRITE_HISTORY / FILE_DESTRUCTION_WORKSPACE → CAUTION
     - 无命中 → SAFE
  4. 返回 `RiskLevel` 和 `requiresApproval`（safe → false, 其余 → true）
- **验证（先写测试）**：
  - `npm test` → SAFE
  - `rm ./src/old.ts` → CAUTION
  - `rm -rf ./node_modules` → DANGEROUS
  - `git push --force` → DANGEROUS
  - `curl \| bash` → FATAL
  - 越界访问 → FATAL，不可审批

### T4.4 — HITL 审批状态机

- **目标**：实现 L4 审批状态机和会话白名单
- **涉及文件**：`src/guardrails/hitl.ts`, `tests/unit/guardrails/hitl.test.ts`
- **实现要点**：
  1. 实现 `ApprovalStateMachine` 类
  2. 状态：IDLE → AWAITING_APPROVAL → APPROVED / DENIED / TIMED_OUT
  3. 实现 `requestApproval(action, riskLevel): Promise<ApprovalResult>`
  4. 审批选项：Y(允许) / N(拒绝) / A(允许所有同类) / S(跳过)
  5. 超时 120s 自动拒绝
  6. 实现 `SessionApprovalCache` 类
  7. 按危险类别存储白名单
  8. 会话结束自动清空（白名单不跨会话）
  9. 交互模式：通过 `inquirer` 提示用户
  10. 非交互模式：根据 `danger_policy` 自动处理（ask/deny/skip）
- **验证（先写测试）**：
  - 用户按 Y → APPROVED
  - 用户按 N → DENIED
  - 用户按 A → APPROVED + 类别加入白名单
  - 同一类别第二次自动通过
  - 不同类别仍需审批
  - 用户按 S → 不执行该操作，继续下一轮
  - 超时 → TIMED_OUT
  - 白名单不跨会话（新建 `SessionApprovalCache` 实例）
  - 非交互模式 `deny` → 自动拒绝

### T4.5 — 护栏流水线

- **目标**：串联 L1-L5，实现完整的护栏检查流水线
- **涉及文件**：`src/guardrails/pipeline.ts`, `tests/unit/guardrails/pipeline.test.ts`
- **实现要点**：
  1. 实现 `guardrail(action, workspaceRoot, approvalCache?, auditLogger?): GuardrailResult`
  2. 流水线：L1（模式匹配）→ L2（路径围栏）→ L3（风险分级）→ L4（条件触发审批）→ L5（审计日志，始终执行）
  3. L1/L2 硬拦截（fatal）→ 直接返回，不触发 L4
  4. L3 safe → 跳过 L4
  5. L3 caution/dangerous → 触发 L4
  6. L5 无论结果如何都记录
  7. 返回 `GuardrailResult`（含 `passed`, `blocked`, `requiresApproval`, `riskLevel`, `blockReason`）
- **验证（先写测试）**：
  - `npm test` → 通过，safe，不触发审批
  - `rm -rf ./node_modules` → 需要审批，dangerous
  - `cat /etc/passwd` → 硬拦截，fatal
  - 审计日志正确记录所有检查结果
  - 流水线顺序正确（L1 先于 L2）

---

## 阶段 5：反馈收集器

### T5.1 — Diff 检查器 [P]

- **目标**：实现文件修改检测
- **涉及文件**：`src/feedback/diff-tracker.ts`, `tests/unit/feedback/diff-tracker.test.ts`
- **实现要点**：
  1. 实现 `DiffTracker` 类
  2. `takeSnapshot(filePath)`: 记录文件内容快照（hash 对比）
  3. `checkDiff(filePath, expectedFiles?): DiffResult`: 对比快照与当前内容
  4. 检测意外修改（非预期文件被修改）
  5. 优先使用 git diff（如有），降级为快照 hash 对比（非 Git 项目）
- **验证（先写测试）**：
  - 文件无变化 → 通过
  - 文件有变化 → 返回变化详情
  - 预期文件被修改 → 通过，标注"预期内"
  - 非预期文件被修改 → 警告

### T5.2 — 测试 / Lint / 类型检查 / 构建执行器 [P]

- **目标**：实现四种反馈信号的执行器
- **涉及文件**：
  - `src/feedback/collector.ts`（统一入口）
  - `tests/unit/feedback/collector.test.ts`
- **实现要点**：
  1. 每种执行器通过 `ShellExecutor` 执行对应命令
  2. 解析退出码和输出
  3. 返回统一格式 `FeedbackResult`（见 SPEC §6.1）
  4. 命令从配置读取
  5. 超时控制
  6. 依赖短路：Diff → Lint → 类型检查 → 构建 → 测试（构建失败 → 跳过测试）
  7. 所有结果一次性汇总回灌
  8. 自动修正轮数注入
  9. 实现 `formatFeedbackForLLM(results): string`：生成 `<feedback>` 块格式
  10. 配置缺失时跳过对应步骤 + 打印提示
- **验证（先写测试）**：
  - 退出码 0 → 通过
  - 退出码 非0 → 失败，含错误详情
  - 命令不存在 → 返回错误
  - 全部通过 → 所有结果 passed
  - 构建失败 → 测试 skipped
  - 回灌格式正确
  - 修正轮数信息注入

---

## 阶段 6：上下文与记忆

### T6.1 — Token 计数器 [P]

- **目标**：实现 Token 估算与裁剪策略
- **涉及文件**：`src/utils/token-counter.ts`, `tests/unit/utils/token-counter.test.ts`
- **实现要点**：
  1. 实现 `TokenCounter` 类
  2. `estimateTokens(text): number`：使用 tiktoken 估算
  3. `isOverBudget(messages, threshold): boolean`
  4. `truncate(messages, threshold): Message[]`：按优先级裁剪
  5. 裁剪优先级（见 SPEC §3.10.2）：
     1. 历史对话中超出滑动窗口的旧轮次（最先丢弃）
     2. 项目文件结构摘要中的深层目录细节
     3. 近期对话中非当前任务直接相关的代码内容（压缩为摘要）
     4. 历史任务记录中的详细描述（压缩为一行摘要）
     5. 系统提示 / 当前轮反馈信号 / 最近 2 轮对话（绝对不丢弃）
  6. 代码块压缩：超过 500 行 → 保留前 10 行 + 后 10 行
  7. 阈值：80% 的模型上下文窗口
  8. 按 token 数裁剪，非按轮数
- **验证（先写测试）**：
  - 正常消息不触发裁剪
  - 超预算时按优先级裁剪
  - 代码块正确压缩
  - 系统提示始终保留
  - 最近 2 轮对话即使超限也强制保留

### T6.2 — 上下文构建器

- **目标**：实现分层上下文构建，包含系统提示和防漂移注入
- **涉及文件**：`src/core/context-builder.ts`, `tests/unit/core/context-builder.test.ts`
- **实现要点**：
  1. 实现 `buildContext(task, memory, history, currentState): Message[]`
  2. 系统提示（~500 tokens）：加载完整系统提示模板（见 SPEC §3.6），包含角色定义、12 种工具列表、行为规则、自主决策边界、反馈处理规则、禁止事项
  3. 每轮注入原始任务描述（防漂移第一层）：
     ```
     <original_task>...</original_task>
     <current_status>...</current_status>
     <feedback>...</feedback>
     ```
  4. 加载项目记忆
  5. 组装近期对话（滑动窗口，最近 5 轮）
  6. 注入当前任务上下文
  7. Token 预算检查与裁剪（调用 TokenCounter）
  8. 已压缩代码块标记为 `[已压缩] {摘要}`
- **验证（先写测试）**：
  - 完整上下文包含四层结构
  - 系统提示包含工具列表和行为规则
  - 原始任务描述每轮注入
  - 记忆被正确加载
  - 超预算时自动裁剪

### T6.3 — 记忆管理器 [P]

- **目标**：实现跨会话记忆存储与检索
- **涉及文件**：`src/memory/memory-store.ts`, `tests/unit/memory/memory-store.test.ts`
- **实现要点**：
  1. 实现 `MemoryManager` 类
  2. 存储位置：`.codeharness/memory.json`
  3. `load(): ProjectMemory`：加载记忆
  4. `save(memory): void`：保存记忆
  5. `updateTaskHistory(task, result)`: 更新任务历史（最近 10 次）
  6. `updateUserPreferences(preferences)`: 更新用户偏好（用户通过 ask_user 明确表达的偏好）
  7. `updateProjectConventions(conventions)`: 更新项目约定
  8. `summarizeForContext(): string`：生成适合注入上下文的摘要
  9. 纳入内容（见 SPEC §3.10.1）：项目文件结构摘要、历史任务及结果、用户偏好、项目约定
  10. 不纳入内容：已批准的护栏规则（跨会话白名单过于危险）、常见错误模式（MVP 不做）
- **验证（先写测试）**：
  - 记忆正确加载和保存
  - 任务历史更新（仅保留最近 10 次）
  - 用户偏好正确存储
  - 摘要格式正确

---

## 阶段 7：配置管理

### T7.1 — 配置 Schema 定义 [P]

- **目标**：定义配置文件的完整 zod Schema
- **涉及文件**：`src/config/schema.ts`, `tests/unit/config/schema.test.ts`
- **实现要点**：
  1. 使用 zod 定义完整配置结构（见 SPEC §6.3）
  2. 顶层字段：
     - `version: number`
     - `llm`: provider, model, base_url, fallbacks[]
     - `workspace`: root
     - `guardrails`: enabled, additional_patterns[], timeout_seconds, exclude_dirs[]
     - `feedback`: test_command, lint_command, typecheck_command, build_command, auto_fix_rounds
     - `tools`: default_shell, command_timeout_seconds, max_output_bytes
     - `interaction`: mode (interactive/non-interactive), danger_policy (ask/deny/skip)
     - `context`: max_history_rounds, model_context_ratio
  3. 所有字段有默认值
  4. 枚举验证（provider, danger_policy 等）
  5. 数值范围验证（timeout > 0, ratio 0-1 等）
- **验证（先写测试）**：
  - 空配置 → 使用默认值
  - 无效 provider → 验证失败
  - 超时值为负数 → 验证失败
  - model_context_ratio 超出 0-1 → 验证失败
  - fallbacks 格式正确

### T7.2 — 配置文件加载与合并

- **目标**：实现多层配置加载和深度合并
- **涉及文件**：`src/config/loader.ts`, `tests/unit/config/loader.test.ts`
- **实现要点**：
  1. 实现 `loadConfig(cliArgs, envVars): Config`
  2. 优先级：CLI 参数 > 环境变量 > 项目配置 > 全局配置 > 默认值
  3. 深度合并（deep merge）：嵌套对象递归合并
  4. 数组字段完全替代（不合并）
  5. 环境变量前缀 `CODEHARNESS_`
  6. 自动检测项目配置文件（`.codeharness.yaml` / `.codeharness.yml`）
  7. 全局配置文件：`~/.codeharness/config.yaml`
  8. 配置文件不存在时不报错，使用默认值
  9. 配置版本迁移：检测旧版本格式 → 自动迁移 → 备份原文件为 `.codeharness.yaml.bak`
- **验证（先写测试）**：
  - 仅有默认值 → 使用默认配置
  - 项目配置覆盖全局配置
  - CLI 参数覆盖项目配置
  - 环境变量覆盖项目配置
  - 数组字段完全替代
  - 无效 YAML 语法 → 报错
  - 旧版配置格式自动迁移

### T7.3 — 价格表 [P]

- **目标**：定义 LLM 价格表（纯数据文件，豁免测试覆盖率）
- **涉及文件**：`src/utils/pricing.ts`
- **实现要点**：
  1. 硬编码价格表（每 1M tokens，USD），见 SPEC §3.9.2
  2. GPT-4o: $2.50 input / $10.00 output
  3. GPT-4o-mini: $0.15 input / $0.60 output
  4. Claude Sonnet: $3.00 input / $15.00 output
  5. Claude Haiku: $0.25 input / $1.25 output
  6. Ollama 本地: $0 / $0
  7. 实现 `estimateCost(model, inputTokens, outputTokens): number`
  8. 未知模型返回 0
- **验证**：纯数据文件，豁免覆盖率

### T7.4 — 成本追踪器

- **目标**：实现 Token 用量和成本追踪
- **涉及文件**：`src/utils/cost-tracker.ts`, `tests/unit/utils/cost-tracker.test.ts`
- **实现要点**：
  1. 实现 `CostTracker` 类
  2. `recordUsage(model, inputTokens, outputTokens)`: 累计用量
  3. `getCurrentCost(): number`: 返回当前估算成本
  4. `isOverBudget(maxCost): boolean`: 检查是否超过预算
  5. `getSummary(): string`: 生成用量摘要（"Token 用量: 12,345 tokens (输入: 10,200 + 输出: 2,145) · 估算成本: ~$0.06 (GPT-4o)"）
  6. 每次 LLM 调用后记录到审计日志
- **验证（先写测试）**：
  - 用量正确累计
  - 成本计算正确
  - 超预算检测正确
  - 摘要格式正确

---

## 阶段 8：CLI 层

### T8.1 — 终端输出格式化 [P]

- **目标**：实现彩色分层终端输出，符合 SPEC §3.8 的 UX 设计
- **涉及文件**：`src/cli/output.ts`, `tests/unit/cli/output.test.ts`
- **实现要点**：
  1. 使用 `chalk` 实现颜色分层
  2. INFO（蓝色）、SUCCESS（绿色）、WARNING（黄色）、ERROR（红色）、DANGER（红色闪烁）
  3. `log(msg, level)`: 格式化输出到 stderr
  4. `logProgress(round, totalRounds, action)`: 进度输出
  5. `logActionResult(action, result)`: 动作结果（✓ ✗ ⚠ ⏳ ⠋）
  6. `logTaskResult(taskResult)`: 最终结果输出到 stdout（JSON）
  7. 实时流式透传命令输出
  8. 非交互模式下禁用彩色输出，仅最终结果 JSON 输出到 stdout
  9. Verbose 模式（`--verbose`）：显示完整 LLM 请求/响应（截断超长内容为前 2000 字符 + `...`）、上下文大小、护栏检测详情、每步耗时
- **验证（先写测试）**：
  - 不同级别输出不同颜色（通过 chalk.level 验证）
  - 最终结果为合法 JSON
  - 非交互模式不输出颜色

### T8.2 — 首次运行向导

- **目标**：实现首次运行配置向导
- **涉及文件**：`src/cli/setup-wizard.ts`
- **实现要点**：
  1. 检测 `~/.codeharness/config.yaml` 不存在 → 触发向导
  2. 检测环境变量中已设置的 API Key → 跳过对应步骤
  3. 引导选择供应商（OpenAI / Anthropic / Ollama / 跳过）
  4. 隐藏输入 API Key（使用 Node.js `readline` 的 `stdin.setRawMode(true)`）
  5. 存储到 OS 凭据管理器
  6. 验证 Key：调用廉价 API（如 OpenAI 的 `list models`），确认返回 200
  7. 验证失败处理：提示重新输入 / 更换供应商 / 退出
  8. 生成默认配置文件
  9. 展示快速入门提示
  10. 询问是否继续执行原始任务
  11. 整个流程 < 5 分钟
- **验证**：交互式向导，通过 E2E 测试覆盖（豁免单元测试覆盖率）

### T8.3 — CLI 命令实现

- **目标**：实现所有 CLI 命令和交互式审批
- **涉及文件**：`src/cli/commands.ts`, `src/index.ts`
- **实现要点**：
  1. 使用 `commander` 实现命令解析
  2. `codeharness run <task>`：主命令
  3. `codeharness init`：初始化引导
  4. `codeharness setup`：重新配置
  5. `codeharness key status`：查看凭据状态（不回显明文）
  6. `codeharness key set`：录入 API Key
  7. `codeharness key clear`：清除 API Key
  8. 交互式审批：使用 `inquirer` 提示（Y/N/A/S）
  9. 参数解析和验证
  10. 优雅中断（Ctrl+C 第一次 → 优雅退出，第二次 → 强制退出）
  11. `--help` 输出完整帮助信息
  12. `--version` 输出版本号 + 平台信息
  13. `--dry-run` 预览模式
  14. `--verbose` / `-v` 调试模式
  15. `--non-interactive` 非交互模式
  16. `--max-cost <dollars>` 成本预算上限
  17. `--log-level <debug|silent>` 日志级别
  18. `--quiet` 抑制终端输出
  19. `--mock` 使用内置 Mock LLM（用于演示和确定性测试，不依赖外部 API）
  20. 退出码（见 SPEC §3.11.1）：
      - 0: 成功
      - 1: 配置错误（缺少 API Key）
      - 2: 认证错误
      - 3: 网络错误
      - 4: 配置文件语法错误
      - 5: 工作区不存在
      - 6: 权限不足
      - 7: 护栏拦截
      - 8: 任务失败
      - 9: 未知内部错误
      - 10: Node.js 版本不满足要求
      - 130: 用户中断
- **验证（先写测试）**：
  - 无参数运行 → 显示帮助
  - 空任务描述 → 退出码 1
  - `--help` → 显示完整帮助
  - `--version` → 显示版本和平台
  - 凭据未配置 → 退出码 1
  - 中断信号 → 退出码 130

### T8.4 — 版本检查与升级

- **目标**：实现版本检查和配置文件迁移
- **涉及文件**：`src/utils/version-check.ts`, `tests/unit/utils/version-check.test.ts`
- **实现要点**：
  1. 启动时异步检查 npm registry 新版本（超时 3s 静默跳过）
  2. 如有新版本打印提示："🆕 CodeHarness vX.Y.Z 可用（当前 vX.Y.Z）。升级: npm update -g codeharness"
  3. 使用 `semver` 比较版本号
  4. 配置文件 `version` 字段检测，旧版格式自动迁移
  5. 迁移前备份原文件为 `.codeharness.yaml.bak`
  6. Node.js 版本检查：要求 ≥ 18.0.0，不满足 → 退出码 10
- **验证（先写测试）**：
  - 当前版本等于最新版本 → 无提示
  - 新版本可用 → 提示升级
  - 网络不可用 → 静默跳过
  - Node.js 版本不满足 → 退出码 10

---

## 阶段 9：集成与演示

### T9.1 — 演示①：治理护栏拦截危险动作

- **目标**：用 mock LLM 确定性地验证护栏拦截功能
- **涉及文件**：`tests/integration/demo1-guardrails.test.ts`, `tests/fixtures/mock-responses/demo1.json`
- **实现要点**：
  1. Mock LLM 响应序列（见 SPEC 第二轮回答 §Q2.16 演示①）：
     - 第 1 轮：尝试 `rm -rf /tmp/project-cache`
     - 护栏拦截 → 模拟用户按 'Y' 批准
     - 第 2 轮：LLM 返回 finish
  2. 验证：护栏正确拦截 / 审批通过后执行 / 审计日志记录
- **验证**：测试断言全部通过，不依赖网络

### T9.2 — 演示②：反馈闭环自我修正

- **目标**：用 mock LLM 验证反馈闭环的修正能力
- **涉及文件**：`tests/integration/demo2-feedback.test.ts`, `tests/fixtures/mock-responses/demo2.json`
- **实现要点**：
  1. Mock LLM 响应序列（见 SPEC 第二轮回答 §Q2.16 演示②）：
     - 第 1 轮：输出错误代码（`a - b`）
     - 测试失败 → 反馈回灌
     - 第 2 轮：修正为正确代码（`a + b`）
     - 测试通过 → 第 3 轮：finish
  2. 验证：第 1 轮代码含 `a - b` / 第 2 轮代码含 `a + b` / 测试最终通过
  3. 验证：finish 拦截器在测试通过后允许 finish
- **验证**：测试断言全部通过，不依赖网络

### T9.3 — 演示③：治理深层行为 — 五层护栏组合 + 目标漂移

- **目标**：用 mock LLM 验证五层护栏协同工作和目标漂移检测
- **涉及文件**：`tests/integration/demo3-governance.test.ts`, `tests/fixtures/mock-responses/demo3.json`
- **实现要点**：
  1. 场景 A：`npm test` → safe，直接通过
  2. 场景 B：`rm -rf ./node_modules` → dangerous，触发审批，用户拒绝
  3. 场景 C：`cat /etc/passwd` → 越界，fatal，硬拦截
  4. 场景 D：`rm ./src/old1.ts` → caution，用户按 A → 白名单 → `rm ./src/old2.ts` 自动通过
  5. 场景 E：Agent 尝试修改无关配置文件 → 偏离检测触发
  6. 验证：所有场景的护栏结果、审批结果、审计日志、偏离检测结果正确
- **验证**：测试断言全部通过，不依赖网络

### T9.4 — 端到端集成测试

- **目标**：用 mock LLM 验证完整的主循环集成，覆盖所有新增功能
- **涉及文件**：`tests/integration/e2e.test.ts`
- **实现要点**：
  1. 完整的任务执行流程（3 轮以上）
  2. 包含文件读写、命令执行、测试运行
  3. 覆盖：finish 拦截（测试未通过时拦截）、偏离检测、护栏审批、反馈回灌
  4. 验证 TaskResult 正确
  5. 验证审计日志完整
  6. 验证记忆更新
  7. 验证成本追踪
- **验证**：测试断言全部通过，不依赖网络

### T9.5 — CLI E2E 测试

- **目标**：CLI 端到端 happy path + 配置错误场景
- **涉及文件**：`tests/e2e/cli.test.ts`
- **实现要点**：
  1. 实际执行 `node dist/index.js --mock "任务"`
  2. 验证退出码
  3. 验证 stdout 包含关键信息
  4. 仅测试 happy path + 配置错误场景
  5. 不测交互式审批（需要模拟 TTY，复杂度高）
- **验证**：测试断言全部通过

---

## 阶段 10：分发与文档

### T10.1 — README.md 编写

- **目标**：编写完整的项目 README
- **涉及文件**：`README.md`
- **实现要点**：
  1. 项目简介
  2. 安装方式（npm install -g / npx）
  3. 运行命令和示例
  4. 配置说明（.codeharness.yaml）
  5. Key 安全配置方式
  6. 支持的模式（交互 / 非交互 / dry-run / verbose）
  7. 目录结构说明
  8. 安全边界说明
  9. 退出码说明
  10. 已知限制
  11. 许可证

### T10.2 — 分发配置

- **目标**：配置 npm 包分发
- **涉及文件**：`package.json`（完善 fields）
- **实现要点**：
  1. `bin` 字段指向 `dist/index.js`
  2. `files` 字段包含 `dist/`
  3. `prepublishOnly` 脚本：`npm run build && npm test`
  4. `build` 脚本：`tsc`
  5. 版本号 1.0.0
  6. 添加所有依赖：commander, yaml, chalk, inquirer, keytar, tiktoken, zod, uuid, pino, semver, openai, @anthropic-ai/sdk

### T10.3 — CI 配置完善

- **目标**：完善 CI 配置，确保自动运行测试和覆盖率检查
- **涉及文件**：`.gitlab-ci.yml`
- **实现要点**：
  1. unit-test job：`npm ci && npm test -- --coverage`
  2. 三平台矩阵（ubuntu-latest, macos-latest, windows-latest）
  3. 覆盖率不达标 → CI 失败
  4. 确保最后一次 CI 执行 Pass

---

## 依赖关系图

```
T0.1 (脚手架)
 │
 ├── T1.1 (工作区) ───────────────┐
 ├── T1.2 (Shell) ────────────────┤
 ├── T1.3 (文件操作) ──────────────┤
 ├── T1.4 (凭据) ─────────────────┤
 └── T1.5 (日志系统) ─────────────┤
                                   │
 T2.1 (LLM 接口) ─────────────────┤
  ├── T2.2 (Mock LLM) ────────────┤
  ├── T2.3 (OpenAI) ──────────────┤
  ├── T2.4 (Anthropic) ───────────┤
  ├── T2.5 (Ollama) ──────────────┤
  └── T2.6 (降级链) ──────────────┤
                                   │
 T3.1 (动作定义) ─────────────────┤
  └── T3.2 (动作分发) ────────────┤
       ├── T3.3 (停机检测) ───────┤
       ├── T3.4 (漂移检测) ───────┤
       └── T3.5 (Finish拦截) ────┤
            └── T3.6 (主循环) ◄───┘
                                   │
 T4.1 (危险模式) ─────────────────┤
 T4.2 (路径围栏) ─────────────────┤
  └── T4.3 (风险分级) ────────────┤
       └── T4.4 (审批状态机) ─────┤
            └── T4.5 (护栏流水线) ◄┘
                                   │
 T5.1 (Diff) ─────────────────────┤
  └── T5.2 (反馈收集器) ◄─────────┘
                                   │
 T6.1 (Token计数器) ──────────────┤
  └── T6.2 (上下文构建) ◄─────────┘
 T6.3 (记忆管理) ◄────────────────┘
                                   │
 T7.1 (Schema) ───────────────────┤
  └── T7.2 (配置加载) ◄───────────┘
 T7.3 (价格表) ───────────────────┤
  └── T7.4 (成本追踪) ◄───────────┘
                                   │
 T8.1 (输出格式) ─────────────────┤
 T8.2 (首次运行向导) ─────────────┤
 T8.4 (版本检查) ─────────────────┤
  └── T8.3 (CLI命令) ◄────────────┘
                                   │
 T9.1 (演示①) ────────────────────┤
 T9.2 (演示②) ────────────────────┤
 T9.3 (演示③) ────────────────────┤
  └── T9.4 (E2E) ─────────────────┤
       └── T9.5 (CLI E2E) ◄───────┘
                                   │
 T10.1 (README) ──────────────────┤
 T10.2 (分发) ────────────────────┤
 T10.3 (CI) ──────────────────────┘
```

---

## 并行执行建议（worktree）

以下 task 组可以并行执行（无直接依赖），建议分配不同的 git worktree：

| 并行组 | Tasks | 说明 |
|--------|-------|------|
| 基础设施层 | T1.1, T1.2, T1.3, T1.4, T1.5 | 五个工具模块互不依赖 |
| LLM 适配器 | T2.4, T2.5 | 可与 T2.3 并行（共享 T2.1/T2.2） |
| 治理基础 | T4.1, T4.2 | 可并行，T4.3 依赖 T4.1/T4.2 |
| 上下文与记忆 | T6.1, T6.3 | 可并行，T6.2 依赖 T6.1 |
| 配置 | T7.1, T7.3 | T7.2 依赖 T7.1，T7.4 依赖 T7.3 |
| 集成演示 | T9.1, T9.2, T9.3 | 可全并行，T9.4 依赖前三者 |
| 文档与分发 | T10.1, T10.2, T10.3 | 可全并行 |

---

## SPEC v2.0 变更摘要

相对于 SPEC v1.0，以下新增内容已纳入 PLAN：

| 新增模块 | 对应 Task | 说明 |
|---------|----------|------|
| 日志系统（Pino） | T1.5 | 审计/运行/调试三层日志，JSONL 格式，日志轮转 |
| LLM 降级链 | T2.6 | LLMProviderChain，多供应商降级 |
| 目标漂移检测器 | T3.4 | DriftDetector，三层防护 |
| Finish 拦截器 | T3.5 | 客观验证拦截，不盲目信任 Agent |
| 系统提示模板 | T6.2 | 完整系统提示（角色/工具/规则/禁止事项） |
| Token 计数器 | T6.1 | 独立模块，tiktoken 估算 |
| 价格表 | T7.3 | 纯数据，豁免覆盖率 |
| 成本追踪器 | T7.4 | CostTracker，--max-cost 支持 |
| 首次运行向导 | T8.2 | setup-wizard，< 5 分钟 |
| 版本检查 | T8.4 | semver 比较，配置迁移 |
| CLI E2E 测试 | T9.5 | 新增 CLI 端到端测试 |

| 更新模块 | 对应 Task | 变更内容 |
|---------|----------|---------|
| 动作类型 | T3.1 | 新增 DriftCheckResult、FinishResult 类型 |
| 动作分发器 | T3.2 | 大文件限制、输出截断、默认排除目录、dry-run |
| 停机检测器 | T3.3 | 新增成本预算上限、连续 3 轮相同检测 |
| 主循环 | T3.6 | 集成漂移检测、finish 拦截、LLM 降级链、dry-run、non-interactive |
| 危险模式 | T4.1 | 8 类（新增 FILE_DESTRUCTION_WORKSPACE、GIT_REWRITE_HISTORY、ARBITRARY_CODE、DATABASE_DESTRUCTIVE、PRIVILEGE_ESCALATION） |
| 审批状态机 | T4.4 | 新增 S(跳过) 选项、非交互模式 danger_policy |
| 反馈收集器 | T5.2 | 合并四个执行器为一个统一模块，配置缺失时跳过 |
| 上下文构建 | T6.2 | 包含完整系统提示、原始任务注入、Token 预算 |
| 记忆管理 | T6.3 | 更新纳入/不纳入内容 |
| 配置 Schema | T7.1 | 新增 version, fallbacks, exclude_dirs, interaction, context |
| 输出格式 | T8.1 | 新增 verbose 模式、实时流式透传 |
| CLI 命令 | T8.3 | 新增 setup, key 命令组, --dry-run, --verbose, --max-cost, --log-level, --quiet, 退出码 10/130 |

---

> **文档版本**：v2.0  
> **最后更新**：2026-07-07  
> **基于 SPEC**：docs/SPEC/SPEC.md v2.0  
> **总计 Tasks**：44 个（原 31 个 + 新增 13 个），预计执行时间 6-8 小时（含测试编写）

---

## 阶段 11：狗粮自用（Dogfooding / Self-Hosting）

> **核心理念**：CodeHarness 是一个让 AI 编码智能体构建的 AI 编码智能体工具。项目完成后，应使用 CodeHarness 自身来继续迭代和维护此项目，以验证工具的有效性并持续改进。

### T11.1 — 使用 CodeHarness 运行 PLAN 中的任务

- **目标**：使用 CodeHarness 自身执行 PLAN 中尚未完成的任务，验证工具在生产环境中的可用性
- **涉及文件**：本项目所有源文件
- **实现要点**：
  1. 在项目根目录创建 `.codeharness.yaml` 配置文件，指向本项目自身
  2. 选取 PLAN 中 3-5 个未完成的任务，使用 `codeharness run` 逐一执行
  3. 对比人工编写 vs AI 生成的代码质量
  4. 记录过程中发现的问题和改进点
  5. 将有效的改进反馈回 SPEC 和 PLAN
- **验证**：至少 3 个任务通过 CodeHarness 成功完成，且测试通过

### T11.2 — 持续改进循环

- **目标**：建立"使用工具 → 发现问题 → 改进工具 → 再次使用"的正反馈循环
- **涉及文件**：`docs/SPEC/SPEC.md`, `docs/Plan/PLAN.md`
- **实现要点**：
  1. 每次使用后记录体验报告（`docs/dogfooding/` 目录）
  2. 根据实际使用体验更新 SPEC 和 PLAN
  3. 优先改进 AI 编码智能体在使用中遇到困难的模块
  4. 跟踪改进前后的任务完成率变化
- **验证**：`docs/dogfooding/` 目录下至少有 3 份体验报告
