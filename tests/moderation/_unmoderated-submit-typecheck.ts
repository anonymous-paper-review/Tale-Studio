// 검사를 건너뛴 제출이 "타입 오류"로 막히는지 고정한다(#creem-moderation 2026-10-11).
//   이 파일은 실행되지 않는다(`_` 접두 + .test.ts 아님) — pnpm typecheck 가 읽는다. @ts-expect-error 는
//   "여기서 오류가 나야 한다"는 뜻이라, 누군가 제출 함수의 검사 요구를 느슨하게 풀면 오류가 사라지면서
//   이 파일이 타입 검사를 깨뜨린다. 즉 "검사 없는 제출 금지"가 CI 에서 계속 지켜진다.
import { falImageSubmit, falVideoSubmit } from '@/lib/writer/llm/fal'

export async function unmoderatedSubmissionsMustNotTypecheck(): Promise<void> {
  // @ts-expect-error 검사 표식이 없는 입력은 이미지 제출로 넘길 수 없다.
  await falImageSubmit({ prompt: 'a portrait' }, { retry: false })
  // @ts-expect-error 영상도 같다 — 검사 표식이 없는 입력은 제출할 수 없다.
  await falVideoSubmit({ prompt: 'a wave', image_url: 'https://cdn.example/start.png', duration: 5 })
}

// 감독 영상의 제출 조각(submitFalReferenceToVideo · submitLocalVideo)은 모듈 밖으로 내보내지 않는다 —
//   영수증을 필수 인자로 받고 제출 직전 assertModerationReceipt 로 모양까지 검문하며, 그 동작은
//   tests/moderation/video-paths-blocked.test.ts 가 확인한다.
