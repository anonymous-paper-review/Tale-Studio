// Tale-Studio/.env.local 파서 — 값은 절대 출력/로깅하지 않는다.
// 필요 키: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (옵션) GEMINI_API_KEY
import { readFileSync } from 'node:fs';

export type Env = Map<string, string>;

export function loadEnv(path: string): Env {
  const env: Env = new Map();
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env.set(key, val);
  }
  return env;
}

export function requireEnv(env: Env, key: string): string {
  const v = env.get(key);
  if (!v) throw new Error(`.env.local에 ${key} 가 없습니다 (키 이름만 표기, 값은 출력하지 않음)`);
  return v;
}
