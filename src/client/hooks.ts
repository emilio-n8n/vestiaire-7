import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminState, PlayerState } from '../shared/types';
import { connectAdmin, connectPlayer, type AdminSocket, type PlayerSocket } from './socket';
import { useToasts } from './ui';
import { newClientId } from './utils';
import { clearSession, type PlayerSession } from './session';

export interface PendingMessage {
  clientId: string;
  body: string;
  createdAt: number;
}

export interface BlockedMessage {
  clientId: string;
  reason: string;
  category: string;
  body: string;
}

export function usePlayerSocket(code: string, session: PlayerSession) {
  const [state, setState] = useState<PlayerState | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [blocked, setBlocked] = useState<BlockedMessage | null>(null);
  const { toasts, push, dismiss } = useToasts();
  const socketRef = useRef<PlayerSocket | null>(null);
  const pendingRef = useRef<PendingMessage[]>([]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const socket = connectPlayer(code, session.playerId, session.token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(null);
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });
    socket.on('connect_error', (error) => {
      setConnected(false);
      if (error.message === 'player-unauthorized' || error.message === 'game-unavailable') {
        clearSession(code);
        setFatal(
          error.message === 'game-unavailable'
            ? 'Cette partie n’est plus disponible. Demande le lien au professeur.'
            : 'Ta session a expiré. Rejoins la partie avec le code d’accès.',
        );
        socket.disconnect();
      } else {
        setConnectionError('Connexion au serveur impossible. Nouvelle tentative…');
      }
    });
    socket.on('state', (next) => {
      setState(next);
      setConnectionError(null);
    });
    socket.on('message', (message) => {
      setState((current) => {
        if (!current) return current;
        const exists = current.messages.some((item) => item.id === message.id);
        const messages = exists ? current.messages : [...current.messages, message].slice(-80);
        return { ...current, messages };
      });
      if (message.clientId) {
        setPending((current) => current.filter((item) => item.clientId !== message.clientId));
      }
    });
    socket.on('message:pending', (payload) => {
      setPending((current) => {
        if (current.some((item) => item.clientId === payload.clientId)) return current;
        return [...current, payload].slice(-8);
      });
    });
    socket.on('message:blocked', (payload) => {
      const found = pendingRef.current.find((item) => item.clientId === payload.clientId);
      setBlocked({
        clientId: payload.clientId,
        reason: payload.reason,
        category: payload.category,
        body: found?.body ?? '',
      });
      setPending((current) => current.filter((item) => item.clientId !== payload.clientId));
    });
    socket.on('message:hidden', (payload) => {
      setState((current) => {
        if (!current) return current;
        return { ...current, messages: current.messages.filter((message) => message.id !== payload.messageId) };
      });
    });
    socket.on('toast', (payload) => {
      push(payload.type, payload.message);
    });
    socket.on('session:released', (payload) => {
      clearSession(code);
      setFatal(payload.message);
      socket.disconnect();
    });
    socket.on('game:deleted', () => {
      clearSession(code);
      setFatal('La partie a été supprimée par le professeur.');
      socket.disconnect();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, session.playerId, session.token, push]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPending((current) => current.filter((item) => Date.now() - item.createdAt < 15_000));
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const sendMessage = useCallback(
    (body: string) => {
      const clean = body.trim();
      if (!clean || clean.length > 400) return;
      setBlocked(null);
      socketRef.current?.emit('player:message', { body: clean, clientId: newClientId() });
    },
    [],
  );

  const reportMessage = useCallback((messageId: string) => {
    socketRef.current?.emit('player:report', { messageId });
  }, []);

  return {
    state,
    connected,
    connectionError,
    fatal,
    pending,
    blocked,
    setBlocked,
    toasts,
    dismissToast: dismiss,
    socket: socketRef.current,
    sendMessage,
    reportMessage,
  };
}

export function useAdminSocket(gameId: string) {
  const [state, setState] = useState<AdminState | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const socketRef = useRef<AdminSocket | null>(null);

  useEffect(() => {
    const socket = connectAdmin();
    socketRef.current = socket;
    const subscribe = () => socket.emit('admin:subscribe', { gameId });
    socket.on('connect', () => {
      setConnected(true);
      setConnectionError(null);
      subscribe();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      setConnected(false);
      setConnectionError(
        error.message === 'admin-unauthorized'
          ? 'Session professeur expirée. Reconnecte-toi.'
          : 'Connexion au serveur impossible. Nouvelle tentative…',
      );
    });
    socket.on('admin:state', (next) => {
      setState(next);
      setConnectionError(null);
    });
    socket.on('admin:toast', (payload) => push(payload.type, payload.message));
    socket.on('game:deleted', () => setDeleted(true));
    if (socket.connected) subscribe();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [gameId, push]);

  return { state, connected, connectionError, deleted, toasts, dismissToast: dismiss, socket: socketRef.current };
}
