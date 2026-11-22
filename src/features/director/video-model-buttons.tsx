// 영상 모델 단추 묶음(독립 영상 · 영상 노드 상세 패널) — 프로젝트 화면비에 맞지 않는 모델은 꺼지고, 단추 아래에 까닭 한 줄(오너 2026-11-22 V3).
//   이미 고른 값은 고른 표시를 남긴다 — 다른 모델로 저절로 바꾸지 않는다(혼자 정한 것 h6, 서버도 자동 대체 없음). 약속: tests/director/veo-aspect-ui.test.ts
//   컴포넌트가 아니라 요소를 돌려주는 함수다 — 패널 시험(tests/director/video-resolution-ui)이 패널 요소 나무에서 모델 단추를 바로 찾는다.
import { cn } from '@/lib/utils'
import { FAL_VIDEO_MODEL_ORDER, VIDEO_MODEL_ASPECT_TEXT, VIDEO_MODELS, videoModelFitsAspectRatio, type VideoModelKey } from '@/lib/video-models'

type Translate = (text: string, params?: Record<string, string | number>) => string

export function videoModelButtons({
  value,
  aspectRatio,
  onSelect,
  t,
}: {
  value: VideoModelKey
  /** 프로젝트 화면비(projectVideoAspect). */
  aspectRatio: string
  onSelect: (key: VideoModelKey) => void
  t: Translate
}) {
  const blocked = FAL_VIDEO_MODEL_ORDER.filter((key) => !videoModelFitsAspectRatio(key, aspectRatio))
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {FAL_VIDEO_MODEL_ORDER.map((key) => {
          const off = blocked.includes(key)
          return (
            <button
              type="button"
              key={key}
              disabled={off}
              title={off ? t(VIDEO_MODEL_ASPECT_TEXT) : undefined}
              onClick={() => onSelect(key)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                value === key ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
              )}
              aria-pressed={value === key}
            >
              <span className="block font-medium">{VIDEO_MODELS[key].label}</span>
            </button>
          )
        })}
      </div>
      {blocked.length > 0 && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{t(VIDEO_MODEL_ASPECT_TEXT)}</p>}
    </>
  )
}
