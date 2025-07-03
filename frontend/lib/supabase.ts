import { createClient } from "@supabase/supabase-js";

// Replace with your own Supabase project URL and public anon key
const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL! ||
  "https://oeowbpmsshfzgxrnuwlq.supabase.co";
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY! ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lb3dicG1zc2hmemd4cm51d2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDMwNzMsImV4cCI6MjA2Njc3OTA3M30.hASuMcPWk_IujgU4NlGQxrG641-TtNXY3l-1SuThVk0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
