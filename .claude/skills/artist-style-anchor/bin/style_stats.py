#!/usr/bin/env python3
"""artist-style-anchor 1단계: 계산 통계 패스.

사용법: python3 style_stats.py <image1> [image2 ...]
출력: 이미지별 지배 팔레트(hex+점유율)·HSV 통계·엣지 밀도·플랫 블록 비율 (markdown).
결정론적 — LLM 분석(2단계)의 접지(grounding) 입력으로 사용.
"""
import sys
import statistics
from PIL import Image, ImageFilter, ImageStat

W, H, BLOCK = 400, 225, 8


def analyze(path: str) -> None:
    im = Image.open(path).convert("RGB")
    small = im.resize((W, H))
    print(f"\n## {path}  (원본 {im.size[0]}x{im.size[1]})")

    q = small.quantize(colors=8, method=Image.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    print("| hex | 점유율 |\n|---|---|")
    for c, idx in counts:
        r, g, b = pal[idx * 3 : idx * 3 + 3]
        print(f"| `#{r:02x}{g:02x}{b:02x}` | {c / total * 100:.1f}% |")

    st = ImageStat.Stat(small.convert("HSV"))
    print(f"- 채도 평균 {st.mean[1] / 255 * 100:.0f}% (std {st.stddev[1] / 255 * 100:.0f})"
          f" · 명도 평균 {st.mean[2] / 255 * 100:.0f}% (std {st.stddev[2] / 255 * 100:.0f})")

    # Rec.709 상대휘도 — facet 템플릿 v1 '명암.키' 기준 (HSV V는 고채도 팔레트에서 부풀려짐)
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in small.getdata()]
    y_mean = sum(lum) / len(lum) / 255 * 100
    near_black = sum(1 for v in lum if v < 0.15 * 255) / len(lum) * 100
    key = "하이키" if y_mean >= 65 else "미드" if y_mean >= 40 else "로우키"
    print(f"- Rec.709 휘도 평균 {y_mean:.0f}% · 근흑(Y<15%) 면적 {near_black:.0f}% → 키 {key} (기준: ≥65 하이키 / 40~65 미드 / <40 로우키)")

    edges = small.convert("L").filter(ImageFilter.FIND_EDGES)
    strong = sum(1 for p in edges.getdata() if p > 60) / (W * H) * 100
    print(f"- 강엣지 픽셀 {strong:.1f}% (선 두께/윤곽 밀도 프록시)")

    g = small.convert("L")
    px = list(g.getdata())
    blocks = []
    for by in range(0, H - BLOCK, BLOCK):
        for bx in range(0, W - BLOCK, BLOCK):
            vals = [px[(by + y) * W + (bx + x)] for y in range(BLOCK) for x in range(BLOCK)]
            blocks.append(statistics.pstdev(vals))
    flat = sum(1 for b in blocks if b < 3) / len(blocks) * 100
    print(f"- 플랫 {BLOCK}px 블록 {flat:.0f}% (플랫 채움 비율 프록시 — 그라디언트/텍스처 많으면 낮음)")

    # v1.2 (2026-09-08) 추측 허용 규약 접지: 전역 밀도 프록시 + 판독 한계 참고. 전역 밀도는 '구도가 빽빽한가'이지 개체 하나의 묘사량(디테일.묘사 밀도)이 아니다.
    try:
        import numpy as np
        from scipy import ndimage
        w2 = 512; h2 = max(1, round(im.height * w2 / im.width))
        gray = np.asarray(im.resize((w2, h2), Image.LANCZOS).convert("L"), dtype=float)
        mag = np.hypot(ndimage.sobel(gray, axis=1), ndimage.sobel(gray, axis=0)) > 200
        lab, n = ndimage.label(mag, structure=np.ones((3, 3)))
        sizes = ndimage.sum(mag, lab, range(1, n + 1)) if n else []
        comps = int((np.asarray(sizes) >= 12).sum()) if n else 0
        q16 = np.asarray(im.resize((w2, h2), Image.LANCZOS).quantize(colors=16, method=Image.MEDIANCUT))
        regs = 0
        for c in range(16):
            m = q16 == c
            if not m.any(): continue
            l2, n2 = ndimage.label(m); s2 = ndimage.sum(m, l2, range(1, n2 + 1)); regs += int((np.asarray(s2) >= 16).sum())
        print(f"- 전역 밀도 프록시(512px 폭): 엣지 성분 {comps}개 = {comps / (w2 * h2 / 1000):.2f}개/1000px² · 16색 영역 {regs}개 "
              f"(참고: refer1 0.31·420 / refer5 0.31·417 / refer6 0.43·533 / refer4 0.51·536 / refer2 0.68·1864 — 구도의 빽빽함이지 묘사 밀도가 아니다; 묘사 밀도는 표본 개체 1개에서 센다)")
    except Exception as e:  # numpy/scipy 없으면 생략
        print(f"- 전역 밀도 프록시: 계산 생략 ({type(e).__name__})")
    W0, H0 = im.size
    print(f"- 판독 한계 참고: 원본 {W0}×{H0} — 화면 높이의 25% = {H0 * 0.25:.0f}px · 10% = {H0 * 0.1:.0f}px · 3px 선 = 폭의 {3 / W0 * 100:.2f}% "
          f"(얼굴 높이 = 화면 높이 비율 × {H0}; 눈 폭이 약 20px 아래면 홍채 단계·속눈썹 가닥은 판독 불가로 적는다)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: style_stats.py <image1> [image2 ...]")
    print("# 계산 통계 (style_stats.py)")
    for p in sys.argv[1:]:
        analyze(p)
