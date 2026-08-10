import { config } from 'dotenv'
config({ path: '.env.local' })
import { fal } from '@fal-ai/client'
import { readFileSync } from 'node:fs'
fal.config({ credentials: process.env.FAL_KEY ?? '' })
const m = JSON.parse(readFileSync('research/experiments/previz-channel-ablation/run/manifest.json','utf8'))
const j = m.jobs.A2.find((x:any)=>x.key==='A2__sh_08_64__start_end__r1')
console.log('key', j.key, 'req', j.request_id, 'endpoint', j.endpoint, 'done', !!j.done)
try {
  const st = await fal.queue.status(j.endpoint, { requestId: j.request_id, logs: true })
  console.log('status:', JSON.stringify(st).slice(0,1200))
} catch(e:any) { console.log('status ERR:', e.message, JSON.stringify(e.body ?? {}).slice(0,600)) }
try {
  const r = await fal.queue.result(j.endpoint, { requestId: j.request_id })
  console.log('result:', JSON.stringify(r.data).slice(0,600))
} catch(e:any) { console.log('result ERR:', e.message, '|', JSON.stringify(e.body ?? e.status ?? {}).slice(0,600)) }
