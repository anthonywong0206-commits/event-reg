import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { siteSettingsSchema } from "@/lib/validators";

export async function PUT(request: Request) {
  try {
    const { user } = await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const parsed = siteSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "首頁橫額資料不完整" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("event_site_settings")
      .upsert(
        {
          setting_key: "homepage",
          ...parsed.data,
          updated_by: user.id,
        },
        { onConflict: "setting_key" },
      )
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST205" || error.code === "PGRST204") {
        return NextResponse.json(
          { error: "資料庫尚未完成『首頁橫額設定』更新，請先套用 Migration：202608040002_add_homepage_hero_settings.sql" },
          { status: 503 },
        );
      }
      throw error;
    }

    revalidatePath("/");
    revalidatePath("/admin/site-settings");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Update homepage settings failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能更新首頁橫額：${error.message}` : "未能更新首頁橫額" },
      { status: 500 },
    );
  }
}
