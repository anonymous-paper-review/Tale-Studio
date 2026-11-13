// D8 Lumi 알림 카드의 글 · 단추(11/13 시안 414:5066, 오너 2026-11-14 "추천대로") — 끝난 수는 이번 일괄 결과, 실패한 샷 · 다음 할 일은
//   지금 보드 상태(shot-state, 보드 테두리 · 위쪽 단추와 같은 판정)로 고른다. 순수 함수. 약속: tests/director/lumi-batch-notice.test.ts
//   영상: 실패가 있으면 [빼고 Editor로](다음 단계 단추와 같은 길) · [샷 N 다시 만들기](그 샷 영상만), 다 되면 [Editor로 넘기기].
//   이미지: [영상 만들기 · N](이미지 나온 샷 영상 칩과 같은 샷).
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { DirectorShotState } from '@/lib/director/shot-state'
import { shotListLabel } from '@/lib/director/lumi-chat-runs'
import { quickChipTargets } from '@/lib/director/lumi-quick-chips'
import type { LumiBatchNotice } from '@/stores/lumi-notice-store'

export type LumiNoticeAction =
  | { kind: 'handoff'; label: string }
  | { kind: 'videos'; label: string; shotIds: string[] }

export interface LumiNoticeView {
  title: string
  body: string | null
  /** 하나라도 완성됐다 — 시안 D8 의 초록 테두리. 모두 실패면 기본 테두리. */
  done: boolean
  /** 앞의 것이 밝은(메인) 단추. */
  actions: LumiNoticeAction[]
}

export function lumiBatchNoticeView(input: {
  notice: LumiBatchNotice
  states: ReadonlyMap<string, DirectorShotState>
  labelOf: (shotNodeId: string) => number | string
  /** 실패한 영상의 Take 를 돌려드렸다 — Take 를 쓰는 계정(과금 켜짐 · 무제한 아님)일 때만 참. */
  takesReturned: boolean
  locale: AppLocale
}): LumiNoticeView {
  const { notice, states, labelOf, takesReturned, locale } = input
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  const having = (state: DirectorShotState) => [...states].filter(([, s]) => s === state).map(([id]) => id)
  const done = notice.done > 0

  if (notice.kind === 'image') {
    const videos = quickChipTargets('videos', states).videos
    return {
      title: notice.done === 0 ? t("The images weren't made") : notice.done === 1 ? t('One image is done') : t('{count} images are done', { count: notice.done }),
      body: notice.failed > 0
        ? t('{count} could not be made. Use Make images at the top to try again.', { count: notice.failed })
        : videos.length > 0 ? t('Check the images, then make the videos.') : null,
      done,
      actions: videos.length > 0 ? [{ kind: 'videos', label: t('Make videos · {count}', { count: videos.length }), shotIds: videos }] : [],
    }
  }

  const title = notice.done === 0 ? t("The videos weren't made") : notice.done === 1 ? t('One video is done') : t('{count} videos are done', { count: notice.done })
  // 넘길 영상이 하나도 없으면 Editor 로 가는 단추는 두지 않는다.
  const canHandOff = having('video_done').length > 0
  const failed = having('video_failed')
  if (failed.length === 0) {
    return {
      title,
      body: canHandOff ? t('Join them into one video in Editor.') : null,
      done,
      actions: canHandOff ? [{ kind: 'handoff', label: t('Hand over to Editor') }] : [],
    }
  }
  const shots = shotListLabel(locale, failed.map(labelOf))
  const one = failed.length === 1
  const body = takesReturned
    ? one
      ? t('The video for {shots} failed, and your Takes were returned. Make it again, or leave it out and join the rest in Editor.', { shots })
      : t('The videos for {shots} failed, and your Takes were returned. Make them again, or leave them out and join the rest in Editor.', { shots })
    : one
      ? t('The video for {shots} failed. Make it again, or leave it out and join the rest in Editor.', { shots })
      : t('The videos for {shots} failed. Make them again, or leave them out and join the rest in Editor.', { shots })
  return {
    title,
    body,
    done,
    actions: [
      ...(canHandOff ? [{ kind: 'handoff' as const, label: t('Leave out and go to Editor') }] : []),
      { kind: 'videos', label: t('Make {shots} again', { shots }), shotIds: failed },
    ],
  }
}
