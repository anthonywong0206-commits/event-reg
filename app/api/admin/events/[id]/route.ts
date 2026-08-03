import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });
    const admin = createAdminClient();
    const { data: existing } = await admin.from("events").select("confirmed_count").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (parsed.data.capacity < existing.confirmed_count) return NextResponse.json({ error: `名額上限不可低於目前已確認人數 ${existing.confirmed_count}` }, { status: 409 });
    const { data, error } = await admin.from("events").update(parsed.data).eq("id", id).select("*").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "此活動網址 Slug 已被使用" }, { status: 409 });
      throw error;
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "未能更新活動" }, { status: 500 });
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
      if (error.code === "23503") return NextResponse.json({ error: "活動已有報名紀錄，請改為「取消」狀態而非刪除" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "未能刪除活動" }, { status: 500 });
  }
}
