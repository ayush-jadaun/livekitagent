import { createClient } from "@supabase/supabase-js";

// Replace with your own Supabase project URL and public anon key
const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL! ||
  "https://qivmwvqzgyykzmmofnqz.supabase.co";
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY! ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdm13dnF6Z3l5a3ptbW9mbnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwOTg2MTEsImV4cCI6MjA2NjY3NDYxMX0.PXgDuFeOBHmbu60HWlPv8g6aaVfFX4oTP_wB-A8kRFQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
