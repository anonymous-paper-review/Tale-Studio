// 자체 호스팅(내 컴퓨터) 영상 생성 경로와 Kling 직접 호출 잔재가 코드에 남아 있지 않은지 확인한다
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')

// 2026-10-11 오너 결정: 결제 심사용 정책 문서가 밝힌 처리 업체(fal 등) 밖으로 사용자 글·그림이
//   나가는 길을 코드에서 없앤다. 아래 표식이 다시 들어오면 그 길이 되살아난 것이다.
const RETIRED_TOKENS = [
  'TAILSCALE_VIDEO_API_URL',
  'hunyuan',
  '@/lib/kling',
  'KLING_API_BASE',
  'createKlingToken',
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

describe('자체 호스팅 영상 경로 제거', () => {
  // 왜: 운영 환경에 자체 서버 주소 설정이 아직 남아 있어도 코드가 그 주소를 모르면 글이 나갈 수 없다.
  it('영상 생성은 내 컴퓨터 주소로 요청을 보내지 않는다', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const token of RETIRED_TOKENS) {
        if (source.includes(token)) offenders.push(`${path.relative(ROOT, file)}: ${token}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // 왜: 설정에 옛 모델 이름(지운 'local' 등)이 남은 영상 카드가 그 이름 기준으로 Take 수를 보여주면,
  //   서버는 기본 모델로 바꿔 보내므로 표시와 실제 차감이 어긋난다 — 종량제 신뢰가 깨지는 자리다.
  it('표시하는 Take 수는 서버가 실제로 쓰는 모델 기준이다', () => {
    const videoNode = readFileSync(path.join(SRC, 'features/director/canvas-nodes/VideoNode.tsx'), 'utf8')
    expect(videoNode).toContain('takeCostForVideo(effectiveProvider ? normalizeProvider(effectiveProvider) : null)')
  })

  // 왜: Kling 직접 호출 모듈(JWT 토큰 발급 포함)은 아무도 쓰지 않는데 키만 요구하는 잔재였다.
  it('Kling 직접 호출 모듈은 코드에 없다', () => {
    expect(existsSync(path.join(SRC, 'lib/kling.ts'))).toBe(false)
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('jsonwebtoken')
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('@types/jsonwebtoken')
  })
})
