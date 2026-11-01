import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Download,
  EyeOff,
  Flag,
  Info,
  KeyRound,
  ListChecks,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Trophy,
  UserCheck,
  UserMinus,
  UserX,
  Users,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  AdminMessage,
  AdminPlayer,
  AdminState,
  AdminTeam,
  CreateGameInput,
  GameListItem,
  TeamColor,
} from '../shared/types';
import { api, ApiError, type HealthResponse } from './api';
import { useAdminSocket } from './hooks';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConnectionDot,
  CopyButton,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingScreen,
  Logo,
  Modal,
  Progress,
  QRCode,
  SectionHeading,
  Select,
  Spinner,
  Stat,
  StatusBadge,
  Tabs,
  TeamChip,
  Textarea,
  ThemeToggle,
  ToastStack,
  useToasts,
  type ToastItem,
} from './ui';
import { formatDate, formatDuration, formatTime, gameStatusLabel, teamStatusLabel } from './format';
import {
  buildJoinUrl,
  cn,
  EXAMPLE_LIST,
  isLocalhost,
  parseStudentList,
  TEAM_COLORS,
  type ParsedTeam,
  type TeamColorKey,
} from './utils';

type AdminTab = 'direct' | 'moderation' | 'chat' | 'results';

interface ConfirmState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  success?: string;
  onConfirm: () => Promise<unknown>;
}

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-court" aria-hidden="true" />
      <Card className="login-card">
        <div className="login-brand">
          <Logo />
          <Badge tone="neutral">Espace prof</Badge>
        </div>
        <p className="eyebrow">Dashboard</p>
        <h1>Reprendre le contrôle.</h1>
        <p className="login-lede">
          Ouvre le salon, suis les équipes, modère le chat et lance la partie à distance. Le backend tourne sur ton Mac.
        </p>
        <form onSubmit={submit}>
          <Field label="Mot de passe" htmlFor="admin-password" hint="Défini dans le fichier .env du Mac mini.">
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="full-width" loading={busy} icon={<KeyRound size={18} />}>
            Entrer dans le dashboard
          </Button>
        </form>
        <div className="login-foot">
          <span className="fine-print">Backend local · SQLite · Jev pour le chat</span>
          <ThemeToggle />
        </div>
      </Card>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link to="/admin" className="admin-brand" aria-label="Retour aux parties">
          <Logo />
          <Badge tone="neutral">Espace prof</Badge>
        </Link>
        <nav className="admin-nav" aria-label="Navigation professeur">
          <Link to="/admin">Parties</Link>
          <Link to="/admin/new" className="btn btn-secondary btn-sm">
            <Plus size={15} /> Nouvelle partie
          </Link>
        </nav>
        <div className="admin-topbar-actions">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut size={15} />}
            loading={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              try {
                await api.logout();
              } catch {
                // on quitte quand même
              }
              window.location.assign('/admin');
            }}
          >
            Déconnexion
          </Button>
        </div>
      </header>
      <main className="admin-content">{children}</main>
    </div>
  );
}

function JevBadge({
  jev,
  onTest,
  testing = false,
}: {
  jev: AdminState['jev'];
  onTest?: () => void;
  testing?: boolean;
}) {
  const tone =
    jev.status === 'ok'
      ? 'success'
      : jev.status === 'degraded'
        ? 'warning'
        : jev.status === 'local'
          ? 'neutral'
          : 'danger';
  const label =
    jev.status === 'ok'
      ? 'connecté'
      : jev.status === 'degraded'
        ? 'dégradé'
        : jev.status === 'local'
          ? 'mode local'
          : 'indisponible';
  return (
    <div className="jev-badge">
      <Badge tone={tone}>
        <ShieldCheck size={13} /> Jev {label}
      </Badge>
      <span className="fine-print">{jev.model}</span>
      {onTest ? (
        <Button variant="ghost" size="sm" loading={testing} onClick={onTest}>
          Tester
        </Button>
      ) : null}
    </div>
  );
}

