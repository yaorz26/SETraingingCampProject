# Brainstorming 第二轮：深度追问

> 基于你对第一轮 13 个问题的回答，以下是对模糊之处、未充分展开的设计细节、以及可能被忽略的边界情况的深度追问。

---

## 一、命名与 package 一致性

### Q2.1 命名统一

你在示例中使用了 `my-harness`（Q9、Q11），但最终项目名定为 `CodeHarness`。请确认：

- npm 包名是 `codeharness` 还是 `code-harness`？
- CLI 命令名是什么？（`codeharness` / `code-harness` / `ch`？）
- 全局配置目录是 `~/.codeharness/` 还是 `~/.code-harness/`？
- 项目配置文件是 `.codeharness.yaml` 还是 `.agent.yaml`（你 Q10 示例中写的是 `.agent.yaml`）？

---

## 二、HITL 状态机设计（重点维度深入）

### Q2.2 审批状态机

你提出 `IDLE → EXECUTING → AWAITING_APPROVAL → APPROVED → EXECUTING → IDLE`，请补充完整的状态图：

- **拒绝（DENIED）** 状态是否存在？Agent 收到拒绝后进入什么状态？是直接回到 IDLE 还是进入"修正"状态？
- **超时** 是独立状态还是 AWAITING_APPROVAL 的子状态？
- **会话级记忆** 的具体实现：`A`（允许所有同类操作）的"同类"如何定义？是按危险模式类别（如"文件破坏"）还是按精确命令匹配？
- 如果一个任务需要执行 3 个同类危险操作，用户按了一次 `A` 后，后续 2 个是否自动通过？这个"会话白名单"存储在哪里？内存中还是文件？

### Q2.3 多层护栏的执行顺序

你设计了 L1-L5 五层护栏，它们的执行顺序是什么？

```
Agent 准备执行命令
   ↓
[L1] 模式匹配 → 命中危险模式？ → 是 → 进入 HITL
   ↓ 否
[L2] 路径围栏 → 越界？ → 是 → 进入 HITL
   ↓ 否
[L3] 权限分级 → 需要审批的级别？ → 是 → 进入 HITL
   ↓ 否
[L4] HITL 状态机 → 审批通过？
   ↓ 是
[L5] 审计日志 → 记录 → 执行
```

这个流程对吗？还是有其他设计？

---

## 三、反馈闭环的细节

### Q2.4 反馈收集的执行顺序与优先级

你列出了 5 种反馈信号（测试、Lint、类型检查、构建、Diff），它们是否总是全部运行？还是按优先级/依赖关系选择性运行？

例如：
- 如果构建失败，是否还需要运行测试？（构建产物不存在）
- 是否应该先运行最快的（Lint），再运行慢的（测试），以尽早发现问题？
- 反馈回灌给 LLM 时，是所有结果一起给，还是逐条给？

### Q2.5 Diff 反馈信号的实现

"对比修改前后"具体如何实现？

- 是对比 **git diff**（工作区 vs HEAD）？
- 还是 Agent 在执行动作前自行记录文件快照，执行后对比？
- 如果 Agent 同时修改了 5 个文件，Diff 反馈是"5 个文件被修改，其中 3 个是预期内，2 个是意外"——这个"预期"如何判定？

---

## 四、工具与动作的边界

### Q2.6 Workspace Root 如何确定？

你多处提到"工作区根目录"作为范围围栏，但如何确定这个根目录？

- 自动检测：向上查找 `.git` 目录？`package.json`？
- 手动指定：用户必须在配置中声明？
- 默认值：如果没有检测到任何项目标记，默认是当前目录？
- 如果用户在 `/home/user/projects/myapp/frontend/` 下运行，但 workspace root 应该是 `/home/user/projects/myapp/`——Agent 如何判断？

### Q2.7 网络请求的边界

你提到 `npm install`、`pip install` 允许但需经过危险检测，`curl | bash` 禁止。但以下情况如何处理？

| 场景 | 如何处理？ |
|------|-----------|
| `npm install` 安装了一个包含 `postinstall` 脚本的恶意包 | |
| `wget https://example.com/script.sh && chmod +x script.sh && ./script.sh` | |
| `git clone` 一个外部仓库到工作区内 | |
| `npx` 执行一个远程包 | |
| `pip install` 带 `--user` 标志安装到系统目录 | |

### Q2.8 文件操作的原子性

Agent 修改文件时，如果中途出错（如磁盘满、权限不足），如何保证不留下半成品？

- 先写临时文件再 rename？
- 修改前自动备份？
- 出错后回滚机制？

---

## 五、LLM 抽象层与动作解析

### Q2.9 多供应商 API 差异的统一

你设计了统一的 `LLMProvider` 接口，但不同供应商的 API 差异很大：

