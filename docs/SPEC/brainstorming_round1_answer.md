# Brainstorming 第一轮：回答

> 对 `brainstorming_round1.md` 中 13 个问题的逐一回答。基于对 `AI4SE_Final_Project_A_Coding_Agent_Harness.md`、`general_require.md` 及 `AI开发实战指南.md` 的理解。

---

## 一、项目定位与范围

### Q1. 目标用户是谁？使用场景是什么？

**目标用户**：独立开发者 / 小团队开发者。他们需要一个轻量、可控、可审计的 CLI 编码助手。

**定位**：给**开发者个人**用的 CLI 编码助手。它是一个独立可运行的工具（CLI），同时内部架构清晰分层，核心 harness 模块可作为库（SDK）被其他系统集成。

**目标规模**：主要面向**单文件修改到中等规模多文件重构**（例如：给一个模块加单元测试、重构一个 service 层、迁移一段业务逻辑）。不追求"全自动开发整个项目"，而是在开发者的监督下完成明确边界内的编码任务。这一定位使"治理护栏"和"反馈闭环"的工程价值最容易体现。

---

### Q2. 一句话概括你的项目

> **一个 CLI 工具，让开发者用自然语言描述编码任务，Agent 在受控沙箱内自动读写代码、执行命令、运行测试，根据确定性测试结果自我修正，在危险操作时暂停等待人工审批，直到任务完成。**

---

## 二、技术选型

### Q3. 编程语言选什么？

**选择：TypeScript / Node.js**

理由：

1. **本次期末项目的宿主生态就是 Node.js/TypeScript**（Superpowers 技能框架、编码智能体工具链均以 Node.js 为主），选 TypeScript 意味着与开发工具链的同构，减少环境摩擦。
2. **CLI 工具生态成熟**：commander / yargs / inquirer / chalk / ora 等库可直接复用，JSON/YAML 处理原生自然。
3. **分发灵活**：通过 npm 包分发（`npx my-harness`），也支持 `pkg` / `bun build` 打包为单文件二进制。
4. **LLM SDK 丰富**：OpenAI / Anthropic / Ollama 均有官方或高质量社区 Node.js SDK。
5. **异步模型的复杂度可控**：agent 主循环本质上是事件驱动的"计划-执行-反馈"流水线，async/await 足以应对。
6. **静态类型**：TypeScript 的类型系统能在编译期捕获大量错误，对 harness 这种充满"动作分发"的系统尤有价值。

---

### Q4. 对接哪些 LLM 供应商？

| 项目 | 决策 |
|------|------|
| **供应商数量** | 支持**多个**供应商。MVP 阶段先对接 **OpenAI API**（GPT-4o/mini）和 **Anthropic API**（Claude Sonnet），通过统一的 `LLMProvider` 抽象接口实现可替换 |
| **本地模型** | **支持**，通过 Ollama 的 OpenAI 兼容 API 接入（`http://localhost:11434/v1`），用户可选用本地开源模型 |
| **API Key** | 完全由**用户提供**。程序内置凭据引导流程（首次运行引导用户安全录入，存入 OS 钥匙串 / 加密文件），不内置任何默认 Key |

LLM 抽象层设计：

```typescript
interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
}

// 实现：OpenAIProvider / AnthropicProvider / OllamaProvider
// 测试：MockLLMProvider（返回预设响应序列）
```

这使得移除真实 LLM 后，所有核心机制均可用 `MockLLMProvider` 做确定性单元测试。

---

## 三、核心机制设计

### Q5. 工具/动作范围：Agent 能执行哪些操作？

| 操作 | 纳入？ | 边界/限制 |
|------|--------|----------|
| 读取文件 | ✅ 是 | 限于工作区根目录内，禁止读取 `~/.ssh`、`/etc/passwd` 等敏感路径 |
| 写入/创建文件 | ✅ 是 | 限于工作区根目录内，禁止覆盖 `.git` 目录内文件 |
| 删除文件 | ✅ 是 | 限于工作区根目录内，删除操作记录到日志 |
| 执行 shell 命令 | ✅ 是 | 所有命令经过危险模式检测；可配置白名单/黑名单；默认超时 60s |
| 运行测试 | ✅ 是 | 执行用户项目中的测试命令（从配置读取），解析退出码和输出 |
| 运行 lint / 类型检查 | ✅ 是 | 执行 lint 命令，解析结果作为结构化反馈 |
| Git 操作（commit/push） | ⚠️ 部分纳入 | `git status`、`git diff`、`git log` 等只读操作允许；`git commit`、`git push`、`git push --force` 须人工审批 |
| 网络请求（下载依赖等） | ⚠️ 部分纳入 | `npm install`、`pip install` 等包管理命令允许（经危险检测）；`curl | bash` 模式禁止 |
| 修改项目配置文件 | ✅ 是 | 限于工作区内配置文件（`package.json`、`tsconfig.json` 等），修改前备份 |

