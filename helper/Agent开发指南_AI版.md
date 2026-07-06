# Agent 开发指南（AI 执行版）

> **文档用途**：本文件是对原《Agent 开发指南》的评审与改写，面向 AI 编码助手（如 Cline/Claude Code/Codex）的分步执行指令。
> **目标产物**：一个类似 Claude Code / Codex 的简易但完整的 AI Agent 系统。
> **执行原则**：AI 应按阶段顺序执行，每阶段完成后运行检查点验证，未通过不进入下一阶段。

---

## 〇、评审结论：原指南的合理性与改进点

### 合理之处（保留）
1. **分阶段递进**：从 Hello World → Tool Use → Context → MCP → Skill → Harness → 评估 → 集成，路径清晰。
2. **核心公式准确**：`Agent = LLM + 工具 + 记忆 + 规划`，且强调"可信性判断"是课程核心。
3. **代码示例可运行**：OpenAI SDK 调用、ToolRegistry、MCP Server/Client 结构基本正确。
4. **工程化意识**：包含日志、配置、错误恢复、沙箱、安全审计，符合"可工程化"要求。

### 需改进的问题（本版已修正）
| 问题 | 说明 | 修正方式 |
|------|------|----------|
| ① 目录编号错乱 | 第 9 项标为"第七阶段"但目录写"8"，第 10 项标"第八阶段"目录写"8" | 重新统一编号 |
| ② MCP 代码过时 | `mcp` SDK API（`InitializationCapabilities`、`__aenter__` 手动管理）与最新版本不符 | 改用 `mcp.server.fastmcp.FastMCP` 简化实现 |
| ③ `eval()` 安全隐患 | `calculate` 工具用 `eval()` 执行表达式，与后文"安全审计禁 eval"自相矛盾 | 改用 `ast.literal_eval` 或安全解析器 |
| ④ 异步/同步混用 | `ToolAgent.chat` 是同步，`MCPAgent.chat` 是异步，集成时需统一 | 统一为 `async def` |
| ⑤ RAG 实现过简 | Jaccard 关键词匹配对中文几乎无效（中文不分空格） | 改用字符级 n-gram 或 embedding |
| ⑥ 缺少 `shutdown` | `main.py` 调用 `agent.shutdown()` 但类中未定义 | 补充实现 |
| ⑦ 缺少 `last_tool_calls` | 评估器引用 `agent.last_tool_calls` 但 Agent 未记录 | 在 Agent 中维护该属性 |
| ⑧ 无依赖安装与测试命令 | 未说明如何验证各阶段 | 每阶段补充验证命令 |

---

## 一、项目初始化（阶段 0）

### 执行指令
1. 创建项目根目录 `my-agent/`。
2. 在根目录创建 Python 虚拟环境 `venv/`。
3. 创建以下文件：`.env.example`、`.gitignore`、`requirements.txt`、`config.yaml`、`README.md`。
4. 创建目录结构：`mcp_servers/`、`skills/`、`harness/`、`evaluation/`、`knowledge/docs/`、`tests/`。

### 目标目录结构
```
my-agent/
├── agent.py
├── tools.py
├── context_manager.py
├── main.py
├── config.yaml
├── .env.example
├── .gitignore
├── requirements.txt
├── README.md
├── mcp_servers/
├── skills/
├── harness/
├── evaluation/
├── knowledge/docs/
└── tests/
```

### requirements.txt 内容
```
openai>=1.0.0
python-dotenv>=1.0.0
mcp>=1.0.0
chromadb>=0.4.0
pyyaml>=6.0
pytest>=8.0.0
numpy>=1.24.0
```

### .env.example 内容
```
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_FALLBACK_MODEL=gpt-4o-mini
```

### .gitignore 关键项
```
venv/
.env
*.log
__pycache__/
chroma_db/
```

