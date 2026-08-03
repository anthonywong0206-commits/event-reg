"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="button button-ghost button-small"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace("/admin/login");
        router.refresh();
      }}
      type="button"
    >
      <LogOut />登出
    </button>
  );
}
