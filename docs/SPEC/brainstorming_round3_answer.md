# Brainstorming 第三轮：回答

> 对 `brainstorming_round3.md` 中 22 个问题的逐一回答。本轮聚焦工程实践细节，是进入 SPEC 冻结和代码实现前的最后一次设计审查。

---

## 一、Agent 的"人格"与系统提示

### Q3.1 系统提示设计

以下是 `codeharness` 系统提示的草稿框架：

```
你是 CodeHarness，一个运行在用户本地工作区中的编码助手。

## 角色
你是一个严谨、务实的软件工程师。你的目标不是写出"看起来正确"的代码，
而是写出能通过所有客观验证（测试、lint、类型检查）的代码。
你接受用户的自然语言任务描述，在工作区内自主完成编码工作。

## 可用工具
| 工具 | 用途 | 何时使用 |
|------|------|---------|
| read_file | 读取文件内容 | 理解现有代码、查看错误文件 |
| write_file | 创建或覆写文件 | 实现新代码、修复 bug |
| delete_file | 删除文件 | 清理不再需要的文件（需提供理由） |
| list_dir | 列出目录 | 了解项目结构 |
| search_file | 按 glob 模式搜索文件 | 查找特定类型的文件 |
| grep | 搜索文本内容 | 查找函数/变量引用、理解代码依赖 |
| run_command | 执行 shell 命令 | 安装依赖、查看 git 状态等 |
| run_tests | 运行项目的测试 | 每次代码修改后验证正确性 |
| run_lint | 运行 lint 检查 | 验证代码风格和质量 |
| run_type_check | 运行类型检查 | 验证类型正确性 |
| ask_user | 向用户提问 | 遇到无法自主决策的模糊情况 |
| finish | 标记任务完成 | 任务目标已达成或确认无法达成 |

## 行为规则

### 执行策略
1. 先理解再行动：修改代码前先读取相关文件，理解上下文。
2. 最小修改原则：只修改必要的部分，不做无关的"顺手重构"。
3. 每次修改后验证：修改代码后立即运行测试/lint/类型检查。
4. 任务目标优先：始终围绕用户原始任务，不要扩展范围。

### 何时自主决策
- 选择具体实现方式（如用 for 循环还是 Array.map）
- 变量命名、代码格式（遵循项目现有风格）
- 选择第三方库的版本（使用稳定版本）
- 添加必要的 import 语句

### 何时询问用户（使用 ask_user）
- 任务描述本身模糊，有两种以上合理理解
- 需要删除用户编写的现有业务逻辑（而不是你刚创建的）
- 需要安装新的项目依赖（不在 package.json 中的包）
- 多个等价方案难以判断用户偏好
- 修改可能影响其他模块的公共 API 签名

### 收到反馈时的处理规则
- **测试失败**：仔细阅读失败信息，定位你引入的错误，修正后重新运行测试
- **Lint 错误**：按 lint 规则修正代码风格，不要通过禁用 lint 规则来"修复"
- **类型检查失败**：修正类型错误，不要用 `any` 或 `@ts-ignore` 规避
- **护栏拒绝**：动作被安全策略阻止 → 寻找替代方案。如果无替代方案，
  使用 ask_user 说明情况。不要尝试绕过护栏
- **连续 2 次同样失败**：停下来，重新理解问题，考虑换一种思路

### 禁止事项
- 不要读取工作区外的文件
- 不要执行被护栏拒绝的命令（包括换一种写法绕过）
- 不要修改 .git 目录内的文件
- 不要读取 .env 或包含凭据的文件
- 不要在代码中硬编码 API Key、密码、token
- 不要使用 eval() 或类似动态执行
- 不要安装未经用户确认的新依赖
- 不要在未理解代码的情况下盲目修改
- 如果连续 3 轮无法解决问题，使用 ask_user 报告情况
```

**设计原则**：

1. **角色精准**："严谨、务实的软件工程师"而非"超级 AI 程序员"——降低 LLM 过度自信的风险
2. **工具表格式描述**：让 LLM 清楚知道每个工具何时使用，减少误用
3. **自主 vs 询问的明确边界**：这是"目标漂移"和"过度询问"之间的平衡点
4. **反馈处理规则具体**：每种反馈类型有明确的应对策略
5. **禁止事项硬约束**：配合代码层护栏形成双重防护

---

### Q3.2 多轮任务中的"目标漂移"防护

**三层防护机制**：

**第一层：上下文注入（每轮重复原始任务）**

每轮对话的 user message 前缀固定注入：

```
<original_task>
给 UserService 添加单元测试
</original_task>

<current_status>
当前第 3/10 轮，已修改文件: src/user.ts, src/user.test.ts
上一次测试结果: 2/5 通过
</current_status>

<feedback>
测试失败: UserService.test.ts - "should hash password" - expected "hashed_xxx" got undefined
</feedback>

请根据以上反馈继续完成任务。记住你的原始任务目标。
```

这确保 LLM 每轮都"看到"原始任务，不会被对话历史中的上下文噪声带偏。

**第二层：偏离检测（代码逻辑）**

```typescript
interface DriftCheckResult {
  drifting: boolean;
  risk: 'none' | 'low' | 'high';
  reason?: string;
}

class DriftDetector {
  check(
    originalTask: string,
    currentAction: AgentAction,
    modifiedFiles: string[],
    round: number
  ): DriftCheckResult {
    // 规则 1: 修改文件数量突然暴增
    if (round > 1 && modifiedFiles.length > initialModifiedCount * 3) {
      return { drifting: true, risk: 'high',
        reason: `修改范围从 ${initialModifiedCount} 个文件扩大到 ${modifiedFiles.length} 个` };
    }

    // 规则 2: 动作涉及与任务无关的目录
    // （用简单的关键词匹配，声明为"启发式"而非"精确"）
    const taskKeywords = extractKeywords(originalTask); // e.g. ["UserService", "测试"]
    if (currentAction.type === 'write_file') {
      const filePath = currentAction.path;
      const unrelated = !taskKeywords.some(kw =>
        filePath.toLowerCase().includes(kw.toLowerCase()));
      if (unrelated && modifiedFiles.length > 3) {
        return { drifting: true, risk: 'low',
          reason: `文件 ${filePath} 似乎与任务无关` };
      }
    }

    // 规则 3: 动作是修改配置文件，但任务不涉及配置
    if (isConfigFile(currentAction) && !isConfigRelated(originalTask)) {
      return { drifting: true, risk: 'medium',
        reason: '正在修改配置文件，但任务描述未涉及配置变更' };
    }

    return { drifting: false, risk: 'none' };
  }
}
```

