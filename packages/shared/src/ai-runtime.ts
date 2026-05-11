import { z } from 'zod';

export type AiProviderLike = 'openai' | 'anthropic' | 'openrouter';
export type LocalAiProviderLike = 'ollama';
export type AnyAiProviderLike = AiProviderLike | LocalAiProviderLike;

export type AiRuntimeKeys = {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
};

export type CompletionInput = {
  provider: AnyAiProviderLike;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  keys: AiRuntimeKeys;
};

export type CompletionResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

type Pricing = {
  inputPer1M: number;
  outputPer1M: number;
};

type PricingEntry = Pricing & {
  canonicalModel: string;
  aliases: string[];
};

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
};

export const PRICING_TABLE_VERSION = '2026-04-24';

const MODEL_PRICING_USD: PricingEntry[] = [
  {
    canonicalModel: 'gpt-4.1-mini',
    aliases: ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14', 'openai/gpt-4.1-mini'],
    inputPer1M: 0.4,
    outputPer1M: 1.6
  },
  {
    canonicalModel: 'gpt-4.1',
    aliases: ['gpt-4.1', 'gpt-4.1-2025-04-14', 'openai/gpt-4.1'],
    inputPer1M: 2,
    outputPer1M: 8
  },
  {
    canonicalModel: 'gpt-4o-mini',
    aliases: ['gpt-4o-mini', 'gpt-4o-mini-2024-07-18', 'openai/gpt-4o-mini'],
    inputPer1M: 0.15,
    outputPer1M: 0.6
  },
  {
    canonicalModel: 'claude-3-5-haiku-latest',
    aliases: ['claude-3-5-haiku-latest', 'anthropic/claude-3.5-haiku', 'claude-3-5-haiku-20241022'],
    inputPer1M: 0.8,
    outputPer1M: 4
  }
];

export type ModelPricingResolution = {
  canonicalModel: string;
  inputPer1M: number;
  outputPer1M: number;
  exact: boolean;
};

export function resolveModelPricing(model: string, provider: AnyAiProviderLike = 'openai'): ModelPricingResolution {
  if (provider === 'ollama') {
    return {
      canonicalModel: clean(model) || 'ollama-local',
      inputPer1M: 0,
      outputPer1M: 0,
      exact: true
    };
  }
  const normalized = clean(model).toLowerCase();
  const exact = MODEL_PRICING_USD.find((entry) =>
    entry.aliases.some((alias) => alias.toLowerCase() === normalized || normalized.startsWith(`${alias.toLowerCase()}-`))
  );
  if (exact) {
    return {
      canonicalModel: exact.canonicalModel,
      inputPer1M: exact.inputPer1M,
      outputPer1M: exact.outputPer1M,
      exact: true
    };
  }

  const fallback = MODEL_PRICING_USD.find((entry) => entry.canonicalModel === 'gpt-4.1-mini');
  return {
    canonicalModel: fallback?.canonicalModel || 'gpt-4.1-mini',
    inputPer1M: fallback?.inputPer1M || 0.4,
    outputPer1M: fallback?.outputPer1M || 1.6,
    exact: false
  };
}

function clean(text?: string | null) {
  return (text || '').trim();
}

