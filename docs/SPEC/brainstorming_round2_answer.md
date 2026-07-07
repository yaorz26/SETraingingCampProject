# Brainstorming 第二轮：回答

> 对 `brainstorming_round2.md` 中 16 个深度追问的逐一回答。基于第一轮回答的一致性原则进行细化。

---

## 一、命名与 package 一致性

### Q2.1 命名统一

第一轮中存在命名不一致的问题，现统一如下：

| 项目 | 最终决定 | 理由 |
|------|---------|------|
| **npm 包名** | `codeharness` | 无连字符，简洁，与项目名 CodeHarness 对应（npm 不区分大小写） |
| **CLI 命令名** | `codeharness` | 与包名一致，用户安装后直接使用；同时注册短别名 `ch` |
| **全局配置目录** | `~/.codeharness/` | 与项目名一致 |
| **项目配置文件** | `.codeharness.yaml` | 与项目名一致（第一轮示例中的 `.agent.yaml` 是笔误） |
| **记忆文件** | `~/.codeharness/memory.json`（全局）/ `.codeharness/memory.json`（项目级） | 分层存储 |
| **日志目录** | `~/.codeharness/logs/` | 审计日志、运行日志 |
| **凭据存储 key** | `codeharness/credentials` | OS 钥匙串中的 key 名称 |

**一致性校验清单**：

```
npm install -g codeharness          # 安装
codeharness "任务描述"               # 使用
ch "任务描述"                        # 短别名
~/.codeharness/config.yaml          # 全局配置
.codeharness.yaml                    # 项目配置
~/.codeharness/memory.json          # 全局记忆
.codeharness/memory.json            # 项目记忆
~/.codeharness/logs/                # 日志
```

---

## 二、HITL 状态机设计（重点维度深入）

### Q2.2 审批状态机

**完整状态图**：

```
                    ┌──────────────────────────────────────┐
                    │            AGENT MAIN LOOP            │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │              IDLE                    │
                    │       Agent 等待/规划下一步           │
                    └──────────┬──────────────────────────┘
                               │ LLM 返回动作
                               ▼
                    ┌─────────────────────────────────────┐
                    │           EXECUTING                  │
                    │   准备执行动作，先过护栏检测          │
                    └──────────┬──────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │ 安全           │ 需审批          │ 致命（如越界）
              ▼                ▼                 ▼
     ┌────────────┐   ┌──────────────────┐  ┌──────────────┐
     │ 直接执行    │   │ AWAITING_APPROVAL │  │   BLOCKED    │
     │ → IDLE      │   │ 等待用户输入      │  │ 无条件拒绝    │
     └────────────┘   └───────┬──────────┘  │ → IDLE       │
                              │              │ (注入拒绝     │
              ┌───────────────┼──────────────┐ 反馈到 LLM)  │
              │               │              │              │
              ▼               ▼              ▼              │
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
     │   APPROVED   │ │   DENIED     │ │   TIMED_OUT  │    │
     │ 用户按 Y/A   │ │ 用户按 N     │ │ 120s 无响应  │    │
     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘    │
            │                │                │            │
            ▼                ▼                ▼            │
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
     │  执行动作     │ │ 注入拒绝反馈  │ │ 注入超时反馈  │    │
     │ → IDLE       │ │ → IDLE       │ │ → IDLE       │    │
     └──────────────┘ └──────────────┘ └──────────────┘    │
            │                │                │            │
            └────────────────┴────────────────┘            │
                              │                            │
                              ▼                            │
                    ┌─────────────────────────────────────┐
                    │    Agent 收到反馈，决策下一步         │
                    │    - 拒绝 → 换方案 / 放弃             │
                    │    - 通过 → 继续任务                  │
                    └─────────────────────────────────────┘
```

**关键设计决策**：

| 问题 | 决策 |
|------|------|
| DENIED 状态 | **存在**。被拒绝的动作不会静默跳过，而是将拒绝原因作为结构化反馈注入 LLM 上下文，Agent 据此调整策略 |
| 拒绝后 Agent 行为 | 回到 IDLE → LLM 收到"动作被拒绝：{原因}"反馈 → LLM 自主决定：换方案/重试/报告无法完成 |
| 超时 | **独立状态 `TIMED_OUT`**，行为等价于 DENIED，但原因标记为"审批超时" |
| 会话级记忆 | 内存中维护 `SessionApprovalCache`，存储 `{ patternCategory: 'file_destruction' | 'git_dangerous' | ... }` |

**"同类操作"的定义**：

按**危险模式类别**而非精确命令匹配。分类如下：

```typescript
enum DangerCategory {
  FILE_DESTRUCTION = 'file_destruction',     // rm -rf, del /f /s
  GIT_DANGEROUS = 'git_dangerous',           // push --force, hard reset
  PERMISSION_CHANGE = 'permission_change',   // chmod 777, chown
  ARBITRARY_EXEC = 'arbitrary_exec',         // curl | bash, eval
  DATABASE_DESTROY = 'database_destroy',     // DROP TABLE, DROP DATABASE
  SYSTEM_OPERATION = 'system_operation',     // shutdown, reboot
  EXTERNAL_PUBLISH = 'external_publish',     // npm publish, docker push
}
```

**会话白名单行为**：

```
用户按 A → 该 DangerCategory 加入 SessionApprovalCache
后续同类别操作 → 自动通过，不重复询问
会话结束后 → SessionApprovalCache 清空
```

存储位置：**仅内存中**（`Map<DangerCategory, boolean>`），不落盘。因为"会话级信任"不应跨会话保留——每次新会话重新建立信任。

---

### Q2.3 多层护栏的执行顺序

