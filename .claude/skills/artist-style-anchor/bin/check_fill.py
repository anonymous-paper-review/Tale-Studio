#!/usr/bin/env python3
"""채움 검사 — 추측 허용 규약 (facet-template-v1.2.guide.md §4 12~18항, §5 (e)~(k)).

  check_fill.py <filled.jsonc|json> [-o report.md]

종료 코드 1 = 위반(고쳐야 함) · 0 = 통과(경고는 남을 수 있음). 결정론적 — LLM이 채운 값을 기계로 되묻는 단계.
검사: (e) 판독 한계·묘사 밀도 존재와 등급 형식 (f) 개수 리프의 세지 않은 범위·열린 상한 (g) 등급 1~2에서 많음·높음·다수
      (h) 값 안의 나열 6항목 이상 (i) 속성형 부호의 결속 위치 서술 (j) 등급 1~2에서 정교화 부정 절 비어 있음 (k) 장문·장르 선험 어휘"""
import argparse, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from facet_template import strip_comments

COUNT_LEAVES = [  # 개수·단계·가닥·돌기·부호·조각 — §4 14항 대상
    ('그림체', '선', '내부선', '양'), ('그림체', '채움', '채움색 수'), ('그림체', '채움', '면별 명도', '단계 수'), ('그림체', '명암', '단계 수'),
    ('그림체', '형태', '돌기', '양'), ('그림체', '형태', '돌기', '개수'), ('그림체', '색', '액센트 규칙', '입도'), ('그림체', '색', '액센트 규칙', '개수'),
    ('재질', '헤어', '구축'), ('재질', '헤어', '외곽'), ('인물', '헤어 구축'), ('인물', '눈', '디테일'), ('인물', '눈', '속눈썹'), ('인물', '눈', '공막·글린트'),
    ('장식', '개수'), ('장식', '점유율'), ('디테일', '반복 요소', '반복 상한'), ('디테일', '스케일 LOD', '클로즈업'), ('디테일', '스케일 LOD', '원경 인물'),
]
SKIP_ENUM = ('생성 규칙', '분류', '입력')  # 나열 검사 제외 가지(부정 절·분류·게이트는 목록이 본업)
TAG_RE = re.compile(r'^\s*\[(실측|추정|보정|외삽|해당 없음)\]')
OPEN_RE = re.compile(r'(\d+\s*(?:개|줄|색|단|가닥|묶음|조각|명)?\s*(?:이상|\+))|수십|수백|다수의|무수')
RANGE_RE = re.compile(r'(?<![#\w])(\d+)\s*~\s*(\d+)(?!\s*px|\s*%|\s*:|\s*배|\s*등신|\s*단계 어둡)')
MANY_RE = re.compile(r'많음|높음|다수|풍부|조밀')
GENRE_RE = re.compile(r'보통|일반적으로|전형적|흔히|typical|usually')


def get(d, path):
    for k in path:
        if not isinstance(d, dict) or k not in d: return None
        d = d[k]
    return d


