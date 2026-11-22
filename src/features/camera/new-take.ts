// Camera 샷 줄의 [영상 만들기](오너 2026-11-22 D2~D5) — 단추 이름 · 꺼짐 · 까닭. 샷 상세 영상 고치기(shot-video-tab FixVideo)와 같은 말 · 같은 규칙(11/14):
//   늘 새 Take 이고, 쓴 그림이 바뀐 뒤면 "바뀐 이미지로", 시작 · 끝 그림이 없거나 다시 그리는 중 · Take 를 만드는 중 · 영상 일괄 중이면 꺼진다.
//   단추에 Take 값을 적는 것은 화면이 countText 로 한다(과금이 꺼져 있으면 값 없는 이름). 영상 방식(기본 시작+끝 외 넷)은 영상 방식 조각에서 더한다.
//   약속: tests/camera/fix.test.ts

export interface NewTakeButtonInput {
  hasImage: boolean
  /** 시작 · 끝 그림을 다시 그리는 중(또는 일괄 차례를 기다림) — 지금 누르면 옛 그림으로 Take 가 나간다. */
  imageBusy: boolean
  /** 이 샷의 Take 를 만드는 중(화면에서 멈춘 것은 빼고). */
  takeMaking: boolean
  batchBusy: boolean
  /** 누른 뒤 요청을 보내는 동안 — 두 번 눌러 Take 가 두 번 나가지 않게. */
  sending: boolean
  /** 이어받을 Take 가 있다(첫 영상이 아니다). */
  hasTake: boolean
  /** 이어받을 Take 를 만든 뒤 지금 그림이 바뀌었다. */
  imageChanged: boolean
}

export interface NewTakeButton {
  /** 단추 이름 — Take 값을 적을 때 one/many(count), 적지 않을 때 plain. 모두 영어 원문 = i18n 키. */
  label: { one: string; many: string; plain: string }
  disabled: boolean
  /** 꺼진 까닭 한 줄(영어 원문 = i18n 키) — 보내는 중에는 까닭 없이 꺼진다. */
  reason: string | null
}

export function newTakeButton(input: NewTakeButtonInput): NewTakeButton {
  const label = !input.hasTake
    ? { one: 'Make the video · 1 Take', many: 'Make the video · {count} Takes', plain: 'Make the video' }
    : input.imageChanged
      ? { one: 'Make a new Take with the changed image · 1 Take', many: 'Make a new Take with the changed image · {count} Takes', plain: 'Make a new Take with the changed image' }
      : { one: 'Make a new Take · 1 Take', many: 'Make a new Take · {count} Takes', plain: 'Make a new Take' }
  const reason = !input.hasImage
    ? 'Make the start and end images first.'
    : input.imageBusy
      ? 'The start and end images are being remade. Make the Take when they are done.'
      : input.takeMaking
        ? 'A Take is being made. You can make a new one when it is done.'
        : input.batchBusy
          ? 'You can make it after the video batch finishes'
          : null
  return { label, disabled: reason !== null || input.sending, reason }
}
