import type {
  AdminMessage,
  AdminState,
  AdminTeam,
  CreateGameInput,
  GameListItem,
  GameStatus,
  MessageStatus,
  ModerationDecision,
  PlayerMessage,
  PlayerState,
  PlayerStatus,
  QuizQuestionState,
  TeamColor,
} from '../shared/types.js';
import { canStartTeam } from '../shared/gate.js';
import { config } from './config.js';
import { db, withTransaction } from './db.js';
import { getJevHealth } from './moderation/index.js';
import {
  allQuestionsCorrect,
  findRoom,
  loadScenario,
  playerClues,
  publicRoom,
  quizQuestions,
  scenarioForGame,
  solution,
  type RoomProgress,
} from './scenario.js';
import type { Scenario } from '../shared/scenario.js';
import { clamp, formatDuration, normalizeCode, normalizeText, now, randomCode, randomId, randomPin, toCsv } from './util.js';

interface GameRow {
  id: string;
  code: string;
  pin: string;
  title: string;
  scenario_id: string;
  scenario_json: string;
  status: GameStatus;
  created_at: number;
  opened_at: number | null;
  launched_at: number | null;
  paused_at: number | null;
  ended_at: number | null;
}

interface TeamRow {
  id: string;
  game_id: string;
  name: string;
  color: TeamColor;
  sort_order: number;
  started_at: number | null;
  finished_at: number | null;
  paused_ms: number;
  score: number;
  current_room: number;
  final_code_ok: number;
  created_at: number;
}

interface PlayerRow {
  id: string;
  game_id: string;
  team_id: string;
  name: string;
  token_hash: string | null;
  status: PlayerStatus;
  joined_at: number | null;
  last_seen: number | null;
  muted_until: number | null;
  quiz_score: number | null;
  quiz_finished_at: number | null;
  created_at: number;
}

interface MessageRow {
  id: string;
  game_id: string;
  team_id: string;
  player_id: string | null;
  author_name: string;
  author_kind: 'player' | 'coach' | 'system';
  body: string;
  status: MessageStatus;
  moderation_json: string | null;
  client_id: string | null;
  created_at: number;
  published_at: number | null;
}

interface ProgressRow {
  team_id: string;
  room_id: string;
  questions_json: string;
  attempts: number;
  hint_used: number;
  solved_at: number | null;
  exit_code: string | null;
}

interface QuizAnswerRow {
  player_id: string;
  question_id: string;
  choice: number;
  correct: number;
  answered_at: number;
}

interface ReportRow {
  id: string;
  game_id: string;
  message_id: string;
  player_id: string;
  created_at: number;
  resolved: number;
  player_name?: string;
  team_id?: string;
  team_name?: string;
}

export function getGame(gameId: string): GameRow | null {
  return (db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as GameRow | undefined) ?? null;
}

export function getGameByCode(code: string): GameRow | null {
  return (
    (db.prepare('SELECT * FROM games WHERE code = ?').get(code.trim().toUpperCase()) as GameRow | undefined) ?? null
  );
}

export function getTeams(gameId: string): TeamRow[] {
  return db.prepare('SELECT * FROM teams WHERE game_id = ? ORDER BY sort_order ASC').all(gameId) as unknown as TeamRow[];
}

export function getTeam(teamId: string): TeamRow | null {
  return (db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as TeamRow | undefined) ?? null;
}

export function getPlayers(gameId: string): PlayerRow[] {
  return db
    .prepare('SELECT * FROM players WHERE game_id = ? ORDER BY created_at ASC, name ASC')
    .all(gameId) as unknown as PlayerRow[];
}

export function getTeamPlayers(teamId: string): PlayerRow[] {
  return db
    .prepare('SELECT * FROM players WHERE team_id = ? ORDER BY created_at ASC, name ASC')
    .all(teamId) as unknown as PlayerRow[];
}

export function getPlayer(playerId: string): PlayerRow | null {
  return (db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as PlayerRow | undefined) ?? null;
}

export function getPlayerInGame(gameId: string, playerId: string): PlayerRow | null {
  return (
    (db.prepare('SELECT * FROM players WHERE id = ? AND game_id = ?').get(playerId, gameId) as
      | PlayerRow
      | undefined) ?? null
  );
}

export function setPlayerToken(playerId: string, tokenHash: string | null): void {
  db.prepare('UPDATE players SET token_hash = ? WHERE id = ?').run(tokenHash, playerId);
}

export function touchPlayer(playerId: string): void {
  db.prepare('UPDATE players SET last_seen = ? WHERE id = ?').run(now(), playerId);
}

export function setPlayerJoined(playerId: string): void {
  db.prepare('UPDATE players SET joined_at = COALESCE(joined_at, ?), last_seen = ? WHERE id = ?').run(
    now(),
    now(),
    playerId,
  );
}

