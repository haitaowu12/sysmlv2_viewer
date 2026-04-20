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

const VALID_PROVIDERS = ['local', 'openai', 'anthropic', 'google'];
const MAX_PROMPT_LENGTH = 10000;
const MAX_MODEL_LENGTH = 100;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_SOURCE_CODE_LENGTH = 500000;
const MAX_DRAWIO_XML_LENGTH = 5000000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.windowStart)) / 1000),
    };
  }

  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

function validateGenerateModel(payload) {
  if (typeof payload.prompt !== 'string' || payload.prompt.trim().length === 0) {
    return 'prompt is required and must be a non-empty string.';
  }
  if (payload.prompt.length > MAX_PROMPT_LENGTH) {
    return `prompt must not exceed ${MAX_PROMPT_LENGTH} characters.`;
  }
  if (payload.provider !== undefined) {
    if (typeof payload.provider !== 'string' || !VALID_PROVIDERS.includes(payload.provider.toLowerCase())) {
      return `provider must be one of: ${VALID_PROVIDERS.join(', ')}.`;
    }
  }
  if (payload.model !== undefined) {
    if (typeof payload.model !== 'string') {
      return 'model must be a string.';
    }
    if (payload.model.length > MAX_MODEL_LENGTH) {
      return `model must not exceed ${MAX_MODEL_LENGTH} characters.`;
    }
  }
  if (payload.attachments !== undefined) {
    if (!Array.isArray(payload.attachments)) {
      return 'attachments must be an array.';
    }
    if (payload.attachments.length > MAX_ATTACHMENTS) {
      return `attachments must not exceed ${MAX_ATTACHMENTS} items.`;
    }
    for (let i = 0; i < payload.attachments.length; i++) {
      const att = payload.attachments[i];
      if (att.base64Data && typeof att.base64Data === 'string') {
        const sizeEstimate = Math.ceil((att.base64Data.length * 3) / 4);
        if (sizeEstimate > MAX_ATTACHMENT_SIZE) {
          return `attachment at index ${i} exceeds maximum size of 10MB.`;
        }
      }
    }
  }
  return null;
}

function validateEditModel(payload) {
  const baseError = validateGenerateModel(payload);
  if (baseError) return baseError;
  if (payload.sourceCode !== undefined) {
    if (typeof payload.sourceCode !== 'string') {
      return 'sourceCode must be a string.';
    }
    if (payload.sourceCode.length > MAX_SOURCE_CODE_LENGTH) {
      return `sourceCode must not exceed ${MAX_SOURCE_CODE_LENGTH} characters.`;
    }
  }
  return null;
}

function validateValidateDrawio(payload) {
  if (typeof payload.drawioXml !== 'string' || payload.drawioXml.trim().length === 0) {
    return 'drawioXml is required and must be a non-empty string.';
  }
  if (payload.drawioXml.length > MAX_DRAWIO_XML_LENGTH) {
    return `drawioXml must not exceed ${MAX_DRAWIO_XML_LENGTH} characters.`;
  }
  return null;
}

export async function handleApiRequest(req, res) {
  const path = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET' && path === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'sysml-viewer-ai-api',
      features: [
        'drawio-bridge',
        'bidirectional-sync',
        'ai-generate-model',
        'ai-edit-model',
        'drawio-validate',
      ],
      date: new Date().toISOString(),
    });
    return true;
  }

  if (method === 'POST' && path === '/api/ai/generate-model') {
    try {
      const clientIp = req.socket?.remoteAddress || 'unknown';
      const rateLimit = checkRateLimit(clientIp);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        sendJson(res, 429, { error: 'Rate limit exceeded. Please wait and try again.', retryAfter: rateLimit.retryAfter });
        return true;
      }
      const payload = await parseJsonBody(req);
      const validationError = validateGenerateModel(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return true;
      }
      const response = await generateModel(payload, req.headers || {});
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (method === 'POST' && path === '/api/ai/edit-model') {
    try {
      const clientIp = req.socket?.remoteAddress || 'unknown';
      const rateLimit = checkRateLimit(clientIp);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfter));
        sendJson(res, 429, { error: 'Rate limit exceeded. Please wait and try again.', retryAfter: rateLimit.retryAfter });
        return true;
      }
      const payload = await parseJsonBody(req);
      const validationError = validateEditModel(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return true;
      }
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
      const validationError = validateValidateDrawio(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return true;
      }
      const response = await validateDrawio(payload);
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  return false;
}
