import type { LLMProvider, Message, ChatOptions, ChatResponse, TokenUsage } from '../provider.js';
import { getCredential } from '../../utils/credential.js';

export interface AnthropicProviderConfig {
  apiKey?: string;
  model?: string;
  contextWindow?: number;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly supportsToolUse = true;
  readonly contextWindow: number;

  private model: string;
  private config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig = {}) {
    this.config = config;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.contextWindow = config.contextWindow ?? 200000;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const apiKey = this.config.apiKey ?? (await this.getApiKey());
    const model = options?.model ?? this.model;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => this.toAnthropicMessage(m)),
    };

    if (systemMessages.length > 0) {
      requestBody.system = systemMessages.map((m) => m.content).join('\n');
    }

    if (options?.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
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
    const key = await getCredential('anthropic');
    if (!key) {
      throw new Error(
        'Anthropic API key not found. Please set it via `codeharness config set anthropic-key <key>`',
      );
    }
    return key;
  }

  private toAnthropicMessage(m: Message): Record<string, unknown> {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.toolCalls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        })),
      };
    }

    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: m.content ?? '',
          },
        ],
      };
    }

    return {
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content ?? '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(raw: any): ChatResponse {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    let textContent = '';
    const toolCalls: Message['toolCalls'] = [];

    const content = raw.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          textContent = (textContent ? textContent + '\n' : '') + block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }
    }

    const message: Message = {
      role: 'assistant',
      content: textContent || null,
    };

    if (toolCalls.length > 0) {
      message.toolCalls = toolCalls;
    }

    const usage: TokenUsage | undefined = raw.usage
      ? {
          promptTokens: raw.usage.input_tokens,
          completionTokens: raw.usage.output_tokens,
          totalTokens: raw.usage.input_tokens + raw.usage.output_tokens,
        }
      : undefined;

    return {
      message,
      usage,
      model: raw.model,
      finishReason: raw.stop_reason,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async executeWithRetry(
    apiKey: string,
    requestBody: Record<string, unknown>,
    maxRetries = 3,
  ): Promise<any> {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const baseURL = this.config.baseURL ?? 'https://api.anthropic.com/v1/messages';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const error = new Error(`Anthropic API error (${response.status}): ${errorText}`);

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

    throw lastError ?? new Error('Anthropic API request failed after retries');
  }

  private exponentialBackoff(attempt: number): number {
    const baseMs = Math.pow(2, attempt) * 1000;
    const jitter = Math.random() * 1000;
    return baseMs + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
