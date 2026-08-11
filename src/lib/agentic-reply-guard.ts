// 채팅 agentic 응답의 펜스 JSON 처리 — 유출 방어 + 손실 복구 + 신호 (#p4-json-guard 2026-08-11).
//
// 배경(2026-07-15): writer/director/artist 챗은 응답 끝의 ```json {updates:[...]} ``` 블록을
//   추출·적용하고 표시에서 제거한다. 응답이 max_tokens(4096)에서 잘리면 닫는 펜스가 없어 원문
//   전체가 채팅 메시지로 노출됐다(실측: 76샷 일괄 updates 가 잘림). 그 방어가 아래 strip 함수다.
//
// 남아 있던 세 갭(#p4-json-guard 로 여기서 닫는다):
//   ① 복구 시도가 없었다 — 잘린 응답에서 온전한 항목만 살릴 수 있는데 통째로 버렸다.
//   ② artist 챗은 방어 자체가 없었다 — 파싱 실패 시 raw JSON 을 그대로 채팅에 노출하고
//      updates 를 조용히 폐기했다(writer/director 는 안내 문구가 있었다).
//   ③ 서버 로그가 없어 운영자가 발생 빈도를 알 수 없었다.
import { repairJson } from '@/lib/writer/llm/json_repair'

/** 잘림(닫는 펜스 없음) — 원인이 분명해 문구로 단정할 수 있다. */
const NOTICE_TRUNCATED =
  '(변경 명령이 너무 커서 응답이 중간에 잘렸어요. 적용된 변경은 없습니다 — 범위를 씬 단위로 나눠 다시 요청해 주세요.)'
/** 펜스는 닫혔는데 내용이 깨짐 — 잘림으로 단정하지 않는다. */
const NOTICE_UNREADABLE =
  '(변경 사항을 읽지 못했어요. 적용된 변경은 없습니다 — 다시 한 번 요청해 주세요.)'
/** 일부만 살린 경우 — 적용됐다는 사실과 나머지가 빠졌다는 사실을 함께 알린다. */
const NOTICE_PARTIAL =
  '(응답이 중간에 잘려서 변경 일부만 적용했어요. 나머지는 범위를 나눠 다시 요청해 주세요.)'

/** 실패 경로에서 첫 ```json 펜스 이후를 잘라내고 안내 문구로 대체 (raw JSON 노출 방어). */
export function stripLeakedUpdatesBlock(text: string, notice = NOTICE_TRUNCATED): string {
  const i = text.indexOf('```json')
  if (i === -1) return text
  const head = text.slice(0, i).trim()
  return head ? `${head}\n\n${notice}` : notice
}

export type FencedReplyStatus =
  // 펜스 없음 = 순수 대화 턴(정상). 실패가 아니다 — 이 둘을 구분 못 한 게 종전 무신호의 일부였다.
  | 'none'
  | 'ok'
  | 'recovered' // 손실 복구로 일부만 살림
  | 'failed'

export interface FencedReplyResult {
  /** 사용자에게 보일 본문. 복구/실패 시 안내 문구가 붙고 raw JSON 은 제거된다. */
  reply: string
  /** 파싱된 펜스 내용(없거나 실패면 null) */
  data: Record<string, unknown> | null
  status: FencedReplyStatus
}

/**
 * 응답 끝의 ```json 블록을 꺼내 파싱한다. 깨졌으면 repairJson 으로 한 번 더 시도하고,
 * 살린 경우와 못 살린 경우를 각각 사용자 문구·서버 로그로 표면화한다(무신호 금지).
 * 화이트리스트 검증은 호출부의 책임 — 여기서는 형태만 다룬다.
 */
export function parseFencedJsonReply(text: string, label: string): FencedReplyResult {
  const fenceAt = text.indexOf('```json')
  if (fenceAt === -1) return { reply: text, data: null, status: 'none' }

  const head = text.slice(0, fenceAt).trim()
  const closed = text.match(/```json\s*\n?([\s\S]*?)\n?```/)
  // 닫는 펜스가 없으면 잘린 응답 — 펜스 뒤 전부를 본문으로 보고 복구를 시도한다.
  const body = closed ? closed[1] : text.slice(fenceAt + '```json'.length)
  const truncated = !closed

  const finish = (data: Record<string, unknown>, lossy: boolean): FencedReplyResult => {
    if (!lossy) return { reply: head, data, status: 'ok' }
    console.warn(`[${label}] 펜스 JSON 손실 복구 — 변경 일부만 적용됨(응답 잘림 추정)`)
    return {
      reply: head ? `${head}\n\n${NOTICE_PARTIAL}` : NOTICE_PARTIAL,
      data,
      status: 'recovered',
    }
  }

  try {
    return finish(JSON.parse(body) as Record<string, unknown>, false);
  } catch {
    // 깨진 JSON — 복구 시도. repairJson 은 손실 전략 사용 시 스스로 경고를 남긴다.
    try {
      const repaired = repairJson<Record<string, unknown>>(body)
      // 절단 복구는 항목을 버린 것이므로 성공해도 "일부"로 취급한다.
      return finish(repaired, true)
    } catch {
      console.warn(
        `[${label}] 펜스 JSON 파싱 실패 — 변경 미적용 (${truncated ? '잘림' : '형식 오류'}, ${text.length}자)`,
      )
      return {
        reply: stripLeakedUpdatesBlock(text, truncated ? NOTICE_TRUNCATED : NOTICE_UNREADABLE),
        data: null,
        status: 'failed',
      }
    }
  }
}

/** data 에서 updates 배열을 꺼낸다(없으면 빈 배열) — 세 챗 라우트 공통 형태. */
export function updatesFrom(data: Record<string, unknown> | null): unknown[] {
  const u = data?.updates
  return Array.isArray(u) ? u : []
}
