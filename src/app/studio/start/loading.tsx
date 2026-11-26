// /studio/start(Producer 시작 화면)를 여는 동안 — 레일을 누른 순간 화면 코드가 오기 전에도 Producer 기다리는 카드를 보인다(오너 2026-11-26 m1126 G1).
//   시작 화면은 위 막대를 스스로 그린다(studio/layout 이 이 경로에선 막대를 빼므로) — 기다리는 동안에도 같은 막대를 둬 화면이 붙을 때 카드가 내려앉지 않게.
import { StageWaitCard } from '@/components/feedback/stage-wait'
import { StudioTopBar } from '@/components/layout/studio-top-bar'

export default function ProducerLoading() {
  return (
    <>
      <StudioTopBar stage="entry" />
      <StageWaitCard stage="entry" />
    </>
  )
}
