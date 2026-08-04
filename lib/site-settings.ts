import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import type { SiteSettingsRecord } from "@/lib/types";

export const DEFAULT_SITE_SETTINGS: SiteSettingsRecord = {
  setting_key: "homepage",
  hero_title: "連結人與活動\n創造更多可能",
  hero_description: "發掘精彩活動、學習新知、參與社群。從活動海報到電子入場證，讓每一次參與都更簡單。",
  hero_image_url: "/images/hero-community.jpg",
  hero_image_alt: "明亮的社區活動空間",
};

export const getPublicSiteSettings = cache(async (): Promise<SiteSettingsRecord> => {
  if (!isSupabaseConfigured()) return DEFAULT_SITE_SETTINGS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("event_site_settings")
      .select("setting_key, hero_title, hero_description, hero_image_url, hero_image_alt, updated_at")
      .eq("setting_key", "homepage")
      .maybeSingle();

    if (error) throw error;
    return (data as SiteSettingsRecord | null) ?? DEFAULT_SITE_SETTINGS;
  } catch (error) {
    console.error("Unable to fetch homepage settings:", error);
    return DEFAULT_SITE_SETTINGS;
  }
});

export async function getSiteSettingsForAdmin(): Promise<SiteSettingsRecord> {
  if (!isServiceRoleConfigured()) return DEFAULT_SITE_SETTINGS;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_site_settings")
    .select("*")
    .eq("setting_key", "homepage")
    .maybeSingle();

  if (error) throw error;
  return (data as SiteSettingsRecord | null) ?? DEFAULT_SITE_SETTINGS;
}