你给出的流程图**基本正确**，但需要修正细节：权限分级（L3）不是"额外一层审批"，而是**风险等级的判定依据**，影响 HITL 的展示信息和审批策略。修正后的流程：

```
Agent 准备执行命令
   ↓
[L1] 模式匹配 ─ 命中致命模式（rm -rf /、mkfs 等）？
   ↓ 是 → BLOCKED（无条件拒绝，不可审批）→ 注入拒绝反馈 → IDLE
   ↓ 否
[L2] 路径围栏 ─ 操作目标在工作区外？
   ↓ 是 → BLOCKED（无条件拒绝）→ 注入拒绝反馈 → IDLE
   ↓ 否
[L3] 权限分级 ─ 判定风险等级：safe / caution / dangerous / critical
   ↓
   ├── safe → [L5] 审计日志 → 直接执行
   ├── caution → 检查会话白名单 → 已批准？→ [L5] → 执行
   │                                ↓ 未批准
   └── dangerous/critical ─────────→ [L4] HITL 审批
                                        ↓
                                   APPROVED → 更新会话白名单（如按 A）→ [L5] → 执行
                                   DENIED / TIMED_OUT → [L5] 记录 → 注入反馈 → IDLE
```

**修正点**：

1. L1 和 L2 是**硬拦截**（不可审批），命中直接 BLOCKED
2. L3 是**风险评级**，不是独立的审批环节，而是为 L4 提供决策依据
3. L4 只在 `caution`（首次）和 `dangerous/critical` 级别触发
4. L5 审计日志**始终执行**（无论通过还是拒绝，全部记录）

**风险等级示例**：

| 动作 | 风险等级 |
|------|---------|
| `cat package.json` | safe |
| `npm test` | safe |
| `rm ./src/old-file.ts` | caution |
| `rm -rf ./node_modules` | caution |
| `rm -rf ./src/` | dangerous |
| `git push --force` | dangerous |
| `npm publish` | critical |
| `rm -rf /` | fatal (L1) |
| 读取 `/etc/passwd` | fatal (L2) |

---

## 三、反馈闭环的细节

### Q2.4 反馈收集的执行顺序与优先级

**按依赖关系选择性运行，按快慢排序，全部结果汇总后一次性回灌。**

执行策略：

```
Agent 修改文件后
   ↓
[1] Diff 检查（最快，纯本地）→ 意外修改？→ 立即报告
   ↓
[2] Lint 检查（快，秒级）→ 有错误？
   ↓
[3] 类型检查（中速，依赖构建图）
   ↓                    ↓
[4] 构建检查（如适用）   [4'] 跳过构建（纯脚本语言）
   ↓
[5] 测试运行（最慢）
```

**依赖短路规则**：

| 如果 | 则 |
|------|----|
| Lint 有语法级错误 | **仍然运行类型检查**（lint 和类型检查覆盖不同问题），但可并行运行 |
| 类型检查失败 | **跳过构建**（编译产物不可能正确产生）；但仍运行测试（如果测试框架不依赖编译产物） |
| 构建失败 | **跳过测试**（无可执行产物） |
| Diff 无变化 | 后续流程照常运行（Agent 可能只改了注释，lint/test 仍需验证） |

**回灌策略**：所有结果汇总为一条结构化反馈，一次性注入 LLM 上下文，而非逐条给。原因：

- 逐条给 → 多轮 LLM 调用 → 增加延迟和成本
- 一次性给 → Agent 看到全景 → 做出更合理的修正决策

回灌格式：

```
<feedback>
测试结果: 2/5 通过
  失败: UserService.test.ts - "should hash password" - expected "hashed_xxx" got undefined
  失败: AuthService.test.ts - "should return token" - timeout
Lint: 3 errors, 1 warning
  src/user.ts:42 - 'password' is declared but never used (error)
  src/user.ts:58 - Missing return type annotation (warning)
类型检查: 通过
构建: 跳过（类型检查通过，无需重新构建）
Diff: 2 files modified (src/user.ts, src/auth.ts) - 均为预期内修改
</feedback>
```

---

### Q2.5 Diff 反馈信号的实现

**方案：Agent 执行动作前自动记录快照（文件内容的 hash），执行后对比。**

原因：`git diff` 只能对比已追踪的文件，对于新建文件（untracked）或 Agent 在非 Git 项目中工作不适用。

**实现步骤**：

```typescript
class DiffTracker {
  private snapshots: Map<string, string>; // path → sha256

  // Agent 执行动作前调用
  snapshot(paths: string[]): void {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        this.snapshots.set(p, sha256(fs.readFileSync(p)));
      } else {
        this.snapshots.set(p, '__NEW_FILE__');
      }
    }
  }

  // Agent 执行动作后调用
  diff(): DiffResult {
    const modified: FileChange[] = [];
    const created: string[] = [];
    const deleted: string[] = [];
    const unexpected: FileChange[] = [];

    // 对比快照
    for (const [path, oldHash] of this.snapshots) {
      if (!fs.existsSync(path)) {
        deleted.push(path);
      } else if (oldHash === '__NEW_FILE__') {
        // 新文件，不做 diff（预期内）
      } else {
        const newHash = sha256(fs.readFileSync(path));
        if (oldHash !== newHash) {
          modified.push({ path, oldHash, newHash });
        }
      }
    }

    // 检测意外修改：检查工作区内所有文件，找出未被 snapshot 但被修改的文件
    // （例如 Agent 的脚本间接修改了其他文件）
    // ...

    return { modified, created, deleted, unexpected };
  }
}
```

**"预期"判定**：

Agent 在动作声明中会指定它打算修改的文件（如 `write_file` 的 `path`），`DiffTracker` 将 Agent 声明的文件列表与实际修改的文件列表做差集：

