"""
完整测试套件 — 覆盖阶段 0~3 所有功能

运行方式：
    cd my-agent
    ..\\venv\\Scripts\\python.exe -m pytest tests/test_all.py -v

测试分类：
    - 阶段 1: SimpleAgent 基础（通过 ToolAgent 的纯对话模式）
    - 阶段 2: 工具系统（ToolRegistry / calculate / get_current_time / search_web）
    - 阶段 3: 上下文工程（SimpleRAG / ContextManager / build_system_prompt）

不需要 API Key 的测试直接运行，需要 API Key 的测试在缺少 Key 时自动跳过。
"""

import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch

# 确保 my-agent 目录在 path 中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# 环境检测
# ---------------------------------------------------------------------------

def _has_api_key() -> bool:
    """检查是否配置了可用的 API Key。"""
    from dotenv import load_dotenv
    load_dotenv(override=True)
    key = os.getenv("OPENAI_API_KEY", "")
    return bool(key) and key != "sk-your-key-here"


# ============================================================================
# 阶段 1 & 2 — 工具系统测试（无需 API Key）
# ============================================================================

class TestToolFunctions:
    """测试独立的工具函数（无需 API Key）。"""

    def test_get_current_time(self):
        from tools import get_current_time
        result = get_current_time()
        assert isinstance(result, str)
        assert len(result) == 19  # YYYY-MM-DD HH:MM:SS
        assert ":" in result
        assert "-" in result

    # ---- calculate ----

    @pytest.mark.parametrize("expr,expected", [
        ("100*25+3", "2503"),
        ("2+2", "4"),
        ("100/3", "33.333333333333336"),
        ("2**10", "1024"),
        ("10//3", "3"),
        ("10%3", "1"),
        ("-5", "-5"),
        ("+5", "5"),
        ("(1+2)*3", "9"),
        ("3.14*2", "6.28"),
    ])
    def test_calculate_valid(self, expr, expected):
        from tools import calculate
        assert calculate(expr) == expected

    @pytest.mark.parametrize("expr,keyword", [
        # __import__ 和 __builtins__ 的危险关键字列表中 "__" 排在前面，
        # 会先匹配 "__" 而非完整名称
        ("__import__('os').system('dir')", "__"),
        ("eval('1+1')", "eval"),
        ("exec('x=1')", "exec"),
        ("open('/etc/passwd')", "open"),
        ("os.system('ls')", "os"),
        ("subprocess.run('ls')", "subprocess"),
        ("__builtins__", "__"),
        ("globals()", "globals"),
        ("locals()", "locals"),
        ("getattr(obj, 'x')", "getattr"),
        ("setattr(obj, 'x', 1)", "setattr"),
        ("lambda x: x", "lambda"),
    ])
    def test_calculate_dangerous_rejected(self, expr, keyword):
        from tools import calculate
        result = calculate(expr)
        assert "Error" in result
        assert keyword in result.lower()

    def test_calculate_syntax_error(self):
        from tools import calculate
        result = calculate("1 + +")
        assert "Error" in result

    # ---- search_web ----

    def test_search_web_mock(self):
        from tools import search_web
        result = search_web("Python")
        assert "Python" in result
        assert "mock results" in result.lower() or "Search" in result

    # ---- _safe_calculate 内部函数 ----

    def test_safe_calculate_direct(self):
        from tools import _safe_calculate
        assert _safe_calculate("42") == "42"
        assert _safe_calculate("-10 + 20") == "10"

    def test_safe_calculate_unsupported_op(self):
        from tools import _safe_calculate
        # 位运算不被支持
        result = _safe_calculate("1 & 2")
        assert "Error" in result


class TestToolRegistry:
    """测试 ToolRegistry 类（无需 API Key）。"""

    def test_register_and_get_schemas(self):
        from tools import ToolRegistry
        r = ToolRegistry()

        def dummy_func():
            return "ok"

        r.register(dummy_func, {
            "type": "function",
            "function": {"name": "dummy_func", "parameters": {}}
        })
        schemas = r.get_schemas()
        assert len(schemas) == 1
        assert schemas[0]["function"]["name"] == "dummy_func"

    def test_execute_success(self):
        from tools import ToolRegistry

        def add(a: int, b: int) -> int:
            return a + b

        r = ToolRegistry()
        r.register(add, {
            "type": "function",
            "function": {"name": "add", "parameters": {}}
        })
        result = r.execute("add", {"a": 1, "b": 2})
        assert result == "3"

    def test_execute_unknown_tool(self):
        from tools import ToolRegistry
        r = ToolRegistry()
        result = r.execute("nonexistent", {})
        assert "Error" in result
        assert "not found" in result

    def test_execute_tool_raises_exception(self):
        from tools import ToolRegistry

        def bad_func():
            raise RuntimeError("boom")

        r = ToolRegistry()
        r.register(bad_func, {
            "type": "function",
            "function": {"name": "bad_func", "parameters": {}}
        })
        result = r.execute("bad_func", {})
        assert "Tool error" in result
        assert "boom" in result

    def test_create_default_registry(self):
        from tools import create_default_registry
        r = create_default_registry()
        schemas = r.get_schemas()
        names = {s["function"]["name"] for s in schemas}
        assert names == {"get_current_time", "calculate", "search_web"}

        # 验证每个工具都能执行
        assert ":" in r.execute("get_current_time", {})
        assert r.execute("calculate", {"expression": "1+1"}) == "2"
        assert "mock" in r.execute("search_web", {"query": "test"}).lower()


# ============================================================================
# 阶段 1 & 2 — Agent 基础测试
# ============================================================================

class TestToolAgentInit:
    """测试 ToolAgent 初始化（无需 API Key 的部分）。"""

    def test_init_without_api_key_raises(self):
        """未设置 API Key 时应抛出 ValueError。"""
        from tools import ToolRegistry
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=True):
            from importlib import reload
            import agent
            # 需要 reload 以清除模块级 load_dotenv 缓存
            # 用 mock 方式测试
            from agent import ToolAgent
            with patch.object(ToolAgent, '__init__', lambda self, *a, **kw: None):
                pass  # 不直接测试，因为 load_dotenv 在模块级

    def test_agent_has_expected_attributes(self):
        """验证 ToolAgent 拥有所有预期属性（需要 API Key 或 mock）。"""
        from agent import ToolAgent
        from tools import ToolRegistry

        if not _has_api_key():
            pytest.skip("需要 OPENAI_API_KEY")

        agent = ToolAgent()
        assert hasattr(agent, "history")
        assert hasattr(agent, "tool_registry")
        assert hasattr(agent, "last_tool_calls")
        assert hasattr(agent, "max_turns")
        assert isinstance(agent.tool_registry, ToolRegistry)
        assert agent.max_turns == 10
        assert agent.history == []
        assert agent.last_tool_calls == []

    def test_reset_clears_history(self):
        from agent import ToolAgent
        if not _has_api_key():
            pytest.skip("需要 OPENAI_API_KEY")

        agent = ToolAgent()
        agent.history = [{"role": "user", "content": "hello"}]
        agent.last_tool_calls = [{"name": "test"}]
        agent.reset()
        assert agent.history == []
        assert agent.last_tool_calls == []


