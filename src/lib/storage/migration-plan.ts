/**
 * 보관함 객체를 "옮길 것 / 버릴 것 / 사람이 정할 것"으로 가르는 규칙.
 *
 * 왜 코드로 두는가: 이전 스크립트와 사후 검증이 **같은 규칙**을 써야 한다. 스크립트 안에
 * 조건문으로 박아 두면 검증 쪽이 규칙을 다시 쓰게 되고, 둘이 어긋나면 "옮겼다고 보고했는데
 * 실제로는 빠진" 상태를 아무도 못 잡는다.
 *
 * 순수 함수다 — 보관함에도 데이터베이스에도 접근하지 않는다. 살아 있는 프로젝트 목록은
 * 호출부가 넣어 준다(`scripts/media-migration-plan.mjs` 가 데이터베이스에서 읽어 온다).
 */

/** 객체 하나를 어떻게 할지. */
export type MediaDisposition =
  /** 새 보관함으로 복사한다. */
  | 'migrate'
  /** 옮기지 않는다 — 생성 과정에서 다시 만들어지는 임시물. */
  | 'skip-temp'
  /** 옮기지 않는다 — 주인 프로젝트가 데이터베이스에 없다. */
  | 'skip-orphan'
  /** 사람이 정한다 — 자동 판단하면 되돌릴 수 없는 손실이 날 수 있다. */
  | 'review'

export interface MediaVerdict {
  disposition: MediaDisposition
  /** 사람이 읽을 판정 근거. 보고서에 그대로 싣는다. */
  reason: string
}

export interface ClassifyContext {
  /** 데이터베이스에 실제로 존재하는 프로젝트 id. */
  liveProjectIds: ReadonlySet<string>
  /** 시험·샘플로 판정된 프로젝트 id — 살아 있지만 사람이 버릴지 정해야 한다. */
  testProjectIds?: ReadonlySet<string>
}

/**
 * 외부 생성 서버에 넘기는 주문서 첨부물. 결과물이 아니라 재료라서, 다음 생성 때 다시 만들어진다.
 * 옮길 이유가 없다 — 2026-08-19 기준 677MB(버킷의 18.8%)가 여기 해당한다.
 */
const TEMP_PATTERNS = ['real_grid_ref_', '_storyboard_ref_strip'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `{작업공간}/{프로젝트}/…` 형태면 프로젝트 id를 돌려준다. 아니면 null(공용 자산). */
export function projectIdOfPath(objectPath: string): string | null {
  const [workspace, project] = objectPath.split('/')
  if (!workspace || !project) return null
  if (!UUID.test(workspace) || !UUID.test(project)) return null
  return project
}

export function classifyMediaObject(objectPath: string, ctx: ClassifyContext): MediaVerdict {
  const path = objectPath.replace(/^\/+/, '')
  if (!path) return { disposition: 'review', reason: '경로가 비어 있음' }

  // 1) 임시물이 먼저다 — 주인 프로젝트가 살아 있어도 옮길 이유가 없다.
  for (const pattern of TEMP_PATTERNS) {
    if (path.includes(pattern)) {
      return { disposition: 'skip-temp', reason: '생성용 임시 시트 — 다음 생성 때 다시 만들어짐' }
    }
  }

  const projectId = projectIdOfPath(path)

  // 2) 공용 자산(템플릿·스타일 앵커 등)은 프로젝트에 속하지 않는다. 그대로 옮긴다.
  if (projectId === null) {
    return { disposition: 'migrate', reason: '프로젝트에 속하지 않는 공용 자산' }
  }

  // 3) 주인이 없으면 옮기지 않는다. 지우는 게 아니라 **복사 대상에서 빼는** 것이라
  //    옛 보관함에 그대로 남는다 — 판단이 틀려도 되돌릴 수 있다.
  if (!ctx.liveProjectIds.has(projectId)) {
    return { disposition: 'skip-orphan', reason: '주인 프로젝트가 데이터베이스에 없음' }
  }

  // 4) 시험·샘플 프로젝트는 양이 크지만(버킷의 86.6%) 살아 있는 데이터다. 자동으로 버리지 않는다.
  if (ctx.testProjectIds?.has(projectId)) {
    return { disposition: 'review', reason: '시험·샘플로 보이는 프로젝트 — 옮길지 사람이 정함' }
  }

  // 5) 잘라낸 조각이 따로 있는 업로드 원본. 원본이 화면 어디에 쓰이는지 확인 전까지 보류.
  if (/(^|\/)uploads\/[^/]+\/original\.[^/]+$/.test(path)) {
    return { disposition: 'review', reason: '업로드 원본 — 조각이 따로 있어 필요 여부 확인 필요' }
  }

  return { disposition: 'migrate', reason: '화면·생성에 쓰이는 결과물' }
}
