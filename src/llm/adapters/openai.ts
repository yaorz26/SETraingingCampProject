import type { LLMProvider, Message, ChatOptions, ChatResponse, TokenUsage } from '../provider.js';
import { getCredential } from '../../utils/credential.js';

/**
 * OpenAI Provider 适配器
 * 使用 OpenAI Chat Completions API
 */
export interface OpenAIProviderConfig {
  /** API Key（可选，默认从凭据存储读取） */
  apiKey?: string;
  /** 默认模型 */
  model?: string;
  /** 上下文窗口大小 */
  contextWindow?: number;
  /** 自定义 base URL */
  baseURL?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly supportsToolUse = true;
  readonly contextWindow: number;

  private model: string;
  private config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig = {}) {
    this.config = config;
    this.model = config.model ?? 'gpt-4o';
    this.contextWindow = config.contextWindow ?? 128000;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const apiKey = this.config.apiKey ?? (await this.getApiKey());
    const model = options?.model ?? this.model;

    const requestBody: Record<string, unknown> = {
      model,
      messages: messages.map((m) => this.toOpenAIMessage(m)),
    };

    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      requestBody.max_tokens = options.maxTokens;
    }
    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((t) => ({
        type: 'function' as const,
        function: t.function,
      }));
      requestBody.tool_choice = options.toolChoice ?? 'auto';
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = await this.executeWithRetry(apiKey, requestBody);

    return this.parseResponse(response);
  }

  countTokens(messages: Message[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      if (msg.content) {
        total += Math.ceil(msg.content.length / 4);
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += Math.ceil(JSON.stringify(tc.arguments).length / 4);
          total += Math.ceil(tc.name.length / 4);
        }
      }
    }
    return Promise.resolve(total);
  }

  private async getApiKey(): Promise<string> {
    const key = await getCredential('openai');
    if (!key) {
      throw new Error(
        'OpenAI API key not found. Please set it via `codeharness config set openai-key <key>`',
      );
    }
    return key;
  }

  private toOpenAIMessage(m: Message): Record<string, unknown> {
    const msg: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? '',
    };

    if (m.toolCalls && m.toolCalls.length > 0) {
      msg.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    if (m.toolCallId) {
      msg.tool_call_id = m.toolCallId;
    }

    return msg;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(raw: any): ChatResponse {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
    const choice = raw.choices[0];
    const message: Message = {
      role: choice.message.role as Message['role'],
      content: choice.message.content ?? null,
    };

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message.toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    const usage: TokenUsage | undefined = raw.usage
      ? {
          promptTokens: raw.usage.prompt_tokens,
          completionTokens: raw.usage.completion_tokens,
          totalTokens: raw.usage.total_tokens,
        }
      : undefined;

    return {
      message,
      usage,
      model: raw.model,
      finishReason: choice.finish_reason,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async executeWithRetry(
    apiKey: string,
    requestBody: Record<string, unknown>,
    maxRetries = 3,
  ): Promise<any> {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const baseURL = this.config.baseURL ?? 'https://api.openai.com/v1/chat/completions';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const error = new Error(`OpenAI API error (${response.status}): ${errorText}`);

          if (response.status === 401) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            (error as any).status = response.status;
            throw error;
          }

          if (response.status === 429) {
            if (attempt < maxRetries) {
              const retryAfter = response.headers.get('Retry-After');
              const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : this.exponentialBackoff(attempt);
              await this.sleep(delay);
              continue;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
            (error as any).status = response.status;
            throw error;
          }

          if (response.status >= 500 && attempt < maxRetries) {
            await this.sleep(this.exponentialBackoff(attempt));
            continue;
          }

          throw error;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return await response.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        lastError = err;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (err.name === 'TypeError' || err.name === 'AbortError') {
          if (attempt < maxRetries) {
            await this.sleep(this.exponentialBackoff(attempt));
            continue;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (err.status || attempt >= maxRetries) {
          throw err;
        }
      }
    }

    throw lastError ?? new Error('OpenAI API request failed after retries');
  }

  private exponentialBackoff(attempt: number): number {
    // 1s + jitter → 2s + jitter → 4s + jitter
    const baseMs = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000;
    return baseMs + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