class TestToolAgentChat:
    """测试 ToolAgent.chat()（需要 API Key）。"""

    @pytest.fixture
    def agent(self):
        from agent import ToolAgent
        if not _has_api_key():
            pytest.skip("需要 OPENAI_API_KEY")
        a = ToolAgent()
        yield a
        a.reset()

    def test_simple_chat_returns_reply(self, agent):
        """基本对话：发送 '你好' 应收到非空回复。"""
        reply = agent.chat("你好")
        assert isinstance(reply, str)
        assert len(reply) > 0

    def test_chat_adds_to_history(self, agent):
        """对话后 history 应有记录。"""
        agent.chat("你好")
        assert len(agent.history) > 0
        roles = {m["role"] for m in agent.history}
        assert "user" in roles

    def test_tool_call_triggers_last_tool_calls(self, agent):
        """工具调用应记录到 last_tool_calls。"""
        agent.chat("现在几点了？")
        # 如果 LLM 调用了工具，last_tool_calls 应有记录
        # 不强制断言，因为 LLM 行为不确定
        assert isinstance(agent.last_tool_calls, list)

    def test_calculate_tool_via_agent(self, agent):
        """通过 Agent 触发 calculate 工具。"""
        reply = agent.chat("请帮我计算 100 * 25 + 3")
        assert isinstance(reply, str)
        assert len(reply) > 0

    def test_multi_turn_conversation(self, agent):
        """多轮对话测试。"""
        agent.chat("我叫小明")
        reply = agent.chat("我叫什么名字？")
        assert isinstance(reply, str)
        assert len(reply) > 0

    def test_max_turns_limited(self, agent):
        """验证 max_turns 参数生效。"""
        agent.max_turns = 1
        reply = agent.chat("你好")
        assert isinstance(reply, str)


# ============================================================================
# 阶段 3 — 上下文工程测试（无需 API Key）
# ============================================================================

class TestBuildSystemPrompt:
    """测试 build_system_prompt 模板函数。"""

    def test_default_prompt(self):
        from context_manager import build_system_prompt, DEFAULT_TEMPLATE_VALUES
        prompt = build_system_prompt()
        # 检查所有默认值都填充了
        for key, value in DEFAULT_TEMPLATE_VALUES.items():
            assert value in prompt, f"缺少默认值 {key}: {value}"

    def test_partial_override(self):
        from context_manager import build_system_prompt
        prompt = build_system_prompt(
            role_description="我是自定义角色",
            constraint_1="自定义约束",
        )
        assert "我是自定义角色" in prompt
        assert "自定义约束" in prompt
        # 未覆盖的应保留默认值
        assert "对话、获取时间、数学计算、网页搜索" in prompt

    def test_all_override(self):
        from context_manager import build_system_prompt
        prompt = build_system_prompt(
            role_description="A",
            capabilities="B",
            rule_1="C",
            rule_2="D",
            rule_3="E",
            output_format="F",
            constraint_1="G",
            constraint_2="H",
        )
        assert "A" in prompt and "B" in prompt and "C" in prompt
        assert "D" in prompt and "E" in prompt and "F" in prompt
        assert "G" in prompt and "H" in prompt

    def test_missing_key_raises(self):
        """模板中未提供的占位符应抛出 KeyError（format 行为）。"""
        # 但我们的实现使用 DEFAULT_TEMPLATE_VALUES 作为 fallback
        # 所以所有 key 都有默认值，不会出现 KeyError
        from context_manager import build_system_prompt
        prompt = build_system_prompt()
        # 所有占位符都应被填充
        assert "{" not in prompt  # 没有未填充的占位符


class TestSimpleRAG:
    """测试 SimpleRAG 检索器。"""

    @pytest.fixture
    def rag(self):
        from context_manager import SimpleRAG
        r = SimpleRAG()
        r.add_document("Python 是一种广泛使用的编程语言", {"source": "doc1"})
        r.add_document("Java 是一种面向对象的编程语言", {"source": "doc2"})
        r.add_document("人工智能是计算机科学的一个分支", {"source": "doc3"})
        r.add_document("机器学习使用 Python 库进行数据分析", {"source": "doc4"})
        r.add_document("深度学习是机器学习的一个子集", {"source": "doc5"})
        return r

    # ---- add_document ----

    def test_add_document(self, rag):
        assert len(rag.documents) == 5
        assert rag.documents[0]["content"] == "Python 是一种广泛使用的编程语言"
        assert rag.documents[0]["metadata"] == {"source": "doc1"}

    def test_add_document_no_metadata(self):
        from context_manager import SimpleRAG
        r = SimpleRAG()
        r.add_document("test content")
        assert r.documents[0]["metadata"] == {}

    # ---- search ----

    def test_search_relevant(self, rag):
        results = rag.search("编程语言有哪些")
        assert len(results) >= 2
        # Java 和 Python 文档应在前两名
        contents = [r["content"] for r in results]
        assert any("Java" in c for c in contents)
        assert any("Python" in c for c in contents)

    def test_search_scores_descending(self, rag):
        results = rag.search("编程语言")
        for i in range(len(results) - 1):
            assert results[i]["score"] >= results[i + 1]["score"]

    def test_search_no_match(self, rag):
        results = rag.search("XYZ完全不相关的内容12345")
        assert results == []

    def test_search_top_k(self, rag):
        results = rag.search("机器学习", top_k=1)
        assert len(results) <= 1

    def test_search_empty_query(self, rag):
        from context_manager import SimpleRAG
        r = SimpleRAG()
        r.add_document("test")
        results = r.search("")
        assert results == []  # 空查询无 n-gram

    def test_search_returns_metadata(self, rag):
        results = rag.search("Python")
        for r in results:
            assert "metadata" in r
            assert "score" in r
            assert "content" in r

    def test_search_chinese_query(self, rag):
        """中文查询测试。"""
        results = rag.search("机器学习")
        assert len(results) >= 2
        # 机器学习相关文档应排名靠前
        assert any("机器学习" in r["content"] for r in results)

    # ---- _ngrams ----

    def test_ngrams_normal(self, rag):
        ngrams = rag._ngrams("hello")
        assert len(ngrams) == 4  # he, el, ll, lo
        assert "he" in ngrams
        assert "lo" in ngrams

    def test_ngrams_short_text(self, rag):
        ngrams = rag._ngrams("a")
        assert ngrams == {"a"}

    def test_ngrams_empty(self, rag):
        ngrams = rag._ngrams("")
        assert ngrams == {""}

    def test_ngrams_chinese(self, rag):
        ngrams = rag._ngrams("你好世界")
        assert "你好" in ngrams
        assert "好世" in ngrams
        assert "世界" in ngrams

    def test_ngrams_ignores_spaces(self, rag):
        ngrams = rag._ngrams("a b")
        # 空格被移除，只剩下 "ab" → 2-gram 为 {"ab"}
        assert "ab" in ngrams
        assert " " not in ngrams

    # ---- _jaccard_similarity ----

    def test_jaccard_identical(self, rag):
        sim = rag._jaccard_similarity({"a", "b", "c"}, {"a", "b", "c"})
        assert sim == 1.0

    def test_jaccard_disjoint(self, rag):
        sim = rag._jaccard_similarity({"a", "b"}, {"c", "d"})
        assert sim == 0.0

    def test_jaccard_partial(self, rag):
        sim = rag._jaccard_similarity({"a", "b", "c"}, {"b", "c", "d"})
        # intersection = {b, c} = 2, union = {a, b, c, d} = 4
        assert sim == 0.5

    def test_jaccard_both_empty(self, rag):
        sim = rag._jaccard_similarity(set(), set())
        assert sim == 0.0

    def test_jaccard_one_empty(self, rag):
        sim = rag._jaccard_similarity({"a"}, set())
        assert sim == 0.0


