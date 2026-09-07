// 설정을 따로 정하지 않아도 장면의 핵심이 먼저 또렷하게 보이게 한다 (#camera-contract-relax 2026-08-11)
// 카메라 규율 계약의 기본 팔 잠금(#camera-contract-relax 2026-08-11).
//
// 왜 테스트로 잠그나: 이건 문구 한 덩어리가 바뀌는 변경이라 타입도 테스트도 안 걸린다.
//   그런데 기본값이 무엇이냐가 전 프로젝트의 카메라 무빙 분포를 좌우한다(실측: 모션 요구 비트
//   적중 28.4%→53.1%). 조용히 되돌아가면 아무도 모른다 — 그래서 기본값 자체를 관측값으로 박는다.
import { describe, it, expect, afterEach } from 'vitest'
import { buildSystemInstruction } from '@/lib/writer/pipeline/stages/decoupage'

const KEY = 'WRITER_CAMERA_CONTRACT'
const LEGACY_MARK = "camera_intent는 'static'이 기본"
const RELAXED_MARK = '먼저 이 사건을 하나의 고정 프레임 안에서 완결할 수 있는지 판단한다'

afterEach(() => {
  delete process.env[KEY]
})

describe('카메라 기본 동작을 장면에 맞게 정한다', () => {
  it('설정값이 없으면 장면을 고정 화면으로 완성할 수 있는지 먼저 판단한다 (2026-08-11 승격)', () => {
    delete process.env[KEY]
    const s = buildSystemInstruction()
    expect(s).toContain(RELAXED_MARK)
    expect(s).not.toContain(LEGACY_MARK)
  })

  it('옛 카메라 안내를 선택하면 그 안내만 사용한다', () => {
    process.env[KEY] = 'legacy'
    const s = buildSystemInstruction()
    expect(s).toContain(LEGACY_MARK)
    expect(s).not.toContain(RELAXED_MARK)
  })

  it('이전에 쓰던 두 가지 카메라 안내도 선택하면 같은 결과를 보여준다', () => {
    process.env[KEY] = 'relaxed'
    expect(buildSystemInstruction()).toContain('기본값 없이 **이 샷의 내용이 요구하는가**로 정한다')
    process.env[KEY] = 'relaxed-v2'
    expect(buildSystemInstruction()).toContain('camera_intent는 카메라가 실제로 움직여야 하는지로 정한다')
  })

  it('알 수 없는 설정값을 넣어도 기본 카메라 안내로 안전하게 처리한다', () => {
    // 오타·구값(예: 'default')이 조용히 억압 팔로 되돌리는 사고 방지.
    process.env[KEY] = 'default'
    expect(buildSystemInstruction()).toContain(RELAXED_MARK)
  })
})
