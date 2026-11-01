import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
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
import type { FocusState, PlayerMessage, PlayerState, PublicQuestion } from '../shared/types';
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
  Input,
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

function useFocusGuard(socket: PlayerSocket | null, roomId: string, enabled: boolean, active: boolean) {
  useEffect(() => {
    if (!socket || !enabled || !active) return;
    const lost = () => socket.emit('player:focus', { roomId, state: 'lost' });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') lost();
    };
    const onBlur = () => lost();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    const interval = window.setInterval(() => {
      socket.emit('player:focus', { roomId, state: 'heartbeat' });
    }, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.clearInterval(interval);
    };
  }, [socket, roomId, enabled, active]);
}

function FocusGate({
  focus,
  names,
  teamColor,
  socket,
  roomId,
  label,
  disabled,
}: {
  focus: FocusState | null;
  names: Record<string, string>;
  teamColor: string;
  socket: PlayerSocket | null;
  roomId: string;
  label: string;
  disabled: boolean;
}) {
  if (!focus?.required) return null;
  const ready = new Set(focus.ready);
  return (
    <Card className={cn('focus-gate', focus.active && 'is-active')}>
      <div className="focus-gate-head">
        <span className="focus-gate-icon">
          <LockKeyhole size={19} />
        </span>
        <div>
          <p className="eyebrow">Mode verrouillé</p>
          <h3>{label}</h3>
        </div>
        <Badge tone={focus.active ? 'success' : 'warning'}>
          {focus.active ? 'Actif' : `${focus.ready.length}/${focus.total} prêts`}
        </Badge>
      </div>
      <p className="fine-print">
        {focus.active
          ? 'Tout le monde est prêt. Restez sur cet écran : si un joueur le quitte, la salle se réinitialise.'
          : 'Tous les joueurs actifs doivent rester sur l’écran. Cliquez sur « Je suis prêt » ; la salle s’ouvre quand toute l’équipe est prête.'}
      </p>
      {focus.lostBy ? (
        <div className="focus-lost" role="alert">
          <AlertTriangle size={15} />
          <span>{focus.lostBy} a quitté l’écran : la salle a été réinitialisée. Reprenez ensemble.</span>
        </div>
      ) : null}
      <div className="focus-ready-list">
        {Object.entries(names).map(([id, name]) => (
          <span key={id} className={cn('focus-player', ready.has(id) && 'is-ready')}>
            <Avatar name={name} color={teamColor} size="sm" />
            <span>{name}</span>
            {ready.has(id) ? <Check size={14} /> : <span className="fine-print">en attente</span>}
          </span>
        ))}
      </div>
      {!focus.active ? (
        <Button
          onClick={() => socket?.emit('player:focus', { roomId, state: 'start' })}
          disabled={disabled}
          icon={<LockKeyhole size={16} />}
        >
          Je suis prêt
        </Button>
      ) : (
        <p className="focus-active-note">
          <Check size={14} /> Verrouillage actif — le chrono continue.
        </p>
      )}
    </Card>
  );
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
        <Badge tone="neutral">
          Séance {state.game.session}/{state.game.sessionCount}
        </Badge>
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
          <div className="briefing-badges">
            <Badge tone="neutral">
              {state.game.sessionCount} séances · {state.game.durationMinutes} min
            </Badge>
            <Badge tone="neutral">{state.team.totalRooms} salles</Badge>
          </div>
        </div>
        <p className="eyebrow">Vestiaire 7 · {state.game.subtitle}</p>
        <h1>{state.game.title}</h1>
        <Narrative text={state.game.intro} />
        <div className="session-strip">
          {state.game.sessionTitles.map((title, index) => (
            <span
              key={title}
              className={cn('session-chip', index + 1 === state.game.session && 'is-current')}
            >
              {title}
            </span>
          ))}
        </div>
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

function ResearchCard({
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
  const research = room?.research;
  const [text, setText] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    if (!research) return;
    setText(research.submission?.text ?? '');
    setSources(
      Array.from({ length: research.sourcesRequired }, (_, index) => research.submission?.sources[index] ?? ''),
    );
    setShowForm(!research.submission || research.submission.status === 'rejected');
  }, [research?.submission?.id, research?.submission?.status, research?.sourcesRequired]);

  useEffect(() => {
    setSubmitting(false);
  }, [research?.submission?.status, research?.submission?.validatedAt]);

  if (!room || !research) return null;

  const disabled = paused || !connected || !socket;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const filledSources = sources.filter((source) => source.trim()).length;
  const canSubmit =
    !disabled &&
    !submitting &&
    words >= research.minWords &&
    words <= research.maxWords &&
    filledSources >= research.sourcesRequired;
  const status = research.submission?.status;
  const verdict = research.submission?.verdict;

  const submit = () => {
    if (!socket || !canSubmit) return;
    setSubmitting(true);
    socket.emit('player:research', {
      roomId: room.id,
      text: text.trim(),
      sources: sources.map((source) => source.trim()).filter(Boolean),
    });
  };

  const tone = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'pending' ? 'warning' : 'info';
  const label =
    status === 'approved'
      ? 'Validée'
      : status === 'rejected'
        ? 'À revoir'
        : status === 'pending'
          ? 'En attente'
          : 'À faire';

  return (
    <Card className={cn('research-card', status && `is-${status}`)}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Recherche documentaire</p>
          <h3>Le carnet du coach</h3>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="research-prompt">{research.prompt}</p>
      <p className="fine-print">{research.instructions}</p>

      {research.resources.length > 0 ? (
        <div className="research-resources">
          <span className="eyebrow">Ressources</span>
          <ul>
            {research.resources.map((resource) => (
              <li key={resource.title}>
                {resource.url ? (
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    {resource.title} <ArrowRight size={12} />
                  </a>
                ) : (
                  <strong>{resource.title}</strong>
                )}
                {resource.excerpt ? <span>{resource.excerpt}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === 'approved' ? (
        <div className="research-verdict is-approved">
          <Check size={17} />
          <div>
            <strong>Recherche validée</strong>
            <p>{research.submission?.comment ?? 'Le code de sortie est débloqué.'}</p>
          </div>
        </div>
      ) : null}
      {status === 'pending' ? (
        <div className="research-verdict is-pending">
          <Clock size={17} />
          <div>
            <strong>Jev lit votre recherche…</strong>
            <p>{research.submission?.comment ?? 'La validation arrive dans un instant.'}</p>
          </div>
        </div>
      ) : null}
      {status === 'rejected' ? (
        <div className="research-verdict is-rejected">
          <AlertTriangle size={17} />
          <div>
            <strong>Recherche à revoir</strong>
            <p>{research.submission?.comment ?? 'Relisez les conseils et complétez votre travail.'}</p>
            {verdict?.reasons?.length ? (
              <ul>
                {verdict.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {showForm && status !== 'approved' && status !== 'pending' ? (
        <div className="research-form">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 6000))}
            rows={8}
            placeholder="Écrivez votre synthèse avec vos mots. Citez vos sources, comparez-les, expliquez ce que vous avez appris."
            disabled={disabled || submitting}
            aria-label="Votre recherche"
          />
          <div className="research-form-meta">
            <span className={cn(words < research.minWords && 'is-warning')}>
              {words} mots · {research.minWords}–{research.maxWords} attendus
            </span>
            <span className={cn(filledSources < research.sourcesRequired && 'is-warning')}>
              {filledSources}/{research.sourcesRequired} sources
            </span>
          </div>
          <div className="research-source-list">
            {sources.map((source, index) => (
              <Input
                key={index}
                value={source}
                onChange={(event) =>
                  setSources((current) =>
                    current.map((item, sourceIndex) => (sourceIndex === index ? event.target.value : item)),
                  )
                }
                placeholder={`Source ${index + 1} : URL, titre du site ou de l’article`}
                disabled={disabled || submitting}
                aria-label={`Source ${index + 1}`}
              />
            ))}
          </div>
          <div className="research-actions">
            <span className="fine-print">Jev vérifie la consigne, les sources et la synthèse. Le professeur peut intervenir.</span>
            <Button onClick={submit} loading={submitting} disabled={!canSubmit} icon={<Send size={16} />}>
              Soumettre à Jev
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'rejected' && !showForm ? (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          Revoir ma recherche
        </Button>
      ) : null}
    </Card>
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
  const focusBlocked = Boolean(room?.lock === 'focus' && !room.focus?.active);
  const answeredKey = room ? room.questions.map((question) => (question.answeredCorrectly ? '1' : '0')).join('') : '';
  useFocusGuard(socket, room?.id ?? '', Boolean(room?.lock === 'focus'), Boolean(room?.focus?.active));

  useEffect(() => {
    setPendingQuestion(null);
    setCode('');
  }, [room?.id, room?.attempts, answeredKey]);

  if (!room) return null;

  const activeNames = Object.fromEntries(
    state.players.filter((player) => player.status === 'active').map((player) => [player.id, player.name]),
  );

  const answer = (question: PublicQuestion, option: number) => {
    if (!socket || disabled || focusBlocked || pendingQuestion) return;
    setPendingQuestion(question.id);
    socket.emit('player:answer', { roomId: room.id, questionId: question.id, option });
    window.setTimeout(() => setPendingQuestion(null), 2500);
  };

  const submitCode = () => {
    if (!socket || disabled || focusBlocked || !room.exitUnlocked || code.length === 0) return;
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

        <FocusGate
          focus={room.focus}
          names={activeNames}
          teamColor={state.team.color}
          socket={socket}
          roomId={room.id}
          label={room.title}
          disabled={disabled}
        />

        <ResearchCard state={state} socket={socket} paused={paused} connected={connected} />

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
                      disabled={disabled || focusBlocked || Boolean(pendingQuestion)}
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

        <Card className={cn('exit-card', room.exitUnlocked ? 'is-unlocked' : 'is-locked')}>
          <div className="exit-head">
            <span className="exit-icon">{room.exitUnlocked ? <KeyRound size={20} /> : <LockKeyhole size={20} />}</span>
            <div>
              <h3>{room.exitUnlocked ? 'Le code de sortie' : 'Code de sortie verrouillé'}</h3>
              <p>{room.exitPrompt}</p>
            </div>
          </div>
          {room.exitUnlocked ? (
            <div className="exit-form">
              <CodeInput value={code} onChange={setCode} length={1} numeric label="Code de sortie" />
              <Button
                onClick={submitCode}
                disabled={disabled || focusBlocked || code.length === 0}
                icon={<KeyRound size={17} />}
              >
                Valider le code
              </Button>
            </div>
          ) : (
            <p className="fine-print">
              {!room.allQuestionsCorrect
                ? room.questions.length === 1
                  ? 'Réponds d’abord à la question pour débloquer le code.'
                  : `Réponds d’abord aux ${room.questions.length} questions pour débloquer le code.`
                : room.research
                  ? 'La recherche doit être validée par Jev (ou par le professeur) avant le code.'
                  : 'Le code est encore verrouillé.'}
            </p>
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
          <CodeInput
            value={code}
            onChange={setCode}
            length={state.final.digits.length}
            numeric
            label="Code final à dix chiffres"
          />
          <Button
            size="lg"
            disabled={disabled || code.length !== state.final.digits.length}
            icon={<Trophy size={18} />}
            onClick={() => socket?.emit('player:finalCode', { code })}
          >
            Ouvrir le trophée
          </Button>
        </div>
        <p className="fine-print">
          Les {state.final.digits.length} chiffres ont été gagnés dans les {state.team.totalRooms} salles. Remettez-les dans
          l’ordre : vestiaire, table de marque, terrain, zone, coup franc, musée, légendes, club, match, finale.
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
          {state.quiz.finished ? (
            <Badge tone="success">
              Score : {state.quiz.score}/{state.quiz.questions.length}
            </Badge>
          ) : null}
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
        <p className="fine-print">
          Ce quiz est individuel : réponds seul, reste sur l’écran. Si tu le quittes, la réponse en cours est annulée. Ton
          professeur voit ton score.
        </p>
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
  const quizFocus = state.quiz.focus;
  const focusActive = quizFocus.active;
  const disabled = !connected || !socket || finished || pending || !focusActive;
  useFocusGuard(socket, 'quiz', !finished, focusActive);

  useEffect(() => {
    setPending(false);
  }, [current?.choice]);

  useEffect(() => {
    if (index > questions.length - 1) setIndex(Math.max(0, questions.length - 1));
  }, [index, questions.length]);

  const choose = (option: number) => {
    if (!socket || !current || disabled || !focusActive) return;
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
          {finished ? <Badge tone="success">{score}/{questions.length}</Badge> : null}
        </div>
      </div>

      {!finished ? (
        <FocusGate
          focus={quizFocus}
          names={{ [state.me.id]: state.me.name }}
          teamColor={state.team.color}
          socket={socket}
          roomId="quiz"
          label="Quiz individuel"
          disabled={!connected || !socket}
        />
      ) : null}

      {finished ? (
        <Card className="quiz-finished">
          <div className="quiz-finished-mark">
            <Sparkles size={26} />
          </div>
          <p className="eyebrow">Bilan individuel</p>
          <h1>{score}/{questions.length}</h1>
          <p>
            {score >= questions.length * 0.8
              ? 'Très solide : tu maîtrises les règles clés du handball.'
              : score >= questions.length * 0.5
                ? 'Bien joué : quelques règles à revoir, le débrief du prof t’aidera.'
                : 'C’est un point de départ : relis les règles avec ton équipe.'}
          </p>
          <Progress
            value={score}
            max={questions.length}
            tone={score >= questions.length * 0.8 ? 'success' : 'primary'}
          />
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
            Traversez les {state.team.totalRooms} salles du {state.game.title} en {state.game.sessionCount} séances et
            retrouvez le code du trophée. Chaque salle donne un chiffre.
          </p>
          <h3>Les indices</h3>
          <p>
            Chaque joueur reçoit un indice privé différent. Personne ne peut résoudre seul : partagez vos indices dans le
            chat d’équipe.
          </p>
          <h3>Les salles verrouillées</h3>
          <p>
            Certaines salles sont automatiques : tous les joueurs doivent rester sur l’écran et cliquer sur « Je suis
            prêt ». Si un joueur quitte l’écran, la salle se réinitialise.
          </p>
        </section>
        <section>
          <h3>Les recherches</h3>
          <p>
            Les salles de recherche ouvrent le web : citez 2 sources (3 pour la finale), écrivez avec vos mots et
            comparez. Jev valide la synthèse ; le professeur peut intervenir.
          </p>
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
        <span className="fine-print">Durée indicative : {state.game.durationMinutes} minutes · {state.game.sessionCount} séances</span>
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
