// 경량 inline 마크다운 → HTML 렌더러 (C6).
// 지원: **굵게**, *기울임* / _기울임_, `코드`. 그 외 마크다운은 원문 유지.
// XSS 방어: 입력을 먼저 HTML escape 한 뒤에만 우리가 만든 태그를 주입한다.
//   따라서 사용자가 보낸 <script>, onerror= 등은 절대 실행되지 않는다(텍스트로 escape됨).

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// escape된 안전한 문자열에 대해서만 inline 마크다운 변환을 적용한다.
export function renderInlineMarkdown(input: string): string {
  const escaped = escapeHtml(input ?? '')
  return (
    escaped
      // `code`
      .replace(
        /`([^`\n]+)`/g,
        '<code class="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.95em]">$1</code>',
      )
      // **bold** → UI에서 굵게 표시하지 않음(별표만 제거해 평문으로). (사용자 요청: 채팅 bold 억제)
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      // *italic* (앞에 *가 아닐 때만 — **bold**의 잔여 별표 오인 방지)
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      // _italic_
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
      // @멘션(#a2 2026-07-15) — "@차미르", "@스토리" 같은 멘션 토큰을 하늘색으로.
      //   시작 경계: 문자열 시작/공백/여는 괄호/세미콜론(escape된 따옴표 &#39; 뒤 포함)만
      //   허용해 이메일(user@domain)은 물들이지 않는다. 토큰은 공백·구두점 전까지.
      .replace(
        /(^|[\s([{;“‘])@([A-Za-z0-9가-힣_][A-Za-z0-9가-힣_·-]*)/gm,
        '$1<span class="font-medium text-sky-300">@$2</span>',
      )
  )
}
