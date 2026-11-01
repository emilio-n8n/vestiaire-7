import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, KeyRound, MessageCircle, Play, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react';
import { api, ApiError } from './api';
import { clearSession, loadSession, saveSession, type PlayerSession } from './session';
import { usePlayerSocket } from './hooks';
import { PlayerGame } from './player';
import { AdminGame, AdminHome, AdminLogin, CreateGame } from './admin';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CodeInput,
  ConnectionDot,
  Divider,
  ErrorScreen,
  Field,
  IconButton,
  Input,
  LoadingScreen,
  Logo,
  Spinner,
  TeamChip,
  ThemeToggle,
} from './ui';
import { cn } from './utils';

function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'authed' | 'guest'>('loading');
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(() => {
        if (!cancelled) setStatus('authed');
      })
      .catch(() => {
        if (!cancelled) setStatus('guest');
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (status === 'loading') return <LoadingScreen label="Vérification de la session…" />;
  if (status === 'guest') return <AdminLogin onSuccess={() => setStatus('authed')} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/j/:code" element={<JoinPage />} />
      <Route path="/play/:code" element={<PlayPage />} />
      <Route
        path="/admin"
        element={
          <AdminGate>
            <AdminHome />
          </AdminGate>
        }
      />
      <Route
        path="/admin/new"
        element={
          <AdminGate>
            <CreateGame />
          </AdminGate>
        }
      />
      <Route
        path="/admin/games/:id"
        element={
          <AdminGate>
            <AdminGame />
          </AdminGate>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  return (
    <div className="landing">
      <header className="landing-topbar">
        <Logo />
        <div className="landing-topbar-actions">
          <Link to="/admin" className="btn btn-ghost btn-sm">
            <ShieldCheck size={15} /> Espace prof
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <Badge tone="primary">
              <Sparkles size={13} /> Escape game · handball
            </Badge>
            <h1>
              Le vestiaire est fermé.
              <br />
              <span>Le coach a disparu.</span>
            </h1>
            <p>
              Cinq salles, cinq chiffres, un trophée. Votre équipe doit coopérer pour sortir. Chaque joueur reçoit un
              indice différent : le chat est votre seul lien.
            </p>
            <div className="landing-actions">
              <Link to="/admin" className="btn btn-secondary btn-lg">
                <ShieldCheck size={18} /> Je suis professeur
              </Link>
              <span className="fine-print">Les élèves rejoignent avec le lien du prof.</span>
            </div>
          </div>

          <Card className="join-card">
            <div className="join-card-top">
              <div className="join-card-mark">
                <Trophy size={22} />
              </div>
              <div>
                <p className="eyebrow">Rejoindre une partie</p>
                <h2>Entre ton code</h2>
              </div>
            </div>
            <p className="fine-print">Le code de la partie est sur le lien partagé par ton professeur.</p>
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.length === 6) navigate(`/j/${code.toUpperCase()}`);
              }}
            >
              <CodeInput value={code} onChange={setCode} length={6} label="Code de la partie" autoFocus />
              <Button type="submit" size="lg" className="full-width" disabled={code.length !== 6} icon={<Play size={18} />}>
                Rejoindre
              </Button>
            </form>
            <Divider />
            <div className="join-card-note">
              <MessageCircle size={17} />
              <p>
                Un chat d’équipe, vérifié par <strong>Jev</strong> avant chaque message, pour partager les indices et
                s’encourager.
              </p>
            </div>
          </Card>
        </section>

        <section className="landing-steps">
          <div className="landing-step">
            <span className="landing-step-number">01</span>
            <Users size={20} />
            <h3>L’équipe se connecte</h3>
            <p>Chaque joueur clique son prénom. Une équipe entre quand tout le monde est là.</p>
          </div>
          <div className="landing-step">
            <span className="landing-step-number">02</span>
            <KeyRound size={20} />
            <h3>Cinq salles à ouvrir</h3>
            <p>Des quiz de handball, des indices privés et un code à assembler.</p>
          </div>
          <div className="landing-step">
            <span className="landing-step-number">03</span>
            <MessageCircle size={20} />
            <h3>Un chat pour coopérer</h3>
            <p>Le seul endroit où circulent les indices. Jev veille au respect.</p>
          </div>
        </section>

        <section className="landing-prof">
          <div>
            <p className="eyebrow">Côté professeur</p>
            <h2>Un dashboard pour lancer, suivre et débriefer.</h2>
            <p>
              Importe ta liste, ouvre le salon, partage un lien, lance la partie. Tu vois les connexions, les salles, les
              scores et les messages. En fin de partie, tu récupères les quiz individuels, les messages d’entraide et
              l’export CSV.
            </p>
            <Link to="/admin" className="btn btn-primary">
              Ouvrir le dashboard <ArrowRight size={17} />
            </Link>
          </div>
          <div className="landing-prof-badges">
            <Badge tone="info"><ShieldCheck size={13} /> Modération Jev</Badge>
            <Badge tone="success"><Users size={13} /> Sas d’équipe</Badge>
            <Badge tone="warning"><Trophy size={13} /> Bilan individuel</Badge>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Logo compact />
        <span>Vestiaire 7 · un escape game de handball pour jouer en équipe.</span>
      </footer>
    </div>
  );
}

