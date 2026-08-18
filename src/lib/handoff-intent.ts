// 스테이지 핸드오프의 "말" 정의 (#handoff-to-chat 2026-07-31).
//
// 탭 하단의 핸드오프 버튼을 걷어내고 채팅으로 옮겼다. 채팅 제안의 버튼을 누르면 utterance 가
//   그대로 입력창에 들어가 전송된다 — 즉 **버튼 = 그 문장을 타이핑한 것**이라, 두 경로가 갈릴 수
//   없다. 사용자가 자기 말로 요청해도 같은 판정을 타도록 여기서 의도를 인식한다.
//
// 인식은 LLM 이 아니라 코드가 한다. 핸드오프는 되돌리기 어려운 상태 전이(writer 파이프라인 발사)라
//   모델의 해석에 맡길 자리가 아니다 — 모델은 제안까지(architecture §3). 실제 가부는 각 stage 의
//   결정적 게이트가 판정하고, 여기는 "넘어가자고 말했는가"만 본다.

import type { StageId } from '@/types'

export interface HandoffSpec {
  from: StageId
  to: StageId
  /** 제안 버튼을 누르면 채팅에 그대로 입력되는 문장. */
  utterance: string
  /** 제안 버튼 라벨. */
  label: string
}

// label/utterance 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx 및 각
//   stage page 의 handoff 넛지)이 t()/translate() 로 번역한다. utterance 는 번역된 문장 그대로
//   채팅에 전송되므로, 번역 후에도 MOVE_WORDS(예: 'handover')·STAGE_WORDS 매칭 토큰을 포함해야
//   matchHandoffIntent 가 여전히 인식한다 — "Please hand over to {Stage}" 형태로 고정.
export const HANDOFFS: readonly HandoffSpec[] = [
  {
    from: 'producer',
    to: 'writer',
    utterance: 'Please hand over to Writer',
    label: 'Hand over to Writer',
  },
  {
    from: 'writer',
    to: 'artist',
    utterance: 'Please hand over to Artist',
    label: 'Hand over to Artist',
  },
  {
    from: 'artist',
    to: 'director',
    utterance: 'Please hand over to Director',
    label: 'Hand over to Director',
  },
  {
    from: 'director',
    to: 'editor',
    utterance: 'Please hand over to Editor',
    label: 'Hand over to Editor',
  },
] as const

export function handoffFrom(stage: StageId): HandoffSpec | null {
  return HANDOFFS.find((h) => h.from === stage) ?? null
}

/** 대상 스테이지를 가리키는 말 — 한/영 모두. */
const STAGE_WORDS: Record<StageId, readonly string[]> = {
  producer: ['producer', '프로듀서'],
  writer: ['writer', '작가', '라이터'],
  artist: ['artist', '아티스트', '컨셉아티스트'],
  director: ['director', '디렉터', '디렉타', '감독'],
  editor: ['editor', '에디터', '편집'],
}

// "넘어가자" 계열만. '진행'·'시작' 같은 범용 동사는 넣지 않는다 — director 에서 "편집 진행해줘"
//   (편집=editor 단어)처럼 평범한 작업 요청이 핸드오프로 오인된다.
const MOVE_WORDS = [
  '넘겨',
  '넘어가',
  '넘기',
  '핸드오프',
  'handoff',
  'handover',
  '보내',
  '가자',
  '이동',
  'proceed',
] as const

const NEXT_STEP_WORDS = ['다음단계', '다음스텝', '다음탭', 'nextstep', 'nextstage'] as const

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

/**
 * 이 stage 에서 "다음 단계로 넘어가자"고 말했는가.
 * 이동 동사 + (대상 스테이지 이름 | "다음 단계") 를 모두 만족해야 한다 — 둘 중 하나만으로는
 * "감독 스타일로 그려줘" / "다음 씬 고쳐줘" 같은 평범한 요청이 걸린다.
 */
export function matchHandoffIntent(text: string, stage: StageId): HandoffSpec | null {
  const spec = handoffFrom(stage)
  if (!spec) return null
  const t = normalize(text)
  if (!MOVE_WORDS.some((w) => t.includes(normalize(w)))) return null
  const mentionsTarget = STAGE_WORDS[spec.to].some((w) => t.includes(normalize(w)))
  const mentionsNextStep = NEXT_STEP_WORDS.some((w) => t.includes(w))
  return mentionsTarget || mentionsNextStep ? spec : null
}
