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

describe('AnthropicProvider', () => {
  let AnthropicProvider: new (config?: { model?: string; contextWindow?: number }) => {
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
    const mod = await import('../../../../src/llm/adapters/anthropic.js');
    AnthropicProvider = mod.AnthropicProvider;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredential.mockResolvedValue('sk-ant-test-key');
    (globalThis as Record<string, unknown>).fetch = mockFetch;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).fetch;
  });

  describe('constructor', () => {
    it('should create provider with default model', () => {
      const provider = new AnthropicProvider();
      expect(provider.name).toBe('anthropic');
      expect(provider.supportsToolUse).toBe(true);
      expect(provider.contextWindow).toBe(200000);
    });

    it('should create provider with custom model and context window', () => {
      const provider = new AnthropicProvider({
        model: 'claude-sonnet-4-20250514',
        contextWindow: 200000,
      });
      expect(provider.contextWindow).toBe(200000);
    });
  });

  describe('chat', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];

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

    it('should call Anthropic API and return parsed text response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'msg_123',
          model: 'claude-sonnet-4-20250514',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello! How can I help?' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        }),
      );

      const provider = new AnthropicProvider();
      const response = await provider.chat(messages);

      expect(response.message.role).toBe('assistant');
      expect(response.message.content).toBe('Hello! How can I help?');
      expect(response.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.finishReason).toBe('end_turn');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.anthropic.com'),
        expect.objectContaining({
          method: 'POST',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );
    });

    it('should parse tool use responses correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'msg_456',
          model: 'claude-sonnet-4-20250514',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_abc',
              name: 'run_command',
              input: { command: 'npm test' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 20,
            output_tokens: 10,
          },
        }),
      );

      const provider = new AnthropicProvider();
      const response = await provider.chat(messages, { tools });

      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0].id).toBe('toolu_abc');
      expect(response.message.toolCalls![0].name).toBe('run_command');
      expect(response.message.toolCalls![0].arguments).toEqual({
        command: 'npm test',
      });
      expect(response.finishReason).toBe('tool_use');
    });

    it('should handle mixed content (text + tool_use)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'msg_789',
          model: 'claude-sonnet-4-20250514',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will run the command.' },
            {
              type: 'tool_use',
              id: 'toolu_def',
              name: 'run_command',
              input: { command: 'npm test' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {
            input_tokens: 15,
            output_tokens: 20,
          },
        }),
      );

      const provider = new AnthropicProvider();
      const response = await provider.chat(messages, { tools });

      expect(response.message.content).toBe('I will run the command.');
      expect(response.message.toolCalls).toHaveLength(1);
      expect(response.message.toolCalls![0].name).toBe('run_command');
    });

    it('should pass tools and system message to the API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          id: 'msg_000',
          model: 'claude-sonnet-4-20250514',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
      );

      const systemMessages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      const provider = new AnthropicProvider();
      await provider.chat(systemMessages, { tools, toolChoice: 'auto' });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const callArg = mockFetch.mock.calls[0]![1] as RequestInit;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const callBody = JSON.parse(callArg.body as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(callBody.system).toBe('You are a helpful assistant.');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(callBody.tools).toBeDefined();
    });

    it('should throw on 401 unauthorized error', async () => {
      mockFetch.mockResolvedValue(mockResponse({ error: 'Unauthorized' }, 401));

      const provider = new AnthropicProvider();
      await expect(provider.chat(messages)).rejects.toThrow('401');
    });

    it('should retry on 429 rate limit error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'Rate limited' }, 429))
        .mockResolvedValueOnce(
          mockResponse({
            id: 'msg_retry',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Retry success' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );

      const provider = new AnthropicProvider();
      const response = await provider.chat(messages);

      expect(response.message.content).toBe('Retry success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx server error', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ error: 'Server error' }, 500))
        .mockResolvedValueOnce(
          mockResponse({
            id: 'msg_retry2',
            model: 'claude-sonnet-4-20250514',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'After retry' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        );

      const provider = new AnthropicProvider();
      const response = await provider.chat(messages);

      expect(response.message.content).toBe('After retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('countTokens', () => {
    it('should return approximate token count', async () => {
      const provider = new AnthropicProvider();
      const tokens = await provider.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
