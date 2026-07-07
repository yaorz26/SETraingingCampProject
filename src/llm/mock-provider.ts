import type { LLMProvider, Message, ChatOptions, ChatResponse } from './provider.js';

/**
 * 预设的 Mock 响应，支持输入匹配
 */
export interface MockResponse {
  /** 正则匹配用户输入，匹配时使用此响应 */
  match?: RegExp;
  /** 响应消息 */
  message: Message;
  /** 可选 token 用量 */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** 可选模型名称 */
  model?: string;
}

/**
 * 响应匹配策略
 */
export type MatchStrategy = 'sequential' | 'match-first';

/**
 * Chat 请求记录
 */
export interface ChatRequestRecord {
  messages: Message[];
  options?: ChatOptions;
  response: ChatResponse;
  timestamp: number;
}

/**
 * Mock LLM Provider — 用于确定性测试
 * 支持预设响应序列和输入匹配
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';
  readonly supportsToolUse = true;
  readonly contextWindow = 128000;

  private responses: MockResponse[];
  private strategy: MatchStrategy;
  private index = 0;
  private history: ChatRequestRecord[] = [];

  constructor(responses: MockResponse[], strategy: MatchStrategy = 'sequential') {
    this.responses = responses;
    this.strategy = strategy;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const mockResponse = this.resolveResponse(messages);

    const response: ChatResponse = {
      message: mockResponse.message,
      usage: mockResponse.usage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      model: mockResponse.model ?? 'mock-model',
    };

    this.history.push({
      messages,
      options,
      response,
      timestamp: Date.now(),
    });

    return Promise.resolve(response);
  }

  private resolveResponse(messages: Message[]): MockResponse {
    if (this.strategy === 'match-first') {
      // Try to match the last user message content
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg?.content) {
        for (const r of this.responses) {
          if (r.match && r.match.test(lastUserMsg.content)) {
            return r;
          }
        }
      }
    }

    // Sequential fallback
    if (this.index >= this.responses.length) {
      throw new Error('Mock response sequence exhausted');
    }
    const response = this.responses[this.index];
    this.index++;
    return response;
  }

  countTokens(messages: Message[]): Promise<number> {
    if (messages.length === 0) return Promise.resolve(0);
    let total = 0;
    for (const msg of messages) {
      if (msg.content) {
        total += Math.ceil(msg.content.length / 4);
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += Math.ceil(JSON.stringify(tc.arguments).length / 4);
        }
      }
    }
    return Promise.resolve(total);
  }

  /**
   * 获取所有请求历史
   */
  getHistory(): ChatRequestRecord[] {
    return this.history;
  }

  /**
   * 重置 Mock 状态（索引和请求历史）
   */
  reset(): void {
    this.index = 0;
    this.history = [];
  }
}
