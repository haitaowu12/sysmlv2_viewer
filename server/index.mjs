import http from 'node:http';
import { handleApiRequest } from './routes.js';

const port = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
  const origin = process.env.CORS_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ai-provider, x-ai-model, x-ai-key');

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
  // eslint-disable-next-line no-console
  console.log(`sysml-viewer server listening on http://localhost:${port}`);
});
