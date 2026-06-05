// 오디오 파일 → 파형 peak 배열 디코드 (Web Audio API).
//   브라우저 전용 (AudioContext). 업로드된 오디오의 진폭을 buckets개로 다운샘플.

export interface DecodedAudio {
  durationSec: number
  peaks: number[]   // 0~1 정규화된 진폭, 길이 = buckets
}

/**
 * 오디오 URL/Blob을 디코드해 파형 peak + 길이 반환.
 * @param src object URL 또는 원격 URL
 * @param buckets 파형 막대 개수 (기본 1000)
 */
export async function decodeAudioPeaks(src: string, buckets = 1000): Promise<DecodedAudio> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) throw new Error('Web Audio API not supported')

  const ctx = new AudioCtx()
  try {
    const res = await fetch(src)
    const arrayBuf = await res.arrayBuffer()
    const audioBuf = await ctx.decodeAudioData(arrayBuf)

    const channel = audioBuf.getChannelData(0) // mono로 충분
    const blockSize = Math.max(1, Math.floor(channel.length / buckets))
    const peaks: number[] = []
    let max = 0

    for (let i = 0; i < buckets; i++) {
      const start = i * blockSize
      let peak = 0
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channel[start + j] ?? 0)
        if (v > peak) peak = v
      }
      peaks.push(peak)
      if (peak > max) max = peak
    }

    // 0~1 정규화
    const norm = max > 0 ? peaks.map((p) => p / max) : peaks
    return { durationSec: audioBuf.duration, peaks: norm }
  } finally {
    void ctx.close()
  }
}

/**
 * peak 배열을 canvas에 그린다 (중앙 기준 대칭 막대).
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  color: string,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx || peaks.length === 0) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = color
  const mid = height / 2
  const barW = width / peaks.length

  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, peaks[i] * mid)
    ctx.fillRect(i * barW, mid - h, Math.max(0.5, barW - 0.5), h * 2)
  }
}
