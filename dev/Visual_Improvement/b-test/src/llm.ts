// LLM 백엔드 2종: codex(구독, 기본) / gemini(프로덕션 Visual축 동일 모델 — 충실도 검증용)
// 모든 호출의 프롬프트/응답 원문을 out/llm_calls/ 에 기록한다 (시크릿 없음 — 프롬프트는 DB 내용만 포함).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Env } from './env.ts';
import { requireEnv } from './env.ts';

export type Backend = 'codex' | 'gemini';

export interface LlmCall {
  text: string;
  ms: number;
  retried: boolean;
}

function logCall(outDir: string, label: string, prompt: string, response: string): void {
  const dir = join(outDir, 'llm_calls');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${label}.prompt.md`), prompt);
  writeFileSync(join(dir, `${label}.response.md`), response);
}

function callCodexOnce(prompt: string): string {
  const respPath = join(tmpdir(), `b-test-resp-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
  const r = spawnSync(
    'codex',
    ['exec', '--skip-git-repo-check', '--color', 'never', '-s', 'read-only', '-o', respPath],
    { input: prompt, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`codex exec exit=${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  const text = readFileSync(respPath, 'utf8');
  rmSync(respPath, { force: true });
  return text;
}

async function callGeminiOnce(env: Env, prompt: string): Promise<string> {
  const key = requireEnv(env, 'GEMINI_API_KEY');
  // 모델: Tale-Studio writer Visual축과 동일 (dispatch.ts 기준 gemini-3-flash-preview)
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini 응답에 텍스트 없음');
  return text;
}

export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('JSON 블록을 찾지 못함');
  return JSON.parse(t.slice(first, last + 1));
}

/** 1회 파싱 재시도 포함 생성 (재시도는 파싱 실패 시에만 — 과금 미디어 호출 아님). */
export async function generateJson(
  backend: Backend,
  env: Env,
  prompt: string,
  outDir: string,
  label: string,
): Promise<{ value: unknown; call: LlmCall }> {
  const t0 = Date.now();
  let retried = false;
  let text = backend === 'codex' ? callCodexOnce(prompt) : await callGeminiOnce(env, prompt);
  logCall(outDir, label, prompt, text);
  try {
    return { value: extractJson(text), call: { text, ms: Date.now() - t0, retried } };
  } catch (e) {
    retried = true;
    const retryPrompt = `${prompt}\n\n---\n이전 응답이 JSON 파싱에 실패했다 (${(e as Error).message}).\n설명 없이 유효한 JSON 객체 하나만 다시 출력하라.`;
    text = backend === 'codex' ? callCodexOnce(retryPrompt) : await callGeminiOnce(env, retryPrompt);
    logCall(outDir, `${label}.retry`, retryPrompt, text);
    return { value: extractJson(text), call: { text, ms: Date.now() - t0, retried } };
  }
}