**工作区根目录（Workspace Root）** 作为"范围围栏"：所有文件操作与命令执行默认以 workspace root 为上下文，禁止越界。

---

### Q6. 危险动作：什么操作必须拦截并等待人工审批？

**危险动作清单（模式匹配 + 白名单双重检测）：**

| 类别 | 危险模式 | 检测方式 |
|------|---------|---------|
| 文件破坏 | `rm -rf`、`rm -r`、`del /f /s`、删除工作区外路径 | 正则匹配 + 路径越界检测 |
| Git 危险操作 | `git push --force`、`git push --delete`、`git reset --hard`、`git clean -fdx` | 正则匹配 |
| 权限变更 | `chmod 777`、`chown` | 正则匹配 |
| 任意代码执行 | `curl \| bash`、`wget -O - \| sh`、`eval` | 正则匹配 |
| 数据库破坏 | `DROP TABLE`、`DROP DATABASE`、`DELETE FROM ... WITHOUT WHERE` | 正则匹配 |
| 系统级操作 | `shutdown`、`reboot`、`mkfs`、`dd` | 正则匹配 |
| 敏感文件访问 | 读取 `~/.ssh`、`/etc/passwd`、`.env`（含凭据的文件） | 路径检测 |
| 对外发布 | `npm publish`、`docker push`、`git push`（非 force 也审批） | 正则匹配 |

**审批交互方式**：

```
⚠️  危险动作拦截！
  命令: rm -rf ./node_modules
  风险: 文件破坏 - 递归强制删除
  [Y] 允许本次  [N] 拒绝  [A] 允许所有同类操作  [S] 查看详情

> _
```

- CLI 输入 `y/n/a/s`。
- 允许"本次会话记住"（`A` 选项），减少重复审批。
- **不实现**"永久白名单"（太危险），每次新会话重置审批状态。
- 审批超时 120s，超时自动拒绝。

**代码实现**（确定性、可单测）：

```typescript
interface SafetyCheckResult {
  approved: boolean;
  requiresApproval: boolean;
  reason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

function guardrail(command: string, workspaceRoot: string): SafetyCheckResult {
  // 1. 检测危险模式
  // 2. 检测路径越界
  // 3. 检测敏感文件访问
  // 返回是否需要审批及风险等级
}
```

---

### Q7. 客观反馈信号：什么信号告诉 Agent "你做对了"？

**全部纳入**。这是 coding agent harness 最天然的优势——所有反馈信号都是代码实现的校验器，天然客观、确定、可回灌。

| 反馈信号 | 纳入？ | 如何获取？ |
|----------|--------|-----------|
| 测试通过/失败 | ✅ | `FeedbackCollector.runTests()` — 执行测试命令，解析退出码（0=通过，非0=失败），抓取失败用例名和错误信息 |
| Lint 检查结果 | ✅ | `FeedbackCollector.runLint()` — 执行 lint 命令，解析输出为结构化结果：`{ errors: number, warnings: number, details: LintIssue[] }` |
| 类型检查 | ✅ | `FeedbackCollector.runTypeCheck()` — 运行 `tsc --noEmit` 或等价命令，解析退出码和错误信息 |
| 编译/构建成功与否 | ✅ | `FeedbackCollector.runBuild()` — 运行 build 命令，解析退出码和错误输出 |
| 输出文件 diff 是否符合预期 | ✅ | `FeedbackCollector.checkDiff()` — 对比修改前后的文件变更，验证是否仅修改了预期文件、未引入意外变更 |

**反馈回灌机制**：

```
Agent 执行动作 → 产生修改 → 运行校验器 → 收集客观反馈 →
将反馈格式化注入 LLM 上下文 → Agent 根据反馈决定：通过则结束，失败则修正
```