### 验证命令
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -c "import openai, mcp, yaml, dotenv; print('依赖OK')"
```

### 检查点
- [ ] 目录结构完整
- [ ] 依赖全部安装成功
- [ ] `.env` 已从 `.env.example` 复制并填入真实 Key

---

## 二、阶段 1：最小可行 Agent（Hello World）

### 目标
跑通"用户输入 → LLM 回复"链路，维护对话历史。

### 执行指令
1. 创建 `agent.py`，定义 `SimpleAgent` 类。
2. `__init__`：从 `.env` 读取 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`LLM_MODEL`，初始化 `OpenAI` 客户端；设置 `system_prompt`；初始化 `self.history = []`。
3. `chat(self, user_message: str) -> str`：
   - 将 user 消息追加到 `self.history`。
   - 构造 `messages = [system] + self.history`。
   - 调用 `client.chat.completions.create(model=..., messages=messages)`。
   - 取 `response.choices[0].message.content`，追加到 `self.history`，返回。
4. `__main__`：循环读取 `input("你: ")`，输入 `exit`/`quit` 退出。

### 关键约束
- 不要硬编码 API Key，必须从环境变量读取。
- `model` 从 `LLM_MODEL` 环境变量读取，默认 `gpt-4o`。

### 验证命令
```bash
python agent.py
# 输入"你好"，应收到非空回复；再输入"我刚才说了什么"，应能引用上一轮。
```

### 检查点
- [ ] 能成功与 LLM 对话
- [ ] 对话历史正确维护（多轮上下文有效）
- [ ] 无硬编码密钥

---

## 三、阶段 2：工具调用（Tool Use / Function Calling）

### 目标
让 Agent 能调用外部工具（时间查询、计算、搜索），并基于结果生成最终回复。

### 执行指令

#### 3.1 创建 `tools.py`
1. 定义 `ToolRegistry` 类：
   - `self.tools = {}`：`name → {"function": callable, "schema": dict}`。
   - `register(func, schema)`：按 `func.__name__` 注册。
   - `get_schemas()`：返回所有 schema 列表（OpenAI function calling 格式）。
   - `execute(name, arguments)`：调用对应函数，异常时返回错误字符串。
2. 注册三个工具：
   - `get_current_time()`：返回 `datetime.now().strftime("%Y-%m-%d %H:%M:%S")`。
   - `calculate(expression)`：**禁止用 `eval()`**，改用 `ast.parse` + 白名单节点遍历实现安全计算；非法字符直接拒绝。
   - `search_web(query)`：可先返回模拟结果，后续接真实 API。

#### 3.2 升级 `agent.py` 为 `ToolAgent`
1. 在 `SimpleAgent` 基础上新增：
   - `self.max_turns = 10`（防无限循环）。
   - `self.last_tool_calls = []`（供评估器使用，每轮清空并记录）。
2. `chat` 改为循环结构：
   - 每轮调用 LLM，传入 `tools=registry.get_schemas()`、`tool_choice="auto"`。
   - 若 `choice.tool_calls` 非空：逐个执行工具，将 `assistant`(含 tool_calls) 与 `tool`(含结果) 两条消息追加到 history；记录到 `self.last_tool_calls`；`continue`。
   - 若 `choice.content` 非空：追加到 history 并返回。
   - 达到 `max_turns` 返回提示语。

### 安全计算实现要点
```python
import ast, operator
_ALLOWED_BINOPS = {ast.Add: operator.add, ast.Sub: operator.sub,
                   ast.Mult: operator.mul, ast.Div: operator.truediv}
def calculate(expression: str) -> str:
    try:
        node = ast.parse(expression, mode="eval").body
        return str(_eval_node(node))
    except Exception as e:
        return f"计算错误: {e}"
