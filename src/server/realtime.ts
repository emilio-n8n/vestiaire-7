import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { AnyClientToServerEvents, AnyServerToClientEvents, PlayerMessage } from '../shared/types.js';
import { config } from './config.js';
import { isAdminSocket } from './auth.js';
import {
  getAdminState,
  getGame,
  getGameByCode,
  getPlayer,
  getPlayerInGame,
  getPlayerMessage,
  getRecentApprovedMessages,
  getTeam,
  getTeamPlayers,
  getTeamState,
  getTeams,
  insertPendingMessage,
  findMessageByClientId,
  reportMessage,
  startTeam,
  submitAnswer,
  submitExitCode,
  submitFinalCode,
  submitQuizAnswer,
  touchPlayer,
  updateMessageModeration,
  useHint,
} from './game.js';
import { logger } from './logger.js';
import { moderateMessage } from './moderation/index.js';
import { presence } from './presence.js';
import { normalizeText, now, safeEqual, sha256 } from './util.js';

interface SocketData {
  role: 'player' | 'admin';
  gameId?: string;
  teamId?: string;
  playerId?: string;
  adminGameId?: string;
}

type IO = Server<AnyClientToServerEvents, AnyServerToClientEvents, Record<string, never>, SocketData>;
type PlayerSocket = Socket<AnyClientToServerEvents, AnyServerToClientEvents, Record<string, never>, SocketData>;

let io: IO | null = null;

const moderationQueues = new Map<string, Promise<void>>();
const rateLimits = new Map<string, { lastAt: number; windowStart: number; count: number }>();

function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = req.headers.host;
    if (host && parsed.host === host) return true;
    if (config.publicUrl) {
      const publicOrigin = new URL(config.publicUrl);
      if (parsed.host === publicOrigin.host) return true;
    }
    if (!config.isProd && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
  } catch {
    return false;
  }
  return false;
}