每轮循环的上下文结构：

```
<上一次动作的执行结果>
<客观反馈: 测试 2/5 通过, Lint 3 个错误, 类型检查通过>
请根据以上反馈修正问题或继续下一步。
```

**代码实现**：

```typescript
interface FeedbackResult {
  source: 'test' | 'lint' | 'typecheck' | 'build' | 'diff';
  passed: boolean;
  details: string;  // 结构化信息
  summary: string;  // 供 LLM 阅读的摘要
}

class FeedbackCollector {
  async collectAll(): Promise<FeedbackResult[]> { /* ... */ }
  async runTests(): Promise<FeedbackResult> { /* ... */ }
  async runLint(): Promise<FeedbackResult> { /* ... */ }
  // ...
}
```

所有反馈信号都是纯代码逻辑，移除 LLM 后完全可单测。

---

### Q8. 重点深入维度：你选哪个维度做深？

**选择：治理（护栏/沙箱/HITL 状态机/范围围栏）**

理由：

1. **最"代码化"的维度**：危险命令检测、路径越界检查、审批状态机、超时控制——全都是确定性的代码逻辑，天然契合 §A.4(C) 的"移除 LLM 还能单测验证"的硬标准。

2. **工程深度最好体现**：
   - **多层护栏**：正则模式匹配 → 路径越界检测 → 命令白名单/黑名单 → 风险分级 → HITL 审批
   - **状态机**：`IDLE → EXECUTING → AWAITING_APPROVAL → APPROVED → EXECUTING → IDLE`，含超时回退、会话级记忆
   - **沙箱边界**：Workspace Root 围栏 + 命令权限分级 + 网络访问控制
   - **审计日志**：所有被拦截/审批的动作完整记录

3. **机制演示最容易做**：
   - 演示①：注入 `rm -rf /` → 护栏拦截 → 等待审批 → 拒绝 → Agent 收到"被拒绝"反馈
   - 演示③（治理深度）：测试多层护栏组合——危险命令被模式匹配拦截、非危险但越界命令被路径围栏拦截、正常命令直接放行

4. **与其他维度自然关联**：治理深入会自然触及反馈（拦截结果作为反馈回灌）、配置（护栏规则可配置）、工具分发（动作执行前经过护栏）。

**深入规划**：

| 层级 | 内容 | 实现方式 |
|------|------|---------|
| L1: 模式匹配 | 正则检测已知危险模式 | `DangerousPatternRegistry` |
| L2: 路径围栏 | Workspace Root 边界检测 | `PathBoundaryGuard` |
| L3: 权限分级 | 命令分为 read/write/admin/dangerous 四级 | `CommandPermissionLevel` |
| L4: HITL 状态机 | 审批流程 + 超时 + 会话记忆 | `ApprovalStateMachine` |
| L5: 审计日志 | 结构化记录所有拦截/审批/执行 | `AuditLogger` |

> 其他五个维度都有最低可运行实现，但治理做到上述五层深度。

---

## 四、体验与交互

### Q9. 交互模式是什么？

**两者都支持**，通过 CLI 参数切换：

```
# 交互模式（默认）
$ my-harness "给 UserService 添加单元测试"
# Agent 执行 → 遇危险操作询问 → 展示反馈 → 继续 → 完成

# 非交互模式（适合 CI / 脚本 / 简单任务）
$ my-harness --non-interactive --auto-approve=none "修复 lint 错误"
# 遇危险操作：按配置处理（拒绝/跳过/中止）
```

| 模式 | 触发方式 | 危险操作处理 | 适用场景 |
|------|---------|-------------|---------|
| 交互式 | 默认 / `--interactive` | 暂停等待用户输入 y/n | 日常开发、探索性任务 |
| 非交互-拒绝 | `--non-interactive --danger-policy=deny` | 自动拒绝所有危险操作 | CI 流水线、安全敏感环境 |
| 非交互-跳过 | `--non-interactive --danger-policy=skip` | 跳过危险操作，继续执行 | 只读分析任务 |

---

### Q10. 配置方式

**多层配置体系，优先级从高到低：**

