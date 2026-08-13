import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_PREFIX = "event_invite_";
const ACCESS_TTL_SECONDS = 60 * 60 * 12;

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development-invite-secret";
}

function normalized(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

export function hashInviteCode(code: string): string {
  return createHmac("sha256", secret()).update(`invite-code:${normalized(code)}`).digest("hex");
}

export function inviteCookieName(eventId: string): string {
  return `${COOKIE_PREFIX}${eventId.replace(/-/g, "")}`;
}

export function inviteAccessToken(eventId: string, inviteCodeHash: string): string {
  return createHmac("sha256", secret()).update(`invite-access:${eventId}:${inviteCodeHash}`).digest("hex");
}

export function inviteCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  };
}

export function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function hasInviteAccess(
  cookieValue: string | undefined,
  eventId: string,
  inviteCodeHash: string | null | undefined,
): boolean {
  if (!inviteCodeHash || !cookieValue) return false;
  return safeEqual(cookieValue, inviteAccessToken(eventId, inviteCodeHash));
}