```
预期文件 = Agent 动作中声明的所有目标文件
实际文件 = diff 检测到的所有变更文件
意外修改 = 实际文件 - 预期文件
预期但未改 = 预期文件 - 实际文件
```

反馈示例：

```
Diff 结果:
  预期修改: src/user.ts ✅ 已修改
  预期修改: src/user.test.ts ✅ 已修改
  意外修改: package-lock.json ⚠️ （Agent 未声明但被修改）
  预期未改: src/config.ts ⚠️ （Agent 声明修改但未变更）
```

---

## 四、工具与动作的边界

### Q2.6 Workspace Root 如何确定？

**多级检测策略，优先级从高到低：**

```typescript
function resolveWorkspaceRoot(cwd: string, config?: Config): string {
  // 1. 手动指定（CLI 参数或配置文件）—— 最高优先级
  if (config?.workspace?.root) {
    const resolved = path.resolve(config.workspace.root);
    if (fs.existsSync(resolved)) return resolved;
    throw new Error(`指定的工作区不存在: ${resolved}`);
  }

  // 2. 环境变量
  if (process.env.CODEHARNESS_WORKSPACE) {
    const resolved = path.resolve(process.env.CODEHARNESS_WORKSPACE);
    if (fs.existsSync(resolved)) return resolved;
  }

  // 3. 从当前目录向上查找项目标记
  let dir = path.resolve(cwd);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.codeharness.yaml'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }

  // 4. 默认：当前目录
  return path.resolve(cwd);
}
```

**对"frontend 子目录"场景的处理**：

```
用户 cwd: /home/user/projects/myapp/frontend/
检测顺序:
  1. /home/user/projects/myapp/frontend/.codeharness.yaml ? 否
  2. /home/user/projects/myapp/frontend/.git ? 否
  3. /home/user/projects/myapp/frontend/package.json ? 是
     → workspace root = /home/user/projects/myapp/frontend/
```

如果用户的意图是整个 `myapp/` 作为 workspace，只需在 `myapp/` 下放一个 `.codeharness.yaml` 或通过配置显式指定。这样设计避免了"猜测"带来的歧义：**向上查找最近的项目标记，尊重显式配置。**

---

### Q2.7 网络请求的边界

| 场景 | 处理方式 |
|------|---------|
| `npm install` 包含 `postinstall` 恶意脚本 | **无法在 harness 层面完全防御**。`npm install` 经护栏检测后放行（属于 `caution` 级），但 `postinstall` 是 npm 自身机制，harness 无法截获子进程的子进程。**文档明确说明此风险**，建议用户在信任的项目中使用 |
| `wget script.sh && chmod +x && ./script.sh` | **整条命令被 L1 模式匹配拦截**。`wget` + `chmod` 组合或 `wget` + 管道到执行被识别为 `arbitrary_exec` 模式。即使是三个独立动作，护栏在每个动作执行前分别检测，第三个（`./script.sh`）会触发"执行非托管脚本"的审批 |
| `git clone` 外部仓库到工作区内 | **允许但需审批**（`caution` 级）。克隆后新文件在工作区内，后续操作受 L2 路径围栏保护。克隆前检查目标路径是否在工作区内 |
| `npx` 执行远程包 | **等同 `npm install` + 执行**。L1 检测 `npx` 模式，触发审批（`dangerous` 级），因为 `npx` 本质是下载并执行远程代码 |
| `pip install --user` | **等同 `npm install`**，`caution` 级审批。`--user` 标志安装到用户目录而非系统目录，风险较低，但安装的包可能含恶意代码——这是包管理器的固有风险，harness 无法替代供应链安全工具 |

**不可防御的风险声明**（写入文档）：

> CodeHarness 的护栏机制是"防御性编程"，不是"安全沙箱"。以下风险无法在 harness 层面防御：
> - 包管理器安装的恶意依赖（`postinstall` 脚本等）
> - LLM 被提示注入诱导生成危险代码
> - 零日漏洞利用
>
> 建议：在不完全信任的项目中使用容器或虚拟机隔离。

---

### Q2.8 文件操作的原子性

**采用"写临时文件 → 原子 rename"策略 + 修改前自动备份。**

```typescript
class FileOperator {
  async writeFile(targetPath: string, content: string): Promise<void> {
    // 1. 确保目标目录存在
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // 2. 生成临时文件（同目录，保证同文件系统，rename 是原子的）
    const tmpPath = targetPath + '.codeharness-tmp-' + randomUUID();

    try {
      // 3. 写入临时文件
      await fs.writeFile(tmpPath, content, 'utf-8');

      // 4. 验证写入完整性（大小校验）
      const written = await fs.stat(tmpPath);
      if (written.size !== Buffer.byteLength(content, 'utf-8')) {
        throw new Error('文件写入不完整');
      }

      // 5. 如果目标文件已存在，先备份
      if (await fs.exists(targetPath)) {
        const bakPath = targetPath + '.codeharness-bak';
        await fs.copyFile(targetPath, bakPath);
        // 备份保留到本次会话结束或 Agent 确认任务完成后清理
      }

      // 6. 原子 rename
      await fs.rename(tmpPath, targetPath);
    } catch (err) {
      // 7. 清理临时文件
      await fs.unlink(tmpPath).catch(() => {});
      throw new Error(`文件写入失败: ${targetPath} — ${err.message}`);
    }
  }

  // 回滚：从备份恢复
  async rollback(targetPath: string): Promise<void> {
    const bakPath = targetPath + '.codeharness-bak';
    if (await fs.exists(bakPath)) {
      await fs.rename(bakPath, targetPath);
    }
  }
}
```

