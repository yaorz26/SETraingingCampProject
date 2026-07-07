# CodeHarness

AI 编程助手框架 —— 为 AI 编码智能体提供治理、反馈、安全与分发能力。

一个 CLI 工具，开发者用自然语言描述编码任务，Agent 自动读写代码、执行命令、运行测试，根据测试结果自我修正，在危险操作时暂停等待人工审批。

**核心哲学**：`Agent = LLM + Harness`。LLM 是决策引擎，Harness 是工程层——治理、反馈、上下文、安全、分发。

## 安装

```bash
npm install -g codeharness
# 或
npx codeharness
```

**要求**：Node.js 18+

## 快速开始

```bash
# 初始化配置
codeharness init

# 添加 OpenAI 兼容提供商（如 DeepSeek）
codeharness provider add deepseek --base-url https://api.deepseek.com/v1 --model deepseek-chat

# 设置 API Key
codeharness key set custom-deepseek

# 设置默认配置
codeharness config set provider openai-compatible
codeharness config set model deepseek-chat

# 运行任务
codeharness run "给 UserService 添加单元测试"

# 交互式对话
codeharness chat

# 预览模式（不修改文件）
codeharness run --dry-run "重构 auth 模块"
```

## 命令一览

| 命令 | 说明 |
|------|------|
| `codeharness run <任务>` | 执行编码任务 |
| `codeharness chat` | 进入交互式对话模式 |
| `codeharness init` | 初始化配置 |
| `codeharness config set <key> <value>` | 设置默认配置 |
| `codeharness config show` | 查看当前配置 |
| `codeharness provider add <name> --base-url <url> --model <model>` | 添加自定义提供商 |
| `codeharness provider list` | 列出所有提供商 |
| `codeharness provider remove <name>` | 删除提供商 |
| `codeharness key set <provider>` | 设置 API Key |
| `codeharness key status` | 查看 Key 状态 |
| `codeharness key clear <provider>` | 清除 Key |

### 对话模式内命令

| 命令 | 功能 |
|------|------|
| `/new` | 开始新对话 |
| `/list` | 列出所有会话 |
| `/save` | 保存当前对话 |
| `/clear` | 清空上下文 |
| `/export [path]` | 导出当前对话 |
| `/history` | 查看对话历史 |
| `/help` | 显示帮助 |
| `exit` / `quit` | 退出（自动保存） |

### 会话管理

```bash
codeharness chat --list              # 列出所有会话
codeharness chat --resume <id>       # 恢复历史会话
codeharness chat --delete <id>       # 删除会话
codeharness chat --export <id>       # 导出到文件
codeharness chat --import <file>     # 从文件导入
```

## 运行模式

| 模式 | 参数 | 说明 |
|------|------|------|
| 交互模式 | 默认 | 彩色终端输出，危险操作弹确认 |
| 非交互模式 | `--non-interactive` | 无颜色，自动拒绝危险操作 |
| 预览模式 | `--dry-run` | 只看不写文件 |
| 详细模式 | `--verbose` | 输出 LLM 请求/响应详情 |

## 配置

配置文件存储在 `~/.codeharness/config.yaml`（全局）或 `.codeharness.yaml`（项目级）。

```yaml
version: 1

llm:
  provider: openai-compatible
  model: deepseek-v4-pro
  baseUrl: https://njusehub.info/v1
  fallbacks:
    - provider: anthropic
      model: claude-sonnet-4-20250514
    - provider: ollama
      model: qwen2.5-coder:14b

  customProviders:
    - name: vllm
      baseUrl: http://localhost:8000/v1
      model: qwen2.5-72b

guardrails:
  enabled: true
  timeout_seconds: 120

feedback:
  test_command: npm test
  lint_command: npm run lint
  typecheck_command: npx tsc --noEmit

interaction:
  mode: interactive
  danger_policy: ask
```

### 优先级

CLI 参数 > 环境变量(`CODEHARNESS_` 前缀) > 项目配置 > 全局配置 > 默认值

## 支持的 LLM

| 提供商 | 模型 | 说明 |
|--------|------|------|
| OpenAI | GPT-4o, GPT-4o-mini, GPT-4-turbo | 原生支持 |
| Anthropic | Claude Sonnet, Claude Haiku | 原生支持 |
| Ollama | 任意本地模型 | 原生支持 |
| OpenAI 兼容 | 任意兼容 API | 通过 `provider add` 添加 |

## 护栏系统

五层纵深防御：

1. **L1 模式匹配** — 8 类危险模式，21 个正则规则，Unix + Windows
2. **L2 路径边界** — 工作区隔离，敏感路径检测
3. **L3 风险分级** — SAFE / CAUTION / DANGEROUS / FATAL
4. **L4 人工审批** — 交互式确认（Y/N/A/S），120s 超时，会话白名单
5. **L5 审计日志** — 始终记录所有操作和结果

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 配置错误 |
| 2 | 认证错误 |
| 3 | 网络错误 |
| 7 | 护栏拦截 |
| 8 | 任务失败 |
| 10 | Node.js 版本太低 |
| 130 | 用户中断（Ctrl+C） |

## 架构

```
CodeHarness 架构
┌─────────────────────────────────────────┐
│  CLI 层 (commander + chalk)             │
│  run / chat / config / provider / key   │
├─────────────────────────────────────────┤
│  Agent 主循环 (runAgent)                 │
│  上下文 → LLM → 解析 → 护栏 → 执行       │
├─────────────────────────────────────────┤
│  核心模块                                │
│  ├── 动作解析器 (zod)                    │
│  ├── 动作分发器                          │
│  ├── 停机检测器                          │
│  ├── 漂移检测器                          │
│  ├── Finish 拦截器                       │
│  └── 上下文构建器                        │
├─────────────────────────────────────────┤
│  护栏系统                                │
│  ├── 模式注册表 (L1)                     │
│  ├── 边界检查 (L2)                       │
│  ├── 风险评估 (L3)                       │
│  ├── 人工审批 (L4)                       │
│  └── 流水线 (L5)                         │
├─────────────────────────────────────────┤
│  反馈系统                                │
│  ├── Diff 追踪器                         │
│  └── 收集器 (test/lint/typecheck)        │
├─────────────────────────────────────────┤
│  LLM 层                                  │
│  ├── OpenAI / Anthropic / Ollama         │
│  ├── OpenAI 兼容（自定义 Base URL）       │
│  ├── Mock LLM（测试用）                  │
│  └── 提供商降级链                        │
├─────────────────────────────────────────┤
│  基础设施                                │
│  ├── 工作区检测器                        │
│  ├── Shell 执行器                        │
│  ├── 文件操作                            │
│  ├── 凭据存储 (AES-256-GCM)              │
│  ├── Token 计数器                        │
│  ├── 成本追踪器                          │
│  ├── 记忆管理器                          │
│  ├── 会话存储                            │
│  └── 日志 (pino)                         │
└─────────────────────────────────────────┘
```

## 安全

- API Key 加密存储在系统凭据管理器（AES-256-GCM）
- 所有命令经过五层护栏系统检查
- 会话白名单仅当前会话有效，不持久化
- 路径操作限制在工作区边界内
- 敏感文件（.env, *.key, /etc/passwd, ~/.ssh）始终拦截

**重要提示**：CodeHarness 护栏是防御性编程，不是安全沙箱。始终审查 Agent 的操作，尤其是在交互模式下。

## 开发

```bash
# 安装依赖
pnpm install

# 运行测试
npm test

# 类型检查
npx tsc --noEmit

# 构建
npm run build
```

## 许可证

ISC