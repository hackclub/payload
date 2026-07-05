import { env } from "@/env";

// Minimal OpenAI-compatible chat-completions client for ai.hackclub.com
// (an OpenRouter-style proxy). Only what the repo-setup agent needs: messages
// in, one choice out, with function tool-calling support.

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCall[];
};

type ChatCompletionResponse = {
  choices: Array<{ message: AssistantMessage; finish_reason: string }>;
};

export class AiApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = "AiApiError";
  }
}

export type AiClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  retryCount?: number;
};

export function aiEnabled(): boolean {
  return !!env.AI_API_KEY;
}

export class AiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly retryCount: number;

  constructor(options: AiClientOptions = {}) {
    const apiKey = options.apiKey ?? env.AI_API_KEY;
    if (!apiKey) throw new Error("AI_API_KEY is not configured");
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? env.AI_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? env.AI_MODEL;
    // Long default: a big-repo analysis turn can take minutes to generate.
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.retryCount = options.retryCount ?? 2;
  }

  async chat(
    messages: ChatMessage[],
    options: { tools?: ToolDefinition[]; maxTokens?: number; temperature?: number } = {},
  ): Promise<AssistantMessage> {
    const attempts = this.retryCount + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.chatOnce(messages, options);
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === attempts) throw error;
        await sleep(1_000 * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }

  private async chatOnce(
    messages: ChatMessage[],
    options: { tools?: ToolDefinition[]; maxTokens?: number; temperature?: number },
  ): Promise<AssistantMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new AiApiError(`AI request failed: ${response.status}`, response.status, text.slice(0, 2_000));
      }

      let parsed: ChatCompletionResponse;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AiApiError("AI returned non-JSON response", response.status, text.slice(0, 2_000));
      }

      const message = parsed.choices?.[0]?.message;
      if (!message) {
        throw new AiApiError("AI response had no choices", response.status, text.slice(0, 2_000));
      }
      return message;
    } finally {
      clearTimeout(timer);
    }
  }
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof AiApiError) {
    return error.status === 429 || error.status >= 500;
  }
  // Network/abort errors are retryable.
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
