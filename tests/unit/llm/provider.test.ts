import type {
  LLMProvider,
  ChatOptions,
  ChatResponse,
  Message,
  MessageRole,
} from '../../../src/llm/provider.js';

describe('LLMProvider interface types', () => {
  it('should compile with a valid Message', () => {
    const msg: Message = {
      role: 'user' as MessageRole,
      content: 'Hello',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('should compile with a ToolCall in assistant message', () => {
    const msg: Message = {
      role: 'assistant' as MessageRole,
      content: 'I will run a command',
      toolCalls: [
        {
          id: 'call_123',
          name: 'run_command',
          arguments: { command: 'npm test', cwd: '/project' },
        },
      ],
    };
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe('run_command');
  });

  it('should compile with a ToolResult in tool message', () => {
    const msg: Message = {
      role: 'tool' as MessageRole,
      content: 'Command output',
      toolCallId: 'call_123',
    };
    expect(msg.role).toBe('tool');
    expect(msg.toolCallId).toBe('call_123');
  });

  it('should compile with a ChatOptions', () => {
    const options: ChatOptions = {
      model: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 4096,
      tools: [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path' },
              },
            },
          },
        },
      ],
    };
    expect(options.model).toBe('gpt-4o');
    expect(options.temperature).toBe(0.5);
    expect(options.tools).toHaveLength(1);
  });

  it('should compile with a ChatResponse', () => {
    const response: ChatResponse = {
      message: {
        role: 'assistant' as MessageRole,
        content: 'Done',
        toolCalls: [],
      },
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      model: 'gpt-4o',
    };
    expect(response.usage!.totalTokens).toBe(150);
    expect(response.model).toBe('gpt-4o');
  });
});

describe('LLMProvider mock implementation', () => {
  class MockProvider implements LLMProvider {
    name = 'mock';
    supportsToolUse = true;
    contextWindow = 128000;

    chat(_messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
      return Promise.resolve({
        message: { role: 'assistant', content: 'Mock response' },
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    }

    countTokens(_messages: Message[]): Promise<number> {
      return Promise.resolve(0);
    }
  }

  it('should satisfy the LLMProvider interface', () => {
    const provider = new MockProvider();
    expect(provider.name).toBe('mock');
    expect(provider.supportsToolUse).toBe(true);
    expect(provider.contextWindow).toBe(128000);
  });

  it('should return a valid ChatResponse', async () => {
    const provider = new MockProvider();
    const response = await provider.chat([{ role: 'user', content: 'Hi' }]);
    expect(response.message.role).toBe('assistant');
    expect(response.message.content).toBe('Mock response');
  });

  it('should count tokens', async () => {
    const provider = new MockProvider();
    const tokens = await provider.countTokens([{ role: 'user', content: 'Hello' }]);
    expect(tokens).toBe(0);
  });
});