**错误处理矩阵**：

| 错误场景 | 处理 |
|---------|------|
| 磁盘满 | `writeFile` 抛异常 → 临时文件写入失败 → 原文件未被修改 → 清理临时文件 → 错误回灌 LLM |
| 权限不足 | 同上 + 额外提示"请检查目录权限" |
| 写入过程中进程崩溃 | 临时文件残留（不影响原文件）→ 下次启动时清理 `*.codeharness-tmp-*` 文件 |
| rename 失败 | 临时文件已写入成功但 rename 失败 → 临时文件残留 → 原文件未受影响 → 报错 |

**备份清理策略**：

- 任务成功完成 → `finish` 动作触发清理所有备份
- 任务被用户中断 → 下次启动提示"检测到上次未清理的备份文件，是否恢复？"
- 备份文件不进入 `.gitignore`（因为它们在 `.gitignore` 生效前就已存在），而是在每次任务结束后主动删除

---

## 五、LLM 抽象层与动作解析

### Q2.9 多供应商 API 差异的统一

**采用 Adapter 模式，在 `LLMProvider` 接口之下增加格式适配层。**

```
Agent 主循环
   ↓
LLMProvider 接口 (chat)
   ↓
┌───────────────────────────────────────────┐
│         Format Adapter Layer              │
│  统一动作格式 ← → 供应商原生格式            │
├───────────┬───────────┬───────────────────┤
│ OpenAI    │ Anthropic │ Ollama            │
│ Adapter   │ Adapter   │ Adapter           │
└───────────┴───────────┴───────────────────┘
```

**核心策略：强制使用 Tool Use / Function Calling 作为动作输出方式。不支持 tool use 的供应商不予支持。**

理由：

| 策略 | 评价 |
|------|------|
| 用 JSON Mode 输出动作 | ❌ Anthropic 不支持，解析脆弱 |
| 用提示词约束输出格式 | ❌ 不可靠，违反了"机制必须是代码"原则 |
| **强制 Tool Use** | ✅ 所有主流供应商都支持，输出格式确定，天然结构化 |

**各供应商适配方式**：

| 供应商 | 原生机制 | Adapter 转换 |
|--------|---------|-------------|
| OpenAI | `tool_calls` → `function.name` + `function.arguments` | 直接映射为 `Action` 类型 |
| Anthropic | `content_block` type=`tool_use` → `name` + `input` | 字段名映射（`input` → `arguments`） |
| Ollama | OpenAI 兼容 API | 与 OpenAI 相同 |

**适配器示例伪代码**：

```typescript
// 内部统一动作格式
interface ParsedAction {
  toolName: string;       // 'read_file' | 'write_file' | 'run_command' | ...
  arguments: Record<string, unknown>;
  rawResponse: unknown;   // 保留原始响应用于日志
}

// OpenAI Adapter
class OpenAIAdapter implements LLMProvider {
  async chat(messages, options) {
    const response = await openai.chat.completions.create({
      model: options.model,
      messages,
      tools: ACTION_TOOLS,  // 注入工具定义
      tool_choice: 'required', // 强制使用 tool
    });
    const toolCall = response.choices[0].message.tool_calls[0];
    return {
      action: {
        toolName: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
        rawResponse: response,
      },
      usage: response.usage,
    };
  }
}

// Anthropic Adapter
class AnthropicAdapter implements LLMProvider {
  async chat(messages, options) {
    const response = await anthropic.messages.create({
      model: options.model,
      messages,
      tools: ACTION_TOOLS_ANTHROPIC,
    });
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    return {
      action: {
        toolName: toolBlock.name,
        arguments: toolBlock.input,
        rawResponse: response,
      },
      usage: response.usage,
    };
  }
}
```

**工具定义（跨供应商共享）**：

```typescript
const ACTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作区根目录的文件路径' },
        },
        required: ['path'],
      },
    },
  },
  // ... write_file, delete_file, run_command, finish
];
```

---

### Q2.10 动作 Schema 的严格定义

```typescript
// ============================================================
// 动作类型定义
// ============================================================

// ---- 文件操作 ----

interface ReadFileAction {
  type: 'read_file';
  path: string;          // 相对工作区的路径
  startLine?: number;    // 可选：读取指定起始行（1-indexed）
  endLine?: number;      // 可选：读取指定结束行
}

interface WriteFileAction {
  type: 'write_file';
  path: string;          // 相对工作区的路径
  content: string;       // 写入内容
}

interface DeleteFileAction {
  type: 'delete_file';
  path: string;          // 相对工作区的路径
  reason: string;        // 删除原因（用于审计日志）
}

interface ListDirAction {
  type: 'list_dir';
  path: string;          // 相对工作区的路径，默认根目录
}

interface SearchFileAction {
  type: 'search_file';
  pattern: string;       // glob 模式，如 'src/**/*.ts'
}

interface GrepAction {
  type: 'grep';
  query: string;         // 搜索文本或正则
  path?: string;         // 限定搜索路径
  includePattern?: string; // 文件过滤
}

// ---- 命令执行 ----

interface RunCommandAction {
  type: 'run_command';
  command: string;       // 要执行的 shell 命令
  reason: string;        // 执行原因（用于审计和审批展示）
  timeout?: number;      // 超时秒数，默认 60
}

// ---- 反馈 ----

interface RunTestsAction {
  type: 'run_tests';
  command?: string;      // 覆盖配置中的测试命令
}

interface RunLintAction {
  type: 'run_lint';
  command?: string;      // 覆盖配置中的 lint 命令
}

interface RunTypeCheckAction {
  type: 'run_type_check';
  command?: string;
}

// ---- 控制流 ----

interface FinishAction {
  type: 'finish';
  success: boolean;
  summary: string;       // 任务完成总结（自然语言）
  artifacts?: string[];  // 产物文件列表
}

interface AskUserAction {
  type: 'ask_user';
  question: string;      // 向用户提出的问题
  context?: string;      // 补充上下文
}

// ---- 联合类型 ----

type AgentAction =
  | ReadFileAction
  | WriteFileAction
  | DeleteFileAction
  | ListDirAction
  | SearchFileAction
  | GrepAction
  | RunCommandAction
  | RunTestsAction
  | RunLintAction
  | RunTypeCheckAction
  | FinishAction
  | AskUserAction;

// ---- 动作执行结果 ----

interface ActionResult {
  action: AgentAction;
  success: boolean;
  output?: string;              // 标准输出
  error?: string;               // 错误信息
  exitCode?: number;            // 命令退出码
  duration: number;             // 执行耗时 (ms)
  guardrailResult?: GuardrailResult; // 护栏检测结果
}

// ---- 护栏检测结果 ----

interface GuardrailResult {
  passed: boolean;
  requiresApproval: boolean;
  approved?: boolean;           // 审批结果（如进入了 HITL）
  riskLevel: 'safe' | 'caution' | 'dangerous' | 'critical' | 'fatal';
  matchedPattern?: string;      // 命中的危险模式
  message: string;              // 人类可读的说明
}
```

