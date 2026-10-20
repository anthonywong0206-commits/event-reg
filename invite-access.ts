import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SECONDS = 20 * 60;

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "local-development-invite-secret";
}

function normalized(value: string): string {
  return value.trim().toLocaleUpperCase("en-US");
}

export function hashInviteCode(code: string): string {
  return createHmac("sha256", secret()).update(`invite-code:${normalized(code)}`).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function signature(payload: string, inviteCodeHash: string): string {
  return createHmac("sha256", secret())
    .update(`invite-page-access:${payload}:${inviteCodeHash}`)
    .digest("base64url");
}

export function createInvitePageAccessToken(eventId: string, inviteCodeHash: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
  const payload = Buffer.from(`${eventId}|${expiresAt}|${randomUUID()}`, "utf8").toString("base64url");
  return `${payload}.${signature(payload, inviteCodeHash)}`;
}

export function verifyInvitePageAccessToken(
  token: string | null | undefined,
  eventId: string,
  inviteCodeHash: string | null | undefined,
): boolean {
  if (!token || !inviteCodeHash) return false;
  const [payload, suppliedSignature, ...rest] = token.split(".");
  if (!payload || !suppliedSignature || rest.length) return false;

  let decoded = "";
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const [tokenEventId, expiresAtRaw, nonce, ...extra] = decoded.split("|");
  if (!tokenEventId || !expiresAtRaw || !nonce || extra.length) return false;
  if (tokenEventId !== eventId) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  return safeEqual(suppliedSignature, signature(payload, inviteCodeHash));
}
