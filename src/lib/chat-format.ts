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

// 채팅 응답 공용 출력 형식 가이드 — 모든 stage 챗 라우트의 시스템 프롬프트 끝에 append 한다.
//   목적: (1) 줄바꿈/문단 분리로 가독성 향상, (2) UI에서 제거되는 ** 별표 bold 사용 억제.
//   렌더러(MarkdownText)는 whitespace-pre-wrap 이라 \n 이 그대로 줄바꿈으로 표시된다.
export const CHAT_OUTPUT_FORMAT_GUIDE = `

<출력 형식>
- 채팅 UI에 표시되는 답변이다. 핵심부터 짧고 읽기 쉽게 쓴다.
- 서로 다른 생각/주제 사이에는 빈 줄(줄바꿈 2번)로 문단을 나눈다.
- 여러 항목을 나열할 때는 각 항목을 새 줄에서 "- " 로 시작한다.
- 별표 강조 마크다운(*, **굵게**)은 쓰지 않는다 — UI에서 제거되어 지저분해진다. 강조가 필요하면 문장 자체로 표현한다.
- 한 답변이 지나치게 길어지지 않게 한다.
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