**第三层：偏离响应（低风险提醒，高风险拦截）**

| 风险等级 | 行为 |
|---------|------|
| `none` | 正常执行 |
| `low` | 在下一轮上下文中追加提醒："注意：你的上一步操作似乎与原始任务偏离。请确认是否必要。" |
| `high` | 暂停执行，使用 `ask_user` 机制询问："检测到可能的任务偏离——当前操作涉及 {原因}，但原始任务是 '{原始任务}'。是否继续？" |

**谁来做偏离检测**：**代码逻辑**（第二层），不是 LLM 自检。原因：

- LLM 自检不可靠（它可能为自己的偏离找理由）
- 代码逻辑是确定性的，遵循 §A.4(C) 的"移除 LLM 后仍可单测"原则
- 偏离检测的规则是启发式的（不可能完美），但在 harness 代码中明确标注了这一点

---

## 二、实现策略与开发流程

### Q3.3 PLAN.md 的执行策略

| 问题 | 决策 |
|------|------|
| **可并行的 task** | T1（配置模块）和 T3（LLM 抽象层）可并行——两者无依赖；T2（日志模块）和 T4（上下文构建器）可并行；T5-T7（护栏、工具、反馈）在 T4 完成后可两两并行 |
| **必须串行的 task** | 核心依赖链：T0（脚手架）→ T1/T2/T3/T4（基础模块）→ T5（护栏）+ T7（反馈）→ T6（工具分发）→ T8（主循环集成）→ T9（CLI 入口）→ T10（E2E 测试与文档） |
| **Subagent 模型** | 所有 task 使用**同一编码智能体**（如 Claude Code），保持代码风格一致。辅助 task（如写文档、CI 配置）可用不同模型 |
| **冒烟测试** | ✅ **T0 完成后立刻写冒烟测试**：最简 mock LLM → 主循环调用 → 返回 `finish` → 断言流程跑通。冒烟测试虽简单，但它验证了"脚手架 + 模块接口 + 依赖注入"整个骨架的正确性 |
| **开发顺序** | **逐个实现并集成**（非全部实现再集成）。理由：早期集成暴露接口设计问题；每个模块交付后立刻有对应的 mock 测试，形成"增量式安全网" |

**详细并行规划**：

```
T0: 脚手架搭建
 ├─→ T1: 配置模块 ←──→ T3: LLM 抽象层
 ├─→ T2: 日志模块 ←──→ T4: 上下文构建器
 │         ↓（T1+T2+T3+T4 完成后）
 ├─→ T5: 护栏模块 ←──→ T7: 反馈模块
 │         ↓（T5+T7 完成后）
 ├─→ T6: 工具分发模块（依赖 T5 护栏审批 + T4 上下文）
 │         ↓
 ├─→ T8: 主循环集成（所有模块对接）
 │         ↓
 ├─→ T9: CLI 入口（commander + inquirer）
 │         ↓
 └─→ T10: E2E 测试 + 文档 + CI

可并行组:
  组 A: T1 + T3（各自独立 worktree）
  组 B: T2 + T4（各自独立 worktree）
  组 C: T5 + T7（各自独立 worktree）
```

---

### Q3.4 多语言项目支持

| 场景 | 处理方式 |
|------|---------|
| Python 项目（无 `package.json`） | Workspace Root 检测回落：`.codeharness.yaml` → `.git` → `pyproject.toml` / `setup.py` / `requirements.txt` → cwd。配置文件 `.codeharness.yaml` 中用户指定 `feedback.test_command: "pytest"`、`feedback.lint_command: "flake8"`、`feedback.typecheck_command: "mypy"` |
| 测试/lint 命令不同 | 全部通过 `.codeharness.yaml` 配置。**不为任何语言硬编码命令**。如果未配置且检测不到常见命令 → 跳过对应反馈步骤 + 打印提示 |
| 非 Git 项目 | Workspace Root 检测跳过 `.git` 这一级，回落到其他标记文件。Diff 反馈从"对比 git diff"降级为"快照 hash 对比"。**功能不受影响** |
| Monorepo | **不自动处理**。用户需在子项目目录中放置各自的 `.codeharness.yaml`，或在根目录 `.codeharness.yaml` 中通过 `workspace.root` 指向目标子项目。Monorepo 的自动检测（如解析 `workspaces` 字段）是一个复杂的独立问题，MVP 不支持 |
| Makefile/Taskfile 项目 | 用户可在 `.codeharness.yaml` 中配置：`feedback.test_command: "make test"`、`feedback.build_command: "make build"`。CodeHarness 不关心命令是什么，只关心退出码和输出 |

**通用性设计原则**：CodeHarness 的 harness 内核**完全语言无关**。它只操作文件、执行命令、解析退出码。所有语言特定的东西都在配置文件中。

---

### Q3.5 开发环境与工具链

| 问题 | 决策 |
|------|------|
| **包管理器** | **pnpm**。理由：磁盘效率高（全局缓存）、严格的依赖解析（避免幽灵依赖）、与 Superpowers 工作流兼容性好 |
| **TypeScript 编译目标** | `ES2022`，`module: NodeNext`，`moduleResolution: NodeNext`。Node.js 最低版本 **18.x LTS**（ES2022 特性全覆盖，且 18.x 是当前最老的活跃 LTS） |
| **代码风格** | **ESLint**（`@typescript-eslint` 严格规则集）+ **Prettier**（默认配置，仅 `singleQuote: true`、`trailingComma: 'all'`）。不做无意义的风格定制 |
| **Monorepo 工具** | **不使用** turborepo/nx。`codeharness` 是单一包（单 `package.json`），核心模块通过 TypeScript 的 `paths` 别名组织清晰即可 |
| **Git 分支策略** | **feature 分支 + PR**（与 Superpowers 的 `using-git-worktrees` + `finishing-a-development-branch` 工作流对齐）。main 分支始终可发布。每个 worktree = 一个 feature 分支 = 一个 PR |

**项目目录结构**：

