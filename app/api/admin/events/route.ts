import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin.from("events").insert({ ...parsed.data, created_by: user.id }).select("*").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "此活動網址 Slug 已被使用" }, { status: 409 });
      if (error.code === "PGRST204" && error.message?.includes("registration_start_at")) {
        return NextResponse.json({ error: "資料庫尚未完成『開始報名日期』更新，請先套用 Supabase Migration：202608040001_add_registration_start_at.sql" }, { status: 503 });
      }
      if (error.code === "23514") return NextResponse.json({ error: "開始報名時間必須早於或等於截止報名時間" }, { status: 400 });
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Create event failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能建立活動：${error.message}` : "未能建立活動" }, { status: 500 });
  }
}