export function createGame(input: CreateGameInput): { id: string; code: string; pin: string } {
  const scenario = loadScenario();
  const title = normalizeText(input.title);
  if (title.length < 3 || title.length > 100) throw new Error('Le titre doit faire entre 3 et 100 caractères.');
  if (input.teams.length < 2 || input.teams.length > config.maxTeams) {
    throw new Error(`Il faut entre 2 et ${config.maxTeams} équipes.`);
  }
  const teamNames = new Set<string>();
  const seenPlayers = new Set<string>();
  let totalPlayers = 0;
  for (const team of input.teams) {
    const teamName = normalizeText(team.name);
    if (teamName.length < 2 || teamName.length > 40) throw new Error('Chaque nom d’équipe doit faire 2 à 40 caractères.');
    if (teamNames.has(teamName.toLowerCase())) throw new Error(`Nom d’équipe en double : ${teamName}`);
    teamNames.add(teamName.toLowerCase());
    if (team.players.length < 1 || team.players.length > config.maxPlayersPerTeam) {
      throw new Error(`Chaque équipe doit avoir entre 1 et ${config.maxPlayersPerTeam} joueurs.`);
    }
    for (const rawName of team.players) {
      const name = normalizeText(rawName);
      if (name.length < 2 || name.length > 40) throw new Error(`Prénom invalide : ${name}`);
      const key = `${teamName.toLowerCase()}::${name.toLowerCase()}`;
      if (seenPlayers.has(key)) throw new Error(`Prénom en double dans ${teamName} : ${name}`);
      seenPlayers.add(key);
      totalPlayers += 1;
    }
  }
  if (totalPlayers > config.maxPlayersTotal) throw new Error(`Trop de joueurs (max ${config.maxPlayersTotal}).`);

  let code = '';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = randomCode(6);
    const exists = db.prepare('SELECT 1 FROM games WHERE code = ?').get(candidate);
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('Impossible de générer un code de partie.');

  const pin = randomPin();
  const id = randomId();
  const createdAt = now();

  withTransaction(() => {
    db.prepare(
      `INSERT INTO games (id, code, pin, title, scenario_id, scenario_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    ).run(id, code, pin, title, scenario.id, JSON.stringify(scenario), createdAt);

    input.teams.forEach((team, index) => {
      const teamId = randomId();
      const color = (config.teamColors.includes(team.color) ? team.color : config.teamColors[index % config.teamColors.length]) as TeamColor;
      db.prepare(
        `INSERT INTO teams (id, game_id, name, color, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(teamId, id, normalizeText(team.name), color, index, createdAt);
      team.players.forEach((rawName) => {
        db.prepare(
          `INSERT INTO players (id, game_id, team_id, name, status, created_at)
           VALUES (?, ?, ?, ?, 'active', ?)`,
        ).run(randomId(), id, teamId, normalizeText(rawName), createdAt);
      });
    });
    logEvent(id, null, null, 'game.created', { title, teams: input.teams.length, players: totalPlayers });
  });

  return { id, code, pin };
}

export function openGame(gameId: string): GameRow {
  const game = requireGame(gameId);
  if (game.status === 'draft') {
    db.prepare("UPDATE games SET status = 'lobby', opened_at = ? WHERE id = ?").run(now(), gameId);
    logEvent(gameId, null, null, 'game.opened');
  }
  return requireGame(gameId);
}

export function launchGame(gameId: string): GameRow {
  const game = requireGame(gameId);
  if (game.status !== 'lobby') throw new Error('La partie doit être dans le salon pour être lancée.');
  db.prepare("UPDATE games SET status = 'live', launched_at = ? WHERE id = ?").run(now(), gameId);
  logEvent(gameId, null, null, 'game.launched');
  return requireGame(gameId);
}

export function pauseGame(gameId: string): GameRow {
  const game = requireGame(gameId);
  if (game.status !== 'live') throw new Error('La partie n’est pas en cours.');
  db.prepare("UPDATE games SET status = 'paused', paused_at = ? WHERE id = ?").run(now(), gameId);
  logEvent(gameId, null, null, 'game.paused');
  return requireGame(gameId);
}

export function resumeGame(gameId: string): GameRow {
  const game = requireGame(gameId);
  if (game.status !== 'paused' || !game.paused_at) throw new Error('La partie n’est pas en pause.');
  const pauseDuration = Math.max(0, now() - game.paused_at);
  withTransaction(() => {
    db.prepare(
      `UPDATE teams
       SET paused_ms = paused_ms + ?
       WHERE game_id = ? AND started_at IS NOT NULL AND finished_at IS NULL`,
    ).run(pauseDuration, gameId);
    db.prepare("UPDATE games SET status = 'live', paused_at = NULL WHERE id = ?").run(gameId);
    logEvent(gameId, null, null, 'game.resumed', { pauseDuration });
  });
  return requireGame(gameId);
}

export function endGame(gameId: string): GameRow {
  const game = requireGame(gameId);
  if (game.status === 'ended') return game;
  const endedAt = now();
  withTransaction(() => {
    if (game.status === 'paused' && game.paused_at) {
      const pauseDuration = Math.max(0, endedAt - game.paused_at);
      db.prepare(
        `UPDATE teams
         SET paused_ms = paused_ms + ?
         WHERE game_id = ? AND started_at IS NOT NULL AND finished_at IS NULL`,
      ).run(pauseDuration, gameId);
    }
    db.prepare("UPDATE games SET status = 'ended', ended_at = ?, paused_at = NULL WHERE id = ?").run(endedAt, gameId);
    logEvent(gameId, null, null, 'game.ended');
  });
  return requireGame(gameId);
}