```
codeharness/
├── src/
│   ├── index.ts              # CLI 入口
│   ├── cli/
│   │   ├── commands.ts       # 命令定义（commander）
│   │   └── setup-wizard.ts   # 首次运行向导
│   ├── core/
│   │   ├── agent-loop.ts     # 主循环
│   │   ├── context-builder.ts # 上下文构建器
│   │   └── drift-detector.ts # 偏离检测
│   ├── llm/
│   │   ├── provider.ts       # LLMProvider 接口
│   │   ├── adapters/         # OpenAI / Anthropic / Ollama adapter
│   │   └── mock-provider.ts  # Mock LLM
│   ├── tools/
│   │   ├── registry.ts       # 工具注册表
│   │   ├── file-ops.ts       # 文件操作（含原子性）
│   │   ├── command-runner.ts # 命令执行
│   │   └── action-parser.ts  # 动作解析
│   ├── guardrails/
│   │   ├── guardrail.ts      # 护栏主逻辑
│   │   ├── pattern-registry.ts # 危险模式注册表
│   │   ├── hitl.ts           # HITL 状态机
│   │   └── boundary-check.ts # 路径围栏
│   ├── feedback/
│   │   ├── collector.ts      # 反馈收集器
│   │   └── diff-tracker.ts   # Diff 追踪器
│   ├── memory/
│   │   ├── memory-store.ts   # 记忆存储
│   │   └── session-cache.ts  # 会话审批缓存
│   ├── config/
│   │   ├── loader.ts         # 配置加载+合并
│   │   └── schema.ts         # 配置 Schema 定义
│   ├── logging/
│   │   ├── audit-logger.ts   # 审计日志
│   │   └── runtime-logger.ts # 运行/调试日志
│   └── utils/
│       ├── token-counter.ts  # Token 估算
│       └── cost-tracker.ts   # 成本追踪
├── tests/
│   ├── unit/                 # 每模块对应一个测试文件
│   ├── integration/          # 集成测试
│   └── e2e/                  # CLI 端到端测试
├── docs/
├── .codeharness.yaml         # 自举：用自己管理自己
├── package.json
├── tsconfig.json
├── .eslintrc.cjs
├── .prettierrc
└── .github/
    └── workflows/
        └── ci.yml
```

---

## 三、运行时行为

### Q3.6 流式输出与用户体验

| 问题 | 决策 |
|------|------|
| LLM 思考过程 | **不展示 LLM 思考流**（不做 streaming）。显示 spinner + 状态文本："正在分析任务..." / "正在生成代码..." / "正在等待 API 响应..."。理由：raw token 流对用户没有意义，反而造成信息噪音 |
| 执行前展示计划 | ✅ **展示"本轮计划"**（非"任务计划"）。每轮 LLM 返回动作后，在终端展示：`→ 第3轮: 修改 src/user.ts (write_file)` + `→ 运行 npm test (run_tests)`。这是单行动作摘要，不是多步计划，不需要用户确认——因为用户已在危险操作时有审批机会 |
| 实时展示输出 | 命令执行时**实时展示 stdout/stderr**（流式透传），让用户感知进度。测试运行时实时看到测试用例逐个执行。但非交互模式（`--non-interactive`）下抑制输出，只显示最终摘要 |
| Verbose 调试模式 | ✅ 支持 `--verbose` / `-v` 标志。显示完整 LLM 请求/响应（截断超长内容为前 2000 字符 + `...`）、上下文大小（tokens 数）、护栏检测详情、每步耗时 |

**终端输出示例（交互模式）**：

```
$ codeharness "给 UserService 添加单元测试"

🔍 正在分析项目结构...
✓ 检测到 TypeScript 项目 (Node.js)
✓ Workspace: /home/user/projects/myapp

💭 正在理解任务...
→ 第1轮: 读取 src/user.ts (read_file)
→ 第1轮: 读取 src/user.test.ts (read_file)

💭 正在生成代码...
→ 第2轮: 修改 src/user.test.ts (write_file)     [512 lines]

→ 运行测试: npm test -- --testPathPattern=UserService
  ✓ should create user (12ms)
  ✓ should find user by id (8ms)
  ✗ should hash password (15ms) - expected "hashed_xxx" got undefined
  → 2/3 通过

💭 正在修正...
→ 第3轮: 修改 src/user.ts (write_file)           [fix: 添加 bcrypt 哈希逻辑]

→ 运行测试: npm test -- --testPathPattern=UserService
  ✓ should create user (10ms)
  ✓ should find user by id (7ms)
  ✓ should hash password (14ms)
  → 3/3 通过 ✅

✅ 任务完成 (3轮, 8.2s)
   Token 用量: 4,231 tokens (~$0.02)
   修改文件: src/user.test.ts, src/user.ts
```

---

### Q3.7 Dry-Run 模式

**支持 `--dry-run` 模式。**

```
$ codeharness --dry-run "重构 UserService"

🔍 分析代码库（只读模式）...
→ 读取 src/user.ts
→ 读取 src/controller.ts
→ 搜索 UserService 引用...
→ 搜索 UserService import 语句...

📋 计划摘要:
  1. 创建 src/services/UserService.ts — 提取 UserService 类
  2. 更新 src/user.ts — 改为从新路径 re-export
  3. 更新 src/controller.ts — 修改 import 路径
  4. 运行测试验证

⚠️  这是 dry-run 模式，不会修改任何文件。

确认执行？[Y/n]  _
```

**Dry-run 行为定义**：

| 行为 | Dry-run 中？ |
|------|------------|
| 读取文件 | ✅ 允许（只读操作） |
| 搜索/目录列表 | ✅ 允许（只读操作） |
| LLM 调用 | ✅ 会消耗（需要 LLM 分析代码并生成计划） |
| 写入/删除文件 | ❌ 禁止（拦截并记录到计划中） |
| 执行命令（测试/lint 等） | ❌ 禁止（仅记录到计划中） |
| 进入 HITL 审批 | ❌ 不触发（因为没有实际操作） |

Dry-run 的实现方式：给主循环传递 `dryRun: true` 标志，工具分发层在写操作前检查此标志并跳过实际执行，将"本会执行"的动作记录到计划列表中。

---

### Q3.8 任务完成的判定

**三层判定机制**：

**第一层：Agent 主动调用 `finish`**

