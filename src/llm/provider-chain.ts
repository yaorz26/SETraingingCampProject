import type { LLMProvider, Message, ChatOptions, ChatResponse } from './provider.js';
import { log, LogLevel } from '../cli/output.js';

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const status = (err as any).status;
    if (status && status >= 400 && status < 500) {
      return false;
    }
    return true;
  }
  return false;
}

export class LLMProviderChain implements LLMProvider {
  private providers: LLMProvider[];
  private currentIndex: number;

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('LLMProviderChain requires at least one provider');
    }
    this.providers = providers;
    this.currentIndex = 0;
  }

  get name(): string {
    return this.getCurrentProvider().name;
  }

  get supportsToolUse(): boolean {
    return this.getCurrentProvider().supportsToolUse;
  }

  get contextWindow(): number {
    return this.getCurrentProvider().contextWindow;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const errors: string[] = [];
    for (let i = this.currentIndex; i < this.providers.length; i++) {
      try {
        const response = await this.providers[i].chat(messages, options);
        if (i > this.currentIndex) {
          this.currentIndex = i;
        }
        return response;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${this.providers[i].name}: ${msg}`);
        log(`Provider ${this.providers[i].name} failed: ${msg}`, LogLevel.WARNING);
        if (isRetryableError(err) && i < this.providers.length - 1) {
          continue;
        }
        if (i === this.providers.length - 1 && isRetryableError(err)) {
          break;
        }
        throw err;
      }
    }
    throw new Error(`所有 LLM 供应商均不可用\n${errors.join('\n')}`);
  }

  async countTokens(messages: Message[]): Promise<number> {
    return this.getCurrentProvider().countTokens(messages);
  }

  getCurrentProvider(): LLMProvider {
    return this.providers[this.currentIndex];
  }
}