export function startTeam(gameId: string, teamId: string, connectedIds: Set<string>, forced = false): TeamRow {
  const game = requireGame(gameId);
  const team = requireTeam(teamId);
  if (team.game_id !== gameId) throw new Error('Équipe inconnue.');
  if (game.status !== 'live') throw new Error('Le professeur n’a pas encore lancé la partie.');
  if (team.started_at) throw new Error('Cette équipe est déjà entrée dans le jeu.');
  const players = getTeamPlayers(teamId).filter((p) => p.status === 'active');
  if (players.length === 0) throw new Error('Cette équipe n’a aucun joueur actif.');
  if (!forced && !players.every((p) => connectedIds.has(p.id))) {
    throw new Error('Tous les joueurs de l’équipe doivent être connectés.');
  }
  const startedAt = now();
  withTransaction(() => {
    db.prepare('UPDATE teams SET started_at = ?, paused_ms = 0 WHERE id = ?').run(startedAt, teamId);
    insertSystemMessage(gameId, teamId, "L'équipe entre dans le vestiaire. Le chrono démarre.");
    logEvent(gameId, teamId, null, 'team.started', { forced });
  });
  return requireTeam(teamId);
}

export function submitAnswer(
  gameId: string,
  teamId: string,
  playerId: string,
  roomId: string,
  questionId: string,
  option: number,
): { correct: boolean; already: boolean; explanation: string; allQuestionsCorrect: boolean } {
  const { game, team, player, scenario, room } = requirePlayingContext(gameId, teamId, playerId);
  if (team.current_room !== scenario.rooms.findIndex((r) => r.id === room.id)) {
    throw new Error('Cette salle n’est plus la salle actuelle.');
  }
  const question = room.questions.find((q) => q.id === questionId);
  if (!question) throw new Error('Question inconnue.');
  if (!Number.isInteger(option) || option < 0 || option >= question.options.length) {
    throw new Error('Réponse invalide.');
  }
  const progress = getOrCreateProgress(teamId, roomId);
  if (progress.questions[questionId]?.correct) {
    return { correct: true, already: true, explanation: question.explanation, allQuestionsCorrect: true };
  }
  const correct = option === question.correct;
  const updated: RoomProgress = {
    ...progress,
    questions: {
      ...progress.questions,
      ...(correct ? { [questionId]: { correct: true, by: playerId, at: now() } } : {}),
    },
    attempts: correct ? progress.attempts : progress.attempts + 1,
  };
  withTransaction(() => {
    db.prepare('UPDATE progress SET questions_json = ?, attempts = ? WHERE team_id = ? AND room_id = ?').run(
      JSON.stringify(updated.questions),
      updated.attempts,
      teamId,
      roomId,
    );
    if (!correct) {
      db.prepare('UPDATE teams SET score = MAX(0, score - 5) WHERE id = ?').run(teamId);
    }
    logEvent(gameId, teamId, player.id, 'room.answer', { roomId, questionId, correct });
  });
  return {
    correct,
    already: false,
    explanation: question.explanation,
    allQuestionsCorrect: allQuestionsCorrect(room, updated),
  };
}

export function submitExitCode(
  gameId: string,
  teamId: string,
  playerId: string,
  roomId: string,
  code: string,
): { correct: boolean; already: boolean } {
  const { game, team, player, scenario, room } = requirePlayingContext(gameId, teamId, playerId);
  const roomIndex = scenario.rooms.findIndex((r) => r.id === room.id);
  if (team.current_room !== roomIndex) throw new Error('Cette salle n’est plus la salle actuelle.');
  const progress = getOrCreateProgress(teamId, roomId);
  if (progress.solvedAt) return { correct: true, already: true };
  if (!allQuestionsCorrect(room, progress)) {
    throw new Error('Réponds d’abord aux questions de la salle.');
  }
  const correct = normalizeCode(code) === room.exitCode;
  if (!correct) {
    withTransaction(() => {
      db.prepare('UPDATE progress SET attempts = attempts + 1 WHERE team_id = ? AND room_id = ?').run(teamId, roomId);
      db.prepare('UPDATE teams SET score = MAX(0, score - 5) WHERE id = ?').run(teamId);
      logEvent(gameId, teamId, player.id, 'room.code.wrong', { roomId });
    });
    return { correct: false, already: false };
  }
  const solvedAt = now();
  withTransaction(() => {
    db.prepare('UPDATE progress SET solved_at = ?, exit_code = ? WHERE team_id = ? AND room_id = ?').run(
      solvedAt,
      room.exitCode,
      teamId,
      roomId,
    );
    db.prepare('UPDATE teams SET current_room = current_room + 1, score = score + 100 WHERE id = ?').run(teamId);
    insertSystemMessage(gameId, teamId, `Salle ${roomIndex + 1} résolue. ${room.success}`);
    logEvent(gameId, teamId, player.id, 'room.solved', { roomId, roomIndex });
  });
  return { correct: true, already: false };
}

