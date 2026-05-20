import { afterEach, describe, expect, it } from 'vitest';
import { editModel, generateModel, getAiRuntimeConfig, validateDrawio } from './ai-service.js';
import { sysmlToDrawioXml } from './drawio-utils.js';

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
    expect(result.drawioXml).toBeUndefined();
    expect(result.diagnostics).toContain('Used local heuristic generation.');
    expect(result.providerStatus).toEqual({
      requestedProvider: 'openai',
      effectiveProvider: 'local',
      model: 'gpt-test',
      source: 'local_heuristic',
      usedFallback: true,
      reason: 'Provider openai is not configured on the server.',
    });
  });

  it('marks provider output explicitly and omits server-generated Draw.io XML', async () => {
    process.env.OPENAI_API_KEY = 'server-held-openai-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      expect(init.headers.Authorization).toBe('Bearer server-held-openai-key');
      expect(init.headers.Authorization).not.toBe('Bearer browser-key-should-not-be-used');
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          sysml: "package ProviderModel {\n\tpart def Pump;\n}",
          notes: ['provider note'],
        }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const result = await generateModel(
        {
          provider: 'openai',
          model: 'gpt-test',
          apiKey: 'browser-key-should-not-be-used',
          prompt: 'Model a pump controller',
        },
        {},
      );

      expect(result.sysml).toContain('package ProviderModel');
      expect(result.drawioXml).toBeUndefined();
      expect(result.notes).toEqual(['provider note']);
      expect(result.providerStatus).toEqual({
        requestedProvider: 'openai',
        effectiveProvider: 'openai',
        model: 'gpt-test',
        source: 'provider',
        usedFallback: false,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks local edits explicitly and omits server-generated Draw.io XML', async () => {
    const result = await editModel(
      {
        provider: 'local',
        model: 'gpt-test',
        prompt: 'add part def Valve',
        sourceCode: "package Existing {\n\tpart def Pump;\n}",
      },
      {},
    );

    expect(result.sysml).toContain('part def Valve;');
    expect(result.drawioXml).toBeUndefined();
    expect(result.providerStatus).toEqual({
      requestedProvider: 'local',
      effectiveProvider: 'local',
      model: 'gpt-test',
      source: 'local_heuristic',
      usedFallback: false,
    });
  });

  it('keeps Draw.io validation available for explicit Draw.io XML payloads', async () => {
    const drawioXml = sysmlToDrawioXml([
      'package ValidationModel {',
      '\tpart def Controller;',
      '\tpart def Sensor;',
      '\tpart controller : Controller;',
      '\tpart sensor : Sensor;',
      '\tconnect controller to sensor;',
      '}',
    ].join('\n'));

    const result = await validateDrawio({ drawioXml });

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
