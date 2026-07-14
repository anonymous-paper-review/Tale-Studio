// Writer 러프 보드 산출물 수집(#c7·#c12 2026-07-14) — 기본 md 묶음(writer.ts)에 추가로:
//   1) writer/treatment.md            — 트리트먼트 탭 내용(씬 비트·샷·대사, 슬러그→실제 이름)
//   2) writer/rough-storyboard/*.png  — 샷별 러프 스토리보드 패널 원본
//   3) writer/rough-storyboard-board.png — 보드 전체를 한 장으로 합성한 컨택트 시트
//      (뷰어 full-scroll 재현 — DOM 캡처 대신 데이터 기반 캔버스 합성: 탭이 안 열려
//       있어도 동작하고 CORS/폰트 인라이닝 문제가 없다)
// 브라우저 컨텍스트 전용(supabase browser client + canvas).

import { createClient } from '@/lib/supabase/client'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import { h1, h2 } from './md'
import { sanitizeSegment } from './sanitize'
import type { ArtifactFile } from './types'

interface SceneRow {
  scene_id: string
  location: string | null
  time_of_day: string | null
  mood: string | null
  narrative_summary: string | null
  original_text_quote: string | null
  sort_order: number | null
}

interface DialogueLine {
  characterId?: string
  text?: string
}

interface ShotRow {
  shot_id: string
  scene_id: string
  shot_type: string | null
  action_description: string | null
  duration_seconds: number | null
  dialogue_lines: DialogueLine[] | null
  rough_storyboard: { url?: string | null; status?: string | null } | null
  sort_order: number | null
}

interface WriterBoardData {
  scenes: SceneRow[]
  shotsByScene: Map<string, ShotRow[]>
  roster: SlugEntry[]
}

async function loadWriterBoardData(projectId: string): Promise<WriterBoardData> {
  const supabase = createClient()
  const [scenesRes, shotsRes, charsRes, locsRes] = await Promise.all([
    supabase
      .from('scenes')
      .select('scene_id, location, time_of_day, mood, narrative_summary, original_text_quote, sort_order')
      .eq('project_id', projectId)
      .order('sort_order'),
    supabase
      .from('shots')
      .select('shot_id, scene_id, shot_type, action_description, duration_seconds, dialogue_lines, rough_storyboard, sort_order')
      .eq('project_id', projectId)
      .order('sort_order'),
    supabase.from('characters').select('character_id, name').eq('project_id', projectId),
    supabase.from('locations').select('location_id, name').eq('project_id', projectId),
  ])
  if (scenesRes.error) throw new Error(`scenes load: ${scenesRes.error.message}`)
  if (shotsRes.error) throw new Error(`shots load: ${shotsRes.error.message}`)

  const shotsByScene = new Map<string, ShotRow[]>()
  for (const shot of (shotsRes.data ?? []) as ShotRow[]) {
    const arr = shotsByScene.get(shot.scene_id) ?? []
    arr.push(shot)
    shotsByScene.set(shot.scene_id, arr)
  }

  const roster: SlugEntry[] = [
    ...((charsRes.data ?? []) as { character_id: string; name: string }[]).map((c) => ({
      slug: c.character_id,
      name: c.name,
    })),
    ...((locsRes.data ?? []) as { location_id: string; name: string }[]).map((l) => ({
      slug: l.location_id,
      name: l.name,
    })),
  ]

  return { scenes: (scenesRes.data ?? []) as SceneRow[], shotsByScene, roster }
}

function completedRoughUrl(shot: ShotRow): string | null {
  const rough = shot.rough_storyboard
  if (!rough?.url) return null
  if (rough.status && rough.status !== 'completed') return null
  return rough.url
}

// ── 1) treatment.md — 트리트먼트 탭 내용의 md 재현 ──────────────────────────
function renderTreatmentMd(data: WriterBoardData): string {
  const { scenes, shotsByScene, roster } = data
  let body = h1('Treatment')
  if (scenes.length === 0) return body + '씬 없음\n'

  scenes.forEach((scene, sceneIndex) => {
    const place = replaceSlugs(scene.location ?? '?', roster, '')
    const mood = scene.mood?.trim()
    body += h2(`Scene ${sceneIndex + 1} — ${place}${mood ? ` · ${mood}` : ''}`)
    if (scene.time_of_day) body += `- 시간대: ${scene.time_of_day}\n`
    if (scene.narrative_summary) body += `\n${replaceSlugs(scene.narrative_summary, roster)}\n`
    if (scene.original_text_quote) body += `\n> ${replaceSlugs(scene.original_text_quote, roster)}\n`
    body += '\n'

    const shots = shotsByScene.get(scene.scene_id) ?? []
    shots.forEach((shot, shotIndex) => {
      const meta = [shot.shot_type, shot.duration_seconds ? `${shot.duration_seconds}s` : null]
        .filter(Boolean)
        .join(' · ')
      body += `### Shot ${shotIndex + 1}${meta ? ` (${meta})` : ''}\n\n`
      body += `${replaceSlugs(shot.action_description || '(설명 없음)', roster)}\n\n`
      for (const line of shot.dialogue_lines ?? []) {
        if (!line?.text) continue
        const speaker = replaceSlugs(line.characterId ?? '인물', roster, '')
        body += `- ${speaker}: "${replaceSlugs(line.text, roster)}"\n`
      }
      body += '\n'
    })
  })
  return body
}

