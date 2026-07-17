// 화면 캡처 → JPEG 저장. 현재 스테이지 메인 뷰(<main>)만 담는다(사이드바·채팅 패널 제외).
//   무거운 md/zip 파이프라인 없이 "지금 보이는 화면"을 한 장 이미지로 내보내는 경로.
import { domToJpeg } from 'modern-screenshot'

function triggerDownload(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function captureScreenJpeg(fileName: string): Promise<void> {
  const target = document.querySelector('main') as HTMLElement | null
  if (!target) throw new Error('캡처할 화면을 찾지 못했어요')

  // JPEG 는 투명도가 없어 배경색을 명시하지 않으면 검게 나온다 → 앱 배경색으로 채운다.
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff'

  const dataUrl = await domToJpeg(target, {
    quality: 0.92,
    backgroundColor: bg,
    scale: 2, // 레티나 선명도
  })
  triggerDownload(dataUrl, fileName)
}
