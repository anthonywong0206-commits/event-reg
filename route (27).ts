import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { emailNotificationSettingsSchema } from "@/lib/validators";

export async function PUT(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const parsed = emailNotificationSettingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "電郵設定不完整" }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_email_notification_settings")
      .upsert({ setting_key: "registration_confirmation", ...parsed.data, updated_by: user.id }, { onConflict: "setting_key" })
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST205" || error.code === "PGRST204") {
        return NextResponse.json({ error: "資料庫尚未完成電郵範本更新，請套用 Migration：202608050002_add_email_notification_settings.sql" }, { status: 503 });
      }
      throw error;
    }
    revalidatePath("/admin/email-settings");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Update email notification settings failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能更新電郵設定：${error.message}` : "未能更新電郵設定" }, { status: 500 });
  }
}
