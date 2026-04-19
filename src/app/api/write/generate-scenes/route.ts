import { NextResponse } from 'next/server'
import type { SceneManifest, Shot } from '@/types'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { llmChat, llmJSON } from '@/lib/llm'

const PUMPUP_SYSTEM = `You are a visual story expander. Your job is to take a short story and add visual details that help cinematographers and video AI systems create stunning imagery.

ADD these details:
- Time of day, lighting direction, light quality
- Specific locations with physical details (textures, scale, materials)
- Physical actions with speed, direction, body parts
- Environmental details (weather, atmosphere, ambient elements)

DO NOT:
- Add new characters or change the plot
- Add internal emotions or abstract concepts that can't be filmed
- Change dialogue (preserve exact quotes)
- Alter the narrative sequence

PRESERVE exactly:
- All proper nouns
- All dialogue (verbatim)
- Cause-and-effect relationships
- Story sequence

Output: The expanded story text only (1000-2500 characters). No explanations.`

const SCENE_ARCHITECT_SYSTEM = `You are a scene architect. Split the story into exactly 4 scenes that cover the full narrative arc.

Output a JSON object matching this exact schema:
{
  "scenes": [
    {
      "sceneId": "sc_01",
      "narrativeSummary": "One sentence plot summary (what happens, not how it looks)",
      "originalTextQuote": "Direct quote from the story",
      "location": "loc_01",
      "timeOfDay": "night",
      "mood": "tense, mysterious",
      "charactersPresent": ["char_01"],
      "estimatedDurationSeconds": 30
    }
  ],
  "characters": [
    {
      "characterId": "char_01",
      "name": "Name",
      "role": "protagonist",
      "description": "Visual appearance description",
      "fixedPrompt": "Concise visual prompt for consistent image generation (clothing, features, distinguishing marks)",
      "referenceImages": []
    }
  ],
  "locations": [
    {
      "locationId": "loc_01",
      "name": "Location Name",
      "visualDescription": "Detailed visual description for image generation",
      "timeOfDay": "night",
      "lightingDirection": "top-front, neon sides"
    }
  ]
}

Rules:
- Exactly 4 scenes covering the full story
- Scene IDs: sc_01 through sc_04
- Character IDs: char_{lowercase_name}
- Location IDs: loc_01 through loc_N
- Role must be "protagonist", "antagonist", or "supporting"
- Each scene ~30 seconds (total ~2 min video)
- narrativeSummary MUST be a plot summary only — what happens. NO visual descriptions (no "neon alleyway flickers red", no "camera pans across"). Write it like a one-line outline: "protagonist discovers the clue and chases the broker".
- fixedPrompt: physical appearance only, no actions or emotions
- Extract ALL characters mentioned, even briefly
- Output valid JSON only, no markdown fences`