```typescript
// Agent 调用 finish 时，harness 的拦截逻辑：
function handleFinish(action: FinishAction, state: AgentState): FinishResult {
  // 检查 1: 如果 Agent 声称成功，但最后一轮测试未通过
  if (action.success && state.lastFeedback && !state.lastFeedback.allPassed) {
    return {
      intercepted: true,
      message: `不能宣告完成：还有 ${state.lastFeedback.failedCount} 个测试未通过。`,
      suggestion: '请修正测试失败后再尝试完成。',
    };
  }

  // 检查 2: 如果 Diff 显示有意外修改
  if (action.success && state.lastDiff?.unexpected.length > 0) {
    return {
      intercepted: true,
      message: `检测到意外文件修改: ${state.lastDiff.unexpected.join(', ')}。`,
      suggestion: '请确认这些修改是否必要，或撤销意外修改。',
    };
  }

  // 通过检查，允许 finish
  return { intercepted: false };
}
```

**关键规则**：harness 不盲目信任 Agent 的 `finish`。如果客观反馈信号表明任务未完成，harness 会**拦截 `finish` 动作**并将矛盾信息回灌给 LLM。

**第二层：Agent 宣告失败**

```
Agent: finish { success: false, summary: "无法完成任务：项目使用 Jest 但未安装 @types/jest，类型检查持续报错" }
```

用户看到：

```
❌ 任务失败（第 5 轮）
   Agent 报告: 无法完成任务：项目使用 Jest 但未安装 @types/jest，类型检查持续报错

   已修改文件:
    - src/user.test.ts (部分完成)

   建议:
    - 手动安装 @types/jest 后重试: npm install -D @types/jest
    - 或修改任务范围，跳过类型检查

   提示: 部分修改已保留。如需回滚，使用:
     codeharness rollback
```

**第三层：用户强制结束**

用户按 `Ctrl+C` 两次（第一次优雅退出，第二次强制）或达到 `auto_fix_rounds` 上限时触发。

```
⚠️ 任务已终止（达到最大修正轮数: 3）
   最后状态: 测试 2/5 通过, Lint 3 错误

   是否保留已修改的文件？
   [Y] 保留修改  [N] 回滚所有修改  [R] 查看修改详情
```

---

## 四、LLM 调用策略

### Q3.9 速率限制与重试

| 问题 | 决策 |
|------|------|
| **自动重试** | ✅ 是。最多 **3 次**，使用**指数退避 + 抖动** |
| **退避策略** | 第 1 次重试: 1s + jitter(±0.5s)；第 2 次重试: 2s + jitter；第 3 次重试: 4s + jitter。从 `Retry-After` 响应头读取服务端建议等待时间优先 |
| **进度展示** | ✅ 显示："API 限流 (429)，1s 后重试...（第 1/3 次）" |
| **本地速率限制** | ❌ MVP 不做令牌桶。理由：CodeHarness 的调用模式是"同步串行"（每轮最多 1 次 LLM 调用），天然不会触发 RPM 限制（每分钟最多 3-5 次调用）。TPM 限制由上下文窗口预算管理解决 |
| **3 次重试均失败** | Agent 进入**暂停状态**，保存当前进度（中断状态 JSON），提示用户："API 不可用：{错误详情}。进度已保存，稍后可用 `codeharness resume` 恢复。或按 R 立即重试。" |

```typescript
async function callLLMWithRetry(
  provider: LLMProvider,
  messages: Message[],
  options: ChatOptions,
  maxRetries = 3
): Promise<ChatResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await provider.chat(messages, options);
    } catch (err) {
      if (attempt >= maxRetries) throw err; // 用完重试次数

      if (isRateLimitError(err)) {
        const retryAfter = err.headers?.['retry-after']
          ? parseInt(err.headers['retry-after']) * 1000
          : Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(`⏳ API 限流，${Math.round(retryAfter / 1000)}s 后重试...（第 ${attempt + 1}/${maxRetries} 次）`);
        await sleep(retryAfter);
      } else if (isNetworkError(err)) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`🌐 网络错误，${Math.round(delay / 1000)}s 后重试...（第 ${attempt + 1}/${maxRetries} 次）`);
        await sleep(delay);
      } else {
        throw err; // 非可重试错误（如 401），直接抛出
      }
    }
  }
}
```

---

### Q3.10 Token 成本追踪

| 问题 | 决策 |
|------|------|
| **任务后展示** | ✅ 展示。格式：`Token 用量: 12,345 tokens (输入: 10,200 + 输出: 2,145) · 估算成本: ~$0.06 (GPT-4o)` |
| **预算上限** | ✅ 支持 `--max-cost 0.50`（美元）。达到上限时优雅终止："已达到成本上限 $0.50，任务中止。已修改文件已保留。" 成本通过 token 数 * 单价估算 |
| **审计日志记录** | ✅ 每次 LLM 调用记录：时间戳、模型、输入/输出 token 数、估算成本、耗时 |
| **价格表维护** | 硬编码在 `src/utils/pricing.ts` 中，作为静态配置。定期更新（PR 驱动）。MVP 覆盖：GPT-4o ($2.50/$10.00 per 1M input/output)、GPT-4o-mini ($0.15/$0.60)、Claude Sonnet ($3.00/$15.00)、Claude Haiku ($0.25/$1.25)。Ollama 本地模型成本为 $0 |

```typescript
// src/utils/pricing.ts
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model];
  if (!price) return 0; // 未知模型不估算
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}
```

---

### Q3.11 模型降级策略

**支持自动降级。在 `.codeharness.yaml` 中配置降级链：**

```yaml
llm:
  provider: openai
  model: gpt-4o
  fallbacks:
    - provider: anthropic
      model: claude-sonnet-4-20250514
    - provider: ollama
      model: qwen2.5-coder:14b
```

**降级行为**：

```
主模型 (gpt-4o) → 调用失败（非 4xx 错误）
  ⚠️ 主模型不可用，切换到 Anthropic Claude Sonnet...
  → 调用成功（以降级模型继续当前任务所有后续轮次）
```

| 降级规则 | 说明 |
|---------|------|
| **降级触发条件** | 网络错误、5xx 服务端错误、超时。**4xx 客户端错误不降级**（API Key 无效等问题不会因为换供应商而解决） |
| **降级通知** | ✅ 打印提示 + 说明切换原因 |
| **降级后行为调整** | 自动：重新计算上下文预算（不同模型窗口不同）；不自动：不改变工具定义或 prompt |
| **是否回升** | ❌ 不在同一任务中回升。一旦降级就保持降级模型，避免来回切换 |
| **全部不可用** | 三个都失败 → 进入暂停状态，保存进度，提示用户 |