---

## 六、记忆与上下文

### Q2.11 跨会话记忆的具体内容

| 可能的记忆内容 | 是否纳入？ | 为什么？ |
|---------------|-----------|---------|
| 项目文件结构摘要 | ✅ 是 | 新会话开始时快速让 Agent 了解项目布局（目录树 + 关键文件路径），减少初始探索轮数 |
| 历史任务及其结果 | ✅ 是 | 最近 N 次（默认 10 次）任务记录：任务描述、成功/失败、关键决策。帮助 Agent 理解项目演进脉络 |
| 用户偏好 | ✅ 是 | 用户通过 `AskUserAction` 明确表达的偏好（如"使用 const"，"测试文件放 tests/ 下"），存储为用户规则 |
| 项目约定 | ✅ 是 | 从 `.codeharness.yaml` 中提取的配置 + 用户手动录入的约定（如 lint 规则、命名规范） |
| 已批准的护栏规则（跨会话） | ❌ 否 | **安全考量**：跨会话白名单过于危险，每次新会话重新建立信任 |
| 常见错误模式及修正方式 | ❌ 否 | MVP 不做。需要较多工程投入（错误聚类、模式抽取），且容易引入错误的"经验" |

**记忆存储结构**：

```typescript
// ~/.codeharness/memory.json（全局）+ .codeharness/memory.json（项目级）
interface MemoryStore {
  version: 1;
  project?: {
    root: string;
    lastOpened: string;          // ISO 日期
    fileStructure?: FileStructureSummary;
    conventions?: string[];      // 项目约定文本
    userPreferences?: Record<string, string>;
  };
  history: {
    maxEntries: 10;
    entries: TaskHistoryEntry[];
  };
}

interface TaskHistoryEntry {
  timestamp: string;
  task: string;                  // 用户原始任务描述
  success: boolean;
  rounds: number;                // 用了多少轮
  summary: string;               // Agent 完成总结
  keyActions: string[];          // 关键动作摘要
}

interface FileStructureSummary {
  generatedAt: string;
  tree: string;                  // 目录树文本
  keyFiles: string[];            // 重要文件路径
  packageManager?: string;       // npm | yarn | pnpm
  language?: string;             // typescript | python | ...
}
```

---

### Q2.12 上下文窗口预算管理

**阈值：80% 的模型上下文窗口（保留 20% 余量给 LLM 输出）**

```typescript
const CONTEXT_BUDGET_RATIO = 0.8;

function getTokenBudget(model: string): number {
  const windows: Record<string, number> = {
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'claude-sonnet-4-20250514': 200_000,
    'claude-3-5-sonnet': 200_000,
    // Ollama 默认
    'default': 128_000,
  };
  return Math.floor((windows[model] ?? windows['default']) * CONTEXT_BUDGET_RATIO);
}
```

**裁剪优先级（从先丢弃到后丢弃）**：

```
优先级 1（最先丢弃）：历史对话中超出滑动窗口的旧轮次
优先级 2：项目文件结构摘要中的深层目录细节
优先级 3：近期对话中，非当前任务直接相关的代码内容（压缩为摘要）
优先级 4：历史任务记录中的详细描述（压缩为一行摘要）
优先级 5（绝对不丢弃）：系统提示
优先级 5（绝对不丢弃）：当前轮的反馈信号
优先级 5（绝对不丢弃）：最近 2 轮对话
```

**滑动窗口策略：按 token 数裁剪，非按轮数**：

5 轮是默认值，但如果某轮包含大量代码（如读取了一个 2000 行的文件），按轮数裁剪会不准确。实际实现：

