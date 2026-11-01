import { io } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const CODE = (process.env.CODE ?? 'LBJKEQ').toUpperCase();
const PIN = process.env.PIN ?? '8735';
const TEAM = process.env.TEAM ?? 'Les Ailiers';
const SKIP = process.env.SKIP ?? 'Lina';

const rosterResponse = await fetch(`${BASE}/api/games/${CODE}/roster`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin: PIN }),
});
if (!rosterResponse.ok) {
  console.error('roster failed', rosterResponse.status, await rosterResponse.text());
  process.exit(1);
}
const roster = await rosterResponse.json();
const team = roster.teams.find((item) => item.name === TEAM);
if (!team) {
  console.error('team not found', roster.teams.map((item) => item.name));
  process.exit(1);
}

const sockets = [];
for (const player of team.players.filter((item) => item.name !== SKIP && item.status === 'active')) {
  const joinResponse = await fetch(`${BASE}/api/games/${CODE}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: PIN, playerId: player.id }),
  });
  if (!joinResponse.ok) {
    console.error('join failed', player.name, joinResponse.status, await joinResponse.text());
    continue;
  }
  const joined = await joinResponse.json();
  const socket = io(BASE, {
    auth: { role: 'player', gameCode: CODE, playerId: player.id, token: joined.token },
    transports: ['websocket', 'polling'],
  });
  socket.on('connect', () => console.log(`[${player.name}] connected`));
  socket.on('connect_error', (error) => console.log(`[${player.name}] connect_error ${error.message}`));
  socket.on('state', (state) => {
    console.log(
      `[${player.name}] status=${state.game.status} canStart=${state.team.canStart} started=${Boolean(
        state.team.startedAt,
      )} room=${state.team.currentRoom} score=${state.team.score} messages=${state.messages.length}`,
    );
  });
  socket.on('toast', (payload) => console.log(`[${player.name}] toast ${payload.type}: ${payload.message}`));
  socket.on('message', (message) => console.log(`[${player.name}] message ${message.authorName}: ${message.body}`));
  socket.on('message:blocked', (payload) => console.log(`[${player.name}] BLOCKED: ${payload.reason}`));
  sockets.push({ player, socket });
}

setTimeout(() => {
  const noah = sockets.find(({ player }) => player.name === 'Noah');
  if (!noah) return;
  noah.socket.emit('player:message', {
    body: "T'es nul, dégage de l'équipe",
    clientId: 'sim-bad-1',
  });
  setTimeout(() => {
    noah.socket.emit('player:message', {
      body: 'Lina, partage ton indice !',
      clientId: 'sim-good-1',
    });
  }, 3500);
}, 3000);

setTimeout(() => {
  console.log('simulation terminée');
  for (const { socket } of sockets) socket.disconnect();
  process.exit(0);
}, 15 * 60 * 1000);