export function initRealtime(httpServer: HttpServer): IO {
  io = new Server(httpServer, {
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 100_000,
    allowRequest: (req, callback) => {
      const allowed = originAllowed(req);
      callback(allowed ? null : 'origin-refusee', allowed);
    },
  });

  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    if (auth.role === 'admin') {
      if (!isAdminSocket(socket)) {
        next(new Error('admin-unauthorized'));
        return;
      }
      socket.data.role = 'admin';
      next();
      return;
    }
    if (auth.role === 'player') {
      const gameCode = typeof auth.gameCode === 'string' ? auth.gameCode.trim().toUpperCase() : '';
      const playerId = typeof auth.playerId === 'string' ? auth.playerId : '';
      const token = typeof auth.token === 'string' ? auth.token : '';
      const game = getGameByCode(gameCode);
      if (!game || game.status === 'draft') {
        next(new Error('game-unavailable'));
        return;
      }
      const player = getPlayerInGame(game.id, playerId);
      if (!player || player.status !== 'active' || !player.token_hash) {
        next(new Error('player-unauthorized'));
        return;
      }
      if (!safeEqual(player.token_hash, sha256(token))) {
        next(new Error('player-unauthorized'));
        return;
      }
      socket.data.role = 'player';
      socket.data.gameId = game.id;
      socket.data.teamId = player.team_id;
      socket.data.playerId = player.id;
      next();
      return;
    }
    next(new Error('role-inconnu'));
  });

  io.on('connection', (socket) => {
    if (socket.data.role === 'admin') {
      socket.on('admin:subscribe', (payload) => {
        const gameId = typeof payload?.gameId === 'string' ? payload.gameId : '';
        const game = getGame(gameId);
        if (!game) {
          socket.emit('admin:toast', { type: 'error', message: 'Partie inconnue.' });
          return;
        }
        if (socket.data.adminGameId) socket.leave(`admin:${socket.data.adminGameId}`);
        socket.data.adminGameId = gameId;
        socket.join(`admin:${gameId}`);
        socket.emit('admin:state', getAdminState(gameId, presence.connectedPlayerIds(gameId)));
      });
      return;
    }

    const gameId = socket.data.gameId;
    const teamId = socket.data.teamId;
    const playerId = socket.data.playerId;
    if (!gameId || !teamId || !playerId) {
      socket.disconnect(true);
      return;
    }

    socket.join([`game:${gameId}`, `team:${teamId}`, `player:${playerId}`]);
    touchPlayer(playerId);
    presence.connect(playerId, gameId, teamId, socket.id);

    socket.on('player:start', () => {
      try {
        const game = getGame(gameId);
        const team = getTeam(teamId);
        if (!game || !team) throw new Error('Partie inconnue.');
        startTeam(gameId, teamId, presence.connectedPlayerIds(gameId));
        broadcastGameStates(gameId);
        broadcastAdminState(gameId);
        socket.emit('toast', { type: 'success', message: "C'est parti ! Le chrono démarre." });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:answer', (payload) => {
      try {
        if (!payload || typeof payload.roomId !== 'string' || typeof payload.questionId !== 'string') {
          throw new Error('Réponse invalide.');
        }
        const result = submitAnswer(
          gameId,
          teamId,
          playerId,
          payload.roomId,
          payload.questionId,
          Number(payload.option),
        );
        broadcastGameStates(gameId);
        broadcastAdminState(gameId);
        if (result.correct) {
          socket.emit('toast', {
            type: 'success',
            message: result.allQuestionsCorrect
              ? 'Toutes les questions sont bonnes. Entrez le code de sortie.'
              : 'Bonne réponse !',
          });
        } else {
          socket.emit('toast', { type: 'info', message: 'Pas encore. Relis les indices de ton équipe.' });
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:code', (payload) => {
      try {
        if (!payload || typeof payload.roomId !== 'string' || typeof payload.code !== 'string') {
          throw new Error('Code invalide.');
        }
        const result = submitExitCode(gameId, teamId, playerId, payload.roomId, payload.code);
        broadcastGameStates(gameId);
        broadcastAdminState(gameId);
        if (result.correct) {
          socket.emit('toast', { type: 'success', message: 'Salle résolue ! La porte s’ouvre.' });
        } else {
          socket.emit('toast', { type: 'error', message: 'Ce n’est pas le bon code. Réessayez ensemble.' });
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:finalCode', (payload) => {
      try {
        if (!payload || typeof payload.code !== 'string') throw new Error('Code invalide.');
        const result = submitFinalCode(gameId, teamId, playerId, payload.code);
        broadcastGameStates(gameId);
        broadcastAdminState(gameId);
        if (result.correct) {
          socket.emit('toast', { type: 'success', message: 'Le trophée est ouvert ! Bravo à l’équipe.' });
        } else {
          socket.emit('toast', { type: 'error', message: 'Ce n’est pas le bon code final.' });
        }
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:hint', (payload) => {
      try {
        if (!payload || typeof payload.roomId !== 'string') throw new Error('Indice invalide.');
        useHint(gameId, teamId, playerId, payload.roomId);
        broadcastGameStates(gameId);
        broadcastAdminState(gameId);
        socket.emit('toast', { type: 'info', message: 'Coup de pouce utilisé (−20 points).' });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:message', (payload) => {
      try {
        if (!payload || typeof payload.body !== 'string' || typeof payload.clientId !== 'string') {
          throw new Error('Message invalide.');
        }
        handlePlayerMessage(socket, {
          gameId,
          teamId,
          playerId,
          body: payload.body,
          clientId: payload.clientId,
        });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:quizAnswer', (payload) => {
      try {
        if (!payload || typeof payload.questionId !== 'string') throw new Error('Réponse invalide.');
        const result = submitQuizAnswer(gameId, playerId, payload.questionId, Number(payload.option));
        emitPlayerState(playerId);
        broadcastAdminState(gameId);
        socket.emit('toast', {
          type: result.correct ? 'success' : 'info',
          message: result.finished
            ? `Quiz terminé : ${result.score}/${5}.`
            : result.correct
              ? 'Bonne réponse !'
              : 'Pas tout à fait. La correction s’affiche.',
        });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('player:report', (payload) => {
      try {
        if (!payload || typeof payload.messageId !== 'string') throw new Error('Signalement invalide.');
        reportMessage(gameId, playerId, payload.messageId);
        broadcastAdminState(gameId);
        socket.emit('toast', { type: 'success', message: 'Signalement envoyé au professeur.' });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      presence.disconnect(playerId, socket.id);
      touchPlayer(playerId);
    });
  });

  presence.setChangeHandler((gameId) => {
    broadcastGameStates(gameId);
    broadcastAdminState(gameId);
  });

  return io;
}

function handlePlayerMessage(
  socket: PlayerSocket,
  input: { gameId: string; teamId: string; playerId: string; body: string; clientId: string },
): void {
  const body = normalizeText(input.body).slice(0, config.chat.maxLength);
  const clientId = normalizeText(input.clientId).slice(0, 80);
  if (!body) throw new Error('Message vide.');
  if (!clientId) throw new Error('Identifiant de message manquant.');
  const game = getGame(input.gameId);
  const player = getPlayerInGame(input.gameId, input.playerId);
  const team = getTeam(input.teamId);
  if (!game || !player || !team) throw new Error('Partie inconnue.');
  if (game.status === 'ended') throw new Error('La partie est terminée : le chat est fermé.');
  if (player.status !== 'active') throw new Error('Tu es marqué absent : tu ne peux pas envoyer de message.');
  if (player.muted_until && player.muted_until > now()) {
    throw new Error('Tu es en sourdine quelques instants. Attends un peu avant de réécrire.');
  }

  const existing = findMessageByClientId(input.teamId, clientId);
  if (existing) {
    if (existing.status === 'blocked') {
      socket.emit('message:blocked', {
        clientId,
        reason: 'Ce message a déjà été bloqué.',
        category: 'deja_bloque',
      });
    } else if (existing.status === 'pending') {
      socket.emit('message:pending', { clientId, body: existing.body, createdAt: existing.created_at });
    } else {
      const message = getPlayerMessage(existing.id);
      if (message) socket.emit('message', { ...message, clientId });
    }
    return;
  }

  const rate = rateLimits.get(input.playerId) ?? { lastAt: 0, windowStart: now(), count: 0 };
  if (now() - rate.lastAt < config.chat.minIntervalMs) {
    throw new Error('Doucement : attends une seconde avant de renvoyer un message.');
  }
  if (now() - rate.windowStart > 60_000) {
    rate.windowStart = now();
    rate.count = 0;
  }
  if (rate.count >= config.chat.maxPerMinute) {
    throw new Error('Trop de messages en une minute. Laisse respirer le chat.');
  }
  rate.lastAt = now();
  rate.count += 1;
  rateLimits.set(input.playerId, rate);

  const pending = insertPendingMessage({
    gameId: input.gameId,
    teamId: input.teamId,
    playerId: input.playerId,
    authorName: player.name,
    body,
    clientId,
  });
  socket.emit('message:pending', { clientId, body: pending.body, createdAt: pending.created_at });

  const previous = moderationQueues.get(input.teamId) ?? Promise.resolve();
  const next = previous
    .then(() =>
      processMessage({
        gameId: input.gameId,
        teamId: input.teamId,
        playerId: input.playerId,
        playerName: player.name,
        teamName: team.name,
        messageId: pending.id,
        body,
        clientId,
      }),
    )
    .catch((error) => {
      logger.error({ err: error, messageId: pending.id }, 'Échec de la modération');
    });
  moderationQueues.set(input.teamId, next);
  void next.finally(() => {
    if (moderationQueues.get(input.teamId) === next) moderationQueues.delete(input.teamId);
  });
}

async function processMessage(input: {
  gameId: string;
  teamId: string;
  playerId: string;
  playerName: string;
  teamName: string;
  messageId: string;
  body: string;
  clientId: string;
}): Promise<void> {
  const recent = getRecentApprovedMessages(input.teamId, config.chat.contextMessages);
  const result = await moderateMessage(input.body, {
    teamName: input.teamName,
    playerName: input.playerName,
    recentMessages: recent,
  });
  const status = result.decision.action === 'block' ? 'blocked' : result.decision.action === 'flag' ? 'flagged' : 'approved';
  const updated = updateMessageModeration(input.messageId, status, result.decision);

  if (status === 'blocked') {
    io?.to(`player:${input.playerId}`).emit('message:blocked', {
      clientId: input.clientId,
      reason: result.decision.reason ?? 'Ce message n’est pas respectueux. Reformule-le.',
      category: result.decision.category,
    });
  } else {
    const message = getPlayerMessage(updated.id);
    if (message) {
      io?.to(`team:${input.teamId}`).emit('message', { ...message, clientId: input.clientId });
    }
  }
  broadcastAdminState(input.gameId);
}

export function emitPlayerState(playerId: string): void {
  const player = getPlayer(playerId);
  if (!player) return;
  const game = getGame(player.game_id);
  if (!game) return;
  const team = getTeam(player.team_id);
  if (!team) return;
  const state = getTeamState(game, team, player, presence.connectedPlayerIds(game.id));
  io?.to(`player:${playerId}`).emit('state', state);
}

export function broadcastGameStates(gameId: string): void {
  const game = getGame(gameId);
  if (!game) return;
  const connected = presence.connectedPlayerIds(gameId);
  for (const team of getTeams(gameId)) {
    for (const player of getTeamPlayers(team.id)) {
      const state = getTeamState(game, team, player, connected);
      io?.to(`player:${player.id}`).emit('state', state);
    }
  }
}

export function broadcastAdminState(gameId: string): void {
  if (!io) return;
  const game = getGame(gameId);
  if (!game) return;
  io.to(`admin:${gameId}`).emit('admin:state', getAdminState(gameId, presence.connectedPlayerIds(gameId)));
}

export function emitTeamMessage(teamId: string, message: PlayerMessage & { clientId?: string }): void {
  io?.to(`team:${teamId}`).emit('message', message);
}

export function emitMessageHidden(teamId: string, messageId: string): void {
  io?.to(`team:${teamId}`).emit('message:hidden', { messageId });
}

export function emitSessionReleased(playerId: string, message: string): void {
  if (!io) return;
  io.to(`player:${playerId}`).emit('session:released', { message });
  setTimeout(() => {
    io?.in(`player:${playerId}`).disconnectSockets(true);
  }, 250);
}

export function emitGameDeleted(gameId: string): void {
  if (!io) return;
  io.to(`admin:${gameId}`).emit('game:deleted');
  for (const team of getTeams(gameId)) {
    for (const player of getTeamPlayers(team.id)) {
      io.to(`player:${player.id}`).emit('game:deleted');
    }
  }
}

export function emitAdminToast(gameId: string, message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  io?.to(`admin:${gameId}`).emit('admin:toast', { type, message });
}

function emitError(socket: PlayerSocket, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
  socket.emit('toast', { type: 'error', message });
}

export function getIo(): IO | null {
  return io;
}
