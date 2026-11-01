import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

const adminPassword = process.env.ADMIN_PASSWORD?.trim() || (isProd ? '' : 'admin');
if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD est obligatoire en production.');
}

const sessionSecret = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const publicUrl = (process.env.PUBLIC_URL ?? '').trim().replace(/\/+$/, '');

export const config = {
  isProd,
  host: process.env.HOST?.trim() || '127.0.0.1',
  port: Number(process.env.PORT ?? 4317),
  dataDir: path.resolve(process.env.DATA_DIR?.trim() || 'data'),
  clientDir: path.resolve('dist/client'),
  scenarioPath: path.resolve('scenarios/dernier-match.json'),
  adminPassword,
  sessionSecret,
  sessionCookie: 'v7_admin',
  sessionTtlMs: 12 * 60 * 60 * 1000,
  publicUrl,
  retentionDays: Math.max(1, Number(process.env.RETENTION_DAYS ?? 30)),
  trustProxy: true,
  logLevel: process.env.LOG_LEVEL?.trim() || (isProd ? 'info' : 'debug'),
  jev: {
    enabled: process.env.JEV_ENABLED !== 'false',
    apiKey: process.env.JEV_API_KEY?.trim() || '',
    model: process.env.JEV_MODEL?.trim() || 'jev-1.13-free',
    endpoint: 'https://opencode.ai/inference/systemone/v1/systemone',
    timeoutMs: 4500,
  },
  teamColors: ['orange', 'blue', 'green', 'yellow'] as const,
  maxTeams: 6,
  maxPlayersPerTeam: 8,
  maxPlayersTotal: 60,
  presenceGraceMs: 10_000,
  chat: {
    maxLength: 400,
    minIntervalMs: 1_500,
    maxPerMinute: 20,
    history: 80,
    contextMessages: 3,
  },
} as const;

if (!config.isProd && config.adminPassword === 'admin') {
  // Volontairement visible : c'est le mot de passe de développement.
  console.warn('[config] ADMIN_PASSWORD non défini, mot de passe de dev : admin');
}
if (!process.env.SESSION_SECRET) {
  console.warn('[config] SESSION_SECRET non défini, généré pour cette instance (sessions invalidées au redémarrage).');
}
if (!config.jev.apiKey) {
  console.warn('[config] JEV_API_KEY absent : la modération locale seule est active.');
}