**实现**：

```typescript
class LLMProviderChain {
  private providers: LLMProvider[];
  private currentIndex = 0;

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    for (let i = this.currentIndex; i < this.providers.length; i++) {
      try {
        const response = await this.providers[i].chat(messages, options);
        if (i > this.currentIndex) {
          console.log(`⚠️ 已切换到备用模型: ${this.providers[i].name}`);
          this.currentIndex = i;
        }
        return response;
      } catch (err) {
        if (isRetryableError(err) && i < this.providers.length - 1) {
          console.log(`⚠️ ${this.providers[i].name} 不可用: ${err.message}`);
          continue; // 尝试下一个
        }
        throw err; // 最后一个也失败了
      }
    }
    throw new Error('所有 LLM 供应商均不可用');
  }
}
```

---

## 五、测试策略

### Q3.12 Harness 自身的测试策略

| 测试类型 | 是否纳入 | 测什么 |
|----------|---------|--------|
| **单元测试（mock LLM）** | ✅ 已定 | 护栏模式匹配、路径围栏、HITL 状态机、反馈收集器、动作解析器、上下文构建器、偏离检测、配置合并、Diff 追踪器、Token 估算、成本计算 |
| **集成测试** | ✅ 纳入 | 完整流程："用户输入 → 主循环（mock LLM）→ 工具分发 → 护栏 → 反馈收集 → 停机"。验证：正常完成任务、护栏拦截后调整、测试失败后修正、达到最大轮数停机、配置驱动的行为差异 |
| **CLI 端到端测试** | ✅ 纳入（最小集） | 实际执行 `node dist/index.js --mock "任务"`，验证退出码、stdout 包含关键信息。仅测试 happy path + 配置错误场景。不测交互式审批（需要模拟 TTY，复杂度高） |
| **跨平台测试** | ⚠️ CI 矩阵 | GitHub Actions 三平台矩阵（ubuntu-latest, macos-latest, windows-latest）。只运行单元测试+集成测试，不做 CLI E2E |
| **性能测试** | ❌ 不纳入 | MVP 不做。护栏检测是正则匹配（<1ms），无需性能测试 |
| **安全测试** | ⚠️ 模糊测试 | 对护栏模式匹配器做简单的模糊测试：随机字符串输入 → 不应崩溃、不应产生假阳性/假阴性。手动构造边界测试用例 |

**集成测试示例（关键场景）**：

```typescript
describe('Agent 主循环集成测试', () => {
  it('应该正常完成一个简单任务', async () => {
    const mockLLM = new MockLLMProvider([
      // 第1轮: 写文件
      { match: /添加/, response: writeFileAction('src/hello.ts', 'export const hello = () => "hi";') },
      // 第2轮: 完成
      { match: /通过/, response: finishAction(true, '完成') },
    ]);

    const agent = new AgentLoop({ llm: mockLLM, workspaceRoot: tmpDir });
    const result = await agent.run('添加 hello 函数');

    expect(result.success).toBe(true);
    expect(result.rounds).toBe(2);
    expect(fs.readFileSync('src/hello.ts', 'utf-8')).toContain('hello');
  });

  it('护栏拦截后应调整策略', async () => {
    const mockLLM = new MockLLMProvider([
      { response: runCommandAction('rm -rf /') },
      // 收到拒绝反馈后换方案
      { match: /拒绝/, response: finishAction(false, '无法执行危险命令') },
    ]);

    const agent = new AgentLoop({ llm: mockLLM });
    const result = await agent.run('清理系统');

    expect(result.success).toBe(false);
    // 验证审计日志记录了拦截
    expect(auditLogger.getLast()).toMatchObject({ blocked: true });
  });
});
```

---

### Q3.13 测试覆盖率目标

| 问题 | 决策 |
|------|------|
| **整体覆盖率** | **≥ 80%** 语句覆盖率（核心模块），通过 `c8` 或 `istanbul` 收集 |
| **核心模块定义** | `src/core/`、`src/guardrails/`、`src/feedback/`、`src/tools/`（不含类型定义文件）。具体：`agent-loop.ts`、`context-builder.ts`、`drift-detector.ts`、`guardrail.ts`、`pattern-registry.ts`、`hitl.ts`、`boundary-check.ts`、`collector.ts`、`diff-tracker.ts`、`action-parser.ts`、`file-ops.ts`、`command-runner.ts`、`loader.ts`（配置） |
| **豁免文件** | `src/index.ts`（CLI 入口，薄层，通过 E2E 覆盖）、`src/cli/setup-wizard.ts`（交互式向导，难以自动化测试）、所有纯类型定义文件（`*.d.ts`、只含 interface/type 的文件）、`src/utils/pricing.ts`（纯数据） |
| **CI 强制** | ✅ 加入 CI。`pnpm test -- --coverage` → 不达标则 CI 失败（`check-coverage` 标志） |

**覆盖率配置（`.c8rc.json`）**：

```json
{
  "include": ["src/**/*.ts"],
  "exclude": [
    "src/index.ts",
    "src/cli/setup-wizard.ts",
    "src/**/*.d.ts",
    "src/utils/pricing.ts"
  ],
  "reporter": ["text", "lcov"],
  "lines": 80,
  "functions": 80,
  "branches": 75,
  "statements": 80
}
```

---

## 六、可观测性

### Q3.14 日志与调试

| 日志类型 | 内容 | 存储位置 | 日志级别 |
|----------|------|---------|---------|
| **审计日志** | 所有动作 + 护栏结果 + 审批结果 + LLM 调用摘要 | `~/.codeharness/logs/audit/{date}.jsonl` | 始终记录（不可关闭） |
| **运行日志** | 任务开始/结束、每轮摘要、错误恢复、降级事件 | `~/.codeharness/logs/runtime/{date}.log` | `INFO`（默认） |
| **调试日志** | 完整 LLM 请求/响应、上下文构建细节、token 估算过程、护栏匹配细节 | `~/.codeharness/logs/debug/{date}.log` | `DEBUG`（`--log-level debug` 开启） |
| **LLM 调用日志** | 每次 LLM 调用的完整请求/响应（截断超长内容） | 合入调试日志 | `DEBUG` |

