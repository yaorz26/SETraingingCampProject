# CodeHarness 项目开发 Skill

> **角色**：本文档是 AI 编码智能体在 CodeHarness 项目中的行为准则。必须在每次执行任务前阅读并遵守。

---

## 核心原则

1. **PLAN.md 和 SPEC.md 是唯一权威来源**。任何实现决策必须能追溯到 SPEC.md 的设计描述或 PLAN.md 的任务定义。
2. **先理解，再编码**。遇到不明确的地方，先查阅 SPEC.md 对应章节，而非自行假设。
3. **变更需双向同步**。对 PLAN 或 SPEC 的任何修改必须经过用户二次确认，并同步更新两份文档。

---

## 工作流程

### 1. 任务执行前

- 阅读 `docs/PLAN/PLAN.md` 中对应任务的完整描述（目标、涉及文件、实现要点、验证步骤）
- 阅读 `docs/SPEC/SPEC.md` 中与当前任务相关的设计章节
- 确认当前任务的所有依赖任务已完成（参考 PLAN.md 中的依赖关系图）

### 2. 任务执行中

- 严格按照 PLAN.md 中 Task 的"实现要点"逐条实现
- 遵循 SPEC.md 中定义的数据模型（§6.1-§6.3）、接口定义、行为规则
- 使用 TDD 流程：先写失败的测试（红），再写最小实现（绿），最后重构
- 所有核心模块必须可脱离 LLM 进行单元测试（使用 MockLLMProvider）
- 不修改超出当前 Task 涉及文件范围的文件

### 3. 任务完成后

- 运行 `npm test` 确认所有测试通过
- 运行 `npx tsc --noEmit` 确认编译通过
- **在 PLAN.md 中将已完成 Task 的标题标记为已完成**（在标题前添加 `[x]` 或 `✅` 标记）
- 例如：`### T1.1 — 工作区根目录检测 [P]` → `### ✅ T1.1 — 工作区根目录检测 [P]`

### 4. 用户提出修改意见时

#### 情况 A：修改意见与 PLAN/SPEC 一致
- 直接执行修改
- 无需额外确认

#### 情况 B：修改意见与 PLAN/SPEC 不符
- **立即明确告知用户**：指出具体冲突点，引用 SPEC.md 或 PLAN.md 中的原文
- **寻求用户二次确认**：提供清晰的选择方案
  - 选项 1：坚持修改 → 同步更新 SPEC.md 和 PLAN.md → 执行修改
  - 选项 2：放弃修改 → 按原 PLAN/SPEC 继续执行
  - 选项 3：仅修改当前实现，不更新 SPEC/PLAN（需用户明确说明理由）
- **用户确认后**：
  - 若选择选项 1：先更新 SPEC.md 相关章节，再更新 PLAN.md 相关任务，最后执行代码修改
  - 若选择选项 2：按原计划继续
  - 若选择选项 3：仅执行代码修改，在修改处添加注释标记"与 SPEC 不一致"

---

## 冲突检查清单

当用户提出修改意见时，按以下清单逐项检查：

| 检查项 | 对应的 SPEC/PLAN 章节 |
|--------|----------------------|
| 动作类型是否匹配 | SPEC §3.5.1（17 种工具）、PLAN T3.1 |
| 数据模型是否匹配 | SPEC §6.1-§6.3（TypeScript 接口定义） |
| 护栏层级是否匹配 | SPEC §3.2（五层护栏）、PLAN T4.1-T4.5 |
| 反馈信号是否匹配 | SPEC §3.4（5 种反馈信号）、PLAN T5.1-T5.2 |
| 上下文构建是否匹配 | SPEC §3.10（上下文与记忆）、PLAN T6.1-T6.3 |
| 配置结构是否匹配 | SPEC §6.3（配置文件结构）、PLAN T7.1-T7.2 |
| CLI 命令是否匹配 | SPEC §3.11（CLI 设计）、PLAN T8.1-T8.4 |
| 退出码是否匹配 | SPEC §3.11.1（退出码定义）、PLAN T8.3 |
| 依赖关系是否满足 | PLAN 依赖关系图 |
| 测试覆盖率目标 | SPEC §10.2（覆盖率 ≥ 80%） |

---

## PLAN.md 任务标记规范

### 标记格式

已完成的任务在标题前添加 `✅` 标记：

```markdown
### ✅ T1.1 — 工作区根目录检测 [P]
```

未完成的任务保持原样：

```markdown
### T1.2 — Shell 命令执行器 [P]
```

### 标记时机

- 任务的"验证"步骤全部通过后，方可标记为已完成
- 并行任务 [P] 全部完成后，方可标记为已完成
- 集成测试通过后，方可标记对应的集成任务为已完成

---

## 禁止事项

1. **禁止跳过 TDD 流程**：不允许先写实现再补测试
2. **禁止修改 SPEC.md 或 PLAN.md 而不经用户确认**
3. **禁止在任务依赖未完成时开始后续任务**（标记为 [P] 的并行任务除外）
4. **禁止使用真实 LLM 进行单元测试**：所有单元测试必须使用 MockLLMProvider
5. **禁止忽略覆盖率要求**：低于 80% 覆盖率的代码不得标记任务为完成
6. **禁止修改豁免文件的范围**：`src/index.ts`、`src/cli/setup-wizard.ts`、`src/utils/pricing.ts`、`*.d.ts` 的豁免是固定的

