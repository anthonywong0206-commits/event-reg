import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";
import { hashInviteCode } from "@/lib/invite-access";

export async function POST(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });
    const admin = createAdminClient();
    const { sessions, invite_code, ...eventPayload } = parsed.data;
    if (eventPayload.registration_visibility === "private" && !invite_code) {
      return NextResponse.json({ error: "非公開報名活動必須設定邀請碼" }, { status: 400 });
    }
    const firstStart = sessions.length ? sessions.map((item) => item.start_at).sort()[0] : eventPayload.start_at;
    const lastEnd = sessions.length ? sessions.map((item) => item.end_at).sort().at(-1)! : eventPayload.end_at;
    const totalCapacity = eventPayload.is_multi_session ? sessions.reduce((sum, item) => sum + item.capacity, 0) : eventPayload.capacity;
    const { data, error } = await admin.from("events").insert({
      ...eventPayload,
      start_at: firstStart,
      end_at: lastEnd,
      capacity: totalCapacity,
      invite_code_hash: invite_code ? hashInviteCode(invite_code) : null,
      created_by: user.id,
    }).select("*").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "此活動網址 Slug 已被使用" }, { status: 409 });
      throw error;
    }
    if (eventPayload.is_multi_session) {
      const { error: sessionError } = await admin.from("event_sessions").insert(sessions.map((session, index) => ({
        event_id: data.id,
        session_date: session.session_date,
        start_at: session.start_at,
        end_at: session.end_at,
        capacity: session.capacity,
        sort_order: index,
        is_active: session.is_active,
      })));
      if (sessionError) {
        await admin.from("events").delete().eq("id", data.id);
        throw sessionError;
      }
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Create event failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能建立活動：${error.message}` : "未能建立活動" }, { status: 500 });
  }
}
