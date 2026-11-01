import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { logger, httpLogger } from './logger.js';
import { presence } from './presence.js';
import {
  checkPassword,
  clearAdminCookie,
  createAdminSession,
  deleteAdminSession,
  adminTokenFromRequest,
  requireAdmin,
  setAdminCookie,
} from './auth.js';
import {
  allowMessage,
  createGame,
  deleteGame,
  endGame,
  getAdminState,
  getExportCsv,
  getGame,
  getGameByCode,
  getPlayerInGame,
  getPlayerMessage,
  getTeam,
  getTeamPlayers,
  getTeams,
  hideMessage,
  insertCoachMessage,
  launchGame,
  listGames,
  markAbsent,
  mutePlayer,
  openGame,
  pauseGame,
  resolveReport,
  resumeGame,
  setPlayerJoined,
  setPlayerToken,
  startTeam,
  useHint,
  validateResearchByTeacher,
} from './game.js';
import { getJevHealth, testJev } from './moderation/index.js';
import { emitGameDeleted, emitMessageHidden, emitSessionReleased, emitTeamMessage, broadcastAdminState, broadcastGameStates } from './realtime.js';
import { scenarioForGame } from './scenario.js';
import { normalizeText, now, randomToken, safeEqual, sha256 } from './util.js';
import type { JoinResponse, RosterResponse } from '../shared/types.js';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const teamColorSchema = z.enum(['orange', 'blue', 'green', 'yellow']);

const createGameSchema = z.object({
  title: z.string().trim().min(3).max(100),
  teams: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(40),
        color: teamColorSchema,
        players: z.array(z.string().trim().min(2).max(40)).min(1).max(config.maxPlayersPerTeam),
      }),
    )
    .min(2)
    .max(config.maxTeams),
});

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

const rosterSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'Le code d’accès doit contenir 4 chiffres.'),
  teamId: z.string().min(1).max(100).optional(),
});

const joinSchema = z
  .object({
    pin: z.string().regex(/^\d{4}$/).optional(),
    playerId: z.string().min(1).max(100),
    token: z.string().min(1).max(200).optional(),
  })
  .refine((v) => Boolean(v.token) || Boolean(v.pin), {
    message: 'Entre le code d’accès ou reconnecte-toi avec ta session.',
  });

const broadcastSchema = z.object({
  body: z.string().trim().min(1).max(config.chat.maxLength),
  teamId: z.string().min(1).max(100).optional(),
});

const absentSchema = z.object({
  absent: z.boolean(),
});

const muteSchema = z.object({
  minutes: z.number().int().min(0).max(60),
});

const researchValidateSchema = z.object({
  approved: z.boolean(),
  comment: z.string().max(500).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? 'Données invalides.');
  }
  return result.data;
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

function action(handler: Handler): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      const message = error instanceof Error ? error.message : 'Action impossible.';
      next(new HttpError(400, message));
    }
  };
}

function requireGameRoute(gameId: string) {
  const game = getGame(gameId);
  if (!game) throw new HttpError(404, 'Partie inconnue.');
  return game;
}

function requireTeamRoute(gameId: string, teamId: string) {
  const team = getTeam(teamId);
  if (!team || team.game_id !== gameId) throw new HttpError(404, 'Équipe inconnue.');
  return team;
}

function sameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  try {
    const parsed = new URL(origin);
    if (req.headers.host && parsed.host === req.headers.host) {
      next();
      return;
    }
    if (config.publicUrl && parsed.host === new URL(config.publicUrl).host) {
      next();
      return;
    }
    if (!config.isProd && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      next();
      return;
    }
  } catch {
    // fall through
  }
  res.status(403).json({ error: 'Origine refusée.' });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessaie dans quelques minutes.' },
});

