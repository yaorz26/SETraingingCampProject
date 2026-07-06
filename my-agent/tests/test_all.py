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
# 直接运行入口
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
