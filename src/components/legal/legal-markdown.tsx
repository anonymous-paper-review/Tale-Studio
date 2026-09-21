import { Fragment, type ReactNode } from 'react'

// 첨부 원문에 쓰인 제목·문단·목록·표·강조·링크만 표시한다.
// 채팅 렌더러는 문장을 다듬고 강조를 지우므로 법적 문서에는 쓰지 않는다.
// HTML은 React가 텍스트로 이스케이프하며 외부 실행용 URL은 링크로 만들지 않는다.
function inline(text: string): ReactNode[] {
  const pieces: ReactNode[] = []
  const tokens = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let cursor = 0
  for (const match of text.matchAll(tokens)) {
    pieces.push(text.slice(cursor, match.index))
    const key = match.index
    if (match[1] !== undefined) {
      const href = match[2]
      const safe = /^(?:https:\/\/|mailto:|\/(?!\/)|#)/i.test(href) && !/[\\\u0000-\u0020]/.test(href)
      pieces.push(safe
        ? <a key={key} href={href} className="rounded-sm underline decoration-border-strong underline-offset-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{inline(match[1])}</a>
        : <Fragment key={key}>{match[1]}</Fragment>)
    } else if (match[3] !== undefined) {
      pieces.push(<strong key={key} className="font-semibold text-foreground">{match[3]}</strong>)
    } else {
      pieces.push(<em key={key}>{match[4]}</em>)
    }
    cursor = match.index + match[0].length
  }
  pieces.push(text.slice(cursor))
  return pieces
}

const tableCells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
const tableDivider = (line: string) => /^\|(?:[\s:|-]+)\|$/.test(line)
const special = (line: string) => /^(?:#{1,3} |[-*] |---$|\|)/.test(line)

export function LegalMarkdown({ markdown, compact = false }: { markdown: string; compact?: boolean }) {
  const lines = markdown.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const key = index
    if (!line.trim()) { index++; continue }
    const heading = /^(#{1,3}) (.+)$/.exec(line)
    let block: ReactNode
    if (heading) {
      const title = inline(heading[2])
      block = heading[1].length === 1
        ? <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        : heading[1].length === 2
          ? <h2 id={`section-${key}`} className="scroll-mt-24 border-t border-border pt-8 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          : <h3 className="text-lg font-medium text-foreground">{title}</h3>
      index++
    } else if (line === '---') {
      block = <hr className="border-border" />
      index++
    } else if (line.startsWith('|') && tableDivider(lines[index + 1] ?? '')) {
      const headers = tableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && lines[index].startsWith('|')) rows.push(tableCells(lines[index++]))
      block = (
        <div tabIndex={0} role="region" aria-label={headers.join(', ')} className="max-w-full overflow-x-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <table className="w-full min-w-2xl border-collapse text-left text-sm leading-relaxed">
            <thead className="bg-muted/50 text-foreground">
              <tr>{headers.map((cell, col) => <th key={col} scope="col" className="min-w-40 border-b border-border px-5 py-4 align-top font-semibold">{inline(cell)}{' '}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, ri) => <tr key={ri} className="border-b border-border last:border-0">{row.map((cell, ci) => <td key={ci} className="px-5 py-4 align-top">{inline(cell)}{' '}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    } else if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*] /.test(lines[index])) items.push(lines[index++].slice(2))
      block = <ul className="flex list-disc flex-col gap-3 pl-5 marker:text-muted-foreground">{items.map((item, i) => <li key={i} className="pl-1">{inline(item)}{'\n'}</li>)}</ul>
    } else {
      const paragraph = [lines[index++]]
      while (index < lines.length && lines[index].trim() && !special(lines[index])) paragraph.push(lines[index++])
      block = <p className="whitespace-pre-line">{inline(paragraph.join('\n'))}</p>
    }
    blocks.push(<Fragment key={key}>{block}{'\n'}</Fragment>)
  }
  return <div className={compact ? 'flex flex-col gap-3 text-xs leading-relaxed' : 'flex min-w-0 flex-col gap-6 text-base leading-7 text-muted-foreground'}>{blocks}</div>
}
