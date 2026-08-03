"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase 尚未設定。請先設定 NEXT_PUBLIC_SUPABASE_URL 及 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。");
  }
  return createBrowserClient(url, key);
}