export function submitFinalCode(
  gameId: string,
  teamId: string,
  playerId: string,
  code: string,
): { correct: boolean; already: boolean } {
  const game = requireGame(gameId);
  if (game.status !== 'live') throw new Error('La partie n’est pas en cours.');
  const team = requireTeam(teamId);
  const player = getPlayerInGame(gameId, playerId);
  if (!player || player.team_id !== teamId || player.status !== 'active') throw new Error('Joueur inconnu.');
  if (!team.started_at) throw new Error('L’équipe n’a pas encore commencé.');
  if (team.final_code_ok) return { correct: true, already: true };
  const scenario = scenarioForGame(game.scenario_json);
  const progress = getProgressMap(teamId);
  if (scenario.rooms.some((room) => !progress[room.id]?.solvedAt)) {
    throw new Error('Toutes les salles ne sont pas encore résolues.');
  }
  const correct = normalizeCode(code) === scenario.final.code;
  if (!correct) {
    withTransaction(() => {
      db.prepare('UPDATE teams SET score = MAX(0, score - 5) WHERE id = ?').run(teamId);
      logEvent(gameId, teamId, playerId, 'final.code.wrong');
    });
    return { correct: false, already: false };
  }
  const finishedAt = now();
  withTransaction(() => {
    db.prepare('UPDATE teams SET final_code_ok = 1, finished_at = ?, score = score + 50 WHERE id = ?').run(
      finishedAt,
      teamId,
    );
    insertSystemMessage(gameId, teamId, scenario.final.success);
    logEvent(gameId, teamId, playerId, 'team.finished');
  });
  return { correct: true, already: false };
}

export function useHint(gameId: string, teamId: string, playerId: string, roomId: string): string {
  const { team, scenario, room } = requirePlayingContext(gameId, teamId, playerId);
  if (team.current_room !== scenario.rooms.findIndex((r) => r.id === room.id)) {
    throw new Error('Cette salle n’est plus la salle actuelle.');
  }
  const progress = getOrCreateProgress(teamId, roomId);
  if (progress.solvedAt) throw new Error('Cette salle est déjà résolue.');
  if (progress.hintUsed) return room.hint;
  withTransaction(() => {
    db.prepare('UPDATE progress SET hint_used = 1 WHERE team_id = ? AND room_id = ?').run(teamId, roomId);
    db.prepare('UPDATE teams SET score = MAX(0, score - 20) WHERE id = ?').run(teamId);
    insertSystemMessage(gameId, teamId, "L'équipe demande un coup de pouce.");
    logEvent(gameId, teamId, playerId, 'room.hint', { roomId });
  });
  return room.hint;
}

export function submitQuizAnswer(
  gameId: string,
  playerId: string,
  questionId: string,
  option: number,
): { correct: boolean; explanation: string; score: number; finished: boolean } {
  const game = requireGame(gameId);
  const player = getPlayerInGame(gameId, playerId);
  if (!player || player.status !== 'active') throw new Error('Joueur inconnu.');
  const team = requireTeam(player.team_id);
  if (!team.finished_at) throw new Error('Le quiz individuel est disponible après la fin de l’escape.');
  if (player.quiz_finished_at) throw new Error('Ton quiz est déjà terminé.');
  const scenario = scenarioForGame(game.scenario_json);
  const question = scenario.finalQuiz.find((q) => q.id === questionId);
  if (!question) throw new Error('Question inconnue.');
  if (!Number.isInteger(option) || option < 0 || option >= question.options.length) {
    throw new Error('Réponse invalide.');
  }
  const existing = db
    .prepare('SELECT * FROM quiz_answers WHERE player_id = ? AND question_id = ?')
    .get(playerId, questionId) as QuizAnswerRow | undefined;
  if (existing) {
    return {
      correct: existing.correct === 1,
      explanation: question.explanation,
      score: countQuizScore(playerId),
      finished: false,
    };
  }
  const correct = option === question.correct;
  withTransaction(() => {
    db.prepare(
      'INSERT INTO quiz_answers (player_id, question_id, choice, correct, answered_at) VALUES (?, ?, ?, ?, ?)',
    ).run(playerId, questionId, option, correct ? 1 : 0, now());
    logEvent(gameId, player.team_id, playerId, 'quiz.answer', { questionId, correct });
  });
  const answers = db.prepare('SELECT * FROM quiz_answers WHERE player_id = ?').all(playerId) as unknown as QuizAnswerRow[];
  const score = answers.filter((a) => a.correct === 1).length;
  const finished = answers.length >= scenario.finalQuiz.length;
  if (finished) {
    db.prepare('UPDATE players SET quiz_score = ?, quiz_finished_at = ? WHERE id = ?').run(score, now(), playerId);
    logEvent(gameId, player.team_id, playerId, 'quiz.finished', { score });
  }
  return { correct, explanation: question.explanation, score, finished };
}

