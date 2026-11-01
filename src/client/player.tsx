import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock,
  Flag,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type { PlayerMessage, PlayerState, PublicQuestion } from '../shared/types';
import type { BlockedMessage, PendingMessage } from './hooks';
import type { PlayerSocket } from './socket';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CodeInput,
  ConnectionDot,
  Divider,
  IconButton,
  Logo,
  Modal,
  Progress,
  Spinner,
  Stat,
  TeamChip,
  Textarea,
  ThemeToggle,
  ToastStack,
  type ToastItem,
} from './ui';
import { formatDuration, formatTime } from './format';
import { cn } from './utils';

function useElapsed(state: PlayerState): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const live = state.game.status === 'live' && Boolean(state.team.startedAt) && !state.team.finishedAt;
  return state.team.elapsedMs + (live ? Math.max(0, Date.now() - state.serverNow) : 0);
}

export interface PlayerGameProps {
  code: string;
  state: PlayerState;
  connected: boolean;
  connectionError: string | null;
  pending: PendingMessage[];
  blocked: BlockedMessage | null;
  setBlocked: (value: BlockedMessage | null) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  socket: PlayerSocket | null;
  sendMessage: (body: string) => void;
  reportMessage: (messageId: string) => void;
}

export function PlayerGame({
  code,
  state,
  connected,
  connectionError,
  pending,
  blocked,
  setBlocked,
  toasts,
  dismissToast,
  socket,
  sendMessage,
  reportMessage,
}: PlayerGameProps) {
  const elapsed = useElapsed(state);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const previousCount = useRef(state.messages.length);

  useEffect(() => {
    if (state.messages.length > previousCount.current && !chatOpen) {
      setUnread((current) => current + (state.messages.length - previousCount.current));
    }
    previousCount.current = state.messages.length;
  }, [state.messages.length, chatOpen]);

  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  useEffect(() => {
    document.title = `${state.team.name} — Vestiaire 7`;
    return () => {
      document.title = 'Vestiaire 7 — Escape game handball';
    };
  }, [state.team.name]);

  useEffect(() => {
    if (!state.quiz.available) setQuizOpen(false);
  }, [state.quiz.available]);

  const paused = state.game.status === 'paused';
  const ended = state.game.status === 'ended';
  const finished = Boolean(state.team.finishedAt);
  const showChat = !quizOpen;
  const quizAvailable = state.quiz.available;

  let main: ReactNode;
  if (quizOpen && quizAvailable) {
    main = <QuizView state={state} socket={socket} connected={connected} onClose={() => setQuizOpen(false)} />;
  } else if (finished) {
    main = <FinishedView state={state} onOpenQuiz={() => setQuizOpen(true)} />;
  } else if (ended) {
    main = <EndedView state={state} />;
  } else if (state.team.startedAt) {
    if (state.room) {
      main = <RoomView state={state} socket={socket} paused={paused} connected={connected} />;
    } else if (state.final.ready) {
      main = <FinalView state={state} socket={socket} paused={paused} connected={connected} />;
    } else {
      main = (
        <Card className="center-card">
          <Spinner label="Ouverture de la salle suivante" />
          <p>La salle suivante s’ouvre…</p>
        </Card>
      );
    }
  } else {
    main = <LobbyView state={state} socket={socket} connected={connected} />;
  }

  return (
    <div className={cn('player-shell', !showChat && 'no-chat')}>
      <div className="player-main">
        <GameHeader
          state={state}
          elapsed={elapsed}
          paused={paused}
          connected={connected}
          onHelp={() => setHelpOpen(true)}
        />
        {(!connected || connectionError) && (
          <div className="connection-banner" role="status">
            <WifiOff size={16} />
            <span>{connectionError ?? 'Reconnexion au serveur…'}</span>
          </div>
        )}
        {paused && !quizOpen ? (
          <div className="pause-banner" role="status">
            <span className="pause-icon">Ⅱ</span>
            <div>
              <strong>Partie en pause</strong>
              <p>Le professeur a suspendu le chrono. Le chat reste ouvert.</p>
            </div>
          </div>
        ) : null}
        {main}
      </div>

      {showChat ? (
        <ChatPanel
          state={state}
          messages={state.messages}
          pending={pending}
          blocked={blocked}
          onSend={sendMessage}
          onReport={reportMessage}
          onClearBlocked={() => setBlocked(null)}
          connected={connected}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      ) : null}

      {showChat && !chatOpen ? (
        <button
          type="button"
          className="chat-fab"
          aria-label="Ouvrir le chat"
          onClick={() => setChatOpen(true)}
        >
          <MessageCircle size={21} />
          {unread > 0 ? <span className="chat-fab-badge">{unread}</span> : null}
          <span className="chat-fab-label">Chat</span>
        </button>
      ) : null}

      <HelpModal state={state} code={code} open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function GameHeader({
  state,
  elapsed,
  paused,
  connected,
  onHelp,
}: {
  state: PlayerState;
  elapsed: number;
  paused: boolean;
  connected: boolean;
  onHelp: () => void;
}) {
  const roomLabel = state.team.finishedAt
    ? 'Terminé'
    : state.team.currentRoom >= state.team.totalRooms
      ? 'Code final'
      : `Salle ${state.team.currentRoom + 1}/${state.team.totalRooms}`;
  return (
    <header className="game-header">
      <div className="game-header-brand">
        <Logo compact />
        <TeamChip name={state.team.name} color={state.team.color} />
        {paused ? <Badge tone="warning">Pause</Badge> : null}
      </div>
      <div className="game-header-stats">
        <div className="header-stat">
          <span className="header-stat-label">
            <Clock size={13} /> Temps
          </span>
          <strong className="mono">{formatDuration(elapsed)}</strong>
        </div>
        <div className="header-stat">
          <span className="header-stat-label">
            <Trophy size={13} /> Score
          </span>
          <strong className="mono">{state.team.score}</strong>
        </div>
        <div className="header-stat header-stat-room">
          <span className="header-stat-label">
            <KeyRound size={13} /> Salle
          </span>
          <strong>{roomLabel}</strong>
        </div>
      </div>
      <div className="game-header-actions">
        <ConnectionDot connected={connected} label={connected ? 'En ligne' : 'Hors ligne'} />
        <IconButton label="Aide et règles" onClick={onHelp}>
          <CircleHelp size={18} />
        </IconButton>
        <ThemeToggle />
      </div>
    </header>
  );
}

function LobbyView({
  state,
  socket,
  connected,
}: {
  state: PlayerState;
  socket: PlayerSocket | null;
  connected: boolean;
}) {
  const active = state.players.filter((player) => player.status === 'active');
  const missing = active.filter((player) => !player.connected);
  const activeCount = active.length;
  const connectedCount = active.filter((player) => player.connected).length;
  const canStart = state.team.canStart && connected && Boolean(socket);
  const paused = state.game.status === 'paused';
  const ended = state.game.status === 'ended';
  const lobby = state.game.status === 'lobby';

  let gateTitle = 'Le coup d’envoi n’a pas encore été donné.';
  let gateText = 'Ton équipe est dans le salon. Le professeur va lancer la partie.';
  if (lobby) {
    gateTitle = 'En attente du professeur';
  } else if (paused) {
    gateTitle = 'Partie en pause';
    gateText = 'Le professeur a suspendu la partie. Profitez-en pour relire vos indices.';
  } else if (ended) {
    gateTitle = 'Partie terminée';
    gateText = 'Le professeur a clôturé la partie.';
  } else if (missing.length > 0) {
    gateTitle = `En attente de ${missing.map((player) => player.name).join(', ')}`;
    gateText = 'Toute l’équipe doit être connectée pour entrer dans le vestiaire.';
  } else if (state.team.canStart) {
    gateTitle = 'Tout le monde est là.';
    gateText = 'Le vestiaire est ouvert. Quand vous êtes prêts, entrez : le chrono démarre.';
  }

  return (
    <div className="lobby-layout">
      <Card className="briefing-card">
        <div className="briefing-top">
          <Badge tone="primary">Briefing</Badge>
          <Badge tone="neutral">{state.game.durationMinutes} min</Badge>
        </div>
        <p className="eyebrow">Vestiaire 7 · {state.game.subtitle}</p>
        <h1>{state.game.title}</h1>
        <Narrative text={state.game.intro} />
        <Divider />
        <h3 className="small-title">Les règles du jeu</h3>
        <ul className="rules-list">
          {state.game.rules.map((rule) => (
            <li key={rule}>
              <Check size={15} /> {rule}
            </li>
          ))}
        </ul>
      </Card>

      <div className="lobby-side">
        <Card className="team-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Ton équipe</p>
              <h2>{state.team.name}</h2>
            </div>
            <Badge tone="neutral">
              {activeCount} joueur{activeCount > 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="presence-line">
            <ConnectionDot connected={connectedCount === activeCount && activeCount > 0} />
            <strong>
              {connectedCount}/{activeCount} connecté{activeCount > 1 ? 's' : ''}
            </strong>
          </div>
          <ul className="roster-list">
            {state.players.map((player) => (
              <li key={player.id} className={cn('roster-row', player.isMe && 'is-me')}>
                <Avatar name={player.name} color={state.team.color} size="sm" />
                <span className="roster-name">
                  {player.name}
                  {player.isMe ? <span className="me-tag">toi</span> : null}
                </span>
                {player.status === 'absent' ? (
                  <Badge tone="neutral">Absent</Badge>
                ) : (
                  <ConnectionDot connected={player.connected} label={player.connected ? 'Connecté' : 'Hors ligne'} />
                )}
              </li>
            ))}
          </ul>
          <Divider />
          <div className="gate-box">
            <strong>{gateTitle}</strong>
            <p>{gateText}</p>
          </div>
          <Button
            size="lg"
            className="full-width"
            disabled={!canStart}
            loading={false}
            icon={<LockKeyhole size={18} />}
            onClick={() => socket?.emit('player:start')}
          >
            {state.team.canStart ? 'Entrer dans le vestiaire' : 'En attente de l’équipe'}
          </Button>
          <p className="fine-print">
            {activeCount === 0
              ? 'Aucun joueur actif dans cette équipe.'
              : `${activeCount} joueur${activeCount > 1 ? 's' : ''} attendu${activeCount > 1 ? 's' : ''} pour ouvrir la porte.`}
          </p>
        </Card>

        <Card className="chat-note-card">
          <div className="chat-note-icon">
            <MessageCircle size={18} />
          </div>
          <div>
            <strong>Le chat est votre seul lien</strong>
            <p>Chaque joueur reçoit un indice différent. Partagez-les dans le chat d’équipe. Jev vérifie chaque message avant sa publication.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RoomView({
  state,
  socket,
  paused,
  connected,
}: {
  state: PlayerState;
  socket: PlayerSocket | null;
  paused: boolean;
  connected: boolean;
}) {
  const room = state.room;
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const disabled = paused || !connected || !socket;
  const answeredKey = room ? room.questions.map((question) => (question.answeredCorrectly ? '1' : '0')).join('') : '';

  useEffect(() => {
    setPendingQuestion(null);
    setCode('');
  }, [room?.id, room?.attempts, answeredKey]);

  if (!room) return null;

  const answer = (question: PublicQuestion, option: number) => {
    if (!socket || disabled || pendingQuestion) return;
    setPendingQuestion(question.id);
    socket.emit('player:answer', { roomId: room.id, questionId: question.id, option });
    window.setTimeout(() => setPendingQuestion(null), 2500);
  };

  const submitCode = () => {
    if (!socket || disabled || !room.allQuestionsCorrect || code.length === 0) return;
    socket.emit('player:code', { roomId: room.id, code });
  };

  const useHintNow = () => {
    if (!socket || disabled || room.hint) return;
    socket.emit('player:hint', { roomId: room.id });
    setHintOpen(false);
  };

  return (
    <div className="room-layout">
      <div className="room-main">
        <div className="room-heading">
          <div>
            <p className="eyebrow">{room.subtitle}</p>
            <h1>{room.title}</h1>
          </div>
          <RoomProgress state={state} />
        </div>

        <Card className="narrative-card">
          <div className="narrative-mark" aria-hidden="true">
            <LockKeyhole size={22} />
          </div>
          <Narrative text={room.narrative} />
        </Card>

        <div className="question-list">
          {room.questions.map((question, index) => (
            <Card key={question.id} className={cn('question-card', question.answeredCorrectly && 'is-answered')}>
              <div className="question-head">
                <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                <h3>{question.prompt}</h3>
              </div>
              {question.answeredCorrectly ? (
                <div className="question-done">
                  <span className="question-done-icon">
                    <Check size={17} />
                  </span>
                  <div>
                    <strong>Bonne réponse</strong>
                    <p>{question.explanation}</p>
                  </div>
                </div>
              ) : (
                <div className="option-grid">
                  {question.options.map((option, optionIndex) => (
                    <button
                      key={option}
                      type="button"
                      className={cn('option-button', pendingQuestion === question.id && 'is-pending')}
                      disabled={disabled || Boolean(pendingQuestion)}
                      onClick={() => answer(question, optionIndex)}
                    >
                      <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        <Card className={cn('exit-card', room.allQuestionsCorrect ? 'is-unlocked' : 'is-locked')}>
          <div className="exit-head">
            <span className="exit-icon">{room.allQuestionsCorrect ? <KeyRound size={20} /> : <LockKeyhole size={20} />}</span>
            <div>
              <h3>{room.allQuestionsCorrect ? 'Le code de sortie' : 'Code de sortie verrouillé'}</h3>
              <p>{room.exitPrompt}</p>
            </div>
          </div>
          {room.allQuestionsCorrect ? (
            <div className="exit-form">
              <CodeInput value={code} onChange={setCode} length={1} numeric label="Code de sortie" />
              <Button onClick={submitCode} disabled={disabled || code.length === 0} icon={<KeyRound size={17} />}>
                Valider le code
              </Button>
            </div>
          ) : (
            <p className="fine-print">Répondez d’abord aux {room.questions.length} questions pour débloquer le code.</p>
          )}
        </Card>
      </div>

      <aside className="room-side">
        <Card className="clue-card">
          <div className="clue-head">
            <span className="clue-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="eyebrow">Privé</p>
              <h3>Tes indices</h3>
            </div>
          </div>
          <p className="fine-print">Seul toi vois ces indices. Les autres joueurs ont les leurs. Partage-les dans le chat.</p>
          <ul className="clue-list">
            {room.clues.map((clue) => (
              <li key={clue}>
                <span className="clue-bullet" aria-hidden="true" />
                {clue}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="hint-card">
          <div className="hint-head">
            <Zap size={18} />
            <h3>Coup de pouce</h3>
          </div>
          {room.hint ? (
            <div className="hint-revealed">
              <Badge tone="warning">Indice utilisé</Badge>
              <p>{room.hint}</p>
            </div>
          ) : (
            <>
              <p className="fine-print">
                Un indice du coach débloque la salle, mais coûte 20 points. Chaque mauvaise réponse coûte 5 points.
              </p>
              <Button
                variant="secondary"
                className="full-width"
                disabled={disabled}
                icon={<Zap size={16} />}
                onClick={() => setHintOpen(true)}
              >
                Demander un indice
              </Button>
            </>
          )}
        </Card>

        <Card className="team-mini-card">
          <p className="eyebrow">Ton équipe</p>
          <TeamChip name={state.team.name} color={state.team.color} />
          <div className="team-mini-stats">
            <span>
              <Trophy size={14} /> {state.team.score} pts
            </span>
            <span>
              <Users size={14} /> {state.players.filter((player) => player.status === 'active' && player.connected).length}/
              {state.players.filter((player) => player.status === 'active').length} en ligne
            </span>
          </div>
        </Card>
      </aside>

      <Modal
        open={hintOpen}
        onClose={() => setHintOpen(false)}
        title="Demander un coup de pouce ?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHintOpen(false)}>
              Annuler
            </Button>
            <Button onClick={useHintNow} icon={<Zap size={16} />}>
              Utiliser (−20 pts)
            </Button>
          </>
        }
      >
        <p>Le coach vous donne un indice pour cette salle. Cela coûte 20 points à l’équipe.</p>
        <p className="fine-print">L’indice restera visible dans la salle.</p>
      </Modal>
    </div>
  );
}

function FinalView({
  state,
  socket,
  paused,
  connected,
}: {
  state: PlayerState;
  socket: PlayerSocket | null;
  paused: boolean;
  connected: boolean;
}) {
  const [code, setCode] = useState('');
  const elapsed = useElapsed(state);
  const disabled = paused || !connected || !socket;
  return (
    <div className="final-layout">
      <Card className="final-card">
        <div className="final-mark" aria-hidden="true">
          <Trophy size={34} />
        </div>
        <p className="eyebrow">Dernière étape</p>
        <h1>Le cadenas du trophée</h1>
        <p className="final-prompt">{state.final.prompt}</p>
        <div className="digit-slots" aria-label="Chiffres récoltés">
          {state.final.digits.map((digit, index) => (
            <span key={index} className={cn('digit-slot', digit && 'is-filled')}>
              {digit ?? '?'}
            </span>
          ))}
        </div>
        <div className="final-form">
          <CodeInput value={code} onChange={setCode} length={5} numeric label="Code final à cinq chiffres" />
          <Button
            size="lg"
            disabled={disabled || code.length !== 5}
            icon={<Trophy size={18} />}
            onClick={() => socket?.emit('player:finalCode', { code })}
          >
            Ouvrir le trophée
          </Button>
        </div>
        <p className="fine-print">
          Les cinq chiffres ont été gagnés dans les cinq salles. Remettez-les dans l’ordre : vestiaire, table de marque,
          terrain, zone, coup franc.
        </p>
      </Card>
      <Card className="final-side">
        <p className="eyebrow">Votre parcours</p>
        <div className="final-stats">
          <Stat label="Score" value={state.team.score} tone="primary" />
          <Stat label="Temps" value={formatDuration(elapsed)} />
          <Stat label="Salles" value={`${state.team.currentRoom}/${state.team.totalRooms}`} />
        </div>
        <Divider />
        <p className="fine-print">Le chat reste ouvert pour vous organiser une dernière fois.</p>
      </Card>
    </div>
  );
}

function FinishedView({ state, onOpenQuiz }: { state: PlayerState; onOpenQuiz: () => void }) {
  const answered = state.quiz.questions.filter((question) => question.choice != null).length;
  const finalCode = state.final.digits.filter(Boolean).join('');
  return (
    <div className="finished-layout">
      <Card className="finished-hero">
        <div className="finished-confetti" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="finished-mark">
          <Trophy size={38} />
        </div>
        <Badge tone="success">Mission accomplie</Badge>
        <h1>Le trophée est ouvert.</h1>
        <p className="finished-success">{state.final.success ?? state.game.title}</p>
        <div className="finished-stats">
          <Stat label="Temps" value={formatDuration(state.team.elapsedMs)} tone="primary" />
          <Stat label="Score" value={`${state.team.score} pts`} />
          <Stat label="Code final" value={<span className="mono">{finalCode}</span>} />
        </div>
        <p className="fine-print">Bravo à toute l’équipe. Le professeur voit votre parcours et vos messages.</p>
      </Card>

      <Card className="quiz-invite">
        <div className="quiz-invite-head">
          <span className="quiz-invite-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <p className="eyebrow">Bilan individuel</p>
            <h2>{state.quiz.finished ? 'Ton quiz est terminé' : 'À toi de jouer'}</h2>
          </div>
        </div>
        <p>{state.quiz.intro}</p>
        <div className="quiz-progress-line">
          <span>
            {answered}/{state.quiz.questions.length} réponses
          </span>
          {state.quiz.finished ? <Badge tone="success">Score : {state.quiz.score}/5</Badge> : null}
        </div>
        <Progress value={answered} max={state.quiz.questions.length} />
        <Button
          size="lg"
          className="full-width"
          icon={state.quiz.finished ? <Check size={18} /> : <ArrowRight size={18} />}
          onClick={onOpenQuiz}
        >
          {state.quiz.finished
            ? 'Voir mes réponses'
            : answered > 0
              ? 'Reprendre mon quiz'
              : 'Commencer mon quiz'}
        </Button>
        <p className="fine-print">Ce quiz est individuel : réponds seul. Ton professeur voit ton score.</p>
      </Card>
    </div>
  );
}

function EndedView({ state }: { state: PlayerState }) {
  return (
    <Card className="ended-card">
      <div className="ended-mark">
        <LockKeyhole size={30} />
      </div>
      <Badge tone="neutral">Partie terminée</Badge>
      <h1>Le professeur a clôturé la partie.</h1>
      <p>Votre équipe n’a pas atteint le trophée cette fois-ci, mais le parcours compte : vous avez récolté des indices et coopéré.</p>
      <div className="ended-stats">
        <Stat label="Salles" value={`${state.team.currentRoom}/${state.team.totalRooms}`} />
        <Stat label="Score" value={`${state.team.score} pts`} />
        <Stat label="Temps" value={formatDuration(state.team.elapsedMs)} />
      </div>
      <p className="fine-print">Le chat reste visible en lecture seule.</p>
    </Card>
  );
}

function QuizView({
  state,
  socket,
  connected,
  onClose,
}: {
  state: PlayerState;
  socket: PlayerSocket | null;
  connected: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const questions = state.quiz.questions;
  const current = questions[index];
  const answered = questions.filter((question) => question.choice != null).length;
  const finished = state.quiz.finished;
  const score = state.quiz.score ?? questions.filter((question) => question.correct).length;
  const disabled = !connected || !socket || finished || pending;

  useEffect(() => {
    setPending(false);
  }, [current?.choice]);

  useEffect(() => {
    if (index > questions.length - 1) setIndex(Math.max(0, questions.length - 1));
  }, [index, questions.length]);

  const choose = (option: number) => {
    if (!socket || !current || disabled) return;
    setPending(true);
    socket.emit('player:quizAnswer', { questionId: current.id, option });
    window.setTimeout(() => setPending(false), 2500);
  };

  return (
    <div className="quiz-layout">
      <div className="quiz-top">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={onClose}>
          {finished ? 'Retour au bilan' : 'Plus tard'}
        </Button>
        <div className="quiz-top-right">
          <Badge tone="info">Quiz individuel</Badge>
          {finished ? <Badge tone="success">{score}/5</Badge> : null}
        </div>
      </div>

      {finished ? (
        <Card className="quiz-finished">
          <div className="quiz-finished-mark">
            <Sparkles size={26} />
          </div>
          <p className="eyebrow">Bilan individuel</p>
          <h1>{score}/5</h1>
          <p>
            {score >= 4
              ? 'Très solide : tu maîtrises les règles clés du handball.'
              : score >= 2
                ? 'Bien joué : quelques règles à revoir, le débrief du prof t’aidera.'
                : 'C’est un point de départ : relis les règles avec ton équipe.'}
          </p>
          <Progress value={score} max={5} tone={score >= 4 ? 'success' : 'primary'} />
        </Card>
      ) : (
        <Card className="quiz-card">
          <div className="quiz-progress">
            <span>
              Question {index + 1}/{questions.length}
            </span>
            <span>{answered}/{questions.length} réponses</span>
          </div>
          <Progress value={answered} max={questions.length} />
          {current ? (
            <>
              <h2>{current.prompt}</h2>
              <div className="option-grid">
                {current.options.map((option, optionIndex) => {
                  const answeredQuestion = current.choice != null;
                  const isChosen = current.choice === optionIndex;
                  const isCorrect = current.correctOption === optionIndex;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={cn(
                        'option-button',
                        answeredQuestion && isChosen && current.correct && 'is-correct',
                        answeredQuestion && isChosen && current.correct === false && 'is-wrong',
                        answeredQuestion && !isChosen && isCorrect && 'is-correct-answer',
                        pending && 'is-pending',
                      )}
                      disabled={disabled || answeredQuestion}
                      onClick={() => choose(optionIndex)}
                    >
                      <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                      <span>{option}</span>
                      {answeredQuestion && isCorrect ? <Check size={16} /> : null}
                    </button>
                  );
                })}
              </div>
              {current.choice != null ? (
                <div className={cn('quiz-feedback', current.correct ? 'is-correct' : 'is-wrong')}>
                  <strong>{current.correct ? 'Bonne réponse' : 'Pas tout à fait'}</strong>
                  <p>{current.explanation}</p>
                </div>
              ) : (
                <p className="fine-print">Choisis une réponse. Tu ne pourras plus la modifier.</p>
              )}
            </>
          ) : null}
          <div className="quiz-nav">
            <Button
              variant="ghost"
              icon={<ArrowLeft size={16} />}
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              Précédent
            </Button>
            <Button
              icon={index === questions.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}
              disabled={!current || current.choice == null}
              onClick={() => {
                if (index === questions.length - 1) {
                  if (state.quiz.finished) onClose();
                  else setIndex(index);
                } else {
                  setIndex((value) => Math.min(questions.length - 1, value + 1));
                }
              }}
            >
              {index === questions.length - 1 ? 'Voir mon score' : 'Suivant'}
            </Button>
          </div>
          {answered === questions.length && !state.quiz.finished ? (
            <p className="fine-print">Tes réponses sont enregistrées. Le score se met à jour…</p>
          ) : null}
        </Card>
      )}

      {finished ? (
        <Card className="quiz-review">
          <h3>Revois tes réponses</h3>
          <div className="quiz-review-list">
            {questions.map((question, questionIndex) => (
              <button
                key={question.id}
                type="button"
                className={cn('quiz-review-item', questionIndex === index && 'is-active')}
                onClick={() => setIndex(questionIndex)}
              >
                <span className={cn('quiz-review-dot', question.correct ? 'is-correct' : 'is-wrong')}>
                  {question.correct ? <Check size={13} /> : <X size={13} />}
                </span>
                <span>
                  Question {questionIndex + 1} · {question.prompt}
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {current ? (
            <div className="quiz-review-detail">
              <h4>{current.prompt}</h4>
              <ul className="quiz-review-options">
                {current.options.map((option, optionIndex) => (
                  <li
                    key={option}
                    className={cn(
                      current.choice === optionIndex && 'is-chosen',
                      current.correctOption === optionIndex && 'is-correct',
                    )}
                  >
                    {option}
                    {current.choice === optionIndex ? ' · ta réponse' : ''}
                    {current.correctOption === optionIndex ? ' · bonne réponse' : ''}
                  </li>
                ))}
              </ul>
              <p className="fine-print">{current.explanation}</p>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function ChatPanel({
  state,
  messages,
  pending,
  blocked,
  onSend,
  onReport,
  onClearBlocked,
  connected,
  open,
  onClose,
}: {
  state: PlayerState;
  messages: PlayerMessage[];
  pending: PendingMessage[];
  blocked: BlockedMessage | null;
  onSend: (body: string) => void;
  onReport: (messageId: string) => void;
  onClearBlocked: () => void;
  connected: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ended = state.game.status === 'ended';
  const muted = Boolean(state.me.mutedUntil && state.me.mutedUntil > Date.now());
  const allowed = connected && !ended && !muted;

  useEffect(() => {
    if (blocked?.body) {
      setInput(blocked.body);
      inputRef.current?.focus();
    }
  }, [blocked?.clientId, blocked?.body]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, pending.length, blocked?.clientId]);

  const send = () => {
    const clean = input.trim();
    if (!clean || !allowed) return;
    onSend(clean);
    setInput('');
    onClearBlocked();
  };

  return (
    <aside className={cn('chat-panel', open && 'is-open')} aria-label="Chat d’équipe">
      <header className="chat-head">
        <div>
          <div className="chat-title-line">
            <MessageCircle size={17} />
            <h2>Chat d’équipe</h2>
          </div>
          <p>{state.team.name}</p>
        </div>
        <div className="chat-head-actions">
          <Badge tone="info">
            <ShieldCheck size={13} /> Jev veille
          </Badge>
          <IconButton label="Comment fonctionne le chat ?" size="sm" onClick={() => setInfoOpen(true)}>
            <CircleHelp size={16} />
          </IconButton>
          <IconButton label="Fermer le chat" size="sm" className="chat-close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef} aria-live="polite">
        {messages.length === 0 && pending.length === 0 ? (
          <div className="chat-empty">
            <MessageCircle size={22} />
            <strong>Le chat est ouvert.</strong>
            <p>Partagez vos indices, encouragez-vous. C’est votre seul moyen de coopérer.</p>
          </div>
        ) : null}
        {messages.map((message) => {
          if (message.authorKind === 'system') {
            return (
              <div key={message.id} className="chat-system">
                <span>{message.body}</span>
              </div>
            );
          }
          if (message.authorKind === 'coach') {
            return (
              <div key={message.id} className="chat-message chat-coach">
                <span className="coach-mark">
                  <Zap size={15} />
                </span>
                <div>
                  <div className="chat-meta">
                    <strong>Coach</strong>
                    <Badge tone="coach">Message du prof</Badge>
                    <time>{formatTime(message.createdAt)}</time>
                  </div>
                  <p>{message.body}</p>
                </div>
              </div>
            );
          }
          const isMe = message.authorName === state.me.name;
          return (
            <div key={message.id} className={cn('chat-message', isMe && 'is-me')}>
              <Avatar name={message.authorName} color={state.team.color} size="sm" />
              <div>
                <div className="chat-meta">
                  <strong>{isMe ? 'Toi' : message.authorName}</strong>
                  <time>{formatTime(message.createdAt)}</time>
                  {!isMe ? (
                    <button
                      type="button"
                      className="chat-report"
                      aria-label="Signaler ce message au professeur"
                      title="Signaler au professeur"
                      onClick={() => onReport(message.id)}
                    >
                      <Flag size={13} />
                    </button>
                  ) : null}
                </div>
                <p>{message.body}</p>
              </div>
            </div>
          );
        })}
        {pending.map((message) => (
          <div key={message.clientId} className="chat-message is-me is-pending">
            <Avatar name={state.me.name} color={state.team.color} size="sm" />
            <div>
              <div className="chat-meta">
                <strong>Toi</strong>
                <span className="chat-checking">
                  <Spinner size="sm" /> Jev vérifie…
                </span>
              </div>
              <p>{message.body}</p>
            </div>
          </div>
        ))}
      </div>

      {blocked ? (
        <div className="chat-blocked" role="alert">
          <strong>Message non envoyé</strong>
          <p>{blocked.reason}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setInput(blocked.body);
              onClearBlocked();
              inputRef.current?.focus();
            }}
          >
            Réécrire
          </Button>
        </div>
      ) : null}

      <div className="chat-composer">
        {muted ? (
          <p className="chat-lock-note">
            Tu es en sourdine jusqu’à {state.me.mutedUntil ? formatTime(state.me.mutedUntil) : '—'}.
          </p>
        ) : ended ? (
          <p className="chat-lock-note">La partie est terminée : le chat est fermé.</p>
        ) : !connected ? (
          <p className="chat-lock-note">Reconnexion au serveur…</p>
        ) : null}
        <div className="chat-input-row">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 400))}
            placeholder={allowed ? 'Écris à ton équipe…' : 'Chat indisponible'}
            rows={2}
            maxLength={400}
            disabled={!allowed}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            aria-label="Message à envoyer"
          />
          <Button
            className="chat-send"
            aria-label="Envoyer le message"
            disabled={!allowed || input.trim().length === 0}
            onClick={send}
            icon={<Send size={17} />}
          >
            <span className="chat-send-label">Envoyer</span>
          </Button>
        </div>
        <div className="chat-footer">
          <span>Jev vérifie avant publication. Ton prof peut lire le chat.</span>
          <span>{input.length}/400</span>
        </div>
      </div>

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Le chat et Jev">
        <div className="prose">
          <p>
            Le chat est le seul endroit où circulent les indices. Chaque joueur voit un indice différent : pour avancer,
            il faut se parler.
          </p>
          <p>
            Chaque message passe par <strong>Jev</strong>, un modèle de décision qui vérifie le respect, les menaces et
            les données personnelles avant publication. Si un message est bloqué, tu peux le reformuler.
          </p>
          <p>
            Le professeur peut lire le chat et intervenir. Un bouton <Flag size={13} /> permet de signaler un message.
          </p>
        </div>
      </Modal>
    </aside>
  );
}

function HelpModal({
  state,
  code,
  open,
  onClose,
}: {
  state: PlayerState;
  code: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Comment jouer" wide>
      <div className="help-grid">
        <section>
          <h3>Le but</h3>
          <p>
            Traversez les {state.team.totalRooms} salles du {state.game.title} et retrouvez le code du trophée. Chaque
            salle donne un chiffre.
          </p>
          <h3>Les indices</h3>
          <p>
            Chaque joueur reçoit un indice privé différent. Personne ne peut résoudre seul : partagez vos indices dans le
            chat d’équipe.
          </p>
        </section>
        <section>
          <h3>Le chat</h3>
          <p>
            Jev vérifie chaque message avant sa publication. Le professeur peut lire le chat. Les messages bloqués ne
            sont jamais montrés à l’équipe.
          </p>
          <h3>Les points</h3>
          <p>Une salle rapporte 100 points. Un coup de pouce coûte 20 points, une mauvaise réponse 5 points.</p>
        </section>
      </div>
      <Divider />
      <div className="help-footer">
        <span className="mono">Partie {code}</span>
        <span className="fine-print">Durée indicative : {state.game.durationMinutes} minutes</span>
      </div>
    </Modal>
  );
}

function RoomProgress({ state }: { state: PlayerState }) {
  return (
    <div className="room-progress" aria-label="Progression dans les salles">
      {Array.from({ length: state.team.totalRooms }, (_, index) => {
        const done = index < state.team.currentRoom;
        const current = index === state.team.currentRoom;
        return (
          <span key={index} className={cn('room-step', done && 'is-done', current && 'is-current')}>
            {done ? <Check size={12} /> : index + 1}
          </span>
        );
      })}
    </div>
  );
}

function Narrative({ text }: { text: string }) {
  return (
    <div className="narrative">
      {text.split(/\n\n+/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
