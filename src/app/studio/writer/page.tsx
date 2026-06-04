'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { SceneCards } from '@/features/writer/scene-cards'
import { ShotsDialog } from '@/features/writer/shots-dialog'
import { useSvcStatus } from '@/lib/svc/use-svc-status'

export default function WriterPage() {
  const {
    storyText,
    sceneManifest,
    shots,
    generating,
    error,
    generateScenes,
    clearError,
  } = useWriterStore()

  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useWriterStore((s) => s.loadProject)
  const reorderScenes = useWriterStore((s) => s.reorderScenes)

  // svc-pipeline 진행상황 폴링
  const { status: svcStatus } = useSvcStatus(projectId)
  const svcActive = !!svcStatus?.started && !svcStatus.pipeline_completed && !svcStatus.pipeline_failed
  const svcDone = !!svcStatus?.pipeline_completed

  const [autoGenTriggered, setAutoGenTriggered] = useState(false)
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)

  // L6/L7 결과 캐시
  type ImgItem = { shot_id: string; scene_id: string; image_url: string; status: string; error?: string; request_id?: string }
  type VidItem = { shot_id: string; scene_id: string; video_url: string; status: string; first_frame_url: string; error?: string; request_id?: string; duration_seconds?: number }
  type AssetItem = { id: string; kind: 'character' | 'location'; name: string; image_url: string; status: string; error?: string; request_id?: string }
  const [svcImages, setSvcImages] = useState<ImgItem[] | null>(null)
  const [svcVideos, setSvcVideos] = useState<VidItem[] | null>(null)
  const [svcAssets, setSvcAssets] = useState<{ characters: AssetItem[]; locations: AssetItem[] } | null>(null)
  const [generatingAssets, setGeneratingAssets] = useState(false)

  // shot_id에서 숫자 추출 → int 비교 (shot_1, shot_2, ..., shot_10, shot_11, shot_12)
  const sortByShotIdInt = <T extends { shot_id: string }>(arr: T[]): T[] => {
    const key = (id: string) => (id.match(/\d+/g) ?? []).map(Number)
    return [...arr].sort((a, b) => {
      const ka = key(a.shot_id), kb = key(b.shot_id)
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        const av = ka[i] ?? 0, bv = kb[i] ?? 0
        if (av !== bv) return av - bv
      }
      return 0
    })
  }
  const [mediaStatus, setMediaStatus] = useState<string>('')
  const [generatingMedia, setGeneratingMedia] = useState<'images' | 'videos' | null>(null)

  // 폴링 + 자동 resume:
  //   - generatingMedia 중이거나 pending이 남아있으면 5초마다 logs fetch.
  //   - pending 발견 시 /api/svc/resume/{type} 동시 호출 (fal queue 결과 회수).
  //   - 모든 샷이 success/failed 되면 자동 종료.
  const hasAnyPending = useMemo(
    () => {
      const a = svcAssets ? [...svcAssets.characters, ...svcAssets.locations] : []
      return (
        (svcImages?.some((i) => i.status === 'pending') ?? false) ||
        (svcVideos?.some((v) => v.status === 'pending') ?? false) ||
        a.some((x) => x.status === 'pending')
      )
    },
    [svcImages, svcVideos, svcAssets],
  )
  useEffect(() => {
    if (!projectId) return
    if (!generatingMedia && !generatingAssets && !hasAnyPending) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const tickOne = async (kind: 'images' | 'videos' | 'assets') => {
      const file =
        kind === 'images' ? '15_L6_images.json' : kind === 'videos' ? '16_L7_videos.json' : '14b_assets.json'
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
          const stillPending = [...characters, ...locations].some((a) => a.status === 'pending')
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
      // 활성 트리거 없으면 pending 있는 것만
      if (kinds.length === 0) {
        if (svcImages?.some((i) => i.status === 'pending')) kinds.push('images')
        if (svcVideos?.some((v) => v.status === 'pending')) kinds.push('videos')
        const a = svcAssets ? [...svcAssets.characters, ...svcAssets.locations] : []
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
    // 종속성에 svcImages/svcVideos/svcAssets 자체는 넣지 않음 (hasAnyPending에 압축)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, generatingMedia, generatingAssets, hasAnyPending])

  // L6/L7/Assets 결과 로드
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      try {
        const ra = await fetch(`/api/svc/logs/${projectId}?file=14b_assets.json`)
        if (ra.ok && !cancelled) {
          const j = await ra.json()
          if (j.data) setSvcAssets({ characters: j.data.characters ?? [], locations: j.data.locations ?? [] })
        }
        const ri = await fetch(`/api/svc/logs/${projectId}?file=15_L6_images.json`)
        if (ri.ok && !cancelled) {
          const j = await ri.json()
          if (j.data?.shots) setSvcImages(sortByShotIdInt(j.data.shots))
        }
        const rv = await fetch(`/api/svc/logs/${projectId}?file=16_L7_videos.json`)
        if (rv.ok && !cancelled) {
          const j = await rv.json()
          if (j.data?.shots) setSvcVideos(sortByShotIdInt(j.data.shots))
        }
      } catch {}
    }
    load()
    return () => { cancelled = true }
  }, [projectId, generatingMedia, generatingAssets])

  const triggerImageGen = async (force = false) => {
    if (!projectId) return
    setGeneratingMedia('images')
    const remaining = svcImages?.filter(i => i.status !== 'success').length
    const totalFromState = svcImages?.length ?? null
    setMediaStatus(
      force
        ? '전체 이미지 재생성 중 (fal.ai openai/gpt-image-2)...'
        : remaining !== undefined && totalFromState !== null && remaining < totalFromState
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
        setMediaStatus(`❌ ${j.error ?? 'failed'}`)
        return
      }
      setSvcImages(sortByShotIdInt(j.shots))
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `⏳ 이미지 ${j.success_count}/${j.total_shots} (대기 ${pending} — fal에서 자동 회수 중)`
          : `✅ 이미지 ${j.success_count}/${j.total_shots}`,
      )
    } catch (e) {
      setMediaStatus(`❌ ${e instanceof Error ? e.message : String(e)}`)
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
        setMediaStatus(`❌ ${j.error ?? 'failed'}`)
        return
      }
      setSvcVideos(sortByShotIdInt(j.shots))
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `⏳ 영상 ${j.success_count}/${j.total_shots} (대기 ${pending} — fal에서 자동 회수 중)`
          : `✅ 영상 ${j.success_count}/${j.total_shots} (실패 ${j.failed_count}, 스킵 ${j.skipped_count})`,
      )
    } catch (e) {
      setMediaStatus(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGeneratingMedia(null)
    }
  }

  const triggerAssetsGen = async (force = false) => {
    if (!projectId) return
    setGeneratingAssets(true)
    setMediaStatus(force ? '에셋 전체 재생성 중 (openai/gpt-image-2)...' : '에셋 생성 중 (openai/gpt-image-2)...')
    try {
      const r = await fetch('/api/svc/generate/assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, concurrency: 4, force }),
      })
      const j = await r.json()
      if (!r.ok) {
        setMediaStatus(`❌ ${j.error ?? 'failed'}`)
        return
      }
      setSvcAssets({ characters: j.characters ?? [], locations: j.locations ?? [] })
      const pending = j.pending_count ?? 0
      setMediaStatus(
        pending > 0
          ? `⏳ 에셋 ${j.success_count}/${j.total} (대기 ${pending} — fal에서 자동 회수 중)`
          : `✅ 에셋 ${j.success_count}/${j.total}`,
      )
    } catch (e) {
      setMediaStatus(`❌ ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setGeneratingAssets(false)
    }
  }

  // ── Zip 일괄 다운로드 (클라이언트 측, 서버 부담 없음) ─────────────────────
  const downloadAllAsZip = async (kind: 'images' | 'videos') => {
    const items =
      kind === 'images'
        ? svcImages?.filter((i) => i.status === 'success' && i.image_url)
        : svcVideos?.filter((v) => v.status === 'success' && v.video_url)
    if (!items || items.length === 0) {
      setMediaStatus(`❌ 다운로드할 ${kind === 'images' ? '이미지' : '영상'} 없음`)
      return
    }
    setMediaStatus(`📦 ${kind === 'images' ? '이미지' : '영상'} zip 만드는 중 (${items.length}개)...`)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      // 순서 보장: 정렬된 배열 + 01_ 02_ prefix
      const pad = (n: number) => String(n).padStart(2, '0')
      // 병렬 fetch (서버 부담 0 — 모두 fal CDN)
      await Promise.all(
        items.map(async (it, idx) => {
          const url = kind === 'images' ? (it as ImgItem).image_url : (it as VidItem).video_url
          const r = await fetch(url)
          if (!r.ok) throw new Error(`fetch ${it.shot_id} failed: ${r.status}`)
          const blob = await r.blob()
          const guessedExt =
            kind === 'images'
              ? (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('+xml', '')
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
      setMediaStatus(`✅ ${kind === 'images' ? '이미지' : '영상'} zip 저장 완료 (${items.length}개)`)
    } catch (e) {
      setMediaStatus(`❌ zip 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  // Auto-generate scenes if story exists but no scenes yet
  // svc-pipeline이 실행 중이거나 완료됐으면 기존 자동 생성 스킵 (svc 결과 사용)
  useEffect(() => {
    if (
      storyText &&
      storyText.length >= 20 &&
      !sceneManifest &&
      !generating &&
      !autoGenTriggered &&
      !svcStatus?.started
    ) {
      setAutoGenTriggered(true)
      generateScenes()
    }
  }, [storyText, sceneManifest, generating, autoGenTriggered, generateScenes, svcStatus?.started])

  const shotCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of shots) m[s.sceneId] = (m[s.sceneId] ?? 0) + 1
    return m
  }, [shots])

  // ── No scenes yet ──
  if (!sceneManifest) {
    return (
      <>
        <div className="flex flex-1 flex-col overflow-y-auto p-8">
          <div className="mx-auto w-full max-w-3xl space-y-4 text-center">
            {svcActive ? (
              <>
                <Sparkles className="mx-auto size-8 animate-pulse text-violet-500" />
                <h1 className="text-xl font-bold">AI 자동 생성 진행 중…</h1>
                <div className="text-sm text-muted-foreground">
                  <div>현재 단계: <span className="font-mono">{svcStatus?.current_stage ?? '시작 중'}</span></div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-violet-500 transition-all"
                      style={{ width: `${svcStatus?.progress_percent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs">{svcStatus?.progress_percent ?? 0}%</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  스토리, 캐릭터, 씬, 샷, 프롬프트를 백그라운드에서 생성 중. 약 3-5분.
                </p>
              </>
            ) : generating ? (
              <>
                <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
                <h1 className="text-xl font-bold">Generating Scenes…</h1>
                <p className="text-sm text-muted-foreground">
                  The AI is breaking your story into scenes and shots.
                </p>
              </>
            ) : svcStatus?.pipeline_failed ? (
              <>
                <h1 className="text-xl font-bold text-destructive">AI 자동 생성 실패</h1>
                <p className="text-sm text-muted-foreground">
                  {svcStatus.error ?? 'svc-pipeline error'}
                </p>
                <p className="text-xs text-muted-foreground">아래 수동 작성 버튼으로 직접 진행 가능.</p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">No Scenes Yet</h1>
                <p className="text-sm text-muted-foreground">
                  Go back to The Meeting Room and complete your story with
                  the Producer. Scenes will be generated automatically when
                  you hand off.
                </p>
              </>
            )}

            {error && (
              <button
                type="button"
                className="w-full rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive"
                onClick={clearError}
              >
                {error}
              </button>
            )}

            {/* svc-pipeline 완료 시: 이미지/영상 수동 생성 + 미리보기 */}
            {(svcDone || (svcImages && svcImages.length > 0) || (svcVideos && svcVideos.length > 0) || svcAssets) && (
              <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-left">
                <div>
                  <h2 className="text-base font-semibold">🎨 미디어 생성</h2>
                  <p className="text-xs text-muted-foreground">
                    에셋 → 이미지 → 영상 순서. 에셋은 캐릭터/배경 reference로 L6 I2I에 주입됨.
                  </p>
                  {mediaStatus && <p className="mt-2 text-sm">{mediaStatus}</p>}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => triggerAssetsGen(false)}
                    disabled={generatingAssets || generatingMedia !== null}
                    className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {generatingAssets ? '생성 중…' : (
                      svcAssets && (svcAssets.characters.length + svcAssets.locations.length) > 0 &&
                      [...svcAssets.characters, ...svcAssets.locations].every((a) => a.status === 'success')
                        ? `✅ 에셋 완료 (${svcAssets.characters.length + svcAssets.locations.length})`
                        : svcAssets && [...svcAssets.characters, ...svcAssets.locations].some((a) => a.status !== 'success')
                          ? `0️⃣ 실패/대기 에셋 재시도`
                          : '0️⃣ 캐릭터·배경 reference 에셋 생성'
                    )}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => triggerImageGen(false)}
                      disabled={generatingMedia !== null || generatingAssets}
                      className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {generatingMedia === 'images' ? '생성 중…' : (
                        svcImages && svcImages.filter(i => i.status === 'success').length === svcImages.length
                          ? `✅ 이미지 완료 (${svcImages.length})`
                          : svcImages && svcImages.filter(i => i.status !== 'success').length > 0
                            ? `1️⃣ 실패한 ${svcImages.filter(i => i.status !== 'success').length}개 재시도`
                            : '1️⃣ 이미지 생성'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerVideoGen(false)}
                      disabled={generatingMedia !== null || !(
                        svcStatus?.available?.['L6/images'] === true ||
                        (!!svcImages && svcImages.filter(i => i.status === 'success').length > 0)
                      )}
                      title={
                        svcStatus?.available?.['L6/images'] === true ||
                        (svcImages && svcImages.filter(i => i.status === 'success').length > 0)
                          ? ''
                          : '이미지를 먼저 생성하세요'
                      }
                      className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {generatingMedia === 'videos' ? '생성 중…' : (
                        svcVideos && svcVideos.filter(v => v.status === 'success').length === svcVideos.length && svcVideos.length > 0
                          ? `✅ 영상 완료 (${svcVideos.length})`
                          : svcVideos && svcVideos.filter(v => v.status !== 'success').length > 0
                            ? `2️⃣ 실패한 ${svcVideos.filter(v => v.status !== 'success').length}개 재시도`
                            : '2️⃣ 영상 생성'
                      )}
                    </button>
                  </div>
                  {/* 강제 재생성 + zip 다운로드 */}
                  {(svcImages || svcVideos) && (
                    <div className="flex flex-wrap gap-3 text-[11px]">
                      {svcImages && (
                        <>
                          <button
                            type="button"
                            onClick={() => triggerImageGen(true)}
                            disabled={generatingMedia !== null}
                            className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                          >
                            이미지 전체 재생성
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAllAsZip('images')}
                            disabled={!svcImages?.some((i) => i.status === 'success')}
                            className="text-violet-600 underline hover:text-violet-700 disabled:opacity-50"
                          >
                            📦 이미지 zip 일괄 저장
                          </button>
                        </>
                      )}
                      {svcVideos && (
                        <>
                          <button
                            type="button"
                            onClick={() => triggerVideoGen(true)}
                            disabled={generatingMedia !== null}
                            className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                          >
                            영상 전체 재생성
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAllAsZip('videos')}
                            disabled={!svcVideos?.some((v) => v.status === 'success')}
                            className="text-violet-600 underline hover:text-violet-700 disabled:opacity-50"
                          >
                            📦 영상 zip 일괄 저장
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {svcAssets && (svcAssets.characters.length + svcAssets.locations.length) > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      📁 에셋 ({svcAssets.characters.length} 캐릭터 + {svcAssets.locations.length} 배경)
                    </h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {[...svcAssets.characters, ...svcAssets.locations].map((a) => (
                        <div key={`${a.kind}_${a.id}`} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">
                            {a.kind === 'character' ? '👤' : '🌆'} {a.name || a.id}
                          </div>
                          {a.status === 'success' && a.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image_url} alt={a.id} className="aspect-video w-full object-cover" />
                          ) : a.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">
                              ⏳ 생성 중...
                            </div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">
                              {a.error ?? a.status}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {svcImages && svcImages.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">이미지 ({svcImages.length})</h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {svcImages.map((img) => (
                        <div key={img.shot_id} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">{img.shot_id}</div>
                          {img.status === 'success' && img.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.image_url} alt={img.shot_id} className="aspect-video w-full object-cover" />
                          ) : img.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">
                              ⏳ fal 생성 중...
                            </div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">
                              {img.error ?? img.status}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {svcVideos && svcVideos.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">영상 ({svcVideos.length})</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {svcVideos.map((v) => (
                        <div key={v.shot_id} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">{v.shot_id}</div>
                          {v.status === 'success' && v.video_url ? (
                            <video src={v.video_url} controls className="aspect-video w-full" />
                          ) : v.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">
                              ⏳ fal 생성 중...
                            </div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">
                              {v.status === 'skipped' ? '이미지 없음 (skipped)' : v.status}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <HandoffButton
          label="Ask Concept Artist"
          targetStage="artist"
          disabled
        />
      </>
    )
  }

  // ── Scene list + chat-centric layout ──
  return (
    <>
      <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-border">
          <SceneCards
            manifest={sceneManifest}
            shotCounts={shotCounts}
            onOpenScene={setOpenSceneId}
            activeSceneId={openSceneId}
            onReorder={reorderScenes}
          />
        </aside>

        <main className="flex min-h-0 flex-col overflow-y-auto p-8">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <div className="text-center text-sm text-muted-foreground">
              <h2 className="text-base font-semibold text-foreground">The Script Room</h2>
              <p className="mt-1">
                Click a scene on the left to edit its shots.
              </p>
            </div>

            {/* svc-pipeline 미디어 생성 패널 */}
            {(svcDone || (svcImages && svcImages.length > 0) || (svcVideos && svcVideos.length > 0) || svcAssets) && (
              <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                <div>
                  <h2 className="text-base font-semibold">🎨 AI 미디어 생성 (svc-pipeline)</h2>
                  <p className="text-xs text-muted-foreground">
                    에셋(캐릭터·배경 reference) → 이미지(I2I) → 영상
                  </p>
                  {mediaStatus && <p className="mt-2 text-sm">{mediaStatus}</p>}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => triggerAssetsGen(false)}
                    disabled={generatingAssets || generatingMedia !== null}
                    className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {generatingAssets ? '생성 중…' : (
                      svcAssets && (svcAssets.characters.length + svcAssets.locations.length) > 0 &&
                      [...svcAssets.characters, ...svcAssets.locations].every((a) => a.status === 'success')
                        ? `✅ 에셋 완료 (${svcAssets.characters.length + svcAssets.locations.length})`
                        : svcAssets && [...svcAssets.characters, ...svcAssets.locations].some((a) => a.status !== 'success')
                          ? `0️⃣ 실패/대기 에셋 재시도`
                          : '0️⃣ 캐릭터·배경 reference 에셋 생성'
                    )}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => triggerImageGen(false)}
                      disabled={generatingMedia !== null || generatingAssets}
                      className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {generatingMedia === 'images' ? '생성 중…' : (
                        svcImages && svcImages.filter(i => i.status === 'success').length === svcImages.length
                          ? `✅ 이미지 완료 (${svcImages.length})`
                          : svcImages && svcImages.filter(i => i.status !== 'success').length > 0
                            ? `1️⃣ 실패한 ${svcImages.filter(i => i.status !== 'success').length}개 재시도`
                            : '1️⃣ 이미지 생성'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerVideoGen(false)}
                      disabled={generatingMedia !== null || !(
                        svcStatus?.available?.['L6/images'] === true ||
                        (!!svcImages && svcImages.filter(i => i.status === 'success').length > 0)
                      )}
                      title={
                        svcStatus?.available?.['L6/images'] === true ||
                        (svcImages && svcImages.filter(i => i.status === 'success').length > 0)
                          ? ''
                          : '이미지를 먼저 생성하세요'
                      }
                      className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50"
                    >
                      {generatingMedia === 'videos' ? '생성 중…' : (
                        svcVideos && svcVideos.filter(v => v.status === 'success').length === svcVideos.length && svcVideos.length > 0
                          ? `✅ 영상 완료 (${svcVideos.length})`
                          : svcVideos && svcVideos.filter(v => v.status !== 'success').length > 0
                            ? `2️⃣ 실패한 ${svcVideos.filter(v => v.status !== 'success').length}개 재시도`
                            : '2️⃣ 영상 생성'
                      )}
                    </button>
                  </div>
                  {/* 강제 재생성 + zip 다운로드 */}
                  {(svcImages || svcVideos) && (
                    <div className="flex flex-wrap gap-3 text-[11px]">
                      {svcImages && (
                        <>
                          <button
                            type="button"
                            onClick={() => triggerImageGen(true)}
                            disabled={generatingMedia !== null}
                            className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                          >
                            이미지 전체 재생성
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAllAsZip('images')}
                            disabled={!svcImages?.some((i) => i.status === 'success')}
                            className="text-violet-600 underline hover:text-violet-700 disabled:opacity-50"
                          >
                            📦 이미지 zip 일괄 저장
                          </button>
                        </>
                      )}
                      {svcVideos && (
                        <>
                          <button
                            type="button"
                            onClick={() => triggerVideoGen(true)}
                            disabled={generatingMedia !== null}
                            className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                          >
                            영상 전체 재생성
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadAllAsZip('videos')}
                            disabled={!svcVideos?.some((v) => v.status === 'success')}
                            className="text-violet-600 underline hover:text-violet-700 disabled:opacity-50"
                          >
                            📦 영상 zip 일괄 저장
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {svcAssets && (svcAssets.characters.length + svcAssets.locations.length) > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      📁 에셋 ({svcAssets.characters.length} 캐릭터 + {svcAssets.locations.length} 배경)
                    </h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {[...svcAssets.characters, ...svcAssets.locations].map((a) => (
                        <div key={`${a.kind}_${a.id}`} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">
                            {a.kind === 'character' ? '👤' : '🌆'} {a.name || a.id}
                          </div>
                          {a.status === 'success' && a.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image_url} alt={a.id} className="aspect-video w-full object-cover" />
                          ) : a.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">⏳ 생성 중...</div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">{a.error ?? a.status}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {svcImages && svcImages.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">이미지 ({svcImages.length})</h3>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {svcImages.map((img) => (
                        <div key={img.shot_id} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">{img.shot_id}</div>
                          {img.status === 'success' && img.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.image_url} alt={img.shot_id} className="aspect-video w-full object-cover" />
                          ) : img.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">⏳ fal 생성 중...</div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">{img.error ?? img.status}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {svcVideos && svcVideos.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">영상 ({svcVideos.length})</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {svcVideos.map((v) => (
                        <div key={v.shot_id} className="overflow-hidden rounded border border-border">
                          <div className="bg-muted px-2 py-1 text-[10px] font-mono">{v.shot_id}</div>
                          {v.status === 'success' && v.video_url ? (
                            <video src={v.video_url} controls className="aspect-video w-full" />
                          ) : v.status === 'pending' ? (
                            <div className="flex aspect-video items-center justify-center bg-amber-500/10 p-2 text-[10px] text-amber-700">⏳ fal 생성 중...</div>
                          ) : (
                            <div className="aspect-video bg-destructive/10 p-2 text-[10px] text-destructive">
                              {v.status === 'skipped' ? '이미지 없음' : v.status}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <ShotsDialog
        sceneId={openSceneId}
        manifest={sceneManifest}
        shots={shots}
        onClose={() => setOpenSceneId(null)}
      />

      {error && (
        <button
          type="button"
          className="w-full border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-left text-sm text-destructive"
          onClick={clearError}
        >
          {error}
        </button>
      )}

      <HandoffButton
        label="Ask Concept Artist"
        targetStage="artist"
        disabled={shots.length === 0}
      />
    </>
  )
}