export function reportMessage(gameId: string, playerId: string, messageId: string): ReportRow {
  const player = getPlayerInGame(gameId, playerId);
  if (!player) throw new Error('Joueur inconnu.');
  const message = getMessage(messageId);
  if (!message || message.team_id !== player.team_id) throw new Error('Message inconnu.');
  const id = randomId();
  const createdAt = now();
  db.prepare(
    'INSERT OR IGNORE INTO reports (id, game_id, message_id, player_id, created_at, resolved) VALUES (?, ?, ?, ?, ?, 0)',
  ).run(id, gameId, messageId, playerId, createdAt);
  logEvent(gameId, player.team_id, playerId, 'message.reported', { messageId });
  return {
    id,
    game_id: gameId,
    message_id: messageId,
    player_id: playerId,
    created_at: createdAt,
    resolved: 0,
    player_name: player.name,
    team_id: player.team_id,
  };
}

export function insertCoachMessage(gameId: string, teamId: string | null, body: string): MessageRow[] {
  const clean = normalizeText(body).slice(0, config.chat.maxLength);
  if (!clean) throw new Error('Message vide.');
  const teams = teamId ? [requireTeam(teamId)] : getTeams(gameId);
  const createdAt = now();
  const rows: MessageRow[] = [];
  withTransaction(() => {
    for (const team of teams) {
      if (team.game_id !== gameId) continue;
      const id = randomId();
      db.prepare(
        `INSERT INTO messages (id, game_id, team_id, player_id, author_name, author_kind, body, status, created_at, published_at)
         VALUES (?, ?, ?, NULL, 'Coach', 'coach', ?, 'approved', ?, ?)`,
      ).run(id, gameId, team.id, clean, createdAt, createdAt);
      const row = getMessage(id);
      if (row) rows.push(row);
    }
    logEvent(gameId, teamId, null, 'coach.message', { body: clean });
  });
  return rows;
}

export function allowMessage(gameId: string, messageId: string): MessageRow {
  const message = getMessage(messageId);
  if (!message || message.game_id !== gameId) throw new Error('Message inconnu.');
  db.prepare("UPDATE messages SET status = 'approved', published_at = ? WHERE id = ?").run(now(), messageId);
  logEvent(gameId, message.team_id, message.player_id, 'message.allowed', { messageId });
  return getMessage(messageId) as MessageRow;
}

export function hideMessage(gameId: string, messageId: string): MessageRow {
  const message = getMessage(messageId);
  if (!message || message.game_id !== gameId) throw new Error('Message inconnu.');
  db.prepare("UPDATE messages SET status = 'hidden' WHERE id = ?").run(messageId);
  logEvent(gameId, message.team_id, message.player_id, 'message.hidden', { messageId });
  return getMessage(messageId) as MessageRow;
}

export function markAbsent(gameId: string, playerId: string, absent: boolean): PlayerRow {
  const player = getPlayerInGame(gameId, playerId);
  if (!player) throw new Error('Joueur inconnu.');
  db.prepare('UPDATE players SET status = ? WHERE id = ?').run(absent ? 'absent' : 'active', playerId);
  logEvent(gameId, player.team_id, playerId, absent ? 'player.absent' : 'player.active');
  return getPlayer(playerId) as PlayerRow;
}

export function mutePlayer(gameId: string, playerId: string, minutes: number): PlayerRow {
  const player = getPlayerInGame(gameId, playerId);
  if (!player) throw new Error('Joueur inconnu.');
  const until = minutes > 0 ? now() + minutes * 60_000 : null;
  db.prepare('UPDATE players SET muted_until = ? WHERE id = ?').run(until, playerId);
  logEvent(gameId, player.team_id, playerId, minutes > 0 ? 'player.muted' : 'player.unmuted', { minutes });
  return getPlayer(playerId) as PlayerRow;
}

export function resolveReport(gameId: string, reportId: string): void {
  db.prepare('UPDATE reports SET resolved = 1 WHERE id = ? AND game_id = ?').run(reportId, gameId);
  logEvent(gameId, null, null, 'report.resolved', { reportId });
}

export function deleteGame(gameId: string): void {
  db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
}

