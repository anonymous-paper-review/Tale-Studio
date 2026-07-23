// higgsfield 레인 어댑터. `higgsfield generate create ... --json --wait` 를 shell-out 한다.
// 사전조건: `higgsfield auth login` + `higgsfield workspace set <id>` (디스패처가 起動 시 점검).
// 로컬 이미지 경로는 CLI가 자동 업로드하므로 그대로 넘긴다 (URL은 미지원 → 로컬 경로만).
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MODELS } from '../models.mjs'

const pexec = promisify(execFile)

function localPath(imageRef, assetsDir) {
  // higgsfield 미디어 플래그는 로컬 경로 또는 upload-id만 받는다 (URL 불가).
  if (/^https?:\/\//.test(imageRef)) throw new Error('higgsfield: 이미지 입력은 로컬 경로만 가능 (URL 불가)')
  return path.isAbsolute(imageRef) ? imageRef : path.join(assetsDir, imageRef)
}

// 응답 JSON 어디서든 첫 미디어 URL을 찾는 방어적 폴백 (result_url이 없을 때만).
function deepFindUrl(node) {
  if (typeof node === 'string') {
    return /^https?:\/\/.+\.(png|jpg|jpeg|webp|mp4|mov|webm)(\?|$)/i.test(node) ? node : null
  }
  if (Array.isArray(node)) {
    for (const v of node) { const u = deepFindUrl(v); if (u) return u }
  } else if (node && typeof node === 'object') {
    if (typeof node.result_url === 'string') return node.result_url
    for (const v of Object.values(node)) { const u = deepFindUrl(v); if (u) return u }
  }
  return null
}

export async function run(job, { assetsDir, waitTimeout = '20m', waitInterval = '5s' }) {
  const spec = MODELS.higgsfield[job.task]
  if (!spec) throw new Error(`higgsfield: task '${job.task}' 미지원`)
  const args = [
    'generate', 'create', spec.jobType,
    '--prompt', job.prompt,
    '--json', '--wait', '--wait-timeout', waitTimeout, '--wait-interval', waitInterval,
  ]
  if (job.aspect) args.push('--aspect_ratio', job.aspect)
  if (spec.resolution) args.push('--resolution', spec.resolution)
  if (job.task === 'i2v') {
    args.push('--start-image', localPath(job.image, assetsDir))
    args.push('--duration', String(job.seconds ?? 5))
  } else if (job.task === 'edit') {
    args.push('--image', localPath(job.image, assetsDir))
  }

  let stdout
  try {
    ;({ stdout } = await pexec('higgsfield', args, { maxBuffer: 128 * 1024 * 1024 }))
  } catch (e) {
    // CLI 비정상 종료 시 stderr/stdout 앞부분을 실패 메시지에 실어 원인 노출
    const detail = (e.stderr || e.stdout || e.message || '').toString().slice(0, 200)
    throw new Error(`higgsfield CLI 실패: ${detail}`)
  }
  let parsed
  try { parsed = JSON.parse(stdout) } catch { throw new Error('higgsfield: JSON 파싱 실패 — raw=' + stdout.slice(0, 200)) }
  const jobObj = Array.isArray(parsed) ? parsed[0] : parsed
  const url = (jobObj && typeof jobObj.result_url === 'string') ? jobObj.result_url : deepFindUrl(parsed)
  if (!url) throw new Error('higgsfield: result_url 없음 — raw=' + stdout.slice(0, 200))
  return { url, model: spec.jobType, meta: { jobId: jobObj?.id } }
}