**日志格式**：**JSON 行（JSONL）**。每行一个 JSON 对象。便于用 `jq`、`grep` 等工具分析。也适合导入 ELK/Datadog 等外部系统。

```jsonl
{"time":"2026-07-07T14:30:01.123Z","level":"INFO","event":"task.start","task":"给 UserService 添加单元测试","session":"abc123"}
{"time":"2026-07-07T14:30:05.456Z","level":"INFO","event":"action.execute","action":"write_file","path":"src/user.test.ts","riskLevel":"safe","duration":12}
{"time":"2026-07-07T14:30:08.789Z","level":"INFO","event":"feedback.result","source":"test","passed":false,"total":5,"passed":2,"duration":3234}
```

**日志轮转**：

| 规则 | 配置 |
|------|------|
| 按大小轮转 | 单文件最大 10 MB |
| 按时间保留 | 保留最近 **7 天** |
| 最大文件数 | 每种日志类型最多 10 个轮转文件 |
| 实现方式 | 使用 `pino` 日志库（内建轮转 + JSONL 支持） |

**日志级别控制**：

```
$ codeharness "任务"                      # 默认 INFO
$ codeharness --log-level debug "任务"     # DEBUG（含完整 LLM 请求/响应）
$ codeharness --log-level silent "任务"    # 仅审计日志，不输出运行日志
$ codeharness --quiet "任务"              # 非交互模式下抑制终端输出
```

---

### Q3.15 进度指示

**交互模式下的终端输出设计**：

```
⚙ CodeHarness v0.1.0
📁 Workspace: /home/user/projects/myapp
🤖 Model: GPT-4o (OpenAI)
💰 预算: 无上限

第 1/10 轮  [░░░░░░░░░░░░░░░░░░░░]  0%  ⏱ 0.0s
  → 读取 src/user.ts...                  ✓ (120ms)
  → 读取 src/user.test.ts...             ✓ (95ms)

第 2/10 轮  [████░░░░░░░░░░░░░░░░]  20%  ⏱ 2.3s
  → 修改 src/user.test.ts...             ✓ (45ms)
  → 运行 npm test...                     ⠋ 正在运行...
     ✓ should create user
     ✓ should find user by id
     ✗ should hash password
  → 2/3 通过 ❌                           (3.2s)

第 3/10 轮  [████████░░░░░░░░░░░░]  30%  ⏱ 8.1s
  → 修改 src/user.ts...                  ✓ (32ms)
  → 运行 npm test...                     ⠋ 正在运行...
     ✓ should create user
     ✓ should find user by id
     ✓ should hash password
  → 3/3 通过 ✅                           (2.8s)

✅ 任务完成！
   总轮数: 3 | 总耗时: 12.4s
   Token: 4,231 (~$0.02)
   修改: src/user.test.ts (+120 lines), src/user.ts (+15 lines)
```

**关键设计**：

- **进度条**："第 N/M 轮"（M = `auto_fix_rounds` + 2，预留弹性），而非百分比（因为不知道确切的结束轮数）
- **每轮耗时**：在轮次行末显示
- **动作状态**：`✓` 完成、`✗` 失败、`⚠` 被拦截、`⏳` 审批中、`⠋` 进行中（spinner）
- **非交互模式**：全静默，只有最终结果 JSON 输出到 stdout

---

## 七、分发与安装体验

### Q3.16 首次运行体验（First-Run Experience）

```
$ npm install -g codeharness
$ codeharness "给 UserService 添加单元测试"

┌─────────────────────────────────────────────────────────┐
│           🚀 欢迎使用 CodeHarness！                      │
│                                                         │
│   这是你的首次运行。CodeHarness 需要 LLM API 来工作。     │
│   你的 API Key 将安全存储在本机，绝不会上传。             │
│                                                         │
│   选择 LLM 供应商：                                      │
│     [1] OpenAI (GPT-4o, GPT-4o-mini)                    │
│     [2] Anthropic (Claude Sonnet, Claude Haiku)          │
│     [3] Ollama (本地模型)                                │
│     [4] 跳过，稍后配置                                   │
│                                                         │
│   请输入数字 (1-4): 1                                    │
│                                                         │
│   OpenAI API Key: ●●●●●●●●●●●●●●●●●●●●                  │
│   （输入不会显示在屏幕上）                                │
│                                                         │
│   API Key 已保存到 Windows 凭据管理器。                   │
│   正在验证 Key 有效性... ✓ 通过                          │
│                                                         │
│   默认模型: GPT-4o                                       │
│   是否创建默认配置文件 (C:\Users\you\.codeharness\        │
│   config.yaml)？ [Y/n] y                                │
│   ✓ 已创建                                               │
│                                                         │
│   ─────────────────────────────────────────────         │
│   快速入门:                                              │
│     codeharness "你的任务描述"    执行编码任务             │
│     codeharness --dry-run "任务"  仅预览计划              │
│     codeharness setup            重新配置                │
│     codeharness --help           查看帮助                │
│   ─────────────────────────────────────────────         │
│                                                         │
│   现在开始执行你的第一个任务？[Y/n] y                     │
└─────────────────────────────────────────────────────────┘

⚙ 正在分析项目...
```

**首次运行流程详细步骤**：

1. 检测 `~/.codeharness/config.yaml` 不存在 → 触发向导
2. 检测所有已知供应商的 API Key 环境变量 → 如已设置则跳过对应步骤
3. 引导选择供应商
4. 隐藏输入 API Key（使用 Node.js `readline` 的 `stdin.setRawMode(true)` + 逐字符 `*` 回显或完全无回显）
5. 存储到 OS 凭据管理器（Windows Credential Manager / macOS Keychain / Linux `secret-tool`，使用 `keytar` 包）
6. 验证 Key：调用供应商的廉价 API（如 OpenAI 的 `list models`），确认返回 200
7. 生成默认配置文件
8. 展示快速入门
9. 询问是否继续执行原始任务

**验证失败处理**：

```
❌ API Key 验证失败 (401 Unauthorized)
   请检查 Key 是否正确，或访问 https://platform.openai.com/api-keys 重新生成。

   [R] 重新输入  [C] 更换供应商  [Q] 退出
```

---

### Q3.17 版本管理与升级