const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Attends un instant.' },
});

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(httpLogger);
  app.use(
    helmet({
      contentSecurityPolicy: config.isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", 'ws:', 'wss:'],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(sameOrigin);

  app.get('/healthz', (_req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: true, db: 'ok', jev: getJevHealth(), now: now() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'db error' });
    }
  });

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: true, db: 'ok', jev: getJevHealth(), now: now() });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'db error' });
    }
  });

  // --- Public : roster et connexion élève ---

  app.post(
    '/api/games/:code/roster',
    joinLimiter,
    action((req, res) => {
      const game = getGameByCode(String(req.params.code ?? ''));
      if (!game) throw new HttpError(404, 'Partie inconnue.');
      if (game.status === 'draft') throw new HttpError(409, 'Le professeur n’a pas encore ouvert le salon.');
      if (game.status === 'ended') throw new HttpError(410, 'Cette partie est terminée.');
      const body = parseBody(rosterSchema, req);
      if (!safeEqual(body.pin, game.pin)) throw new HttpError(403, 'Code d’accès incorrect.');
      const teams = getTeamForRoster(game.id, body.teamId);
      const connected = presence.connectedPlayerIds(game.id);
      const response: RosterResponse = {
        game: { code: game.code, title: game.title, status: game.status },
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          color: team.color,
          players: getTeamPlayers(team.id).map((player) => ({
            id: player.id,
            name: player.name,
            status: player.status,
            connected: connected.has(player.id),
          })),
        })),
      };
      res.json(response);
    }),
  );

  app.post(
    '/api/games/:code/join',
    joinLimiter,
    action((req, res) => {
      const game = getGameByCode(String(req.params.code ?? ''));
      if (!game) throw new HttpError(404, 'Partie inconnue.');
      if (game.status === 'draft') throw new HttpError(409, 'Le professeur n’a pas encore ouvert le salon.');
      if (game.status === 'ended') throw new HttpError(410, 'Cette partie est terminée.');
      const body = parseBody(joinSchema, req);
      const player = getPlayerInGame(game.id, body.playerId);
      if (!player || player.status !== 'active') {
        throw new HttpError(403, 'Ce joueur n’est pas actif dans cette partie.');
      }
      const team = getTeam(player.team_id);
      if (!team) throw new HttpError(500, 'Équipe introuvable.');

      let token: string;
      if (body.token) {
        if (!player.token_hash || !safeEqual(player.token_hash, sha256(body.token))) {
          throw new HttpError(401, 'Session expirée. Entre le code d’accès pour te reconnecter.');
        }
        token = body.token;
        setPlayerJoined(player.id);
      } else {
        if (!body.pin || !safeEqual(body.pin, game.pin)) {
          throw new HttpError(403, 'Code d’accès incorrect.');
        }
        if (presence.isConnected(player.id)) {
          throw new HttpError(409, 'Ce prénom est déjà connecté. Demande au professeur de libérer la place.');
        }
        token = randomToken();
        setPlayerToken(player.id, sha256(token));
        setPlayerJoined(player.id);
      }

      const response: JoinResponse = {
        token,
        player: {
          id: player.id,
          name: player.name,
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
        },
        game: { code: game.code, title: game.title, status: game.status },
      };
      res.json(response);
    }),
  );

  // --- Admin ---

  app.post(
    '/api/admin/login',
    loginLimiter,
    action((req, res) => {
      const body = parseBody(loginSchema, req);
      if (!checkPassword(body.password)) throw new HttpError(401, 'Mot de passe incorrect.');
      const token = createAdminSession();
      setAdminCookie(req, res, token);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/logout',
    action((req, res) => {
      deleteAdminSession(adminTokenFromRequest(req));
      clearAdminCookie(req, res);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/admin/me',
    requireAdmin,
    action((_req, res) => {
      res.json({ ok: true });
    }),
  );

  app.use('/api/admin', requireAdmin);

  app.get(
    '/api/admin/games',
    action((_req, res) => {
      const games = listGames().map((game) => ({
        ...game,
        connected: presence.connectedPlayerIds(game.id).size,
      }));
      res.json(games);
    }),
  );

  app.post(
    '/api/admin/games',
    action((req, res) => {
      const input = parseBody(createGameSchema, req);
      const result = createGame(input);
      res.status(201).json(result);
    }),
  );

  app.get(
    '/api/admin/games/:id',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      res.json(getAdminState(game.id, presence.connectedPlayerIds(game.id)));
    }),
  );

  app.post(
    '/api/admin/games/:id/open',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      openGame(game.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/launch',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      launchGame(game.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/pause',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      pauseGame(game.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/resume',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      resumeGame(game.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/end',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      endGame(game.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/teams/:teamId/force-start',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const team = requireTeamRoute(game.id, String(req.params.teamId ?? ''));
      startTeam(game.id, team.id, presence.connectedPlayerIds(game.id), true);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/teams/:teamId/hint',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const team = requireTeamRoute(game.id, String(req.params.teamId ?? ''));
      const scenario = scenarioForGame(game.scenario_json);
      if (team.current_room >= scenario.rooms.length) {
        throw new HttpError(400, 'L’équipe est déjà au code final.');
      }
      const room = scenario.rooms[team.current_room];
      const player = getTeamPlayers(team.id).find((p) => p.status === 'active');
      if (!player) throw new HttpError(400, 'Aucun joueur actif dans cette équipe.');
      const hint = useHint(game.id, team.id, player.id, room.id);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true, hint });
    }),
  );

  app.post(
    '/api/admin/games/:id/broadcast',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const body = parseBody(broadcastSchema, req);
      if (body.teamId) requireTeamRoute(game.id, body.teamId);
      const rows = insertCoachMessage(game.id, body.teamId ?? null, body.body);
      for (const row of rows) {
        const message = getPlayerMessage(row.id);
        if (message) emitTeamMessage(row.team_id, message);
      }
      broadcastAdminState(game.id);
      res.json({ ok: true, sent: rows.length });
    }),
  );

  app.post(
    '/api/admin/games/:id/players/:playerId/absent',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const body = parseBody(absentSchema, req);
      const player = getPlayerInGame(game.id, String(req.params.playerId ?? ''));
      if (!player) throw new HttpError(404, 'Joueur inconnu.');
      markAbsent(game.id, player.id, body.absent);
      if (body.absent) {
        presence.release(player.id);
        emitSessionReleased(player.id, 'Le professeur t’a marqué absent pour cette partie.');
      }
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/players/:playerId/release',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const player = getPlayerInGame(game.id, String(req.params.playerId ?? ''));
      if (!player) throw new HttpError(404, 'Joueur inconnu.');
      presence.release(player.id);
      emitSessionReleased(player.id, 'Le professeur a libéré ta place. Tu peux te reconnecter.');
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/players/:playerId/mute',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const body = parseBody(muteSchema, req);
      const player = getPlayerInGame(game.id, String(req.params.playerId ?? ''));
      if (!player) throw new HttpError(404, 'Joueur inconnu.');
      mutePlayer(game.id, player.id, body.minutes);
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/messages/:messageId/allow',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const message = allowMessage(game.id, String(req.params.messageId ?? ''));
      const playerMessage = getPlayerMessage(message.id);
      if (playerMessage) emitTeamMessage(message.team_id, playerMessage);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/messages/:messageId/hide',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const message = hideMessage(game.id, String(req.params.messageId ?? ''));
      emitMessageHidden(message.team_id, message.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/reports/:reportId/resolve',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      resolveReport(game.id, String(req.params.reportId ?? ''));
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/games/:id/research/:researchId/validate',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const body = parseBody(researchValidateSchema, req);
      validateResearchByTeacher(
        game.id,
        String(req.params.researchId ?? ''),
        body.approved,
        body.comment,
      );
      broadcastGameStates(game.id);
      broadcastAdminState(game.id);
      res.json({ ok: true });
    }),
  );

  app.get(
    '/api/admin/games/:id/export.csv',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      const csv = getExportCsv(game.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="vestiaire-7-${game.code}.csv"`);
      res.send(csv);
    }),
  );

  app.delete(
    '/api/admin/games/:id',
    action((req, res) => {
      const game = requireGameRoute(String(req.params.id ?? ''));
      emitGameDeleted(game.id);
      deleteGame(game.id);
      res.json({ ok: true });
    }),
  );

  app.post(
    '/api/admin/preflight/jev',
    action(async (_req, res) => {
      const result = await testJev();
      res.json(result);
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route inconnue.' });
  });

  return app;
}

function getTeamForRoster(gameId: string, teamId?: string) {
  const teams = getTeams(gameId);
  if (!teamId) return teams;
  const team = teams.find((t) => t.id === teamId);
  if (!team) throw new HttpError(404, 'Équipe inconnue.');
  return [team];
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error({ err, path: req.path }, 'http.error');
  res.status(500).json({ error: 'Erreur serveur.' });
}