```typescript
function buildContext(options: ContextOptions): Message[] {
  const messages: Message[] = [];
  let usedTokens = 0;

  // 1. 系统提示（最高优先级，不裁剪）
  messages.push({ role: 'system', content: systemPrompt });
  usedTokens += estimateTokens(systemPrompt);

  // 2. 当前任务的上下文（反馈信号等，不裁剪）
  const feedbackBlock = buildFeedbackBlock(options.feedback);
  usedTokens += estimateTokens(feedbackBlock);

  // 3. 历史对话：从最近开始倒序添加，直到达到预算
  const recentMessages = options.history.slice(-20); // 最多 20 轮
  const selectedHistory: Message[] = [];

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    const tokens = estimateTokens(msg.content);

    if (usedTokens + tokens > budget - RESERVED_FOR_OUTPUT) {
      // 超限：裁剪当前消息
      if (msg.role === 'user' && msg.content.includes('```')) {
        // 包含代码块的内容：压缩为摘要
        msg.content = `[已压缩] ${extractSummary(msg.content)}`;
        // 重新估算并再次尝试
      } else if (i < recentMessages.length - 2) {
        // 如果已经保留了最近 2 轮，放弃更旧的
        break;
      }
      // 如果还没保留最近 2 轮，强行保留（截断内容）
      msg.content = msg.content.substring(0, 2000) + '\n[内容已截断]';
    }

    selectedHistory.unshift(msg);
    usedTokens += estimateTokens(msg.content);
  }

  // 4. 前缀消息（文件结构摘要等，如有剩余空间则加入）
  if (usedTokens < budget * 0.3 && options.fileStructure) {
    // 只在预算充裕时（<30%使用率）才注入完整文件结构
    const fsBlock = buildFileStructureBlock(options.fileStructure);
    if (usedTokens + estimateTokens(fsBlock) <= budget) {
      messages.splice(1, 0, { role: 'user', content: fsBlock });
    }
  }

  return messages;
}
```

**核心原则**：宁可少给上下文（让 Agent 用 `read_file` 按需获取），也不超出窗口导致截断或幻觉。

---

## 七、错误处理与边界情况

### Q2.13 启动失败场景

| 场景 | 预期行为 |
|------|---------|
| 用户未配置 API Key | 打印友好的引导信息："检测到您尚未配置 API Key。请运行 `codeharness setup` 进行配置，或设置环境变量 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`。" 退出码 1，不接 LLM |
| API Key 配置了但无效（401） | 捕获 401 错误 → 打印 "API Key 无效或已过期：{provider}。请运行 `codeharness setup` 更新凭据。" → 退出码 2 |
| LLM 服务不可达（网络错误） | 捕获网络错误 → 打印 "无法连接到 {provider} API：{错误详情}。请检查网络连接或代理设置。" → 退出码 3。建议重试（不自动重试，保持用户可控） |
| 配置文件解析失败（YAML 语法错误） | 打印 "配置文件 {path} 语法错误：第 {line} 行 — {错误信息}" → 退出码 4。**不静默回退到默认值**（避免用户以为配置生效了但实际被忽略） |
| 工作区目录不存在 | 打印 "工作区目录不存在：{path}。请确认路径正确。" → 退出码 5 |
| 用户没有工作区目录的写权限 | 打印 "工作区目录不可写：{path}。CodeHarness 需要对工作区的读写权限。" → 退出码 6。注意与"某个文件不可写"区分——后者在运行时按文件操作错误处理 |

**统一的退出码规范**：

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

---

### Q2.14 任务中断与恢复

**支持优雅中断，不支持断点恢复（MVP）。**

**中断处理**：

```
用户按 Ctrl+C
   ↓
SIGINT 信号捕获
   ↓
打印 "正在安全退出..."
   ↓
[1] 清理临时文件（*.codeharness-tmp-*）
[2] 备份文件保留（*.codeharness-bak），提示用户
[3] 写入中断状态到 .codeharness/interrupt.json
[4] 审计日志写入中断记录
[5] 退出码 130（128 + SIGINT）
```

**中断状态文件**：

```typescript
// .codeharness/interrupt.json
interface InterruptState {
  timestamp: string;
  task: string;             // 原始任务描述
  currentStep: number;      // 当前轮次
  lastAction?: AgentAction; // 上次执行的动作
  lastFeedback?: FeedbackSummary;
  modifiedFiles: string[];  // 已修改的文件列表
  backupFiles: string[];    // 备份文件路径
}
```

**下次启动时的行为**：

```
$ codeharness "新任务"   # 检测到 interrupt.json
⚠️ 检测到上次未完成的任务（2026-07-07 14:30）：
   任务: "给 UserService 添加单元测试"
   进度: 3/10 轮
   已修改文件: src/user.ts, src/user.test.ts
   备份文件: src/user.ts.codeharness-bak

选择操作:
  [R] 恢复上次任务
  [D] 丢弃并开始新任务（清理备份文件）
  [K] 保留备份，开始新任务

> _
```

**MVP 不支持断点恢复**的理由：

1. LLM 对话状态无法精确序列化（上下文窗口内容是动态构建的）
2. 恢复时需要重建完整的上下文（文件状态、对话历史、反馈信号），工程复杂度远超 MVP 范围
3. "先从备份恢复文件状态，重新执行任务"比"从中间状态继续"更可靠
4. 用户选择 `R` 的行为等价于：自动回滚修改 + 重新执行原任务

---

## 八、配置文件的最终确认

### Q2.15 配置文件名称与格式

| 项目 | 最终决定 |
|------|---------|
| **项目配置文件** | `.codeharness.yaml`（也接受 `.codeharness.yml`） |
| **替代格式** | 支持 `.codeharness.json`（适用不喜欢 YAML 的用户或机器生成场景） |
| **全局配置文件** | `~/.codeharness/config.yaml` |
| **格式优先级** | 如果同时存在 `.codeharness.yaml` 和 `.codeharness.json`，使用 `.codeharness.yaml`（YAML 对人更友好，优先） |

**全局配置 + 项目配置的合并策略：深度合并（Deep Merge）**

