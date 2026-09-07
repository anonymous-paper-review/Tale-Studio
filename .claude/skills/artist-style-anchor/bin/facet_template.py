#!/usr/bin/env python3
"""facet 템플릿 도구 (scaffolds/facet-template-v0.guide.md §5).

  lint  <file.jsonc>...             작성 규칙 검사: 주석 제거 후 JSON 파싱 · 문자열 리프마다 // 주석(규칙 1) ·
                                    선택형 표기 [N개 중 1|n개 선택 …]가 있는 주석에 '분석 근거:'(규칙 4)
  strip <file.jsonc> [-o out.json]  주석·후행 쉼표 제거 → JSON (기본 출력: 같은 이름 .json)
"""
import argparse
import json
import re
import sys
from pathlib import Path

LEAF_RE = re.compile(r'^\s*"(?P<key>[^"]+)"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?\s*(?P<comment>//.*)?$')
ENUM_RE = re.compile(r'\[\d+개 중 (?:1|n)개 선택')


def strip_comments(text: str) -> str:
    """문자열 밖의 // 주석을 줄 끝까지 지우고, } ] 앞의 후행 쉼표를 없앤다."""
    out = []
    for line in text.splitlines():
        in_str = esc = False
        cut = None
        for i, c in enumerate(line):
            if in_str:
                if esc:
                    esc = False
                elif c == '\\':
                    esc = True
                elif c == '"':
                    in_str = False
            elif c == '"':
                in_str = True
            elif c == '/' and line[i + 1:i + 2] == '/':
                cut = i
                break
        out.append(line[:cut].rstrip() if cut is not None else line)
    joined = '\n'.join(out)
    return re.sub(r',(\s*[}\]])', r'\1', joined)


def lint(path: Path) -> int:
    text = path.read_text(encoding='utf-8')
    errors = []
    try:
        json.loads(strip_comments(text))
    except json.JSONDecodeError as e:
        errors.append(f'{path}:{e.lineno}: JSON 파싱 실패 — {e.msg}')
    leaves = enums = 0
    for n, line in enumerate(text.splitlines(), 1):
        m = LEAF_RE.match(line)
        if not m:
            continue
        leaves += 1
        key, comment = m['key'], m['comment']
        if not comment:
            errors.append(f'{path}:{n}: 리프 "{key}" 주석 없음 (규칙 1)')
            continue
        if ENUM_RE.search(comment):
            enums += 1
            if '분석 근거' not in comment:
                errors.append(f'{path}:{n}: 선택형 "{key}" 주석에 \'분석 근거:\' 없음 (규칙 4)')
    for e in errors:
        print(e)
    print(f'{path.name}: 리프 {leaves} · 선택형 {enums} · 문제 {len(errors)}')
    return len(errors)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    p_lint = sub.add_parser('lint')
    p_lint.add_argument('files', nargs='+', type=Path)
    p_strip = sub.add_parser('strip')
    p_strip.add_argument('file', type=Path)
    p_strip.add_argument('-o', '--out', type=Path)
    a = ap.parse_args()
    if a.cmd == 'lint':
        sys.exit(1 if sum(lint(f) for f in a.files) else 0)
    out = a.out or a.file.with_suffix('.json')
    data = json.loads(strip_comments(a.file.read_text(encoding='utf-8')))
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{a.file.name} → {out.name}')


if __name__ == '__main__':
    main()