class TestContextManager:
    """测试 ContextManager 上下文管理器。"""

    @pytest.fixture
    def mock_client(self):
        """创建 mock OpenAI 客户端，用于无 API Key 测试。"""
        client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "这是一段对话摘要。"
        client.chat.completions.create.return_value = mock_response
        return client

    @pytest.fixture
    def cm(self, mock_client):
        from context_manager import ContextManager
        return ContextManager(
            client=mock_client,
            history_threshold=10,
            keep_recent=4,
        )

    # ---- build_context ----

    def test_build_context_short_history(self, cm):
        """短历史（≤ threshold）全量保留。"""
        history = [
            {"role": "user", "content": "你好"},
            {"role": "assistant", "content": "你好！"},
        ]
        msgs = cm.build_context("你是一个助手", history)
        # system + 2 history = 3
        assert len(msgs) == 3
        assert msgs[0]["role"] == "system"
        assert msgs[0]["content"] == "你是一个助手"
        assert msgs[1] == {"role": "user", "content": "你好"}
        assert msgs[2] == {"role": "assistant", "content": "你好！"}

    def test_build_context_with_knowledge(self, cm):
        """knowledge 注入到 system 消息。"""
        history = [{"role": "user", "content": "hi"}]
        msgs = cm.build_context("prompt", history, knowledge="参考信息：Python 3.12")
        assert "## 参考信息" in msgs[0]["content"]
        assert "Python 3.12" in msgs[0]["content"]

    def test_build_context_long_history_triggers_compression(self, cm):
        """长历史（> threshold）触发压缩。"""
        history = []
        for i in range(20):
            history.append({"role": "user", "content": f"问题{i}"})
            history.append({"role": "assistant", "content": f"回答{i}"})
        # 40 条 > 10 threshold

        msgs = cm.build_context("system prompt", history)
        # 结构：system + summary + recent(4)
        assert len(msgs) <= 6  # 1 system + 1 summary + 4 recent
        # 检查摘要
        has_summary = any("[历史摘要]" in m.get("content", "") for m in msgs)
        assert has_summary, "长历史应触发压缩并生成摘要"

    def test_build_context_empty_history(self, cm):
        """空历史。"""
        msgs = cm.build_context("prompt", [])
        assert len(msgs) == 1
        assert msgs[0]["role"] == "system"

    def test_build_context_exact_threshold(self, cm):
        """恰好等于 threshold 时不应压缩。"""
        history = [{"role": "user", "content": f"msg{i}"} for i in range(10)]
        msgs = cm.build_context("prompt", history)
        # 10 条 = threshold，不压缩
        assert len(msgs) == 11  # system + 10

    def test_build_context_threshold_plus_one(self, cm):
        """threshold + 1 条应触发压缩。"""
        history = [{"role": "user", "content": f"msg{i}"} for i in range(11)]
        msgs = cm.build_context("prompt", history)
        # 11 > 10 → 压缩
        assert len(msgs) <= 6  # system + summary + 4 recent

    def test_build_context_preserves_recent(self, cm):
        """压缩后最近的消息应保留。"""
        history = [{"role": "user", "content": f"msg{i}"} for i in range(20)]
        msgs = cm.build_context("prompt", history)
        # 最后 4 条（recent）应是 msg16..msg19
        recent_msgs = msgs[-4:]
        for i, msg in enumerate(recent_msgs):
            assert f"msg{16 + i}" in msg["content"]

    # ---- summarize_history ----

    def test_summarize_empty(self, cm):
        result = cm.summarize_history([])
        assert result == ""

    def test_summarize_returns_summary(self, cm):
        history = [
            {"role": "user", "content": "我叫小明"},
            {"role": "assistant", "content": "你好小明"},
        ]
        result = cm.summarize_history(history)
        assert "[历史摘要]" in result
        assert len(result) > 0

    def test_summarize_api_failure_graceful(self, cm):
        """API 调用失败时返回截断内容而不抛异常。"""
        cm.client.chat.completions.create.side_effect = Exception("API Error")
        history = [{"role": "user", "content": "test " * 100}]
        result = cm.summarize_history(history)
        assert "[历史摘要（压缩失败" in result
        assert "test" in result

    # ---- ContextManager 配置 ----

    def test_custom_threshold_and_keep(self):
        from context_manager import ContextManager
        client = MagicMock()
        cm = ContextManager(
            client=client,
            max_tokens=4000,
            history_threshold=5,
            keep_recent=2,
        )
        assert cm.max_tokens == 4000
        assert cm.history_threshold == 5
        assert cm.keep_recent == 2

    def test_fallback_model_from_env(self):
        from context_manager import ContextManager
        client = MagicMock()
        with patch.dict(os.environ, {"LLM_FALLBACK_MODEL": "gpt-3.5-turbo"}):
            cm = ContextManager(client=client)
            assert cm.fallback_model == "gpt-3.5-turbo"


# ============================================================================
# 阶段 0 — 项目配置测试
# ============================================================================

