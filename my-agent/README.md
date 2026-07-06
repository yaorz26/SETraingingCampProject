# My Agent

一个类似 Claude Code / Codex 的简易但完整的 AI Agent 系统。

## 项目简介

本项目是一个基于 OpenAI API 的 AI Agent 系统，具备以下核心能力：

- **对话能力**：基于 LLM 的多轮对话，维护上下文历史
- **工具调用**：支持 Function Calling，可调用时间查询、计算、搜索等工具
- **上下文工程**：历史压缩、RAG 检索、System Prompt 模板化
- **MCP 协议集成**：标准化工具接入，支持文件系统等 MCP Server
- **Skill 设计**：能力模块化，路由器自动选择（代码审查、Web 开发等）
- **Harness 工程**：日志、配置、错误恢复、沙箱四大基础设施
- **可信性评估**：自动化测试与安全审计

## 架构图

```
┌─────────────────────────────────────────────────┐
│                   main.py (CLI)                 │
│                    REPL 入口                     │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│                  MCPAgent                       │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  LLM 调用  │  │ 工具执行  │  │  上下文管理   │ │
│  └───────────┘  └──────────┘  └──────────────┘ │
└───────┬───────────────┬────────────┬───────────┘
        │               │            │
        ▼               ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ SkillRouter  │ │ MCPClient│ │ContextManager│
│  (路由器)     │ │ (工具)   │ │  (RAG/压缩)  │
└──────────────┘ └──────────┘ └──────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   MCP Servers    │
              │  (file_server)   │
              └──────────────────┘
```

## 目录结构

```
my-agent/
├── agent.py              # Agent 核心实现
├── tools.py              # 工具注册与实现
├── context_manager.py    # 上下文管理与 RAG
├── main.py               # CLI 入口
├── config.yaml           # 配置文件
├── .env.example          # 环境变量模板
├── .gitignore
├── requirements.txt
├── README.md
├── mcp_servers/          # MCP Server 实现
├── skills/               # Skill 模块
├── harness/              # 基础设施（日志/配置/恢复/沙箱）
├── evaluation/           # 评估与安全审计
├── knowledge/docs/       # 知识库文档
└── tests/                # 自动化测试
```

## 安装步骤

### 1. 创建虚拟环境

```bash
cd my-agent
python -m venv venv
.\venv\Scripts\activate    # Windows
# source venv/bin/activate  # Linux/Mac
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 OPENAI_API_KEY
```

## 运行命令

```bash
# 启动 Agent
python main.py

# 运行测试
pytest tests/ -v

# 运行评估
python main.py
# 然后输入 eval
```

## 功能列表

| 功能 | 说明 |
|------|------|
| 多轮对话 | 维护对话历史，支持上下文引用 |
| 工具调用 | 时间查询、安全计算、网页搜索 |
| 上下文压缩 | 超过 20 条历史自动压缩为摘要 |
| RAG 检索 | 字符级 2-gram 中文友好检索 |
| MCP 集成 | 文件系统 Server（读/写/列目录） |
| Skill 路由 | 代码审查、Web 开发自动激活 |
| 日志系统 | 完整链路追踪 |
| 错误恢复 | 指数退避重试、模型降级 |
| 沙箱 | 路径访问限制 |
| 安全审计 | 检测 eval、os.system 等危险操作 |

## 评估结果

> 待阶段 7 完成后补充

## 技术栈

- **语言**：Python 3.10+
- **LLM**：OpenAI GPT-4o / GPT-4o-mini
- **框架**：OpenAI SDK、MCP SDK、ChromaDB
- **测试**：pytest、pytest-asyncio

## 开发日志

### 阶段 0：项目初始化
- ✅ 创建目录结构
- ✅ 创建配置文件
- ✅ 创建虚拟环境
- ✅ 安装依赖

## 许可证

MIT License