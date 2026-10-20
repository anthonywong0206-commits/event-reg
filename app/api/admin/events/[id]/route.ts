import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";
import { hashInviteCode } from "@/lib/invite-access";
import { normalizeSessionDateTimeList } from "@/lib/session-time";

function subActivityRpcError(message: string) {
  if (message.includes("SESSION_HAS_REGISTRATIONS")) return { error: "要刪除的子活動時段已有報名紀錄，請保留該時段。", status: 409 };
  if (message.includes("SUB_ACTIVITY_HAS_REGISTRATIONS")) return { error: "要刪除的子活動已有報名紀錄，請保留該子活動。", status: 409 };
  if (message.includes("SESSION_CAPACITY_BELOW_CONFIRMED")) return { error: "子活動時段名額不可低於目前已確認人數。", status: 409 };
  if (message.includes("DUPLICATE_SUB_ACTIVITY_NAME")) return { error: "子活動名稱不可重複。", status: 409 };
  if (message.includes("DUPLICATE_SESSION_START")) return { error: "同一子活動不可有兩個完全相同的開始時間。", status: 409 };
  if (message.includes("SESSION_END_BEFORE_START")) return { error: "有子活動時段的結束時間早於或等於開始時間。", status: 400 };
  if (message.includes("SUB_ACTIVITY_ID_CONFLICT") || message.includes("SESSION_ID_CONFLICT")) return { error: "子活動資料識別衝突，請重新整理頁面後再試。", status: 409 };
  return null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });

    const admin = createAdminClient();
    const { data: existing } = await admin.from("events").select("confirmed_count,event_mode,is_multi_session,sub_activity_mode,invite_code_hash").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "找不到活動" }, { status: 404 });

    const { sessions: rawSessions, sub_activities: subActivities, sub_activity_definitions: _legacyDefinitions, invite_code, ...basePayload } = parsed.data;
    const mode = basePayload.external_registration ? "external" : basePayload.event_mode;
    const sessions = mode === "multi_session" ? normalizeSessionDateTimeList(rawSessions) : [];
    const subSessions = mode === "sub_activity" ? subActivities.flatMap((item) => item.sessions) : [];

    if (!basePayload.external_registration && basePayload.registration_visibility === "private" && !invite_code && !existing.invite_code_hash) {
      return NextResponse.json({ error: "非公開報名活動必須設定邀請碼" }, { status: 400 });
    }

    const activeStarts = mode === "multi_session" ? sessions.map((item) => item.start_at) : mode === "sub_activity" ? subSessions.map((item) => item.start_at) : [];
    const activeEnds = mode === "multi_session" ? sessions.map((item) => item.end_at) : mode === "sub_activity" ? subSessions.map((item) => item.end_at) : [];
    const firstStart = activeStarts.length ? [...activeStarts].sort()[0] : basePayload.start_at;
    const lastEnd = activeEnds.length ? [...activeEnds].sort().at(-1)! : basePayload.end_at;
    const totalCapacity = mode === "multi_session"
      ? Math.max(1, sessions.reduce((sum, item) => sum + item.capacity, 0))
      : mode === "sub_activity"
        ? Math.max(1, subSessions.reduce((sum, item) => sum + item.capacity, 0))
        : basePayload.capacity;

    if (mode === "single" && totalCapacity < existing.confirmed_count) {
      return NextResponse.json({ error: `總名額不可低於目前已確認人數 ${existing.confirmed_count}` }, { status: 409 });
    }

    if (mode === "multi_session") {
      const activePayload = sessions.map((session, index) => ({
        ...(session.id ? { id: session.id } : {}),
        session_date: session.session_date,
        start_at: session.start_at,
        end_at: session.end_at,
        capacity: session.capacity,
        sort_order: index,
        is_active: session.is_active,
        sub_activity_name: null,
        sub_activity_key: null,
      }));
      const result = await admin.rpc("replace_event_sessions_safe", { p_event_id: id, p_sessions: activePayload });
      if (result.error) {
        const message = result.error.message || "";
        if (message.includes("SESSION_HAS_REGISTRATIONS")) return NextResponse.json({ error: "要刪除的時段仍有報名紀錄，請保留該時段或先處理相關紀錄。" }, { status: 409 });
        if (message.includes("SESSION_CAPACITY_BELOW_CONFIRMED")) return NextResponse.json({ error: "時段名額不可低於該時段已確認人數。" }, { status: 409 });
        if (message.includes("DUPLICATE_SESSION_START")) return NextResponse.json({ error: "同一活動不可有兩個完全相同的開始時間。" }, { status: 409 });
        throw result.error;
      }
    }

    if (mode === "sub_activity") {
      const result = await admin.rpc("replace_event_sub_activities_v2", { p_event_id: id, p_items: subActivities });
      if (result.error) {
        const known = subActivityRpcError(result.error.message || "");
        if (known) return NextResponse.json({ error: known.error }, { status: known.status });
        throw result.error;
      }
    }

    const updatePayload = {
      ...basePayload,
      event_mode: mode,
      is_multi_session: mode === "multi_session",
      sub_activity_mode: mode === "sub_activity",
      sub_activity_definitions: mode === "sub_activity" ? subActivities.map((item) => ({ id: item.id, name: item.name })) : [],
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