export function listGames(): GameListItem[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.code, g.title, g.status, g.created_at,
        (SELECT COUNT(*) FROM teams t WHERE t.game_id = g.id) AS teams,
        (SELECT COUNT(*) FROM players p WHERE p.game_id = g.id) AS players
       FROM games g ORDER BY g.created_at DESC`,
    )
    .all() as unknown as Array<{
    id: string;
    code: string;
    title: string;
    status: GameStatus;
    created_at: number;
    teams: number;
    players: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    teams: row.teams,
    players: row.players,
    connected: 0,
  }));
}

export function getTeamState(
  game: GameRow,
  team: TeamRow,
  me: PlayerRow,
  connectedIds: Set<string>,
): PlayerState {
  const scenario = scenarioForGame(game.scenario_json);
  const players = getTeamPlayers(team.id);
  const activePlayers = players.filter((p) => p.status === 'active');
  const playerIndex = Math.max(0, activePlayers.findIndex((p) => p.id === me.id));
  const progressMap = getProgressMap(team.id);
  const currentRoom = clamp(team.current_room, 0, scenario.rooms.length);
  const canStart = canStartTeam({
    gameStatus: game.status,
    teamStartedAt: team.started_at,
    activePlayerIds: activePlayers.map((p) => p.id),
    connectedIds,
  });
  const room = team.started_at && currentRoom < scenario.rooms.length ? scenario.rooms[currentRoom] : null;
  const roomProgress = room ? progressMap[room.id] ?? emptyProgress() : null;
  const quizAnswers = getQuizAnswers(me.id);
  const digits = scenario.rooms.map((r) => (progressMap[r.id]?.solvedAt ? r.exitCode : null));
  const messages = getTeamMessages(team.id, config.chat.history).map((m) => toPlayerMessage(m));

  return {
    serverNow: now(),
    game: {
      code: game.code,
      title: game.title,
      subtitle: scenario.subtitle,
      status: game.status,
      durationMinutes: scenario.durationMinutes,
      intro: scenario.intro,
      rules: scenario.rules,
    },
    team: {
      id: team.id,
      name: team.name,
      color: team.color,
      score: team.score,
      startedAt: team.started_at,
      finishedAt: team.finished_at,
      elapsedMs: elapsedForTeam(team, game),
      currentRoom,
      totalRooms: scenario.rooms.length,
      finalCodeOk: team.final_code_ok === 1,
      canStart,
    },
    me: {
      id: me.id,
      name: me.name,
      teamId: me.team_id,
      quizScore: me.quiz_score,
      quizFinishedAt: me.quiz_finished_at,
      mutedUntil: me.muted_until,
    },
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      connected: connectedIds.has(p.id),
      isMe: p.id === me.id,
    })),
    room:
      room && roomProgress
        ? publicRoom(room, currentRoom, roomProgress, playerClues(room, playerIndex, activePlayers.length))
        : null,
    final: {
      ready: scenario.rooms.every((r) => progressMap[r.id]?.solvedAt),
      prompt: scenario.final.prompt,
      digits,
      solved: team.final_code_ok === 1,
      success: team.final_code_ok === 1 ? scenario.final.success : null,
    },
    messages,
    quiz: {
      available: Boolean(team.finished_at),
      intro: scenario.finalQuizIntro,
      questions: quizQuestions(scenario, quizAnswers),
      score: me.quiz_score,
      finished: Boolean(me.quiz_finished_at),
    },
  };
}

export function getAdminState(gameId: string, connectedIds: Set<string>): AdminState {
  const game = requireGame(gameId);
  const scenario = scenarioForGame(game.scenario_json);
  const teams = getTeams(gameId);
  const players = getPlayers(gameId);
  const messages = getGameMessages(gameId, 200).map((m) => toAdminMessage(m, teams));
  const reports = getReports(gameId);
  const allMessages = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE game_id = ?').get(gameId) as { n: number };
  const blocked = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE game_id = ? AND status = 'blocked'")
    .get(gameId) as { n: number };
  const flagged = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE game_id = ? AND status = 'flagged'")
    .get(gameId) as { n: number };
  const activePlayers = players.filter((p) => p.status === 'active');
  const teamRows: AdminTeam[] = teams.map((team) => {
    const teamPlayers = players.filter((p) => p.team_id === team.id);
    const active = teamPlayers.filter((p) => p.status === 'active');
    const progressMap = getProgressMap(team.id);
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      score: team.score,
      currentRoom: team.current_room,
      totalRooms: scenario.rooms.length,
      startedAt: team.started_at,
      finishedAt: team.finished_at,
      elapsedMs: elapsedForTeam(team, game),
      canStart: canStartTeam({
        gameStatus: game.status,
        teamStartedAt: team.started_at,
        activePlayerIds: active.map((p) => p.id),
        connectedIds,
      }),
      finalCodeOk: team.final_code_ok === 1,
      players: teamPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        connected: connectedIds.has(p.id),
        quizScore: p.quiz_score,
        quizFinishedAt: p.quiz_finished_at,
        lastSeen: p.last_seen,
        mutedUntil: p.muted_until,
        quizAnswers: countQuizAnswers(p.id),
      })),
      progress: scenario.rooms.map((room) => {
        const row = progressMap[room.id];
        return {
          roomId: room.id,
          solvedAt: row?.solvedAt ?? null,
          attempts: row?.attempts ?? 0,
          hintUsed: row?.hintUsed ?? false,
          correctQuestions: row ? Object.entries(row.questions).filter(([, v]) => v.correct).map(([k]) => k) : [],
        };
      }),
    };
  });

  return {
    serverNow: now(),
    game: {
      id: game.id,
      code: game.code,
      pin: game.pin,
      title: game.title,
      status: game.status,
      createdAt: game.created_at,
      openedAt: game.opened_at,
      launchedAt: game.launched_at,
      endedAt: game.ended_at,
      scenario: {
        id: scenario.id,
        title: scenario.title,
        subtitle: scenario.subtitle,
        durationMinutes: scenario.durationMinutes,
        rooms: scenario.rooms.map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          exitCode: r.exitCode,
        })),
        finalCode: scenario.final.code,
        finalQuiz: scenario.finalQuiz.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation,
        })),
      },
    },
    teams: teamRows,
    messages,
    reports: reports.map((r) => ({
      id: r.id,
      messageId: r.message_id,
      playerId: r.player_id,
      playerName: r.player_name ?? '',
      teamId: r.team_id ?? '',
      teamName: r.team_name ?? '',
      createdAt: r.created_at,
      resolved: r.resolved === 1,
    })),
    jev: getJevHealth(),
    stats: {
      playersTotal: activePlayers.length,
      playersConnected: activePlayers.filter((p) => connectedIds.has(p.id)).length,
      messages: allMessages.n,
      blocked: blocked.n,
      flagged: flagged.n,
      reports: reports.filter((r) => r.resolved === 0).length,
    },
    solution: solution(scenario),
  };
}

export function getExportCsv(gameId: string): string {
  const game = requireGame(gameId);
  const scenario = scenarioForGame(game.scenario_json);
  const teams = getTeams(gameId);
  const rows: Array<Array<string | number | null>> = [
    [
      'Équipe',
      'Joueur',
      'Statut',
      'Score quiz',
      'Quiz terminé',
      'Salles résolues',
      'Coups de pouce',
      'Messages',
      'Score équipe',
      'Temps',
    ],
  ];
  for (const team of teams) {
    const players = getTeamPlayers(team.id);
    const progressMap = getProgressMap(team.id);
    const solved = scenario.rooms.filter((r) => progressMap[r.id]?.solvedAt).length;
    const hints = scenario.rooms.filter((r) => progressMap[r.id]?.hintUsed).length;
    for (const player of players) {
      const messages = db
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE player_id = ? AND status IN ('approved','flagged')")
        .get(player.id) as { n: number };
      rows.push([
        team.name,
        player.name,
        player.status === 'active' ? 'Actif' : 'Absent',
        player.quiz_score == null ? '' : `${player.quiz_score}/${scenario.finalQuiz.length}`,
        player.quiz_finished_at ? 'Oui' : 'Non',
        `${solved}/${scenario.rooms.length}`,
        hints,
        messages.n,
        team.score,
        formatDuration(elapsedForTeam(team, game)),
      ]);
    }
  }
  return toCsv(rows);
}

export function cleanupOldGames(): number {
  const cutoff = now() - config.retentionDays * 24 * 60 * 60 * 1000;
  const result = db.prepare('DELETE FROM games WHERE created_at < ?').run(cutoff);
  return Number(result.changes);
}

export function logEvent(
  gameId: string,
  teamId: string | null,
  playerId: string | null,
  type: string,
  payload?: unknown,
): void {
  db.prepare(
    'INSERT INTO events (id, game_id, team_id, player_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(randomId(), gameId, teamId, playerId, type, payload ? JSON.stringify(payload) : null, now());
}

export function getMessage(messageId: string): MessageRow | null {
  return (db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRow | undefined) ?? null;
}

export function getPlayerMessage(messageId: string): PlayerMessage | null {
  const row = getMessage(messageId);
  return row ? toPlayerMessage(row) : null;
}

export function getAdminMessage(messageId: string): AdminMessage | null {
  const row = getMessage(messageId);
  if (!row) return null;
  return toAdminMessage(row, getTeams(row.game_id));
}

export function getTeamMessages(teamId: string, limit = 80): MessageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE team_id = ? AND status IN ('approved','flagged')
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(teamId, limit) as unknown as MessageRow[];
  return rows.reverse();
}

export function getGameMessages(gameId: string, limit = 200): MessageRow[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE game_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(gameId, limit) as unknown as MessageRow[];
  return rows.reverse();
}

export function getRecentApprovedMessages(teamId: string, limit = 3): string[] {
  const rows = db
    .prepare(
      `SELECT body FROM messages
       WHERE team_id = ? AND status IN ('approved','flagged')
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(teamId, limit) as unknown as Array<{ body: string }>;
  return rows.map((r) => r.body).reverse();
}

