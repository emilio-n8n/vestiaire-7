import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { createApp, errorHandler } from './http.js';
import { initRealtime, getIo } from './realtime.js';
import { logger } from './logger.js';
import { cleanupAdminSessions } from './auth.js';
import { cleanupLegacyGames, cleanupOldGames } from './game.js';
import { focus } from './focus.js';
import { presence } from './presence.js';
import { closeDb } from './db.js';

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

if (!config.isProd) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(config.clientDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(config.clientDir, 'index.html'));
      return;
    }
    next();
  });
}

app.use(errorHandler);

cleanupAdminSessions();
const removed = cleanupOldGames();
if (removed > 0) logger.info({ removed }, 'parties anciennes supprimées');
const legacy = cleanupLegacyGames();
if (legacy > 0) logger.warn({ legacy }, 'parties au format de scénario obsolète supprimées');
setInterval(
  () => {
    cleanupAdminSessions();
    cleanupOldGames();
  },
  6 * 60 * 60 * 1000,
).unref();

server.listen(config.port, config.host, () => {
  logger.info(`Vestiaire 7 prêt sur http://${config.host}:${config.port}`);
  logger.info(`Dashboard admin : http://${config.host}:${config.port}/admin`);
  logger.info(
    `Jev : ${config.jev.enabled && config.jev.apiKey ? config.jev.model : 'mode local (pas de clé JEV_API_KEY)'}`,
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'arrêt du serveur');
  getIo()?.close();
  presence.shutdown();
  focus.shutdown();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'unhandledRejection');
});
