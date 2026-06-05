// 캐릭터 턴어라운드 시트 생성 — decisions #37 / writer-background-artist-progress §5
//
// DB 디자인 토큰(characters.appearance/costume + projects.design_tokens)으로 A-style 프롬프트를
// 조립 → fal openai/gpt-image-2 로 1×4 가로 스트립 1장 생성 → sharp 로 4등분 crop →
// main + 4뷰(front/side-left/side-right/back)를 storage 업로드 + characters.view_* 기록.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageGenerate } from '@/lib/writer/llm/fal'
import {
  buildTurnaroundSheetPrompt,
  cropTurnaroundStrip,
} from '@/lib/artist/turnaround'

export const runtime = 'nodejs'
export const maxDuration = 300

// projects.design_tokens JSONB shape (008_svc_design_tokens.sql 주석 기준, 부분)
interface DesignTokens {
  l1?: { art_style?: string; shape_language?: string }
  palette?: { primary?: string; secondary?: string; accent?: string }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, characterId } = (await req.json()) as {
      projectId?: string
      characterId?: string
    }
    if (!projectId || !characterId) {
      return NextResponse.json(
        { error: 'projectId, characterId required' },
        { status: 400 },
      )
    }

    // 1. 프로젝트(workspace + 디자인 토큰) + 캐릭터 로드
    const [{ data: project }, { data: character }] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('workspace_id, design_tokens')
        .eq('id', projectId)
        .single(),
      supabaseAdmin
        .from('characters')
        .select('character_id, name, role, appearance, costume')
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .single(),
    ])
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    if (!character) return NextResponse.json({ error: 'character not found' }, { status: 404 })

    const dt = (project.design_tokens ?? {}) as DesignTokens
    const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
      (x): x is string => !!x,
    )

    // 2. A-style 프롬프트 조립 (source-agnostic 빌더에 DB 토큰 주입)
    const prompt = buildTurnaroundSheetPrompt({
      name: character.name,
      appearance: character.appearance ?? character.name,
      role: character.role ?? undefined,
      costumes: character.costume ?? undefined,
      artStyle: dt.l1?.art_style,
      shapeLanguage: dt.l1?.shape_language,
      palette,
    })

    // 3. fal 생성 — 1×4 가로 스트립 (openai/gpt-image-2, 가로 비율)
    const { url } = await falImageGenerate({
      model: 'openai/gpt-image-2',
      prompt,
      aspect_ratio: '16:9',
    })

    // 4. 생성 이미지 바이트 회수 → 4등분 crop
    const imgRes = await fetch(url)
    if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
    const strip = Buffer.from(await imgRes.arrayBuffer())
    const crops = await cropTurnaroundStrip(strip)

    // 5. main(전체 시트) + 4 crop 을 storage 업로드 (upload-image 와 동일 경로 규칙)
    const buffers: Record<string, Buffer> = {
      view_main: strip,
      view_front: crops.front,
      view_side_left: crops.sideLeft,
      view_side_right: crops.sideRight,
      view_back: crops.back,
    }
    const urls: Record<string, string> = {}
    for (const [field, buf] of Object.entries(buffers)) {
      const path = `${project.workspace_id}/${projectId}/characters/${characterId}_${field}.png`
      const { error: upErr } = await supabaseAdmin.storage
        .from('media')
        .upload(path, buf, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      urls[field] = supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl
    }

    // 6. DB 기록
    const { error: updErr } = await supabaseAdmin
      .from('characters')
      .update({
        view_main: urls.view_main,
        view_front: urls.view_front,
        view_side_left: urls.view_side_left,
        view_side_right: urls.view_side_right,
        view_back: urls.view_back,
      })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (updErr) throw updErr

    return NextResponse.json({ ok: true, views: urls })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-sheet]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
