const requiredSections = [
  'overview',
  'architecture',
  'flow',
  'code-journey',
  'tradeoffs',
  'check',
  'evidence',
]

function hasSection(html, section) {
  const pattern = new RegExp(`\\bdata-guide-section\\s*=\\s*(["'])${section}\\1`, 'i')
  return pattern.test(html)
}

function svgBlocks(html) {
  const blocks = []
  const openingTag = /<svg\b[^>]*>/gi
  let match
  while ((match = openingTag.exec(html)) !== null) {
    const closeIndex = html.toLowerCase().indexOf('</svg>', openingTag.lastIndex)
    if (closeIndex === -1) {
      blocks.push(html.slice(match.index))
      break
    }
    blocks.push(html.slice(match.index, closeIndex + 6))
    openingTag.lastIndex = closeIndex + 6
  }
  return blocks
}

function hasNonEmptyElement(svg, name) {
  const pattern = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i')
  const match = pattern.exec(svg)
  return match !== null && match[1].replace(/<[^>]*>/g, '').trim().length > 0
}

function unresolvedTokens(html) {
  return [...new Set(html.match(/\{\{[A-Z][A-Z0-9_]*\}\}/g) ?? [])]
}

function duplicateSvgIds(svgs) {
  const seen = new Set()
  const duplicates = new Set()
  const idPattern = /\bid\s*=\s*(["'])([^"']+)\1/gi
  for (const svg of svgs) {
    let match
    while ((match = idPattern.exec(svg)) !== null) {
      const id = match[2].trim()
      if (seen.has(id)) duplicates.add(id)
      else seen.add(id)
    }
  }
  return [...duplicates]
}

function externalUrls(html) {
  const urls = []
  const seen = new Set()
  const add = (value) => {
    const url = value.trim()
    if (/^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  const attribute = /\b(?:src|href|poster|action|data|srcset)\s*=\s*(["'])([\s\S]*?)\1/gi
  let match
  while ((match = attribute.exec(html)) !== null) {
    for (const value of match[2].split(',')) add(value.trim().split(/\s+/)[0])
  }
  const cssUrl = /url\(\s*(["']?)(https?:\/\/[^\s)'"<>]+)\1\s*\)/gi
  while ((match = cssUrl.exec(html)) !== null) add(match[2])
  return urls
}

export function validateGuideHtml(html, { mode = 'concept' } = {}) {
  const errors = []
  if (typeof html !== 'string') {
    return { valid: false, errors: ['HTML 문자열이 필요하다'], svgCount: 0 }
  }

  for (const section of requiredSections) {
    if (!hasSection(html, section)) errors.push(`필수 학습 절이 없다: ${section}`)
  }

  const svgs = svgBlocks(html)
  const svgCount = svgs.length
  if (svgCount === 0) errors.push('SVG 시각화가 최소 1개 필요하다')
  if ((mode === 'onboarding' || mode === 'feature') && svgCount < 2) {
    errors.push(`${mode} 가이드는 SVG 시각화가 최소 2개 필요하다`)
  }

  for (const svg of svgs) {
    if (!hasNonEmptyElement(svg, 'title')) errors.push('SVG에 비어 있지 않은 title이 필요하다')
    if (!hasNonEmptyElement(svg, 'desc')) errors.push('SVG에 비어 있지 않은 desc가 필요하다')
  }

  for (const token of unresolvedTokens(html)) errors.push(`치환하지 않은 템플릿 값이 남아 있다: ${token}`)
  for (const id of duplicateSvgIds(svgs)) errors.push(`SVG id가 중복된다: ${id}`)
  for (const url of externalUrls(html)) errors.push(`외부 URL에 의존하면 안 된다: ${url}`)
  return { valid: errors.length === 0, errors, svgCount }
}

async function main() {
  const [htmlPath, mode = 'concept'] = process.argv.slice(2)
  if (!htmlPath) {
    process.stderr.write('사용법: node verify-guide.mjs <html-path> [mode]\n')
    process.exitCode = 1
    return
  }

  try {
    const { readFile } = await import('node:fs/promises')
    const html = await readFile(htmlPath, 'utf8')
    const result = validateGuideHtml(html, { mode })
    if (!result.valid) {
      for (const error of result.errors) process.stderr.write(`${error}\n`)
      process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`verify-guide: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
