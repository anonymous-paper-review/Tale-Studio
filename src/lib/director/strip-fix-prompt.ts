// 이미지 고치기 지시문(오너 2026-11-26 O5 · 채팅 고치기 재료 (a) "지금 그림을 참고로") — Writer 샷의 지금 실사 세 칸(시작 · 방향 · 끝)을 합친 시트를
//   1번 참고 그림으로 주고, 바꿀 점만 바꾸고 나머지는 그대로 두라고 한다. 예전 고치기는 연필 러프에서 새로 칠해 바꿀 점 밖도 매번 달라졌다
//   (4a02fe1f "맥락있게 수정이 안 된다"). 처음 그리기 · 같은 설정 다시 만들기의 지시문(photo-strip · storyboard-strip)은 그대로다.
//   약속: tests/director/image-fix.test.ts
export interface StripFixPromptInput {
  /** 바꿀 점(영어 — 한국어면 부르는 쪽이 번역해 넘긴다). */
  change: string
  /** 샷 글(맥락만). */
  shotDescription: string
  /** 'cols' = 세로 포맷 가로 세 칸 시트. */
  frameAxis?: 'rows' | 'cols'
  /** 1번(지금 시트) 뒤에 붙는 인물 · 배경 · 그 밖 참고 그림 수. */
  characterRefCount: number
  worldRefCount: number
  extraRefCount: number
}

export function buildStripFixPrompt(input: StripFixPromptInput): string {
  const rowLayout = input.frameAxis === 'cols'
  const p1 = rowLayout ? 'Left' : 'Top'
  const p3 = rowLayout ? 'Right' : 'Bottom'
  const layoutContract = rowLayout ? 'the same single wide sheet with exactly three side-by-side panels' : 'the same single vertical sheet with exactly three stacked panels'
  const otherRefs = input.characterRefCount + input.worldRefCount + input.extraRefCount
  return [
    `The FIRST reference image is the current 3-panel storyboard sheet of ONE film shot. ${p1} panel = START frame. Middle panel = DIRECTION frame, the START frame with direction arrows drawn on it. ${p3} panel = END frame.`,
    `Edit this sheet. Make ONLY this change: ${input.change.trim()}`,
    '- Keep everything else exactly as it is in the first reference image: the same people, faces, hair, outfits, poses, positions, framing, camera distance and angle, lighting, colors, background and objects. Do not redraw or recompose the shot.',
    '- Make the change in every panel where it is visible, the same way in each panel.',
    "- Keep the middle panel's direction arrows exactly as they are. The START and END panels stay free of arrows, marks and text.",
    `- The output MUST be ${layoutContract}. Keep the sheet layout and the three panel borders exactly as they are and draw only inside the panels; never a single standalone picture, and no decorative frame or border outside the sheet.`,
    ...(otherRefs > 0
      ? ["- The other reference images show this shot's characters and place. Use them only to keep each person's face, hair and outfit and the place the same; do not copy their framing or poses."]
      : []),
    `- Shot description, for context only (change nothing it mentions unless the change above asks for it): ${input.shotDescription.trim()}`,
    "- No text anywhere except the middle panel's existing arrows.",
  ].join('\n')
}
