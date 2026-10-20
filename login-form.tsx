"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath = "/admin", configured }: { nextPath?: string; configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setError("此預覽尚未連接 Supabase。請按 README 完成雲端設定。");
      return;
    }
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: String(data.get("email") || ""),
        password: String(data.get("password") || ""),
      });
      if (authError) throw authError;
      router.replace(nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登入失敗");
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="field"><span>管理員電郵</span><input name="email" type="email" autoComplete="email" required /></label>
      <label className="field"><span>密碼</span><input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <div className="notice notice-error"><AlertCircle />{error}</div>}
      <button className="button button-primary button-large" disabled={loading} type="submit">
        {loading ? <><LoaderCircle className="spin" />登入中…</> : <><LogIn />登入管理後台</>}
      </button>
    </form>
  );
}
