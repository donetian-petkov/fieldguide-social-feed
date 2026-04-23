import { z } from 'zod';

export type AiProviderLike = 'openai' | 'anthropic' | 'openrouter';

export type AiRuntimeKeys = {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};

export type CompletionInput = {
  provider: AiProviderLike;
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

const MODEL_PRICING_USD: Record<string, Pricing> = {
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'claude-3-5-haiku-latest': { inputPer1M: 0.8, outputPer1M: 4 },
  'anthropic/claude-3.5-haiku': { inputPer1M: 0.8, outputPer1M: 4 },
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 }
};

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

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING_USD[model] || MODEL_PRICING_USD['gpt-4.1-mini'];
  if (!pricing) return 0;
  const inputCost = (pricing.inputPer1M / 1_000_000) * inputTokens;
  const outputCost = (pricing.outputPer1M / 1_000_000) * outputTokens;
  return Number((inputCost + outputCost).toFixed(6));
}

export function fallbackModelForProvider(provider: AiProviderLike) {
  if (provider === 'anthropic') return 'claude-3-5-haiku-latest';
  if (provider === 'openrouter') return 'openai/gpt-4o-mini';
  return 'gpt-4.1-mini';
}

export function hasProviderKey(provider: AiProviderLike, keys: AiRuntimeKeys) {
  if (provider === 'anthropic') return Boolean(clean(keys.ANTHROPIC_API_KEY));
  if (provider === 'openrouter') return Boolean(clean(keys.OPENROUTER_API_KEY));
  return Boolean(clean(keys.OPENAI_API_KEY));
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

export async function runCompletion(input: CompletionInput): Promise<CompletionResult> {
  if (input.provider === 'anthropic') {
    return anthropicCompletion(input);
  }
  return openAiCompatibleCompletion(input);
}

export function parseJsonCompletion<T>(text: string, schema: z.ZodType<T>) {
  return schema.parse(JSON.parse(stripCodeFences(text)));
}
