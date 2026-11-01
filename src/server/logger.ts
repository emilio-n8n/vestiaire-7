import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/healthz' || req.url?.startsWith('/assets/') === true,
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
});
