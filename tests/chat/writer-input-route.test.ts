// 조회 문장은 Writer 실행·씬 승인 중에도 수정 경로로 전달하지 않는다
import { expect, it } from 'vitest'
import { writerInputRoute } from '@/lib/chat-harness'

it.each(['왜 막혔어?', '현재 작업 진행 상태를 조회해줘', 'Artist로 못 넘어가는 이유가 뭐야?', '상태를 새로고침해줘', '중단된 Writer 실행을 재개해줘'])('실행 중이거나 씬 승인 대기여도 상태와 복구 요청은 채팅으로 전달한다: %s', message => {
  // 왜: UI에서 모든 입력을 수정으로 간주하면 상태 조회 도구에 도달할 수 없다.
  expect(writerInputRoute(message, { running: true, sceneGate: false })).toBe('chat')
  expect(writerInputRoute(message, { running: false, sceneGate: true })).toBe('chat')
})
it('씬 수정과 새 초안 요청은 기존 실행 제한과 승인 경로를 유지한다', () => {
  // 왜: 조회 허용으로 생성 중 편집 제한이나 씬 수정 동의를 우회하면 안 된다.
  expect(writerInputRoute('첫 씬을 두 개로 나눠줘', { running: false, sceneGate: true })).toBe('revise')
  expect(writerInputRoute('초안을 만들어줘', { running: true, sceneGate: false })).toBe('blocked')
  expect(writerInputRoute('샷 길이를 9초로 바꿔줘', { running: false, sceneGate: false })).toBe('chat')
})
it.each(['현재 프로젝트의 저장된 씬·샷 수와 Artist 진입 가능 여부를 조회만 해줘.', '첫 씬의 요약을 보여줘. 수정하거나 승인하지 마.', '왜 여기서 멈췄어?', '지금 몇 퍼센트야?'])('조회 표현이 달라도 실행 중 편집 거절이나 씬 수정으로 보내지 않는다: %s', message => {
  // 왜: 이전 보고서의 실제 실험 문장조차 조회로 분류되지 않는 누락을 막는다.
  expect(writerInputRoute(message, { running: true, sceneGate: false })).toBe('chat')
  expect(writerInputRoute(message, { running: false, sceneGate: true })).toBe('chat')
})

it.each(['첫 씬의 내용을 설명해줘', '첫 씬이 어떤 내용이야?', '둘째 샷을 요약해줘. 수정은 하지 마.'])('설명·요약 요청은 씬 승인 대기나 실행 중에도 수정 경로로 보내지 않는다: %s', message => {
  // 왜: 이전 검증에서 "첫 씬의 내용을 설명해줘"가 씬 수정 요청으로 가는 것을 확인했다.
  expect(writerInputRoute(message, { running: false, sceneGate: true })).toBe('chat')
  expect(writerInputRoute(message, { running: true, sceneGate: false })).toBe('chat')
})
it.each(['첫 씬을 두 개로 나눠주고 알려줘', '둘째 샷 대사를 지우고 결과를 보여줘', '씬 설명을 수정해서 상태 알려줘'])('수정과 조회가 같이 있으면 수정 경로를 유지한다: %s', message => {
  // 왜: 이전 검증에서 "나눠주고 알려줘"가 조회로 분류돼 수정을 건너뛰는 것을 확인했다.
  expect(writerInputRoute(message, { running: false, sceneGate: true })).toBe('revise')
  expect(writerInputRoute(message, { running: true, sceneGate: false })).toBe('blocked')
})

it.each(['첫 씬을 두 개로 나눠줘?', '첫 씬을 두 개로 나눠줄래?', '첫 씬을 두 개로 나누고 이유도 설명해줘', '첫 씬 길이를 어떻게든 줄여줘', '첫 씬을 언제나 비 오는 밤으로 바꿔줘', '첫 씬에 "뭐야"라는 대사를 추가해줘', '첫 씬에 "왜 그래"라는 대사를 추가해줘'])('씬 수정 요청에 물음표나 설명이 붙어도 기존 수정 경로를 유지한다: %s', message => {
  // 왜: 조회 문장을 넓게 받다가 정중한 수정 요청까지 조회로 오인하지 않는다.
  expect(writerInputRoute(message, { running: false, sceneGate: true })).toBe('revise')
  expect(writerInputRoute(message, { running: true, sceneGate: false })).toBe('blocked')
})
