import type { Message, ToolDefinition } from '../../../../src/llm/provider.js';

const mockFetch = jest.fn();

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as Response;
}

describe('OllamaProvider', () => {
  let OllamaProvider: new (config?: {
    model?: string;
    contextWindow?: number;
    baseURL?: string;
  }) => {
    name: string;
    supportsToolUse: boolean;
    contextWindow: number;
    chat: (
      messages: Message[],
      options?: { tools?: ToolDefinition[]; toolChoice?: string },
    ) => Promise<{
      message: {
        role: string;
        content: string | null;
        toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      };
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      model?: string;
      finishReason?: string;
    }>;
    countTokens: (messages: Message[]) => Promise<number>;
  };

  beforeAll(async () => {
    const mod = await import('../../../../src/llm/adapters/ollama.js');
    OllamaProvider = mod.OllamaProvider;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as Record<string, unknown>).fetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).fetch;
  });

  describe('constructor', () => {
    it('should create provider with default model', () => {
      const provider = new OllamaProvider();
      expect(provider.name).toBe('ollama');
      expect(provider.supportsToolUse).toBe(true);
      expect(provider.contextWindow).toBe(128000);
    });

    it('should create provider with custom model and base URL', () => {
      const provider = new OllamaProvider({
        model: 'qwen2.5-coder:14b',
        baseURL: 'http://localhost:11434/v1',
        contextWindow: 32768,
      });
      expect(provider.contextWindow).toBe(32768);
    });
  });

  describe('chat', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
          },
        },
      },
    ];

    it('should call Ollama API and return parsed response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'chatcmpl-123',
          model: 'qwen2.5-coder:14b',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      );

      const provider = new OllamaProvider();
      const response = await provider.chat(messages);

      expect(response.message.role).toBe('assistant');
      expect(response.message.content).toBe('Hello! How can I help?');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(response.model).toBe('qwen2.5-coder:14b');
      expect(response.finishReason).toBe('stop');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('11434'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('should parse tool calls correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'chatcmpl-456',
          model: 'qwen2.5-coder:14b',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_abc',
                    type: 'function',
                    function: {
                      name: 'run_command',
                      arguments: JSON.stringify({ command: 'npm test' }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30,
          },
        }),
      );

      const provider = new OllamaProvider();
      const response = await provider.chat(messages, { tools });

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0].id).toBe('call_abc');
      expect(response.message.toolCalls![0].name).toBe('run_command');
      expect(response.message.toolCalls![0].arguments).toEqual({
        command: 'npm test',
      });
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should retry on 5xx server error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(
          mockResponse({
            id: 'chatcmpl-retry',
            model: 'qwen2.5-coder:14b',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'After retry' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );

      const provider = new OllamaProvider();
      const response = await provider.chat(messages);

      expect(response.message.content).toBe('After retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('countTokens', () => {
    it('should return approximate token count', async () => {
      const provider = new OllamaProvider();
      const tokens = await provider.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