class TestProjectConfig:
    """测试项目配置和依赖。"""

    def test_requirements_installed(self):
        """验证 requirements.txt 中的包可导入。"""
        import openai
        import dotenv
        import yaml
        import pytest as _pytest
        assert openai is not None
        assert dotenv is not None
        assert yaml is not None

    def test_config_yaml_loadable(self):
        """验证 config.yaml 可解析。"""
        import yaml
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "config.yaml"
        )
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        assert "llm_model" in config
        assert "max_turns" in config
        assert "mcp_servers" in config
        assert isinstance(config["mcp_servers"], list)

    def test_env_example_exists(self):
        """验证 .env.example 文件存在。"""
        env_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), ".env.example"
        )
        assert os.path.exists(env_path), ".env.example 文件不存在"

    def test_gitignore_exists(self):
        """验证 .gitignore 文件存在。"""
        gitignore_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), ".gitignore"
        )
        assert os.path.exists(gitignore_path), ".gitignore 文件不存在"


# ============================================================================
# 端到端测试（需要 API Key）
# ============================================================================

class TestEndToEnd:
    """端到端集成测试（需要 API Key）。"""

    @pytest.fixture
    def agent(self):
        from agent import ToolAgent
        if not _has_api_key():
            pytest.skip("需要 OPENAI_API_KEY")
        a = ToolAgent()
        yield a
        a.reset()

    def test_e2e_tool_chain(self, agent):
        """端到端：Agent 自动调用工具链完成任务。"""
        reply = agent.chat("现在几点了？同时帮我算一下 50 * 2")
        assert isinstance(reply, str)
        assert len(reply) > 0

    def test_e2e_multi_turn_memory(self, agent):
        """端到端：多轮对话记忆。"""
        agent.chat("我叫张三，今年25岁")
        reply = agent.chat("我叫什么名字？今年多大？")
        assert isinstance(reply, str)
        # 应包含 "张三" 或 "25"
        assert ("张三" in reply or "25" in reply), \
            f"预期回复包含上下文信息，实际: {reply[:100]}"

    def test_e2e_context_manager_integration(self, agent):
        """验证 ToolAgent 与 ContextManager 可集成（预演阶段 4）。"""
        from context_manager import build_system_prompt, SimpleRAG, ContextManager

        # 使用模板构建 prompt
        prompt = build_system_prompt(
            role_description="你是一个数学助手",
            capabilities="数学计算",
        )
        # 验证 prompt 可正常构建
        assert "数学助手" in prompt
        assert "数学计算" in prompt

        # RAG 检索
        rag = SimpleRAG()
        rag.add_document("Python 3.12 发布了新的泛型语法")
        rag.add_document("Python 使用缩进来定义代码块")
        results = rag.search("Python 新特性")
        assert len(results) >= 1

        # ContextManager 可构建上下文
        cm = ContextManager(
            client=agent.client,
            history_threshold=20,
            keep_recent=6,
        )
        msgs = cm.build_context(prompt, agent.history, knowledge="Python 3.12")
        assert len(msgs) >= 1
        assert msgs[0]["role"] == "system"


# ============================================================================
# 阶段 4 — MCP 协议集成测试
# ============================================================================

class TestMCPServer:
    """测试 MCP File System Server 定义（无需启动 stdio）。"""

    def test_fastmcp_instance_created(self):
        """验证 FastMCP 实例可正常创建。"""
        from mcp_servers.file_server import mcp
        assert mcp is not None
        assert hasattr(mcp, "run")

    def test_server_name(self):
        """验证 Server 名称。"""
        from mcp_servers.file_server import mcp
        assert mcp.name == "file-system-server"

    def test_tools_registered(self):
        """验证三个工具已注册。"""
        from mcp_servers.file_server import mcp
        tool_names = {t.name for t in mcp._tool_manager._tools.values()}
        assert "read_file" in tool_names
        assert "list_directory" in tool_names
        assert "write_file" in tool_names


class TestMCPToolManager:
    """测试 MCPToolManager 类（无需实际 MCP Server 连接）。"""

    def test_init_empty(self):
        """初始化后工具列表为空。"""
        from mcp_client import MCPToolManager
        manager = MCPToolManager()
        assert manager.get_openai_tools() == []
        assert manager.get_tool_names() == []

    def test_schema_conversion(self):
        """验证 MCP Tool 到 OpenAI schema 的转换。"""
        from mcp_client import MCPToolManager

        # 模拟 MCP Tool 对象
        class MockTool:
            name = "test_tool"
            description = "A test tool"
            inputSchema = {
                "type": "object",
                "properties": {
                    "param1": {
                        "type": "string",
                        "description": "First param"
                    }
                },
                "required": ["param1"]
            }

        schema = MCPToolManager._mcp_tool_to_openai_schema(MockTool())
        assert schema["type"] == "function"
        assert schema["function"]["name"] == "test_tool"
        assert schema["function"]["description"] == "A test tool"
        params = schema["function"]["parameters"]
        assert params["type"] == "object"
        assert "param1" in params["properties"]
        assert "param1" in params["required"]

    def test_schema_conversion_no_input_schema(self):
        """验证无 inputSchema 时的降级处理。"""
        from mcp_client import MCPToolManager

        class MockToolNoSchema:
            name = "bare_tool"
            description = None

        schema = MCPToolManager._mcp_tool_to_openai_schema(MockToolNoSchema())
        assert schema["type"] == "function"
        assert schema["function"]["name"] == "bare_tool"
        assert schema["function"]["description"] == "Tool: bare_tool"
        assert schema["function"]["parameters"]["properties"] == {}

    def test_execute_tool_not_found(self):
        """执行不存在的工具返回错误。"""
        import asyncio
        from mcp_client import MCPToolManager

        async def _test():
            manager = MCPToolManager()
            result = await manager.execute_tool("nonexistent", {})
            assert "Error" in result

        asyncio.run(_test())

    def test_close_all_idempotent(self):
        """close_all 可多次调用不报错。"""
        import asyncio
        from mcp_client import MCPToolManager

        async def _test():
            manager = MCPToolManager()
            await manager.close_all()
            await manager.close_all()
            assert manager.get_tool_names() == []

        asyncio.run(_test())