export function AdminHome() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameListItem[] | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jevTesting, setJevTesting] = useState(false);
  const [jevOverride, setJevOverride] = useState<AdminState['jev'] | null>(null);
  const { toasts, push, dismiss } = useToasts();

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [gameList, healthResponse] = await Promise.all([api.listGames(), api.health()]);
      setGames(gameList);
      setHealth(healthResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les parties.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testJev = async () => {
    setJevTesting(true);
    try {
      const result = await api.preflightJev();
      setJevOverride(result.health);
      push(result.error ? 'error' : 'success', result.error ? `Jev : ${result.error}` : 'Jev répond correctement.');
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Test Jev impossible.');
    } finally {
      setJevTesting(false);
    }
  };

  const jev = jevOverride ?? health?.jev ?? null;

  return (
    <AdminShell>
      <div className="admin-page">
        <section className="admin-hero">
          <div>
            <p className="eyebrow">Vestiaire 7 · dashboard</p>
            <h1>Le vestiaire est prêt.</h1>
            <p>
              Crée une partie, importe tes équipes, ouvre le salon. Les élèves n’ont besoin que du lien et du code
              d’accès.
            </p>
          </div>
          <div className="admin-hero-actions">
            <Button size="lg" icon={<Plus size={18} />} onClick={() => navigate('/admin/new')}>
              Nouvelle partie
            </Button>
            <Button variant="ghost" size="lg" icon={<RefreshCw size={17} />} loading={busy} onClick={() => void load()}>
              Rafraîchir
            </Button>
          </div>
        </section>

        <div className="admin-home-grid">
          <section className="admin-games">
            <SectionHeading
              eyebrow="Tes parties"
              title="Sessions"
              description="Chaque partie garde ses équipes, son code et son historique."
            />
            {error ? (
              <Card className="error-inline">
                <AlertTriangle size={18} />
                <div>
                  <strong>Impossible de charger</strong>
                  <p>{error}</p>
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Réessayer
                  </Button>
                </div>
              </Card>
            ) : games === null ? (
              <Card className="center-card">
                <Spinner label="Chargement des parties" />
              </Card>
            ) : games.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Trophy}
                  title="Aucune partie pour l’instant"
                  action={
                    <Button icon={<Plus size={17} />} onClick={() => navigate('/admin/new')}>
                      Créer ma première partie
                    </Button>
                  }
                >
                  Importe ta liste d’élèves, choisis les équipes et partage le lien. Tu pourras lancer la partie quand
                  tout le monde est connecté.
                </EmptyState>
              </Card>
            ) : (
              <div className="game-list">
                {games.map((game) => (
                  <Link key={game.id} to={`/admin/games/${game.id}`} className="game-list-card">
                    <div className="game-list-main">
                      <div className="game-list-top">
                        <StatusBadge status={game.status} />
                        <span className="fine-print">{formatDate(game.createdAt)}</span>
                      </div>
                      <h3>{game.title}</h3>
                      <div className="game-list-meta">
                        <span className="mono">{game.code}</span>
                        <span>
                          <Users size={14} /> {game.teams} équipes · {game.players} joueurs
                        </span>
                        <span>
                          <ConnectionDot connected={game.connected > 0} /> {game.connected} en ligne
                        </span>
                      </div>
                    </div>
                    <span className="game-list-arrow">
                      <ArrowRight size={18} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="admin-side">
            <Card className="jev-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Modération</p>
                  <h2>Jev</h2>
                </div>
                <ShieldCheck size={21} />
              </div>
              {jev ? (
                <>
                  <JevBadge jev={jev} onTest={() => void testJev()} testing={jevTesting} />
                  <Divider />
                  <div className="mini-stats">
                    <Stat label="Appels" value={jev.calls} />
                    <Stat label="Latence" value={jev.lastLatencyMs ? `${jev.lastLatencyMs} ms` : '—'} />
                  </div>
                  {jev.lastError ? <p className="form-error">{jev.lastError}</p> : null}
                  <p className="fine-print">
                    Jev analyse chaque message avant publication. Sans clé, le filtre local prend le relais.
                  </p>
                </>
              ) : (
                <Spinner label="Vérification de Jev" />
              )}
            </Card>

            <Card className="guide-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Sur le Mac mini</p>
                  <h2>Une seule commande</h2>
                </div>
                <Zap size={20} />
              </div>
              <code className="command-line">./start.sh</code>
              <p className="fine-print">
                Le script installe, construit, lance le serveur et le tunnel, puis ouvre ce dashboard dans Chrome. L’URL
                change à chaque lancement.
              </p>
              <Divider />
              <div className="guide-steps">
                <span><b>1.</b> Importer la liste</span>
                <span><b>2.</b> Ouvrir le salon</span>
                <span><b>3.</b> Partager le lien</span>
                <span><b>4.</b> Lancer la partie</span>
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </AdminShell>
  );
}

export function CreateGame() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('Le Dernier Match');
  const [raw, setRaw] = useState('');
  const [teams, setTeams] = useState<Array<ParsedTeam & { color: TeamColorKey }>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'list' | 'preview'>('list');
  const [busy, setBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  const analyze = () => {
    const result = parseStudentList(raw);
    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setTeams(
      result.teams.map((team, index) => ({
        ...team,
        color: TEAM_COLORS[index % TEAM_COLORS.length].id,
      })),
    );
    setStep('preview');
  };

  const create = async () => {
    setBusy(true);
    try {
      const input: CreateGameInput = {
        title: title.trim(),
        teams: teams.map((team) => ({
          name: team.name,
          color: team.color as TeamColor,
          players: team.players,
        })),
      };
      const game = await api.createGame(input);
      navigate(`/admin/games/${game.id}`);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const setTeamColor = (index: number, color: TeamColorKey) => {
    setTeams((current) => current.map((team, teamIndex) => (teamIndex === index ? { ...team, color } : team)));
  };

  const totalPlayers = teams.reduce((sum, team) => sum + team.players.length, 0);

  return (
    <AdminShell>
      <div className="admin-page create-page">
        <div className="admin-page-head">
          <Link to="/admin" className="back-link">
            <ArrowLeft size={16} /> Parties
          </Link>
          <div>
            <p className="eyebrow">Nouvelle partie</p>
            <h1>Préparer le vestiaire.</h1>
            <p>Importe ta liste, vérifie les équipes, puis crée la partie. Tu pourras encore ajuster les absents après.</p>
          </div>
        </div>

        <div className="create-grid">
          <div className="create-main">
            {step === 'list' ? (
              <Card className="create-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">Étape 1</p>
                    <h2>La liste des équipes</h2>
                  </div>
                  <Badge tone="primary">4 × 4 recommandé</Badge>
                </div>
                <p className="fine-print">
                  Une ligne par élève, au format <code>Équipe;Prénom</code>. Les virgules et les tabulations marchent
                  aussi. Les prénoms doivent être uniques dans une équipe.
                </p>
                <Textarea
                  value={raw}
                  onChange={(event) => setRaw(event.target.value)}
                  rows={12}
                  placeholder={`Les Ailiers;Lina\nLes Ailiers;Noah\nLes Pivots;Sami\n...`}
                  spellCheck={false}
                  aria-label="Liste des élèves"
                />
                <div className="create-list-actions">
                  <Button variant="ghost" size="sm" onClick={() => setRaw(EXAMPLE_LIST)}>
                    Charger un exemple
                  </Button>
                  <span className="fine-print">{raw.split(/\r?\n/).filter((line) => line.trim()).length} ligne(s)</span>
                </div>
                {errors.length > 0 ? (
                  <div className="form-error-list" role="alert">
                    <strong>Il y a {errors.length} problème(s) :</strong>
                    <ul>
                      {errors.slice(0, 8).map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button size="lg" className="full-width" icon={<ArrowRight size={18} />} onClick={analyze} disabled={!raw.trim()}>
                  Analyser la liste
                </Button>
              </Card>
            ) : (
              <Card className="create-card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">Étape 2</p>
                    <h2>Vérifier les équipes</h2>
                  </div>
                  <Badge tone="success">
                    {teams.length} équipes · {totalPlayers} joueurs
                  </Badge>
                </div>
                <div className="preview-teams">
                  {teams.map((team, index) => (
                    <div key={team.name} className="preview-team" data-color={team.color}>
                      <div className="preview-team-head">
                        <div>
                          <p className="eyebrow">Équipe {index + 1}</p>
                          <h3>{team.name}</h3>
                        </div>
                        <Select
                          value={team.color}
                          onChange={(event) => setTeamColor(index, event.target.value as TeamColorKey)}
                          aria-label={`Couleur de ${team.name}`}
                        >
                          {TEAM_COLORS.map((color) => (
                            <option key={color.id} value={color.id}>
                              {color.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="preview-players">
                        {team.players.map((player) => (
                          <span key={player} className="player-chip">
                            <Avatar name={player} color={team.color} size="sm" /> {player}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Divider />
                <Field label="Titre de la partie" htmlFor="game-title" hint="Il apparaîtra sur l’écran des élèves.">
                  <Input
                    id="game-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value.slice(0, 100))}
                    maxLength={100}
                  />
                </Field>
                <div className="create-actions">
                  <Button variant="ghost" onClick={() => setStep('list')}>
                    Modifier la liste
                  </Button>
                  <Button
                    size="lg"
                    loading={busy}
                    disabled={!title.trim() || teams.length < 2}
                    icon={<Trophy size={18} />}
                    onClick={() => void create()}
                  >
                    Créer la partie
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <aside className="create-side">
            <Card className="scenario-card">
              <div className="scenario-art" aria-hidden="true">
                <Trophy size={28} />
              </div>
              <p className="eyebrow">Scénario</p>
              <h2>Le Dernier Match</h2>
              <p>
                La finale du championnat. Le coach a disparu, le vestiaire est verrouillé. Cinq salles, cinq chiffres, un
                trophée.
              </p>
              <div className="scenario-facts">
                <span><b>5</b> salles</span>
                <span><b>45</b> min</span>
                <span><b>2</b> questions/salle</span>
                <span><b>5</b> questions individuelles</span>
              </div>
            </Card>
            <Card className="create-help">
              <Info size={19} />
              <div>
                <strong>Comment ça marche ?</strong>
                <p>Le prof ouvre le salon. Chaque élève clique son prénom. Une équipe entre quand tous ses joueurs sont connectés.</p>
                <p>Le chat d’équipe est le seul moyen de partager les indices. Jev modère avant publication.</p>
              </div>
            </Card>
          </aside>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </AdminShell>
  );
}

export function AdminGame() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const socket = useAdminSocket(id ?? '');
  const [initial, setInitial] = useState<AdminState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('direct');
  const [chatTeamId, setChatTeamId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [jevTesting, setJevTesting] = useState(false);
  const [jevOverride, setJevOverride] = useState<AdminState['jev'] | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getGame(id)
      .then((state) => {
        if (!cancelled) setInitial(state);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          window.location.assign('/admin');
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger la partie.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (socket.deleted) navigate('/admin');
  }, [socket.deleted, navigate]);

  const state = socket.state ?? initial;
  const jev = jevOverride ?? state?.jev ?? null;

  const act = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      setBusy(true);
      try {
        await fn();
        if (success) push('success', success);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          window.location.assign('/admin');
          return;
        }
        push('error', error instanceof Error ? error.message : 'Action impossible.');
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const testJev = async () => {
    setJevTesting(true);
    try {
      const result = await api.preflightJev();
      setJevOverride(result.health);
      push(result.error ? 'error' : 'success', result.error ? `Jev : ${result.error}` : 'Jev répond correctement.');
    } catch (error) {
      push('error', error instanceof Error ? error.message : 'Test Jev impossible.');
    } finally {
      setJevTesting(false);
    }
  };

  const confirmAndRun = async () => {
    if (!confirm) return;
    await act(confirm.onConfirm, confirm.success);
    setConfirm(null);
  };

  if (!id) {
    return (
      <AdminShell>
        <div className="admin-page">
          <EmptyState title="Partie introuvable" action={<Link to="/admin" className="btn btn-primary">Retour aux parties</Link>}>
            Le lien ne contient pas d’identifiant de partie.
          </EmptyState>
        </div>
      </AdminShell>
    );
  }

  if (!state) {
    return (
      <AdminShell>
        <div className="admin-page">
          {loadError ? (
            <Card className="error-inline">
              <AlertTriangle size={18} />
              <div>
                <strong>Impossible de charger cette partie</strong>
                <p>{loadError}</p>
                <Link to="/admin" className="btn btn-secondary btn-sm">
                  Retour aux parties
                </Link>
              </div>
            </Card>
          ) : (
            <LoadingScreen label="Connexion au dashboard…" />
          )}
        </div>
      </AdminShell>
    );
  }

  const offset = state.game.status === 'live' ? Math.max(0, nowTick - state.serverNow) : 0;
  const moderationCount =
    state.messages.filter((message) => message.status === 'blocked' || message.status === 'flagged').length +
    state.reports.filter((report) => !report.resolved).length;
  const selectedChatTeam = chatTeamId ?? state.teams[0]?.id;
  const tabs: Array<{ id: AdminTab; label: string; count?: number; icon: typeof Play }> = [
    { id: 'direct', label: 'Direct', icon: Play },
    { id: 'moderation', label: 'Modération', count: moderationCount, icon: ShieldCheck },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
    { id: 'results', label: 'Résultats', icon: ListChecks },
  ];

  const openConfirm = (config: ConfirmState) => setConfirm(config);

  const openChat = (teamId: string) => {
    setChatTeamId(teamId);
    setTab('chat');
  };

  const deleteGame = () =>
    openConfirm({
      title: 'Supprimer cette partie ?',
      body: (
        <>
          <p>Toutes les équipes, les messages et les résultats de cette partie seront supprimés. Cette action est définitive.</p>
          <p className="fine-print">Pense à exporter le CSV avant si tu veux garder une trace.</p>
        </>
      ),
      confirmLabel: 'Supprimer définitivement',
      tone: 'danger',
      success: 'Partie supprimée.',
      onConfirm: async () => {
        await api.deleteGame(state.game.id);
        navigate('/admin');
      },
    });

  return (
    <AdminShell>
      <div className="admin-page admin-game-page">
        <div className="game-admin-head">
          <Link to="/admin" className="back-link">
            <ArrowLeft size={16} /> Parties
          </Link>
          <div className="game-admin-title">
            <p className="eyebrow">Dashboard de partie</p>
            <h1>{state.game.title}</h1>
            <div className="game-admin-meta">
              <span className="mono game-code">{state.game.code}</span>
              <StatusBadge status={state.game.status} />
              <span>{state.teams.length} équipes · {state.stats.playersTotal} joueurs</span>
              <span>{state.stats.playersConnected} en ligne</span>
            </div>
          </div>
          <div className="game-admin-head-actions">
            {jev ? <JevBadge jev={jev} onTest={() => void testJev()} testing={jevTesting} /> : null}
            <Button
              variant="ghost"
              size="sm"
              icon={<Download size={15} />}
              onClick={() => window.open(api.exportUrl(state.game.id), '_blank')}
            >
              CSV
            </Button>
          </div>
        </div>

        {!socket.connected || socket.connectionError ? (
          <div className="connection-banner" role="status">
            <RefreshCw size={16} className="spin-slow" />
            <span>{socket.connectionError ?? 'Reconnexion au dashboard…'}</span>
          </div>
        ) : null}

        <ControlBar
          state={state}
          busy={busy}
          onOpen={() => void act(() => api.openGame(state.game.id), 'Salon ouvert. Partage le lien et le code.')}
          onLaunch={() => void act(() => api.launchGame(state.game.id), 'Partie lancée. Les équipes peuvent entrer.')}
          onPause={() => void act(() => api.pauseGame(state.game.id), 'Partie en pause.')}
          onResume={() => void act(() => api.resumeGame(state.game.id), 'Partie reprise.')}
          onEnd={() =>
            openConfirm({
              title: 'Terminer la partie ?',
              body: 'Les équipes encore en jeu verront l’écran de fin. Le chat passera en lecture seule. Tu pourras encore consulter les résultats.',
              confirmLabel: 'Terminer la partie',
              tone: 'danger',
              success: 'Partie terminée.',
              onConfirm: () => api.endGame(state.game.id),
            })
          }
          onExport={() => window.open(api.exportUrl(state.game.id), '_blank')}
        />

        <Tabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === 'direct' ? (
          <div className="admin-game-grid">
            <SharePanel state={state} />
            <TeamBoard
              state={state}
              offset={offset}
              busy={busy}
              onOpenChat={openChat}
              onForce={(team) =>
                openConfirm({
                  title: `Forcer le départ de ${team.name} ?`,
                  body: 'Le sas de connexion sera ignoré pour cette équipe. À utiliser si un élève est absent ou bloqué.',
                  confirmLabel: 'Forcer le départ',
                  success: `${team.name} peut entrer.`,
                  onConfirm: () => api.forceStart(state.game.id, team.id),
                })
              }
              onHint={(team) =>
                openConfirm({
                  title: `Envoyer un indice à ${team.name} ?`,
                  body: 'L’indice de la salle actuelle sera révélé à l’équipe. Cela coûte 20 points.',
                  confirmLabel: 'Envoyer l’indice',
                  success: 'Indice envoyé.',
                  onConfirm: () => api.hint(state.game.id, team.id),
                })
              }
              onAbsent={(player) => {
                const absent = player.status === 'active';
                if (!absent) {
                  void act(() => api.absent(state.game.id, player.id, false), `${player.name} est réactivé.`);
                  return;
                }
                openConfirm({
                  title: `Marquer ${player.name} absent ?`,
                  body: 'Le joueur sera déconnecté et retiré du sas de connexion. Tu pourras le réactiver plus tard.',
                  confirmLabel: 'Marquer absent',
                  tone: 'danger',
                  success: `${player.name} est marqué absent.`,
                  onConfirm: () => api.absent(state.game.id, player.id, true),
                });
              }}
              onRelease={(player) =>
                openConfirm({
                  title: `Libérer la place de ${player.name} ?`,
                  body: 'Le joueur sera déconnecté. Il pourra se reconnecter avec le code d’accès, éventuellement sur un autre appareil.',
                  confirmLabel: 'Libérer la place',
                  success: `${player.name} peut se reconnecter.`,
                  onConfirm: () => api.release(state.game.id, player.id),
                })
              }
              onMute={(player) =>
                void act(() => api.mute(state.game.id, player.id, 2), `${player.name} est en sourdine 2 minutes.`)
              }
            />
          </div>
        ) : null}

        {tab === 'moderation' ? (
          <ModerationPanel
            state={state}
            busy={busy}
            onAllow={(message) => void act(() => api.allowMessage(state.game.id, message.id), 'Message publié dans l’équipe.')}
            onHide={(message) => void act(() => api.hideMessage(state.game.id, message.id), 'Message masqué pour l’équipe.')}
            onResolve={(report) => void act(() => api.resolveReport(state.game.id, report.id), 'Signalement résolu.')}
            onOpenChat={openChat}
          />
        ) : null}

        {tab === 'chat' ? (
          <ChatAdminPanel
            state={state}
            selectedTeamId={selectedChatTeam}
            onSelectTeam={setChatTeamId}
            busy={busy}
            onBroadcast={(body, teamId) => void act(() => api.broadcast(state.game.id, body, teamId), 'Message du coach envoyé.')}
          />
        ) : null}

        {tab === 'results' ? (
          <ResultsPanel state={state} busy={busy} onDelete={deleteGame} />
        ) : null}

        <ConfirmModal
          confirm={confirm}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void confirmAndRun()}
        />
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </AdminShell>
  );
}

function ControlBar({
  state,
  busy,
  onOpen,
  onLaunch,
  onPause,
  onResume,
  onEnd,
  onExport,
}: {
  state: AdminState;
  busy: boolean;
  onOpen: () => void;
  onLaunch: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onExport: () => void;
}) {
  const status = state.game.status;
  return (
    <Card className="control-bar">
      <div className="control-status">
        <span className={cn('status-light', status === 'live' && 'is-live', status === 'paused' && 'is-paused')} />
        <div>
          <strong>{gameStatusLabel(status)}</strong>
          <p>
            {status === 'draft'
              ? 'Ouvre le salon pour permettre aux élèves de rejoindre.'
              : status === 'lobby'
                ? 'Les élèves peuvent entrer. Lance quand les équipes sont prêtes.'
                : status === 'live'
                  ? 'Le chrono tourne. Les équipes entrent dès qu’elles sont au complet.'
                  : status === 'paused'
                    ? 'Les chronos sont gelés. Le chat reste ouvert.'
                    : 'La partie est terminée. Les résultats sont disponibles.'}
          </p>
        </div>
      </div>
      <div className="control-actions">
        {status === 'draft' ? (
          <Button icon={<Play size={17} />} loading={busy} onClick={onOpen}>
            Ouvrir le salon
          </Button>
        ) : null}
        {status === 'lobby' ? (
          <Button icon={<Play size={17} />} loading={busy} onClick={onLaunch}>
            Lancer la partie
          </Button>
        ) : null}
        {status === 'live' ? (
          <Button variant="secondary" icon={<Pause size={17} />} loading={busy} onClick={onPause}>
            Mettre en pause
          </Button>
        ) : null}
        {status === 'paused' ? (
          <Button icon={<Play size={17} />} loading={busy} onClick={onResume}>
            Reprendre
          </Button>
        ) : null}
        {status === 'live' || status === 'paused' ? (
          <Button variant="danger" icon={<Square size={15} />} loading={busy} onClick={onEnd}>
            Terminer
          </Button>
        ) : null}
        {status === 'ended' ? (
          <Button variant="secondary" icon={<Download size={16} />} onClick={onExport}>
            Exporter les résultats
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function SharePanel({ state }: { state: AdminState }) {
  const globalLink = buildJoinUrl(state.game.code);
  const local = isLocalhost();
  return (
    <Card className="share-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Accès élèves</p>
          <h2>Le lien et le code</h2>
        </div>
        <Badge tone={state.game.status === 'draft' ? 'warning' : 'success'}>
          {state.game.status === 'draft' ? 'Salon fermé' : 'Salon ouvert'}
        </Badge>
      </div>
      {local ? (
        <div className="inline-warning">
          <AlertTriangle size={16} />
          <p>
            Tu es sur <code>localhost</code> : les élèves ne pourront pas ouvrir ce lien. Ouvre le dashboard via l’URL du
            tunnel (celle que <code>./start.sh</code> affiche) pour partager un lien accessible.
          </p>
        </div>
      ) : null}
      <div className="share-link-row">
        <div className="share-link">
          <span className="share-label">Lien de la classe</span>
          <code>{globalLink}</code>
        </div>
        <CopyButton text={globalLink} label="Copier" />
        <a href={globalLink} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          <ArrowRight size={15} /> Ouvrir
        </a>
      </div>
      <div className="share-grid">
        <div className="share-code">
          <span className="share-label">Code d’accès</span>
          <strong className="mono pin-display">{state.game.pin}</strong>
          <CopyButton text={state.game.pin} label="Copier" />
        </div>
        <div className="share-code">
          <span className="share-label">Code partie</span>
          <strong className="mono">{state.game.code}</strong>
          <CopyButton text={state.game.code} label="Copier" />
        </div>
        <div className="share-qr">
          <QRCode value={globalLink} size={138} />
          <span className="fine-print">QR code</span>
        </div>
      </div>
      <Divider />
      <div className="team-links">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Sous-salons</p>
            <h3>Un lien par équipe</h3>
          </div>
          <span className="fine-print">Pratique en visio</span>
        </div>
        <div className="team-link-grid">
          {state.teams.map((team) => {
            const link = buildJoinUrl(state.game.code, team.id);
            return (
              <div key={team.id} className="team-link-row" data-color={team.color}>
                <TeamChip name={team.name} color={team.color} />
                <CopyButton text={link} label="Copier" />
              </div>
            );
          })}
        </div>
      </div>
      <p className="fine-print">
        Les élèves entrent le code d’accès, puis cliquent leur prénom. Une équipe ne peut entrer que si tous ses joueurs
        actifs sont connectés.
      </p>
    </Card>
  );
}

function TeamBoard({
  state,
  offset,
  busy,
  onOpenChat,
  onForce,
  onHint,
  onAbsent,
  onRelease,
  onMute,
}: {
  state: AdminState;
  offset: number;
  busy: boolean;
  onOpenChat: (teamId: string) => void;
  onForce: (team: AdminTeam) => void;
  onHint: (team: AdminTeam) => void;
  onAbsent: (player: AdminPlayer) => void;
  onRelease: (player: AdminPlayer) => void;
  onMute: (player: AdminPlayer) => void;
}) {
  return (
    <div className="team-board">
      <SectionHeading
        eyebrow="Direct"
        title="Les équipes"
        description="Présence, progression, scores et actions de régulation."
      />
      <div className="team-grid">
        {state.teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            gameStatus={state.game.status}
            offset={offset}
            busy={busy}
            onOpenChat={onOpenChat}
            onForce={onForce}
            onHint={onHint}
            onAbsent={onAbsent}
            onRelease={onRelease}
            onMute={onMute}
          />
        ))}
      </div>
    </div>
  );
}

function TeamCard({
  team,
  gameStatus,
  offset,
  busy,
  onOpenChat,
  onForce,
  onHint,
  onAbsent,
  onRelease,
  onMute,
}: {
  team: AdminTeam;
  gameStatus: AdminState['game']['status'];
  offset: number;
  busy: boolean;
  onOpenChat: (teamId: string) => void;
  onForce: (team: AdminTeam) => void;
  onHint: (team: AdminTeam) => void;
  onAbsent: (player: AdminPlayer) => void;
  onRelease: (player: AdminPlayer) => void;
  onMute: (player: AdminPlayer) => void;
}) {
  const active = team.players.filter((player) => player.status === 'active');
  const connected = active.filter((player) => player.connected).length;
  const live = gameStatus === 'live' && team.startedAt && !team.finishedAt;
  const elapsed = team.elapsedMs + (live ? offset : 0);
  const solved = team.progress.filter((room) => room.solvedAt).length;
  const status = teamStatusLabel(team.startedAt, team.finishedAt);
  return (
    <Card className="admin-team-card" data-color={team.color}>
      <div className="team-card-top">
        <div className="team-card-title">
          <span className="team-color-bar" aria-hidden="true" />
          <div>
            <h3>{team.name}</h3>
            <div className="team-card-sub">
              <Badge tone={team.finishedAt ? 'success' : team.canStart ? 'info' : 'neutral'}>{status}</Badge>
              {team.canStart ? <Badge tone="success">Prête</Badge> : null}
              {team.finalCodeOk ? <Badge tone="success"><Trophy size={12} /> Trophée</Badge> : null}
            </div>
          </div>
        </div>
        <div className="team-card-score">
          <strong className="mono">{team.score}</strong>
          <span>pts</span>
        </div>
      </div>

      <div className="team-card-metrics">
        <span>
          <Users size={14} /> {connected}/{active.length} connectés
        </span>
        <span>
          <KeyRound size={14} /> {Math.min(team.currentRoom, team.totalRooms)}/{team.totalRooms} salles
        </span>
        <span>
          <Clock size={14} /> {formatDuration(elapsed)}
        </span>
      </div>

      <div className="team-room-strip" aria-label={`Progression de ${team.name}`}>
        {Array.from({ length: team.totalRooms }, (_, index) => {
          const done = index < team.currentRoom;
          const current = index === team.currentRoom && !team.finishedAt;
          return (
            <span key={index} className={cn('room-step', done && 'is-done', current && 'is-current')}>
              {done ? <Check size={11} /> : index + 1}
            </span>
          );
        })}
      </div>

      <ul className="admin-player-list">
        {team.players.map((player) => (
          <li key={player.id} className={cn('admin-player-row', player.status === 'absent' && 'is-absent')}>
            <Avatar name={player.name} color={team.color} size="sm" />
            <div className="admin-player-main">
              <span className="admin-player-name">{player.name}</span>
              <div className="admin-player-meta">
                {player.status === 'absent' ? (
                  <Badge tone="neutral">Absent</Badge>
                ) : (
                  <ConnectionDot connected={player.connected} label={player.connected ? 'En ligne' : 'Hors ligne'} />
                )}
                {player.quizFinishedAt ? (
                  <Badge tone={player.quizScore != null && player.quizScore >= 3 ? 'success' : 'warning'}>
                    Quiz {player.quizScore ?? 0}/5
                  </Badge>
                ) : player.quizAnswers > 0 ? (
                  <Badge tone="info">Quiz en cours</Badge>
                ) : null}
                {player.mutedUntil && player.mutedUntil > Date.now() ? <Badge tone="warning">Sourdine</Badge> : null}
              </div>
            </div>
            <div className="admin-player-actions">
              {player.connected ? (
                <IconButton label={`Libérer ${player.name}`} size="sm" disabled={busy} onClick={() => onRelease(player)}>
                  <UserMinus size={14} />
                </IconButton>
              ) : null}
              <IconButton
                label={player.status === 'active' ? `Marquer ${player.name} absent` : `Réactiver ${player.name}`}
                size="sm"
                disabled={busy}
                onClick={() => onAbsent(player)}
              >
                {player.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
              </IconButton>
              {player.status === 'active' ? (
                <IconButton label={`Mettre ${player.name} en sourdine 2 minutes`} size="sm" disabled={busy} onClick={() => onMute(player)}>
                  <VolumeX size={14} />
                </IconButton>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="team-card-actions">
        {gameStatus === 'live' && !team.startedAt ? (
          <Button variant="secondary" size="sm" icon={<Play size={15} />} disabled={busy} onClick={() => onForce(team)}>
            Forcer le départ
          </Button>
        ) : null}
        {team.startedAt && !team.finishedAt ? (
          <Button variant="ghost" size="sm" icon={<Zap size={15} />} disabled={busy} onClick={() => onHint(team)}>
            Indice
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" icon={<MessageCircle size={15} />} onClick={() => onOpenChat(team.id)}>
          Chat
        </Button>
        <span className="fine-print">
          {solved}/{team.totalRooms} salles résolues
        </span>
      </div>
    </Card>
  );
}

function ModerationPanel({
  state,
  busy,
  onAllow,
  onHide,
  onResolve,
  onOpenChat,
}: {
  state: AdminState;
  busy: boolean;
  onAllow: (message: AdminMessage) => void;
  onHide: (message: AdminMessage) => void;
  onResolve: (report: AdminState['reports'][number]) => void;
  onOpenChat: (teamId: string) => void;
}) {
  const [filter, setFilter] = useState<'todo' | 'blocked' | 'flagged' | 'reports'>('todo');
  const [teamId, setTeamId] = useState<string>('all');

  const relevant = useMemo(() => {
    const messages = state.messages.filter((message) => message.authorKind === 'player');
    if (filter === 'reports') return [];
    if (filter === 'blocked') return messages.filter((message) => message.status === 'blocked');
    if (filter === 'flagged') return messages.filter((message) => message.status === 'flagged');
    return messages.filter((message) => message.status === 'blocked' || message.status === 'flagged');
  }, [state.messages, filter]);

  const reports = state.reports.filter((report) => !report.resolved && (teamId === 'all' || report.teamId === teamId));
  const filteredMessages = relevant.filter((message) => teamId === 'all' || message.teamId === teamId);
  const counts = {
    todo: state.messages.filter((message) => message.status === 'blocked' || message.status === 'flagged').length,
    blocked: state.messages.filter((message) => message.status === 'blocked').length,
    flagged: state.messages.filter((message) => message.status === 'flagged').length,
    reports: state.reports.filter((report) => !report.resolved).length,
  };

  return (
    <div className="moderation-layout">
      <div className="moderation-main">
        <SectionHeading
          eyebrow="Sécurité"
          title="Modération du chat"
          description="Les messages bloqués ne sont jamais montrés à l’équipe. Tu peux les autoriser ou les masquer."
        />
        <div className="moderation-toolbar">
          <Tabs
            tabs={[
              { id: 'todo', label: 'À traiter', count: counts.todo },
              { id: 'blocked', label: 'Bloqués', count: counts.blocked },
              { id: 'flagged', label: 'Signalés', count: counts.flagged },
              { id: 'reports', label: 'Signalements élèves', count: counts.reports },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Select value={teamId} onChange={(event) => setTeamId(event.target.value)} aria-label="Filtrer par équipe">
            <option value="all">Toutes les équipes</option>
            {state.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </div>

        {filter === 'reports' ? (
          <div className="moderation-list">
            {reports.length === 0 ? (
              <Card>
                <EmptyState icon={Flag} title="Aucun signalement en attente">
                  Les élèves peuvent signaler un message avec le petit drapeau dans le chat. Tu les retrouveras ici.
                </EmptyState>
              </Card>
            ) : (
              reports.map((report) => {
                const message = state.messages.find((item) => item.id === report.messageId);
                return (
                  <Card key={report.id} className="moderation-card report-card">
                    <div className="moderation-card-head">
                      <div>
                        <Badge tone="warning"><Flag size={12} /> Signalement</Badge>
                        <h3>{report.playerName} a signalé un message</h3>
                        <p className="fine-print">
                          {report.teamName} · {formatTime(report.createdAt)}
                        </p>
                      </div>
                      <div className="moderation-actions">
                        <Button variant="ghost" size="sm" icon={<MessageCircle size={14} />} onClick={() => onOpenChat(report.teamId)}>
                          Voir le chat
                        </Button>
                        <Button size="sm" icon={<Check size={14} />} disabled={busy} onClick={() => onResolve(report)}>
                          Marquer résolu
                        </Button>
                      </div>
                    </div>
                    {message ? (
                      <blockquote className="reported-message">
                        <strong>{message.authorName}</strong>
                        <p>{message.body}</p>
                      </blockquote>
                    ) : (
                      <p className="fine-print">Le message n’est plus dans l’historique récent.</p>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          <div className="moderation-list">
            {filteredMessages.length === 0 ? (
              <Card>
                <EmptyState icon={ShieldCheck} title="Rien à traiter">
                  Les messages respectueux passent. Les messages bloqués ou signalés apparaîtront ici avec l’analyse de
                  Jev.
                </EmptyState>
              </Card>
            ) : (
              filteredMessages.map((message) => (
                <ModerationMessageCard
                  key={message.id}
                  message={message}
                  teamColor={state.teams.find((team) => team.id === message.teamId)?.color ?? 'blue'}
                  busy={busy}
                  onAllow={onAllow}
                  onHide={onHide}
                  onOpenChat={onOpenChat}
                />
              ))
            )}
          </div>
        )}
      </div>

      <aside className="moderation-side">
        <Card className="jev-detail-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Analyse</p>
              <h2>Comment Jev décide</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p className="fine-print">
            Jev renvoie des probabilités. Le code applique les seuils : respect très bas, harcèlement, menace ou donnée
            personnelle → blocage. Message limite → publication avec signalement.
          </p>
          <Divider />
          <ul className="moderation-rules">
            <li><span className="dot dot-danger" /> Insulte, menace, harcèlement : bloqué.</li>
            <li><span className="dot dot-warning" /> Moquerie légère : publié et signalé.</li>
            <li><span className="dot dot-success" /> Entraide, encouragement : publié.</li>
            <li><span className="dot dot-neutral" /> Jev indisponible : filtre local + alerte prof.</li>
          </ul>
        </Card>
        <Card className="moderation-stats">
          <Stat label="Messages" value={state.stats.messages} />
          <Stat label="Bloqués" value={state.stats.blocked} tone="danger" />
          <Stat label="Signalés" value={state.stats.flagged} tone="warning" />
          <Stat label="Signalements" value={state.stats.reports} tone="warning" />
        </Card>
      </aside>
    </div>
  );
}

function ModerationMessageCard({
  message,
  teamColor,
  busy,
  onAllow,
  onHide,
  onOpenChat,
}: {
  message: AdminMessage;
  teamColor: string;
  busy: boolean;
  onAllow: (message: AdminMessage) => void;
  onHide: (message: AdminMessage) => void;
  onOpenChat: (teamId: string) => void;
}) {
  const decision = message.moderation;
  const positive = decision?.entraide != null && decision.entraide >= 0.7;
  return (
    <Card className={cn('moderation-card', message.status === 'blocked' ? 'is-blocked' : 'is-flagged')}>
      <div className="moderation-card-head">
        <div>
          <div className="moderation-meta">
            <Badge tone={message.status === 'blocked' ? 'danger' : 'warning'}>
              {message.status === 'blocked' ? 'Bloqué' : 'Signalé'}
            </Badge>
            <TeamChip name={message.teamName} color={teamColor} />
            <span className="fine-print">{formatTime(message.createdAt)}</span>
          </div>
          <h3>{message.authorName}</h3>
        </div>
        <div className="moderation-actions">
          <Button variant="ghost" size="sm" icon={<MessageCircle size={14} />} onClick={() => onOpenChat(message.teamId)}>
            Chat
          </Button>
          {message.status === 'blocked' ? (
            <Button size="sm" icon={<Check size={14} />} disabled={busy} onClick={() => onAllow(message)}>
              Autoriser
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<EyeOff size={14} />} disabled={busy} onClick={() => onHide(message)}>
              Masquer
            </Button>
          )}
        </div>
      </div>
      <blockquote className="moderation-message-body">{message.body}</blockquote>
      {decision ? (
        <div className="moderation-analysis">
          <span>
            <b>Catégorie</b> {decision.category}
          </span>
          <span>
            <b>Gravité</b> {decision.severity.toFixed(1)}/3
          </span>
          <span>
            <b>Confiance</b> {Math.round(decision.confidence * 100)}%
          </span>
          <span>
            <b>Source</b> {decision.source === 'jev' ? 'Jev' : decision.source === 'local' ? 'Filtre local' : 'Repli'}
          </span>
          {positive ? <Badge tone="success">Entraide</Badge> : null}
        </div>
      ) : null}
      {decision?.reason ? <p className="moderation-reason">{decision.reason}</p> : null}
    </Card>
  );
}

function ChatAdminPanel({
  state,
  selectedTeamId,
  onSelectTeam,
  busy,
  onBroadcast,
}: {
  state: AdminState;
  selectedTeamId: string | undefined;
  onSelectTeam: (teamId: string) => void;
  busy: boolean;
  onBroadcast: (body: string, teamId?: string) => void;
}) {
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string>('all');
  const team = state.teams.find((item) => item.id === selectedTeamId) ?? state.teams[0];
  const messages = state.messages
    .filter((message) => message.teamId === team?.id)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  const send = () => {
    const clean = body.trim();
    if (!clean) return;
    onBroadcast(clean, target === 'all' ? undefined : target);
    setBody('');
  };

  return (
    <div className="admin-chat-layout">
      <Card className="admin-chat-main">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Transcription</p>
            <h2>{team?.name ?? 'Équipe'}</h2>
          </div>
          <Select value={team?.id ?? ''} onChange={(event) => onSelectTeam(event.target.value)} aria-label="Choisir une équipe">
            {state.teams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="fine-print">
          Les élèves ne voient que les messages approuvés. Les messages bloqués et masqués restent visibles ici pour toi.
        </p>
        <div className="admin-chat-scroll">
          {messages.length === 0 ? (
            <EmptyState icon={MessageCircle} title="Pas encore de message">
              Le chat de cette équipe est vide.
            </EmptyState>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={cn('admin-chat-message', `is-${message.status}`)}>
                <div className="admin-chat-meta">
                  <strong>{message.authorName}</strong>
                  <Badge
                    tone={
                      message.status === 'blocked'
                        ? 'danger'
                        : message.status === 'flagged'
                          ? 'warning'
                          : message.status === 'hidden'
                            ? 'neutral'
                            : 'success'
                    }
                  >
                    {message.status === 'blocked'
                      ? 'Bloqué'
                      : message.status === 'flagged'
                        ? 'Signalé'
                        : message.status === 'hidden'
                          ? 'Masqué'
                          : message.authorKind === 'coach'
                            ? 'Coach'
                            : message.authorKind === 'system'
                              ? 'Système'
                              : 'Publié'}
                  </Badge>
                  <span className="fine-print">{formatTime(message.createdAt)}</span>
                </div>
                <p>{message.body}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <aside className="admin-chat-side">
        <Card className="broadcast-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Coach</p>
              <h2>Message du prof</h2>
            </div>
            <Send size={19} />
          </div>
          <p className="fine-print">Le message est publié directement, sans passer par Jev. Il apparaît comme « Coach ».</p>
          <Field label="Destinataires" htmlFor="broadcast-target">
            <Select id="broadcast-target" value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="all">Toutes les équipes</option>
              {state.teams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 400))}
            rows={4}
            placeholder="Un encouragement, une règle, un coup de pouce…"
            maxLength={400}
          />
          <div className="broadcast-actions">
            <span className="fine-print">{body.length}/400</span>
            <Button icon={<Send size={16} />} loading={busy} disabled={!body.trim()} onClick={send}>
              Envoyer
            </Button>
          </div>
        </Card>
        <Card className="chat-admin-help">
          <Info size={18} />
          <div>
            <strong>Une équipe bloquée ?</strong>
            <p>Utilise « Forcer le départ » dans l’onglet Direct. Pour un message bloqué à tort, autorise-le depuis Modération.</p>
          </div>
        </Card>
      </aside>
    </div>
  );
}

function ResultsPanel({
  state,
  busy,
  onDelete,
}: {
  state: AdminState;
  busy: boolean;
  onDelete: () => void;
}) {
  const sortedTeams = [...state.teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.finishedAt ?? Number.MAX_SAFE_INTEGER) - (b.finishedAt ?? Number.MAX_SAFE_INTEGER);
  });
  const messagesByPlayer = new Map<string, number>();
  for (const message of state.messages) {
    if (message.playerId && (message.status === 'approved' || message.status === 'flagged')) {
      messagesByPlayer.set(message.playerId, (messagesByPlayer.get(message.playerId) ?? 0) + 1);
    }
  }
  const supportive = state.messages.filter(
    (message) =>
      message.moderation?.entraide != null &&
      message.moderation.entraide >= 0.7 &&
      (message.status === 'approved' || message.status === 'flagged'),
  ).length;
  const quizFinished = state.teams.flatMap((team) => team.players).filter((player) => player.quizFinishedAt).length;
  const quizScores = state.teams
    .flatMap((team) => team.players)
    .map((player) => player.quizScore)
    .filter((score): score is number => score != null);
  const averageQuiz = quizScores.length > 0 ? quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length : 0;

  return (
    <div className="results-layout">
      <SectionHeading
        eyebrow="Bilan"
        title="Résultats et débrief"
        description="Les scores d’équipe, les quiz individuels et les indicateurs de coopération."
        actions={
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={() => window.open(api.exportUrl(state.game.id), '_blank')}
          >
            Exporter le CSV
          </Button>
        }
      />

      <div className="results-stats">
        <Stat label="Équipes" value={state.teams.length} />
        <Stat label="Joueurs" value={state.stats.playersTotal} />
        <Stat label="Quiz terminés" value={`${quizFinished}/${state.stats.playersTotal}`} />
        <Stat label="Moyenne quiz" value={`${averageQuiz.toFixed(1)}/5`} />
        <Stat label="Messages d’entraide" value={supportive} tone="success" />
        <Stat label="Messages bloqués" value={state.stats.blocked} tone="danger" />
      </div>

      <Card className="results-table-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Classement</p>
            <h2>Les équipes</h2>
          </div>
          <Trophy size={20} />
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Équipe</th>
                <th>Score</th>
                <th>Salles</th>
                <th>Temps</th>
                <th>Quiz</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, index) => {
                const quiz = team.players.filter((player) => player.quizFinishedAt);
                const quizAverage =
                  quiz.length > 0
                    ? quiz.reduce((sum, player) => sum + (player.quizScore ?? 0), 0) / quiz.length
                    : null;
                return (
                  <tr key={team.id}>
                    <td className="mono">{index + 1}</td>
                    <td>
                      <TeamChip name={team.name} color={team.color} />
                    </td>
                    <td className="mono">{team.score}</td>
                    <td className="mono">{Math.min(team.currentRoom, team.totalRooms)}/{team.totalRooms}</td>
                    <td className="mono">{formatDuration(team.elapsedMs)}</td>
                    <td>{quizAverage != null ? `${quizAverage.toFixed(1)}/5 (${quiz.length})` : '—'}</td>
                    <td>
                      <Badge tone={team.finishedAt ? 'success' : team.startedAt ? 'info' : 'neutral'}>
                        {teamStatusLabel(team.startedAt, team.finishedAt)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="players-results-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Individuel</p>
            <h2>Les joueurs</h2>
          </div>
          <Users size={20} />
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Équipe</th>
                <th>Joueur</th>
                <th>Quiz</th>
                <th>Messages</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {state.teams.flatMap((team) =>
                team.players.map((player) => (
                  <tr key={player.id}>
                    <td>
                      <TeamChip name={team.name} color={team.color} />
                    </td>
                    <td>{player.name}</td>
                    <td>
                      {player.quizFinishedAt ? (
                        <Badge tone={(player.quizScore ?? 0) >= 3 ? 'success' : 'warning'}>
                          {player.quizScore ?? 0}/5
                        </Badge>
                      ) : (
                        <span className="fine-print">—</span>
                      )}
                    </td>
                    <td className="mono">{messagesByPlayer.get(player.id) ?? 0}</td>
                    <td>{player.status === 'active' ? 'Actif' : 'Absent'}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <details className="solution-card">
        <summary>
          <span>
            <KeyRound size={16} /> Voir la solution et les réponses
          </span>
          <ChevronDown size={16} />
        </summary>
        <div className="solution-body">
          <div className="solution-code">
            <span>Code final</span>
            <strong className="mono">{state.solution.finalCode}</strong>
          </div>
          <div className="solution-rooms">
            {state.solution.rooms.map((room) => (
              <div key={room.id} className="solution-room">
                <h3>
                  {room.title} <Badge tone="primary">Code {room.exitCode}</Badge>
                </h3>
                <ul>
                  {room.questions.map((question) => (
                    <li key={question.id}>
                      <span>{question.prompt}</span>
                      <b>{question.correctText}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Divider />
          <h3>Quiz individuel</h3>
          <ol className="solution-quiz">
            {state.game.scenario.finalQuiz.map((question) => (
              <li key={question.id}>
                <span>{question.prompt}</span>
                <b>{question.options[question.correct]}</b>
              </li>
            ))}
          </ol>
        </div>
      </details>

      <Card className="danger-zone">
        <div>
          <p className="eyebrow">Zone sensible</p>
          <h3>Supprimer la partie</h3>
          <p className="fine-print">
            Supprime définitivement les équipes, les messages et les résultats. Exporte le CSV avant.
          </p>
        </div>
        <Button variant="danger" icon={<Trash2 size={16} />} loading={busy} onClick={onDelete}>
          Supprimer
        </Button>
      </Card>
    </div>
  );
}

function ConfirmModal({
  confirm,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: ConfirmState | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={Boolean(confirm)}
      onClose={onClose}
      title={confirm?.title ?? ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant={confirm?.tone === 'danger' ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirm?.confirmLabel ?? 'Confirmer'}
          </Button>
        </>
      }
    >
      {confirm?.body}
    </Modal>
  );
}
