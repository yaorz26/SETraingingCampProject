import type { Message } from '../llm/provider.js';

export class TokenCounter {
  private contextWindow: number;
  private threshold: number;

  constructor(contextWindow: number) {
    this.contextWindow = contextWindow;
    this.threshold = Math.floor(contextWindow * 0.8);
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  isOverBudget(messages: Message[]): boolean {
    const total = this.countTotal(messages);
    return total > this.threshold;
  }

  truncate(messages: Message[]): Message[] {
    if (messages.length === 0) return [];

    const totalTokens = this.countTotal(messages);
    const result: Message[] = [];

    // Always compress long code blocks first
    const compressed = this.compressCodeBlocks(messages);

    if (totalTokens <= this.threshold) return compressed;

    let currentTokens = 0;

    // Priority 5: System prompt - always keep
    const systemMsg = compressed.find((m) => m.role === 'system');
    if (systemMsg) {
      result.push(systemMsg);
      currentTokens += this.estimateTokens(systemMsg.content ?? '');
    }

    // Priority 5: Last 2 rounds - always keep
    const nonSystem = compressed.filter((m) => m.role !== 'system');
    const last4 = nonSystem.slice(-4);

    // Priority 4: Earlier history - compress
    const earlier = nonSystem.slice(0, -4);
    for (const msg of earlier) {
      const tokens = this.estimateTokens(msg.content ?? '');
      if (currentTokens + tokens <= this.threshold) {
        result.push(msg);
        currentTokens += tokens;
      } else {
        const compressedContent = this.compressContent(msg.content ?? '');
        result.push({ ...msg, content: compressedContent });
        currentTokens += this.estimateTokens(compressedContent);
      }
    }

    // Add last 4 messages (always keep)
    for (const msg of last4) {
      result.push(msg);
    }

    return result;
  }

  private countTotal(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += this.estimateTokens(msg.content ?? '');
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += this.estimateTokens(JSON.stringify(tc.arguments));
        }
      }
    }
    return total;
  }

  private compressContent(content: string): string {
    if (content.length <= 200) return content;
    return content.slice(0, 100) + '... [compressed] ...' + content.slice(-50);
  }

  private compressCodeBlocks(messages: Message[]): Message[] {
    return messages.map((msg) => {
      const content = msg.content ?? '';
      const lines = content.split('\n');
      if (lines.length > 500) {
        const head = lines.slice(0, 10).join('\n');
        const tail = lines.slice(-10).join('\n');
        return {
          ...msg,
          content: `${head}\n... [${lines.length - 20} lines compressed] ...\n${tail}`,
        };
      }
      return msg;
    });
  }
}