| 问题 | 决策 |
|------|------|
| **新版本通知** | 启动时异步检查 npm registry（`npm view codeharness version`），如有新版本打印提示："🆕 CodeHarness v0.2.0 可用（当前 v0.1.0）。运行 `npm update -g codeharness` 升级。" 超时 3s 则静默跳过（不影响启动速度） |
| **配置文件迁移** | 配置文件包含 `version: 1` 字段。启动时如果检测到旧版本格式，自动迁移：`v0 → v1` 脚本在代码中维护。迁移前备份原文件为 `.codeharness.yaml.bak`。迁移后打印变更摘要 |
| **Node.js 版本检查** | 启动时检查 `process.version`，要求 **≥ 18.0.0**。不满足则打印："CodeHarness 需要 Node.js 18+。当前版本: v16.20.0。请升级 Node.js：https://nodejs.org/"，退出码 10 |
| **--version / --help** | ✅ 支持。`codeharness --version` → `CodeHarness v0.1.0 (Node.js v20.10.0, win32-x64)`；`codeharness --help` → 完整帮助文本（用 commander 自动生成） |

**版本检查逻辑**：

```typescript
async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const result = await execAsync('npm view codeharness version', { timeout: 3000 });
    const latest = result.stdout.trim();
    if (semver.gt(latest, currentVersion)) {
      console.log(`\n🆕 CodeHarness v${latest} 可用（当前 v${currentVersion}）`);
      console.log(`   升级: npm update -g codeharness\n`);
    }
  } catch {
    // 静默跳过（网络不可用或 npm 未安装）
  }
}
```

---

## 八、边界情况补充

### Q3.18 超大项目的处理

| 场景 | 处理方式 |
|------|---------|
| 10 万个文件，`list_dir`/`search_file` 输出巨大 | **硬限制 + 截断 + 提示**。`list_dir` 单次最多返回 500 个条目，超出则截断并提示 `... 以及 99,500 个文件（已截断）。使用 search_file 按模式过滤。`。`search_file` 最多返回 200 个匹配，截断时提示更具体的 glob 模式建议 |
| 单个文件 50MB，`read_file` | **硬限制**。超过 1MB 的文件拒绝全量读取，返回错误：`文件过大 (50MB > 1MB 限制)。请使用 startLine/endLine 参数分段读取，或用 grep 搜索特定内容。` Agent 会学习使用分段读取 |
| `grep` 返回 10 万行 | **硬限制 500 行**。超出截断并提示：`... 以及 99,500 条结果（已截断）。尝试更精确的搜索词或限定路径。` |
| `node_modules` 50GB | **自动排除**。文件搜索和 grep 默认排除 `node_modules`、`.git`、`dist`、`build`、`__pycache__`、`.venv`、`vendor` 等常见依赖目录。用户可在配置中追加排除列表 |

**默认排除目录**：

```typescript
const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  'vendor',
  '.cache',
  'coverage',
  '.nyc_output',
];
```

---

### Q3.19 用户输入的边界情况

| 场景 | 处理方式 |
|------|---------|
| 空输入 `codeharness ""` | 打印帮助提示："请输入任务描述。示例：codeharness '添加用户认证模块'" → 退出码 1 |
| 非 ASCII 字符（中文、emoji） | **完全支持**。Node.js 原生支持 UTF-8。`codeharness "给 UserService 添加单元测试 🧪"` 正常处理。任务描述原样注入 LLM 上下文 |
| Shell 特殊字符（`$`、`\`、`` ` ``） | 用户应在 shell 中用单引号包裹：`codeharness '修改 $PATH 配置'`。文档中明确说明。如果用户用双引号导致变量展开，那是 shell 的行为，CodeHarness 收到的已经是展开后的值 |
| 极长输入（5000 字） | **不做限制**。任务描述作为首轮 user message 的一部分注入。如果任务描述本身占用大量 token，上下文预算管理会自动压缩历史对话腾出空间。但在任务开始时打印提示："任务描述较长（约 {N} tokens），可能影响可用上下文空间。" |
| 无意义输入（"asdfghjkl"） | **不做判断**。直接交给 LLM。LLM 大概率返回 `ask_user { question: "无法理解你的任务'asdfghjkl'，请重新描述。" }`。不做客户端校验的原因是"无意义"的判定本身需要语义理解 |

---

### Q3.20 Agent 自主权限的边界

| 场景 | 自主执行 | 需询问 | 理由 |
|------|---------|--------|------|
| 选择使用哪个 npm 包 | ✅ | | 技术选型是 Agent 的职责，用户关注的是结果（测试通过），不是中间选择。但如果包是新的依赖（不在 `package.json` 中），安装前需审批 |
| 修改函数签名 | | ✅ | 可能影响其他调用方，Agent 不一定有全局视野。使用 `ask_user` 说明旧签名→新签名及影响范围 |
| 删除"没用"的文件 | | ✅ | "没用"的判断可能是错误的（动态引用、约定文件等）。Agent 需先用 `ask_user` 确认 |
| 添加新项目依赖 | | ✅ | `npm install` 触发护栏审批（安装新包 = caution 级）。即使审批通过，也建议 Agent 先说明为什么需要这个依赖 |
| 修改已有测试用例 | | ✅ | 已有测试是用户意图的编码表达。Agent 不应擅自修改，应用 `ask_user` 说明为什么需要改 |
| 重构代码结构 | | ✅ | 移动/重命名文件影响范围广，Agent 应用 `ask_user` 说明重构计划和理由 |
| 多方案选择 | ✅ | | 在满足任务目标的前提下，Agent 自主选择技术方案。只有方案选择会影响外部接口/用户体验时才询问 |

**关键原则**：

> Agent 可以自主决定"怎么做"（how），但涉及"做什么"（what）或"改变既有意图"时要询问用户。

---

## 九、反思与元问题

### Q3.21 前三轮 Brainstorming 的反思

**已覆盖的维度**（✅ 充分）：

