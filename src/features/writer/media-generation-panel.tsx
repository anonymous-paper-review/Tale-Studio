'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Palette,
  RotateCcw,
  User,
  Video as VideoIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SvcStatusLike = {
  pipeline_completed?: boolean
  available?: Record<string, boolean | undefined>
} | null | undefined

type ImgItem = {
  shot_id: string
  scene_id: string
  image_url: string
  status: string
  error?: string
  request_id?: string
}
type VidItem = {
  shot_id: string
  scene_id: string
  video_url: string
  status: string
  first_frame_url: string
  error?: string
  request_id?: string
  duration_seconds?: number
}
type AssetItem = {
  id: string
  kind: 'character' | 'location'
  name: string
  image_url: string
  status: string
  error?: string
  request_id?: string
}

// shot_id에서 숫자 추출 → int 비교 (shot_1 … shot_10 … shot_12)
function sortByShotIdInt<T extends { shot_id: string }>(arr: T[]): T[] {
  const key = (id: string) => (id.match(/\d+/g) ?? []).map(Number)
  return [...arr].sort((a, b) => {
    const ka = key(a.shot_id),
      kb = key(b.shot_id)
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const av = ka[i] ?? 0,
        bv = kb[i] ?? 0
      if (av !== bv) return av - bv
    }
    return 0
  })
}

// ── 공통 미디어 카드 그리드 ──
type GridItem = {
  key: string
  label: ReactNode
  url?: string
  status: string
  failureText?: string
}

