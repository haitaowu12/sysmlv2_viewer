import { describe, expect, it } from 'vitest';
import { handleApiRequest } from './routes.js';

describe('legacy API routes', () => {
  it.each([
    '/api/ai/generate-model',
    '/api/ai/edit-model',
  ])('retires unsafe whole-document mutation at %s', async (url) => {
    const response = captureResponse();
    await expect(handleApiRequest({
      url,
      method: 'POST',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    }, response)).resolves.toBe(true);

    expect(response.statusCode).toBe(410);
    expect(JSON.parse(response.body)).toMatchObject({
      replacement: 'ai/request -> ai/apply with explicit user approval',
    });
  });

  it('does not advertise retired AI mutation as an active feature', async () => {
    const response = captureResponse();
    await handleApiRequest({
      url: '/api/health',
      method: 'GET',
      headers: {},
    }, response);
    const payload = JSON.parse(response.body);

    expect(payload.features).not.toContain('ai-generate-model');
    expect(payload.features).not.toContain('ai-edit-model');
    expect(payload.retiredFeatures).toEqual([
      'ai-generate-model',
      'ai-edit-model',
    ]);
  });
});

function captureResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = value;
    },
  };
}
