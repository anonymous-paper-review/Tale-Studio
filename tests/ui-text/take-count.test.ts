// 영어 화면의 Take 수는 1이면 단수다("1 Take") — 넘기기 창 단추뿐 아니라 화면 전체. 한국어는 그대로다.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DirectorNode } from '@/types/director'
import { remakeButton } from '@/lib/director/editor-handover'
import { translate } from '@/lib/i18n/translate'

const en = (key: string, params?: Record<string, string | number>) => translate('en', key, params)
const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)

// 화면 글 키를 가진 소스 파일 — 사전(messages-*)은 뺀다.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/messages-[a-z]+\.ts$/.test(name) ? [path] : []
  })
}

// 수가 늘 2 이상인 문장 — 영상이 둘 이상이면 Take 도 둘 이상이다(영상 하나에 1 Take 이상).
const ALWAYS_MANY = new Set([
  'Shall I make {count} videos for {shots} ({takes} Takes)? Say yes to start.',
  'Applying also makes the videos for {shots} right away · {takes} Takes.',
  '{images} images · {videos} videos · about {minutes} min · {takes} Takes',
  '{count} videos · about {minutes} min · {takes} Takes',
])

describe('영어 Take 수의 단수', () => {
  // 왜(리드 11/14, entry 보고 전문 읽기에서 찾음): 1 Take 모델(Happy Horse 720p)이면 넘기기 창 단추가 "Make again · 1 Takes"로 보였다 —
  //   같은 꼴의 "{n} Takes" 글이 샷 상세 · Lumi 줄 · Storyboard → Director 넘기기 창 · 결제 화면에도 있다. 수가 1이면 "1 Take" 문장을 고른다.
  it('영어 화면의 Take 수는 1이면 단수다 — "· 1 Take"(넘기기 창 단추뿐 아니라 화면 전체에서)', () => {
    const shot = { id: 'n_s', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 's', writerShotId: 's', durationSeconds: 4, storyboardImage: { status: 'completed', url: 'https://media.test/s.png' } } }
    const take = {
      id: 'v_s_1', type: 'video', position: { x: 0, y: 0 },
      data: { kind: 'video', label: 'take_v1', parentShotNodeId: 'n_s', takeNumber: 1, status: 'failed', videoUrl: null, final: false, lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-13T01:00:00Z', createdAt: '2026-11-13T01:00:00Z', override: { provider: 'happy-horse', resolution: '720p' } },
    }
    const nodes = [shot, take] as unknown as DirectorNode[]
    const opts = { showTakes: true, batch: null } as const
    expect(remakeButton(nodes, { shotNodeId: 'n_s', missing: 'failed' }, opts, en).label).toBe('Make again · 1 Take')
    expect(remakeButton(nodes, { shotNodeId: 'n_s', missing: 'not_made' }, opts, en).label).toBe('Make video · 1 Take')
    expect(remakeButton(nodes, { shotNodeId: 'n_s', missing: 'failed' }, opts, ko).label).toBe('다시 만들기 · 1 Take')
    // 화면 전체: "{n} Takes" 문장마다 같은 파일에 "1 Take" 짝 문장이 있다(수가 늘 2 이상인 문장은 빼고).
    const missing: string[] = []
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/'([^'\n]*\{\w+\} Takes[^'\n]*)'/g)) {
        const many = match[1]
        if (ALWAYS_MANY.has(many)) continue
        const one = many.replace(/\{\w+\} Takes/, '1 Take')
        if (!text.includes(`'${one}'`)) missing.push(`${file}: '${many}'`)
      }
    }
    expect(missing).toEqual([])
  })
})
