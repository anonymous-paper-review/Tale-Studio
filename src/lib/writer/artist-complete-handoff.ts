// Artist 채팅으로 콘티(Writer 의 콘티, 단계 id writer)로 넘길 때 — [완료하기] 단추(features/artist-room/artist-complete-dialog)와 같은
//   서버 검사(/api/writer/artist-complete: 대표 그림 · 다시 그리는 그림 · 버전 불러오기, 멈춘 실행 이어 가기)를 거친다.
//   예전 채팅 넘김은 이 검사 없이 단계만 올렸다(리드 2026-11-22 고침). 막히면 단추와 같은 까닭을 채팅 말(콘텐츠 언어)로 돌려준다.
//   약속: tests/chat/artist-conti-handoff.test.ts
import { completeError, refreshAfterCompleteRefused } from '@/features/artist-room/artist-complete-dialog'
import { contentLocale } from '@/lib/i18n/content'
import { translate } from '@/lib/i18n/translate'
import { restartWriterStatus } from '@/lib/writer/use-writer-status'
import { useProjectStore } from '@/stores/project-store'

export async function completeArtistForConti(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/writer/artist-complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    const body = (await response.json().catch(() => ({}))) as { code?: string; missing?: { characters?: string[]; locations?: string[] } }
    if (!response.ok) {
      const error = completeError(body.code, body.missing)
      void refreshAfterCompleteRefused(body.code)
      return { ok: false, error: translate(contentLocale(), error.key, error.params) }
    }
    // 단추와 같이 — 실행 상태를 다시 읽고 콘티를 연 것으로 둔다(서버가 저장 단계를 writer 로 올렸다).
    if (useProjectStore.getState().projectId === projectId) {
      restartWriterStatus(projectId)
      useProjectStore.getState().unlockThrough('writer')
    }
    return { ok: true }
  } catch {
    return { ok: false, error: translate(contentLocale(), 'Could not complete. Please try again.') }
  }
}
