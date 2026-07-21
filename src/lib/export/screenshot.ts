// 화면 캡처 → JPEG 저장. 현재 스테이지 메인 뷰(<main>)를 담는다(사이드바·채팅 패널 제외).
//   무거운 md/zip 파이프라인 없이 "지금 화면"을 한 장 이미지로 내보내는 경로.
//
// full screen capture(#c1 2026-07-18): main 안에는 스크롤 컨테이너가 중첩돼 있다
//   (studio layout 의 h-screen overflow-y-auto div + 각 뷰의 radix ScrollArea viewport).
//   그대로 <main> 을 캡처하면 뷰포트 높이에서 잘려 "보이는 부분"만 나온다 → 캡처 동안
//   스크롤 컨테이너의 높이 제약을 임시로 풀어(overflow:visible) 전체 콘텐츠를 펼친 뒤 담는다.
import { domToJpeg } from 'modern-screenshot'

function triggerDownload(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/**
 * 현재 화면(<main>)을 전체 스크롤 콘텐츠까지 펼쳐 JPEG 로 저장한다.
 * @param onProgress 에셋(이미지) 임베드 진행 콜백 — (담은 수, 전체 수).
 */
export async function captureScreenJpeg(
  fileName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const target = document.querySelector('main') as HTMLElement | null
  if (!target) throw new Error('캡처할 화면을 찾지 못했어요')

  // JPEG 는 투명도가 없어 배경색을 명시하지 않으면 검게 나온다 → 앱 배경색으로 채운다.
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff'

  // 캡처 동안만 중첩 스크롤 컨테이너의 높이·overflow 제약을 해제 → 전체 콘텐츠가 펼쳐진 채로 담긴다.
  const expandStyle = document.createElement('style')
  expandStyle.dataset.captureExpand = '1'
  expandStyle.textContent = `
    main > div,
    main [data-radix-scroll-area-viewport],
    main [data-slot="scroll-area-viewport"],
    main .overflow-y-auto,
    main .overflow-auto,
    main .overflow-y-scroll {
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
  `
  document.head.appendChild(expandStyle)
  try {
    await nextFrame() // 펼쳐진 레이아웃이 반영되도록 한 프레임 양보

    const fullH = Math.max(target.scrollHeight, target.clientHeight)
    const fullW = Math.max(target.scrollWidth, target.clientWidth)
    // 큰 보드에서 scale:2 는 캔버스 크기 한계(≈16k px)·메모리를 넘길 수 있어 높이 기준으로 낮춘다.
    const scale = fullH > 6000 ? 1 : 2

    const dataUrl = await domToJpeg(target, {
      quality: 0.92,
      backgroundColor: bg,
      scale,
      width: fullW,
      height: fullH,
      style: { height: `${fullH}px`, maxHeight: 'none', overflow: 'visible' },
      progress: onProgress,
    })
    triggerDownload(dataUrl, fileName)
  } finally {
    expandStyle.remove()
  }
}
