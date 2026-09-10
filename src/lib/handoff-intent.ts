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

// 이 함수는 대화 전체를 해석하는 에이전트가 아니라 즉시 이동하는 빠른 경로다.
// 확인된 부정·질문·인용 표현은 일반 채팅에 남긴다. 모든 자연어의 의도 판정을 보장하지 않는다.
function hasNonRequestContext(text: string): boolean {
  if (/[?？]/.test(text)) return true
  const compact = normalize(text)
  if (/(?:하지|넘기지|넘어가지|보내(?:주)?지|넘겨(?:주)?지|가지)(?:는)?(?:마|말|않)/.test(compact)) return true // i18n-ok: 사용자 한국어 입력을 인식하는 패턴이며 화면 문구가 아니다.
  if (/(?:안|못)(?:넘|보내|가|이동|할|해|돼|되)|보류|취소|금지|중지|멈춰|그만|나중/.test(compact)) return true // i18n-ok: 사용자 한국어 입력을 인식하는 패턴이며 화면 문구가 아니다.
  if (/방법|설명|어떻게|무엇|뭐가|왜|가능|(?:넘어가|이동해|넘겨)도(?:돼|되)/.test(compact)) return true // i18n-ok: 사용자 한국어 입력을 인식하는 패턴이며 화면 문구가 아니다.
  return /\b(?:don['’]?t|do\s+not|never|not|stop|cancel|avoid|wait|hold\s+off|how|what|why|when|where|whether|explain)\b/i.test(text)
}

function omitQuotedRequests(text: string): string {
  return text.replace(
    /```[\s\S]*?```|`[^`]*`|"[^"]*"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|(?<![A-Za-z])'[^'\n]*'/g,
    // "Director"처럼 이름만 감싼 경우는 그대로 두고, 이동 문장이 인용된 경우에만 제외한다.
    (quoted) => MOVE_WORDS.some((word) => normalize(quoted).includes(word)) ? '' : quoted,
  )
}

/**
 * 이 stage 에서 "다음 단계로 넘어가자"고 말했는가.
 * 이동 동사 + (대상 스테이지 이름 | "다음 단계") 를 모두 만족해야 한다 — 둘 중 하나만으로는
 * "감독 스타일로 그려줘" / "다음 씬 고쳐줘" 같은 평범한 요청이 걸린다.
 */
export function matchHandoffIntent(text: string, stage: StageId): HandoffSpec | null {
  const spec = handoffFrom(stage)
  if (!spec) return null
  const request = omitQuotedRequests(text)
  if (hasNonRequestContext(request)) return null
  const t = normalize(request)
  if (!MOVE_WORDS.some((w) => t.includes(normalize(w)))) return null
  const mentionsTarget = STAGE_WORDS[spec.to].some((w) => t.includes(normalize(w)))
  const mentionsNextStep = NEXT_STEP_WORDS.some((w) => t.includes(w))
  return mentionsTarget || mentionsNextStep ? spec : null
}

/** Writer의 명시적 Director 요청. 모델의 이동 예고를 실행 근거로 사용하지 않는다. */
export function resolveDirectorHandoffIntent(
  text: string,
  stage: StageId,
  history: ReadonlyArray<{ role: 'user' | 'model'; content: string }>,
): { mode: 'check' | 'move' | 'whenReady' } | null {
  if (stage !== 'writer') return null
  const request = omitQuotedRequests(text)
  const compact = normalize(request)
  // i18n-ok: 한국어 이동 의도 인식이며 사용자에게 출력하는 문구가 아니다.
  const cancelled = (value: string) => /(?:하지|넘기지|넘겨(?:주)?지|넘어가지|보내(?:주)?지)(?:는)?(?:마|말|않)|취소|보류|나중|그만/.test(normalize(value)) || /\b(?:cancel|never|stop|don['’]?t|do\s*not)\b/i.test(value) // i18n-ok: 입력의 취소 표현을 판별한다.
  if (cancelled(request)) return null
  // 대사 통일은 별도의 저장 완료 경로가 소유한다.
  if (/(?:번역|translate)|(?:대사|한국어|korean).*(?:맞추|바꾸|통일|수정|고치)/i.test(compact)) return null // i18n-ok: 복합 수정 요청 구분.
  if (!MOVE_WORDS.some(word => compact.includes(word)) && !/넘길|갈수|갈수잇|can.*(?:go|move)/i.test(compact)) return null // i18n-ok: 자연어 이동 표현.
  const namedStage = (value: string) => {
    const normalized = normalize(value)
    const mentions = (Object.keys(STAGE_WORDS) as StageId[]).flatMap(target => STAGE_WORDS[target]
      .filter(word => normalized.includes(word))
      .map(word => ({ target, index: normalized.lastIndexOf(word), destination: normalized.includes(`${word}로`) || normalized.includes(`${word}으로`) || normalized.includes(`to${word}`) }))) // i18n-ok: 목적격 단계 이름을 출발 단계보다 우선한다.
    return mentions.sort((a, b) => Number(b.destination) - Number(a.destination) || b.index - a.index)[0]?.target
  }
  let target = namedStage(request)
  if (!target) {
    // ‘넘겨줘’·‘다 되면 넘겨줘’만 앞선 사용자 목적지를 이어받는다.
    if (!/^(?:(?:그럼|응|네|이제|바로|다되면|다끝나면|완료되면|준비되면)[,.!]?)*(?:넘겨(?:줘|주세요)|넘기자|보내줘|이동해줘)[.!?]*$/.test(compact)) return null // i18n-ok: 대상 생략 이동 요청.
    for (const message of [...history].reverse()) {
      if (message.role !== 'user') continue
      const previous = omitQuotedRequests(message.content)
      if (cancelled(previous)) return null
      target = namedStage(previous)
      if (target) break
    }
  }
  if (target !== 'director') return null
  if (/[?？]|수\s*있|수\s*잇|수\s*없|가능|왜|어떻게|\b(?:can|could|why|how)\b/i.test(request)) return { mode: 'check' } // i18n-ok: 확인 질문은 완료 후 이동 예약에도 우선한다.
  if (/다되면|다끝나면|완료되면|준비되면|when.*(?:ready|done|finished)/i.test(compact)) return { mode: 'whenReady' } // i18n-ok: 준비 완료 후 이동 요청.
  return { mode: 'move' }
}
