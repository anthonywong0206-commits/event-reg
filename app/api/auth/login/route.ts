import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function safeNextPath(value: unknown): string {
  const path = typeof value === "string" ? value : "/admin";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/admin";
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const nextPath = safeNextPath(body.next);

  if (!email || !password) {
    return NextResponse.json({ error: "請輸入管理員電郵及密碼。" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "伺服器缺少 Supabase 設定。" }, { status: 503 });
  }

  let cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookiesToSet = cookies;
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return NextResponse.json({ error: "電郵或密碼不正確。" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    const response = NextResponse.json({ error: "此帳戶沒有後台權限。" }, { status: 403 });
    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  }

  const response = contentType.includes("application/json")
    ? NextResponse.json({ ok: true, next: nextPath })
    : NextResponse.redirect(new URL(nextPath, request.url), 303);
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
