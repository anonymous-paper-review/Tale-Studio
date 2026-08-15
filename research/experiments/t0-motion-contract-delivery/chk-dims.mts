import { config } from 'dotenv'
config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const PID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
async function dim(url: string) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
    const b = Buffer.from(await r.arrayBuffer())
    if (b.slice(0,8).toString('hex') === '89504e470d0a1a0a') return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
    if (b[0]===0xff&&b[1]===0xd8) { let o=2; while(o<b.length-9){ if(b[o]!==0xff){o++;continue}; const m=b[o+1]; const len=b.readUInt16BE(o+2); if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc) return `${b.readUInt16BE(o+7)}x${b.readUInt16BE(o+5)}`; o+=2+len } }
    if (b.slice(8,12).toString()==='WEBP') return 'webp'
  } catch (e) { return 'fetch실패' }
  return '미해석'
}
const { data: proj } = await supabaseAdmin.from('projects').select('id,title,style_anchor_key').eq('id', PID).maybeSingle()
console.log('프로젝트:', proj?.title, '| 스타일앵커:', proj?.style_anchor_key)
const { data: chars } = await supabaseAdmin.from('characters').select('character_id,name,role,view_main,portrait,appearance,costume').eq('project_id', PID)
for (const c of chars ?? []) {
  console.log(`\n[${c.character_id}] ${c.name} (${c.role})`)
  console.log('  턴어라운드 시트:', c.view_main ? await dim(c.view_main) : '(없음)', c.view_main ? '' : '')
  console.log('  포트레이트   :', c.portrait ? await dim(c.portrait) : '(없음)')
  console.log('  외형:', (c.appearance ?? '').slice(0,120))
  console.log('  의상:', JSON.stringify(c.costume))
  if (c.view_main) console.log('  URL:', c.view_main)
}
const { data: locs } = await supabaseAdmin.from('locations').select('location_id,name,wide_shot,visual_description').eq('project_id', PID)
for (const l of locs ?? []) {
  console.log(`\n[장소 ${l.location_id}] ${l.name}:`, l.wide_shot ? await dim(l.wide_shot) : '(없음)')
  console.log('  서술:', (l.visual_description ?? '').slice(0,150))
  if (l.wide_shot) console.log('  URL:', l.wide_shot)
}
