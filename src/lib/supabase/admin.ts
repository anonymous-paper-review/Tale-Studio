import { createClient } from '@supabase/supabase-js'

// Server-only admin client with service role key
// Use this in API routes for write operations (INSERT/UPDATE/DELETE)
// Never import this in client-side code
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
