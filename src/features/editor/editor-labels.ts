// Editor 화면 글 — 영상 상태 낱말과 영상을 못 불러온 클립의 표시 규칙(QA 2026-11-03 밤 "Editor에서 무한 로딩").
//   예전 화면 머리 숫자(v3 ED1 "컷 7 · 33초 · 영상 0/7")는 머리를 없애며(2단계 ①) 길이만 위 둘째 줄 시퀀스 정보로 옮겼다
//   (sequence-info.ts sequenceLengthSec, 리드 2026-11-14). 약속: tests/editor/header-meta.test.ts · tests/editor/load-ends.test.ts
import { formatTimecode } from '@/lib/editor/sequence-info'
import { isSyntheticShotId, isTitleCardShotId, isTitleClipShotId, rootShotIdOf } from '@/stores/editor-store'
import type { Shot, VideoClip } from '@/types'

type Translate = (text: string, params?: Record<string, string | number>) => string

/**
 * 문자 도구로 V1 을 눌렀는데 제목을 놓을 줄이 없을 때의 알림 — 막힌 까닭을 그대로 말한다(리드 11/14). 위 줄이 없으면 V2 를 더하라고, 있으면
 *   가장 가까운 위 줄(풀면 제목이 그 줄에 놓인다)이 잠겼는지 · 눈이 꺼졌는지 · 둘 다인지. 약속: tests/editor/title-clips.test.ts
 */
export function titleNoTrackNotice(videoTracks: ReadonlyArray<{ id: string; locked?: boolean; hidden?: boolean }>, t: Translate): string {
  const nearest = videoTracks.find((track) => track.id !== 'v1')
  if (!nearest) return t('There is no track to put the title on. Add V2.')
  const track = nearest.id.toUpperCase()
  if (nearest.hidden && nearest.locked) return t('There is no track to put the title on. Show and unlock {track}.', { track })
  if (nearest.hidden) return t('There is no track to put the title on. Show {track}.', { track })
  return t('There is no track to put the title on. Unlock {track}.', { track })
}

/** 화면에 보이는 영상 상태 — 영상 주소가 있어도 불러오지 못했으면(404 · 막힘 · 끊김) 'unplayable'. */
export type ClipDisplayStatus = VideoClip['status'] | 'unplayable'

/** 영상 상태 낱말(사전 키) — 소스 카드가 영어 원문(pending · completed)을 보이던 자리. */
export function clipStatusLabel(status: ClipDisplayStatus): string {
  if (status === 'unplayable') return 'Could not load'
  if (status === 'completed') return 'Completed'
  if (status === 'generating') return 'Generating'
  if (status === 'failed') return 'Failed'
  return 'Waiting'
}

/** 그 클립의 화면 상태 — 불러오지 못한 영상 주소면 그 클립만 'unplayable', 나머지는 받은 상태 그대로. */
export function clipDisplayStatus(clip: Pick<VideoClip, 'url' | 'status'>, unplayable: readonly string[]): ClipDisplayStatus {
  return clip.url && unplayable.includes(clip.url) ? 'unplayable' : clip.status
}

/**
 * 샷이 없을 때 Editor 가 보일 화면 — 읽는 중(큰 Lumi) · 읽기 실패([다시 시도]) · 샷 없음("이전 단계를 먼저 끝내세요").
 *   프로젝트를 여는 중(아직 정해지지 않음, 프로젝트를 바꾸는 동안 포함)에는 샷 없음이 아니라 읽는 중이다(#pps-empty-states).
 */
export function editorEmptyScreen(input: {
  loadStatus: 'idle' | 'loading' | 'error' | 'ready'
  projectId: string | null
  initLoading: boolean
}): 'loading' | 'error' | 'empty' {
  if (input.loadStatus === 'error') return 'error'
  if (!input.projectId && input.initLoading) return 'loading'
  return input.loadStatus === 'ready' ? 'empty' : 'loading'
}

/** Editor 를 여는 동안 기다리는 카드의 제목 — 처음 열 때 소리 나누기 진행(파형을 채운 소리 수)이 있으면 %를 붙인다(2026-11-10). */
export function editorPrepTitle(prep: { done: number; total: number }, t: Translate): string {
  if (prep.total <= 0) return t('Preparing clips…')
  return t('Preparing clips… {percent}%', { percent: Math.round((Math.min(prep.done, prep.total) / prep.total) * 100) })
}

export type PreviewPane = 'title' | 'video' | 'unplayable' | 'no-video' | 'empty'

