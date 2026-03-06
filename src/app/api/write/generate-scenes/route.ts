import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import type { SceneManifest } from '@/types'
import { supabaseAdmin } from '@/lib/supabase/admin'

function getApiKey(): string {
  const keys = process.env.GOOGLE_API_KEYS ?? ''
  const first = keys.split(',')[0]?.split(':')[0]?.trim()
  if (!first) throw new Error('GOOGLE_API_KEYS is not configured')
  return first
}

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

const SCENE_ARCHITECT_SYSTEM = `You are a scene architect. Split the story into exactly 4 scenes following the Ki-Seung-Jeon-Gyeol (기승전결) structure.

Output a JSON object matching this exact schema:
{
  "scenes": [
    {
      "sceneId": "sc_01",
      "act": "intro",
      "narrativeSummary": "One sentence summary",
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
- Exactly 4 scenes with acts: "intro", "dev", "turn", "conclusion"
- Scene IDs: sc_01 through sc_04
- Character IDs: char_{lowercase_name}
- Location IDs: loc_01 through loc_N
- Role must be "protagonist", "antagonist", or "supporting"
- Each scene ~30 seconds (total ~2 min video)
- fixedPrompt: physical appearance only, no actions or emotions
- Extract ALL characters mentioned, even briefly
- Output valid JSON only, no markdown fences`

export async function POST(req: Request) {
  try {
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

    const ai = new GoogleGenAI({ apiKey: getApiKey() })

    // Step 1: Pumpup — expand story with visual details
    const pumpupResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: storyText,
      config: {
        systemInstruction: PUMPUP_SYSTEM,
        temperature: 0.7,
      },
    })

    const expandedStory =
      pumpupResponse.candidates?.[0]?.content?.parts?.[0]?.text
    if (!expandedStory) {
      return NextResponse.json(
        { error: 'Pumpup failed: no expanded story generated' },
        { status: 500 },
      )
    }

    // Step 2: Scene Architect — split into 4 scenes
    const sceneResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: expandedStory,
      config: {
        systemInstruction: SCENE_ARCHITECT_SYSTEM,
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    })

    const sceneJson = sceneResponse.candidates?.[0]?.content?.parts?.[0]?.text
    if (!sceneJson) {
      return NextResponse.json(
        { error: 'Scene Architect failed: no scene manifest generated' },
        { status: 500 },
      )
    }

    const manifest: SceneManifest = JSON.parse(sceneJson)

    // Basic validation
    if (!manifest.scenes?.length || !manifest.characters?.length) {
      return NextResponse.json(
        { error: 'Invalid manifest: missing scenes or characters' },
        { status: 500 },
      )
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

      // Clear old data (re-generation replaces all)
      await Promise.all([
        supabaseAdmin.from('scenes').delete().eq('project_id', projectId),
        supabaseAdmin.from('characters').delete().eq('project_id', projectId),
        supabaseAdmin.from('locations').delete().eq('project_id', projectId),
      ])

      // Insert scenes
      await supabaseAdmin.from('scenes').insert(
        manifest.scenes.map((s, i) => ({
          project_id: projectId,
          scene_id: s.sceneId,
          act: s.act,
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

      // Insert characters
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

      // Insert locations
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
    }

    return NextResponse.json({
      manifest,
      expandedStory,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[write/generate-scenes]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
