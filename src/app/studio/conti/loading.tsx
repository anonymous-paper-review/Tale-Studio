// /studio/conti(Writer 칸 안의 콘티 — 오너 O1 2026-11-26 "콘티를 Artist 앞에")를 여는 동안 — 레일 · [콘티] 단추를 누른 순간 화면 코드가 오기 전에도
//   Writer 옷 기다리는 카드를 보인다(m1126 G1). 콘티 화면(m-conti)이 붙은 뒤 자료를 읽는 동안은 화면이 같은 카드를 그린다.
import { StageWaitCard } from '@/components/feedback/stage-wait'

export default function ContiLoading() {
  return <StageWaitCard stage="conti" />
}
