// 결제 배포의 환경 경계를 읽기 전용으로 확인한다. 비밀값은 출력하지 않는다.
import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
const root = '/Users/xcape/projects/tale-studio'
const env = parse(readFileSync(`${root}/.env.local`))
const project = JSON.parse(readFileSync(`${root}/.vercel/project.json`))
async function vercel(path) {
  const r = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${project.orgId}`, {
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Vercel ${r.status} ${j.error?.code}`)
  return j
}
const config = await vercel(`/v9/projects/${project.projectId}`)
const all = await vercel(`/v10/projects/${project.projectId}/env`)
const rows = []
for (const target of ['production', 'preview']) {
  for (const item of all.envs.filter(e => e.target.includes(target) && !e.gitBranch && (/PADDLE/.test(e.key) || ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].includes(e.key)))) {
    const response = await vercel(`/v1/projects/${project.projectId}/env/${item.id}`)
    const detail = response.env ?? response
    rows.push({ target, key: item.key, configured: !!detail.value,
      matchesLocal: detail.value === env[item.key],
      value: item.key === 'NEXT_PUBLIC_SUPABASE_URL' && detail.value ? new URL(detail.value).host : ['NEXT_PUBLIC_PADDLE_ENV', 'PADDLE_LIVE_CHECKOUT_ENABLED'].includes(item.key) ? detail.value : undefined,
    })
  }
}
console.log(JSON.stringify({projectId:project.projectId, targets:Object.fromEntries(Object.entries(config.targets).map(([k,v])=>[k,{id:v.id,url:v.url,state:v.readyState,sha:v.meta?.githubCommitSha}])),env:rows},null,2))
const r = await fetch('https://sandbox-api.paddle.com/transactions?per_page=1&order_by=created_at[DESC]', {
  headers:{Authorization:`Bearer ${env.PADDLE_API_KEY}`},signal:AbortSignal.timeout(20_000),
})
const j = await r.json()
console.log(JSON.stringify({sandboxTransactionsStatus:r.status,error:j.error?.code,latest:j.data?.map(t=>({id:t.id,status:t.status,checkoutUrl:t.checkout?.url ? new URL(t.checkout.url).origin + new URL(t.checkout.url).pathname : null}))}))
