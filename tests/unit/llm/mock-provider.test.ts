import { MockLLMProvider } from '../../../src/llm/mock-provider.js';
import type { Message } from '../../../src/llm/provider.js';

describe('MockLLMProvider', () => {
  const userMessage: Message = { role: 'user', content: 'Hello' };

  describe('sequential responses', () => {
    it('should return responses in sequence order', async () => {
      const provider = new MockLLMProvider([
        {
          message: { role: 'assistant', content: 'First response' },
        },
        {
          message: { role: 'assistant', content: 'Second response' },
        },
      ]);

      const res1 = await provider.chat([userMessage]);
      expect(res1.message.content).toBe('First response');

      const res2 = await provider.chat([userMessage]);
      expect(res2.message.content).toBe('Second response');
    });

    it('should throw when sequence is exhausted', async () => {
      const provider = new MockLLMProvider([
        {
          message: { role: 'assistant', content: 'Only response' },
        },
      ]);

      await provider.chat([userMessage]);

      await expect(provider.chat([userMessage])).rejects.toThrow(
        'Mock response sequence exhausted',
      );
    });
  });

  describe('input matching', () => {
    it('should match response by message content', async () => {
      const provider = new MockLLMProvider(
        [
          {
            match: /hello/i,
            message: { role: 'assistant', content: 'Hello back!' },
          },
          {
            match: /bye/i,
            message: { role: 'assistant', content: 'Goodbye!' },
          },
        ],
        'match-first',
      );

      const res1 = await provider.chat([{ role: 'user', content: 'Hello world' }]);
      expect(res1.message.content).toBe('Hello back!');

      const res2 = await provider.chat([{ role: 'user', content: 'Say bye' }]);
      expect(res2.message.content).toBe('Goodbye!');
    });

    it('should fall through to default when no match found', async () => {
      const provider = new MockLLMProvider(
        [
          {
            match: /hello/i,
            message: { role: 'assistant', content: 'Matched' },
          },
        ],
        'match-first',
      );

      const res = await provider.chat([{ role: 'user', content: 'No match here' }]);
      // Should still return the first (and only) response
      expect(res.message.content).toBe('Matched');
    });
  });

  describe('request history', () => {
    it('should record all chat requests', async () => {
      const provider = new MockLLMProvider([
        { message: { role: 'assistant', content: 'Response 1' } },
        { message: { role: 'assistant', content: 'Response 2' } },
      ]);

      await provider.chat([{ role: 'user', content: 'Q1' }]);
      await provider.chat([{ role: 'user', content: 'Q2' }]);

      const history = provider.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].messages[0].content).toBe('Q1');
      expect(history[1].messages[0].content).toBe('Q2');
    });

    it('should be empty initially', () => {
      const provider = new MockLLMProvider([]);
      expect(provider.getHistory()).toHaveLength(0);
    });
  });

  describe('tool use responses', () => {
    it('should support tool call responses', async () => {
      const provider = new MockLLMProvider([
        {
          message: {
            role: 'assistant',
            content: 'I will run a command',
            toolCalls: [
              {
                id: 'call_001',
                name: 'run_command',
                arguments: { command: 'npm test' },
              },
            ],
          },
        },
      ]);

      const res = await provider.chat([userMessage]);
      expect(res.message.toolCalls).toBeDefined();
      expect(res.message.toolCalls![0].name).toBe('run_command');
      expect(res.message.toolCalls![0].arguments).toEqual({ command: 'npm test' });
    });
  });

  describe('countTokens', () => {
    it('should return approximate token count', async () => {
      const provider = new MockLLMProvider([]);
      const tokens = await provider.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty messages', async () => {
      const provider = new MockLLMProvider([]);
      const tokens = await provider.countTokens([]);
      expect(tokens).toBe(0);
    });
  });

  describe('provider properties', () => {
    it('should have correct provider properties', () => {
      const provider = new MockLLMProvider([]);
      expect(provider.name).toBe('mock');
      expect(provider.supportsToolUse).toBe(true);
      expect(provider.contextWindow).toBe(128000);
    });
  });
});
