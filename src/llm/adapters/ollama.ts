import type { LLMProvider, Message, ChatOptions, ChatResponse, TokenUsage } from '../provider.js';

export interface OllamaProviderConfig {
  model?: string;
  contextWindow?: number;
  baseURL?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly supportsToolUse = true;
  readonly contextWindow: number;

  private model: string;
  private baseURL: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.model = config.model ?? 'qwen2.5-coder:14b';
    this.contextWindow = config.contextWindow ?? 128000;
    this.baseURL = config.baseURL ?? 'http://localhost:11434/v1';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? this.model;

    const requestBody: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content ?? '',
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }
          : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
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
    const response = await this.executeWithRetry(requestBody);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(raw: any): ChatResponse {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
    const choice = raw.choices[0];
    const message: Message = {
      role: (choice.message.role as Message['role']) ?? 'assistant',
      content: choice.message.content ?? null,
    };

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      message.toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments:
          typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments,
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
    requestBody: Record<string, unknown>,
    maxRetries = 3,
  ): Promise<any> {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const url = `${this.baseURL}/chat/completions`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          const error = new Error(`Ollama API error (${response.status}): ${errorText}`);

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

    throw lastError ?? new Error('Ollama API request failed after retries');
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
