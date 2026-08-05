export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function appUrl(): string {
  const deploymentUrl = process.env.VERCEL_URL?.replace(/\/$/, "");

  // Preview QR codes must point back to the exact Preview deployment, even when
  // NEXT_PUBLIC_APP_URL is set to the production domain at project level.
  if (process.env.VERCEL_ENV === "preview" && deploymentUrl) {
    return `https://${deploymentUrl}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (deploymentUrl) return `https://${deploymentUrl}`;
  return "http://localhost:3000";
}

export function isCronSecretConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim());
}
