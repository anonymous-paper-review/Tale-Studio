'use client'

// 확인 창의 큰 Lumi(오너 2026-11-03 "큰 3D Lumi: 가이드 자리 모두 · 확인 창") — 단계를 넘기기 전 "~할까요?"를 묻는 창 맨 위에 둔다.
//   옷은 넘기기 전 지금 단계, 모습은 기본(idle). 지우기 확인 · 오류 안내에는 넣지 않는다. 크기는 가이드 확인 창 권장(160~200) 안.
//   약속: tests/project/handoff-confirm-lumi.test.ts
import { Lumi } from '@/components/lumi/lumi'
import { STAGE_PERSONA } from '@/lib/lumi'
import type { StageId } from '@/types'

const CONFIRM_LUMI_SIZE = 180

export function ConfirmLumi({ stage }: { stage: StageId }) {
  return (
    <div className="flex justify-center" data-testid="confirm-lumi">
      <Lumi persona={STAGE_PERSONA[stage]} state="idle" size={CONFIRM_LUMI_SIZE} />
    </div>
  )
}
