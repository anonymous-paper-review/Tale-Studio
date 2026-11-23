// 실사 계열 인물 시트의 사진 문구 — turnaround(순수 함수, 화면도 쓴다)가 서버 전용 photo-look.ts 를 끌고 오지 않게 문구만 둔다.
/** 모든 칸이 사진. 사람이 아닌 인물(동물 · 기계)도 실제로 찍은 것으로. */
export const PHOTO_SHEET_LINE =
  'every tile is a real studio photograph of a real actor in costume and make-up (a real animal, or a practical costume or prop, when the character is not human), shot with a real camera in a studio, with real skin, hair and fabric — never a drawing, painting, illustration, 3D render, game character or concept art'
/** 참고 그림(지금 시트 · 기준 얼굴 · 올린 그림 · 앞 화 시트)이 그림이어도 사진으로 — 누구인지와 옷만 가져온다. */
export const PHOTO_SHEET_FROM_PICTURES =
  'the reference pictures of this character may be drawings or renders: keep only who they are and what they wear, and remake every tile as the real photograph described above — never copy their linework, shading, skin smoothing or render finish'

// 일본 멜로 그림체 문장에 있던 "실제 사진" 문장(오너 2026-11-23 "일본 멜로를 선택한 경우가 실사에 제일 가깝게 나와") —
//   그 시험의 2번에는 시트 · 배경 · 샷 모두에 이 문장이 있었고 실사에는 없었다. 렌즈(35mm)와 색(파스텔 · 번짐)은 샷 설계와 일본 멜로의 것이라 뺐다.
const photoTexture = (surface: string) =>
  `Rendered in photorealistic live-action cinematography, shot on a digital cinema camera: ${surface}, real fabric weave and true material response. A real photograph, not an illustration, painting or anime`
/** 사람이 나오는 그림(시트 · 샷). */
export const PHOTO_TEXTURE_PEOPLE = photoTexture('true-to-life skin texture with visible pores')
/** 사람이 없는 그림(배경 · 사람 없는 샷) — 피부 이야기를 넣지 않는다. */
export const PHOTO_TEXTURE_PLACE = photoTexture('true-to-life surface texture')
/** 그림체 색감 문장에 이미 같은 말이 있는가 — 있으면 두 번 싣지 않는다. */
export const hasPhotoTexture = (clause: string | null | undefined): boolean => /\bA real photograph\b/i.test(clause ?? '')
