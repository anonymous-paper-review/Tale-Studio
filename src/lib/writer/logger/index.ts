// 단계별 로그 저장 유틸 (서버 사이드 전용)
import fs from 'node:fs/promises';
import path from 'node:path';
import { flushRawCalls, type RawLlmCall, type LlmProvider } from '@/lib/svc/llm/raw_collector';

const LOGS_ROOT = path.resolve(process.cwd(), 'logs');

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
    await fs.mkdir(this.llmDir, { recursive: true });
  }

  // 단계 결과 저장 (예: 02_S0.json)
  async saveStage(filename: string, data: unknown) {
    const filepath = path.join(this.projectDir, filename);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    return filepath;
  }

  // 단계 결과 로드 (resume용). 파일 없으면 null.
  async loadStage<T>(filename: string): Promise<T | null> {
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
    await fs.writeFile(filepath, text, 'utf8');
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
    await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf8');
    return filepath;
  }

  // 통합 결과 저장 (마스터 JSON)
  async saveIntegrated(data: unknown) {
    const filepath = path.join(this.projectDir, 'INTEGRATED.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    return filepath;
  }

  // 진행 상황 추적용 마커
  async markStage(stageName: string, status: 'started' | 'completed' | 'failed', extra?: unknown) {
    const filepath = path.join(this.projectDir, '_progress.jsonl');
    const entry = JSON.stringify({ stage: stageName, status, timestamp: new Date().toISOString(), extra }) + '\n';
    await fs.appendFile(filepath, entry, 'utf8');
  }

  // LLM raw collector에서 미저장 호출을 꺼내 stageLabel과 함께 파일로 저장
  // stage 이름 기반으로 그룹화 저장
  async flushRawLlm(stageLabel: string): Promise<number> {
    const calls = flushRawCalls();
    if (calls.length === 0) return 0;
    const safe = stageLabel.replace(/[^a-z0-9_-]/gi, '_');
    for (const c of calls) {
      const padded = String(c.seq).padStart(3, '0');
      const filename = `${padded}_${safe}_${c.provider}.json`;
      await fs.writeFile(
        path.join(this.llmDir, filename),
        JSON.stringify(c, null, 2),
        'utf8'
      );
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
