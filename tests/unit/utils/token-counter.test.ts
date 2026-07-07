import { TokenCounter } from '../../../src/utils/token-counter.js';
import type { Message } from '../../../src/llm/provider.js';

describe('TokenCounter', () => {
  const counter = new TokenCounter(128000);

  describe('estimateTokens', () => {
    it('should estimate tokens for text', () => {
      const tokens = counter.estimateTokens('Hello world');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      expect(counter.estimateTokens('')).toBe(0);
    });
  });

  describe('isOverBudget', () => {
    it('should return false for small messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];
      expect(counter.isOverBudget(messages)).toBe(false);
    });

    it('should return true for large messages', () => {
      const longText = 'x'.repeat(500000);
      const messages: Message[] = [{ role: 'user', content: longText }];
      expect(counter.isOverBudget(messages)).toBe(true);
    });
  });

  describe('truncate', () => {
    it('should not truncate small messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = counter.truncate(messages);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('system');
    });

    it('should preserve system prompt', () => {
      const longText = 'x'.repeat(500000);
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: longText },
      ];
      const result = counter.truncate(messages);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toBe('System prompt');
    });

    it('should preserve last 2 rounds', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' },
        { role: 'assistant', content: 'A2' },
      ];
      const result = counter.truncate(messages);
      // System + last 2 rounds (4 messages) = 5 messages
      expect(result.length).toBeGreaterThanOrEqual(3);
      // Last messages should be preserved
      expect(result[result.length - 1].content).toBe('A2');
      expect(result[result.length - 2].content).toBe('Q2');
    });

    it('should compress long code blocks', () => {
      const codeLines = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`);
      const longCode = codeLines.join('\n');
      const messages: Message[] = [{ role: 'user', content: longCode }];
      const result = counter.truncate(messages);
      // Should be compressed
      const content = result[0].content ?? '';
      expect(content.length).toBeLessThan(longCode.length);
    });
  });
});
