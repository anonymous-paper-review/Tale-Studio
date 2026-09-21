// 이 파일이 지키는 약속: 넘겨받은 카드 그림은 이 프로젝트에 올린 것만 받아, 배경 그림은 그대로 와이드샷이 되고 인물 그림은 대표 사진과 시트의 출처가 된다 (#image-to-artist 2026-09-17).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { planSourceImageWrites, stripSourceImages } from '@/lib/producer/source-image'

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co').replace(/\/+$/, '')
const own = (p: string) => `${base}/storage/v1/object/public/media/ws/proj/uploads/${p}`
const read = (rel: string) => readFileSync(rel, 'utf8')

describe('카드 그림 넘김 — 서버', () => {
  // 왜: 이 주소는 나중에 그림 생성 제공자가 직접 가져간다. 우리 보관함 밖 주소를 통과시키면 임의 주소를 대신 가져오게 시키는 통로가 된다.
  it('이 프로젝트에 올린 그림 주소만 받고, 다른 주소는 버린다', () => {
    const plan = planSourceImageWrites({
      cast: [
        { character_id: 'komatsu', source_image_url: own('u1/original.png') },
        { character_id: 'evil', source_image_url: 'https://evil.example.com/x.jpg' },
        { character_id: 'none' },
      ],
      backgrounds: [
        { location_id: 'classroom', source_image_url: own('u2/original.png') },
        { location_id: 'meta', source_image_url: 'http://169.254.169.254/latest/meta-data' },
      ],
    })
    expect(plan.characters).toEqual([{ character_id: 'komatsu', url: own('u1/original.png') }])
    expect(plan.locations).toEqual([{ location_id: 'classroom', url: own('u2/original.png') }])
  })

  // 왜: 배경은 "그대로"다. 와이드샷 칸이 차 있으면 자동 초안 생성은 빈칸만 채우는 규칙대로 그 배경을 건너뛴다.
  it('배경 그림은 그 배경의 와이드샷이 되어 자동 생성을 건너뛴다', () => {
    const route = read('src/app/api/writer/start/route.ts')
    expect(route).toMatch(/planSourceImageWrites\(/)
    expect(route).toMatch(/from\('locations'\)[\s\S]*?\.update\(\{[^}]*wide_shot: [^}]*\}\)/)
    // 자동 초안은 wide_shot 이 비어 있는 행만 고른다(기존 규칙 — 그림이 들어가면 자연히 건너뛴다).
    const trigger = read('src/lib/artist/draft-trigger.ts')
    expect(trigger).toMatch(/\.is\('wide_shot', null\)/)
  })

  // 왜: 원본은 대표 사진(카드 칩)으로 남고, 시트는 이 출처를 참조해 만들어진다. 어디서 왔는지가 남아야 다시 만들 때도 같은 사람이다.
  it('인물 그림은 그 인물 기본 모습의 대표 사진이 되고 시트의 출처로 남는다', () => {
    const route = read('src/app/api/writer/start/route.ts')
    expect(route).toMatch(/from\('character_appearances'\)[\s\S]*?\.update\(\{[^}]*portrait_url: [^}]*derived_from_url: [^}]*\}\)[\s\S]*?\.eq\('is_default', true\)/)
  })

  // 왜: 그림 주소는 글이 아니다. Writer 의 캐스트 시드에 실리면 프롬프트에 URL 이 섞여 들어간다.
  it('그림 주소는 Writer 의 글 프롬프트에 실리지 않는다', () => {
    const cast = {
      characters: [
        { character_id: 'komatsu', name: '코마츠', entity_type: 'person', appearance: '여고생', source_image_url: own('u1/original.png') },
      ],
    }
    const stripped = stripSourceImages(cast)
    expect(stripped.characters[0]).toEqual({ character_id: 'komatsu', name: '코마츠', entity_type: 'person', appearance: '여고생' })
    expect(JSON.stringify(stripped)).not.toContain('source_image_url')
    const route = read('src/app/api/writer/start/route.ts')
    expect(route).toMatch(/stripSourceImages\(/)
  })
})
