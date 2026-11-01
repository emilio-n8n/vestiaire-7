import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import type { Socket } from 'socket.io';
import { db } from './db.js';
import { config } from './config.js';
import { now, safeEqual, sha256 } from './util.js';

function hashSession(token: string): string {
  return sha256(`admin:${token}`);
}

export function checkPassword(input: string): boolean {
  return safeEqual(input, config.adminPassword);
}

export function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = hashSession(token);
  const created = now();
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(created);
  db.prepare('INSERT INTO admin_sessions (id, created_at, expires_at) VALUES (?, ?, ?)').run(
    id,
    created,
    created + config.sessionTtlMs,
  );
  return token;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const row = db
    .prepare('SELECT expires_at FROM admin_sessions WHERE id = ?')
    .get(hashSession(token)) as { expires_at: number } | undefined;
  if (!row) return false;
  if (row.expires_at < now()) {
    db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(hashSession(token));
    return false;
  }
  return true;
}

export function deleteAdminSession(token: string | undefined): void {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(hashSession(token));
}

export function cleanupAdminSessions(): void {
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now());
}

export function adminTokenFromRequest(req: Request): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[config.sessionCookie];
}

export function adminTokenFromSocket(socket: Socket): string | undefined {
  const raw = socket.handshake.headers.cookie;
  if (!raw) return undefined;
  try {
    const parsed = parseCookie(raw);
    return parsed[config.sessionCookie];
  } catch {
    return undefined;
  }
}

export function setAdminCookie(req: Request, res: Response, token: string): void {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: config.sessionTtlMs,
    path: '/',
  });
}

export function clearAdminCookie(req: Request, res: Response): void {
  res.clearCookie(config.sessionCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = adminTokenFromRequest(req);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Connexion professeur requise.' });
    return;
  }
  next();
}

export function isAdminSocket(socket: Socket): boolean {
  return verifyAdminToken(adminTokenFromSocket(socket));
}
