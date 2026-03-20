import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { queryTechniques, loadCameraPresets } from '@/lib/knowledge'
import { SHOTS_PER_SCENE, PROMPT_MAX_LENGTH } from '@/lib/constants'
import { claudeJSON } from '@/lib/claude'

const L2_SYSTEM = `You are a Shot Composer for an AI video production pipeline.

Given a scene, generate exactly ${SHOTS_PER_SCENE} shots.

For each shot, output a JSON array:
[
  {
    "shotType": "WS" | "CU" | "MS" | "EWS" | "OTS" | "POV" | "MCU" | "FS" | "MFS" | "ECU" | "TRACK" | "2S",
    "actionDescription": "Brief visual description of what happens",
    "characters": ["character_id"],
    "durationSeconds": 5-10,
    "generationMethod": "T2V" or "I2V",
    "dialogueLines": [{"characterId": "...", "text": "...", "emotion": "neutral", "delivery": "calm", "durationHint": 3}]
  }
]

Rules:
- I2V for shots with specific characters (needs reference image)
- T2V for establishing shots, backgrounds, abstract mood shots
- Each shot 5-10 seconds
- dialogueLines can be empty array if no dialogue
- Output ONLY the JSON array, no markdown fences or explanation`

function buildFinalPrompt(
  actionDescription: string,
  techniques: { prompt_fragment: string }[],
): string {
  const techFragments = techniques
    .slice(0, 2)
    .map((t) => t.prompt_fragment)
    .join(', ')

  const raw = techFragments
    ? `${actionDescription}. ${techFragments}. Cinematic.`
    : `${actionDescription}. Cinematic.`

  return raw.length > PROMPT_MAX_LENGTH
    ? raw.slice(0, PROMPT_MAX_LENGTH - 3) + '...'
    : raw
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { scene } = await req.json()

    if (!scene || !scene.narrativeSummary) {
      return NextResponse.json(
        { error: 'scene with narrativeSummary is required' },
        { status: 400 },
      )
    }

    const sceneContext = JSON.stringify({
      sceneId: scene.sceneId,
      act: scene.act,
      narrative: scene.narrativeSummary,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      mood: scene.mood,
      characters: scene.characters,
    })

    type RawShot = {
      shotType: string
      actionDescription: string
      characters: string[]
      durationSeconds: number
      generationMethod: string
      dialogueLines: Array<{
        characterId: string
        text: string
        emotion: string
        delivery: string
        durationHint: number
      }>
    }

    const rawShots = await claudeJSON<RawShot[]>(
      L2_SYSTEM,
      `Generate shots for this scene:\n${sceneContext}`,
      0.6,
    )

    // L3: Enrich with Knowledge DB + build prompts
    const presets = loadCameraPresets()
    const defaultPreset = presets.find((p) => p.id === 'static_locked') ?? presets[0]

    const shots = rawShots.map((raw, i) => {
      const moods = scene.mood ? [scene.mood.toLowerCase()] : []
      const matchedTechniques = queryTechniques(moods, raw.shotType)
      const finalPrompt = buildFinalPrompt(raw.actionDescription, matchedTechniques)

      const techPreset = matchedTechniques.length > 0
        ? presets.find((p) => p.id === matchedTechniques[0].id) ?? defaultPreset
        : defaultPreset

      return {
        shotId: `${scene.sceneId}_sh_${String(i + 1).padStart(2, '0')}`,
        sceneId: scene.sceneId,
        shotType: raw.shotType,
        actionDescription: raw.actionDescription,
        characters: raw.characters ?? [],
        durationSeconds: raw.durationSeconds ?? 8,
        generationMethod: raw.generationMethod ?? 'T2V',
        dialogueLines: raw.dialogueLines ?? [],
        camera: {
          horizontal: techPreset.horizontal,
          vertical: techPreset.vertical,
          pan: techPreset.pan,
          tilt: techPreset.tilt,
          roll: techPreset.roll,
          zoom: techPreset.zoom,
        },
        lighting: {
          position: 'front' as const,
          brightness: 70,
          colorTemp: 5500,
        },
        prompt: finalPrompt,
        techniques: matchedTechniques.slice(0, 3).map((t) => t.id),
      }
    })

    return NextResponse.json({ shots })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[director/generate-shots]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
