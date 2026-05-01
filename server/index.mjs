import http from 'node:http';
import { handleApiRequest } from './routes.js';

const port = Number(process.env.PORT || 8787);
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function parseAllowedOrigins(value) {
  return (value || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const requestOrigin = req.headers.origin;
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN);
  const matchedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ai-provider, x-ai-model');
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const handled = await handleApiRequest(req, res);
  if (handled) {
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(port, () => {
  console.log(`sysml-viewer server listening on http://localhost:${port}`);
});