export function insertPendingMessage(input: {
  gameId: string;
  teamId: string;
  playerId: string;
  authorName: string;
  body: string;
  clientId: string;
}): MessageRow {
  const id = randomId();
  const createdAt = now();
  db.prepare(
    `INSERT INTO messages (id, game_id, team_id, player_id, author_name, author_kind, body, status, client_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'player', ?, 'pending', ?, ?)`,
  ).run(id, input.gameId, input.teamId, input.playerId, input.authorName, input.body, input.clientId, createdAt);
  return getMessage(id) as MessageRow;
}

export function updateMessageModeration(
  messageId: string,
  status: MessageStatus,
  decision: ModerationDecision,
): MessageRow {
  db.prepare('UPDATE messages SET status = ?, moderation_json = ?, published_at = ? WHERE id = ?').run(
    status,
    JSON.stringify(decision),
    status === 'approved' || status === 'flagged' ? now() : null,
    messageId,
  );
  return getMessage(messageId) as MessageRow;
}

export function findMessageByClientId(teamId: string, clientId: string): MessageRow | null {
  return (
    (db.prepare('SELECT * FROM messages WHERE team_id = ? AND client_id = ?').get(teamId, clientId) as
      | MessageRow
      | undefined) ?? null
  );
}

export function getProgressMap(teamId: string): Record<string, RoomProgress> {
  const rows = db.prepare('SELECT * FROM progress WHERE team_id = ?').all(teamId) as unknown as ProgressRow[];
  const out: Record<string, RoomProgress> = {};
  for (const row of rows) {
    out[row.room_id] = {
      questions: parseQuestions(row.questions_json),
      attempts: row.attempts,
      hintUsed: row.hint_used === 1,
      solvedAt: row.solved_at,
    };
  }
  return out;
}