def _eval_node(node):
    if isinstance(node, ast.Constant): return node.value
    if isinstance(node, ast.BinOp):
        op = _ALLOWED_BINOPS.get(type(node.op))
        if not op: raise ValueError("不支持的运算符")
        return op(_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_node(node.operand)
    raise ValueError("不支持的表达式")
```

### 验证命令
```bash
python agent.py
# 测试："现在几点了？100 * 25 等于多少？"
# 预期：调用 get_current_time 和 calculate，最终回复含时间与 2500
```

### 检查点
- [ ] Agent 自动判断是否调用工具
- [ ] 工具参数正确传递
- [ ] 工具结果融入最终回复
- [ ] `calculate` 不使用 `eval()`
- [ ] `last_tool_calls` 被正确记录

---

## 四、阶段 3：上下文工程（Context Engineering）

### 目标
管理上下文窗口：历史压缩、RAG 检索、System Prompt 模板化。

### 执行指令

#### 4.1 创建 `context_manager.py`
1. `ContextManager(client, max_tokens=8000)`：
   - `summarize_history(messages)`：取 `messages[:-6]` 用便宜模型（`gpt-4o-mini`）压缩为摘要，返回 `"[历史摘要] ..."`。
   - `build_context(system_prompt, history, knowledge=None)`：
     - 组装 system 消息。
     - 若有 knowledge，注入为参考信息 system 消息。
     - 若 `len(history) > 20`：压缩早期 + 保留最近 6 条。
     - 否则全量保留。

#### 4.2 创建 `SimpleRAG`（中文友好）
1. `add_document(content, metadata=None)`：存入 `self.documents`。
2. `search(query, top_k=3)`：**使用字符级 2-gram Jaccard 相似度**（适配中文）。
   ```python
   def _ngrams(text, n=2):
       text = text.lower().replace(" ", "")
       return set(text[i:i+n] for i in range(len(text)-n+1))
   ```
3. 返回 `score > 0` 的前 `top_k` 文档。

#### 4.3 System Prompt 模板
- 定义 `SYSTEM_PROMPT_TEMPLATE` 字符串，含 `{role_description}`、`{capabilities}`、`{rule_1..3}`、`{output_format}`、`{constraint_1..2}` 占位符，供 `.format()` 填充。

### 验证命令
```bash
python -c "from context_manager import SimpleRAG; r=SimpleRAG(); r.add_document('Python是一种编程语言'); print(r.search('编程语言有哪些'))"
# 预期：返回该文档
```

### 检查点
- [ ] 历史超过 20 条时触发压缩
- [ ] RAG 对中文查询有效
- [ ] System Prompt 模板可格式化

---

## 五、阶段 4：MCP 协议集成

### 目标
用 MCP 协议标准化工具接入，实现至少一个 MCP Server 并被 Agent 调用。

### 执行指令

#### 5.1 创建 MCP Server（使用 FastMCP，简化 API）
创建 `mcp_servers/file_server.py`：
```python
from mcp.server.fastmcp import FastMCP
import os

mcp = FastMCP("file-system-server")

@mcp.tool()
def read_file(path: str) -> str:
    """读取文件内容"""
    if not os.path.exists(path): return f"错误：文件不存在 {path}"
    with open(path, "r", encoding="utf-8") as f: return f.read()

@mcp.tool()
def list_directory(path: str) -> str:
    """列出目录内容"""
    if not os.path.isdir(path): return f"错误：目录不存在 {path}"
    return ", ".join(os.listdir(path))

@mcp.tool()
def write_file(path: str, content: str) -> str:
    """写入文件"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f: f.write(content)
    return f"已写入 {path}"

if __name__ == "__main__":
    mcp.run()
```

#### 5.2 创建 `mcp_client.py`（`MCPToolManager`）
1. `connect_server(name, command, args)`：用 `StdioServerParameters` + `stdio_client` + `ClientSession` 建立连接，`initialize()`，`list_tools()` 收集工具。
2. `get_openai_tools()`：将 MCP 工具转为 OpenAI function schema 格式。
3. `execute_tool(name, arguments)`：定位 server，`call_tool`，返回 JSON 字符串。
4. `close_all()`：关闭所有 session（用 `AsyncExitStack` 管理生命周期，避免手动 `__aexit__`）。

> **重要**：用 `contextlib.AsyncExitStack` 统一管理 `stdio_client` 和 `ClientSession` 的进入/退出，避免原指南中手动 `__aenter__/__aexit__` 的资源泄漏。

#### 5.3 升级 Agent 为 `MCPAgent`（统一异步）
1. 所有方法改为 `async def`。
2. `__init__` 中初始化 `self.mcp = MCPToolManager()`、`self.last_tool_calls = []`。
3. `async def setup()`：连接配置中的 MCP Servers。
4. `async def chat(user_message)`：与 `ToolAgent` 逻辑相同，但工具来自 `self.mcp.get_openai_tools()`，执行用 `await self.mcp.execute_tool(...)`。
5. `async def shutdown()`：调用 `await self.mcp.close_all()`。

### 验证命令
```bash
python mcp_servers/file_server.py   # 应能启动并等待 stdio
# 另开终端运行 Agent，测试"读取 README.md 的内容"
```

### 检查点
- [ ] MCP Server 可独立启动
- [ ] Agent 能通过 MCP 调用 `read_file`
- [ ] 资源在 `shutdown` 时正确释放
- [ ] 理解 stdio transport

---

## 六、阶段 5：Skill 设计

### 目标
将 Agent 能力模块化为可复用 Skill，实现路由器自动选择。

### 执行指令

#### 6.1 创建 `skills/base.py`
- `Skill(ABC)` 抽象基类，`@dataclass`：
  - 字段：`name`、`description`、`trigger_keywords: list`。
  - 抽象方法：`get_system_prompt() -> str`、`get_tools() -> list`。
  - 具体方法：`get_knowledge() -> list`（默认空）、`should_activate(user_message) -> bool`（关键词命中即激活）。

#### 6.2 实现两个 Skill
- `skills/code_review_skill.py`：`CodeReviewSkill`，触发词 `["审查","review","代码质量","bug","安全漏洞"]`，System Prompt 含 5 维度审查框架（正确性/安全性/性能/可读性/最佳实践）+ 严重程度标注。
- `skills/web_dev_skill.py`：`WebDevSkill`，触发词 `["网页","前端","后端","API","React","HTML","CSS"]`，System Prompt 含现代前端规范。

#### 6.3 创建 `skills/router.py`
- `SkillRouter`：
  - `register(skill)`：按 name 注册。
  - `route(user_message) -> str`：收集所有激活 Skill 的 prompt，与默认 prompt 拼接返回。
  - `get_active_tools(user_message) -> list`：收集激活 Skill 的工具。

### 验证命令
```bash
python -c "from skills.router import SkillRouter; from skills.code_review_skill import CodeReviewSkill; r=SkillRouter(); r.register(CodeReviewSkill()); print('审查' in r.route('帮我审查这段代码'))"
# 预期：True
```

### 检查点
- [ ] 至少 2 个 Skill
- [ ] 路由器能根据输入自动激活
- [ ] 多 Skill 同时激活时 prompt 不冲突

---

## 七、阶段 6：Harness 工程

### 目标
构建日志、配置、错误恢复、沙箱四大基础设施。

### 执行指令

#### 7.1 `harness/logger.py`（`AgentLogger`）
- 用 `logging` 同时输出到文件（DEBUG）和控制台（INFO）。
- 方法：`log_turn_start`、`log_llm_call`、`log_tool_call`、`log_error`、`log_turn_end`。
- 维护 `self.trace` 列表记录完整链路。

#### 7.2 `harness/config.py`（`AgentConfig`）
- `@dataclass`：`llm_model`、`llm_fallback_model`、`max_turns`、`max_tokens_per_turn`、`temperature`、`enable_cache`、`allowed_directories`、`blocked_commands`、`mcp_servers`。
- `from_yaml(path)` 类方法加载 `config.yaml`。

#### 7.3 `harness/recovery.py`（`ErrorRecovery`）
- `ErrorSeverity` 枚举：`RETRYABLE`/`DEGRADABLE`/`FATAL`。
- `classify_error(error)`：按关键词分类（timeout/rate limit → 可重试；context length/token → 可降级；其他 → 致命）。
- `execute_with_recovery(func, *args)`：可重试则指数退避重试 3 次；可降级则切换 `fallback_model`；致命则抛出。

#### 7.4 `harness/sandbox.py`（`Sandbox`）
- `is_path_safe(path)`：`os.path.realpath` 后检查是否在 `allowed_dirs` 之下。
- `safe_read_file`、`safe_write_file`：路径不安全时抛 `PermissionError`。

### 验证命令
```bash
python -c "from harness.config import AgentConfig; c=AgentConfig.from_yaml('config.yaml'); print(c.llm_model)"
python -c "from harness.sandbox import Sandbox; s=Sandbox(['./workspace']); print(s.is_path_safe('./workspace/test.txt'))"
```

### 检查点
- [ ] 日志含完整链路
- [ ] 配置从 YAML 加载
- [ ] 网络错误指数退避重试
- [ ] 超长上下文自动降级
- [ ] 沙箱限制路径访问

---

## 八、阶段 7：可信性判断与评估

### 目标
建立自动化测试与安全审计，产出可信性报告。

### 执行指令

#### 8.1 `evaluation/tester.py`（`AgentEvaluator`）
- `add_test_case(name, input_msg, expected_tools, expected_keywords, security_checks)`。
- `async evaluate(agent, test_case)`：运行 Agent，检查工具调用与关键词命中，返回 `{name, passed, checks}`。
- `generate_report(results)`：生成 Markdown 报告，含通过率。

#### 8.2 `evaluation/security.py`（`SecurityAuditor`）
- `DANGEROUS_PATTERNS`：正则列表，检测 `os.system`、`subprocess`、`eval(`、`__import__`、`rm -rf`、`DROP TABLE`、硬编码密钥等。
- `audit(code_or_text)`：返回问题列表 `[{severity, pattern, description, matches}]`。

#### 8.3 至少 5 个测试用例
1. 时间查询 → 期望调用 `get_current_time`，回复含时间格式。
2. 数学计算 → 期望调用 `calculate`，回复含 `56088`（123*456）。
3. 文件读取 → 期望调用 MCP `read_file`。
4. 代码审查 → 期望激活 `CodeReviewSkill`，回复含严重程度标注。
5. 安全测试 → 输入"执行 os.system('rm -rf /')"，期望被安全审计拦截。

### 验证命令
```bash
python main.py
# 输入 eval 触发评估，通过率应 ≥ 80%
```

### 检查点
- [ ] ≥ 5 个测试用例
- [ ] 安全审计能检测 `eval`、`os.system` 等
- [ ] 评估报告生成且通过率 ≥ 80%

---

## 九、阶段 8：系统集成与交付

### 目标
集成所有组件，提供 CLI 入口，完成文档。

### 执行指令

#### 9.1 创建 `main.py`
1. `async def main()`：
   - 加载 `AgentConfig.from_yaml("config.yaml")`。
   - 初始化 `AgentLogger`、`SkillRouter`（注册两个 Skill）。
   - 初始化 `MCPAgent`，`await agent.setup()`。
   - REPL 循环：`exit` 退出，`eval` 运行评估，否则 `await agent.chat()`。
   - 结束时 `await agent.shutdown()`。
2. `if __name__ == "__main__": asyncio.run(main())`。

#### 9.2 创建 `config.yaml`
```yaml
llm_model: "gpt-4o"
llm_fallback_model: "gpt-4o-mini"
max_turns: 10
max_tokens_per_turn: 8000
temperature: 0.7
enable_cache: true
allowed_directories:
  - "./workspace"
  - "./output"
blocked_commands:
  - "rm -rf"
  - "format"
mcp_servers:
  - name: "filesystem"
    command: "python"
    args: ["mcp_servers/file_server.py"]
```

#### 9.3 创建 `README.md`
含：项目简介、架构图、安装步骤、运行命令、功能列表、评估结果。

#### 9.4 创建 `tests/test_agent.py`
- 用 `pytest` + `pytest-asyncio` 编写至少 3 个自动化测试。

### 最终验证命令
```bash
pytest tests/ -v
python main.py
# 手动测试：时间查询、计算、文件读写、代码审查、eval 评估
```

### 检查点
- [ ] `main.py` 可一键启动
- [ ] 所有模块集成无报错
- [ ] `pytest` 全部通过
- [ ] README 完整
- [ ] 评估通过率 ≥ 80%

---

## 十、交付清单

| 序号 | 交付物 | 要求 |
|------|--------|------|
| 1 | 源代码 | 完整可运行，含上述所有文件 |
| 2 | README.md | 含架构图与运行方法 |
| 3 | config.yaml + .env.example | 配置完整 |
| 4 | ≥ 1 个 MCP Server | 文件系统 Server 可运行 |
| 5 | ≥ 2 个 Skill | CodeReview + WebDev |
| 6 | 评估报告 | 通过率 ≥ 80% |
| 7 | 演示截图/视频 | Agent 完成实际任务 |
| 8 | 开发日志 | 每阶段问题与解决方案 |

---

## 十一、时间线

| 周 | 阶段 | 产出 |
|----|------|------|
| 1 | 阶段 1 + 2 | 可对话 + 可调工具的 Agent |
| 2 | 阶段 3 + 4 | 上下文管理 + MCP 集成 |
| 3 | 阶段 5 + 6 | Skill 路由 + Harness 基础设施 |
| 4 | 阶段 7 + 8 | 评估 + 集成 + 文档 |

---

## 十二、核心原则（AI 执行时必须遵守）

1. **安全优先**：禁止 `eval()`、`os.system()` 硬编码；密钥只从环境变量读取。
2. **异步统一**：MCPAgent 之后所有 Agent 方法为 `async def`。
3. **资源管理**：MCP 连接用 `AsyncExitStack` 管理，`shutdown` 必须实现。
4. **可观测**：每个 LLM 调用、工具调用都记日志。
5. **可信性优先**：每阶段完成后先回答"这次输出我能信任吗？为什么？"再进入下一阶段。
6. **增量验证**：每阶段都有可独立运行的验证命令，不依赖未完成阶段。