```typescript
function mergeConfig(global: Config, project: Config): Config {
  // 项目配置的每个字段覆盖全局配置的同名字段
  // 对于嵌套对象，递归合并而非整对象替换
  return deepMerge(global, project);
}

// 示例:
// 全局配置:
//   guardrails:
//     enabled: true
//     timeout_seconds: 120
//     dangerous_patterns: ["rm -rf"]
//
// 项目配置:
//   guardrails:
//     dangerous_patterns: ["rm -rf", "DROP TABLE"]
//
// 合并结果:
//   guardrails:
//     enabled: true            ← 来自全局
//     timeout_seconds: 120     ← 来自全局
//     dangerous_patterns: ["rm -rf", "DROP TABLE"]  ← 项目覆盖
```

**为什么是深度合并而非整对象覆盖**：

- 如果整个 `guardrails` 被项目配置的 `guardrails` 覆盖，全局的 `enabled` 和 `timeout_seconds` 会丢失
- 深度合并让用户可以在项目级只写"增量配置"，不需要重复全局配置的所有字段
- 对于数组字段（如 `dangerous_patterns`），项目配置的数组**完全替代**全局配置的数组，而非合并（因为数组合并语义不明确）

**最终配置文件结构**：

```yaml
# .codeharness.yaml
version: 1

llm:
  provider: openai              # openai | anthropic | ollama
  model: gpt-4o
  # ollama 专用:
  # base_url: http://localhost:11434/v1

workspace:
  root: .                       # 留空则自动检测

guardrails:
  enabled: true
  additional_patterns: []       # 额外自定义危险模式
  timeout_seconds: 120          # 审批超时

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

---

## 九、机制演示的确定性

### Q2.16 三个演示的 mock LLM 脚本设计

#### 演示①：治理护栏拦截一个危险动作

**目标**：证明 `guardrail()` 函数在代码层面拦截危险命令，且拦截行为不依赖真实 LLM。

**Mock LLM 响应序列**：

```
第 1 轮:
  MockLLM 输入匹配: "用户任务: 清理项目临时文件"
  MockLLM 输出: run_command { command: "rm -rf /tmp/project-cache", reason: "清理缓存文件" }
  （注意：我们构造一个"看起来合理但实际危险的命令"来验证 L1 模式匹配）

Agent 主循环:
  1. LLM 返回 run_command("rm -rf /tmp/project-cache")
  2. 调用 guardrail("rm -rf /tmp/project-cache", workspaceRoot)
  3. L1 模式匹配: "rm -rf" 命中 FILE_DESTRUCTION 模式
  4. 风险评级: dangerous
  5. 进入 HITL → 测试脚本模拟用户输入 'Y'（允许）

第 2 轮:
  审批通过后 Agent 执行命令，获得输出
  MockLLM 输入包含: "命令执行结果: rm -rf /tmp/project-cache 成功"
  MockLLM 输出: finish { success: true, summary: "缓存已清理" }

单元测试断言:
  - guardrail("rm -rf /") → { passed: false, riskLevel: 'fatal' }
  - guardrail("rm -rf /tmp/x") → { passed: false, requiresApproval: true, riskLevel: 'dangerous' }
  - guardrail("cat package.json") → { passed: true, riskLevel: 'safe' }
  - guardrail("rm ./src/old.ts") → { passed: false, requiresApproval: true, riskLevel: 'caution' }
  - guardrail("git push --force") → { passed: false, requiresApproval: true, riskLevel: 'dangerous' }
```

**确定性验证**：无需网络、无需真实 LLM，`guardrail()` 对相同输入始终返回相同结果。

---

#### 演示②：注入一次失败，反馈闭环使 Agent 收到反馈并据此改变下一步动作

**目标**：证明 Agent 在收到测试失败反馈后，会自动修正并重试。

**Mock LLM 响应序列**：

```
第 1 轮:
  MockLLM 输入匹配: "用户任务: 实现 add(a,b) 函数"
  MockLLM 输出: write_file {
    path: "src/math.ts",
    content: "export function add(a: number, b: number): number { return a - b; }"
  }
  （故意输出错误实现：a - b 而非 a + b）

Agent 主循环:
  1. 执行 write_file → 成功
  2. 运行 FeedbackCollector:
     - Diff: src/math.ts 已修改（预期内）
     - Lint: 通过
     - 类型检查: 通过
     - 测试: npm test → 失败！
         ✗ add(2, 3) expected 5, got -1
  3. 反馈回灌到上下文

第 2 轮:
  MockLLM 输入包含: "测试失败: add(2,3) expected 5 got -1. 请修正."
  MockLLM 输出: write_file {
    path: "src/math.ts",
    content: "export function add(a: number, b: number): number { return a + b; }"
  }
  （修正为正确实现）

Agent 主循环:
  1. 执行 write_file → 成功
  2. 运行 FeedbackCollector:
     - 测试: npm test → ✓ 全部通过
  3. 反馈回灌

第 3 轮:
  MockLLM 输入包含: "所有测试通过"
  MockLLM 输出: finish { success: true, summary: "add 函数已实现" }

单元测试断言:
  - Agent 执行了 3 轮
  - 第 1 轮的代码包含 "a - b"
  - 第 2 轮的代码包含 "a + b"
  - 第 2 轮后测试通过
  - Agent 最终返回 success: true
```

**确定性验证**：MockLLM 的响应序列是预设的，每次运行结果一致。验证的是 Agent 主循环能否正确：收集反馈 → 回灌 → 让 LLM 看到反馈 → 修正 → 再验证。

---

#### 演示③：治理（重点维度）的确定性行为 —— 多层护栏组合验证

**目标**：展示 L1 模式匹配、L2 路径围栏、L3 风险分级、L4 HITL、L5 审计日志五层协同工作。

**Mock LLM 响应序列**：

```
场景 A: 正常命令直接通过
  第 1 轮:
    MockLLM 输出: run_command { command: "npm test", reason: "运行测试" }

  预期行为:
    L1: 无危险模式命中 → 通过
    L2: 工作区内操作 → 通过
    L3: safe 级别 → 跳过审批
    L4: 不触发
    L5: 记录 { action: "run_command", command: "npm test", riskLevel: "safe", approved: true }

