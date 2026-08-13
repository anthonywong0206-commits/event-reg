import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";
import { hashInviteCode } from "@/lib/invite-access";
import { normalizeSessionDateTimeList } from "@/lib/session-time";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });
    const admin = createAdminClient();
    const { data: existing } = await admin.from("events").select("confirmed_count,is_multi_session,invite_code_hash").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    const { sessions: rawSessions, invite_code, ...eventPayload } = parsed.data;
    const sessions = normalizeSessionDateTimeList(rawSessions);
    const invalidSession = sessions.find((session) => new Date(session.end_at).getTime() <= new Date(session.start_at).getTime());
    if (invalidSession) return NextResponse.json({ error: `${invalidSession.session_date} 有時段的結束時間必須遲於開始時間` }, { status: 400 });
    if (eventPayload.registration_visibility === "private" && !invite_code && !existing.invite_code_hash) {
      return NextResponse.json({ error: "非公開報名活動必須設定邀請碼" }, { status: 400 });
    }
    const firstStart = sessions.length ? sessions.map((item) => item.start_at).sort()[0] : eventPayload.start_at;
    const lastEnd = sessions.length ? sessions.map((item) => item.end_at).sort().at(-1)! : eventPayload.end_at;
    const totalCapacity = eventPayload.is_multi_session ? sessions.reduce((sum, item) => sum + item.capacity, 0) : eventPayload.capacity;
    if (totalCapacity < existing.confirmed_count) return NextResponse.json({ error: `總名額不可低於目前已確認人數 ${existing.confirmed_count}` }, { status: 409 });

    if (eventPayload.is_multi_session) {
      const sessionPayload = sessions.map((session, index) => ({
        ...(session.id ? { id: session.id } : {}),
        session_date: session.session_date,
        start_at: session.start_at,
        end_at: session.end_at,
        capacity: session.capacity,
        sort_order: index,
        is_active: session.is_active,
      }));
      const sessionResult = await admin.rpc("replace_event_sessions_safe", {
        p_event_id: id,
        p_sessions: sessionPayload,
      });
      if (sessionResult.error) {
        const message = sessionResult.error.message || "";
        if (message.includes("SESSION_HAS_REGISTRATIONS")) return NextResponse.json({ error: "要刪除的時段仍有報名紀錄（包括候補或已取消紀錄），請保留該時段或先處理相關紀錄。" }, { status: 409 });
        if (message.includes("SESSION_CAPACITY_BELOW_CONFIRMED")) return NextResponse.json({ error: "時段名額不可低於該時段已確認人數。" }, { status: 409 });
        if (message.includes("DUPLICATE_SESSION_START")) return NextResponse.json({ error: "同一活動不可有兩個完全相同的開始時間，請調整其中一個時段。" }, { status: 409 });
        if (message.includes("SESSION_END_BEFORE_START")) return NextResponse.json({ error: "有時段的結束時間早於或等於開始時間，請檢查設定。" }, { status: 400 });
        if (message.includes("SESSION_NOT_FOUND")) return NextResponse.json({ error: "部分時段資料已被其他操作更新，請重新整理頁面後再試。" }, { status: 409 });
        throw sessionResult.error;
      }
    } else if (existing.is_multi_session) {
      const assigned = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", id).not("session_id", "is", null);
      if ((assigned.count || 0) > 0) return NextResponse.json({ error: "活動已有多時段參加者，不可改回單一時段" }, { status: 409 });
      await admin.from("event_sessions").delete().eq("event_id", id);
    }

    const updatePayload = {
      ...eventPayload,
      ...(invite_code ? { invite_code_hash: hashInviteCode(invite_code) } : {}),
      start_at: firstStart,
      end_at: lastEnd,
      capacity: totalCapacity,
    };
    const { data, error } = await admin.from("events").update(updatePayload).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Update event failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能更新活動：${error.message}` : "未能更新活動" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.from("events").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "活動已有報名紀錄，請改為取消狀態" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    return NextResponse.json({ error: "未能刪除活動" }, { status: 500 });
  }
}
