import http from 'node:http';
import { handleApiRequest } from './routes.js';

const port = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
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
