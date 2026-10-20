import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";
import { hashInviteCode } from "@/lib/invite-access";
import { normalizeSessionDateTimeList } from "@/lib/session-time";

export async function POST(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });

    const admin = createAdminClient();
    const { sessions: rawSessions, sub_activities: subActivities, sub_activity_definitions: _legacyDefinitions, invite_code, ...basePayload } = parsed.data;
    const mode = basePayload.external_registration ? "external" : basePayload.event_mode;
    const sessions = mode === "multi_session" ? normalizeSessionDateTimeList(rawSessions) : [];
    const subSessions = mode === "sub_activity" ? subActivities.flatMap((item) => item.sessions) : [];

    if (!basePayload.external_registration && basePayload.registration_visibility === "private" && !invite_code) {
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

    const eventPayload = {
      ...basePayload,
      event_mode: mode,
      is_multi_session: mode === "multi_session",
      sub_activity_mode: mode === "sub_activity",
      sub_activity_definitions: mode === "sub_activity" ? subActivities.map((item) => ({ id: item.id, name: item.name })) : [],
      start_at: firstStart,
      end_at: lastEnd,
      capacity: totalCapacity,
      invite_code_hash: invite_code ? hashInviteCode(invite_code) : null,
      created_by: user.id,
    };

    const { data, error } = await admin.from("events").insert(eventPayload).select("*").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "此活動網址 Slug 已被使用" }, { status: 409 });
      throw error;
    }

    try {
      if (mode === "multi_session" && sessions.length > 0) {
        const { error: sessionError } = await admin.from("event_sessions").insert(sessions.map((session, index) => ({
          event_id: data.id,
          session_date: session.session_date,
          start_at: session.start_at,
          end_at: session.end_at,
          capacity: session.capacity,
          sort_order: index,
          is_active: session.is_active,
          sub_activity_name: null,
          sub_activity_key: null,
        })));
        if (sessionError) throw sessionError;
      }

      if (mode === "sub_activity") {
        const { error: subActivityError } = await admin.rpc("replace_event_sub_activities_v2", {
          p_event_id: data.id,
          p_items: subActivities,
        });
        if (subActivityError) throw subActivityError;
      }
    } catch (childError) {
      await admin.from("events").delete().eq("id", data.id);
      throw childError;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Create event failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能建立活動：${error.message}` : "未能建立活動" }, { status: 500 });
  }
}
