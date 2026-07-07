import type { Message, ToolDefinition } from '../../../../src/llm/provider.js';

const mockGetCredential = jest.fn();
const mockFetch = jest.fn();

jest.mock('../../../../src/utils/credential.js', () => ({
  getCredential: mockGetCredential,
}));

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as Response;
}

describe('OpenAIProvider', () => {
  let OpenAIProvider: new (config?: { model?: string; contextWindow?: number }) => {
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
    const mod = await import('../../../../src/llm/adapters/openai.js');
    OpenAIProvider = mod.OpenAIProvider;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredential.mockResolvedValue('sk-test-key');
    (globalThis as Record<string, unknown>).fetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).fetch;
  });

  describe('constructor', () => {
    it('should create provider with default model', () => {
      const provider = new OpenAIProvider();
      expect(provider.name).toBe('openai');
      expect(provider.supportsToolUse).toBe(true);
      expect(provider.contextWindow).toBe(128000);
    });

    it('should create provider with custom model and context window', () => {
      const provider = new OpenAIProvider({
        model: 'gpt-4-turbo',
        contextWindow: 128000,
      });
      expect(provider.contextWindow).toBe(128000);
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

    it('should call OpenAI API and return parsed response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'chatcmpl-123',
          model: 'gpt-4o',
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

      const provider = new OpenAIProvider();
      const response = await provider.chat(messages);

      expect(response.message.role).toBe('assistant');
      expect(response.message.content).toBe('Hello! How can I help?');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(response.model).toBe('gpt-4o');
      expect(response.finishReason).toBe('stop');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com'),
        expect.objectContaining({
          method: 'POST',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        }),
      );
    });

    it('should parse tool calls correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'chatcmpl-456',
          model: 'gpt-4o',
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

      const provider = new OpenAIProvider();
      const response = await provider.chat(messages, { tools });

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0].id).toBe('call_abc');
      expect(response.message.toolCalls![0].name).toBe('run_command');
      expect(response.message.toolCalls![0].arguments).toEqual({
        command: 'npm test',
      });
      expect(response.finishReason).toBe('tool_calls');
    });

    it('should pass tools to the API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'chatcmpl-789',
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'OK' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        }),
      );

      const provider = new OpenAIProvider();
      await provider.chat(messages, { tools, toolChoice: 'auto' });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callArg = mockFetch.mock.calls[0]![1] as RequestInit;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const callBody = JSON.parse(callArg.body as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(callBody.tools).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(callBody.tool_choice).toBe('auto');
    });

    it('should throw on 401 unauthorized error', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: 'Unauthorized' }, 401));

      const provider = new OpenAIProvider();
      await expect(provider.chat(messages)).rejects.toThrow('401');
    });

    it('should retry on 429 rate limit error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'Rate limited' }, 429))
        .mockResolvedValueOnce(
          mockResponse({
            id: 'chatcmpl-retry',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Retry success' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completionTokens: 1, totalTokens: 2 },
          }),
        );

      const provider = new OpenAIProvider();
      const response = await provider.chat(messages);

      expect(response.message.content).toBe('Retry success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx server error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(
          mockResponse({
            id: 'chatcmpl-retry2',
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'After retry' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completionTokens: 1, totalTokens: 2 },
          }),
        );

      const provider = new OpenAIProvider();
      const response = await provider.chat(messages);

      expect(response.message.content).toBe('After retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('countTokens', () => {
    it('should return approximate token count', async () => {
      const provider = new OpenAIProvider();
      const tokens = await provider.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
