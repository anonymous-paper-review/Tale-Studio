// 단계별 로그 저장 유틸 (서버 사이드 전용)
//
// ⚠️ 모든 파일시스템 쓰기는 best-effort (절대 throw 안 함).
//   Vercel 서버리스는 /var/task 가 읽기전용이라 mkdir/writeFile 이 ENOENT/EROFS 로 실패한다.
//   → Vercel(process.env.VERCEL)에선 FS 쓰기를 아예 시도하지 않고 조용히 no-op 한다
//     (진행/상태는 writer_runs DB 가 추적하므로 파일 로그는 불필요 + 경고 스팸 방지).
//   → 로컬/self-host 는 정상적으로 파일을 쓴다. 예기치 못한 실패 시 한 번만 경고.
//   이로써 (1) 로컬 runPipeline 이 그대로 동작하고 (2) serverless step 경로에서 stage runner
//   내부의 logger 호출(markStage 등)이 파이프라인을 죽이지 않으며 (3) 로그가 시끄럽지 않다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { flushRawCalls, type LlmProvider } from '@/lib/writer/llm/raw_collector';

const LOGS_ROOT = path.resolve(process.cwd(), 'logs');

// Vercel(읽기전용 FS)에선 처음부터 비활성. 그 외 환경에서 예기치 못한 FS 실패가 나면
// 한 번 경고하고 이후엔 시도하지 않는다(스팸 방지).
let fsDisabled = Boolean(process.env.VERCEL);
let warnedReadOnlyFs = false;
function disableFsAfterError(op: string, e: unknown) {
  fsDisabled = true;
  if (warnedReadOnlyFs) return;
  warnedReadOnlyFs = true;
  const msg = e instanceof Error ? e.message : String(e);
  console.warn(`[writer/logger] filesystem logging disabled (${op}): ${msg}. Progress is tracked in writer_runs (DB).`);
}

export class PipelineLogger {
  private projectDir: string;
  private debugDir: string;
  private llmDir: string;

  constructor(public projectId: string) {
    this.projectDir = path.join(LOGS_ROOT, projectId);
    this.debugDir = path.join(this.projectDir, 'debug');
    this.llmDir = path.join(this.debugDir, 'llm_calls');
  }

  async init() {
    if (fsDisabled) return;
    try {
      await fs.mkdir(this.llmDir, { recursive: true });
    } catch (e) {
      disableFsAfterError('init', e);
    }
  }

  // 단계 결과 저장 (예: 02_genre.json)
  async saveStage(filename: string, data: unknown) {
    const filepath = path.join(this.projectDir, filename);
    if (fsDisabled) return filepath;
    try {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      disableFsAfterError('saveStage', e);
    }
    return filepath;
  }

  // 단계 결과 로드 (resume용). 파일 없으면 null.
  async loadStage<T>(filename: string): Promise<T | null> {
    if (fsDisabled) return null;
    const filepath = path.join(this.projectDir, filename);
    try {
      const text = await fs.readFile(filepath, 'utf8');
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  // 입력 텍스트 저장 (예: 00_input_story.md)
  async saveText(filename: string, text: string) {
    const filepath = path.join(this.projectDir, filename);
    if (fsDisabled) return filepath;
    try {
      await fs.writeFile(filepath, text, 'utf8');
    } catch (e) {
      disableFsAfterError('saveText', e);
    }
    return filepath;
  }

  // LLM 호출 raw 입출력 저장
  private llmCallCounter = 0;
  async saveLlmCall(label: string, payload: { prompt: string; response: string; model: string; provider: LlmProvider }) {
    this.llmCallCounter += 1;
    const padded = String(this.llmCallCounter).padStart(3, '0');
    const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${padded}_${safeLabel}.json`;
    const filepath = path.join(this.llmDir, filename);
    if (fsDisabled) return filepath;
    try {
      await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      disableFsAfterError('saveLlmCall', e);
    }
    return filepath;
  }

  // 통합 결과 저장 (마스터 JSON)
  async saveIntegrated(data: unknown) {
    const filepath = path.join(this.projectDir, 'INTEGRATED.json');
    if (fsDisabled) return filepath;
    try {
      await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      disableFsAfterError('saveIntegrated', e);
    }
    return filepath;
  }

  // 진행 상황 추적용 마커
  async markStage(stageName: string, status: 'started' | 'completed' | 'failed', extra?: unknown) {
    if (fsDisabled) return;
    const filepath = path.join(this.projectDir, '_progress.jsonl');
    const entry = JSON.stringify({ stage: stageName, status, timestamp: new Date().toISOString(), extra }) + '\n';
    try {
      await fs.appendFile(filepath, entry, 'utf8');
    } catch (e) {
      disableFsAfterError('markStage', e);
    }
  }

  // LLM raw collector에서 미저장 호출을 꺼내 stageLabel과 함께 파일로 저장
  // stage 이름 기반으로 그룹화 저장
  async flushRawLlm(stageLabel: string): Promise<number> {
    const calls = flushRawCalls();
    if (calls.length === 0) return 0;
    if (fsDisabled) return calls.length;
    const safe = stageLabel.replace(/[^a-z0-9_-]/gi, '_');
    for (const c of calls) {
      const padded = String(c.seq).padStart(3, '0');
      const filename = `${padded}_${safe}_${c.provider}.json`;
      try {
        await fs.writeFile(
          path.join(this.llmDir, filename),
          JSON.stringify(c, null, 2),
          'utf8'
        );
      } catch (e) {
        disableFsAfterError('flushRawLlm', e);
      }
    }
    return calls.length;
  }

  getProjectDir() {
    return this.projectDir;
  }
}

export function makeProjectId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}_${rand}`;
}
