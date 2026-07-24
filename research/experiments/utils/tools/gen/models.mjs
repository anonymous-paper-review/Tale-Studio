// 논리 task → 프로바이더별 모델·파라미터 매핑.
// 프로바이더나 모델을 바꾸고 싶으면 실험 코드가 아니라 여기만 고친다.
//
// 검증 근거 (2026-07-23, `higgsfield model get` 실측):
//   - fal `flux_2`는 seed 지원 / higgsfield `flux_2`는 seed 파라미터 없음 → 재현성 필요 실험은 --mode fal 로 고정.
//   - gpt_image_2 · happy_horse_video · flux_2 는 fal과 동일 계열이라 --mode speed 로 섞어도 출력이 비교가능.

// fal T2I는 aspect 문자열이 아니라 image_size 프리셋명을 쓴다.
const FAL_IMAGE_SIZE = {
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
}
export const falImageSize = (aspect) => FAL_IMAGE_SIZE[aspect] ?? 'landscape_16_9'

// task가 이미지를 만드는지 영상을 만드는지 — i2v는 이미지 산출을 입력으로 받으므로 이미지 단계 뒤에 돈다.
export const TASK_KIND = { t2i: 'image', edit: 'image', i2v: 'video', i2v_se: 'video' }

export const PROVIDERS = ['fal', 'higgsfield']

export const MODELS = {
  fal: {
    // 제품 실배선(src/lib/writer/llm/fal.ts)과 동일 모델 id
    t2i: { model: 'fal-ai/flux-2/klein/9b' },
    edit: { model: 'openai/gpt-image-2/edit' },
    i2v: { model: 'alibaba/happy-horse/reference-to-video' },
    // i2v_se: 시작+끝 프레임 쌍 I2V — Seedance 2.0 (2026-07-23 오너 확정, 입력 포맷 실험용).
    //   fal openapi 실측: image_url(필수)·end_image_url(선택)·duration은 문자열 "4"~"15"(최소 4초)·
    //   seed는 입력 불가(출력에만 존재 → 프로버넌스에 기록).
    i2v_se: { model: 'bytedance/seedance-2.0/image-to-video', resolution: '720p' },
  },
  higgsfield: {
    // `higgsfield model get <jobType>` 로 확정한 job_type + 기본 해상도
    t2i: { jobType: 'flux_2', resolution: '2k' },
    edit: { jobType: 'gpt_image_2', resolution: '2k' },
    i2v: { jobType: 'happy_horse_video', resolution: '720p' },
    // `model get seedance_2_0` 실측: start_image/end_image 지원, seed 파라미터 없음, duration 정수(최소 4).
    i2v_se: { jobType: 'seedance_2_0', resolution: '720p' },
  },
}

export const supports = (provider, task) => Boolean(MODELS[provider]?.[task])
