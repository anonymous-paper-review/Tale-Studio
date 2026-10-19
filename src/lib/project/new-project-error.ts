// 새 프로젝트 만들기 실패 안내(리뉴얼 1차 2026-10-19). 서버가 돌려준 실패 코드를 화면에 그대로 보이지 않는다 —
//   프로젝트 칸이 다 찼으면(slot_limit) 요금제로 갈 길을 둔다. 문구는 영어 원문 = 사전 키.
export function newProjectError(code: string | null | undefined): { message: string; showPricing: boolean } {
  if (code === 'slot_limit') {
    return { message: 'You have used all your project slots. Upgrade your plan or delete a project you no longer need, then try again.', showPricing: true }
  }
  return { message: 'Could not create the project. Please try again.', showPricing: false }
}
