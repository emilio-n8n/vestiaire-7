export type GameStatus = 'draft' | 'lobby' | 'live' | 'paused' | 'ended';
export type PlayerStatus = 'active' | 'absent';
export type MessageStatus = 'pending' | 'approved' | 'flagged' | 'blocked' | 'hidden';
export type AuthorKind = 'player' | 'coach' | 'system';
export type TeamColor = 'orange' | 'blue' | 'green' | 'yellow';

export interface PublicQuestion {
  id: string;
  prompt: string;
  options: string[];
  answeredCorrectly: boolean;
  explanation: string | null;
}

export interface PublicRoom {
  index: number;
  id: string;
  title: string;
  subtitle: string;
  narrative: string;
  questions: PublicQuestion[];
  exitPrompt: string;
  allQuestionsCorrect: boolean;
  hint: string | null;
  clues: string[];
  attempts: number;
}

export interface PlayerMessage {
  id: string;
  authorName: string;
  authorKind: AuthorKind;
  body: string;
  createdAt: number;
  status: MessageStatus;
}

export interface QuizQuestionState {
  id: string;
  prompt: string;
  options: string[];
  choice: number | null;
  correct: boolean | null;
  correctOption: number | null;
  explanation: string | null;
}

export interface PlayerState {
  serverNow: number;
  game: {
    code: string;
    title: string;
    subtitle: string;
    status: GameStatus;
    durationMinutes: number;
    intro: string;
    rules: string[];
  };
  team: {
    id: string;
    name: string;
    color: TeamColor;
    score: number;
    startedAt: number | null;
    finishedAt: number | null;
    elapsedMs: number;
    currentRoom: number;
    totalRooms: number;
    finalCodeOk: boolean;
    canStart: boolean;
  };
  me: {
    id: string;
    name: string;
    teamId: string;
    quizScore: number | null;
    quizFinishedAt: number | null;
    mutedUntil: number | null;
  };
  players: Array<{
    id: string;
    name: string;
    status: PlayerStatus;
    connected: boolean;
    isMe: boolean;
  }>;
  room: PublicRoom | null;
  final: {
    ready: boolean;
    prompt: string;
    digits: Array<string | null>;
    solved: boolean;
    success: string | null;
  };
  messages: PlayerMessage[];
  quiz: {
    available: boolean;
    intro: string;
    questions: QuizQuestionState[];
    score: number | null;
    finished: boolean;
  };
}

export interface ModerationDecision {
  action: 'allow' | 'flag' | 'block';
  category: string;
  categories: string[];
  severity: number;
  confidence: number;
  respect: number | null;
  entraide: number | null;
  source: 'jev' | 'local' | 'fallback';
  reason: string | null;
  flagged: boolean;
  raw?: unknown;
}

export interface AdminMessage {
  id: string;
  teamId: string;
  teamName: string;
  playerId: string | null;
  authorName: string;
  authorKind: AuthorKind;
  body: string;
  status: MessageStatus;
  createdAt: number;
  publishedAt: number | null;
  moderation: ModerationDecision | null;
}

export interface AdminPlayer {
  id: string;
  name: string;
  status: PlayerStatus;
  connected: boolean;
  quizScore: number | null;
  quizFinishedAt: number | null;
  lastSeen: number | null;
  mutedUntil: number | null;
  quizAnswers: number;
}

export interface AdminTeam {
  id: string;
  name: string;
  color: TeamColor;
  score: number;
  currentRoom: number;
  totalRooms: number;
  startedAt: number | null;
  finishedAt: number | null;
  elapsedMs: number;
  canStart: boolean;
  finalCodeOk: boolean;
  players: AdminPlayer[];
  progress: Array<{
    roomId: string;
    solvedAt: number | null;
    attempts: number;
    hintUsed: boolean;
    correctQuestions: string[];
  }>;
}