| 差异点 | OpenAI | Anthropic | Ollama |
|--------|--------|-----------|--------|
| 消息格式 | `{ role, content }` | `{ role, content }` (基本兼容) | OpenAI 兼容 |
| Tool Use | `tool_calls` + `function` | `tool_use` content block | 取决于模型 |
| JSON Mode | `response_format: { type: "json_object" }` | 不支持原生 JSON Mode | 部分支持 |
| System Prompt | `system` role | `system` 参数（顶层） | 取决于模型 |

**关键问题**：

- 你如何让 Agent 的动作输出格式在所有供应商上保持一致？强制要求所有供应商支持 tool use？如果某个供应商不支持 tool use 怎么办？
- JSON Mode 在 Anthropic 上不可用，你是用提示词约束输出格式，还是要求 Anthropic 用户必须使用 tool use？
- 是否需要一个 **格式适配层**（Adapter）将不同供应商的响应统一为内部动作格式？

### Q2.10 动作 Schema 的严格定义

Agent 的每个动作必须有确定的 Schema。请给出一个完整的动作类型定义：

```typescript
// 请补充你认为需要的所有动作类型
type Action = 
  | { type: 'read_file'; path: string }
  | { type: 'write_file'; path: string; content: string }
  | { type: 'delete_file'; path: string }
  | { type: 'run_command'; command: string }
  | { type: 'finish'; summary: string }
  // ... 还有哪些？
```

---

## 六、记忆与上下文

### Q2.11 跨会话记忆的具体内容

你提到记忆存储为 `.codeharness/memory.json`，但具体记什么？

| 可能的记忆内容 | 是否纳入？ | 为什么？ |
|---------------|-----------|---------|
| 项目文件结构摘要 | | |
| 历史任务及其结果 | | |
| 用户偏好（如"我喜欢用 `const` 而非 `let`"） | | |
| 项目约定（如"测试文件放在 `__tests__/` 目录"） | | |
| 已批准的护栏规则（跨会话） | | |
| 常见错误模式及修正方式 | | |

### Q2.12 上下文窗口预算管理

你提到"估算 token 数，超过阈值时按优先级裁剪"，请给出更具体的策略：

- 阈值是多少？（如 80% 的模型上下文窗口？）
- 裁剪优先级：当上下文超限时，先丢弃什么？系统提示 > 近期对话 > 代码内容 > 反馈信号？
- 对话滑动窗口保留最近 N 轮——N 是多少？5 轮够吗？如果一轮包含了大量代码内容，是否按 token 数而非轮数裁剪？

---

## 七、错误处理与边界情况

### Q2.13 启动失败场景

以下场景下 Agent 应该如何表现？

| 场景 | 预期行为 |
|------|---------|
| 用户未配置 API Key | |
| API Key 配置了但无效（401） | |
| LLM 服务不可达（网络错误） | |
| 配置文件解析失败（YAML 语法错误） | |
| 工作区目录不存在 | |
| 用户没有工作区目录的写权限 | |

### Q2.14 任务中断与恢复

- 如果 Agent 正在执行一个长任务时用户按 `Ctrl+C`，是否支持从中断点恢复？
- 如果支持恢复，需要持久化什么状态？

---

## 八、配置文件的最终确认

### Q2.15 配置文件名称与格式

第一轮中你 YAML 示例写的是 `.agent.yaml`，但项目名叫 `CodeHarness`。请确认：

- 配置文件名称：`.codeharness.yaml` / `.codeharness.yml` / `.agent.yaml`？
- 是否支持 `.codeharness.json` 作为替代格式？
- 全局配置和项目配置的合并策略：是项目配置覆盖全局配置的全部字段，还是深度合并（deep merge）？

---

## 九、机制演示的确定性

### Q2.16 三个演示的 mock LLM 脚本设计

文档要求用 mock LLM 确定性地演示三个行为：

1. **治理护栏拦截一个危险动作**
2. **注入一次失败，反馈闭环使 Agent 收到反馈并据此改变下一步动作**
3. **重点维度（治理）的一个确定性行为**

请描述每个演示的 mock LLM 响应序列设计：

- 演示①：mock LLM 第 1 轮返回什么？（让 Agent 尝试执行危险命令）护栏拦截后，Agent 第 2 轮的行为是什么？mock LLM 第 2 轮返回什么？
- 演示②：mock LLM 第 1 轮返回什么？（让 Agent 修改代码）反馈收集器注入什么？Agent 第 2 轮如何修正？mock LLM 第 2 轮返回什么？
- 演示③：你选择展示治理的哪个具体行为？mock LLM 需要配合哪些响应？

---

**请逐一回答以上问题。这一轮聚焦于设计细节，回答完成后即可进入 SPEC.md 的撰写。**