const SHOT_COMPOSER_SYSTEM = `You are a shot composer. Given a scene manifest and expanded story, generate 4-6 shots per scene.

Focus on NARRATIVE data only — no camera or lighting settings (those are added later by the Director).

Output a JSON array of shots matching this exact schema:
[
  {
    "shotId": "sh_01_01",
    "sceneId": "sc_01",
    "shotType": "WS",
    "actionDescription": "Describe what happens visually in this shot",
    "characters": ["char_01"],
    "durationSeconds": 5,
    "generationMethod": "T2V",
    "dialogueLines": [
      {
        "characterId": "char_01",
        "text": "Exact dialogue text",
        "emotion": "determined",
        "delivery": "whispered",
        "durationHint": 2
      }
    ]
  }
]

Rules:
- Shot IDs: sh_{sceneNumber}_{shotNumber} (e.g., sh_01_01, sh_01_02)
- 4-6 shots per scene
- shotType must be one of: ECU, CU, MCU, MS, MFS, FS, WS, EWS, OTS, POV, TRACK, 2S
- generationMethod: "T2V" (text-to-video) or "I2V" (image-to-video)
- Use "I2V" when a specific character face or background is crucial
- dialogueLines: include ONLY lines from the original story. Empty array if no dialogue in that shot
- durationSeconds: 3-8 seconds per shot
- Vary shot types for visual interest (wide establishing → medium → close-up for emotion)
- characters: list character IDs present in this shot
- Output valid JSON array only, no markdown fences`

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storyText, projectId } = await req.json()

    if (!storyText || typeof storyText !== 'string') {
      return NextResponse.json(
        { error: 'storyText is required' },
        { status: 400 },
      )
    }

    if (storyText.length < 20) {
      return NextResponse.json(
        { error: 'Story is too short (min 20 characters)' },
        { status: 400 },
      )
    }

    // Step 1: Pumpup — expand story with visual details
    const expandedStory = await llmChat(PUMPUP_SYSTEM, [], storyText, 0.7)

    if (!expandedStory) {
      return NextResponse.json(
        { error: 'Pumpup failed: no expanded story generated' },
        { status: 500 },
      )
    }

    // Step 2: Scene Architect — split into 4 scenes
    const manifest = await llmJSON<SceneManifest>(
      SCENE_ARCHITECT_SYSTEM,
      expandedStory,
      0.3,
    )

    if (!manifest.scenes?.length || !manifest.characters?.length) {
      return NextResponse.json(
        { error: 'Invalid manifest: missing scenes or characters' },
        { status: 500 },
      )
    }

    // Step 3: L2 Lite Shot Composer — generate shots per scene
    const shotInput = JSON.stringify({
      expandedStory,
      scenes: manifest.scenes,
      characters: manifest.characters,
    })

    let shots: Shot[] = []
    try {
      const rawShots = await llmJSON<Record<string, unknown>[]>(
        SHOT_COMPOSER_SYSTEM,
        shotInput,
        0.4,
      )

      const arr = Array.isArray(rawShots)
        ? rawShots
        : (rawShots as { shots?: unknown[] }).shots ?? []

      shots = arr.map((s) => {
        const r = s as Record<string, unknown>
        return {
          shotId: r.shotId as string,
          sceneId: r.sceneId as string,
          shotType: r.shotType as Shot['shotType'],
          actionDescription: (r.actionDescription as string) ?? '',
          characters: (r.characters as string[]) ?? [],
          durationSeconds: (r.durationSeconds as number) ?? 5,
          generationMethod: (r.generationMethod as Shot['generationMethod']) ?? 'T2V',
          dialogueLines: (r.dialogueLines as Shot['dialogueLines']) ?? [],
          camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
          lighting: { position: 'front' as const, brightness: 50, colorTemp: 5000 },
        }
      })
    } catch {
      // Shots are optional — continue without them
    }

    // Persist to Supabase if projectId provided
    if (projectId) {
      await supabaseAdmin
        .from('projects')
        .update({
          story_text: storyText,
          expanded_story: expandedStory,
          current_stage: 'writer',
        })
        .eq('id', projectId)

      await Promise.all([
        supabaseAdmin.from('scenes').delete().eq('project_id', projectId),
        supabaseAdmin.from('characters').delete().eq('project_id', projectId),
        supabaseAdmin.from('locations').delete().eq('project_id', projectId),
        supabaseAdmin.from('shots').delete().eq('project_id', projectId),
      ])

      await supabaseAdmin.from('scenes').insert(
        manifest.scenes.map((s, i) => ({
          project_id: projectId,
          scene_id: s.sceneId,
          narrative_summary: s.narrativeSummary,
          original_text_quote: s.originalTextQuote,
          location: s.location,
          time_of_day: s.timeOfDay,
          mood: s.mood,
          characters_present: s.charactersPresent,
          estimated_duration_seconds: s.estimatedDurationSeconds,
          sort_order: i,
        })),
      )

      await supabaseAdmin.from('characters').insert(
        manifest.characters.map((c) => ({
          project_id: projectId,
          character_id: c.characterId,
          name: c.name,
          role: c.role,
          description: c.description,
          fixed_prompt: c.fixedPrompt,
        })),
      )

      if (manifest.locations?.length) {
        await supabaseAdmin.from('locations').insert(
          manifest.locations.map((l) => ({
            project_id: projectId,
            location_id: l.locationId,
            name: l.name,
            visual_description: l.visualDescription,
            time_of_day: l.timeOfDay,
            lighting_direction: l.lightingDirection,
          })),
        )
      }

      if (shots.length) {
        await supabaseAdmin.from('shots').insert(
          shots.map((s, i) => ({
            project_id: projectId,
            scene_id: s.sceneId,
            shot_id: s.shotId,
            shot_type: s.shotType,
            action_description: s.actionDescription,
            characters: s.characters,
            duration_seconds: s.durationSeconds,
            generation_method: s.generationMethod,
            dialogue_lines: s.dialogueLines,
            camera_config: s.camera,
            lighting_config: s.lighting,
            sort_order: i,
          })),
        )
      }
    }

    return NextResponse.json({
      manifest,
      expandedStory,
      shots,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[write/generate-scenes]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
