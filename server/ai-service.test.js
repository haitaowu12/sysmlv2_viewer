import { afterEach, describe, expect, it } from 'vitest';
import { generateModel, getAiRuntimeConfig } from './ai-service.js';

const ENV_KEYS = ['SYSML_AI_PROVIDER', 'SYSML_AI_MODEL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

describe('AI runtime configuration', () => {
  it('reports server-held provider keys without exposing key values', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.SYSML_AI_PROVIDER = 'openai';
    process.env.SYSML_AI_MODEL = 'gpt-test';

    expect(getAiRuntimeConfig()).toEqual({
      defaultProvider: 'openai',
      defaultModel: 'gpt-test',
      configuredProviders: {
        openai: true,
        anthropic: false,
        google: false,
      },
    });
  });

  it('ignores browser-provided apiKey payloads and falls back locally without env keys', async () => {
    const result = await generateModel(
      {
        provider: 'openai',
        model: 'gpt-test',
        apiKey: 'browser-key-should-not-be-used',
        prompt: 'Model a pump controller',
      },
      {},
    );

    expect(result.sysml).toContain("package 'Generated System'");
    expect(result.diagnostics).toContain('Used local heuristic generation.');
  });
});
