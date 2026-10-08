#!/usr/bin/env python3
"""경량 판(lite v0.1) facet 추출 참조 구현 — 그림 1장 → filled.json → prompts.md → fragments.json. Claude API 직접 호출(도구 없음, 요청 2번).

사용: facet_lite_extract.py --image <그림> --out <폴더> [--model claude-sonnet-5-5] [--thinking adaptive|off] [--max-fill-tokens 16000] [--max-compile-tokens 6000]
산출(<폴더>): filled.json · scene_summary.md · prompts.md · fragments.json(제품이 쓰는 조각: probe_anchors·figure·priority·negative·scene + 단어 수·시간·토큰) · response-*.md(원문)
키: 환경변수 ANTHROPIC_API_KEY, 없으면 저장소 .env.local 에서 읽는다(출력하지 않는다).
정본: 서식 `.claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.jsonc`, 규칙·스펙은 같은 폴더의 `facet-template-lite-v0.1.guide.md`(§1 채우기 · §2 컴파일 · 부록 A/B 스펙).
실측(2026-10-08, refer9 1장): 채움 72초 · 컴파일 26초(생각 기본) / 44초 · 8초(생각 끔 — 컴파일이 단어 상한을 넘김). 제품에는 생각 기본을 권한다.
API 메모: claude-sonnet-5-5 는 thinking.type "disabled" 를 받지 않는다 — 끄려면 {"type": "between_tools"}. 컴파일 max_tokens 는 6000 이상(4000 이면 생각이 다 먹어 본문이 빈다)."""
import argparse, base64, json, mimetypes, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]  # <repo>/.claude/docs/2026-10-08/facet-presets/lite/this.py → <repo>
SCAFF = ROOT / '.claude/skills/artist-style-anchor/scaffolds'
TEMPLATE = SCAFF / 'facet-template-lite-v0.1.jsonc'; GUIDE = SCAFF / 'facet-template-lite-v0.1.guide.md'
SECTIONS = ('PROBE_ANCHORS', 'FIGURE', 'PRIORITY', 'NEGATIVE', 'SCENE')

def api_key():
    k = os.environ.get('ANTHROPIC_API_KEY')
    if k: return k
    for l in (ROOT / '.env.local').read_text(encoding='utf-8').splitlines():
        if l.startswith('ANTHROPIC_API_KEY='): return l.split('=', 1)[1].strip().strip('"\'')
    sys.exit('ANTHROPIC_API_KEY 없음')

def guide_section(n):
    g = GUIDE.read_text(encoding='utf-8')
    return re.search(rf'## {n}\..*?(?=\n## |\Z)', g, re.S).group(0)

def fill_prompt():
    """가이드 부록 A(채우기 스펙)를 '파일 대신 코드블록으로 답하라'로만 바꾼 것 + §1 + 서식."""
    return ('# 작업: 그림 한 장의 스타일을 facet 템플릿 lite v0.1에 채우기\n\n'
            '아래 서식(주석이 곧 작성법)과 채우기 규칙 8항을 읽고, 첨부한 그림 한 장을 보고 값을 채운다. '
            '답은 두 개의 코드블록만으로 한다: ```json 블록에 filled.json(같은 구조, 값만 바꾼 JSON, 주석 없음)```, '
            '```md 블록에 scene_summary.md(장면 종류·대상·인물 유무 2~3줄)```. 다른 말은 쓰지 않는다.\n\n'
            '- 96개 값을 전부 채운다. 첫 토큰은 `[실측]` `[추정]` `[외삽]` `[해당 없음]` 중 하나. `[n개 중 1개 선택]`은 그 후보 중에서만.\n'
            '- **수치는 재지 않는다** — 등급을 눈으로 고른다. 확대 측정·픽셀 계산에 시간을 쓰지 않는다. 이 판은 빠르게 채우는 것이 목적이다.\n'
            '- 보이지 않는 것은 "없음", 작아서 못 읽는 것은 "판독 불가". 장르의 보통 값으로 채우지 않는다.\n'
            '- 작가·작품·브랜드·캐릭터 이름 금지. 특정 캐릭터의 색·의상·소품·포즈는 적지 않는다(스타일만).\n'
            '- 외부 검색 금지.\n\n'
            '## 채우기 규칙\n\n' + guide_section(1) + '\n\n## 서식 (facet-template-lite-v0.1.jsonc)\n\n```jsonc\n' + TEMPLATE.read_text(encoding='utf-8') + '\n```\n')