function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const normalizedCode = (code ?? '').toUpperCase();
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get('team') ?? undefined;
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState('');
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof api.roster>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = loadSession(normalizedCode);
    if (!stored) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api
      .join(normalizedCode, { playerId: stored.playerId, token: stored.token })
      .then(() => {
        if (!cancelled) navigate(`/play/${normalizedCode}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          clearSession(normalizedCode);
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedCode, navigate]);

  const loadRoster = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api.roster(normalizedCode, pin, teamId);
      setRoster(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ouvrir la liste.');
    } finally {
      setBusy(false);
    }
  };

  const joinAs = async (playerId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.join(normalizedCode, { pin, playerId });
      saveSession(normalizedCode, { playerId: response.player.id, token: response.token });
      navigate(`/play/${normalizedCode}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
      if (err instanceof ApiError && err.status === 409) {
        try {
          setRoster(await api.roster(normalizedCode, pin, teamId));
        } catch {
          // ignore
        }
      }
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="join-page">
        <Logo />
        <Spinner label="Reprise de ta session" />
        <p>Reprise de ta session…</p>
      </div>
    );
  }

  return (
    <div className="join-page">
      <div className="join-page-topbar">
        <Logo />
        <ThemeToggle />
      </div>
      <Card className="join-page-card">
        <div className="join-page-head">
          <div>
            <p className="eyebrow">Rejoindre la partie</p>
            <h1>{roster?.game.title ?? 'Vestiaire 7'}</h1>
          </div>
          {roster ? <Badge tone="info">{roster.game.status === 'live' ? 'Partie en cours' : 'Salon ouvert'}</Badge> : null}
        </div>

        {!roster ? (
          <>
            <p className="join-page-lede">
              Entre le code d’accès à quatre chiffres que ton professeur a partagé avec le lien. Ensuite, tu retrouveras
              ton prénom dans ta liste d’équipe.
            </p>
            <form onSubmit={loadRoster} className="join-pin-form">
              <label className="field-label" htmlFor="join-pin">
                Code d’accès
              </label>
              <CodeInput value={pin} onChange={setPin} length={4} numeric label="Code d’accès à quatre chiffres" autoFocus />
              <Button type="submit" size="lg" loading={busy} disabled={pin.length !== 4} icon={<KeyRound size={18} />}>
                Voir mon équipe
              </Button>
            </form>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="fine-print">
              Le code se trouve dans le message de ton professeur. Si tu ne l’as pas, demande-le avant de continuer.
            </p>
          </>
        ) : (
          <>
            <p className="join-page-lede">
              {roster.teams.length > 1
                ? 'Trouve ton équipe et clique sur ton prénom. Si ton prénom est déjà connecté, demande au prof de libérer la place.'
                : 'Clique sur ton prénom pour entrer. Si ton prénom est déjà connecté, demande au prof de libérer la place.'}
            </p>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="join-teams">
              {roster.teams.map((team) => (
                <section key={team.id} className="join-team" data-color={team.color}>
                  <div className="join-team-head">
                    <TeamChip name={team.name} color={team.color} />
                    <span className="fine-print">
                      {team.players.filter((player) => player.status === 'active' && player.connected).length}/
                      {team.players.filter((player) => player.status === 'active').length} connectés
                    </span>
                  </div>
                  <div className="join-player-list">
                    {team.players.map((player) => {
                      const disabled = player.status === 'absent' || player.connected || busy;
                      return (
                        <button
                          key={player.id}
                          type="button"
                          className={cn('join-player-button', player.connected && 'is-connected', player.status === 'absent' && 'is-absent')}
                          disabled={disabled}
                          onClick={() => void joinAs(player.id)}
                        >
                          <Avatar name={player.name} color={team.color} size="sm" />
                          <span>{player.name}</span>
                          {player.status === 'absent' ? (
                            <Badge tone="neutral">Absent</Badge>
                          ) : player.connected ? (
                            <ConnectionDot connected label="Connecté" />
                          ) : (
                            <span className="join-player-cta">Je suis {player.name.split(' ')[0]} <ArrowRight size={14} /></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="join-page-foot">
              <span className="fine-print">Ce n’est pas toi ? Demande à ton prof de corriger la liste.</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRoster(null);
                  setPin('');
                  setError(null);
                }}
              >
                Changer de code
              </Button>
            </div>
          </>
        )}
      </Card>
      <p className="join-page-note">
        <MessageCircle size={15} /> Le chat d’équipe est vérifié par Jev. Ton professeur peut le lire.
      </p>
    </div>
  );
}

function PlayPage() {
  const { code } = useParams<{ code: string }>();
  const normalizedCode = (code ?? '').toUpperCase();
  const [session] = useState<PlayerSession | null>(() => loadSession(normalizedCode));
  if (!session) return <Navigate to={`/j/${normalizedCode}`} replace />;
  return <PlayerSession code={normalizedCode} session={session} />;
}

function PlayerSession({ code, session }: { code: string; session: PlayerSession }) {
  const {
    state,
    connected,
    connectionError,
    fatal,
    pending,
    blocked,
    setBlocked,
    toasts,
    dismissToast,
    socket,
    sendMessage,
    reportMessage,
  } = usePlayerSocket(code, session);

  if (fatal) {
    return (
      <ErrorScreen
        title="La partie s’est arrêtée"
        message={fatal}
        action={
          <Link to={`/j/${code}`} className="btn btn-primary">
            Rejoindre la partie
          </Link>
        }
      />
    );
  }

  if (!state) {
    return (
      <div className="play-loading">
        <Logo />
        <Spinner label="Connexion au vestiaire" />
        <p>{connectionError ?? 'Connexion au vestiaire…'}</p>
      </div>
    );
  }

  return (
    <PlayerGame
      code={code}
      state={state}
      connected={connected}
      connectionError={connectionError}
      pending={pending}
      blocked={blocked}
      setBlocked={setBlocked}
      toasts={toasts}
      dismissToast={dismissToast}
      socket={socket}
      sendMessage={sendMessage}
      reportMessage={reportMessage}
    />
  );
}

function NotFound() {
  return (
    <div className="not-found">
      <Logo />
      <Card className="not-found-card">
        <Badge tone="warning">404</Badge>
        <h1>Cette page n’existe pas.</h1>
        <p>Le lien est peut-être incomplet. Demande le bon lien à ton professeur.</p>
        <div className="not-found-actions">
          <Link to="/" className="btn btn-primary">
            Retour à l’accueil
          </Link>
          <Link to="/admin" className="btn btn-ghost">
            Espace prof
          </Link>
        </div>
      </Card>
    </div>
  );
}