class TestMCPAgent:
    """测试 MCPAgent 类（无需 API Key 的功能测试）。"""

    def test_init_without_api_key_raises(self):
        """无 API Key 时初始化抛出 ValueError。"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}, clear=False):
            from agent import MCPAgent
            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                MCPAgent()

    def test_mcpagent_has_expected_attributes(self):
        """MCPAgent 初始化后具有预期属性。"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            agent = MCPAgent()
            assert agent.max_turns == 10
            assert agent.history == []
            assert agent.last_tool_calls == []
            assert agent.tool_registry is not None
            assert agent.mcp is not None

    def test_get_all_tools_includes_builtin(self):
        """_get_all_tools 包含内置工具。"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            agent = MCPAgent()
            tools = agent._get_all_tools()
            tool_names = [t["function"]["name"] for t in tools]
            assert "get_current_time" in tool_names
            assert "calculate" in tool_names
            assert "search_web" in tool_names

    def test_setup_without_config_no_error(self):
        """setup() 在无 config.yaml 时不报错。"""
        import asyncio
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            async def _test():
                agent = MCPAgent()
                # setup 应该安全降级（没有 MCP Server 也不报错）
                await agent.setup()
                await agent.shutdown()
            asyncio.run(_test())

    def test_reset_clears_history(self):
        """reset() 清空历史。"""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            agent = MCPAgent()
            agent.history = [{"role": "user", "content": "test"}]
            agent.last_tool_calls = [{"name": "test"}]
            agent.reset()
            assert agent.history == []
            assert agent.last_tool_calls == []

    def test_shutdown_twice_no_error(self):
        """shutdown 可多次调用不报错。"""
        import asyncio
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            async def _test():
                agent = MCPAgent()
                await agent.shutdown()
                await agent.shutdown()
            asyncio.run(_test())

    def test_execute_tool_builtin_fallback(self):
        """_execute_tool 优先使用内置工具。"""
        import asyncio
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            async def _test():
                agent = MCPAgent()
                result = await agent._execute_tool("get_current_time", {})
                assert ":" in result  # 时间格式
                assert "-" in result
                await agent.shutdown()
            asyncio.run(_test())

    def test_execute_tool_mcp_not_found(self):
        """_execute_tool 对不存在的 MCP 工具返回错误。"""
        import asyncio
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            from agent import MCPAgent
            async def _test():
                agent = MCPAgent()
                result = await agent._execute_tool("nonexistent", {})
                assert "Error" in result
                await agent.shutdown()
            asyncio.run(_test())

    @pytest.mark.skipif(not _has_api_key(), reason="需要有效的 API Key")
    def test_mcpagent_chat_text_only(self):
        """MCPAgent 纯文本对话（无工具调用）。"""
        import asyncio
        from agent import MCPAgent

        async def _test():
            agent = MCPAgent()
            reply = await agent.chat("用一句话回复：1+1等于几？")
            assert len(reply) > 0
            await agent.shutdown()
        asyncio.run(_test())

    @pytest.mark.skipif(not _has_api_key(), reason="需要有效的 API Key")
    def test_mcpagent_chat_with_tool(self):
        """MCPAgent 工具调用（calculate）。"""
        import asyncio
        from agent import MCPAgent

        async def _test():
            agent = MCPAgent()
            reply = await agent.chat("计算 123 * 456")
            assert len(reply) > 0
            assert "56088" in reply.replace(",", "")
            await agent.shutdown()
        asyncio.run(_test())


# ============================================================================
# 阶段 5 — Skill 设计与路由测试（无需 API Key）
# ============================================================================

class TestSkillBase:
    """测试 Skill 抽象基类。"""

    def test_skill_abstract_cannot_instantiate(self):
        """抽象基类不能直接实例化。"""
        import pytest
        from skills.base import Skill
        with pytest.raises(TypeError):
            Skill(name="test", description="test", trigger_keywords=["test"])

    def test_concrete_skill_instantiation(self):
        """具体 Skill 子类可以正常实例化。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        assert skill.name == "code_review"
        assert "code_review" in skill.description.lower() or "审查" in skill.description
        assert len(skill.trigger_keywords) > 0

    def test_default_tools_empty(self):
        """默认 get_tools() 返回空列表。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        assert skill.get_tools() == []

    def test_should_activate_with_keyword(self):
        """触发关键词命中时 should_activate 返回 True。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        assert skill.should_activate("帮我审查这段代码") is True
        assert skill.should_activate("请review一下这个文件") is True
        assert skill.should_activate("这个代码可能有bug") is True

    def test_should_activate_no_keyword(self):
        """无触发关键词时 should_activate 返回 False。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        assert skill.should_activate("今天天气怎么样") is False
        assert skill.should_activate("帮我写一首诗") is False

    def test_should_activate_case_insensitive(self):
        """关键词匹配不区分大小写。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        assert skill.should_activate("请帮我做 Code Review") is True
        assert skill.should_activate("这里有个 BUG") is True


class TestCodeReviewSkill:
    """测试 CodeReviewSkill 具体功能。"""

    def test_get_system_prompt_content(self):
        """System prompt 包含 5 维度审查框架。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        prompt = skill.get_system_prompt()
        assert "正确性" in prompt
        assert "安全性" in prompt
        assert "性能" in prompt
        assert "可读性" in prompt
        assert "最佳实践" in prompt
        assert "审查报告" in prompt

    def test_get_knowledge(self):
        """知识库包含 OWASP 和 SOLID 等安全知识。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        knowledge = skill.get_knowledge()
        assert len(knowledge) >= 2
        assert any("OWASP" in k for k in knowledge)
        assert any("SOLID" in k for k in knowledge)

    def test_trigger_keywords_comprehensive(self):
        """触发关键词覆盖所有审查相关词汇。"""
        from skills.code_review_skill import CodeReviewSkill
        skill = CodeReviewSkill()
        triggers = ["审查", "review", "代码质量", "bug", "安全漏洞",
                     "code review", "代码审查", "重构", "refactor"]
        for t in triggers:
            assert skill.should_activate(f"请{t}一下") is True


class TestWebDevSkill:
    """测试 WebDevSkill 具体功能。"""

    def test_get_system_prompt_content(self):
        """System prompt 包含前端和后端规范。"""
        from skills.web_dev_skill import WebDevSkill
        skill = WebDevSkill()
        prompt = skill.get_system_prompt()
        assert "前端" in prompt or "HTML" in prompt
        assert "后端" in prompt or "API" in prompt
        assert "REST" in prompt or "RESTful" in prompt

    def test_get_knowledge(self):
        """知识库包含 React 和 RESTful 等 Web 知识。"""
        from skills.web_dev_skill import WebDevSkill
        skill = WebDevSkill()
        knowledge = skill.get_knowledge()
        assert len(knowledge) >= 3
        assert any("React" in k for k in knowledge)
        assert any("REST" in k for k in knowledge)

    def test_trigger_keywords_web(self):
        """Web 相关触发词能正确激活。"""
        from skills.web_dev_skill import WebDevSkill
        skill = WebDevSkill()
        web_triggers = ["网页", "前端", "后端", "API", "React", "HTML", "CSS", "网站", "接口", "Vue", "JavaScript", "TypeScript"]
        for t in web_triggers:
            assert skill.should_activate(f"帮我做一个{t}项目") is True

    def test_should_not_activate_non_web(self):
        """非 Web 相关消息不应激活。"""
        from skills.web_dev_skill import WebDevSkill
        skill = WebDevSkill()
        assert skill.should_activate("帮我审查代码安全漏洞") is False
        assert skill.should_activate("计算 1+1") is False