def compile_prompt(filled_json, scene_summary):
    """가이드 부록 B(컴파일 스펙)를 '파일 대신 본문으로 답하라'로만 바꾼 것 + §2 + 채움."""
    return ('# 작업: facet 템플릿 lite 채움 → 이미지 생성 프롬프트 컴파일\n\n'
            '당신은 프롬프트 컴파일러다. 아래 `filled.json`(그림 한 장의 스타일을 경량 서식에 적은 것)과 `scene_summary.md`(그 그림의 내용 요약)만 보고 영문 프롬프트를 쓴다. '
            '**원본 이미지는 없다. 서식에 적힌 것만이 근거다.** 서식에 없는 속성을 지어내지 않는다. 답은 `prompts.md`의 내용만(아래 형식 그대로, 코드블록 없이) 쓴다.\n\n'
            '규칙은 아래 컴파일 규칙 12항을 그대로 따른다 — 특히 단어 상한(PROBE_ANCHORS 110 · FIGURE 150 · PRIORITY 30 · NEGATIVE 40 · SCENE 40), 등급을 방향어로 바꾸는 표(7항), 없음은 "no …"(8항).\n\n'
            '- 작가·작품·브랜드·회사 고유명사 금지. hex는 그대로. 한국어 값을 영문으로 옮길 때 의미를 바꾸지 않는다.\n'
            '- 외부 검색 금지. 길이를 맞추려고 다시 쓰기를 되풀이하지 않는다 — 한 번에 쓰고 끝낸다.\n\n'
            '## prompts.md 형식 (헤더 글자 그대로, 각 헤더 아래 문단 하나, 코드블록 없이)\n\n'
            '## PROBE_ANCHORS\n(≤ 110단어)\n\n## FIGURE\n(≤ 150단어, 인물 표본이 1 이상일 때만. 0이면 첫 토큰 `[EXTRAPOLATED]`)\n\n'
            '## PRIORITY\n(≤ 30단어, "Priority order: " 로 시작)\n\n## NEGATIVE\n(≤ 40단어, "Avoid " 로 시작하는 한 문장)\n\n## SCENE\n(≤ 40단어)\n\n'
            '## 컴파일 규칙\n\n' + guide_section(2) + '\n\n## filled.json\n\n```json\n' + filled_json + '\n```\n\n## scene_summary.md\n\n' + scene_summary)

def section(text, name):
    m = re.search(rf'^## {name}[^\n]*\n(.*?)(?=^## |\Z)', text, re.S | re.M)
    return ' '.join(m.group(1).split()) if m else ''

def fence(text, lang):
    m = re.search(rf'```{lang}\s*\n(.*?)\n```', text, re.S); return m.group(1) if m else None

def leaves(d): return sum(leaves(v) for v in d.values()) if isinstance(d, dict) else 1

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--image', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--model', default='claude-sonnet-5-5'); ap.add_argument('--thinking', default='adaptive', choices=['adaptive', 'off'])
    ap.add_argument('--max-fill-tokens', type=int, default=16000); ap.add_argument('--max-compile-tokens', type=int, default=6000)
    a = ap.parse_args()
    import anthropic
    client = anthropic.Anthropic(api_key=api_key()); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    kw = {'thinking': {'type': 'between_tools'}} if a.thinking == 'off' else {}

    def call(blocks, max_tokens):
        t0 = time.time()
        r = client.messages.create(model=a.model, max_tokens=max_tokens, messages=[{'role': 'user', 'content': blocks}], **kw)
        text = ''.join(b.text for b in r.content if getattr(b, 'type', '') == 'text')
        return text, round(time.time() - t0, 1), {'in': r.usage.input_tokens, 'out': r.usage.output_tokens, 'stop': r.stop_reason}

    # 1. 채움 (그림 + 서식 + 규칙 → filled.json, scene_summary.md)
    img = Path(a.image); media = mimetypes.guess_type(img.name)[0] or 'image/png'
    blocks = [{'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': base64.b64encode(img.read_bytes()).decode()}}, {'type': 'text', 'text': fill_prompt()}]
    text, t_fill, u_fill = call(blocks, a.max_fill_tokens); (out / 'response-fill.md').write_text(text, encoding='utf-8')
    js = fence(text, 'json'); md = fence(text, 'md') or fence(text, 'markdown') or ''
    if not js: sys.exit('채움 응답에 json 블록 없음 (response-fill.md 참고)')
    data = json.loads(js)
    (out / 'filled.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'scene_summary.md').write_text(md.strip() + '\n', encoding='utf-8')

    # 2. 컴파일 (채움만 → prompts.md; 우선순위 줄 포함)
    text, t_comp, u_comp = call([{'type': 'text', 'text': compile_prompt((out / 'filled.json').read_text(encoding='utf-8'), md)}], a.max_compile_tokens)
    (out / 'response-compile.md').write_text(text, encoding='utf-8'); (out / 'prompts.md').write_text(text.strip() + '\n', encoding='utf-8')
    frag = {k.lower(): section(text, k) for k in SECTIONS}
    frag['figure_extrapolated'] = frag['figure'].startswith('[EXTRAPOLATED]'); frag['figure'] = frag['figure'].replace('[EXTRAPOLATED]', '').strip()
    if frag['figure'].lower().rstrip('.') == 'none': frag['figure'] = ''
    frag.update({'template': 'lite-v0.1', 'model': a.model, 'thinking': a.thinking, 'leaves': leaves(data),
                 'words': {k.lower(): len(frag[k.lower()].split()) for k in SECTIONS},
                 'timing_seconds': {'fill': t_fill, 'compile': t_comp}, 'usage': {'fill': u_fill, 'compile': u_comp}})
    (out / 'fragments.json').write_text(json.dumps(frag, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps({k: frag[k] for k in ('leaves', 'words', 'timing_seconds', 'usage', 'figure_extrapolated')}, ensure_ascii=False))
    if not frag['priority'].startswith('Priority order:'): print('경고: PRIORITY 가 "Priority order:" 로 시작하지 않음', file=sys.stderr)

if __name__ == '__main__': main()
