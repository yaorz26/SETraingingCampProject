# CodeHarness — SPEC.md

> **项目名称**：CodeHarness  
> **一句话概括**：一个 CLI 工具，让开发者用自然语言描述编码任务，Agent 在受控沙箱内自动读写代码、执行命令、运行测试，根据确定性测试结果自我修正，在危险操作时暂停等待人工审批，直到任务完成。  
> **版本**：v2.0  
> **状态**：已确认（经三轮 brainstorming 后冻结）

---

## 目录

1. [问题陈述](#1-问题陈述)
2. [用户故事](#2-用户故事)
3. [功能规约](#3-功能规约)
   - 3.1 [Agent 主循环](#31-agent-主循环)
   - 3.2 [护栏系统](#32-护栏系统)
   - 3.3 [HITL 审批](#33-hitl-审批)
   - 3.4 [反馈闭环](#34-反馈闭环)
   - 3.5 [工具系统](#35-工具系统)
   - 3.6 [系统提示](#36-系统提示)
   - 3.7 [目标漂移防护](#37-目标漂移防护)
   - 3.8 [运行时用户体验](#38-运行时用户体验)
   - 3.9 [LLM 调用策略](#39-llm-调用策略)
   - 3.10 [记忆与上下文管理](#310-记忆与上下文管理)
   - 3.11 [错误处理](#311-错误处理)
4. [非功能性需求](#4-非功能性需求)
5. [系统架构](#5-系统架构)
6. [数据模型](#6-数据模型)
7. [领域与机制设计](#7-领域与机制设计)
8. [凭据与分发设计](#8-凭据与分发设计)
9. [技术选型与理由](#9-技术选型与理由)
10. [验收标准](#10-验收标准)
11. [风险与未决问题](#11-风险与未决问题)
12. [变更历史](#12-变更历史)

---

## 1. 问题陈述

### 1.1 要解决什么问题

独立开发者和小团队在日常编码中面临大量重复性、但需要小心处理的编码任务：给模块加单元测试、重构 service 层、迁移业务逻辑、修复 lint 错误等。现有 AI 编码助手（如 GitHub Copilot、Cursor）的定位是"内嵌在编辑器中的自动补全/聊天"，缺少以下能力：

- **自主执行**：不能自动执行命令、运行测试、根据反馈自我修正
- **安全护栏**：缺乏对危险操作（`rm -rf`、`git push --force`）的代码级拦截
- **客观反馈闭环**：依赖 LLM 的"自我判断"而非确定性校验器（测试结果、lint 输出）
- **可审计性**：无法追踪 Agent 每一步的决策和执行结果

### 1.2 目标用户

- **独立开发者**：需要一个人就能完成编码→测试→修正闭环
- **小团队开发者**：需要轻量、可控、可审计的 CLI 编码助手，无需复杂的 CI/CD 集成

### 1.3 为什么值得做

当 LLM 能完成大部分"思考"时，工程师的价值落在 harness 这层工程上：治理、反馈、上下文、安全、分发。CodeHarness 将"Agent = LLM + Harness"这一等式落地为可运行的代码，证明：

- 护栏不是提示词里的一句话，而是多层确定性代码
- 反馈不是让 LLM 自行检查，而是运行真实测试并解析结果
- 安全性不是靠"信任 LLM"，而是靠代码级拦截和人工审批

### 1.4 定位与边界

- **定位**：面向个人开发者的 CLI 编码助手，核心 harness 模块可作为库（SDK）被其他系统集成
- **目标规模**：单文件修改到中等规模多文件重构（如给模块加单元测试、重构 service 层、迁移业务逻辑）
- **不追求**："全自动开发整个项目"，而是在开发者的监督下完成明确边界内的编码任务

---

## 2. 用户故事

### US1 — 自然语言发起编码任务

> 作为一个开发者，我希望用自然语言描述一个编码任务，Agent 能理解我的意图并自动执行，这样我就能把精力放在更高层次的决策上。

**验收标准**：
- 在 CLI 中输入 `codeharness "给 UserService 添加单元测试"`，Agent 开始执行
- Agent 自动读取相关文件、生成/修改代码、运行测试
- 过程输出到终端，用户可实时观察进度

---

### US2 — 危险操作自动拦截并等待审批

> 作为一个开发者，我希望 Agent 在执行危险命令（如 `rm -rf`、`git push --force`）时自动暂停并等待我确认，这样我不会因为 Agent 的误操作而丢失数据或破坏仓库。

**验收标准**：
- 执行 `rm -rf ./node_modules` 时，CLI 显示危险警告并等待用户输入
- 用户可选择：允许本次 / 拒绝 / 允许所有同类操作 / 查看详情
- 拒绝后 Agent 收到"被拒绝"反馈，继续尝试其他方案
- 120 秒内无响应自动拒绝

---

### US3 — 测试失败后自动修正

> 作为一个开发者，我希望 Agent 在运行测试发现失败后，能自动分析失败原因并修正代码，而不是把失败的代码留给我手动修复。

**验收标准**：
- Agent 修改代码后自动运行测试
- 如果测试失败，失败信息被回灌给 LLM
- LLM 根据失败信息生成修正方案
- 最多自动修正 3 轮（可配置），超过后停机并输出失败报告

---

### US4 — 配置化的工作流

> 作为一个开发者，我希望通过配置文件声明测试命令、lint 命令、护栏规则等，而不是每次都在命令行中指定。

**验收标准**：
- 在项目根目录创建 `.codeharness.yaml`，配置测试命令、lint 命令、护栏规则
- Agent 启动时自动加载配置文件
- 配置缺失时使用合理默认值（测试命令留空则跳过测试步骤）

---

### US5 — 非交互模式

> 作为一个希望在 CI 流水线中运行 CodeHarness 的开发者，我希望它能以非交互模式运行，自动拒绝危险操作而不是等待人工输入。

**验收标准**：
- 支持 `--non-interactive` 标志
- 非交互模式下，危险操作根据 `danger_policy` 配置自动拒绝或跳过
- Agent 成功完成或失败后输出结构化结果（JSON 格式到 stdout）

---

### US6 — 多语言项目支持

> 作为一个开发者，我希望 CodeHarness 能用于任何语言的项目，而不仅仅是 TypeScript/Node.js。

**验收标准**：
- 在 Python 项目中，配置 `pytest` / `flake8` / `mypy` 后正常工作
- 在非 Git 项目中，工作区检测和 Diff 追踪降级为快照对比
- 命令配置完全由用户通过 `.codeharness.yaml` 指定，不硬编码任何语言特定命令

---

### US7 — 首次运行引导

> 作为一个首次使用 CodeHarness 的开发者，我希望有一个清晰的引导流程帮我完成配置，而不是阅读一堆文档。

**验收标准**：
- 首次运行自动触发向导
- 引导选择 LLM 供应商、输入 API Key、验证 Key 有效性
- 自动生成默认配置文件
- 展示快速入门提示
- 整个流程 < 5 分钟

---

### US8 — Dry-Run 模式

> 作为一个开发者，我希望在不实际修改文件的情况下预览 Agent 的计划，确认后再执行。

**验收标准**：
- 支持 `--dry-run` 标志
- Agent 只执行只读操作（读取文件、搜索），写操作仅记录到计划中
- 展示计划摘要，询问是否继续执行
- 确认后切换为正常模式执行

---

## 3. 功能规约

### 3.1 Agent 主循环

#### 3.1.1 循环流程

```
输入: 用户任务描述
  ↓
[1] 上下文构建
  ↓
[2] LLM 调用
  ↓
[3] 动作解析 (含重试)
  ↓
[4] 护栏检查 (L1→L2→L3→L4→L5)
  ↓
[5] 动作执行 (通过/已审批)
  ↓
[6] 反馈收集 (Diff → Lint → 类型检查 → 构建 → 测试)
  ↓
[7] 停机判断 (finish? / 最大轮数? / 连续相同修改? / 超时?)
  ↓
否 → 回到 [1]（回灌反馈）
是 → 输出结果
```

#### 3.1.2 停机条件

| 条件 | 触发逻辑 | 行为 |
|------|---------|------|
| finish 动作 | Agent 调用 `finish { success: true/false }` | 验证客观反馈信号（测试通过等），如不一致则拦截 |
| 最大轮数 | 达到 `auto_fix_rounds + 2` 轮 | 强制停机，输出当前状态 |
| 连续相同修改 | 连续 3 轮修改同一文件且内容完全相同 | 检测到"死循环"，停机并报告 |
| 全局超时 | 任务总耗时 > 配置的全局超时 | 优雅停机，保存进度 |
| 用户中断 | Ctrl+C | 优雅退出，保存备份 |

#### 3.1.3 任务完成判定（三层机制）

**第一层：Agent 主动调用 `finish`**

Harness 不盲目信任 Agent 的 `finish`。如果客观反馈信号表明任务未完成，harness 会**拦截 `finish` 动作**并将矛盾信息回灌给 LLM：

- Agent 声称成功但测试未通过 → 拦截，回灌："还有 N 个测试未通过，请修正"
- Agent 声称成功但 Diff 有意外修改 → 拦截，回灌："检测到意外文件修改: {列表}"

**第二层：Agent 宣告失败**

Agent 调用 `finish { success: false, summary: "..." }` 时，展示失败原因、已修改文件列表、建议操作（如安装缺失依赖、调整任务范围），并提示用户可用 `codeharness rollback` 回滚。

**第三层：用户强制结束**

用户按两次 Ctrl+C 或达到 `auto_fix_rounds` 上限 → 展示当前状态，询问是否保留已修改文件，可选择回滚所有修改。

---

### 3.2 护栏系统

#### 3.2.1 五层护栏架构

```
L1: 模式匹配 ────→ 硬拦截（不可审批）
L2: 路径围栏 ────→ 硬拦截（不可审批）
L3: 风险分级 ────→ 决定审批策略
L4: HITL 审批 ───→ 条件触发（caution 及以上）
L5: 审计日志 ────→ 始终执行
```

#### 3.2.2 危险模式分类

| 类别 | 示例 | 风险等级 |
|------|------|---------|
| FILE_DESTRUCTION | `rm -rf`、`del /f /s` | dangerous |
| FILE_DESTRUCTION_WORKSPACE | `rm ./src/old.ts` | caution |
| GIT_DESTRUCTIVE | `git push --force`、`git reset --hard` | dangerous |
| GIT_REWRITE_HISTORY | `git rebase`、`git commit --amend` | caution |
| PUBLISH | `npm publish`、`docker push` | dangerous |
| ARBITRARY_CODE | `curl \| bash`、`eval` | fatal |
| DATABASE_DESTRUCTIVE | `DROP TABLE`、`DELETE FROM ...` | fatal |
| PRIVILEGE_ESCALATION | `sudo`、`chmod 777` | fatal |

#### 3.2.3 路径围栏

- 工作区内操作 → 通过
- 工作区外操作 → 硬拦截（不可审批）
- 敏感路径（`/etc/passwd`、`~/.ssh`、`.env`、凭据文件）→ 硬拦截，即使在工作区内

#### 3.2.4 风险分级与审批策略

| 风险等级 | 审批策略 | 说明 |
|---------|---------|------|
| safe | 自动通过 | 无危险模式命中 + 工作区内 |
| caution | 可审批 | 低风险操作（如删除工作区内的文件） |
| dangerous | 必须审批 | 高风险操作（如 `rm -rf`、`git push --force`） |
| fatal | 硬拦截 | 不可审批（如工作区外操作、`curl \| bash`） |

---

### 3.3 HITL 审批

#### 3.3.1 状态机

```
                    ┌─────────┐
         ┌─────────→│  IDLE   │
         │          └────┬────┘
         │               │ 危险动作触发
         │               ▼
         │          ┌─────────┐
         │          │ AWAITING│
         │          │ _APPROVAL│
         │          └────┬────┘
         │               │
         │     ┌─────────┼─────────┐
         │     ▼         ▼         ▼
         │ ┌────────┐┌────────┐┌────────┐
         │ │APPROVED││ DENIED ││TIMED_OUT│
         │ └────┬───┘└────┬───┘└────┬───┘
         │      │         │         │
         │      │         ▼         ▼
         │      │     ┌──────────────┐
         │      │     │ 反馈回灌 LLM  │
         │      │     └──────┬───────┘
         │      │            │
         │      ▼            ▼
         │  ┌──────────────────┐
         └──│  回到 IDLE       │
            └──────────────────┘
```

#### 3.3.2 用户输入选项

| 选项 | 含义 |
|------|------|
| Y | 允许本次操作 |
| N | 拒绝本次操作 |
| A | 允许所有同类操作（会话级白名单） |
| S | 跳过（不执行该操作，继续下一轮） |

**超时**：120 秒无响应自动拒绝（TIMED_OUT）。

**会话白名单**：按危险类别记忆。如用户对 `FILE_DESTRUCTION` 按了 `A`，后续所有 `FILE_DESTRUCTION` 类操作自动通过。但不同类别仍需审批。白名单仅限当前会话，任务结束后清除。

---

### 3.4 反馈闭环

#### 3.4.1 反馈信号

| 信号 | 收集方式 | 确定性 |
|------|---------|--------|
| 测试通过/失败 | 执行测试命令，解析退出码 | 退出码 0/非0 是二进制的，不存在歧义 |
| Lint 结果 | 执行 lint 命令，解析输出 | ESLint/Prettier 规则是确定性的 |
| 类型检查 | 执行 `tsc --noEmit` 或等效命令 | 编译器是确定性的 |
| 构建成功 | 执行构建命令，解析退出码 | 编译器行为是确定的 |
| Diff 检查 | 对比文件快照（git diff 或 hash 对比） | 文件内容对比是字符级精确的 |

#### 3.4.2 依赖短路

反馈收集按依赖关系短路：

```
Diff 检查
  ↓ (无变更 → 跳过后续，直接进入下一轮)
Lint 检查
  ↓ (失败 → 跳过后续，回灌)
类型检查
  ↓ (失败 → 跳过后续，回灌)
构建
  ↓ (失败 → 跳过测试，回灌)
测试
  ↓
所有结果一次性汇总回灌
```

#### 3.4.3 反馈回灌

所有反馈信号一次性注入下一轮上下文的 `<feedback>` 块中，格式：

```
<feedback>
## 测试结果
✗ src/user.test.ts - should hash password
  Expected: "hashed_xxx"
  Received: undefined

## Lint 结果
✓ 通过

## 类型检查
✓ 通过

## Diff 摘要
文件已修改: src/user.ts, src/user.test.ts
意外修改: 无
</feedback>
```

---

### 3.5 工具系统

#### 3.5.1 工具列表

| 工具 | 类型 | 说明 |
|------|------|------|
| read_file | 只读 | 读取文件内容，支持分段读取（startLine/endLine） |
| write_file | 写入 | 创建或覆写文件，含原子写入和自动备份 |
| delete_file | 写入 | 删除文件，需提供理由 |
| list_dir | 只读 | 列出目录内容，最多 500 条目 |
| search_file | 只读 | 按 glob 模式搜索，最多 200 匹配 |
| grep | 只读 | 文本搜索，最多 500 行结果 |
| run_command | 执行 | 执行 shell 命令（包括 git 等 CLI 工具） |
| run_tests | 执行 | 运行测试命令 |
| run_lint | 执行 | 运行 lint 命令 |
| run_type_check | 执行 | 运行类型检查命令 |
| git_status | 只读 | 查看工作区 git 状态 |
| git_diff | 只读 | 查看 git diff |
| git_log | 只读 | 查看 git 提交历史 |
| git_commit | 写入 | 创建 git commit（需审批） |
| git_push | 写入 | 推送 git commit（需审批） |
| ask_user | 交互 | 向用户提问 |
| finish | 控制 | 标记任务完成 |

> **注意**：Git 只读操作（git_status、git_diff、git_log）通过 `run_command` 执行并自动标记为只读以绕过审批；Git 写入操作（git_commit、git_push）通过 `run_command` 执行但需经过护栏审批流程。

#### 3.5.2 文件操作的原子性

所有写入操作使用"临时文件 + 原子 rename"策略：

1. 将内容写入 `<filename>.codeharness-tmp-<uuid>`
2. 如原始文件存在，备份到 `.codeharness/backups/<timestamp>/`
3. `fs.rename(tmp, target)` —— 原子操作
4. 写入失败则原始文件保持不变

---

### 3.6 系统提示

#### 3.6.1 系统提示框架

Agent 的 system prompt 是决定其行为质量的关键。以下是设计框架：

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
- **类型检查失败**：修正类型错误，不要用 any 或 @ts-ignore 规避
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

#### 3.6.2 设计原则

1. **角色精准**："严谨、务实的软件工程师"而非"超级 AI 程序员"——降低 LLM 过度自信的风险
2. **工具表格式描述**：让 LLM 清楚知道每个工具何时使用，减少误用
3. **自主 vs 询问的明确边界**：这是"目标漂移"和"过度询问"之间的平衡点
4. **反馈处理规则具体**：每种反馈类型有明确的应对策略
5. **禁止事项硬约束**：配合代码层护栏形成双重防护

---

### 3.7 目标漂移防护

LLM 在执行多轮任务时容易"忘记最初的目标"。三层防护机制：

#### 第一层：上下文注入

每轮对话的 user message 前缀固定注入原始任务描述：

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

#### 第二层：代码级偏离检测

```typescript
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
    const taskKeywords = extractKeywords(originalTask);
    if (currentAction.type === 'write_file') {
      const unrelated = !taskKeywords.some(kw =>
        currentAction.path.toLowerCase().includes(kw.toLowerCase()));
      if (unrelated && modifiedFiles.length > 3) {
        return { drifting: true, risk: 'low',
          reason: `文件 ${currentAction.path} 似乎与任务无关` };
      }
    }
    // 规则 3: 修改配置文件但任务不涉及配置
    if (isConfigFile(currentAction) && !isConfigRelated(originalTask)) {
      return { drifting: true, risk: 'medium',
        reason: '正在修改配置文件，但任务描述未涉及配置变更' };
    }
    return { drifting: false, risk: 'none' };
  }
}
```

#### 第三层：偏离响应

| 风险等级 | 行为 |
|---------|------|
| none | 正常执行 |
| low | 在下一轮上下文追加提醒："注意：你的上一步操作似乎与原始任务偏离。请确认是否必要。" |
| high | 暂停执行，使用 ask_user 询问："检测到可能的任务偏离——当前操作涉及 {原因}，但原始任务是 '{原始任务}'。是否继续？" |

**偏离检测由代码逻辑执行**（非 LLM 自检），因为代码逻辑是确定性的，遵循 §A.4(C) 的"移除 LLM 后仍可单测"原则。

---

### 3.8 运行时用户体验

#### 3.8.1 流式输出

| 方面 | 决策 |
|------|------|
| LLM 思考过程 | 不展示 raw token 流。显示 spinner + 状态文本："正在分析任务..." / "正在生成代码..." |
| 执行前展示 | 每轮 LLM 返回动作后展示单行动作摘要："→ 第3轮: 修改 src/user.ts (write_file)"。不等待用户确认（危险操作有审批机会） |
| 命令输出 | 实时流式透传 stdout/stderr，让用户感知进度 |
| 非交互模式 | 抑制所有终端输出，仅最终结果 JSON 输出到 stdout |

#### 3.8.2 终端输出示例

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

#### 3.8.3 进度指示

| 元素 | 说明 |
|------|------|
| 轮次 | "第 N/M 轮"（M = auto_fix_rounds + 2，预留弹性） |
| 每轮耗时 | 在轮次行末显示 |
| 动作状态 | ✓ 完成、✗ 失败、⚠ 被拦截、⏳ 审批中、⠋ 进行中 |
| 非交互模式 | 全静默，只有最终结果 JSON |

#### 3.8.4 Dry-Run 模式

支持 `--dry-run` 标志。Agent 只执行只读操作（读取文件、搜索），写操作仅记录到计划中，不实际执行。

```
$ codeharness --dry-run "重构 UserService"

🔍 分析代码库（只读模式）...
→ 读取 src/user.ts
→ 读取 src/controller.ts
→ 搜索 UserService 引用...

📋 计划摘要:
  1. 创建 src/services/UserService.ts — 提取 UserService 类
  2. 更新 src/user.ts — 改为从新路径 re-export
  3. 更新 src/controller.ts — 修改 import 路径
  4. 运行测试验证

⚠️  这是 dry-run 模式，不会修改任何文件。

确认执行？[Y/n]  _
```

| 行为 | Dry-run 中？ |
|------|------------|
| 读取文件 | ✅ 允许 |
| 搜索/目录列表 | ✅ 允许 |
| LLM 调用 | ✅ 会消耗 |
| 写入/删除文件 | ❌ 拦截并记录 |
| 执行命令 | ❌ 拦截并记录 |
| 进入 HITL 审批 | ❌ 不触发 |

#### 3.8.5 Verbose 调试模式

支持 `--verbose` / `-v` 标志。显示完整 LLM 请求/响应（截断超长内容为前 2000 字符 + `...`）、上下文大小（tokens 数）、护栏检测详情、每步耗时。

---

### 3.9 LLM 调用策略

#### 3.9.1 速率限制与重试

| 策略 | 决策 |
|------|------|
| 自动重试 | 最多 3 次，指数退避 + 抖动 |
| 退避策略 | 1s + jitter(±0.5s) → 2s + jitter → 4s + jitter。优先读取 `Retry-After` 响应头 |
| 进度展示 | "⏳ API 限流，1s 后重试...（第 1/3 次）" |
| 本地速率限制 | MVP 不做令牌桶。CodeHarness 同步串行调用，天然不会触发 RPM 限制 |
| 全部重试失败 | 进入暂停状态，保存进度，提示用户稍后恢复 |

**可重试错误**：429（限流）、5xx（服务端错误）、网络错误。**不可重试错误**：401（认证失败）、403（权限不足）——直接退出。

#### 3.9.2 Token 成本追踪

| 策略 | 决策 |
|------|------|
| 任务后展示 | Token 用量 + 估算成本："Token 用量: 12,345 tokens (输入: 10,200 + 输出: 2,145) · 估算成本: ~$0.06 (GPT-4o)" |
| 预算上限 | 支持 `--max-cost 0.50`，达到上限时优雅终止并保留已修改文件 |
| 审计日志 | 每次 LLM 调用记录：时间戳、模型、token 数、估算成本、耗时 |
| 价格表 | 硬编码静态配置，定期 PR 更新 |

**价格表**（每 1M tokens，USD）：

| 模型 | Input | Output |
|------|-------|--------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude Sonnet | $3.00 | $15.00 |
| Claude Haiku | $0.25 | $1.25 |
| Ollama 本地 | $0 | $0 |

#### 3.9.3 模型降级策略

支持配置降级链：

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

| 规则 | 说明 |
|------|------|
| 触发条件 | 网络错误、5xx、超时。4xx 不降级 |
| 降级通知 | ✅ 打印提示 + 说明切换原因 |
| 降级后调整 | 自动重新计算上下文预算（不同模型窗口不同） |
| 是否回升 | 不回升。同任务中一旦降级保持降级模型 |
| 全部不可用 | 进入暂停状态，保存进度 |

---

### 3.10 记忆与上下文管理

#### 3.10.1 跨会话记忆

| 记忆内容 | 是否纳入 | 说明 |
|----------|---------|------|
| 项目文件结构摘要 | ✅ | 目录树 + 关键文件路径，减少初始探索轮数 |
| 历史任务及结果 | ✅ | 最近 10 次任务记录 |
| 用户偏好 | ✅ | 用户通过 ask_user 明确表达的偏好，存储为用户规则 |
| 项目约定 | ✅ | 从配置文件提取 + 用户手动录入 |
| 已批准的护栏规则（跨会话） | ❌ | 安全考量：跨会话白名单过于危险 |
| 常见错误模式及修正方式 | ❌ | MVP 不做 |

#### 3.10.2 上下文窗口预算管理

**阈值：80% 的模型上下文窗口**（保留 20% 余量给 LLM 输出）。

**裁剪优先级（从先丢弃到后丢弃）**：

1. 历史对话中超出滑动窗口的旧轮次（最先丢弃）
2. 项目文件结构摘要中的深层目录细节
3. 近期对话中非当前任务直接相关的代码内容（压缩为摘要）
4. 历史任务记录中的详细描述（压缩为一行摘要）
5. 系统提示 / 当前轮反馈信号 / 最近 2 轮对话（绝对不丢弃）

**裁剪策略**：按 token 数裁剪，非按轮数。代码块超限时压缩为摘要 `[已压缩] {摘要}`，最近 2 轮对话即使超限也强制保留（截断内容）。

---

### 3.11 错误处理

#### 3.11.1 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 任务成功完成 |
| 1 | 配置错误（缺少 API Key） |
| 2 | 认证错误（API Key 无效） |
| 3 | 网络错误 |
| 4 | 配置文件语法错误 |
| 5 | 工作区不存在 |
| 6 | 权限不足 |
| 7 | 护栏拦截（任务被安全策略中止） |
| 8 | 任务失败（Agent 无法完成任务） |
| 9 | 未知内部错误 |
| 10 | Node.js 版本不满足要求 |
| 130 | 用户中断（Ctrl+C / SIGINT） |

#### 3.11.2 中断与恢复

**优雅中断**：Ctrl+C → SIGINT 捕获 → 清理临时文件 → 保留备份 → 写入中断状态 → 退出码 130。

**不支持断点恢复**（MVP）。原因：LLM 对话状态无法精确序列化，恢复时重建完整上下文的工程复杂度远超 MVP 范围。用户选择"恢复"等价于自动回滚修改 + 重新执行原任务。

---

## 4. 非功能性需求

### 4.1 安全性

- 凭据绝不写入任何文件（配置文件、日志、环境变量文件），使用 OS 钥匙串存储
- 日志输出前过滤凭据前缀模式（`sk-`、`ant-` 等）
- 内存中的凭据使用后立即零填充覆盖
- `.gitignore` 包含 `.env`、`*.key`、`*secret*`
- 所有文件写入操作使用原子写入（临时文件 + rename），防止数据损坏
- 危险命令在代码层拦截（非 LLM 自我约束）
- 工作区路径围栏防止读取/修改工作区外的文件
- 默认排除 `node_modules`、`.git`、`dist`、`build`、`__pycache__`、`.venv`、`vendor` 等依赖目录

### 4.2 确定性

- 所有核心机制可用 mock LLM 确定性复现，测试不依赖网络与真实 LLM（§A.4(C)）
- 护栏检测、路径围栏、风险分级、反馈收集器均为纯函数或确定性组件
- 三个演示用例（护栏拦截、反馈闭环、多层治理）均为确定性行为

### 4.3 可用性

- 首次运行引导流程 < 5 分钟（包含凭据录入和配置初始化）
- CLI 输出清晰分层：INFO（蓝色）、SUCCESS（绿色）、WARNING（黄色）、ERROR（红色）、DANGER（红色闪烁）
- 所有命令支持 `--help`
- 错误信息包含可操作的解决建议
- 支持 `--dry-run` 模式预览计划
- 支持 `--verbose` 模式调试

### 4.4 可观测性

#### 4.4.1 日志体系

| 日志类型 | 内容 | 存储位置 | 级别 |
|----------|------|---------|------|
| 审计日志 | 所有动作 + 护栏结果 + 审批结果 + LLM 调用摘要 | `~/.codeharness/logs/audit/{date}.jsonl` | 始终记录（不可关闭） |
| 运行日志 | 任务开始/结束、每轮摘要、错误恢复、降级事件 | `~/.codeharness/logs/runtime/{date}.log` | INFO（默认） |
| 调试日志 | 完整 LLM 请求/响应、上下文构建细节、token 估算过程 | `~/.codeharness/logs/debug/{date}.log` | DEBUG（`--log-level debug` 开启） |

**日志格式**：JSONL（每行一个 JSON 对象），便于用 `jq`、`grep` 等工具分析。

**日志轮转**：单文件最大 10 MB，保留最近 7 天，每种日志类型最多 10 个轮转文件。使用 `pino` 日志库。

**日志级别控制**：
- `--log-level debug`：DEBUG 级别（含完整 LLM 请求/响应）
- `--log-level silent`：仅审计日志，不输出运行日志
- `--quiet`：非交互模式下抑制终端输出

#### 4.4.2 进度指示

交互模式下显示：轮次进度、每轮耗时、动作状态图标（✓ ✗ ⚠ ⏳ ⠋）、实时透传命令输出。非交互模式下全静默，仅最终结果 JSON 输出到 stdout。

### 4.5 跨平台

- 支持 Linux（bash）、macOS（zsh/bash）、Windows（PowerShell / cmd）
- 路径操作统一使用 Node.js `path` 模块
- 危险模式同时覆盖 Unix 和 Windows 语法
- 自动检测平台，选择默认 shell

---

## 5. 系统架构

### 5.1 组件图

```
┌──────────────────────────────────────────────────────────────────┐
│                           CLI Layer                                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Command     │  │ Interactive  │  │ Output Formatter         │ │
│  │ Parser      │  │ Approval UI  │  │ (stdout/stderr/audit)    │ │
│  └──────┬──────┘  └──────┬───────┘  └────────────┬─────────────┘ │
└─────────┼────────────────┼───────────────────────┼───────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Core Harness                                │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                    Agent Main Loop                         │   │
│  │  (组织上下文 → 调用 LLM → 解析动作 → 分发执行 → 回灌结果)    │   │
│  └───┬───────┬──────────┬──────────┬──────────┬──────────────┘   │
│      │       │          │          │          │                   │
│      ▼       ▼          ▼          ▼          ▼                   │
│  ┌──────┐┌───────┐┌──────────┐┌────────┐┌──────────────┐        │
│  │Context││Action ││Guardrail ││Feedback││Memory        │        │
│  │Manager││Dispatch││Pipeline ││Collector││Manager       │        │
│  └──┬───┘└───┬───┘└────┬─────┘└───┬────┘└──────┬───────┘        │
│     │        │         │          │            │                  │
│     │        │    ┌────┴────┐     │            │                  │
│     │        │    │L1-L5    │     │            │                  │
│     │        │    │Layers   │     │            │                  │
│     │        │    └────┬────┘     │            │                  │
│     │        │         │          │            │                  │
└─────┼────────┼─────────┼──────────┼────────────┼──────────────────┘
      │        │         │          │            │
      ▼        ▼         ▼          ▼            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Infrastructure Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ LLM      │  │ File     │  │ Shell    │  │ Credential       │ │
│  │ Provider │  │ System   │  │ Executor │  │ Store            │ │
│  │ (OpenAI/ │  │ (fs)     │  │ (child_  │  │ (keytar / OS     │ │
│  │ Anthropic│  │          │  │ process) │  │  keychain)       │ │
│  │ /Ollama) │  │          │  │          │  │                  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 数据流

```
用户输入任务描述
      │
      ▼
CLI 命令解析 (commander)
      │
      ▼
配置加载 (ConfigManager)
   ┌─ 全局配置 (如果存在)
   ├─ 项目配置 (如果存在)
   └─ 合并为有效配置
      │
      ▼
Agent 主循环启动
      │
      ▼
┌─────────────────────────────────────────┐
│ 1. 上下文构建 (ContextManager)           │
│    - 加载系统提示                        │
│    - 加载项目记忆 (memory.json)           │
│    - 注入原始任务描述（防漂移）           │
│    - 组装近期对话                        │
│    - 注入当前任务上下文                  │
│    - Token 预算检查与裁剪               │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 2. LLM 调用 (LLMProviderChain)          │
│    - 主模型调用                          │
│    - 失败时降级到备用模型                 │
│    - 速率限制重试 (最多 3 次)             │
│    - OpenAI → Anthropic → Ollama         │
│    - Test → MockLLMProvider              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 3. 动作解析 (ActionParser)               │
│    - 解析 LLM 输出的 Tool Use / JSON     │
│    - 验证 Schema 合法性                  │
│    - 失败 → 重试（最多 2 次）            │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 4. 偏离检测 (DriftDetector)              │
│    - 检查动作是否偏离原始任务目标         │
│    - 低风险提醒 / 高风险拦截             │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 5. 护栏检查 (GuardrailPipeline)          │
│    L1: 模式匹配                          │
│    L2: 路径围栏                          │
│    L3: 风险分级                          │
│    L4: HITL 审批 (如果需要)              │
│    L5: 审计日志                          │
└──────────────────┬──────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
    通过/已审批         被拦截/拒绝
          │                 │
          ▼                 ▼
┌──────────────────┐  ┌──────────────┐
│ 6. 动作执行       │  │ 反馈回灌："被 │
│ (ActionDispatcher)│  │ 拒绝/拦截"    │
└────────┬─────────┘  └──────┬───────┘
         │                   │
         ▼                   │
┌──────────────────┐         │
│ 7. 反馈收集       │         │
│ (FeedbackCollector)│        │
│ - Diff / Lint /   │         │
│   类型检查 / 构建  │         │
│   / 测试           │         │
│ - 依赖短路         │         │
└────────┬─────────┘         │
         │                   │
         ▼                   │
┌──────────────────┐         │
│ 8. Finish 拦截     │◄────────┘
│ - 测试未通过？     │
│ - 意外修改？       │
│ - 偏离检测结果？   │
│                    │
│ 注：在 Finish 拦截 │
│ 之前，DriftDetector│
│ 已经执行过偏离检  │
│ 测（步骤 4）。     │
│ Finish 拦截器复用  │
│ 该检测结果，无需   │
│ 重复执行偏离检测。 │
└────────┬─────────┘         │
         │                   │
         ▼                   │
┌──────────────────┐         │
│ 9. 停机判断       │◄────────┘
│ - finish 动作？   │
│ - 达到最大轮数？  │
│ - 连续相同修改？  │
│ - 全局超时？      │
│ - 成本预算上限？  │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
  停机      继续循环
 (输出结果)  (回到步骤 1)
```

### 5.3 外部依赖

| 依赖 | 用途 | 许可证 |
|------|------|--------|
| OpenAI API | LLM 供应商（可选） | 商业 API |
| Anthropic API | LLM 供应商（可选） | 商业 API |
| Ollama | 本地 LLM 运行时（可选） | MIT |
| commander | CLI 参数解析 | MIT |
| yaml | YAML 配置文件解析 | ISC |
| chalk | 终端彩色输出 | MIT |
| inquirer | 交互式审批 UI | MIT |
| keytar | 操作系统钥匙串访问 | MIT |
| tiktoken | Token 估算 | MIT |
| zod | 配置 Schema 验证 | MIT |
| uuid | 任务 ID 生成 | MIT |
| pino | 结构化日志（JSONL 输出 + 轮转） | MIT |
| semver | 版本号比较 | ISC |

### 5.4 项目目录结构

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
│   │   ├── drift-detector.ts # 偏离检测
│   │   ├── action-parser.ts  # 动作解析器
│   │   ├── action-dispatcher.ts # 动作分发器
│   │   └── stop-detector.ts  # 停机判断
│   ├── llm/
│   │   ├── provider.ts       # LLMProvider 接口
│   │   ├── provider-chain.ts # 降级链
│   │   ├── adapters/         # OpenAI / Anthropic / Ollama adapter
│   │   └── mock-provider.ts  # Mock LLM
│   ├── tools/
│   │   ├── registry.ts       # 工具注册表
│   │   ├── file-ops.ts       # 文件操作（含原子性）
│   │   └── command-runner.ts # 命令执行
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
│       ├── workspace.ts      # 工作区根目录检测
│       ├── shell.ts          # Shell 命令执行
│       ├── credential.ts     # 凭据存储
│       ├── token-counter.ts  # Token 估算
│       ├── cost-tracker.ts   # 成本追踪
│       └── pricing.ts        # 价格表（纯数据，豁免覆盖率）
├── tests/
│   ├── unit/                 # 每模块对应一个测试文件
│   ├── integration/          # 集成测试
│   └── e2e/                  # CLI 端到端测试
├── docs/
├── .codeharness.yaml         # 自举：用自己管理自己
├── package.json
├── tsconfig.json
├── jest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .c8rc.json
├── .gitignore
└── .github/
    └── workflows/
        └── ci.yml
```

---

## 6. 数据模型

### 6.1 核心实体

**Task（任务）**：

```typescript
interface Task {
  id: string;                    // UUID
  description: string;           // 用户输入的任务描述
  workspace_root: string;        // 工作区根目录
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  rounds: number;                // 已执行轮数
  max_rounds: number;            // 最大轮数
  started_at: string;            // ISO 8601
  finished_at?: string;
  result?: {
    success: boolean;
    summary: string;
    exit_code: number;
  };
}
```

**Round（轮次）**：

```typescript
interface Round {
  round_number: number;
  llm_request: {
    messages: Message[];
    token_count: number;
    provider: string;
    model: string;
  };
  llm_response: {
    raw: string;
    parsed_action?: Action;
    parse_error?: string;
    parse_retries: number;
    duration_ms: number;
  };
  drift_result?: DriftCheckResult;
  guardrail_result?: GuardrailResult;
  approval?: ApprovalResult;
  execution?: ActionResult;
  feedback?: FeedbackResult[];
  finish_result?: FinishResult;
  stop_decision?: StopDecision;
}
```

**DriftCheckResult（偏离检测结果）**：

```typescript
interface DriftCheckResult {
  drifting: boolean;
  risk: 'none' | 'low' | 'medium' | 'high';
  reason?: string;
}
```

**GuardrailResult（护栏结果）**：

```typescript
interface GuardrailResult {
  passed: boolean;
  requires_approval: boolean;
  risk_level: RiskLevel;
  matched_patterns: string[];
  path_check: {
    passed: boolean;
    is_within_workspace: boolean;
    resolved_path: string;
  };
  blocked: boolean;              // 硬拦截（不可审批）
  block_reason?: string;
}
```

**ApprovalResult（审批结果）**：

```typescript
interface ApprovalResult {
  decision: 'approved' | 'denied' | 'auto_approved' | 'timed_out' | 'hard_blocked';
  user_response?: 'Y' | 'N' | 'A' | 'S';
  auto_approved?: boolean;
  auto_approved_category?: string;
  timeout_seconds: number;
  duration_ms: number;
}
```

**FeedbackResult（反馈结果）**：

```typescript
interface FeedbackResult {
  source: 'test' | 'lint' | 'typecheck' | 'build' | 'diff';
  passed: boolean;
  skipped: boolean;
  skip_reason?: string;
  details: string;
  summary: string;
  duration_ms: number;
  exit_code?: number;
  error_count?: number;
  warning_count?: number;
}
```

**FinishResult（finish 拦截结果）**：

```typescript
interface FinishResult {
  intercepted: boolean;
  message?: string;
  suggestion?: string;
}
```

**StopDecision（停机决定）**：

```typescript
interface StopDecision {
  should_stop: boolean;
  reason: 'finish_action' | 'max_rounds' | 'stall_detected' | 'global_timeout' | 'user_interrupt' | 'blocked_no_alternative' | 'cost_limit_reached';
  detail: string;
}
```

### 6.2 内部接口

**LLMProvider**：

```typescript
interface LLMProvider {
  readonly name: string;
  readonly supportsToolUse: boolean;  // 所有实现必须为 true
  readonly contextWindow: number;     // 上下文窗口大小（tokens）
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  countTokens(text: string): number;
}

interface ChatOptions {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
}

interface ChatResponse {
  content: string;
  tool_calls?: ToolCall[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

**LLMProviderChain（降级链）**：

```typescript
class LLMProviderChain {
  private providers: LLMProvider[];
  private currentIndex: number;

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
          continue;
        }
        throw err;
      }
    }
    throw new Error('所有 LLM 供应商均不可用');
  }
}
```

**SessionApprovalCache（会话白名单）**：

```typescript
class SessionApprovalCache {
  private approvedCategories: Set<DangerCategory>;

  approve(category: DangerCategory): void;
  isApproved(category: DangerCategory): boolean;
  clear(): void;
}
```

### 6.3 配置文件结构

```yaml
# .codeharness.yaml
version: 1

llm:
  provider: openai              # openai | anthropic | ollama
  model: gpt-4o
  # ollama 专用:
  # base_url: http://localhost:11434/v1
  fallbacks:                    # 降级链（可选）
    - provider: anthropic
      model: claude-sonnet-4-20250514
    - provider: ollama
      model: qwen2.5-coder:14b

workspace:
  root: .                       # 留空则自动检测

guardrails:
  enabled: true
  additional_patterns: []       # 额外自定义危险模式
  timeout_seconds: 120          # 审批超时
  exclude_dirs: []              # 额外排除目录（追加到默认列表）

feedback:
  test_command: "npm test"
  lint_command: "npm run lint"
  typecheck_command: "npx tsc --noEmit"
  build_command: "npm run build"
  auto_fix_rounds: 3

tools:
  default_shell: "bash"         # 或 "powershell"
  command_timeout_seconds: 60
  max_output_bytes: 1048576     # 1MB

interaction:
  mode: interactive             # interactive | non-interactive
  danger_policy: ask            # ask | deny | skip（非交互模式使用）

context:
  max_history_rounds: 5
  model_context_ratio: 0.8      # 上下文窗口使用比例
```

**配置合并策略**：全局配置（`~/.codeharness/config.yaml`）+ 项目配置（`.codeharness.yaml`）深度合并。项目配置覆盖全局配置的同名字段。对嵌套对象递归合并，对数组字段完全替代。

---

## 7. 领域与机制设计

### 7.1 该领域的反馈信号

Coding 领域的反馈信号天然客观、确定、可回灌：

| 反馈信号 | 编码实现 | 为什么是客观的 |
|----------|---------|---------------|
| 测试通过/失败 | `FeedbackCollector.runTests()` — 执行测试命令，解析退出码 | 退出码 0/非0 是二进制的，不存在歧义 |
| Lint 结果 | `FeedbackCollector.runLint()` — 解析 lint 输出 | ESLint/Prettier 的规则是确定性的 |
| 类型检查 | `FeedbackCollector.runTypeCheck()` — 运行类型检查命令 | 编译器是确定性的 |
| 构建成功 | `FeedbackCollector.runBuild()` — 解析退出码和错误输出 | 编译器的行为是确定的 |
| Diff 检查 | `FeedbackCollector.checkDiff()` — 对比文件快照 | 文件内容对比是字符级精确的 |

### 7.2 该领域的危险动作

Coding 领域特有的危险操作：

1. **文件破坏**：`rm -rf`、`del /f /s` —— 不可逆的数据丢失
2. **Git 破坏**：`git push --force`、`git reset --hard` —— 不可逆的仓库破坏
3. **对外发布**：`npm publish`、`docker push` —— 影响外部世界
4. **任意代码执行**：`curl | bash` —— 供应链攻击
5. **数据库破坏**：`DROP TABLE` —— 不可逆的数据丢失

### 7.3 该领域所需的工具

1. **文件操作**：读取、写入、删除、列出文件 —— 核心编码操作
2. **命令执行**：运行测试、lint、构建、类型检查 —— 反馈收集的基础
3. **搜索**：在代码库中搜索模式 —— 理解代码结构
4. **Git（只读）**：`git status`、`git diff`、`git log` —— 了解变更上下文
5. **Git（写入，需审批）**：`git commit`、`git push` —— 版本控制

### 7.4 该领域的记忆需求

1. **项目结构**：目录布局、入口文件、包管理器 —— 避免每次重新探索
2. **项目约定**：测试目录、命名规范、代码风格 —— 保持一致性
3. **历史任务**：成功/失败模式 —— 避免重复犯错
4. **用户偏好**：用户明确表达的偏好，存储为用户规则

### 7.5 重点维度选择：治理

**为什么选治理**：

1. **最"代码化"的维度**：危险命令检测、路径越界检查、审批状态机、超时控制——全都是确定性的代码逻辑，天然契合 §A.4(C) 的"移除 LLM 还能单测验证"的硬标准
2. **工程深度最好体现**：五层护栏架构，每层都有明确的代码实现和测试
3. **机制演示最容易做**：三个演示中有两个直接展示治理能力
4. **与其他维度自然关联**：治理深入会自然触及反馈（拦截结果作为反馈回灌）、配置（护栏规则可配置）、工具分发（动作执行前经过护栏）

**五层治理深度**：

| 层级 | 机制 | 实现要点 |
|------|------|---------|
| L1 | 模式匹配 | 8 类危险模式的正则检测，支持扩展 |
| L2 | 路径围栏 | 工作区根目录边界检测，敏感路径额外检测 |
| L3 | 风险分级 | 四级风险（safe/caution/dangerous/fatal），决定审批策略 |
| L4 | HITL 状态机 | 完整状态图，含审批/拒绝/超时/会话白名单 |
| L5 | 审计日志 | 结构化 JSONL 记录所有动作、护栏结果、审批结果 |

**其他五个维度的最低可运行实现**：

| 维度 | 最低实现 |
|------|---------|
| 决策封装 | Agent 主循环 + 动作解析器（含重试）+ 偏离检测 |
| 工具分发 | 12 种动作类型的执行器，含文件原子性 |
| 反馈闭环 | 5 种反馈信号收集器，依赖短路，一次性回灌 |
| 记忆 | JSON 文件存储，4 类记忆，任务完成后自动更新 |
| 配置 | YAML 多层配置，深度合并，环境变量覆盖 |

---

## 8. 凭据与分发设计

### 8.1 凭据存储方案

**主方案：操作系统钥匙串**

- 使用 `keytar`（Node.js 跨平台库）访问 OS 原生凭据存储
- macOS：Keychain
- Windows：Credential Manager
- Linux：libsecret（GNOME Keyring / KDE Wallet）

**存储结构**：

| Key 名称 | 值 |
|----------|-----|
| `codeharness/openai` | OpenAI API Key |
| `codeharness/anthropic` | Anthropic API Key |
| `codeharness/ollama` | 不需要（本地服务） |

**安全措施**：

- Key 绝不写入任何文件（配置文件、日志、环境变量文件）
- 日志输出前过滤 `sk-`、`ant-` 等前缀模式
- 内存中的 Key 字符串使用后立即覆盖（零填充）
- `.gitignore` 包含 `.env`、`*.key`、`*secret*`
- Pre-commit hook 检测疑似凭据模式

### 8.2 首次运行体验

首次运行时自动触发配置向导：

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
│   API Key 已保存到凭据管理器。                            │
│   正在验证 Key 有效性... ✓ 通过                          │
│                                                         │
│   默认模型: GPT-4o                                       │
│   是否创建默认配置文件？[Y/n] y                           │
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
```

**向导流程**：
1. 检测 `~/.codeharness/config.yaml` 不存在 → 触发向导
2. 检测环境变量中已设置的 API Key → 跳过对应步骤
3. 引导选择供应商
4. 隐藏输入 API Key（使用 Node.js `readline` 的 `stdin.setRawMode(true)`）
5. 存储到 OS 凭据管理器
6. 验证 Key：调用廉价 API（如 OpenAI 的 `list models`），确认返回 200
7. 生成默认配置文件
8. 展示快速入门
9. 询问是否继续执行原始任务

### 8.3 凭据管理命令

```
codeharness key status    → 输出: "OpenAI: ✅ 已配置 | Anthropic: ❌ 未配置 | Ollama: 无需凭据"
codeharness key set       → 询问供应商 → 录入新 Key → 验证 → 覆盖存储
codeharness key clear     → 确认 → 从钥匙串删除 → 提示成功
```

### 8.4 分发形态

**主选：npm 包**

```bash
npm install -g codeharness
codeharness "给 UserService 添加单元测试"
# 或无需安装
npx codeharness "修复 TypeScript 类型错误"
```

**次选：原生可执行二进制**

- 使用 `bun build --compile` 或 `pkg` 打包为单文件
- 目标平台：Linux x64/arm64、macOS x64/arm64、Windows x64
- 从 GitHub Releases 下载

**不分发形态**：容器镜像（CLI 工具用容器分发 UX 较差，需要挂载工作目录、管理卷）

### 8.5 版本管理与升级

- 启动时异步检查 npm registry 新版本（超时 3s 静默跳过）
- 配置文件包含 `version: 1` 字段，启动时检测旧版本格式并自动迁移
- 迁移前备份原文件为 `.codeharness.yaml.bak`
- Node.js 最低版本要求 **≥ 18.0.0**，不满足时退出码 10
- 支持 `codeharness --version` 和 `codeharness --help`

---

## 9. 技术选型与理由

### 9.1 语言：TypeScript / Node.js

| 理由 | 说明 |
|------|------|
| 与课程工具链同构 | Superpowers 技能框架、编码智能体工具链均以 Node.js 为主 |
| CLI 工具生态成熟 | commander / yargs / inquirer / chalk / ora 等库可直接复用 |
| 分发灵活 | npm 包分发 + `bun build` / `pkg` 打包为单文件二进制 |
| LLM SDK 丰富 | OpenAI / Anthropic / Ollama 均有官方或高质量社区 Node.js SDK |
| 异步模型适配 | Agent 主循环本质是事件驱动的"计划-执行-反馈"流水线，async/await 足以应对 |
| 静态类型 | TypeScript 的类型系统在编译期捕获大量错误，对"动作分发"系统尤有价值 |

### 9.2 开发环境与工具链

| 工具 | 选择 | 理由 |
|------|------|------|
| 包管理器 | pnpm | 磁盘效率高、严格的依赖解析、避免幽灵依赖 |
| TypeScript 编译目标 | ES2022, module: NodeNext | Node.js 18+ 全覆盖 |
| Node.js 最低版本 | 18.x LTS | ES2022 特性全覆盖，当前最老的活跃 LTS |
| 代码风格 | ESLint（strict）+ Prettier | 不做无意义的风格定制 |
| Monorepo 工具 | 不使用 | 单一包，通过 TypeScript paths 别名组织 |
| Git 分支策略 | feature 分支 + PR | main 分支始终可发布 |
| 日志库 | pino | 内建 JSONL 输出 + 轮转支持 |

### 9.3 LLM 供应商

| 供应商 | 接入方式 | MVP 支持 |
|--------|---------|---------|
| OpenAI | 官方 SDK（`openai` npm 包），GPT-4o / GPT-4o-mini | ✅ |
| Anthropic | 官方 SDK（`@anthropic-ai/sdk`），Claude Sonnet | ✅ |
| Ollama | OpenAI 兼容 API（`http://localhost:11434/v1`），本地模型 | ✅ |

**统一策略**：所有供应商通过 Adapter 模式实现 `LLMProvider` 接口，强制要求使用 Tool Use 机制。支持降级链配置，4xx 错误不降级，同任务中不回升。

### 9.4 框架与库

| 库 | 用途 | 许可证 |
|----|------|--------|
| commander | CLI 参数解析 | MIT |
| yaml | YAML 配置文件解析 | ISC |
| chalk | 终端彩色输出 | MIT |
| inquirer | 交互式审批 UI | MIT |
| keytar | 操作系统钥匙串 | MIT |
| tiktoken | Token 估算 | MIT |
| zod | 配置 Schema 验证 | MIT |
| uuid | 任务 ID 生成 | MIT |
| pino | 结构化日志 | MIT |
| semver | 版本号比较 | ISC |

### 9.5 测试框架

- **Jest**：单元测试 + 集成测试
- **Mock LLM**：自定义 `MockLLMProvider`，接受预设的响应序列
- 测试不依赖网络与真实 LLM

### 9.6 分发与部署

- npm 包（主）
- 原生可执行二进制（次，通过 `bun build --compile`）
- 全平台（Linux / macOS / Windows）

---

## 10. 验收标准

### 10.1 核心功能验收

| 功能 | 验收标准 |
|------|---------|
| Agent 主循环 | 输入自然语言任务 → Agent 自动执行至少 3 轮 → 产生文件修改 → 运行测试 → 输出结果 |
| 护栏拦截 | 注入 `rm -rf /` 命令 → 护栏拦截 → 显示危险警告 → 等待用户输入 → 拒绝后 Agent 收到反馈 |
| 反馈闭环 | 注入错误代码 → 测试失败 → Agent 收到失败信息 → 自动修正 → 测试通过 |
| 目标漂移防护 | Agent 试图修改与任务无关的文件 → 偏离检测触发 → 低风险提醒或高风险拦截 |
| Finish 拦截 | Agent 声称成功但测试未通过 → harness 拦截 finish → 回灌矛盾信息 |
| Dry-Run 模式 | `--dry-run` → 只读操作 → 展示计划 → 不修改任何文件 |
| 凭据管理 | 首次运行引导录入 → Key 存入 OS 钥匙串 → `codeharness key status` 显示状态（不回显明文）→ `codeharness key clear` 清除 |
| 配置文件 | 创建 `.codeharness.yaml` → Agent 读取配置 → CLI 参数覆盖配置值 |
| 非交互模式 | `--non-interactive --danger-policy=deny` → 危险操作自动拒绝 → 无需人工输入 |
| 模型降级 | 主模型不可用 → 自动切换到备用模型 → 通知用户 |
| 成本追踪 | 任务完成后展示 token 用量和估算成本 → `--max-cost` 可在达到预算上限时终止 |
| 超大项目处理 | 10 万文件项目 → 搜索/列表自动截断 + 提示 → 默认排除 node_modules 等目录 |

### 10.2 测试验收

- 所有核心机制有 mock LLM 确定性单元测试，不依赖网络
- 测试覆盖率 ≥ 80%（核心模块：`src/core/`、`src/guardrails/`、`src/feedback/`、`src/tools/`）
- 豁免文件：`src/index.ts`（CLI 入口）、`src/cli/setup-wizard.ts`（交互式向导）、纯类型定义文件、`src/utils/pricing.ts`（纯数据）
- 集成测试覆盖完整流程（mock LLM）
- CLI E2E 测试覆盖 happy path + 配置错误场景
- CI（GitHub Actions）三平台矩阵（ubuntu/macos/windows），覆盖率不达标则 CI 失败
- `npm test` 一键运行所有测试

### 10.3 机制演示验收

三个演示必须用 mock LLM 确定性地复现：

1. **演示① — 治理护栏拦截**：Agent 尝试执行 `rm -rf` → 护栏拦截 → 审批 → 结果
2. **演示② — 反馈闭环**：Agent 生成错误代码 → 测试失败 → 收到反馈 → 修正 → 通过
3. **演示③ — 治理深层行为**：五层护栏组合验证（正常通过 / 危险审批 / 越界拒绝 / 会话白名单一致性）

### 10.4 分发验收

- `npm install -g codeharness` 可安装
- `codeharness "任务描述"` 可运行
- `npx codeharness "任务描述"` 可运行（无需预装）
- 首次运行触发配置向导，流程 < 5 分钟
- `codeharness --version` 显示版本和平台信息
- `codeharness --help` 显示完整帮助
- README 写清：获取方式、运行命令、Key 安全配置、已知限制

### 10.5 交付物验收

| 交付物 | 要求 |
|--------|------|
| `SPEC.md` | 本文档 |
| `PLAN.md` | 任务列表，颗粒度 ≤ 2-5 分钟 |
| `SPEC_PROCESS.md` | Brainstorming 过程记录 + 冷启动验证 |
| 源代码 | 完整 harness 内核 + mock LLM 测试 |
| `README.md` | 项目简介 + 安装 + 运行 + 分发 + 安全边界 |
| `AGENT_LOG.md` | 按时间顺序记录关键节点 |
| `REFLECTION.md` | 1500-2500 字反思 |
| `.gitlab-ci.yml` | CI 配置，含 unit-test job |
| 机制演示 | 3 个演示的测试用例 |

---

## 11. 风险与未决问题

### 11.1 已识别风险

| 风险 | 等级 | 对策 |
|------|------|------|
| LLM 输出格式不稳定 | ⚠️ 高 | Tool Use 强制 + 宽松解析 + 2 次重试 |
| Shell 命令安全沙箱 | ⚠️ 高 | 五层护栏 + 子进程隔离 + 文档说明安全边界 |
| Mock LLM 表现力不够 | ⚠️ 中 | 基于场景的响应序列，覆盖 5 个关键测试场景 |
| 上下文窗口溢出 | ⚠️ 中 | Token 预算管理 + 分层裁剪 + 代码块压缩 |
| Agent 陷入无限修正循环 | ⚠️ 中 | `auto_fix_rounds` 硬上限 + 连续相同修改检测 |
| Agent 目标漂移 | ⚠️ 中 | 三层防护：上下文注入 + 代码级偏离检测 + 分级响应 |
| 跨平台兼容性 | ⚠️ 低 | 自动检测平台 + `path` 模块 + 双语法危险模式 |
| 大型项目性能 | ⚠️ 低 | 文件搜索限制范围 + 默认排除依赖目录 + 硬限制输出量 |
| API 速率限制 | ⚠️ 低 | 指数退避重试 (3 次) + 降级链 + 可暂停恢复 |
| 凭据安全 | ⚠️ 低 | OS 钥匙串 + 内存零填充 + 日志过滤 + 不使用文件存储 |

### 11.2 未决问题

1. **Ollama 模型对 Tool Use 的支持程度不一**：某些本地模型可能不支持 Tool Use。解决方案：在 Ollama Provider 中检测模型能力，不支持时提示用户更换模型或使用支持 Tool Use 的模型
2. **大型 monorepo 的性能**：当前设计假设工作区是单个项目。对于 monorepo，用户可以通过 `--workspace` 参数指定子项目目录
3. **是否需要内置代码审查**：当前未纳入，但反馈收集器中的 Lint 和类型检查提供了基本的代码质量保障
4. **国际化（i18n）**：CLI 输出目前为英文。如需中文支持，提示语和系统提示的翻译在后续版本中考虑
5. **自举（Dogfooding）**：用 CodeHarness 开发 CodeHarness 自身的具体操作流程，在实际开发中探索

---

## 12. 变更历史

| 版本 | 日期 | 变更类型 | 原因 | 受影响章节 |
|------|------|---------|------|-----------|
| 1.0 | 2026-07-07 | - | 初始版本（经两轮 brainstorming 后冻结） | 全部 |
| 2.0 | 2026-07-07 | P2 增量更新 | 第三轮 brainstorming 新增 22 个问题的设计决策，涵盖：系统提示、目标漂移防护、运行时 UX、LLM 调用策略、测试策略、可观测性、首次运行体验、版本管理、边界情况、SPEC 冻结流程 | §3.6-§3.11, §4.3-§4.4, §5.2-§5.4, §6.1-§6.3, §8.2-§8.5, §9.2, §10.1-§10.2, §11.1-§11.2, §12 |

---

> **文档版本**：v2.0  
> **最后更新**：2026-07-07  
> **三轮 brainstorming 共覆盖 55 个问题**，设计细节已充分展开，SPEC 进入冻结状态。  
> **冻结后修改规则**：P0（安全漏洞）/ P1（功能缺失）/ P2（设计矛盾）允许修改，需更新变更历史并评估对 PLAN.md 的影响。P3/P4 级别问题记录为后续版本需求。  
> **下一阶段**：基于本 SPEC 执行 `PLAN.md`（任务分解与实现计划）。

---

## 附录 A：来自课程棋盘的约束

### §A.4(C) — 核心机制须可确定性测试

**要求**：所有核心机制必须可用 mock LLM 确定性复现，测试不依赖网络与真实 LLM。

**理解**：这不是说"任何 LLM 调用都不能有"，而是"移除 LLM 之后，你的核心业务逻辑仍然可以单独测试"。也就是说：

- 护栏检测、路径围栏、风险分级、审批状态机、反馈收集器、偏离检测器、停机判断器、上下文构建器、Token 预算管理、动作解析器——这些模块**必须**是纯函数或确定性组件，可以脱离 LLM 独立进行单元测试
- LLM 调用本身是一个薄适配层，在测试中用 `MockLLMProvider` 替代
- 集成测试通过 mock LLM 的预设响应序列来验证完整流程，确保行为可复现、可断言

**在 SPEC 中的体现**：§4.2 确定性、§10.2 测试验收中的所有"mock LLM 确定性单元测试"要求。

### 六个维度的覆盖说明

CodeHarness 的 SPEC 覆盖了 AI Agent 系统设计的六个维度：

| 维度 | 在本项目中的体现 | 深度 |
|------|-----------------|------|
| **治理** | 五层护栏（L1 模式匹配 → L2 路径围栏 → L3 风险分级 → L4 HITL 审批 → L5 审计日志），8 类危险模式，4 级风险分级，完整审批状态机 | ★★★★★ 重点 |
| **决策封装** | Agent 主循环（上下文构建 → LLM 调用 → 动作解析 → 执行 → 反馈回灌），偏离检测器（三层防护），Finish 拦截器，停机判断器 | ★★★★ |
| **工具分发** | 17 种工具（含 Git 读写），动作分发器，文件原子写入，命令沙箱，输出截断，默认排除目录 | ★★★★ |
| **反馈闭环** | 5 种客观反馈信号（测试/构建/类型检查/Lint/Diff），依赖短路，一次性回灌，客观验证拦截 | ★★★★ |
| **记忆** | 跨会话记忆（项目结构/历史任务/用户偏好/项目约定），上下文窗口预算管理，分层裁剪策略 | ★★★ |
| **配置** | YAML 多层配置合并，环境变量覆盖，Schema 验证，首次运行向导，版本迁移 | ★★★ |

> **"最低可运行实现"的含义**：每个维度都具备完整的核心功能，能够独立运行并被测试验证，但深度不同。治理维度作为重点深入五层，其他维度保证核心路径完整可用。