1. 项目定位、用户、场景 —— Q1/Q2（第一轮）
2. 技术选型与理由 —— Q3/Q4（第一轮）
3. 核心机制（工具/反馈/护栏/记忆）—— Q5-Q8（第一轮）
4. 交互模式与配置 —— Q9/Q10（第一轮）
5. 分发与命名 —— Q11/Q12（第一轮）
6. 风险预判 —— Q13（第一轮）
7. HITL 状态机深度设计 —— Q2.2/Q2.3（第二轮）
8. 反馈闭环细节 —— Q2.4/Q2.5（第二轮）
9. 工具边界与原子性 —— Q2.6-Q2.8（第二轮）
10. LLM 适配层 —— Q2.9/Q2.10（第二轮）
11. 记忆与上下文管理 —— Q2.11/Q2.12（第二轮）
12. 错误处理与中断恢复 —— Q2.13/Q2.14（第二轮）
13. 配置与机制演示 —— Q2.15/Q2.16（第二轮）
14. 系统提示与目标漂移 —— Q3.1/Q3.2（第三轮）
15. 运行时体验 —— Q3.6-Q3.8（第三轮）
16. LLM 调用策略 —— Q3.9-Q3.11（第三轮）
17. 测试策略 —— Q3.12/Q3.13（第三轮）
18. 可观测性 —— Q3.14/Q3.15（第三轮）
19. 安装体验 —— Q3.16/Q3.17（第三轮）
20. 边界情况 —— Q3.18-Q3.20（第三轮）

**我认为还应该讨论但尚未被问到的问题**：

1. **凭据安全存储的具体实现**：虽然已多次提到"OS 凭据管理器"，但具体使用哪个 Node.js 库（`keytar` vs `safeStorage`）？不同操作系统的 fallback 策略是什么？

2. **国际化（i18n）**：CLI 输出是否只支持英文？是否需要中文？如果需要，提示语和系统提示的翻译如何管理？

3. **自举（Dogfooding）**：是否计划用 `codeharness` 来开发 `codeharness` 自身？这在文档中提到"用一个 harness 造另一个 harness"，但在具体开发过程中如何操作？

4. **退出码与 CI/CD 的集成**：如何在 GitHub Actions 等 CI 环境中正确使用 `codeharness`（非交互模式 + 退出码映射）？

---

### Q3.22 对 SPEC 冻结的承诺

**修改 SPEC 的级别判定**：

| 缺陷级别 | 示例 | 允许修改 SPEC？ |
|----------|------|----------------|
| **P0 - 安全漏洞** | 凭据通过日志泄露；护栏可被特定输入绕过 | ✅ 必须修改，阻塞发布 |
| **P1 - 功能缺失** | 忘记设计某个必需的错误处理分支；缺失对某供应商的支持导致无法使用 | ✅ 允许修改，需更新 PLAN |
| **P2 - 设计矛盾** | SPEC 两处描述不一致；接口定义冲突 | ✅ 允许修改，优先澄清 |
| **P3 - 体验优化** | spinner 动画不够流畅；日志格式调整 | ❌ 冻结后不改，记录为 v0.2 需求 |
| **P4 - 美好愿望** | "如果再加上 X 功能会更好" | ❌ 冻结后不改，记录为未来需求 |

**修改 SPEC 的流程**：

```
1. 在 SPEC.md 末尾的「变更历史」中记录：
   - 日期、版本号变更（如 v1.0 → v1.1）
   - 变更原因（P0/P1/P2）
   - 变更内容摘要
   - 受影响的 SPEC 章节

2. 评估对 PLAN.md 的影响：
   - 受影响的 task 标记为「需修改」
   - 新增 task 追加到 PLAN 末尾
   - 更新 task 依赖关系

3. 对已完成的 task：
   - 如果变更影响已完成代码 → 创建新的 fix task
   - 如果变更不影响已完成代码 → 仅更新后续 task

4. 在 AGENT_LOG.md 中记录变更决策
```

**SPEC 变更历史格式**：

```markdown
## 变更历史

| 版本 | 日期 | 变更类型 | 原因 | 受影响章节 | 受影响 Task |
|------|------|---------|------|-----------|------------|
| 1.0 | 2026-07-08 | - | 初始冻结 | 全部 | - |
| 1.1 | 2026-07-12 | P2 设计矛盾 | 反馈收集顺序与依赖短路不一致 | §4.3 反馈闭环 | T7.2 |
| 1.2 | 2026-07-15 | P1 功能缺失 | 缺少 Ctrl+C 第二次按下的强制退出行为 | §5.8 中断处理 | T8.3, T10.1 |
```

---

## 总结：第三轮关键增量决策

| 领域 | 新增决策 |
|------|---------|
| **系统提示** | 完整草稿框架：角色 + 工具表 + 行为规则 + 反馈处理 + 禁止事项 |
| **目标漂移** | 三层防护：上下文注入原始任务 + 代码级偏离检测（低/高风险分级响应） |
| **多语言支持** | 完全配置驱动，不为任何语言硬编码。Monorepo 不自动处理 |
| **开发工具链** | pnpm + ES2022 + Node 18+ + ESLint/Prettier + feature 分支 PR |
| **Dry-Run** | 支持，只读操作执行 + 写操作仅记录计划 |
| **Finish 拦截** | 测试未通过时拦截 Agent 的 `finish { success: true }` |
| **LLM 重试** | 指数退避 3 次，429 读取 Retry-After 头 |
| **成本追踪** | 每次展示 token/成本，支持 `--max-cost` 预算上限 |
| **模型降级** | 支持降级链配置，4xx 不降级，同任务不回升 |
| **测试层级** | 单元 + 集成 + CLI E2E（最小集）+ CI 三平台矩阵 |
| **覆盖率** | 核心模块 ≥ 80%，CI 强制检查 |
| **日志体系** | JSONL 格式，审计(始终)/运行(INFO)/调试(DEBUG)，pino + 7 天轮转 |
| **进度指示** | 轮次 + 动作状态图标 + 实时透传 + 非交互全静默 |
| **首次运行** | 完整向导：供应商选择 → Key 隐藏输入 → 验证 → 生成配置 → 快速入门 |
| **版本管理** | 启动时异步检查 + 配置文件 version 字段 + Node 18 最低要求 |
| **超大项目** | 硬限制各操作的输出量 + 默认排除 node_modules/.git 等 |
| **自主权限边界** | "怎么做"自主，"做什么"或"改既有意图"需询问 |
| **SPEC 冻结** | P0/P1/P2 可改 + 变更历史 + PLAN 联动更新 |

三轮 brainstorming 共计覆盖 **55 个问题**，设计细节已充分展开，可以进入 SPEC.md 的撰写和代码实现阶段。
