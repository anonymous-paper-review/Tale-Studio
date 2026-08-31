import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseAppLocale, type AppLocale } from '@/lib/locale'

// 챗 응답 언어 강제(#i18n-s5-batch6-chat) — 4개 챗 라우트(producer/writer/artist/director)가 공유.
//   콘텐츠 언어(projects.locale)를 시스템 프롬프트 맨 끝(다른 가이드보다 뒤)에 주입해 최신 지시로
//   우선순위를 준다. locale 을 모르면(프로젝트 미확인/미로그인 경로 등) 빈 문자열 — 종전 동작 유지.
export function responseLanguageDirective(locale: AppLocale | null | undefined): string {
  if (locale !== 'ko' && locale !== 'en') return ''
  const lang = locale === 'ko' ? '한국어' : '영어(English)'
  return `\n\n[응답 언어] 사용자에게 보내는 모든 응답 텍스트는 ${lang}로 작성한다.`
}

/**
 * projects.locale 1회 조회 — 라우트가 이미 프로젝트 소유권을 확인했다면 그 뒤에 불러 중복 확인을
 *   피한다. 실패/미상은 null(호출부가 responseLanguageDirective(null) → 무주입으로 폴백).
 */
export async function fetchProjectLocale(projectId: string): Promise<AppLocale | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('locale')
      .eq('id', projectId)
      .maybeSingle()
    if (error || !data) return null
    return parseAppLocale((data as { locale?: unknown }).locale)
  } catch {
    return null
  }
}

// ── 발화 언어 추종 (#chat-locale-follow 2026-08-31) ──────────────────────────
// 실사고: user_metadata.locale 미저장 계정의 프로젝트가 en 으로 박혀, 한국어로 말 거는
//   사용자에게 채팅 전체(모델 응답 + translate 게이트 문구)가 영어로 나갔다. 계정 기본값은
//   "영어를 원한다"의 증거가 아니고, 발화의 한글은 "한국어를 읽는다"의 강한 증거다 —
//   producer 라우트가 이 신호로 projects.locale 을 사용자 쪽으로 맞춘다.

export interface ProjectLocaleState {
  locale: AppLocale | null
  /** writer 산출물이 이미 있는 프로젝트 — 언어를 뒤집으면 기존 산출물과 섞이므로 자동 전환 금지. */
  writerRan: boolean
}

/** produce/chat 전용 — locale 과 함께 자동 전환 가드(writer 산출물 유무)를 1쿼리로 읽는다. */
export async function fetchProjectLocaleState(
  projectId: string,
): Promise<ProjectLocaleState | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('locale, last_writer_run_id')
      .eq('id', projectId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { locale?: unknown; last_writer_run_id?: unknown }
    return {
      locale: parseAppLocale(row.locale),
      writerRan: row.last_writer_run_id != null,
    }
  } catch {
    return null
  }
}

/** 콘텐츠 언어 확정 — 발화 추종·명시 변경 공용. 확정이므로 잠근다(writer/start 재감지 불요). */
export async function updateProjectLocale(
  projectId: string,
  locale: AppLocale,
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('projects')
      .update({ locale, locale_locked: true })
      .eq('id', projectId)
    return !error
  } catch {
    return false
  }
}

// 채팅 응답 공용 출력 형식 가이드 — 모든 stage 챗 라우트의 시스템 프롬프트 끝에 append 한다.
//   목적: (1) 줄바꿈/문단 분리로 가독성 향상, (2) UI에서 제거되는 ** 별표 bold 사용 억제.
//   렌더러(MarkdownText)는 whitespace-pre-wrap 이라 \n 이 그대로 줄바꿈으로 표시된다.
export const CHAT_OUTPUT_FORMAT_GUIDE = `

<출력 형식>
- 채팅 UI에 표시되는 답변이다. 핵심부터 짧고 읽기 쉽게 쓴다.
- 서로 다른 생각/주제 사이에는 빈 줄(줄바꿈 2번)로 문단을 나눈다.
- 여러 항목을 나열할 때는 각 항목을 새 줄에서 "- " 로 시작한다.
- 별표 강조 마크다운(*, **굵게**, __밑줄굵게__)과 # 헤딩 마커(#, ##, ### 등) 등 어떤 마크다운 강조/헤딩 마커도 쓰지 않는다 — UI에서 제거되거나 마커가 그대로 노출되어 지저분해진다. 강조가 필요하면 문장 자체로 표현한다.
- 구분선(---, ㅁㅁㅁ, ——— 등)을 쓰지 않는다 — UI가 수평선을 렌더하지 않아 생 기호로 노출된다. 문단 구분은 빈 줄만 쓴다.
- 영어 문장·영어 제목·영어 라벨은 반드시 대문자로 시작한다(오너 지시 2026-08-31: 모든 AI 생성 영문 첫 글자 대문자화).
- 사용자에게 보이는 문장에서 내부 id(sh_02_07, sc_04, char_2, char_new_xxx, loc_xx 같은 것)를
  절대 쓰지 않는다 — 샷은 "Scene 2 · Shot 7", 씬은 "Scene 4" (한국어 응답에서도 이 영문
  표기를 그대로 쓴다), 인물·장소는 표시 이름으로 부른다.
  내부 id 는 JSON 필드(updates 등) 안에서만 쓴다. (스크립트 라인 참조 [L3] 은 실제 기능이라 예외.)
</출력 형식>`

// 변경(updates) 블록을 내는 챗(writer/director canvas/artist)에 append 하는 배치 상한 규칙.
//
// 이력: 2026-07-15 76샷 일괄 요청이 잘려 변경이 통째로 유실 → 다음날 writer/director 프롬프트에
//   각각 "AT MOST 12" 블록이 들어갔다(5600171, 근본 원인 처방). 그 두 벌을 여기로 통합한다:
//   ① artist 에는 상한이 없었다(누락) ② 같은 규칙이 두 곳에 복사돼 드리프트 위험
//   ③ 응답 한도를 4096→8192 로 올렸으므로(claude.ts) 12 는 과하게 보수적이다.
// 30 의 근거: 변경 1건 ≈ 83tok(실측, 프롬프트 필드를 가진 updateShot). 대사 배열을 통째 재제출하는
//   writer 의 무거운 변경(200tok 내외)을 가정해도 30건 ≈ 6,000tok 로 8192 안에 들어온다.
export const CHAT_UPDATES_BATCH_GUIDE = `

<변경 배치 상한>
- 한 번에 내는 변경(updates)은 최대 30건이다. 이보다 큰 JSON 블록은 출력 도중 잘려 그 변경들이 유실된다.
- 요청이 더 많은 변경을 필요로 하면(예: "모든 샷", "전체 씬") 첫 묶음만 처리하고, 답변 본문에
  무엇을 했는지와 남은 범위를 밝힌 뒤 "계속"이라고 말하면 이어서 하겠다고 안내한다.
- 수십 건을 한 번에 내려고 시도하지 마라.
</변경 배치 상한>`
