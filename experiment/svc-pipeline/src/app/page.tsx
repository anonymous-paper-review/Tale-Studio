'use client';

import { useEffect, useState } from 'react';

const DEFAULT_STORY =
  '용사가 마왕을 무찌르는 이야기. 중세 판타지. 늙은 백발 노파인 용사와 용의 형태를 가진 마왕.';

// 모델 프리셋 — UI에서 선택 가능
type ModelChoice = {
  id: string;
  label: string;
  provider: 'gemini' | 'claude' | 'openai' | 'local';
  model: string;
  baseUrl?: string;
};
const MODEL_CHOICES: ModelChoice[] = [
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash (preview)', provider: 'gemini', model: 'gemini-3-flash-preview' },
  { id: 'gemini-3-pro', label: 'Gemini 3 Pro (preview)', provider: 'gemini', model: 'gemini-3-pro-preview' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', model: 'gemini-2.5-flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', model: 'gemini-2.5-pro' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'claude', model: 'claude-sonnet-4-6' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'openai', model: 'gpt-5-mini' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', model: 'gpt-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai', model: 'gpt-4o-mini' },
  { id: 'local-8000', label: 'Local Qwen3.6 (Pro6000:8000)', provider: 'local', model: 'qwen3.6', baseUrl: 'http://100.89.172.50:8000' },
  { id: 'local-8001', label: 'Local Qwen3.6 (Pro6000:8001)', provider: 'local', model: 'qwen3.6', baseUrl: 'http://100.89.172.50:8001' },
];
const DEFAULT_AXIS_MODEL: Record<'S' | 'V' | 'C', string> = {
  S: 'gemini-3-flash',
  V: 'gemini-3-flash',
  C: 'claude-sonnet-4-6',
};

const STAGES = [
  { id: 'S0', label: 'S0 장르/톤' },
  { id: 'S1', label: 'S1 구조/POV' },
  { id: 'S2', label: 'S2 캐릭터/관계' },
  { id: 'S3', label: 'S3 씬 브레이크다운' },
  { id: 'C1_validation', label: 'C① 서사 검증' },
  { id: 'mid_preview', label: 'Mid Preview' },
  { id: 'L0_L1', label: 'L0+L1 비주얼 기반' },
  { id: 'L2', label: 'L2 프로덕션 디자인' },
  { id: 'L3_scene_plan', label: 'L3 씬 비주얼 플랜 (D4+, Compact일 땐 스킵)' },
  { id: 'L4_shots', label: 'L4 샷 3분할 (의도/정적/동적)' },
  { id: 'C2_application', label: 'C② 변환 + 검증' },
  { id: 'L5_prompts', label: 'L5 T2I/TI2V 프롬프트 정리' },
  { id: 'PIPELINE', label: '완료' },
];

interface ProjectListItem {
  project_id: string;
  created_at: string;
  meta: {
    genre?: string;
    total_shots?: number;
    total_duration_seconds?: number;
  } | null;
  completed?: boolean;
  last_stage?: string | null;
  resumable?: boolean;
}

