// 보드 [+ 씬 추가]에서 장소를 Artist 배경 목록에서 고르고(또는 "새 장소"를 적고), 고른 배경 id 로 씬을 만드는지 · 목록에 없는 새 장소면 배경 그림 없이 그린다고 알리는지 검사한다 (오너 2026-11-26 W6, 리드 승인 ⑥ · ⑦)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NEW_PLACE, isKnownPlace, scenePlaceOf } from '@/lib/writer/scene-place'
import { translate } from '@/lib/i18n/translate'

const locations = [
  { locationId: 'convenience_store', name: '마감 직전의 편의점 카운터' },
  { locationId: 'photo_studio', name: '불 꺼진 낡은 사진관 앞' },
]
const read = (path: string) => readFileSync(path, 'utf8')

describe('[+ 씬 추가]의 장소', () => {
  // 왜(리드 승인 ⑥): 장소를 글로만 받으면 Artist 배경과 이어지지 않아 그 씬의 실사가 배경 그림 없이 그려졌다(W6 과 같은 뿌리).
  it('장소는 Artist 배경 목록에서 고르고, 고른 배경 id 로 씬을 만든다', () => {
    expect(scenePlaceOf('photo_studio', '')).toBe('photo_studio')
    expect(isKnownPlace('photo_studio', locations)).toBe(true)
    const dialog = read('src/features/writer/add-item-dialog.tsx')
    expect(dialog).toMatch(/const location = scenePlaceOf\(placeChoice, locationText, sceneLocations\)/)
    expect(dialog).toMatch(/data-testid="add-scene-place"/)
  })

  // 왜(리드 승인 ⑥ · ⑦): 목록에 없는 곳도 씬이 될 수 있다 — "새 장소"면 이름을 적는 칸을 보이고, 배경 카드는 만들지 않고 배경 그림 없이 그린다고 알리기만 한다.
  it('"새 장소"를 고르면 장소 이름을 적는 칸이 나오고, 목록에 없는 장소면 배경 그림 없이 그린다고 알린다', () => {
    expect(scenePlaceOf(NEW_PLACE, '  비 오는 버스 정류장 ')).toBe('비 오는 버스 정류장')
    expect(isKnownPlace('비 오는 버스 정류장', locations)).toBe(false)
    // 배경 이름을 그대로 적었으면 아는 장소다(대소문자 · 띄어쓰기 상관없이) — 그 배경 id 로 잇고 알리지 않는다.
    expect(isKnownPlace('  불 꺼진 낡은  사진관 앞 ', locations)).toBe(true)
    expect(scenePlaceOf(NEW_PLACE, '불 꺼진 낡은 사진관 앞', locations)).toBe('photo_studio')
    const dialog = read('src/features/writer/add-item-dialog.tsx')
    expect(dialog).toMatch(/placeChoice === NEW_PLACE \? \(/)
    expect(dialog).toMatch(/sceneLocations\.length > 0 && location && !isKnownPlace\(location, sceneLocations\)[\s\S]{0,240}t\('Not in the Artist backgrounds: \{places\}\. Scenes set there are drawn without a background image\.', \{ places: location \}\)/)
    expect(translate('ko', 'New place')).toBe('새 장소')
  })

  // 왜: 정상 경로 고정 — Artist 배경이 아직 없는 프로젝트(산문만 있는 예전 흐름 등)는 지금처럼 장소를 글로 적는다.
  it('Artist 배경 목록이 없으면 지금처럼 장소를 글로 적는다', () => {
    expect(scenePlaceOf('', '비 오는 버스 정류장')).toBe('비 오는 버스 정류장')
    expect(isKnownPlace('비 오는 버스 정류장', [])).toBe(false)
    const dialog = read('src/features/writer/add-item-dialog.tsx')
    expect(dialog).toMatch(/sceneLocations\.length > 0 \?/)
  })
})
