// 인물 · 배경 그림 파일 이름 규칙(2026-10-28 작품 스타일 기록) — 서버 · 시험이 함께 쓰는 순수 모듈.
//   예전에는 칸마다 고정 경로 하나에 덮어써(주소 뒤 ?v= 만 달라짐) 카드 기록의 예전 그림이 모두 최신 그림을 가리켰다.
//   이제 그릴 때마다 작업 번호(generation_jobs.id)를 이름에 넣어 새 파일로 저장한다 — 같은 작업이 다시 마무리돼도 같은 파일이다.
//   대표 얼굴은 시트 옆(같은 이름 + _portrait), 작은 미리보기는 storage-thumb 규칙(_thumb.webp)을 그대로 따른다.

/** 작업 번호로 만든 그림 파일(시트 · 대표 얼굴 · 배경). 이 모양만 카드 기록에서 빠질 때 지운다 — 예전 고정 경로는 여러 기록 줄이 같이 가리킨다. */
export const GENERATION_FILE_RE = /_g[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:_portrait)?\.png$/

/** base(확장자 없이) + 작업 번호 → 새 그림 파일 경로. */
export function generationFilePath(base: string, jobId: string): string {
  return `${base}_g${jobId}.png`
}

/** 시트 파일 옆의 대표 얼굴 파일 — 같은 시트를 다시 골라도 같은 파일이다. */
export function portraitPathForSheet(sheetPath: string): string {
  const slash = sheetPath.lastIndexOf('/')
  const dot = sheetPath.lastIndexOf('.')
  const stem = dot > slash ? sheetPath.slice(0, dot) : sheetPath
  return `${stem}_portrait.png`
}

/** 버전 폴더 — {ws}/{project}/versions/v{n}/. 이 폴더 파일은 프로젝트를 지울 때만 지운다. */
export function versionFolder(workspaceId: string, projectId: string, n: number): string {
  return `${workspaceId}/${projectId}/versions/v${n}/`
}

/**
 * 카드 기록에서 빠진 그림 파일을 지워도 되나 — 이 프로젝트의 인물 · 배경 폴더에 있는, 작업 번호로 만든 파일만.
 *   버전 폴더 · 예전 고정 경로 · 다른 프로젝트 파일은 지우지 않는다. 버전 기록 · 지금 그림이 가리키는지는 서버가 따로 본다.
 */
export function isEvictableGenerationPath(path: string, workspaceId: string, projectId: string): boolean {
  const project = `${workspaceId}/${projectId}/`
  if (!path.startsWith(project) || path.includes('..')) return false
  const rest = path.slice(project.length)
  if (!rest.startsWith('characters/') && !rest.startsWith('locations/')) return false
  return GENERATION_FILE_RE.test(path)
}