场景 B: 危险命令触发审批
  第 1 轮:
    MockLLM 输出: run_command { command: "rm -rf ./node_modules", reason: "清理依赖" }

  预期行为:
    L1: "rm -rf" 命中 FILE_DESTRUCTION 模式
    L3: dangerous 级别
    L4: 触发 HITL → 模拟用户拒绝
    L5: 记录 { action: "run_command", command: "rm -rf ./node_modules",
              riskLevel: "dangerous", approved: false, reason: "用户拒绝" }
    → 反馈回灌: "动作被拒绝: 用户拒绝了危险操作 'rm -rf ./node_modules'"

场景 C: 路径越界无条件拒绝
  第 1 轮:
    MockLLM 输出: read_file { path: "/etc/passwd" }

  预期行为:
    L1: 无危险模式命中（read_file 本身不是危险命令）
    L2: "/etc/passwd" 在工作区外 → BLOCKED（硬拦截，不可审批）
    L3: 不适用
    L4: 不触发（BLOCKED 不可审批）
    L5: 记录 { action: "read_file", path: "/etc/passwd", blocked: true, reason: "路径越界" }
    → 反馈回灌: "动作被阻止: 尝试读取工作区外的文件 '/etc/passwd'"

场景 D: 同类别审批记忆
  第 1 轮: MockLLM 输出 run_command { command: "rm ./src/old1.ts" }
    → L3: caution 级别 → L4 HITL → 用户按 'A'（允许所有同类）
    → 会话白名单加入 FILE_DESTRUCTION

  第 2 轮: MockLLM 输出 run_command { command: "rm ./src/old2.ts" }
    → L3: caution → 检查会话白名单 → FILE_DESTRUCTION 已批准 → 直接执行
    → L5 记录: { approved: true, autoApproved: true, reason: "会话白名单" }
```

**单元测试断言**：

```typescript
describe('多层护栏组合', () => {
  it('正常命令应直接通过', () => {
    const result = guardrail('npm test', workspaceRoot);
    expect(result.passed).toBe(true);
    expect(result.riskLevel).toBe('safe');
    expect(result.requiresApproval).toBe(false);
  });

  it('危险命令应触发审批', () => {
    const result = guardrail('rm -rf ./node_modules', workspaceRoot);
    expect(result.passed).toBe(false);
    expect(result.riskLevel).toBe('dangerous');
    expect(result.requiresApproval).toBe(true);
  });

  it('工作区外路径应无条件拒绝', () => {
    const result = guardrail('cat /etc/passwd', workspaceRoot);
    expect(result.passed).toBe(false);
    expect(result.riskLevel).toBe('fatal');
    expect(result.requiresApproval).toBe(false); // 不审批，直接拒绝
  });

  it('同类别审批记忆应在会话内生效', () => {
    const cache = new SessionApprovalCache();
    cache.approve(DangerCategory.FILE_DESTRUCTION);

    const result1 = guardrail('rm ./a.ts', workspaceRoot, cache);
    expect(result1.requiresApproval).toBe(false);
    expect(result1.autoApproved).toBe(true);

    // 不同类别仍需审批
    const result2 = guardrail('git push --force', workspaceRoot, cache);
    expect(result2.requiresApproval).toBe(true);
  });

  it('审计日志应记录所有动作', () => {
    const logger = new AuditLogger();
    guardrail('npm test', workspaceRoot, undefined, logger);
    guardrail('rm -rf /', workspaceRoot, undefined, logger);

    const logs = logger.getAll();
    expect(logs).toHaveLength(2);
    expect(logs[0].riskLevel).toBe('safe');
    expect(logs[1].riskLevel).toBe('fatal');
  });
});
```

---

## 总结：第二轮关键澄清

| 问题 | 原第一轮 | 第二轮澄清 |
|------|---------|-----------|
| 命名 | 多处不一致 | 统一为 `codeharness`（包名/命令/配置/目录） |
| HITL 状态机 | 仅列出状态名 | 完整状态图 + DENIED/TIMED_OUT 独立 + 会话级白名单按危险类别 |
| 护栏顺序 | L1→L2→L3→L4→L5 流水线 | L1/L2 硬拦截（不可审批），L3 风险评级，L4 条件触发，L5 始终执行 |
| 反馈收集 | 全部运行 | 依赖短路（构建失败→跳过测试）+ 一次性汇总回灌 |
| 动作 Schema | 5 个动作类型 | 12 种完整动作类型定义 + ActionResult + GuardrailResult |
| 文件原子性 | 未提及 | 临时文件 + 原子 rename + 自动备份 + 回滚 |
| LLM 适配 | 统一接口 | Adapter 模式 + 强制 Tool Use + 不支持无 Tool Use 的供应商 |
| Workspace Root | "工作区根目录" | 四级检测策略（显式→环境变量→项目标记→cwd） |
| 记忆内容 | 笼统 | 四类记忆明确纳入/排除 + 数据结构定义 |
| 上下文裁剪 | 粗略 | 按 token 数非轮数 + 明确优先级 + 代码块压缩策略 |
| 配置合并 | 未说明 | 深度合并 + 数组完全替代 |
| 中断恢复 | 未涉及 | 优雅中断 + 状态持久化 + 下次启动提示（不支持断点恢复） |
| 退出码 | 未定义 | 10 种退出码统一规范 |
