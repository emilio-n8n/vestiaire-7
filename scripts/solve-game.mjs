import { io } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const CODE = (process.env.CODE ?? 'LBJKEQ').toUpperCase();
const PIN = process.env.PIN ?? '8735';
const TEAM = process.env.TEAM ?? 'Les Ailiers';
const PLAYER = process.env.PLAYER ?? 'Noah';

const ROOMS = {
  vestiaire: { questions: { v1: 1, v2: 1 }, code: '3' },
  'table-de-marque': { questions: { t1: 1, t2: 1 }, code: '2' },
  terrain: { questions: { p1: 2, p2: 1 }, code: '7' },
  zone: { questions: { z1: 1, z2: 0 }, code: '6' },
  'coup-franc': { questions: { c1: 2, c2: 1 }, code: '9' },
};
const QUIZ = { f1: 1, f2: 0, f3: 1, f4: 0, f5: 1 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rosterResponse = await fetch(`${BASE}/api/games/${CODE}/roster`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin: PIN }),
});
const roster = await rosterResponse.json();
const team = roster.teams.find((item) => item.name === TEAM);
const player = team?.players.find((item) => item.name === PLAYER && item.status === 'active');
if (!team || !player) {
  console.error('player/team not found');
  process.exit(1);
}

let joined = null;
for (let attempt = 0; attempt < 8; attempt += 1) {
  const response = await fetch(`${BASE}/api/games/${CODE}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: PIN, playerId: player.id }),
  });
  if (response.ok) {
    joined = await response.json();
    break;
  }
  if (response.status === 409) {
    console.log('player still connected, waiting for presence grace…');
    await sleep(3000);
    continue;
  }
  console.error('join failed', response.status, await response.text());
  process.exit(1);
}
if (!joined) {
  console.error('could not join');
  process.exit(1);
}

const socket = io(BASE, {
  auth: { role: 'player', gameCode: CODE, playerId: player.id, token: joined.token },
  transports: ['websocket', 'polling'],
});

let busy = false;
let finishedLogged = false;
let finishMessageSent = false;
let lastRoom = null;

socket.on('connect', () => console.log(`[${PLAYER}] connected`));
socket.on('connect_error', (error) => console.log('connect_error', error.message));
socket.on('toast', (payload) => console.log('toast', payload.type, payload.message));
socket.on('message', (message) => console.log('message', message.authorName, ':', message.body));
socket.on('message:blocked', (payload) => console.log('blocked', payload.reason));

socket.on('state', (state) => {
  if (state.team.finishedAt) {
    if (!finishedLogged) {
      finishedLogged = true;
      console.log(`FINISHED time=${state.team.elapsedMs}ms score=${state.team.score}`);
      if (!finishMessageSent) {
        finishMessageSent = true;
        setTimeout(() => {
          socket.emit('player:message', {
            body: "On a ouvert le trophée ! Bravo l'équipe !",
            clientId: 'solve-finish-1',
          });
        }, 400);
      }
    }
    if (state.quiz.available && !state.quiz.finished && !busy) {
      const question = state.quiz.questions.find((item) => item.choice == null);
      if (question) {
        busy = true;
        setTimeout(() => {
          socket.emit('player:quizAnswer', { questionId: question.id, option: QUIZ[question.id] });
          busy = false;
        }, 300);
      }
    }
    return;
  }

  if (state.game.status !== 'live' || !state.team.startedAt || busy) return;

  if (state.room) {
    if (state.room.id !== lastRoom) {
      lastRoom = state.room.id;
      console.log(`ROOM ${state.room.id} (${state.room.title})`);
    }
    const answers = ROOMS[state.room.id];
    if (!answers) return;
    const unanswered = state.room.questions.find((item) => !item.answeredCorrectly);
    if (unanswered) {
      busy = true;
      const option = answers.questions[unanswered.id];
      setTimeout(() => {
        socket.emit('player:answer', {
          roomId: state.room.id,
          questionId: unanswered.id,
          option,
        });
        busy = false;
      }, 250);
      return;
    }
    if (state.room.allQuestionsCorrect) {
      busy = true;
      setTimeout(() => {
        socket.emit('player:code', { roomId: state.room.id, code: answers.code });
        busy = false;
      }, 250);
    }
    return;
  }

  if (state.final.ready && !state.final.solved) {
    busy = true;
    setTimeout(() => {
      socket.emit('player:finalCode', { code: '32769' });
      busy = false;
    }, 250);
  }
});

setTimeout(() => {
  console.log('solve script exit');
  socket.disconnect();
  process.exit(0);
}, 8 * 60 * 1000);