export function getQuizAnswers(playerId: string): Map<string, { choice: number; correct: boolean }> {
  const rows = db.prepare('SELECT * FROM quiz_answers WHERE player_id = ?').all(playerId) as unknown as QuizAnswerRow[];
  return new Map(rows.map((r) => [r.question_id, { choice: r.choice, correct: r.correct === 1 }]));
}

function countQuizAnswers(playerId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE player_id = ?').get(playerId) as { n: number };
  return row.n;
}

function countQuizScore(playerId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM quiz_answers WHERE player_id = ? AND correct = 1')
    .get(playerId) as { n: number };
  return row.n;
}

function getReports(gameId: string): ReportRow[] {
  return db
    .prepare(
      `SELECT r.*, p.name AS player_name, p.team_id AS team_id, t.name AS team_name
       FROM reports r
       JOIN players p ON p.id = r.player_id
       JOIN teams t ON t.id = p.team_id
       WHERE r.game_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(gameId) as unknown as ReportRow[];
}

function getOrCreateProgress(teamId: string, roomId: string): RoomProgress {
  const row = db
    .prepare('SELECT * FROM progress WHERE team_id = ? AND room_id = ?')
    .get(teamId, roomId) as ProgressRow | undefined;
  if (!row) {
    db.prepare(
      'INSERT INTO progress (team_id, room_id, questions_json, attempts, hint_used) VALUES (?, ?, ?, 0, 0)',
    ).run(teamId, roomId, '{}');
    return emptyProgress();
  }
  return {
    questions: parseQuestions(row.questions_json),
    attempts: row.attempts,
    hintUsed: row.hint_used === 1,
    solvedAt: row.solved_at,
  };
}

function emptyProgress(): RoomProgress {
  return { questions: {}, attempts: 0, hintUsed: false, solvedAt: null };
}

function parseQuestions(json: string): RoomProgress['questions'] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RoomProgress['questions'];
  } catch {
    return {};
  }
}

function elapsedForTeam(team: TeamRow, game: GameRow): number {
  if (!team.started_at) return 0;
  const end = team.finished_at ?? (game.status === 'paused' ? game.paused_at ?? now() : game.ended_at ?? now());
  return Math.max(0, end - team.started_at - team.paused_ms);
}

function insertSystemMessage(gameId: string, teamId: string, body: string): void {
  const id = randomId();
  const createdAt = now();
  db.prepare(
    `INSERT INTO messages (id, game_id, team_id, player_id, author_name, author_kind, body, status, created_at, published_at)
     VALUES (?, ?, ?, NULL, 'Système', 'system', ?, 'approved', ?, ?)`,
  ).run(id, gameId, teamId, body.slice(0, config.chat.maxLength), createdAt, createdAt);
}

function toPlayerMessage(row: MessageRow): PlayerMessage {
  return {
    id: row.id,
    authorName: row.author_name,
    authorKind: row.author_kind,
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
  };
}

function toAdminMessage(row: MessageRow, teams: TeamRow[]): AdminMessage {
  const team = teams.find((t) => t.id === row.team_id);
  let moderation: ModerationDecision | null = null;
  if (row.moderation_json) {
    try {
      moderation = JSON.parse(row.moderation_json) as ModerationDecision;
    } catch {
      moderation = null;
    }
  }
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: team?.name ?? '',
    playerId: row.player_id,
    authorName: row.author_name,
    authorKind: row.author_kind,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    moderation,
  };
}

function requireGame(gameId: string): GameRow {
  const game = getGame(gameId);
  if (!game) throw new Error('Partie inconnue.');
  return game;
}

function requireTeam(teamId: string): TeamRow {
  const team = getTeam(teamId);
  if (!team) throw new Error('Équipe inconnue.');
  return team;
}

function requirePlayingContext(gameId: string, teamId: string, playerId: string) {
  const game = requireGame(gameId);
  if (game.status !== 'live') throw new Error('La partie n’est pas en cours.');
  const team = requireTeam(teamId);
  if (team.game_id !== gameId) throw new Error('Équipe inconnue.');
  const player = getPlayerInGame(gameId, playerId);
  if (!player || player.team_id !== teamId || player.status !== 'active') throw new Error('Joueur inconnu.');
  if (!team.started_at) throw new Error('L’équipe n’a pas encore commencé.');
  if (team.finished_at) throw new Error('L’équipe a déjà terminé.');
  const scenario = scenarioForGame(game.scenario_json);
  if (team.current_room >= scenario.rooms.length) throw new Error('L’équipe est déjà au code final.');
  const room = scenario.rooms[team.current_room];
  if (!room) throw new Error('Salle inconnue.');
  return { game, team, player, scenario, room };
}

export { elapsedForTeam, findRoom };
export type { GameRow, TeamRow, PlayerRow, MessageRow };