1. **CLI 参数**（最高优先级）：单次任务覆盖
2. **环境变量**：`AGENT_LLM_PROVIDER`、`AGENT_MODEL`、`AGENT_WORKSPACE` 等
3. **项目级配置文件**：工作区根目录下的 `.agent.yaml`（或 `.agent.json`）
4. **全局配置文件**：`~/.my-harness/config.yaml`
5. **内置默认值**（最低优先级）

**配置文件格式：YAML**（比 JSON 更易读写，比 TOML 更主流）

```yaml
# .agent.yaml
llm:
  provider: openai        # openai | anthropic | ollama
  model: gpt-4o
  # base_url: http://localhost:11434/v1  # Ollama 时使用

workspace:
  root: .                 # 默认当前目录

guardrails:
  enabled: true
  dangerous_patterns:     # 额外自定义危险模式
    - "rm -rf"
  auto_approve: []        # 可自动批准的命令（慎用）

feedback:
  test_command: "npm test"
  lint_command: "npm run lint"
  build_command: "npm run build"
  auto_fix_rounds: 3      # 最多自我修正轮数

tools:
  allowed_commands: []    # 白名单（空=全部允许，经护栏检测）
  timeout_seconds: 60
  shell: "bash"           # 或 "powershell" on Windows

interaction:
  mode: interactive        # interactive | non-interactive
  danger_policy: ask       # ask | deny | skip
```

---

## 五、分发与运维

### Q11. 分发形态选哪种？

**主选：npm 包 + 次选：原生可执行二进制**

| 形态 | 是否选用 | 说明 |
|------|---------|------|
| npm 包 | ✅ **主选** | `npm install -g my-harness` 或 `npx my-harness`，与 TypeScript 生态天然一致 |
| 原生可执行二进制 | ✅ **次选** | 使用 `bun build --compile` 或 `pkg` 打包为单文件，方便非 Node.js 用户 |
| 容器镜像 | ❌ 不选 | CLI 工具用容器分发的 UX 较差（需要挂载工作目录、管理卷），不适合"在本地项目目录中运行"的场景 |
| Homebrew | ⭐ 可选 | 后期可考虑 |

**目标平台**：全平台（Linux / macOS / Windows）。Node.js 跨平台天然支持；Windows 上 PowerShell 作为默认 shell。

**分发命令**：

```bash
# 方式一：npm（推荐）
npm install -g my-harness
my-harness "添加用户认证模块"

# 方式二：npx（无需安装）
npx my-harness "修复 TypeScript 类型错误"

# 方式三：二进制（TODO：后期）
# 从 GitHub Releases 下载对应平台二进制
```

---

### Q12. 项目名称？

**`CodeHarness`**（备选：`DevHarness`、`CoderKit`）

| 候选名 | 优点 | 缺点 |
|--------|------|------|
| **CodeHarness** ✅ | 直接点题 "Coding Agent Harness"；简洁有力；npm 包名可用 | 稍偏技术化 |
| DevHarness | 更通用的开发者工具感 | 不如 CodeHarness 精准 |
| CoderKit | 听起来像工具箱，友好 | 弱化了 harness 的学术/工程含义 |

**选择 `CodeHarness`**。命名清晰传达了项目定位（给 coding 用的 harness），与课程命题（"Agent = LLM + Harness"）直接对应。

---

## 六、风险预判

### Q13. 你预见到哪些可能让开发出问题的环节？

#### 风险 1：LLM 输出格式不稳定，解析动作失败 ⚠️ 高风险

**问题**：LLM 返回的动作描述可能不符合预期的 JSON 结构、字段缺失、或混入自然语言解释。

**对策**：
- 使用 **Structured Output / JSON Mode**（OpenAI 的 `response_format`、Anthropic 的 tool use），从协议层面约束输出格式
- 实现 **宽松解析 + 重试机制**：首次解析失败 → 将错误信息回灌 LLM → 要求重新输出 → 最多重试 2 次 → 超限则中止
- 预定义严格的动作 Schema（TypeScript 类型 + JSON Schema），LLM 必须匹配
- 在 mock LLM 测试中模拟各种格式错误，确保解析器健壮

#### 风险 2：Shell 命令执行的安全沙箱如何实现？ ⚠️ 高风险

**问题**：在用户本机执行任意命令，如何限制其影响范围？

