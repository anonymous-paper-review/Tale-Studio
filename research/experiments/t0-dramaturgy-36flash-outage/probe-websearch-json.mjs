// 3.6-flash 빈 응답 원인 분리 프로브 — REST 직행(v1beta), 4조합 × 2모델
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('/Users/xcape/projects/tale-studio/.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const KEY = env.TALE_GEMINI_API_KEY || env.GEMINI_API_KEY
const PROMPT = '법정 드라마에 필요한 무대 3개를 조사해서 JSON 배열로만 답하라: [{"id":"...","name":"..."}]'

const arms = {
  'tools+json': { generationConfig:{responseMimeType:'application/json'}, tools:[{googleSearch:{}}] },
  'json-only':  { generationConfig:{responseMimeType:'application/json'} },
  'tools-only': { tools:[{googleSearch:{}}] },
  'plain':      {},
}
for (const model of ['gemini-3.6-flash','gemini-3-flash-preview']) {
  for (const [tag, extra] of Object.entries(arms)) {
    const body = { contents:[{parts:[{text:PROMPT}]}], ...extra }
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
        method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      })
      const j = await res.json()
      const cand = j.candidates?.[0]
      const text = cand?.content?.parts?.map(p=>p.text??'').join('') ?? ''
      console.log(`${model} | ${tag}: HTTP ${res.status} | candidates=${j.candidates?.length??0} | finish=${cand?.finishReason} | textLen=${text.length} | promptFeedback=${JSON.stringify(j.promptFeedback??null)} | err=${j.error? (j.error.status+' '+String(j.error.message).slice(0,140)) : '-'}`)
    } catch(e) { console.log(`${model} | ${tag}: EXC ${e.message}`) }
  }
}
