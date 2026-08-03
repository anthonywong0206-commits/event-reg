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
      throw error;
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "未能建立活動" }, { status: 500 });
  }
}
