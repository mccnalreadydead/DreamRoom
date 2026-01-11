import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Safe stub so app does not crash without env vars
export const supabase: any = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signOut: async () => ({ error: null }),
        signInWithOtp: async () => ({
          data: null,
          error: new Error("Supabase not configured"),
        }),
      },
    };