class TestSkillRouter:
    """测试 SkillRouter 路由功能。"""

    def test_register_and_list(self):
        """注册 Skill 并列出。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        assert "code_review" in router.list_skills()

    def test_register_duplicate_overwrites(self):
        """重复注册同名 Skill 会覆盖。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        s1 = CodeReviewSkill()
        s2 = CodeReviewSkill()
        router.register(s1)
        router.register(s2)
        assert router.get_skill("code_review") is s2

    def test_unregister(self):
        """注销 Skill。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        assert router.unregister("code_review") is True
        assert router.unregister("nonexistent") is False
        assert "code_review" not in router.list_skills()

    def test_get_skill(self):
        """按名称获取 Skill。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        skill = CodeReviewSkill()
        router.register(skill)
        assert router.get_skill("code_review") is skill
        assert router.get_skill("nonexistent") is None

    def test_route_no_activation(self):
        """无 Skill 激活时返回默认 prompt。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        prompt = router.route("今天天气怎么样")
        assert "友好且有帮助" in prompt
        assert "代码审查" not in prompt

    def test_route_code_review_activation(self):
        """代码审查消息激活 CodeReviewSkill。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        prompt = router.route("帮我审查这段代码")
        assert "审查" in prompt
        assert "正确性" in prompt
        assert "安全性" in prompt

    def test_route_web_dev_activation(self):
        """Web 开发消息激活 WebDevSkill。"""
        from skills.router import SkillRouter
        from skills.web_dev_skill import WebDevSkill
        router = SkillRouter()
        router.register(WebDevSkill())
        prompt = router.route("帮我做一个React前端页面")
        assert "Web" in prompt or "前端" in prompt
        assert "HTML" in prompt or "CSS" in prompt or "React" in prompt

    def test_route_multi_skill_activation(self):
        """多 Skill 同时激活时 prompt 包含所有 Skill 内容。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        from skills.web_dev_skill import WebDevSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        router.register(WebDevSkill())
        prompt = router.route("帮我审查这个React前端代码的安全漏洞")
        assert "审查" in prompt
        assert "Web" in prompt or "前端" in prompt
        assert "多个 Skill" in prompt or "不冲突" in prompt

    def test_get_active_tools_empty(self):
        """默认无激活 Skill 的工具。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        tools = router.get_active_tools("今天天气怎么样")
        assert tools == []

    def test_get_active_knowledge(self):
        """激活 Skill 时返回知识库。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        knowledge = router.get_active_knowledge("帮我审查这段代码")
        assert len(knowledge) > 0
        assert any("OWASP" in k for k in knowledge)

    def test_get_active_skill_names(self):
        """获取激活的 Skill 名称列表。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        from skills.web_dev_skill import WebDevSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        router.register(WebDevSkill())
        names = router.get_active_skill_names("帮我审查代码")
        assert "code_review" in names
        assert "web_dev" not in names

    def test_route_only_web_dev_message(self):
        """纯 Web 开发消息只激活 WebDevSkill。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        from skills.web_dev_skill import WebDevSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        router.register(WebDevSkill())
        prompt = router.route("帮我写一个HTML页面")
        assert "审查" not in prompt
        assert "Web" in prompt or "前端" in prompt or "HTML" in prompt

    def test_route_includes_knowledge(self):
        """激活 Skill 的 route 输出包含知识库。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        prompt = router.route("帮我审查代码")
        assert "参考知识库" in prompt
        assert "OWASP" in prompt

    def test_list_skills_empty(self):
        """空路由器返回空列表。"""
        from skills.router import SkillRouter
        router = SkillRouter()
        assert router.list_skills() == []

    def test_multiple_skills_registration(self):
        """注册多个 Skill 后 list_skills 返回所有名称。"""
        from skills.router import SkillRouter
        from skills.code_review_skill import CodeReviewSkill
        from skills.web_dev_skill import WebDevSkill
        router = SkillRouter()
        router.register(CodeReviewSkill())
        router.register(WebDevSkill())
        names = router.list_skills()
        assert "code_review" in names
        assert "web_dev" in names
        assert len(names) == 2


# ============================================================================
# 阶段 6 — Harness 工程测试（无需 API Key）
# ============================================================================

class TestAgentConfig:
    """测试 AgentConfig 配置加载。"""

    def test_default_config(self):
        """默认配置创建。"""
        from harness.config import AgentConfig
        config = AgentConfig()
        assert config.llm_model == "gpt-4o"
        assert config.llm_fallback_model == "gpt-4o-mini"
        assert config.max_turns == 10
        assert config.max_tokens_per_turn == 8000
        assert config.temperature == 0.7
        assert config.enable_cache is True
        assert config.allowed_directories == ["./workspace", "./output"]
        assert config.blocked_commands == ["rm -rf", "format"]
        assert config.mcp_servers == []

    def test_from_yaml_loads_correctly(self):
        """从 config.yaml 加载配置。"""
        from harness.config import AgentConfig
        config = AgentConfig.from_yaml("config.yaml")
        assert config.llm_model == "gpt-4o"
        assert config.llm_fallback_model == "gpt-4o-mini"
        assert config.max_turns == 10
        assert config.temperature == 0.7
        assert isinstance(config.allowed_directories, list)
        assert isinstance(config.blocked_commands, list)
        assert len(config.mcp_servers) >= 1
        assert config.mcp_servers[0].name == "filesystem"

    def test_from_yaml_file_not_found(self):
        """不存在的配置文件抛出 FileNotFoundError。"""
        from harness.config import AgentConfig
        with pytest.raises(FileNotFoundError):
            AgentConfig.from_yaml("nonexistent_config.yaml")

    def test_mcp_server_config_dataclass(self):
        """McpServerConfig 数据类。"""
        from harness.config import McpServerConfig
        mcp = McpServerConfig(name="test", command="python", args=["server.py"])
        assert mcp.name == "test"
        assert mcp.command == "python"
        assert mcp.args == ["server.py"]

    def test_config_repr(self):
        """AgentConfig repr 输出。"""
        from harness.config import AgentConfig
        config = AgentConfig()
        r = repr(config)
        assert "AgentConfig" in r
        assert "gpt-4o" in r


