/**
 * LLM 抽象层 — 统一接口定义
 * 参照 SPEC §6.2
 */

// ---- 消息类型 ----

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: MessageRole;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

// ---- 工具定义（OpenAI 兼容格式） ----

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

// ---- Chat 选项 ----

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: string;
  signal?: AbortSignal;
}

// ---- Token 用量 ----

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---- Chat 响应 ----

export interface ChatResponse {
  message: Message;
  usage?: TokenUsage;
  model?: string;
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

// ---- LLM Provider 接口 ----

export interface LLMProvider {
  /** 提供商名称 */
  readonly name: string;

  /** 是否支持 Tool Use */
  readonly supportsToolUse: boolean;

  /** 上下文窗口大小（token 数） */
  readonly contextWindow: number;

  /**
   * 发送聊天请求
   * @param messages 消息列表
   * @param options 可选参数（模型、温度、工具等）
   * @returns Chat 响应（含消息、用量等）
   */
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * 估算消息的 token 数量
   * @param messages 消息列表
   * @returns 估算的 token 数量
   */
  countTokens(messages: Message[]): Promise<number>;
}