export interface AdminState {
  serverNow: number;
  game: {
    id: string;
    code: string;
    pin: string;
    title: string;
    status: GameStatus;
    createdAt: number;
    openedAt: number | null;
    launchedAt: number | null;
    endedAt: number | null;
    scenario: {
      id: string;
      title: string;
      subtitle: string;
      durationMinutes: number;
      rooms: Array<{ id: string; title: string; subtitle: string; exitCode: string }>;
      finalCode: string;
      finalQuiz: Array<{
        id: string;
        prompt: string;
        options: string[];
        correct: number;
        explanation: string;
      }>;
    };
  };
  teams: AdminTeam[];
  messages: AdminMessage[];
  reports: Array<{
    id: string;
    messageId: string;
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    createdAt: number;
    resolved: boolean;
  }>;
  jev: {
    enabled: boolean;
    model: string;
    status: 'ok' | 'degraded' | 'local' | 'error';
    lastError: string | null;
    lastLatencyMs: number | null;
    calls: number;
  };
  stats: {
    playersTotal: number;
    playersConnected: number;
    messages: number;
    blocked: number;
    flagged: number;
    reports: number;
  };
  solution: {
    rooms: Array<{
      id: string;
      title: string;
      exitCode: string;
      questions: Array<{ id: string; prompt: string; correct: number; correctText: string }>;
    }>;
    finalCode: string;
  };
}

export interface GameListItem {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  createdAt: number;
  teams: number;
  players: number;
  connected: number;
}

export interface CreateGameInput {
  title: string;
  teams: Array<{
    name: string;
    color: TeamColor;
    players: string[];
  }>;
}

export interface RosterResponse {
  game: {
    code: string;
    title: string;
    status: GameStatus;
  };
  teams: Array<{
    id: string;
    name: string;
    color: TeamColor;
    players: Array<{
      id: string;
      name: string;
      status: PlayerStatus;
      connected: boolean;
    }>;
  }>;
}

export interface JoinResponse {
  token: string;
  player: {
    id: string;
    name: string;
    teamId: string;
    teamName: string;
    teamColor: TeamColor;
  };
  game: {
    code: string;
    title: string;
    status: GameStatus;
  };
}

export interface PlayerToServerEvents {
  'player:start': () => void;
  'player:answer': (payload: { roomId: string; questionId: string; option: number }) => void;
  'player:code': (payload: { roomId: string; code: string }) => void;
  'player:finalCode': (payload: { code: string }) => void;
  'player:hint': (payload: { roomId: string }) => void;
  'player:message': (payload: { body: string; clientId: string }) => void;
  'player:quizAnswer': (payload: { questionId: string; option: number }) => void;
  'player:report': (payload: { messageId: string }) => void;
}

export interface ServerToPlayerEvents {
  state: (state: PlayerState) => void;
  message: (message: PlayerMessage & { clientId?: string }) => void;
  'message:hidden': (payload: { messageId: string }) => void;
  'message:blocked': (payload: { clientId: string; reason: string; category: string }) => void;
  'message:pending': (payload: { clientId: string; body: string; createdAt: number }) => void;
  toast: (payload: { type: 'success' | 'error' | 'info'; message: string }) => void;
  'session:released': (payload: { message: string }) => void;
  'game:deleted': () => void;
}

export interface AdminToServerEvents {
  'admin:subscribe': (payload: { gameId: string }) => void;
}

export interface ServerToAdminEvents {
  'admin:state': (state: AdminState) => void;
  'admin:message': (message: AdminMessage) => void;
  'admin:report': (payload: AdminState['reports'][number]) => void;
  'admin:toast': (payload: { type: 'success' | 'error' | 'info'; message: string }) => void;
  'game:deleted': () => void;
}

export type AnyClientToServerEvents = PlayerToServerEvents & AdminToServerEvents;
export type AnyServerToClientEvents = ServerToPlayerEvents & ServerToAdminEvents;
