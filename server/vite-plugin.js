import { handleApiRequest } from './routes.js';

export function aiApiPlugin() {
  return {
    name: 'sysml-viewer-ai-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApiRequest(req, res);
        if (!handled) {
          next();
        }
      });
    },
  };
}