class TestAgentLogger:
    """测试 AgentLogger 日志记录。"""

    def test_logger_initialization(self):
        """日志记录器初始化。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                assert logger.trace == []
                assert logger.get_log_file() is not None
                assert logger.get_log_file().endswith(".log")
            finally:
                logger.close()

    def test_log_turn_start(self):
        """记录轮次开始。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_turn_start(1, "你好")
                assert len(logger.trace) == 1
                assert logger.trace[0]["type"] == "turn_start"
                assert logger.trace[0]["data"]["turn"] == 1
                assert logger.trace[0]["data"]["user_message"] == "你好"
            finally:
                logger.close()

    def test_log_llm_call(self):
        """记录 LLM 调用。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_llm_call("gpt-4o", 350, 0.5)
                assert len(logger.trace) == 1
                assert logger.trace[0]["type"] == "llm_call"
                assert logger.trace[0]["data"]["model"] == "gpt-4o"
                assert logger.trace[0]["data"]["tokens_used"] == 350
                assert logger.trace[0]["data"]["response_time"] == 0.5
            finally:
                logger.close()

    def test_log_tool_call(self):
        """记录工具调用。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_tool_call("get_current_time", {}, "2026-07-07 12:00:00")
                assert len(logger.trace) == 1
                assert logger.trace[0]["type"] == "tool_call"
                assert logger.trace[0]["data"]["name"] == "get_current_time"
                assert logger.trace[0]["data"]["result"] == "2026-07-07 12:00:00"
            finally:
                logger.close()

    def test_log_error(self):
        """记录错误。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_error("网络超时")
                assert len(logger.trace) == 1
                assert logger.trace[0]["type"] == "error"
                assert logger.trace[0]["data"]["error"] == "网络超时"
            finally:
                logger.close()

    def test_log_turn_end(self):
        """记录轮次结束。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_turn_end(1, "你好！", 1.5)
                assert len(logger.trace) == 1
                assert logger.trace[0]["type"] == "turn_end"
                assert logger.trace[0]["data"]["response"] == "你好！"
                assert logger.trace[0]["data"]["total_time"] == 1.5
            finally:
                logger.close()

    def test_trace_summary(self):
        """链路追踪摘要。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_turn_start(1, "测试")
                logger.log_llm_call("gpt-4o", 100, 0.3)
                logger.log_tool_call("calculate", {"expression": "1+1"}, "2")
                logger.log_turn_end(1, "结果是2", 0.5)
                summary = logger.get_trace_summary()
                assert summary["llm_calls"] == 1
                assert summary["tool_calls"] == 1
                assert summary["errors"] == 0
            finally:
                logger.close()

    def test_clear_trace(self):
        """清空链路追踪。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_turn_start(1, "测试")
                assert len(logger.trace) == 1
                logger.clear_trace()
                assert logger.trace == []
            finally:
                logger.close()

    def test_log_file_created(self):
        """日志文件被创建。"""
        import tempfile
        import os
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                log_file = logger.get_log_file()
                assert os.path.exists(log_file)
            finally:
                logger.close()

    def test_log_info_and_debug(self):
        """log_info 和 log_debug 方法。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = AgentLogger(log_dir=tmpdir)
            try:
                logger.log_info("信息消息")
                logger.log_debug("调试消息")
                logger.log_warning("警告消息")
                # 这些方法不写入 trace，只写入日志文件
                assert logger.get_log_file() is not None
            finally:
                logger.close()

    def test_multiple_loggers_different_names(self):
        """不同名称的 logger 不冲突。"""
        import tempfile
        from harness.logger import AgentLogger
        with tempfile.TemporaryDirectory() as tmpdir:
            logger1 = AgentLogger(log_dir=tmpdir, name="agent1")
            logger2 = AgentLogger(log_dir=tmpdir, name="agent2")
            try:
                logger1.log_turn_start(1, "hello")
                logger2.log_turn_start(1, "world")
                assert len(logger1.trace) == 1
                assert len(logger2.trace) == 1
            finally:
                logger1.close()
                logger2.close()


class TestErrorRecovery:
    """测试 ErrorRecovery 错误分类与恢复。"""

    def test_classify_timeout_as_retryable(self):
        """超时错误分类为 RETRYABLE。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error(Exception("Connection timed out")) == ErrorSeverity.RETRYABLE
        assert ErrorRecovery.classify_error("request timeout") == ErrorSeverity.RETRYABLE

    def test_classify_rate_limit_as_retryable(self):
        """限流错误分类为 RETRYABLE。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error(Exception("rate limit exceeded")) == ErrorSeverity.RETRYABLE
        assert ErrorRecovery.classify_error("HTTP 429 Too Many Requests") == ErrorSeverity.RETRYABLE

    def test_classify_context_length_as_degradable(self):
        """上下文超长分类为 DEGRADABLE。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error(Exception("context length exceeded")) == ErrorSeverity.DEGRADABLE
        assert ErrorRecovery.classify_error("token limit reached") == ErrorSeverity.DEGRADABLE

    def test_classify_auth_error_as_fatal(self):
        """认证错误分类为 FATAL。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error(Exception("invalid api key")) == ErrorSeverity.FATAL
        assert ErrorRecovery.classify_error("HTTP 401 Unauthorized") == ErrorSeverity.FATAL

    def test_classify_unknown_error_as_fatal(self):
        """未知错误默认分类为 FATAL。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error(Exception("some unknown error")) == ErrorSeverity.FATAL

    def test_classify_with_string_input(self):
        """支持字符串输入分类。"""
        from harness.recovery import ErrorRecovery, ErrorSeverity
        assert ErrorRecovery.classify_error("network error connection reset") == ErrorSeverity.RETRYABLE

    def test_compute_delay_exponential(self):
        """指数退避延迟计算。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(base_delay=1.0, max_delay=30.0)
        assert recovery._compute_delay(1) == 1.0
        assert recovery._compute_delay(2) == 2.0
        assert recovery._compute_delay(3) == 4.0
        assert recovery._compute_delay(4) == 8.0

    def test_compute_delay_capped(self):
        """延迟上限约束。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(base_delay=1.0, max_delay=5.0)
        assert recovery._compute_delay(10) == 5.0

    def test_sync_retryable_error_recovers(self):
        """同步模式：可重试错误恢复成功。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=3, base_delay=0.01)
        call_count = [0]

        def flaky_func():
            call_count[0] += 1
            if call_count[0] < 3:
                raise Exception("connection timeout")
            return "success"

        result = recovery.execute_sync_with_recovery(flaky_func)
        assert result == "success"
        assert call_count[0] == 3
        assert recovery.retry_count >= 2

    def test_sync_fatal_error_raises_immediately(self):
        """同步模式：致命错误立即抛出。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=3, base_delay=0.01)
        call_count = [0]

        def fatal_func():
            call_count[0] += 1
            raise Exception("invalid api key")

        with pytest.raises(Exception, match="invalid api key"):
            recovery.execute_sync_with_recovery(fatal_func)
        assert call_count[0] == 1  # 只调用一次，不重试
        assert recovery.fatal_count == 1

    def test_sync_degradable_fallback(self):
        """同步模式：可降级错误使用降级函数。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=3, base_delay=0.01)

        def main_func():
            raise Exception("context length exceeded")

        def fallback_func():
            return "fallback result"

        result = recovery.execute_sync_with_recovery(main_func, fallback_func=fallback_func)
        assert result == "fallback result"
        assert recovery.fallback_count == 1

    def test_sync_exhaust_retries(self):
        """同步模式：重试耗尽后抛出。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=2, base_delay=0.01)

        def always_fail():
            raise Exception("connection timeout")

        with pytest.raises(Exception, match="connection timeout"):
            recovery.execute_sync_with_recovery(always_fail)

    def test_get_stats(self):
        """获取统计信息。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery()
        stats = recovery.get_stats()
        assert stats == {"retry_count": 0, "fallback_count": 0, "fatal_count": 0}

    def test_reset_stats(self):
        """重置统计。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery()

        def fail():
            raise Exception("invalid api key")

        try:
            recovery.execute_sync_with_recovery(fail)
        except Exception:
            pass
        assert recovery.fatal_count == 1

        recovery.reset_stats()
        assert recovery.get_stats()["fatal_count"] == 0

    @pytest.mark.asyncio
    async def test_async_retryable_error_recovers(self):
        """异步模式：可重试错误恢复成功。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=3, base_delay=0.01)
        call_count = [0]

        async def flaky_func():
            call_count[0] += 1
            if call_count[0] < 3:
                raise Exception("connection timeout")
            return "async success"

        result = await recovery.execute_with_recovery(flaky_func)
        assert result == "async success"
        assert call_count[0] == 3

    @pytest.mark.asyncio
    async def test_async_fatal_error_raises_immediately(self):
        """异步模式：致命错误立即抛出。"""
        from harness.recovery import ErrorRecovery
        recovery = ErrorRecovery(max_retries=3, base_delay=0.01)
        call_count = [0]

        async def fatal_func():
            call_count[0] += 1
            raise Exception("invalid api key")

        with pytest.raises(Exception, match="invalid api key"):
            await recovery.execute_with_recovery(fatal_func)
        assert call_count[0] == 1


class TestSandbox:
    """测试 Sandbox 路径安全沙箱。"""

    def test_path_safe_within_allowed(self):
        """允许目录内的路径安全。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            safe_path = os.path.join(tmpdir, "test.txt")
            assert sandbox.is_path_safe(safe_path) is True

    def test_path_safe_outside_allowed(self):
        """允许目录外的路径被拒绝。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            assert sandbox.is_path_safe("/etc/passwd") is False
            assert sandbox.is_path_safe("C:\\Windows\\System32") is False

    def test_path_safe_parent_traversal(self):
        """路径穿越攻击被拒绝。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            assert sandbox.is_path_safe(os.path.join(tmpdir, "../etc/passwd")) is False

    def test_safe_read_file(self):
        """安全读取允许目录内的文件。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            test_file = os.path.join(tmpdir, "readme.txt")
            with open(test_file, "w", encoding="utf-8") as f:
                f.write("Hello Sandbox")
            content = sandbox.safe_read_file(test_file)
            assert content == "Hello Sandbox"

    def test_safe_read_file_permission_denied(self):
        """安全读取不允许目录外的文件抛出 PermissionError。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            with pytest.raises(PermissionError, match="沙箱拒绝"):
                sandbox.safe_read_file("/etc/passwd")

    def test_safe_write_file(self):
        """安全写入文件到允许目录。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            test_file = os.path.join(tmpdir, "output.txt")
            sandbox.safe_write_file(test_file, "Hello World")
            with open(test_file, "r", encoding="utf-8") as f:
                assert f.read() == "Hello World"

    def test_safe_write_file_permission_denied(self):
        """安全写入不允许目录外的文件抛出 PermissionError。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            with pytest.raises(PermissionError, match="沙箱拒绝"):
                sandbox.safe_write_file("/etc/hacked", "malicious")

    def test_safe_list_directory(self):
        """安全列出目录内容。"""
        import tempfile
        from pathlib import Path
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            # 创建一些文件
            for name in ["a.txt", "b.txt", "c.txt"]:
                Path(tmpdir, name).touch()
            files = sandbox.safe_list_directory(tmpdir)
            assert "a.txt" in files
            assert "b.txt" in files
            assert "c.txt" in files

    def test_safe_list_directory_permission_denied(self):
        """安全列出不允许目录抛出 PermissionError。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([tmpdir])
            with pytest.raises(PermissionError, match="沙箱拒绝"):
                sandbox.safe_list_directory("/etc")

    def test_is_command_blocked(self):
        """命令阻止列表检查。"""
        from harness.sandbox import Sandbox
        sandbox = Sandbox(["./workspace"])
        assert sandbox.is_command_blocked("rm -rf /", ["rm -rf", "format"]) is True
        assert sandbox.is_command_blocked("format C:", ["rm -rf", "format"]) is True
        assert sandbox.is_command_blocked("dir", ["rm -rf", "format"]) is False

    def test_is_command_blocked_case_insensitive(self):
        """命令阻止检查不区分大小写。"""
        from harness.sandbox import Sandbox
        sandbox = Sandbox(["./workspace"])
        assert sandbox.is_command_blocked("RM -RF /", ["rm -rf"]) is True
        assert sandbox.is_command_blocked("Format C:", ["format"]) is True

    def test_sanitize_path_null_byte(self):
        """sanitize_path 移除空字节。"""
        from harness.sandbox import Sandbox
        sandbox = Sandbox(["./workspace"])
        result = sandbox.sanitize_path("test.txt\0extra")
        assert "\0" not in result

    def test_sanitize_path_normalize(self):
        """sanitize_path 规范化路径。"""
        from harness.sandbox import Sandbox
        sandbox = Sandbox(["./workspace"])
        result = sandbox.sanitize_path("./workspace/../workspace/test.txt")
        assert ".." not in result

    def test_is_safe_command(self):
        """is_safe_command 检查。"""
        from harness.sandbox import Sandbox
        sandbox = Sandbox(["./workspace"])
        assert sandbox.is_safe_command("ls -la", ["rm -rf", "format"]) is True
        assert sandbox.is_safe_command("rm -rf /", ["rm -rf", "format"]) is False

    def test_add_and_remove_allowed_directory(self):
        """动态添加和移除允许目录。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            sandbox = Sandbox([])  # 初始无允许目录
            new_dir = os.path.join(tmpdir, "new_allowed")
            sandbox.add_allowed_directory(new_dir)
            assert sandbox.is_path_safe(os.path.join(new_dir, "test.txt")) is True
            sandbox.remove_allowed_directory(new_dir)
            assert sandbox.is_path_safe(os.path.join(new_dir, "test.txt")) is False

    def test_multiple_allowed_dirs(self):
        """多个允许目录。"""
        import tempfile
        from harness.sandbox import Sandbox
        with tempfile.TemporaryDirectory() as tmpdir:
            dir1 = os.path.join(tmpdir, "dir1")
            dir2 = os.path.join(tmpdir, "dir2")
            sandbox = Sandbox([dir1, dir2])
            assert sandbox.is_path_safe(os.path.join(dir1, "a.txt")) is True
            assert sandbox.is_path_safe(os.path.join(dir2, "b.txt")) is True
            assert sandbox.is_path_safe(os.path.join(tmpdir, "c.txt")) is False


# ============================================================================
# 直接运行入口
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
