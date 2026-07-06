# 🤖 Agent 开发指南

> **课程名称**：智能化软件工程师训练营  
> **核心任务**：从零构建一个完整的 AI Agent 系统  
> **目标定位**：培养"AI 原生软件工程师"——能驾驭 AI 工具链、能对 AI 产出做可信性判断、能把 AI 能力工程化嵌入可信软件系统

---

## 目录

1. [前置理解：什么是 Agent](#1-前置理解什么是-agent)
2. [Agent 核心架构总览](#2-agent-核心架构总览)
3. [第一阶段：Hello World —— 最小可行 Agent](#3-第一阶段hello-world--最小可行-agent)
4. [第二阶段：工具调用（Tool Use / Function Calling）](#4-第二阶段工具调用tool-use--function-calling)
5. [第三阶段：上下文工程（Context Engineering）](#5-第三阶段上下文工程context-engineering)
6. [第四阶段：MCP 协议集成](#6-第四阶段mcp-协议集成)
7. [第五阶段：Skill 设计](#7-第五阶段skill-设计)
8. [第六阶段：Harness 工程](#8-第六阶段harness-工程)
9. [第七阶段：可信性判断与评估](#7-第七阶段可信性判断与评估)
10. [第八阶段：完整 Agent 系统集成](#8-第八阶段完整-agent-系统集成)
11. [技术栈推荐](#9-技术栈推荐)
12. [作业提交清单](#10-作业提交清单)

---

## 1. 前置理解：什么是 Agent

### 1.1 概念

> **Agent = LLM + 工具 + 记忆 + 规划**

一个 AI Agent 不是简单的"聊天机器人"。它是一个**自治系统**，能够：

| 能力 | 说明 |
|------|------|
| 🧠 **感知** | 理解用户意图、读取上下文 |
| 🔧 **行动** | 调用工具（API、文件系统、数据库、浏览器等） |
| 📝 **记忆** | 短时记忆（对话历史）+ 长时记忆（知识库/向量数据库） |
| 🔁 **规划** | 将复杂任务拆解为多个步骤，逐步执行并自我纠错 |
| ✅ **判断** | 对 AI 自身的产出做可信性验证 |

### 1.2 本课程的三种工作模式

| 模式 | 英文 | 含义 |
|------|------|------|
| Vibe Coding | VC | 用自然语言让 AI 写代码，人工审查后合入 |
| Vibe Engineering | VE | AI 产出 + 系统性验证 + 工程化集成的开发方式 |
| **Agentic Engineering** | **AE** | 让 Agent 自主规划、执行、验证，人类做最终决策 |

> 本课程最终要求你达到 **Agentic Engineering** 的层次。

### 1.3 类比：从"写代码的人"到"管理 AI 的经理"

```
传统开发：你 → 写每一行代码 → 编译 → 测试 → 部署
Agent 开发：你 → 定义目标 → Agent 规划 → Agent 执行 → Agent 验证 → 你做最终判断
```

你的角色从"程序员"变成"架构师 + 审查者"。

---

## 2. Agent 核心架构总览

```
┌──────────────────────────────────────────────────┐
│                   用户界面（CLI / Web / API）        │
└─────────────────────┬────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────┐
│                  🎯 编排器 (Orchestrator)           │
│         任务分解 · 工具调度 · 循环控制 · 错误恢复      │
└─────────────────────┬────────────────────────────┘
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                 ▼
┌─────────┐    ┌──────────┐     ┌──────────┐
│  🧠 LLM │    │  🔧 工具层 │     │ 📝 记忆层 │
│ GPT-4   │    │ Tool Use │     │ 对话历史  │
│ Claude  │    │ MCP协议  │     │ 向量存储  │
│ 本地模型 │    │ 自定义Skill│    │ 知识图谱  │
└─────────┘    └──────────┘     └──────────┘
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                 ▼
┌─────────┐    ┌──────────┐     ┌──────────┐
│ 📁 文件  │    │ 🌐 Web   │     │ 🗄️ 数据库 │
│ 系统    │    │ API/浏览器│     │ SQL/NoSQL│
└─────────┘    └──────────┘     └──────────┘
```

---

## 3. 第一阶段：Hello World —— 最小可行 Agent

### 🎯 目标
跑通"用户输入 → LLM 回复"的最基本链路。

### 📋 任务清单

#### 步骤 1.1：环境准备
```bash
# 创建项目目录
mkdir my-agent && cd my-agent

# 初始化 Python 项目
python -m venv venv
.\venv\Scripts\activate   # Windows
# source venv/bin/activate  # Mac/Linux

# 安装核心依赖
pip install openai python-dotenv
```

#### 步骤 1.2：获取 API Key
1. 注册 OpenAI / 智谱 / DeepSeek 等 LLM 服务商
2. 创建 `.env` 文件：
```
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1  # 或用代理
```

#### 步骤 1.3：编写最简 Agent
创建 `agent.py`：

```python
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class SimpleAgent:
    def __init__(self):
        self.client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL")
        )
        self.system_prompt = "你是一个有用的AI助手。"
        self.history = []  # 对话记忆
    
    def chat(self, user_message: str) -> str:
        # 添加用户消息到历史
        self.history.append({"role": "user", "content": user_message})
        
        # 构建消息列表
        messages = [{"role": "system", "content": self.system_prompt}] + self.history
        
        # 调用 LLM
        response = self.client.chat.completions.create(
            model="gpt-4o",  # 或 gpt-3.5-turbo / deepseek-chat
            messages=messages
        )
        
        # 提取回复
        reply = response.choices[0].message.content
        
        # 添加助手回复到历史
        self.history.append({"role": "assistant", "content": reply})
        
        return reply

# 测试
if __name__ == "__main__":
    agent = SimpleAgent()
    while True:
        user_input = input("你: ")
        if user_input.lower() in ["exit", "quit"]:
            break
        response = agent.chat(user_input)
        print(f"Agent: {response}")
```

#### ✅ 检查点
- [ ] 能成功与 LLM 对话
- [ ] 对话历史能正确维护
- [ ] 理解 `system_prompt` 的作用

---

## 4. 第二阶段：工具调用（Tool Use / Function Calling）

### 🎯 目标
让 Agent 能够**调用外部工具**，而不仅仅是生成文本。

### 核心概念

LLM 本身不能执行代码、访问文件、查询数据库。但它可以**生成函数调用的 JSON**，由我们的 Agent 框架去真正执行。

```
用户: "现在几点了？"
  → LLM: 生成 {"function": "get_current_time", "arguments": {}}
  → Agent 框架: 执行 get_current_time() → "2026-07-06 14:30:00"
  → LLM: "现在是 2026年7月6日 14:30"
```

### 📋 任务清单

#### 步骤 2.1：定义工具

创建 `tools.py`：

```python
import json
import datetime
import requests

class ToolRegistry:
    """工具注册中心"""
    
    def __init__(self):
        self.tools = {}
    
    def register(self, func, schema):
        """注册一个工具：绑定 Python 函数与其 JSON Schema"""
        self.tools[func.__name__] = {
            "function": func,
            "schema": schema
        }
    
    def get_schemas(self):
        """获取所有工具的 OpenAI 格式 Schema 列表"""
        return [t["schema"] for t in self.tools.values()]
    
    def execute(self, name: str, arguments: dict):
        """执行指定工具"""
        if name not in self.tools:
            return f"错误：未找到工具 {name}"
        func = self.tools[name]["function"]
        try:
            return func(**arguments)
        except Exception as e:
            return f"工具执行错误: {str(e)}"

# ========== 注册一些示例工具 ==========

registry = ToolRegistry()

def get_current_time() -> str:
    """获取当前时间"""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

registry.register(get_current_time, {
    "type": "function",
    "function": {
        "name": "get_current_time",
        "description": "获取当前的日期和时间",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
})

def calculate(expression: str) -> str:
    """安全地计算数学表达式"""
    # 安全计算：只允许数字和基本运算符
    allowed = set("0123456789.+-*/() ")
    if not all(c in allowed for c in expression):
        return "错误：表达式包含不允许的字符"
    try:
        result = eval(expression)
        return str(result)
    except Exception as e:
        return f"计算错误: {str(e)}"

registry.register(calculate, {
    "type": "function",
    "function": {
        "name": "calculate",
        "description": "计算数学表达式，支持加减乘除和括号",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "数学表达式，例如 '2 + 3 * 4'"
                }
            },
            "required": ["expression"]
        }
    }
})

def search_web(query: str) -> str:
    """搜索网页（模拟）"""
    # 实际应接入搜索 API（如 Bing Search API / SerpAPI）
    return f"[模拟搜索结果] 关于 '{query}' 的搜索结果：暂无真实搜索API接入。"

registry.register(search_web, {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "在互联网上搜索信息",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词"
                }
            },
            "required": ["query"]
        }
    }
})
```

#### 步骤 2.2：升级 Agent 支持工具调用

更新 `agent.py`：

```python
import json
from openai import OpenAI
from tools import registry  # 导入工具注册表

class ToolAgent:
    def __init__(self):
        self.client = OpenAI(...)  # 同前
        self.system_prompt = """你是一个具有工具调用能力的AI助手。
当你需要获取实时信息、计算或搜索时，请使用提供的工具函数。
调用工具后，基于工具返回的结果给出最终回答。"""
        self.history = []
        self.max_turns = 10  # 防止无限循环
    
    def chat(self, user_message: str) -> str:
        self.history.append({"role": "user", "content": user_message})
        
        for _ in range(self.max_turns):
            messages = [{"role": "system", "content": self.system_prompt}] + self.history
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=registry.get_schemas(),  # 🔑 传入工具定义
                tool_choice="auto"              # 🔑 让 LLM 自动决定是否调用工具
            )
            
            choice = response.choices[0].message
            
            # 情况1: LLM 要调用工具
            if choice.tool_calls:
                for tool_call in choice.tool_calls:
                    func_name = tool_call.function.name
                    func_args = json.loads(tool_call.function.arguments)
                    
                    print(f"  🔧 [Tool] 调用 {func_name}({func_args})")
                    
                    # 执行工具
                    result = registry.execute(func_name, func_args)
                    
                    # 将工具调用和结果加入历史
                    self.history.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": func_name,
                                    "arguments": tool_call.function.arguments
                                }
                            }
                        ]
                    })
                    self.history.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": str(result)
                    })
                # 继续循环，让 LLM 基于工具结果生成回复
                continue
            
            # 情况2: LLM 直接回复
            if choice.content:
                self.history.append({"role": "assistant", "content": choice.content})
                return choice.content
        
        return "已达到最大对话轮数，请简化您的问题。"
```

#### 步骤 2.3：测试工具调用

```python
if __name__ == "__main__":
    agent = ToolAgent()
    # 测试需要工具的查询
    print(agent.chat("现在几点了？100 * 25 等于多少？"))
```

#### ✅ 检查点
- [ ] Agent 能自动判断何时需要调用工具
- [ ] 工具调用参数正确传递
- [ ] 工具返回结果正确融入最终回复
- [ ] 理解 `tool_choice: "auto"` vs `"required"` vs `"none"` 的区别

---

## 5. 第三阶段：上下文工程（Context Engineering）

### 🎯 目标
掌握如何高效管理 LLM 的**上下文窗口**——这是 Agent 质量的**核心要素**。

### 核心概念

> **上下文工程 = 决定"送什么信息给 LLM"以及"送多少"的工程实践**

| 技术 | 说明 |
|------|------|
| System Prompt 设计 | 角色设定、规则约束、输出格式 |
| 对话历史管理 | 滑动窗口、摘要压缩、重要消息标记 |
| RAG（检索增强生成）| 从知识库/文档中检索相关内容注入上下文 |
| Few-shot 示例 | 在 Prompt 中提供示例引导输出格式 |

### 📋 任务清单

#### 步骤 5.1：实现上下文压缩器

创建 `context_manager.py`：

```python
from openai import OpenAI

class ContextManager:
    """管理 Agent 的上下文窗口"""
    
    def __init__(self, client: OpenAI, max_tokens: int = 8000):
        self.client = client
        self.max_tokens = max_tokens
    
    def summarize_history(self, messages: list) -> str:
        """当历史过长时，将早期对话压缩为摘要"""
        early_messages = messages[:-6]  # 保留最近3轮对话
        recent_messages = messages[-6:]
        
        summary_prompt = [
            {"role": "system", "content": "请将以下对话历史压缩为一段简洁的摘要，保留关键信息。"},
            {"role": "user", "content": str(early_messages)}
        ]
        
        response = self.client.chat.completions.create(
            model="gpt-4o-mini",  # 用便宜模型做摘要
            messages=summary_prompt
        )
        
        summary = response.choices[0].message.content
        return f"[历史摘要] {summary}"
    
    def build_context(self, system_prompt: str, history: list, 
                      knowledge: list = None) -> list:
        """构建最终发送给 LLM 的上下文"""
        messages = [{"role": "system", "content": system_prompt}]
        
        # 注入检索到的知识
        if knowledge:
            knowledge_text = "\n".join([f"- {k}" for k in knowledge])
            messages.append({
                "role": "system",
                "content": f"以下是与当前问题相关的参考信息：\n{knowledge_text}"
            })
        
        # 处理历史
        if len(history) > 20:  # 超过20条消息时压缩
            summary = self.summarize_history(history)
            messages.append({"role": "system", "content": summary})
            messages.extend(history[-6:])  # 保留最近3轮
        else:
            messages.extend(history)
        
        return messages
```

#### 步骤 5.2：实现简单 RAG（检索增强生成）

```python
import numpy as np

class SimpleRAG:
    """最简单的基于关键词的 RAG 实现"""
    
    def __init__(self):
        self.documents = []  # 存储文档片段
    
    def add_document(self, content: str, metadata: dict = None):
        """添加文档到知识库"""
        self.documents.append({
            "content": content,
            "metadata": metadata or {}
        })
    
    def search(self, query: str, top_k: int = 3) -> list:
        """基于关键词匹配的简单检索"""
        query_words = set(query.lower().split())
        scored = []
        
        for doc in self.documents:
            doc_words = set(doc["content"].lower().split())
            # 计算 Jaccard 相似度
            intersection = len(query_words & doc_words)
            union = len(query_words | doc_words)
            score = intersection / union if union > 0 else 0
            scored.append((score, doc))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored[:top_k] if score > 0]
```

#### 步骤 5.3：System Prompt 设计模板

```python
SYSTEM_PROMPT_TEMPLATE = """## 角色
你是一个{role_description}。

## 能力范围
{capabilities}

## 行为规则
1. {rule_1}
2. {rule_2}
3. {rule_3}

## 输出格式
{output_format}

## 约束
- {constraint_1}
- {constraint_2}
"""
```

#### ✅ 检查点
- [ ] 理解上下文窗口限制对 Agent 行为的影响
- [ ] 实现了对话历史的压缩/滑动窗口
- [ ] 实现了基本的 RAG 检索
- [ ] System Prompt 有清晰的角色、规则和格式定义

---

## 6. 第四阶段：MCP 协议集成

### 🎯 目标
使用 **Model Context Protocol (MCP)** 标准化工具接入方式。

### 核心概念

MCP 是 Anthropic 提出的开放协议，让 LLM 以**统一的方式**连接各种工具和数据源：

```
Agent ←→ MCP Client ←→ MCP Server (文件系统)
                    ←→ MCP Server (数据库)
                    ←→ MCP Server (浏览器)
                    ←→ MCP Server (自定义工具)
```

### 📋 任务清单

#### 步骤 6.1：安装 MCP SDK

```bash
pip install mcp
```

#### 步骤 6.2：创建一个 MCP Server

创建 `mcp_servers/file_server.py`：

```python
from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationCapabilities
import mcp.server.stdio
import os

# 创建 MCP Server
server = Server("file-system-server")

@server.list_tools()
async def list_tools():
    """告诉 Client 我们有哪些工具"""
    return [
        {
            "name": "read_file",
            "description": "读取文件内容",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"}
                },
                "required": ["path"]
            }
        },
        {
            "name": "list_directory",
            "description": "列出目录内容",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "目录路径"}
                },
                "required": ["path"]
            }
        },
        {
            "name": "write_file",
            "description": "写入文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"},
                    "content": {"type": "string", "description": "文件内容"}
                },
                "required": ["path", "content"]
            }
        }
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    """处理工具调用"""
    if name == "read_file":
        path = arguments["path"]
        if not os.path.exists(path):
            return {"error": f"文件不存在: {path}"}
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    
    elif name == "list_directory":
        path = arguments["path"]
        if not os.path.isdir(path):
            return {"error": f"目录不存在: {path}"}
        items = os.listdir(path)
        return {"items": items}
    
    elif name == "write_file":
        path = arguments["path"]
        content = arguments["content"]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "message": f"文件已写入: {path}"}
    
    return {"error": f"未知工具: {name}"}

async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationCapabilities(
                sampling={},
                roots={},
                experimental={}
            )
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
```

#### 步骤 6.3：创建 MCP Client 集成到 Agent

创建 `mcp_client.py`：

```python
import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class MCPToolManager:
    """管理与 MCP Server 的连接"""
    
    def __init__(self):
        self.servers = {}       # server_name → session
        self.all_tools = {}     # tool_name → (server_name, tool_info)
    
    async def connect_server(self, name: str, command: str, args: list):
        """连接一个 MCP Server"""
        server_params = StdioServerParameters(
            command=command,
            args=args
        )
        
        # 建立连接
        read, write = await stdio_client(server_params).__aenter__()
        session = await ClientSession(read, write).__aenter__()
        await session.initialize()
        
        self.servers[name] = session
        
        # 获取该 Server 的工具列表
        tools_result = await session.list_tools()
        for tool in tools_result.tools:
            self.all_tools[tool.name] = (name, tool)
        
        print(f"  ✅ MCP Server '{name}' 已连接，提供 {len(tools_result.tools)} 个工具")
    
    def get_openai_tools(self) -> list:
        """将 MCP 工具转为 OpenAI function calling 格式"""
        return [
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": info.description,
                    "parameters": info.inputSchema
                }
            }
            for name, (_, info) in self.all_tools.items()
        ]
    
    async def execute_tool(self, name: str, arguments: dict) -> str:
        """执行 MCP 工具"""
        if name not in self.all_tools:
            return f"未知工具: {name}"
        
        server_name, _ = self.all_tools[name]
        session = self.servers[server_name]
        result = await session.call_tool(name, arguments)
        return json.dumps(result.content, ensure_ascii=False)
    
    async def close_all(self):
        for session in self.servers.values():
            await session.__aexit__(None, None, None)
```

#### 步骤 6.4：在 Agent 中使用 MCP

```python
class MCPAgent:
    def __init__(self):
        self.mcp = MCPToolManager()
        # ... LLM 客户端初始化
    
    async def setup(self):
        """启动时连接 MCP Servers"""
        await self.mcp.connect_server(
            "filesystem",
            "python",
            ["mcp_servers/file_server.py"]
        )
    
    async def chat(self, user_message: str) -> str:
        # 构建请求时使用 MCP 工具
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=self.mcp.get_openai_tools()  # 🔑 MCP 工具
        )
        
        # 工具调用时通过 MCP 执行
        if choice.tool_calls:
            for tc in choice.tool_calls:
                result = await self.mcp.execute_tool(
                    tc.function.name,
                    json.loads(tc.function.arguments)
                )
                # ... 处理结果
```

#### ✅ 检查点
- [ ] 理解 MCP 协议的设计思想（Client-Server 解耦）
- [ ] 成功运行至少一个 MCP Server
- [ ] Agent 能通过 MCP 调用工具
- [ ] 理解 stdio transport vs HTTP transport

---

## 7. 第五阶段：Skill 设计

### 🎯 目标
将 Agent 的能力模块化为可复用的 **Skill**（技能包）。

### 核心概念

> **Skill = 专业知识 + 工具 + Prompt 模板 的组合**，让 Agent 在特定领域表现出专业水准。

| Skill 组件 | 说明 |
|------------|------|
| `system_prompt` | 该技能的 System Prompt 片段 |
| `tools` | 该技能需要的专属工具 |
| `knowledge` | 该技能的领域知识（RAG 文档） |
| `examples` | Few-shot 示例 |
| `trigger` | 何时激活该技能的条件 |

### 📋 任务清单

#### 步骤 7.1：设计 Skill 基类

创建 `skills/base.py`：

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

@dataclass
class Skill(ABC):
    """技能基类"""
    
    name: str
    description: str
    trigger_keywords: list = field(default_factory=list)
    
    @abstractmethod
    def get_system_prompt(self) -> str:
        """返回该技能的 System Prompt 片段"""
        pass
    
    @abstractmethod
    def get_tools(self) -> list:
        """返回该技能的专属工具"""
        pass
    
    def get_knowledge(self) -> list:
        """返回该技能的领域知识"""
        return []
    
    def should_activate(self, user_message: str) -> bool:
        """根据关键词判断是否激活此技能"""
        msg_lower = user_message.lower()
        return any(kw.lower() in msg_lower for kw in self.trigger_keywords)
```

#### 步骤 7.2：实现具体 Skill 示例

创建 `skills/code_review_skill.py`：

```python
from skills.base import Skill

class CodeReviewSkill(Skill):
    name = "code_review"
    description = "代码审查专家，能分析代码质量、安全漏洞和性能问题"
    trigger_keywords = ["审查", "review", "检查代码", "代码质量", "bug", "安全漏洞"]
    
    def get_system_prompt(self) -> str:
        return """## 代码审查模式
你是一个资深代码审查专家。审查代码时，请按以下维度分析：

1. **正确性**: 逻辑是否正确？是否有边界条件遗漏？
2. **安全性**: 是否有 SQL 注入、XSS、密钥泄露等安全风险？
3. **性能**: 是否有 O(n²) 可优化为 O(n) 的地方？
4. **可读性**: 变量命名是否清晰？是否需要注释？
5. **最佳实践**: 是否符合该语言的社区最佳实践？

对每个问题标注严重程度：🔴严重 🟡中等 🟢建议"""
    
    def get_tools(self) -> list:
        # 代码审查技能不需要额外工具
        return []
```

创建 `skills/web_dev_skill.py`：

```python
class WebDevSkill(Skill):
    name = "web_dev"
    description = "Web 全栈开发专家"
    trigger_keywords = ["网页", "前端", "后端", "API", "React", "HTML", "CSS"]
    
    def get_system_prompt(self) -> str:
        return """## Web 开发模式
你是一个全栈 Web 开发专家。写代码时遵循：
1. 使用现代 ES6+ 语法
2. 响应式设计（Mobile First）
3. 语义化 HTML
4. 适当添加错误处理和 loading 状态
5. 代码中包含必要的 import 语句"""
    
    def get_tools(self) -> list:
        return [
            # 可以注册 Web 开发专用工具
            # 如 npm 包搜索、浏览器自动化等
        ]
```

#### 步骤 7.3：Skill 路由器

创建 `skills/router.py`：

```python
class SkillRouter:
    """根据用户输入自动选择和激活合适的 Skill"""
    
    def __init__(self):
        self.skills: dict[str, Skill] = {}
        self.default_system_prompt = "你是一个通用AI助手。"
    
    def register(self, skill: Skill):
        self.skills[skill.name] = skill
    
    def route(self, user_message: str) -> str:
        """根据用户消息返回组合后的 System Prompt"""
        active_skills = []
        
        for skill in self.skills.values():
            if skill.should_activate(user_message):
                active_skills.append(skill)
        
        if not active_skills:
            return self.default_system_prompt
        
        # 组合所有激活技能的 System Prompt
        prompts = [self.default_system_prompt]
        for skill in active_skills:
            prompts.append(skill.get_system_prompt())
        
        return "\n\n".join(prompts)
    
    def get_active_tools(self, user_message: str) -> list:
        """获取当前激活的技能所需的工具"""
        tools = []
        for skill in self.skills.values():
            if skill.should_activate(user_message):
                tools.extend(skill.get_tools())
        return tools
```

#### ✅ 检查点
- [ ] 理解 Skill 的模块化设计思想
- [ ] 实现至少 2 个不同领域的 Skill
- [ ] Skill 路由器能根据用户输入自动选择合适的 Skill
- [ ] Skill 之间的 System Prompt 不冲突

---

## 8. 第六阶段：Harness 工程

### 🎯 目标
构建 Agent 的**支撑基础设施**（支架），让 Agent 可靠、可观测、可测试。

### 核心概念

> **Harness 工程 = 让 Agent 从"能跑"到"可工程化"的所有基础设施**

| 层次 | 内容 |
|------|------|
| 知识层 | 规则引擎、领域知识库、约束校验 |
| 工程化 | 日志、监控、错误恢复、配置管理 |
| 生态层 | 插件系统、版本管理、CI/CD 集成 |

### 📋 任务清单

#### 步骤 8.1：日志与可观测性

创建 `harness/logger.py`：

```python
import logging
import json
import time
from datetime import datetime

class AgentLogger:
    """Agent 专用日志系统"""
    
    def __init__(self, log_file: str = "agent.log"):
        self.logger = logging.getLogger("Agent")
        self.logger.setLevel(logging.DEBUG)
        
        # 文件处理器
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        
        # 控制台处理器
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        
        formatter = logging.Formatter(
            '%(asctime)s | %(levelname)s | %(message)s',
            datefmt='%H:%M:%S'
        )
        fh.setFormatter(formatter)
        ch.setFormatter(formatter)
        
        self.logger.addHandler(fh)
        self.logger.addHandler(ch)
        
        self.trace = []  # 记录完整交互链路
    
    def log_turn_start(self, user_message: str):
        self.turn_id = datetime.now().strftime("%Y%m%d%H%M%S%f")
        self.logger.info(f"🆕 [{self.turn_id}] 用户: {user_message}")
        self.trace.append({
            "turn_id": self.turn_id,
            "user": user_message,
            "steps": []
        })
    
    def log_llm_call(self, model: str, prompt_tokens: int, completion_tokens: int):
        self.logger.debug(f"  🤖 LLM [{model}] → {prompt_tokens}+{completion_tokens} tokens")
    
    def log_tool_call(self, tool_name: str, args: dict, result: str):
        self.logger.info(f"  🔧 {tool_name}({json.dumps(args, ensure_ascii=False)})")
        self.logger.debug(f"    → {result[:200]}")
    
    def log_error(self, error: str):
        self.logger.error(f"  ❌ {error}")
    
    def log_turn_end(self, response: str):
        self.logger.info(f"✅ [{self.turn_id}] Agent: {response[:100]}...")
```

#### 步骤 8.2：配置管理

创建 `harness/config.py`：

```python
import yaml
from dataclasses import dataclass
from typing import Optional

@dataclass
class AgentConfig:
    """Agent 全局配置"""
    llm_model: str = "gpt-4o"
    llm_fallback_model: str = "gpt-4o-mini"
    max_turns: int = 10
    max_tokens_per_turn: int = 8000
    temperature: float = 0.7
    enable_cache: bool = True
    
    # 安全配置
    allowed_directories: list = None
    blocked_commands: list = None
    
    # MCP 服务器配置
    mcp_servers: list = None
    
    @classmethod
    def from_yaml(cls, path: str) -> "AgentConfig":
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return cls(**data)

# config.yaml 示例
DEFAULT_CONFIG = """
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
  - name: "web_search"
    command: "python"  
    args: ["mcp_servers/search_server.py"]
"""
```

#### 步骤 8.3：错误恢复与重试

创建 `harness/recovery.py`：

```python
import asyncio
from enum import Enum

class ErrorSeverity(Enum):
    RETRYABLE = "retryable"      # 可重试（网络超时等）
    DEGRADABLE = "degradable"    # 可降级（用备用模型）
    FATAL = "fatal"              # 致命（不可恢复）

class ErrorRecovery:
    """错误恢复策略"""
    
    def __init__(self, config):
        self.config = config
        self.max_retries = 3
        self.retry_delay = 1.0  # 秒
    
    def classify_error(self, error: Exception) -> ErrorSeverity:
        """分类错误类型"""
        error_str = str(error).lower()
        
        if any(kw in error_str for kw in ["timeout", "rate limit", "connection"]):
            return ErrorSeverity.RETRYABLE
        elif any(kw in error_str for kw in ["context length", "token"]):
            return ErrorSeverity.DEGRADABLE
        else:
            return ErrorSeverity.FATAL
    
    async def execute_with_recovery(self, func, *args, **kwargs):
        """带错误恢复的执行器"""
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e
                severity = self.classify_error(e)
                
                if severity == ErrorSeverity.RETRYABLE:
                    wait_time = self.retry_delay * (2 ** attempt)  # 指数退避
                    print(f"  ⚠️ 重试 {attempt+1}/{self.max_retries}，等待 {wait_time}s...")
                    await asyncio.sleep(wait_time)
                
                elif severity == ErrorSeverity.DEGRADABLE:
                    print(f"  ⚠️ 降级到备用模型 {self.config.llm_fallback_model}")
                    kwargs["model"] = self.config.llm_fallback_model
                    return await func(*args, **kwargs)
                
                else:
                    raise  # 致命错误直接抛出
        
        raise last_error
```

#### 步骤 8.4：沙箱执行环境

```python
class Sandbox:
    """安全沙箱，限制 Agent 的操作范围"""
    
    def __init__(self, allowed_dirs: list = None):
        self.allowed_dirs = allowed_dirs or ["./workspace"]
    
    def is_path_safe(self, path: str) -> bool:
        """检查路径是否在允许范围内"""
        import os
        real_path = os.path.realpath(path)
        return any(
            real_path.startswith(os.path.realpath(d))
            for d in self.allowed_dirs
        )
    
    def safe_read_file(self, path: str) -> str:
        if not self.is_path_safe(path):
            raise PermissionError(f"禁止访问: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    
    def safe_write_file(self, path: str, content: str):
        if not self.is_path_safe(path):
            raise PermissionError(f"禁止写入: {path}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
```

#### ✅ 检查点
- [ ] 日志系统能追踪每轮对话的完整链路
- [ ] 配置文件管理所有 Agent 参数
- [ ] 网络错误能自动重试（指数退避）
- [ ] 超出上下文时自动降级到备用模型
- [ ] Agent 操作限制在安全沙箱内

---

## 9. 第七阶段：可信性判断与评估

### 🎯 目标
建立对 Agent 产出的**可信性判断**机制——这是课程的核心能力要求。

### 核心概念

> **AI 预测 + 可信性判断 = 决策**

| 评估维度 | 方法 |
|----------|------|
| 正确性 | 代码是否能运行？逻辑是否正确？ |
| 安全性 | 是否有注入漏洞？是否泄露敏感信息？ |
| 完整性 | 是否遗漏边界条件？是否覆盖异常路径？ |
| 一致性 | 多次运行结果是否一致？ |

### 📋 任务清单

#### 步骤 9.1：自动化测试框架

创建 `evaluation/tester.py`：

```python
class AgentEvaluator:
    """Agent 可信性评估框架"""
    
    def __init__(self):
        self.test_cases = []
    
    def add_test_case(self, name: str, input_msg: str, 
                      expected_tools: list = None,
                      expected_keywords: list = None,
                      security_checks: list = None):
        """添加一个测试用例"""
        self.test_cases.append({
            "name": name,
            "input": input_msg,
            "expected_tools": expected_tools or [],
            "expected_keywords": expected_keywords or [],
            "security_checks": security_checks or []
        })
    
    async def evaluate(self, agent, test_case: dict) -> dict:
        """评估单个用例"""
        result = {
            "name": test_case["name"],
            "passed": True,
            "checks": []
        }
        
        # 运行 Agent
        response = await agent.chat(test_case["input"])
        
        # 检查 1: 是否调用了期望的工具
        for tool_name in test_case["expected_tools"]:
            called = tool_name in agent.last_tool_calls
            result["checks"].append({
                "type": "tool_call",
                "expected": tool_name,
                "actual": called,
                "passed": called
            })
            if not called:
                result["passed"] = False
        
        # 检查 2: 回复中是否包含关键词
        for keyword in test_case["expected_keywords"]:
            found = keyword.lower() in response.lower()
            result["checks"].append({
                "type": "keyword",
                "expected": keyword,
                "actual": found,
                "passed": found
            })
            if not found:
                result["passed"] = False
        
        return result
    
    def generate_report(self, results: list) -> str:
        """生成评估报告"""
        total = len(results)
        passed = sum(1 for r in results if r["passed"])
        
        report = f"## Agent 可信性评估报告\n\n"
        report += f"通过率: {passed}/{total} ({passed/total*100:.1f}%)\n\n"
        
        for r in results:
            icon = "✅" if r["passed"] else "❌"
            report += f"### {icon} {r['name']}\n"
            for c in r["checks"]:
                c_icon = "✅" if c["passed"] else "❌"
                report += f"- {c_icon} [{c['type']}] 预期: {c['expected']}\n"
            report += "\n"
        
        return report
```

#### 步骤 9.2：安全审计器

```python
class SecurityAuditor:
    """Agent 产出安全审计"""
    
    DANGEROUS_PATTERNS = [
        (r"os\.system\(", "危险系统调用"),
        (r"subprocess\.call\(", "子进程调用"),
        (r"eval\(", "动态代码执行"),
        (r"__import__\(", "动态导入"),
        (r"rm\s+-rf", "递归删除命令"),
        (r"DROP\s+TABLE", "删除数据库表"),
        (r"DELETE\s+FROM", "数据库删除操作"),
        (r"api[_-]?key\s*=\s*['\"]\w+", "API密钥硬编码"),
        (r"password\s*=\s*['\"]\w+", "密码硬编码"),
    ]
    
    def audit(self, code_or_text: str) -> list:
        """审计代码/文本中的安全问题"""
        import re
        issues = []
        for pattern, description in self.DANGEROUS_PATTERNS:
            matches = re.findall(pattern, code_or_text, re.IGNORECASE)
            if matches:
                issues.append({
                    "severity": "HIGH",
                    "pattern": pattern,
                    "description": description,
                    "matches": matches
                })
        return issues
```

#### ✅ 检查点
- [ ] 有至少 5 个自动化测试用例
- [ ] 安全审计能检测常见安全问题
- [ ] 能生成可信性评估报告

---

## 10. 第八阶段：完整 Agent 系统集成

### 🎯 目标
将所有组件集成为一个可供他人使用的完整 Agent 应用。

### 📋 最终项目结构

```
my-agent/
├── agent.py                 # Agent 核心编排器
├── tools.py                 # 工具注册与执行
├── context_manager.py       # 上下文管理
├── main.py                  # 入口文件
├── config.yaml              # 配置文件
├── .env                     # API Key
├── requirements.txt         # 依赖
│
├── mcp_servers/             # MCP Server 实现
│   ├── file_server.py
│   └── search_server.py
│
├── skills/                  # Skill 模块
│   ├── base.py
│   ├── router.py
│   ├── code_review_skill.py
│   └── web_dev_skill.py
│
├── harness/                 # Harness 工程
│   ├── logger.py
│   ├── config.py
│   ├── recovery.py
│   └── sandbox.py
│
├── evaluation/              # 可信性评估
│   ├── tester.py
│   └── security.py
│
├── knowledge/               # 知识库（RAG 文档）
│   └── docs/
│
└── tests/                   # 测试
    └── test_agent.py
```

### 主入口文件

创建 `main.py`：

```python
import asyncio
from agent import MCPAgent
from harness.config import AgentConfig
from harness.logger import AgentLogger
from skills.router import SkillRouter
from skills.code_review_skill import CodeReviewSkill
from skills.web_dev_skill import WebDevSkill
from evaluation.tester import AgentEvaluator

async def main():
    # 加载配置
    config = AgentConfig.from_yaml("config.yaml")
    logger = AgentLogger()
    
    # 初始化 Skill 路由器
    router = SkillRouter()
    router.register(CodeReviewSkill())
    router.register(WebDevSkill())
    
    # 初始化 Agent
    agent = MCPAgent(config, logger, router)
    await agent.setup()  # 连接 MCP Servers
    
    print("=" * 50)
    print("🤖 Agent 已就绪，输入 'exit' 退出，输入 'eval' 运行评估")
    print("=" * 50)
    
    while True:
        user_input = input("\n你: ")
        
        if user_input.lower() == "exit":
            break
        elif user_input.lower() == "eval":
            # 运行评估
            evaluator = AgentEvaluator()
            evaluator.add_test_case(
                "时间查询", "现在几点了？",
                expected_tools=["get_current_time"],
                expected_keywords=["2026", ":"]
            )
            evaluator.add_test_case(
                "数学计算", "计算 123 * 456",
                expected_tools=["calculate"],
                expected_keywords=["56088"]
            )
            results = [await evaluator.evaluate(agent, tc) for tc in evaluator.test_cases]
            print(evaluator.generate_report(results))
            continue
        
        response = await agent.chat(user_input)
        print(f"\nAgent: {response}")
    
    await agent.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 11. 技术栈推荐

| 组件 | 推荐方案 | 备选方案 |
|------|----------|----------|
| LLM API | OpenAI GPT-4o | DeepSeek / 智谱 GLM-4 / Claude |
| MCP SDK | `mcp` (Python) | 自行实现 stdio 协议 |
| 向量数据库 | ChromaDB | FAISS / Qdrant |
| Web 框架 (如需) | FastAPI | Flask / Gradio |
| 配置管理 | PyYAML | TOML / JSON |
| 日志 | Python logging | loguru |
| 测试 | pytest | unittest |

### requirements.txt

```
openai>=1.0.0
python-dotenv>=1.0.0
mcp>=0.1.0
chromadb>=0.4.0
pyyaml>=6.0
pytest>=8.0.0
```

---

## 12. 作业提交清单

按课程要求，你需要提交以下内容：

| 序号 | 交付物 | 说明 |
|------|--------|------|
| 1 | ✅ 源代码 | 完整可运行的 Agent 项目 |
| 2 | ✅ README.md | 项目说明、架构图、运行方法 |
| 3 | ✅ 配置文件 | config.yaml + .env.example |
| 4 | ✅ 至少 3 个 MCP Server | 如文件系统、搜索、数据库 |
| 5 | ✅ 至少 2 个 Skill | 不同领域的专业 Skill |
| 6 | ✅ 评估报告 | 可信性测试通过率 ≥ 80% |
| 7 | ✅ 演示视频/截图 | Agent 完成实际任务的录屏 |
| 8 | ✅ 开发日志 | 记录每个阶段遇到的问题和解决方案 |

---

## 🚀 开发时间线建议

```
第 1 周: 第一阶段 + 第二阶段（Hello World + Tool Use）
第 2 周: 第三阶段 + 第四阶段（上下文工程 + MCP）
第 3 周: 第五阶段 + 第六阶段（Skill + Harness）
第 4 周: 第七阶段 + 第八阶段（评估 + 集成 + 文档）
```

---

> 💡 **核心提醒**：本课程的核心不是"把代码跑通"，而是 **"能对 AI 的产出做可信性判断"**。每完成一个阶段，停下来问自己：Agent 的这次输出我能信任吗？为什么能/不能？这种反思才是课程的核心训练目标。