// ── 3) 보드 컨택트 시트 — 캔버스 합성 ────────────────────────────────────────
const CARD_W = 480
const CARD_H = 270
const LABEL_H = 30
const GAP = 16
const COLS = 3
const PAD = 28
const SCENE_HEADER_H = 52

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** 이미지를 카드 영역에 cover-fit으로 그린다 (비율 유지 + 중앙 크롭). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  const sx = (img.width - sw) / 2
  const sy = (img.height - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

async function renderBoardSheet(data: WriterBoardData): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const { scenes, shotsByScene, roster } = data

  // 씬별 (완료 패널 있는) 샷 수집 — 하나도 없으면 시트 생략.
  const sceneBlocks = scenes
    .map((scene, sceneIndex) => ({
      scene,
      sceneIndex,
      shots: (shotsByScene.get(scene.scene_id) ?? []).map((shot, shotIndex) => ({
        shot,
        shotIndex,
        url: completedRoughUrl(shot),
      })),
    }))
    .filter((block) => block.shots.length > 0)
  const totalShots = sceneBlocks.reduce((n, b) => n + b.shots.length, 0)
  if (totalShots === 0) return null

  // 레이아웃 계산
  const width = PAD * 2 + COLS * CARD_W + (COLS - 1) * GAP
  let height = PAD
  for (const block of sceneBlocks) {
    const rows = Math.ceil(block.shots.length / COLS)
    height += SCENE_HEADER_H + rows * (CARD_H + LABEL_H + GAP)
  }
  height += PAD

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, width, height)

  // 이미지 병렬 로드 (실패는 placeholder)
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    sceneBlocks
      .flatMap((b) => b.shots)
      .filter((s) => s.url)
      .map(async (s) => {
        images.set(s.url as string, await loadImage(s.url as string))
      }),
  )

  let y = PAD
  for (const block of sceneBlocks) {
    const place = replaceSlugs(block.scene.location ?? '', roster, '')
    ctx.fillStyle = '#f5f5f5'
    ctx.font = '600 24px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(
      `Scene ${block.sceneIndex + 1}${place ? ` — ${place}` : ''}`,
      PAD,
      y + 8,
    )
    y += SCENE_HEADER_H

    block.shots.forEach((entry, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const x = PAD + col * (CARD_W + GAP)
      const cy = y + row * (CARD_H + LABEL_H + GAP)

      const img = entry.url ? images.get(entry.url) : null
      if (img) {
        drawCover(ctx, img, x, cy, CARD_W, CARD_H)
      } else {
        ctx.fillStyle = '#27272a'
        ctx.fillRect(x, cy, CARD_W, CARD_H)
        ctx.fillStyle = '#9ca3af'
        ctx.font = '14px system-ui, sans-serif'
        ctx.fillText('이미지 없음', x + CARD_W / 2 - 36, cy + CARD_H / 2 - 8)
      }
      ctx.strokeStyle = '#3f3f46'
      ctx.strokeRect(x + 0.5, cy + 0.5, CARD_W - 1, CARD_H - 1)

      const meta = [entry.shot.shot_type, entry.shot.duration_seconds ? `${entry.shot.duration_seconds}s` : null]
        .filter(Boolean)
        .join(' · ')
      ctx.fillStyle = '#d4d4d8'
      ctx.font = '14px system-ui, sans-serif'
      ctx.fillText(
        `Shot ${entry.shotIndex + 1}${meta ? ` · ${meta}` : ''}`,
        x,
        cy + CARD_H + 8,
      )
    })

    y += Math.ceil(block.shots.length / COLS) * (CARD_H + LABEL_H + GAP)
  }

  return await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      // 이미지 CORS taint 등 — 시트만 생략(개별 패널 png는 zip에 이미 포함)
      resolve(null)
    }
  })
}

// ── 수집기 ───────────────────────────────────────────────────────────────────
export async function collectWriterBoardArtifacts(projectId: string): Promise<ArtifactFile[]> {
  const data = await loadWriterBoardData(projectId)
  const files: ArtifactFile[] = [
    { path: 'writer/treatment.md', kind: 'text', content: renderTreatmentMd(data) },
  ]

  // 샷별 러프 패널 원본 — scene/shot 순번으로 파일명 부여.
  data.scenes.forEach((scene, sceneIndex) => {
    const shots = data.shotsByScene.get(scene.scene_id) ?? []
    shots.forEach((shot, shotIndex) => {
      const url = completedRoughUrl(shot)
      if (!url) return
      const name = `scene-${String(sceneIndex + 1).padStart(2, '0')}_shot-${String(shotIndex + 1).padStart(2, '0')}_${sanitizeSegment(shot.shot_id)}.png`
      files.push({ path: `writer/rough-storyboard/${name}`, kind: 'media', url })
    })
  })

  const sheet = await renderBoardSheet(data)
  if (sheet) {
    files.push({ path: 'writer/rough-storyboard-board.png', kind: 'media', blob: sheet })
  }

  return files
}
