// 경량 inline 마크다운 → HTML 렌더러 (C6).
// 지원: **굵게**, __굵게__, *기울임* / _기울임_, `코드`, #/##/### 헤딩(마커만 제거). 그 외 마크다운은 원문 유지.
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

// 구분선-전용 줄 제거 (#no-hr 2026-08-26, 오너 E1): 모델이 습관적으로 넣는 ---/ㅡㅡ/—— 같은
//   구분선은 이 렌더러가 <hr> 을 만들지 않으므로 생 기호("ㅡ")로 노출됐다. 기호만으로 이뤄진
//   줄을 통째로 걷고, 남은 이중 빈 줄을 한 칸으로 접는다. 프롬프트 금지 규칙이 1차 방어,
//   이 스크럽이 과거 메시지까지 덮는 최종 방어다.
function stripSeparatorLines(input: string): string {
  return input
    .replace(/^[ \t]*[-–—ㅡ―ー=_*·]{3,}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
}

// 화면 표시 후처리(#copy-polish 2026-09-04, 약속 A4·A5·A7): AI 답변은 저장본을 고치지 않고 그릴 때 다듬는다 —
//   그래야 과거 채팅에도 같은 규칙이 먹는다. 라이브러리 대신 우리 후처리기로 관리한다(오너 A7):
//   기존 렌더러가 기울임·코드·@멘션은 살리고 굵게 마커만 걷는 식이라 범용 마크다운 제거기와 맞지 않는다.
//   ① 긴 대시(—·–·―)를 지운다 — 숫자 범위는 하이픈, 줄머리는 하이픈 불릿, 줄끝은 삭제, 그 밖은 쉼표.
//   ② 단계 고유명(writer·producer·artist·director·editor)이 낱말로 쓰이면 첫 글자를 대문자로 —
//      식별자·경로·이메일·코드(`writer`, writer_runs, /studio/writer, writer@…)는 건드리지 않는다.
const STAGE_WORD = /(^|[^A-Za-z0-9_./:=\-'"`@[])(writer|producer|artist|director)(?=$|[^A-Za-z0-9_./:=\-'"`@\]])/gm

export function polishAssistantProse(input: string): string {
  return (input ?? '')
    .replace(/(\d)[ \t]*[–—―][ \t]*(?=\d)/g, '$1-')
    .replace(/^[ \t]*[—–―]+[ \t]*(?=\S)/gm, '- ')
    .replace(/[ \t]*[—–―]+[ \t]*$/gm, '')
    .replace(/([,;:!?.])[ \t]*[—–―]+[ \t]*/g, '$1 ')
    .replace(/[ \t]*[—–―]+[ \t]*/g, ', ')
    .replace(STAGE_WORD, (_m, pre: string, word: string) => `${pre}${word[0].toUpperCase()}${word.slice(1)}`)
}

// escape된 안전한 문자열에 대해서만 inline 마크다운 변환을 적용한다.
//   polish=false 는 사용자 말풍선처럼 AI 답변이 아닌 글에 쓴다(사용자가 쓴 그대로 보여준다).
export function renderInlineMarkdown(input: string, opts?: { polish?: boolean }): string {
  const stripped = stripSeparatorLines(input ?? '')
  const escaped = escapeHtml(opts?.polish === false ? stripped : polishAssistantProse(stripped))
  return (
    escaped
      // 줄머리 #/##/### 헤딩 마커 제거(#heading-strip 2026-08-31, 오너 실측) — 이 렌더러는
      //   <h1~3>을 만들지 않으므로 # 기호가 생 문자로 노출됐다. 마커만 걷고 본문은 유지.
      .replace(/^#{1,3}[ \t]+/gm, '')
      // `code`
      .replace(
        /`([^`\n]+)`/g,
        '<code class="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.95em]">$1</code>',
      )
      // **bold** → UI에서 굵게 표시하지 않음(별표만 제거해 평문으로). (사용자 요청: 채팅 bold 억제)
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      // *italic* (앞에 *가 아닐 때만 — **bold**의 잔여 별표 오인 방지)
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      // __bold__(밑줄 2개) → **bold**와 동일하게 마커만 제거해 평문으로(#underline-bold 2026-08-31,
      //   오너 실측: 밑줄이 화면에 그대로 노출됨). 단일 _italic_ 규칙보다 먼저 처리해 충돌 방지.
      .replace(/__([^_\n]+)__/g, '$1')
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
