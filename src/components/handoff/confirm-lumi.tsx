'use client'

// 확인 창의 큰 Lumi(오너 2026-11-03 "큰 3D Lumi: 가이드 자리 모두 · 확인 창") — 단계를 넘기기 전 "~할까요?"를 묻는 창 맨 위에 둔다.
//   옷은 넘기기 전 지금 단계, 모습은 기본(idle). 지우기 확인 · 오류 안내에는 넣지 않는다. 크기는 11/5 SYS "팝업 제목 위" M(78).
//   약속: tests/project/handoff-confirm-lumi.test.ts
import { Lumi } from '@/components/lumi/lumi'
import { STAGE_PERSONA, type LumiPersona } from '@/lib/lumi'
import type { StageId } from '@/types'

/** stage = 넘기기 전 지금 단계(그 옷), persona = 옷을 바로 줄 때(단계 밖 팝업은 'pearl'). 크기는 SYS "팝업 제목 위" M(78).
 *  자리는 DialogHeader 안 맨 위(제목 묶음 사이 15) — Header 앞에 둬도 틀이 그 사이를 15 로 맞춘다(ui/dialog). */
export function ConfirmLumi({ stage, persona }: { stage?: StageId; persona?: LumiPersona }) {
  return (
    <div className="flex justify-center" data-slot="confirm-lumi" data-testid="confirm-lumi">
      <Lumi persona={persona ?? (stage ? STAGE_PERSONA[stage] : 'pearl')} state="idle" size="m" />
    </div>
  )
}
