import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { hashInviteCode, inviteAccessToken, inviteCookieName, inviteCookieOptions, safeEqual } from "@/lib/invite-access";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "系統暫時未能驗證邀請碼" }, { status: 503 });
    }
    const { slug } = await params;
    const payload = await request.json().catch(() => ({}));
    const inviteCode = typeof payload?.inviteCode === "string" ? payload.inviteCode.trim() : "";
    if (inviteCode.length < 4 || inviteCode.length > 40) {
      return NextResponse.json({ error: "請輸入有效邀請碼" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: event, error } = await admin
      .from("events")
      .select("id,slug,status,registration_visibility,invite_code_hash")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !event || event.status !== "published") {
      return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    }

    if (event.registration_visibility !== "private") {
      return NextResponse.json({ ok: true, public: true });
    }

    if (!event.invite_code_hash || !safeEqual(hashInviteCode(inviteCode), event.invite_code_hash)) {
      return NextResponse.json({ error: "邀請碼不正確，請重新輸入" }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(inviteCookieName(event.id), inviteAccessToken(event.id, event.invite_code_hash), inviteCookieOptions());
    return response;
  } catch (error) {
    console.error("Invite code verification failed", error);
    return NextResponse.json({ error: "系統暫時未能驗證邀請碼，請稍後再試" }, { status: 500 });
  }
}
