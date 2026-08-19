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

  // 4) 살아 있는 프로젝트의 파일은 전부 옮긴다.
  //
  //    시험·샘플 프로젝트(버킷의 68%)와 업로드 원본도 여기 포함된다. 옮기지 않고 남겨두는
  //    쪽이 싸 보이지만 방향이 위험하다 — **옮겨두면 나중에 지울 수 있고, 안 옮기면
  //    되돌리기 어렵다.** 무엇을 버릴지는 이전이 끝나 서비스가 정상으로 돌아온 뒤,
  //    실제 사용량을 보고 사람이 정한다(2026-08-19 오너 판단).
  //
  //    양이 궁금하면 `scripts/media-migration-plan.mts` 가 옮기는 것 중 시험·샘플 몫을
  //    따로 집계해 보여준다. 판정을 바꾸지 않고 크기만 알려주는 것이 목적이다.
  return { disposition: 'migrate', reason: '살아 있는 프로젝트의 파일' }
}
