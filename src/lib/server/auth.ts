import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { prisma } from "./db";
import { sha256 } from "./crypto";
import { AppError } from "./errors";
import { assertProductionConfiguration } from "./production-guardrails";
import type { PublicUser } from "../types";

export const SESSION_COOKIE = "image2_session";
const SESSION_DAYS = 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function toPublicUser(user: {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  jobMonitorClearedAt?: Date | string | null;
  jobMonitorFinishedClearedAt?: Date | string | null;
}): PublicUser {
  const jobMonitorClearedAt = user.jobMonitorClearedAt instanceof Date
    ? user.jobMonitorClearedAt.toISOString()
    : user.jobMonitorClearedAt ?? null;
  const jobMonitorFinishedClearedAt = user.jobMonitorFinishedClearedAt instanceof Date
    ? user.jobMonitorFinishedClearedAt.toISOString()
    : user.jobMonitorFinishedClearedAt ?? null;

  return {
    id: user.id,
    email: user.email,
    role: user.role === "ADMIN" ? "ADMIN" : "USER",
    disabled: user.disabled,
    jobMonitorClearedAt,
    jobMonitorFinishedClearedAt
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

function getSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  return expiresAt;
}

function shouldUseSecureSessionCookie() {
  const value = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();

  if (value === "false" || value === "0" || value === "no") {
    return false;
  }

  if (value === "true" || value === "1" || value === "yes") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = getSessionExpiry();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    expires: expiresAt
  });
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true }
  });

  if (!session || session.expiresAt <= new Date() || session.user.disabled) {
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() }
    });
  }

  return session;
}

export async function destroyOtherSessions(userId: string, currentSessionId: string) {
  await prisma.session.deleteMany({
    where: {
      userId,
      id: { not: currentSessionId }
    }
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("Authentication required.", 401);
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AppError("Admin access required.", 403);
  }

  return user;
}

export async function ensureInitialAdmin() {
  assertProductionConfiguration();
  const email = normalizeEmail(process.env.INITIAL_ADMIN_EMAIL ?? "");
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";

  if (!email || !password) return;

  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) return;

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: "ADMIN"
    }
  });
}