/** 미리 보기 판에 무엇을 그릴지 — 타이틀 카드 · 영상 · 그 컷만 "불러오지 못함" 안내 · 아직 영상 없음 · 빈 구간. */
export function previewPane(input: {
  isTitleCard: boolean
  hasShot: boolean
  clip: Pick<VideoClip, 'url'> | undefined
  unplayable: readonly string[]
}): PreviewPane {
  if (input.isTitleCard) return 'title'
  if (input.clip?.url) return input.unplayable.includes(input.clip.url) ? 'unplayable' : 'video'
  return input.hasShot ? 'no-video' : 'empty'
}

/**
 * 클립 꼬리표 · 오른쪽 클릭 메뉴 머리 — 샷은 "MS · 4.0s", 타이틀 카드는 "타이틀 카드 · 5.0s"(예전에는 메뉴 머리에 만들 때 붙인 샷 종류
 *   "WS"가, 꼬리표에는 "타이틀"이 보였다 — N 353:351 · 검토 c, 2026-11-14). 약속: tests/editor/title-card.test.ts
 */
export function clipMenuTitle(input: { isTitleCard: boolean; isTitleClip?: boolean; shotType: string; durationSec: number }, t: Translate): string {
  // 제목 클립도 샷이 아니다 — 만들 때 붙인 샷 종류("WS") 대신 "제목"(검토 c ⑥, 타이틀 카드 N 353:351 과 같은 고장).
  const name = input.isTitleCard ? t('Title card') : input.isTitleClip ? t('Title clip') : input.shotType
  return `${name} · ${input.durationSec.toFixed(1)}s`
}

/**
 * 샷 이름 — "샷 2 · MS · Take 1"(시안 E1 409:4656). 번호는 이야기 순서, Take 는 Editor 로 온 ★ 최종 Take(모르면 뺀다).
 *   타이틀 카드는 "타이틀 카드", 제목 클립은 "제목 · 글자"(시안 E2 409:5231). 프로젝트 판 줄 · 효과 컨트롤 머리가 같이 쓴다(2단계 ① 새 배치).
 *   약속: tests/editor/panels.test.ts · tests/editor/title-clips.test.ts
 */
export function shotLabel(
  input: { number: number | null; shotType?: string | null; takeNumber?: number | null; isTitleCard?: boolean; titleText?: string | null },
  t: Translate,
): string {
  if (input.isTitleCard) return t('Title card')
  if (input.titleText != null) return input.titleText.trim() ? `${t('Title clip')} · ${input.titleText.trim()}` : t('Title clip')
  return [
    input.number != null ? t('Shot {number}', { number: input.number }) : null,
    input.shotType || null,
    input.takeNumber ? t('Take {number}', { number: input.takeNumber }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * 클립의 화면 이름 — 효과 컨트롤 머리와 같다("샷 3 · MCU · Take 1", 타이틀 카드 · 제목은 그 이름). 자른 · 끼운 조각은 원본 샷의 번호 · Take.
 *   내보낸 파일의 영상 자리표시도 이 이름을 쓴다(리드 11/14 L2 — 예전에는 내부 샷 id 가 찍혔다). 약속: tests/editor/frame-plan.test.ts
 */
export function clipDisplayName(input: { shots: readonly Shot[]; videoClips: readonly VideoClip[] }, shotId: string, t: Translate): string {
  const shot = input.shots.find((s) => s.shotId === shotId)
  const rootId = rootShotIdOf(shotId)
  const number = input.shots.filter((s) => !isSyntheticShotId(s.shotId)).findIndex((s) => s.shotId === rootId)
  const rootClip = input.videoClips.find((c) => c.shotId === rootId)
  return shotLabel(
    {
      number: number >= 0 ? number + 1 : null,
      shotType: shot?.shotType,
      takeNumber: rootClip?.takeNumber,
      isTitleCard: isTitleCardShotId(shotId),
      titleText: isTitleClipShotId(shotId) ? (shot?.titleText?.text ?? null) : null,
    },
    t,
  )
}

/** 효과 컨트롤 둘째 줄 — "V1 · 00:00:03:00 → 00:00:06:00 · 3.00초"(시안 E1 409:4657). */
export function clipSpanLine(input: { track: string; startSec: number; durationSec: number }, t: Translate): string {
  const end = input.startSec + input.durationSec
  return `${input.track} · ${formatTimecode(input.startSec)} → ${formatTimecode(end)} · ${t('{seconds}s', { seconds: input.durationSec.toFixed(2) })}`
}
