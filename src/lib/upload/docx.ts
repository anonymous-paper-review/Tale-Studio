import mammoth from 'mammoth'

/**
 * docx 에서 서식을 버리고 본문 텍스트만 뽑는다.
 *
 * 브라우저의 file.text() 로는 못 한다 — docx 는 zip 컨테이너라 그대로 읽으면
 * 깨진 바이너리 문자열이 조용히 LLM 으로 들어간다. 그래서 이 경로만 서버에 있다.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeExtractedText(result.value)
}

/**
 * 추출 텍스트 정돈 — mammoth 는 문단마다 빈 줄을 넣고, 워드 문서에는 비표준 공백과
 * CRLF 가 섞여 있다. 그대로 두면 토큰만 먹고 의미가 없다.
 */
export function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // 비파괴 공백·전각 공백 → 보통 공백
    .replace(/[ 　]/g, ' ')
    // 3줄 이상 연속 개행 → 2줄
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim()
}