export default function Page() {
  const [story, setStory] = useState(DEFAULT_STORY);
  const [runtime, setRuntime] = useState<number | ''>(60);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<unknown | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [modelS, setModelS] = useState<string>(DEFAULT_AXIS_MODEL.S);
  const [modelV, setModelV] = useState<string>(DEFAULT_AXIS_MODEL.V);
  const [modelC, setModelC] = useState<string>(DEFAULT_AXIS_MODEL.C);

  // 선택된 ID → axis config (API 요청에 포함)
  const axisConfig = (id: string) => {
    const m = MODEL_CHOICES.find((c) => c.id === id);
    if (!m) return undefined;
    return { provider: m.provider, model: m.model, baseUrl: m.baseUrl };
  };
  const buildModelsBody = () => ({
    S: axisConfig(modelS),
    V: axisConfig(modelV),
    C: axisConfig(modelC),
  });

  const refreshProjects = async () => {
    const r = await fetch('/api/projects');
    const j = (await r.json()) as { projects?: ProjectListItem[] };
    setProjects(j.projects ?? []);
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const runPipeline = async () => {
    setRunning(true);
    setError(null);
    setCurrentResult(null);
    try {
      const r = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          story,
          runtimeSeconds: runtime === '' ? undefined : runtime,
          models: buildModelsBody(),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'unknown error');
        return;
      }
      setCurrentResult(j);
      await refreshProjects();
      setSelectedProject(j.project_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const loadProjectFiles = async (projectId: string) => {
    setSelectedProject(projectId);
    setSelectedFile(null);
    setFileContent('');
    const r = await fetch(`/api/logs/${projectId}`);
    const j = (await r.json()) as { files?: string[] };
    setFiles(j.files ?? []);
  };

  // 중단된 프로젝트 이어서 진행
  const resumeProject = async (projectId: string) => {
    setRunning(true);
    setError(null);
    setCurrentResult(null);
    try {
      const r = await fetch('/api/pipeline/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, models: buildModelsBody() }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'unknown error');
        return;
      }
      setCurrentResult(j);
      await refreshProjects();
      setSelectedProject(j.project_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const loadFile = async (file: string) => {
    if (!selectedProject) return;
    setSelectedFile(file);
    const r = await fetch(`/api/logs/${selectedProject}?file=${encodeURIComponent(file)}`);
    const j = (await r.json()) as { data?: unknown; text?: string; error?: string };
    if (j.error) {
      setFileContent(`Error: ${j.error}`);
      return;
    }
    if (j.data !== undefined) {
      setFileContent(JSON.stringify(j.data, null, 2));
    } else {
      setFileContent(j.text ?? '');
    }
  };

  return (
    <div className="container">
      <h1>SVC Pipeline Experiment</h1>
      <p className="muted">스토리 → S → C① → Mid Preview → V → C② → 샷 시퀀스 JSON</p>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="col" style={{ maxWidth: 460 }}>
          <div className="card">
            <h2>모델 선택 (S/V/C 축)</h2>
            <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              S 설계 (S0~S3) · V 설계 (Mid Preview, L0~L4) · C 판단 (C1 검증, C2 검증)
            </p>
            {(['S', 'V', 'C'] as const).map((axis) => {
              const value = axis === 'S' ? modelS : axis === 'V' ? modelV : modelC;
              const setter = axis === 'S' ? setModelS : axis === 'V' ? setModelV : setModelC;
              const labelMap = { S: 'S 축 (스토리)', V: 'V 축 (비주얼)', C: 'C 축 (검증)' };
              return (
                <div key={axis} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className="muted" style={{ minWidth: 110, fontSize: 12 }}>
                    {labelMap[axis]}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    disabled={running}
                    style={{ flex: 1 }}
                  >
                    {MODEL_CHOICES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h2>입력</h2>
            <label className="muted" style={{ display: 'block', marginBottom: 4 }}>
              스토리 (자유 텍스트)
            </label>
            <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={6} />

            <label
              className="muted"
              style={{ display: 'block', marginTop: 12, marginBottom: 4 }}
            >
              러닝타임 (초). 비우면 AI가 결정.
            </label>
            <input
              type="number"
              value={runtime}
              onChange={(e) => setRuntime(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="예: 60"
            />

            <div style={{ marginTop: 14 }}>
              <button className="primary" onClick={runPipeline} disabled={running}>
                {running ? <><span className="spinner" /> 실행 중...</> : '파이프라인 실행'}
              </button>
            </div>

            {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
          </div>

          <div className="card">
            <h2>저장된 프로젝트</h2>
            <div className="file-list">
              {projects.length === 0 && <span className="muted">아직 없음</span>}
              {projects.map((p) => (
                <div
                  key={p.project_id}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <a
                    className={selectedProject === p.project_id ? 'active' : ''}
                    onClick={() => loadProjectFiles(p.project_id)}
                    style={{ cursor: 'pointer', flex: 1 }}
                  >
                    {p.project_id}
                    {p.meta && (
                      <span className="muted">
                        {' '}
                        [{p.meta.genre ?? '?'}] {p.meta.total_shots ?? '?'}샷 /{' '}
                        {p.meta.total_duration_seconds ?? '?'}s
                      </span>
                    )}
                    {p.completed ? (
                      <span className="muted" style={{ color: '#10b981' }}> ✅</span>
                    ) : (
                      <span className="muted" style={{ color: '#f59e0b' }}>
                        {' '}
                        ⏸ {p.last_stage ?? '미실행'}
                      </span>
                    )}
                  </a>
                  {!p.completed && p.resumable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resumeProject(p.project_id);
                      }}
                      disabled={running}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      title="중단된 지점부터 이어서 진행"
                    >
                      ▶ 이어서
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <h2>실행 결과</h2>
            {!currentResult && !selectedProject && (
              <p className="muted">파이프라인을 실행하거나 프로젝트를 선택하세요.</p>
            )}

            {currentResult ? (
              <ResultSummary result={currentResult} />
            ) : null}
          </div>

          {selectedProject && (
            <div className="card">
              <h2>로그 파일 ({selectedProject})</h2>
              <div className="row">
                <div style={{ width: 320, flexShrink: 0 }}>
                  <div className="file-list">
                    {files.map((f) => (
                      <a
                        key={f}
                        className={selectedFile === f ? 'active' : ''}
                        onClick={() => loadFile(f)}
                        style={{ cursor: 'pointer' }}
                      >
                        {f}
                      </a>
                    ))}
                  </div>
                </div>
                <div className="col">
                  {selectedFile ? (
                    <>
                      <h3>{selectedFile}</h3>
                      <pre>{fileContent}</pre>
                    </>
                  ) : (
                    <p className="muted">파일을 클릭해 내용 보기</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultSummary({ result }: { result: any }) {
  const ss = result.shot_sequence;
  const c1 = result.c_validation_1;
  const c2 = result.c_validation_2;
  const meta = result.metadata;

  return (
    <div>
      <p>
        <strong>{result.project_id}</strong>{' '}
        <span className="muted">
          ({meta?.total_duration_ms}ms / Gemini {meta?.llm_calls?.gemini}회 / Claude{' '}
          {meta?.llm_calls?.claude}회)
        </span>
      </p>
      <p style={{ marginTop: 8 }}>
        장르: <strong>{result.S0?.genre}</strong> / 깊이:{' '}
        <strong>{result.S0?.depth_level}</strong> / 러닝타임:{' '}
        <strong>{result.S0?.runtime_seconds}s</strong>
      </p>
      <p>
        샷 시퀀스: <strong>{ss?.total_shots}</strong>샷 /{' '}
        <strong>{ss?.total_duration_seconds}</strong>s
      </p>
      <p>
        C① 검증:{' '}
        <span className={c1?.passed ? 'ok' : 'err'}>
          {c1?.passed ? 'PASS' : 'FAIL'}
        </span>{' '}
        ({c1?.issues?.length ?? 0} issues, CDQ score:{' '}
        {c1?.cdq_clarity_score?.toFixed(2)})
      </p>
      <p>
        C② 검증:{' '}
        <span className={c2?.passed ? 'ok' : 'err'}>
          {c2?.passed ? 'PASS' : 'FAIL'}
        </span>{' '}
        ({c2?.issues?.length ?? 0} issues, {c2?.shots_split_count ?? 0}개 샷 분할됨)
      </p>
    </div>
  );
}
