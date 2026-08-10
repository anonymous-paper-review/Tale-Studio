// 러프 DIRECTION 패널 라벨 전수 스캔 — 진짜 '카메라 무빙' 픽스처를 근거로 고르기 위함.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { vlmJson, imgPart, type Part } from './judge.mts'

const PID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const DIRP = 'research/experiments/previz-channel-ablation/run'
const FR = join(DIRP, 'scan')
mkdirSync(FR, { recursive: true })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: shots } = await db.from('shots').select('shot_id,action_description,rough_storyboard,storyboard_image').eq('project_id', PID).order('sort_order')
const usable = shots!.filter((s: any) => s.rough_storyboard?.frames?.direction && s.storyboard_image?.frames?.end)
console.log('usable', usable.length)

for (const s of usable as any[]) {
  const dest = join(FR, `${s.shot_id}.png`)
  if (!existsSync(dest)) {
    const r = await fetch(s.rough_storyboard.frames.direction)
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
  }
}

const batches: any[][] = []
for (let i = 0; i < usable.length; i += 6) batches.push(usable.slice(i, i + 6) as any[])

async function runBatch(batch: any[]) {
  const parts: Part[] = [{ text: [
    'Each ITEM is the DIRECTION panel of a rough pencil previz storyboard: a drawing with hand-written motion annotations (arrows and text labels) drawn on top.',
    'For EACH item: transcribe every visible text label verbatim, describe the arrows (how many, what shape/direction), and classify the annotated motion.',
    'kind must be one of: "camera" (annotation denotes CAMERA movement: push in, dolly, pan, tilt, zoom, track, crane), "subject" (annotation denotes a FIGURE/OBJECT moving), "both", "static" (annotation says the shot holds still), "none" (no annotation visible).',
    `Return JSON only: {${batch.map((b) => `"${b.shot_id}":{"labels":["..."],"arrows":"<=12 words","kind":"camera|subject|both|static|none"}`).join(',')}}`,
  ].join('\n') }]
  for (const b of batch) {
    parts.push({ text: `ITEM ${b.shot_id}:` })
    parts.push(await imgPart(join(FR, `${b.shot_id}.png`)))
  }
  const r = await vlmJson<Record<string, any>>(parts)
  return batch.map((b) => ({ shot_id: b.shot_id, action: b.action_description, ...(r[b.shot_id] ?? { labels: [], arrows: '', kind: '?' }) }))
}

const results = await Promise.all(batches.map(runBatch))
const out: any[] = results.flat()

writeFileSync(join(DIRP, 'label_scan.json'), JSON.stringify(out, null, 2))
const byKind: Record<string, number> = {}
for (const o of out) byKind[o.kind] = (byKind[o.kind] ?? 0) + 1
console.log('kind counts:', JSON.stringify(byKind))
console.log('\n=== camera/both ===')
for (const o of out.filter((x) => x.kind === 'camera' || x.kind === 'both')) console.log(`${o.shot_id} [${o.kind}] labels=${JSON.stringify(o.labels)} arrows="${o.arrows}" :: ${(o.action ?? '').slice(0, 90)}`)
