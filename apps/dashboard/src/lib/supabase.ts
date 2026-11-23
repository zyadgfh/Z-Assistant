import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The publishable key and project URL are public by design and protected by
 * RLS policies. Override them with NEXT_PUBLIC_* variables when needed.
 * The secret key never lives in this repository or in client code.
 */
const DEFAULT_URL = "https://ljfydqtrbhjlijwdajpl.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_jUzh8Sy3YmMFJfCfQIh87Q_rEaWBX0o";

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}