**对策**：
- **多层护栏**（见 Q8 重点维度）：模式匹配 → 路径围栏 → 权限分级 → HITL
- **子进程隔离**：所有命令在子进程中执行，设置 `cwd` 为 workspace root
- **资源限制**：超时（60s）、最大输出（1MB）、禁止交互式命令（无 TTY）
- **不实现完整 OS 级沙箱**（如 Docker in Docker），因为 CLI 工具的定位是在开发者本地运行，完全隔离反而削弱可用性。**明确文档说明安全边界**：护栏是"防御性编程"而非"安全沙箱"。

#### 风险 3：Mock LLM 如何设计才能既简单又有足够的表现力驱动测试？ ⚠️ 中风险

**问题**：mock LLM 过于简单 → 测不出真实场景的问题；过于复杂 → mock 本身变成第二个项目。

**对策**：
- **基于场景的响应序列**：MockLLM 接受一组预设的 `{ inputPattern, response }` 对，按顺序匹配返回
- **关键测试场景**：
  1. 正常流程：Agent 按预期步骤执行，最终返回成功
  2. 护栏拦截：注入危险动作 → mock 返回"执行危险命令"意图 → 护栏拦截 → 验证 Agent 收到拒绝反馈
  3. 反馈修正：mock 返回"修改代码" → 测试失败 → mock 返回"修正代码" → 测试通过
  4. 格式错误：mock 返回非法 JSON → 验证解析器的重试机制
  5. 达到最大轮数：mock 始终返回失败 → 验证 Agent 在 `auto_fix_rounds` 耗尽后正确停机
- Mock 只需实现 `LLMProvider` 接口的 `chat()` 方法，极简实现（约 50 行）

#### 风险 4：记忆/上下文窗口有限，如何裁剪？ ⚠️ 中风险

**问题**：多轮对话 + 文件内容 + 反馈信息可能超出 LLM 上下文窗口。

**对策**：
- **分层上下文管理**：
  - **系统提示**（固定，约 500 tokens）：角色定义 + 工具列表 + 规则
  - **近期对话**（滑动窗口，最近 5 轮）：保持 Agent 的"短期记忆"
  - **当前任务上下文**（按需注入）：当前正在操作的文件内容、最新的反馈信号
  - **项目摘要**（预生成并缓存）：关键文件结构、包依赖、项目约定的压缩表示
- **上下文预算管理**：每次构建上下文前估算 token 数，超过阈值时按优先级裁剪
- 记忆存储使用简单的 JSON 文件（`.codeharness/memory.json`），不引入向量数据库（对 MVP 过度设计）

#### 风险 5：跨平台兼容性（Windows vs Unix） ⚠️ 低风险

**问题**：命令语法、路径分隔符、shell 差异。

**对策**：
- 自动检测平台，选择默认 shell（`bash` / `powershell`）
- 路径操作统一使用 Node.js `path` 模块
- 危险模式同时覆盖 Unix 和 Windows 语法（如 `rm -rf` 和 `del /f /s`）

#### 风险 6：Agent 陷入无限修正循环 ⚠️ 中风险

**问题**：LLM 反复修改但测试始终不通过，Agent 无法自行收敛。

**对策**：
- `auto_fix_rounds` 硬上限（默认 3 轮，可配置），超过则停机并输出详细失败报告
- 每轮反馈中注入"已尝试 N 次"信息，引导 LLM 变换策略
- 如果连续 2 轮产生相同的修改（diff 无变化），提前中止（判定为"卡住"）

---

## 总结：关键决策一览

| 维度 | 决策 |
|------|------|
| **定位** | 面向个人开发者的 CLI 编码助手 |
| **语言** | TypeScript / Node.js |
| **LLM** | OpenAI + Anthropic + Ollama，统一抽象接口 |
| **工具范围** | 文件读写 + Shell + 测试/Lint/Build + 部分 Git（只读） |
| **危险动作** | 模式匹配 + 路径围栏，CLI 交互审批 |
| **反馈信号** | 测试 + Lint + 类型检查 + 构建 + Diff，全部代码实现 |
| **重点维度** | **治理（护栏/沙箱/HITL）**，做五层深度 |
| **交互模式** | 交互式 + 非交互式，CLI 参数切换 |
| **配置** | YAML 配置文件（项目级 + 全局）+ 环境变量 + CLI 参数 |
| **分发** | npm 包（主） + 二进制（次），全平台 |
| **项目名称** | **CodeHarness** |