def walk(d, prefix=()):
    for k, v in d.items():
        p = prefix + (k,)
        if isinstance(v, dict): yield from walk(v, p)
        elif isinstance(v, str): yield p, v


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('file', type=Path); ap.add_argument('-o', '--out', type=Path)
    a = ap.parse_args()
    text = a.file.read_text(encoding='utf-8')
    data = json.loads(strip_comments(text)) if a.file.suffix == '.jsonc' else json.loads(text)
    viol, warn = [], []
    def V(p, msg, v=''): viol.append((('.'.join(p)) if isinstance(p, tuple) else p, msg, v[:110]))
    def W(p, msg, v=''): warn.append((('.'.join(p)) if isinstance(p, tuple) else p, msg, v[:110]))

    # (e) 판독 한계 · 묘사 밀도
    sz = get(data, ('입력', '판독 한계', '주체 크기'))
    if not sz: V('입력.판독 한계.주체 크기', '없음 — 주체의 픽셀 크기를 먼저 적는다(§4 12·16항)')
    elif 'px' not in sz: V('입력.판독 한계.주체 크기', 'px 값 없음', sz)
    if not get(data, ('입력', '판독 한계', '최소 판독 크기')): V('입력.판독 한계.최소 판독 크기', '없음')
    grade_s = get(data, ('디테일', '묘사 밀도', '등급')) or ''
    m = re.search(r'[1-5]', grade_s)
    grade = int(m.group(0)) if m else None
    if grade is None: V('디테일.묘사 밀도.등급', '등급 1~5 없음(§4 12항)', grade_s)
    counts = get(data, ('디테일', '묘사 밀도', '실측 개수')) or ''
    nums = re.findall(r'\d+', counts)
    if len(nums) < 4: V('디테일.묘사 밀도.실측 개수', f'센 값이 {len(nums)}개 — 표본 개체 1개의 여섯 값을 실제로 센다(§4 14항)', counts)
    if '표본' not in counts: V('디테일.묘사 밀도.실측 개수', "표본 지목 없음('표본 = …')", counts)
    if OPEN_RE.search(counts): V('디테일.묘사 밀도.실측 개수', '열린 상한(이상·수십)은 센 값이 아니다', counts)

    # (f)(g) 개수 리프
    for p in COUNT_LEAVES:
        v = get(data, p)
        if not isinstance(v, str): continue
        t = TAG_RE.match(v); tag = t.group(1) if t else None
        if tag == '해당 없음': continue
        if OPEN_RE.search(v): V(p, "열린 상한('N개 이상'·'수십') — 센 값으로 바꾼다(§4 14항)", v)
        r = RANGE_RE.search(v)
        if r:
            lo, hi = int(r.group(1)), int(r.group(2))
            if tag in ('추정', '외삽', None) and hi > lo: V(p, f'세지 않은 범위 {lo}~{hi} ([{tag}]) — 표본을 지목해 실제로 센 값 하나로(§4 14항)', v)
            elif tag == '실측' and hi - lo >= 4 and '표본' not in v: W(p, f'범위 {lo}~{hi}가 두 표본을 센 값인지 확인(표본 지목 없음)', v)
        if grade is not None and grade <= 2 and MANY_RE.search(v): V(p, f'등급 {grade}인데 많음·높음·다수(§4 12·15항)', v)
    # (h) 나열 · (k) 장문·장르 선험 · 태그 누락
    for p, v in walk(data):
        if p[0] in SKIP_ENUM: continue
        body = TAG_RE.sub('', v)
        items = [s for s in re.split(r'[,·]\s*|\s/\s', body) if s.strip()]
        if len(items) >= 6: W(p, f'나열 {len(items)}항목 — 4항목까지(§4 15항)', v)
        if len(v) > 200: W(p, f'{len(v)}자 — 장문(§4 13항 외삽·해석은 한 줄)', v)
        if GENRE_RE.search(v): W(p, "장르 선험 의심 어휘('보통·전형적·흔히')(§4 17항)", v)
        if not TAG_RE.match(v) and not v.startswith('ex.'): W(p, '신뢰도 태그 없음(§4 6항)', v)
    # (i) 속성형 부호
    bt = get(data, ('장식', '어휘', '결속 유형')) or ''
    if '속성형' in bt:
        layer = get(data, ('장식', '레이어')) or ''
        if re.search(r'머리|두상|결속|head', layer): V('장식.레이어', "속성형 부호의 결속 위치 서술('머리 뒤·위 결속') — 복제 지시가 된다(§4 17항, §6 21)", layer)
        vocab = get(data, ('장식', '어휘', '부호 목록')) or ''
        if re.search(r'고리|광륜|헤일로|명찰|halo', vocab): W('장식.어휘.부호 목록', '속성형 부호(고리·광륜·명찰)가 어휘에 남아 있는지 확인 — Content-bound 후보로', vocab)
    # (j) 정교화
    el = get(data, ('생성 규칙', '부정 절', '정교화')) or ''
    if grade is not None and grade <= 2 and (not el or '해당 없음' in el): V('생성 규칙.부정 절.정교화', f'등급 {grade}인데 정교화 부정 절 비어 있음(§4 18항, §6 18)', el)
    if grade is not None and grade >= 4 and el and '해당 없음' not in el: W('생성 규칙.부정 절.정교화', f'등급 {grade}에서는 [해당 없음]이 기본', el)
    core = get(data, ('분류', 'Core')) or ''
    if grade is not None and grade <= 2 and not re.search(r'단순|적음|없음|최소|매끈|sparse|few', core): W('분류.Core', f'등급 {grade}인데 Core 첫 항목에 단순함이 없음(§4 18항)', core)

    lines = [f'# 채움 검사 — {a.file.name}', '', f'- 묘사 밀도 등급: {grade if grade is not None else "?"} · 위반 {len(viol)} · 경고 {len(warn)}', '', f'## 위반 ({len(viol)}) — 고쳐야 한다']
    lines += [f'- `{p}`: {m}' + (f' — 값: `{v}`' if v else '') for p, m, v in viol] or ['- 없음']
    lines += ['', f'## 경고 ({len(warn)})'] + ([f'- `{p}`: {m}' + (f' — 값: `{v}`' if v else '') for p, m, v in warn] or ['- 없음'])
    rep = '\n'.join(lines) + '\n'
    if a.out: a.out.write_text(rep, encoding='utf-8')
    print(rep if not a.out else lines[2])
    sys.exit(1 if viol else 0)


if __name__ == '__main__':
    main()
