/**
 * Build-time settings (Vite inlines VITE_* variables). Missing ones fail
 * loudly at start-up rather than as a confusing network error later.
 */
function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: required("VITE_SUPABASE_PUBLISHABLE_KEY", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
  siteUrl: (import.meta.env.VITE_SITE_URL ?? "https://goqubiq.com").replace(/\/$/, ""),
};
