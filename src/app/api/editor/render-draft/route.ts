import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clipOrder, sceneId, videoClips, audioClips, audioTracks } = await req.json()

    if (!clipOrder) {
      return NextResponse.json(
        { error: 'clipOrder is required' },
        { status: 400 },
      )
    }

    // MVP: Return playlist metadata for client-side sequential playback
    // Real video concatenation (FFmpeg) is post-MVP
    //
    // TODO(07_draft_render.md): Implement FFmpeg filter_complex for each clip:
    //   Video: `[i:v]trim=trimStart:trimEnd,setpts=(PTS-STARTPTS)/speed[vi]`
    //   Audio: `[i:a]atrim=trimStart:trimEnd,asetpts=PTS-STARTPTS,${atempoChain}[ai]`
    //   Where atempoChain decomposes `speed` into 0.5~2.0 atempo filters.
    //   Concat: `[v0][a0][v1][a1]...concat=n=N:v=1:a=1[out][aout]`.
    //   Requires FFmpeg runtime (not available on Vercel serverless) — self-hosted or edge layer.
    // 오디오는 per-clip volume(+trim/speed)을 담아 playlist 로 반환 → 추후 FFmpeg 가
    // `volume=${clip.volume}` 필터로 baking. (요청 1: 음량 draft 반영 — 데이터 레벨 전달)
    return NextResponse.json({
      type: 'playlist',
      sceneId,
      clipOrder,
      videoClips: videoClips ?? [],
      audioClips: audioClips ?? [],
      audioTracks: audioTracks ?? [],
      message:
        'Draft render created as playlist. Real video/audio merge (with volume) coming in post-MVP.',
      renderedAt: new Date().toISOString(),
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[editor/render-draft]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
