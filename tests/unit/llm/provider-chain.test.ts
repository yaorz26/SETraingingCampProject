import type { LLMProvider, Message, ChatOptions, ChatResponse } from '../../../src/llm/provider.js';
import { MockLLMProvider } from '../../../src/llm/mock-provider.js';

describe('LLMProviderChain', () => {
  let LLMProviderChain: new (providers: LLMProvider[]) => {
    readonly name: string;
    readonly supportsToolUse: boolean;
    readonly contextWindow: number;
    chat: (messages: Message[], options?: ChatOptions) => Promise<ChatResponse>;
    countTokens: (messages: Message[]) => Promise<number>;
    getCurrentProvider: () => LLMProvider;
  };

  beforeAll(async () => {
    const mod = await import('../../../src/llm/provider-chain.js');
    LLMProviderChain = mod.LLMProviderChain;
  });

  describe('constructor', () => {
    it('should use first provider as primary', () => {
      const primary = new MockLLMProvider([{ message: { role: 'assistant', content: 'Primary' } }]);
      const chain = new LLMProviderChain([primary]);
      expect(chain.name).toBe('mock');
      expect(chain.supportsToolUse).toBe(true);
      expect(chain.contextWindow).toBe(128000);
    });

    it('should throw when no providers are given', () => {
      expect(() => new LLMProviderChain([])).toThrow();
    });
  });

  describe('chat', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];

    it('should use primary provider when it succeeds', async () => {
      const primary = new MockLLMProvider([
        { message: { role: 'assistant', content: 'Primary response' } },
      ]);
      const chain = new LLMProviderChain([primary]);
      const response = await chain.chat(messages);
      expect(response.message.content).toBe('Primary response');
      expect(chain.getCurrentProvider()).toBe(primary);
    });

    it('should fall back to secondary provider on failure', async () => {
      const primary = new MockLLMProvider([]);
      const fallback = new MockLLMProvider([
        { message: { role: 'assistant', content: 'Fallback response' } },
      ]);

      const chain = new LLMProviderChain([primary, fallback]);
      const response = await chain.chat(messages);
      expect(response.message.content).toBe('Fallback response');
      expect(chain.getCurrentProvider()).toBe(fallback);
    });

    it('should not recover after fallback', async () => {
      // After fallback, should continue using fallback provider
      const primary = new MockLLMProvider([]);
      const fallback = new MockLLMProvider([
        { message: { role: 'assistant', content: 'First fallback' } },
        { message: { role: 'assistant', content: 'Second fallback' } },
      ]);

      const chain = new LLMProviderChain([primary, fallback]);

      const res1 = await chain.chat(messages);
      expect(res1.message.content).toBe('First fallback');
      expect(chain.getCurrentProvider()).toBe(fallback);

      const res2 = await chain.chat(messages);
      expect(res2.message.content).toBe('Second fallback');
      expect(chain.getCurrentProvider()).toBe(fallback);
    });

    it('should throw when all providers fail', async () => {
      const primary = new MockLLMProvider([]);
      const fallback = new MockLLMProvider([]);

      const chain = new LLMProviderChain([primary, fallback]);
      await expect(chain.chat(messages)).rejects.toThrow('所有 LLM 供应商均不可用');
    });

    it('should not fall back on 4xx errors (non-retryable)', async () => {
      // Create a provider that throws a 4xx-like error
      const badProvider = new MockLLMProvider([]);
      const originalChat = badProvider.chat.bind(badProvider);
      badProvider.chat = async (msgs, opts) => {
        try {
          return await originalChat(msgs, opts);
        } catch (err) {
          // Attach a 4xx status to simulate non-retryable error
          const e = err as Error & { status?: number };
          e.status = 401;
          throw e;
        }
      };
      const fallback = new MockLLMProvider([
        { message: { role: 'assistant', content: 'Fallback' } },
      ]);
      const chain = new LLMProviderChain([badProvider, fallback]);
      await expect(chain.chat(messages)).rejects.toThrow();
    });
  });

  describe('countTokens', () => {
    it('should delegate to current provider', async () => {
      const primary = new MockLLMProvider([{ message: { role: 'assistant', content: 'OK' } }]);
      const chain = new LLMProviderChain([primary]);
      const tokens = await chain.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should delegate to fallback provider after degradation', async () => {
      const primary = new MockLLMProvider([]);
      const fallback = new MockLLMProvider([{ message: { role: 'assistant', content: 'OK' } }]);
      const chain = new LLMProviderChain([primary, fallback]);
      await chain.chat([{ role: 'user', content: 'Hi' }]);
      const tokens = await chain.countTokens([{ role: 'user', content: 'Hello world' }]);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