function stripCodeFences(text: string) {
  const trimmed = clean(text);
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function extractOpenAiMessageText(
  content?: string | Array<{ type?: string; text?: string }>
) {
  if (typeof content === 'string') {
    return clean(content);
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return clean(
    content
      .map((entry) => (entry.type === 'text' ? entry.text || '' : ''))
      .join('\n')
  );
}

export function estimateTokens(text: string) {
  const words = clean(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

export function estimateCostUsd(
  provider: AnyAiProviderLike,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const pricing = resolveModelPricing(model, provider);
  const inputCost = (pricing.inputPer1M / 1_000_000) * inputTokens;
  const outputCost = (pricing.outputPer1M / 1_000_000) * outputTokens;
  return Number((inputCost + outputCost).toFixed(6));
}

export function fallbackModelForProvider(provider: AnyAiProviderLike) {
  if (provider === 'anthropic') return 'claude-3-5-haiku-latest';
  if (provider === 'openrouter') return 'openai/gpt-4o-mini';
  if (provider === 'ollama') return 'llama3.1:8b';
  return 'gpt-4.1-mini';
}

export function hasProviderKey(provider: AnyAiProviderLike, keys: AiRuntimeKeys) {
  if (provider === 'anthropic') return Boolean(clean(keys.ANTHROPIC_API_KEY));
  if (provider === 'openrouter') return Boolean(clean(keys.OPENROUTER_API_KEY));
  if (provider === 'ollama') return Boolean(clean(keys.OLLAMA_BASE_URL));
  return Boolean(clean(keys.OPENAI_API_KEY));
}

export function normalizeOllamaBaseUrl(baseUrl?: string | null) {
  const normalized = clean(baseUrl).replace(/\/+$/, '');
  if (!normalized) return '';
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

async function openAiCompatibleCompletion(input: CompletionInput) {
  const apiKey = clean(
    input.provider === 'openrouter' ? input.keys.OPENROUTER_API_KEY : input.keys.OPENAI_API_KEY
  );
  if (!apiKey) {
    throw new Error(`Missing API key for provider ${input.provider}.`);
  }

  const response = await fetch(
    input.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? 280,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = clean((await response.text()).slice(0, 300));
    throw new Error(
      `${input.provider} request failed with status ${response.status}${errorText ? `: ${errorText}` : '.'}`
    );
  }

  const payload = (await response.json()) as OpenAiCompatibleResponse;
  const text = extractOpenAiMessageText(payload.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error(`Empty ${input.provider} response.`);
  }

  return {
    text,
    inputTokens:
      payload.usage?.prompt_tokens || estimateTokens(`${input.systemPrompt}\n${input.userPrompt}`),
    outputTokens: payload.usage?.completion_tokens || estimateTokens(text)
  };
}

async function anthropicCompletion(input: CompletionInput) {
  const apiKey = clean(input.keys.ANTHROPIC_API_KEY);
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxOutputTokens ?? 280,
      temperature: input.temperature ?? 0.2,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }]
    })
  });

  if (!response.ok) {
    const errorText = clean((await response.text()).slice(0, 300));
    throw new Error(
      `Anthropic request failed with status ${response.status}${errorText ? `: ${errorText}` : '.'}`
    );
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = clean(payload.content?.find((entry) => entry.type === 'text')?.text);
  if (!text) {
    throw new Error('Empty Anthropic response.');
  }

  return {
    text,
    inputTokens: payload.usage?.input_tokens || estimateTokens(`${input.systemPrompt}\n${input.userPrompt}`),
    outputTokens: payload.usage?.output_tokens || estimateTokens(text)
  };
}

async function ollamaCompletion(input: CompletionInput) {
  const apiBaseUrl = normalizeOllamaBaseUrl(input.keys.OLLAMA_BASE_URL);
  if (!apiBaseUrl) {
    throw new Error('Missing Ollama base URL.');
  }

  const response = await fetch(`${apiBaseUrl}/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt }
      ],
      options: {
        temperature: input.temperature ?? 0.2,
        num_predict: input.maxOutputTokens ?? 280
      }
    })
  });

  if (!response.ok) {
    const errorText = clean((await response.text()).slice(0, 300));
    throw new Error(
      `Ollama request failed with status ${response.status}${errorText ? `: ${errorText}` : '.'}`
    );
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const text = clean(payload.message?.content);
  if (!text) {
    throw new Error('Empty Ollama response.');
  }

  return {
    text,
    inputTokens: payload.prompt_eval_count || estimateTokens(`${input.systemPrompt}\n${input.userPrompt}`),
    outputTokens: payload.eval_count || estimateTokens(text)
  };
}

export async function isProviderAvailable(
  provider: AnyAiProviderLike,
  keys: AiRuntimeKeys,
  options?: { timeoutMs?: number }
) {
  if (provider !== 'ollama') {
    return hasProviderKey(provider, keys);
  }

  const apiBaseUrl = normalizeOllamaBaseUrl(keys.OLLAMA_BASE_URL);
  if (!apiBaseUrl) {
    return false;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/tags`, {
      signal: AbortSignal.timeout(options?.timeoutMs ?? 1500)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function runCompletion(input: CompletionInput): Promise<CompletionResult> {
  if (input.provider === 'anthropic') {
    return anthropicCompletion(input);
  }
  if (input.provider === 'ollama') {
    return ollamaCompletion(input);
  }
  return openAiCompatibleCompletion(input);
}

export function parseJsonCompletion<T>(text: string, schema: z.ZodType<T>) {
  return schema.parse(JSON.parse(stripCodeFences(text)));
}
