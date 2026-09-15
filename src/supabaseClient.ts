import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
const supabaseAuthEnabled = import.meta.env.VITE_ENABLE_SUPABASE_AUTH !== "false";

export const isSupabaseBrowserConfigured = Boolean(supabaseAuthEnabled && supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isSupabaseBrowserConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
