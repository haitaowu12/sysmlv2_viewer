import { editModel, generateModel, validateDrawio } from './ai-service.js';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error('Payload too large.'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

export async function handleApiRequest(req, res) {
  const path = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'POST' && path === '/api/ai/generate-model') {
    try {
      const payload = await parseJsonBody(req);
      const response = await generateModel(payload, req.headers || {});
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (method === 'POST' && path === '/api/ai/edit-model') {
    try {
      const payload = await parseJsonBody(req);
      const response = await editModel(payload, req.headers || {});
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (method === 'POST' && path === '/api/validate/drawio') {
    try {
      const payload = await parseJsonBody(req);
      const response = await validateDrawio(payload);
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  return false;
}
