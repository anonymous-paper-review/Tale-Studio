// 화면 코드가 이 파일을 가져다 쓰면 빌드가 깨진다(#server-only-key-boundary 2026-09-08) —
//   아래 주석은 사람에게만 보이는 경고였고, 실수를 막는 건 이 import 한 줄이다.
//   클라이언트 번들에 SERVICE_ROLE 키가 실리는 사고를 컴파일 시점에 차단한다.
import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Server-only admin client with service role key
// Use this in API routes for write operations (INSERT/UPDATE/DELETE)
// Never import this in client-side code
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
