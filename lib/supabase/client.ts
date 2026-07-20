import { createClient } from '@/utils/supabase/client';

// Single shared browser client (cookie-based via @supabase/ssr).
// Existing modules import `{ supabase }` from here — keep that contract.
export const supabase = createClient();
