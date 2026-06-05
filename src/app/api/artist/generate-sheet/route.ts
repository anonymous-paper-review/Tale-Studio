// 캐릭터 단일 뷰 생성 (crop 폐기 / front 통합, 2026-06-05)
//
// main = 정면 풀바디 대표 포트레이트(T2I, 이전 front 역할 겸함). back/sideLeft/sideRight = main 을
// reference 로 한 image-to-image(openai/gpt-image-2/edit). 한 번에 한 뷰만 생성한다 — 호출자(artist-store)가
// concurrency 를 제어하며 캐릭터/뷰 단위로 병렬 호출한다.
//
// DB 디자인 토큰(characters.appearance/costume + projects.design_tokens)으로 프롬프트 조립.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageGenerate } from '@/lib/writer/llm/fal'
import {
  buildCharacterMainPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
  type DirectionalView,
} from '@/lib/artist/turnaround'
import {
  CHARACTER_VIEW_COLUMNS,
  CHARACTER_VIEW_KEYS,
  type CharacterViewKey,
} from '@/types/asset'

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

    const { projectId, characterId, view } = (await req.json()) as {
      projectId?: string
      characterId?: string
      view?: CharacterViewKey
    }
    if (!projectId || !characterId || !view) {
      return NextResponse.json(
        { error: 'projectId, characterId, view required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })
    }

    // 1. 프로젝트(workspace + 디자인 토큰) + 캐릭터 로드 (view_main = i2i reference)
    const [{ data: project }, { data: character }] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('workspace_id, design_tokens')
        .eq('id', projectId)
        .single(),
      supabaseAdmin
        .from('characters')
        .select('character_id, name, role, appearance, costume, view_main')
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
    const input: CharacterPromptInput = {
      name: character.name,
      appearance: character.appearance ?? character.name,
      role: character.role ?? undefined,
      costumes: character.costume ?? undefined,
      artStyle: dt.l1?.art_style,
      shapeLanguage: dt.l1?.shape_language,
      palette,
    }

    // 2. 프롬프트 + 모델 결정
    //    main → 깨끗한 T2I. 방향 뷰 → view_main 을 reference 로 한 i2i(edit). main 없으면 T2I fallback.
    const refMain = character.view_main as string | null
    let url: string
    if (view === 'main') {
      const out = await falImageGenerate({
        model: 'openai/gpt-image-2',
        prompt: buildCharacterMainPrompt(input),
        aspect_ratio: '1:1',
      })
      url = out.url
    } else {
      const prompt = buildCharacterViewPrompt(input, view as DirectionalView)
      const out = await falImageGenerate(
        refMain
          ? {
              model: 'openai/gpt-image-2/edit',
              prompt,
              reference_image_urls: [refMain],
            } // aspect_ratio 생략 → edit 모델이 reference 비율을 따름
          : { model: 'openai/gpt-image-2', prompt, aspect_ratio: '1:1' },
      )
      url = out.url
    }

    // 3. 생성 이미지 바이트 회수 → storage 업로드 (upload-image 와 동일 경로 규칙)
    const imgRes = await fetch(url)
    if (!imgRes.ok) throw new Error(`fal image fetch failed: ${imgRes.status}`)
    const buf = Buffer.from(await imgRes.arrayBuffer())

    const column = CHARACTER_VIEW_COLUMNS[view]
    const path = `${project.workspace_id}/${projectId}/characters/${characterId}_${column}.png`
    const { error: upErr } = await supabaseAdmin.storage
      .from('media')
      .upload(path, buf, { contentType: 'image/png', upsert: true })
    if (upErr) throw upErr
    const publicUrl = supabaseAdmin.storage.from('media').getPublicUrl(path).data.publicUrl

    // 4. DB 기록 (해당 뷰 컬럼만)
    const { error: updErr } = await supabaseAdmin
      .from('characters')
      .update({ [column]: publicUrl })
      .eq('project_id', projectId)
      .eq('character_id', characterId)
    if (updErr) throw updErr

    return NextResponse.json({ ok: true, view, url: publicUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-sheet]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