---

## 参考速查

### 文件路径速查

| 模块 | 源文件路径 | 测试文件路径 |
|------|-----------|-------------|
| 工作区检测 | `src/utils/workspace.ts` | `tests/unit/utils/workspace.test.ts` |
| Shell 执行器 | `src/utils/shell.ts` | `tests/unit/utils/shell.test.ts` |
| 文件操作 | `src/tools/file-ops.ts` | `tests/unit/tools/file-ops.test.ts` |
| 凭据存储 | `src/utils/credential.ts` | `tests/unit/utils/credential.test.ts` |
| 日志系统 | `src/logging/audit-logger.ts` | `tests/unit/logging/audit-logger.test.ts` |
| LLM Provider | `src/llm/provider.ts` | `tests/unit/llm/provider.test.ts` |
| Mock LLM | `src/llm/mock-provider.ts` | `tests/unit/llm/mock-provider.test.ts` |
| 动作解析 | `src/core/action-parser.ts` | `tests/unit/core/action-parser.test.ts` |
| 动作分发 | `src/core/action-dispatcher.ts` | `tests/unit/core/action-dispatcher.test.ts` |
| 停机检测 | `src/core/stop-detector.ts` | `tests/unit/core/stop-detector.test.ts` |
| 漂移检测 | `src/core/drift-detector.ts` | `tests/unit/core/drift-detector.test.ts` |
| Finish 拦截 | `src/core/finish-interceptor.ts` | `tests/unit/core/finish-interceptor.test.ts` |
| Agent 主循环 | `src/core/agent-loop.ts` | `tests/unit/core/agent-loop.test.ts` |
| 上下文构建 | `src/core/context-builder.ts` | `tests/unit/core/context-builder.test.ts` |
| 危险模式 | `src/guardrails/pattern-registry.ts` | `tests/unit/guardrails/pattern-registry.test.ts` |
| 路径围栏 | `src/guardrails/boundary-check.ts` | `tests/unit/guardrails/boundary-check.test.ts` |
| 风险分级 | `src/guardrails/guardrail.ts` | `tests/unit/guardrails/guardrail.test.ts` |
| HITL 审批 | `src/guardrails/hitl.ts` | `tests/unit/guardrails/hitl.test.ts` |
| 护栏流水线 | `src/guardrails/pipeline.ts` | `tests/unit/guardrails/pipeline.test.ts` |
| Diff 追踪 | `src/feedback/diff-tracker.ts` | `tests/unit/feedback/diff-tracker.test.ts` |
| 反馈收集 | `src/feedback/collector.ts` | `tests/unit/feedback/collector.test.ts` |
| Token 计数器 | `src/utils/token-counter.ts` | `tests/unit/utils/token-counter.test.ts` |
| 记忆管理 | `src/memory/memory-store.ts` | `tests/unit/memory/memory-store.test.ts` |
| 配置 Schema | `src/config/schema.ts` | `tests/unit/config/schema.test.ts` |
| 配置加载 | `src/config/loader.ts` | `tests/unit/config/loader.test.ts` |
| 价格表 | `src/utils/pricing.ts` | 豁免覆盖率 |
| 成本追踪 | `src/utils/cost-tracker.ts` | `tests/unit/utils/cost-tracker.test.ts` |
| CLI 输出 | `src/cli/output.ts` | `tests/unit/cli/output.test.ts` |
| 首次运行向导 | `src/cli/setup-wizard.ts` | 豁免单元测试 |
| CLI 命令 | `src/cli/commands.ts` | `tests/unit/cli/commands.test.ts` |
| 版本检查 | `src/utils/version-check.ts` | `tests/unit/utils/version-check.test.ts` |
| 演示① | `tests/integration/demo1-guardrails.test.ts` | - |
| 演示② | `tests/integration/demo2-feedback.test.ts` | - |
| 演示③ | `tests/integration/demo3-governance.test.ts` | - |
| E2E 集成 | `tests/integration/e2e.test.ts` | - |
| CLI E2E | `tests/e2e/cli.test.ts` | - |

### 关键接口速查

| 接口 | 定义位置 | 用途 |
|------|---------|------|
| `LLMProvider` | SPEC §6.2 | LLM 统一抽象接口 |
| `Task` | SPEC §6.1 | 任务实体 |
| `Round` | SPEC §6.1 | 轮次实体 |
| `Action` | SPEC §3.5.1 | 12 种动作联合类型 |
| `GuardrailResult` | SPEC §6.1 | 护栏结果 |
| `ApprovalResult` | SPEC §6.1 | 审批结果 |
| `FeedbackResult` | SPEC §6.1 | 反馈结果 |
| `DriftCheckResult` | SPEC §6.1 | 偏离检测结果 |
| `FinishResult` | SPEC §6.1 | Finish 拦截结果 |
| `StopDecision` | SPEC §6.1 | 停机决定 |
| `Config` | SPEC §6.3 | 配置文件结构 |

### 覆盖率豁免清单

| 文件 | 原因 |
|------|------|
| `src/index.ts` | CLI 入口 |
| `src/cli/setup-wizard.ts` | 交互式向导 |
| `src/utils/pricing.ts` | 纯数据文件 |
| `*.d.ts` | 纯类型定义 |

### 覆盖率目标

| 指标 | 目标 |
|------|------|
| Lines | 80% |
| Functions | 80% |
| Branches | 75% |
| Statements | 80% |