function MediaGrid({
  title,
  cols,
  media,
  items,
}: {
  title: ReactNode
  cols: string
  media: 'image' | 'video'
  items: GridItem[]
}) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className={cn('grid gap-2', cols)}>
        {items.map((it) => (
          <div
            key={it.key}
            className="overflow-hidden rounded-md border border-border"
          >
            <div className="bg-muted px-2 py-1 font-mono text-[11px]">
              {it.label}
            </div>
            {it.status === 'success' && it.url ? (
              media === 'video' ? (
                <video src={it.url} controls className="aspect-video w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.url}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              )
            ) : it.status === 'pending' ? (
              <div className="flex aspect-video items-center justify-center gap-1 bg-warning/10 text-[11px] text-warning">
                <Loader2 className="size-3 animate-spin" />
                생성 중
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center bg-destructive/10 p-2 text-[11px] text-destructive">
                {it.failureText ?? it.status}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface MediaGenerationPanelProps {
  projectId: string | null
  svcStatus: SvcStatusLike
}

/**
 * svc-pipeline 미디어 생성 패널 — 에셋 → 이미지 → 영상.
 * 폴링·자동 resume·zip 일괄 다운로드 포함. writer 페이지 두 분기에서 공용.
 * 표시 조건(pipeline 완료 또는 기존 미디어 존재)을 내부에서 판단 → 없으면 null.
 */
export function MediaGenerationPanel({
  projectId,
  svcStatus,
}: MediaGenerationPanelProps) {
  const [svcImages, setSvcImages] = useState<ImgItem[] | null>(null)
  const [svcVideos, setSvcVideos] = useState<VidItem[] | null>(null)
  const [svcAssets, setSvcAssets] = useState<{
    characters: AssetItem[]
    locations: AssetItem[]
  } | null>(null)
  const [generatingAssets, setGeneratingAssets] = useState(false)
  const [generatingMedia, setGeneratingMedia] = useState<
    'images' | 'videos' | null
  >(null)
  const [mediaStatus, setMediaStatus] = useState<string>('')

  const hasAnyPending = useMemo(() => {
    const a = svcAssets ? [...svcAssets.characters, ...svcAssets.locations] : []
    return (
      (svcImages?.some((i) => i.status === 'pending') ?? false) ||
      (svcVideos?.some((v) => v.status === 'pending') ?? false) ||
      a.some((x) => x.status === 'pending')
    )
  }, [svcImages, svcVideos, svcAssets])

  // 폴링 + 자동 resume (fal queue 결과 회수)
  useEffect(() => {
    if (!projectId) return
    if (!generatingMedia && !generatingAssets && !hasAnyPending) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const tickOne = async (kind: 'images' | 'videos' | 'assets') => {
      const file =
        kind === 'images'
          ? '15_L6_images.json'
          : kind === 'videos'
            ? '16_L7_videos.json'
            : '14b_assets.json'
      try {
        const r = await fetch(`/api/svc/logs/${projectId}?file=${file}`)
        if (!r.ok) return
        const j = await r.json()
        const data = j.data
        if (!data || cancelled) return
        if (kind === 'assets') {
          const characters: AssetItem[] = data.characters ?? []
          const locations: AssetItem[] = data.locations ?? []
          setSvcAssets({ characters, locations })
          const stillPending = [...characters, ...locations].some(
            (a) => a.status === 'pending',
          )
          if (stillPending) {
            fetch(`/api/svc/resume/assets`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ projectId }),
            }).catch(() => {})
          }
          return
        }
        const shots: Array<{ status: string }> = data.shots ?? []
        if (shots.length === 0) return
        if (kind === 'images') setSvcImages(sortByShotIdInt(shots as ImgItem[]))
        else setSvcVideos(sortByShotIdInt(shots as VidItem[]))
        if (shots.some((s) => s.status === 'pending')) {
          fetch(`/api/svc/resume/${kind}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectId }),
          }).catch(() => {})
        }
      } catch {}
    }

    const tick = async () => {
      if (cancelled) return
      const kinds: Array<'images' | 'videos' | 'assets'> = []
      if (generatingMedia) kinds.push(generatingMedia)
      if (generatingAssets) kinds.push('assets')
      if (kinds.length === 0) {
        if (svcImages?.some((i) => i.status === 'pending')) kinds.push('images')
        if (svcVideos?.some((v) => v.status === 'pending')) kinds.push('videos')
        const a = svcAssets
          ? [...svcAssets.characters, ...svcAssets.locations]
          : []
        if (a.some((x) => x.status === 'pending')) kinds.push('assets')
      }
      await Promise.all(kinds.map(tickOne))
      if (!cancelled) timeoutId = setTimeout(tick, 5000)
    }
    timeoutId = setTimeout(tick, 3000)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
    // svcImages/svcVideos/svcAssets는 hasAnyPending으로 압축
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, generatingMedia, generatingAssets, hasAnyPending])

  // 기존 L6/L7/Assets 결과 로드
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      try {
        const ra = await fetch(
          `/api/svc/logs/${projectId}?file=14b_assets.json`,
        )
        if (ra.ok && !cancelled) {
          const j = await ra.json()
          if (j.data)
            setSvcAssets({
              characters: j.data.characters ?? [],
              locations: j.data.locations ?? [],
            })
        }
        const ri = await fetch(
          `/api/svc/logs/${projectId}?file=15_L6_images.json`,
        )
        if (ri.ok && !cancelled) {
          const j = await ri.json()
          if (j.data?.shots) setSvcImages(sortByShotIdInt(j.data.shots))
        }
        const rv = await fetch(
          `/api/svc/logs/${projectId}?file=16_L7_videos.json`,
        )
        if (rv.ok && !cancelled) {
          const j = await rv.json()
          if (j.data?.shots) setSvcVideos(sortByShotIdInt(j.data.shots))
        }
      } catch {}
    }
    load()
    return () => {
      cancelled = true
    }
  }, [projectId, generatingMedia, generatingAssets])

  const triggerImageGen = async (force = false) => {
    if (!projectId) return
    setGeneratingMedia('images')
    const remaining = svcImages?.filter((i) => i.status !== 'success').length
    const totalFromState = svcImages?.length ?? null
    setMediaStatus(
      force
        ? '전체 이미지 재생성 중 (fal.ai openai/gpt-image-2)...'
        : remaining !== undefined &&
            totalFromState !== null &&
            remaining < totalFromState
          ? `이미지 ${remaining}개만 재시도 중...`
          : '이미지 생성 중 (fal.ai openai/gpt-image-2)...',
    )
    try {
      const r = await fetch('/api/svc/generate/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, concurrency: 3, force }),
      })
      const j = await r.json()
      if (!r.ok) {
        setMediaStatus(`실패: ${j.error ?? 'failed'}`)
        return
      }
      setSvcImages(sortByShotIdInt(j.shots))
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `이미지 ${j.success_count}/${j.total_shots} (대기 ${pending} — fal 자동 회수 중)`
          : `이미지 완료 ${j.success_count}/${j.total_shots}`,
      )
    } catch (e) {
      setMediaStatus(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGeneratingMedia(null)
    }
  }

  const triggerVideoGen = async (force = false) => {
    if (!projectId) return
    setGeneratingMedia('videos')
    setMediaStatus(
      force
        ? '전체 영상 재생성 중 (alibaba/happy-horse, 5-10분)...'
        : '영상 생성 중 (alibaba/happy-horse, 5-10분)...',
    )
    try {
      const r = await fetch('/api/svc/generate/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, concurrency: 4, force }),
      })
      const j = await r.json()
      if (!r.ok) {
        setMediaStatus(`실패: ${j.error ?? 'failed'}`)
        return
      }
      setSvcVideos(sortByShotIdInt(j.shots))
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `영상 ${j.success_count}/${j.total_shots} (대기 ${pending} — fal 자동 회수 중)`
          : `영상 완료 ${j.success_count}/${j.total_shots} (실패 ${j.failed_count}, 스킵 ${j.skipped_count})`,
      )
    } catch (e) {
      setMediaStatus(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGeneratingMedia(null)
    }
  }

  const triggerAssetsGen = async (force = false) => {
    if (!projectId) return
    setGeneratingAssets(true)
    setMediaStatus(
      force
        ? '에셋 전체 재생성 중 (openai/gpt-image-2)...'
        : '에셋 생성 중 (openai/gpt-image-2)...',
    )
    try {
      const r = await fetch('/api/svc/generate/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, concurrency: 4, force }),
      })
      const j = await r.json()
      if (!r.ok) {
        setMediaStatus(`실패: ${j.error ?? 'failed'}`)
        return
      }
      setSvcAssets({ characters: j.characters ?? [], locations: j.locations ?? [] })
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `에셋 ${j.success_count}/${j.total} (대기 ${pending} — fal 자동 회수 중)`
          : `에셋 완료 ${j.success_count}/${j.total}`,
      )
    } catch (e) {
      setMediaStatus(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGeneratingAssets(false)
    }
  }

  // Zip 일괄 다운로드 (클라이언트 측, fal CDN — 서버 부담 0)
  const downloadAllAsZip = async (kind: 'images' | 'videos') => {
    const items =
      kind === 'images'
        ? svcImages?.filter((i) => i.status === 'success' && i.image_url)
        : svcVideos?.filter((v) => v.status === 'success' && v.video_url)
    if (!items || items.length === 0) {
      setMediaStatus(`다운로드할 ${kind === 'images' ? '이미지' : '영상'} 없음`)
      return
    }
    setMediaStatus(
      `${kind === 'images' ? '이미지' : '영상'} zip 만드는 중 (${items.length}개)...`,
    )
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const pad = (n: number) => String(n).padStart(2, '0')
      await Promise.all(
        items.map(async (it, idx) => {
          const url =
            kind === 'images'
              ? (it as ImgItem).image_url
              : (it as VidItem).video_url
          const r = await fetch(url)
          if (!r.ok) throw new Error(`fetch ${it.shot_id} failed: ${r.status}`)
          const blob = await r.blob()
          const guessedExt =
            kind === 'images'
              ? (blob.type.split('/')[1] || 'png')
                  .replace('jpeg', 'jpg')
                  .replace('+xml', '')
              : (blob.type.split('/')[1] || 'mp4').split(';')[0]
          zip.file(`${pad(idx + 1)}_${it.shot_id}.${guessedExt}`, blob)
        }),
      )
      const out = await zip.generateAsync({ type: 'blob' })
      const dlUrl = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = `${kind}_${projectId}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(dlUrl)
      setMediaStatus(
        `${kind === 'images' ? '이미지' : '영상'} zip 저장 완료 (${items.length}개)`,
      )
    } catch (e) {
      setMediaStatus(
        `zip 실패: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  const svcDone = !!svcStatus?.pipeline_completed
  const hasMedia =
    (!!svcImages && svcImages.length > 0) ||
    (!!svcVideos && svcVideos.length > 0) ||
    !!svcAssets
  if (!svcDone && !hasMedia) return null

  const assetItems = svcAssets
    ? [...svcAssets.characters, ...svcAssets.locations]
    : []
  const assetsAllDone =
    assetItems.length > 0 && assetItems.every((a) => a.status === 'success')
  const assetsHasIssue = assetItems.some((a) => a.status !== 'success')
  const imagesDone =
    !!svcImages && svcImages.filter((i) => i.status === 'success').length === svcImages.length
  const imagesRetry =
    svcImages?.filter((i) => i.status !== 'success').length ?? 0
  const videosDone =
    !!svcVideos &&
    svcVideos.length > 0 &&
    svcVideos.filter((v) => v.status === 'success').length === svcVideos.length
  const videosRetry =
    svcVideos?.filter((v) => v.status !== 'success').length ?? 0
  const videoUnlocked =
    svcStatus?.available?.['L6/images'] === true ||
    (!!svcImages && svcImages.filter((i) => i.status === 'success').length > 0)

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-left">
      <div>
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Palette className="size-4" />
          미디어 생성
        </h2>
        <p className="text-xs text-muted-foreground">
          에셋(캐릭터·배경 reference) → 이미지(I2I) → 영상
        </p>
        {mediaStatus && (
          <p className="mt-2 text-sm text-muted-foreground">{mediaStatus}</p>
        )}
      </div>

      <div className="space-y-2">
        {/* 0. 에셋 */}
        <Button
          className="w-full"
          onClick={() => triggerAssetsGen(false)}
          disabled={generatingAssets || generatingMedia !== null}
        >
          {generatingAssets ? (
            <Loader2 className="size-4 animate-spin" />
          ) : assetsAllDone ? (
            <Check className="size-4" />
          ) : (
            <FolderOpen className="size-4" />
          )}
          {generatingAssets
            ? '생성 중…'
            : assetsAllDone
              ? `에셋 완료 (${assetItems.length})`
              : assetsHasIssue
                ? '실패/대기 에셋 재시도'
                : '캐릭터·배경 reference 에셋 생성'}
        </Button>

        <div className="flex gap-2">
          {/* 1. 이미지 */}
          <Button
            className="flex-1"
            onClick={() => triggerImageGen(false)}
            disabled={generatingMedia !== null || generatingAssets}
          >
            {generatingMedia === 'images' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : imagesDone ? (
              <Check className="size-4" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            {generatingMedia === 'images'
              ? '생성 중…'
              : imagesDone
                ? `이미지 완료 (${svcImages!.length})`
                : imagesRetry > 0 && svcImages
                  ? `실패 ${imagesRetry}개 재시도`
                  : '이미지 생성'}
          </Button>

          {/* 2. 영상 */}
          <Button
            className="flex-1"
            onClick={() => triggerVideoGen(false)}
            disabled={generatingMedia !== null || !videoUnlocked}
            title={videoUnlocked ? '' : '이미지를 먼저 생성하세요'}
          >
            {generatingMedia === 'videos' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : videosDone ? (
              <Check className="size-4" />
            ) : (
              <VideoIcon className="size-4" />
            )}
            {generatingMedia === 'videos'
              ? '생성 중…'
              : videosDone
                ? `영상 완료 (${svcVideos!.length})`
                : videosRetry > 0 && svcVideos
                  ? `실패 ${videosRetry}개 재시도`
                  : '영상 생성'}
          </Button>
        </div>

        {/* 강제 재생성 + zip */}
        {(svcImages || svcVideos) && (
          <div className="flex flex-wrap gap-1">
            {svcImages && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerImageGen(true)}
                  disabled={generatingMedia !== null}
                >
                  <RotateCcw className="size-3.5" />
                  이미지 재생성
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadAllAsZip('images')}
                  disabled={!svcImages?.some((i) => i.status === 'success')}
                >
                  <Download className="size-3.5" />
                  이미지 zip
                </Button>
              </>
            )}
            {svcVideos && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerVideoGen(true)}
                  disabled={generatingMedia !== null}
                >
                  <RotateCcw className="size-3.5" />
                  영상 재생성
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadAllAsZip('videos')}
                  disabled={!svcVideos?.some((v) => v.status === 'success')}
                >
                  <Download className="size-3.5" />
                  영상 zip
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <MediaGrid
        title={
          <span className="flex items-center gap-1.5">
            <FolderOpen className="size-3.5" />
            에셋 ({svcAssets?.characters.length ?? 0} 캐릭터 +{' '}
            {svcAssets?.locations.length ?? 0} 배경)
          </span>
        }
        cols="grid-cols-3 sm:grid-cols-4"
        media="image"
        items={assetItems.map((a) => ({
          key: `${a.kind}_${a.id}`,
          label: (
            <span className="flex items-center gap-1">
              {a.kind === 'character' ? (
                <User className="size-3" />
              ) : (
                <ImageIcon className="size-3" />
              )}
              {a.name || a.id}
            </span>
          ),
          url: a.image_url,
          status: a.status,
          failureText: a.error ?? a.status,
        }))}
      />

      <MediaGrid
        title={<>이미지 ({svcImages?.length ?? 0})</>}
        cols="grid-cols-3 sm:grid-cols-4"
        media="image"
        items={(svcImages ?? []).map((img) => ({
          key: img.shot_id,
          label: img.shot_id,
          url: img.image_url,
          status: img.status,
          failureText: img.error ?? img.status,
        }))}
      />

      <MediaGrid
        title={<>영상 ({svcVideos?.length ?? 0})</>}
        cols="grid-cols-2 sm:grid-cols-3"
        media="video"
        items={(svcVideos ?? []).map((v) => ({
          key: v.shot_id,
          label: v.shot_id,
          url: v.video_url,
          status: v.status,
          failureText: v.status === 'skipped' ? '이미지 없음' : v.status,
        }))}
      />
    </div>
  )
}
