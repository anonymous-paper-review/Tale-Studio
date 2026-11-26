// /studio/artist(Artist)를 여는 동안 — 레일을 누른 순간 화면 코드가 오기 전에도 그 단계의 기다리는 카드를 보인다(오너 2026-11-26 m1126 G1).
//   화면이 붙은 뒤 자료를 읽는 동안은 화면이 같은 카드를 그린다(hooks/use-stage-wait).
import { StageWaitCard } from '@/components/feedback/stage-wait'

export default function ArtistLoading() {
  return <StageWaitCard stage="artist" />
}
