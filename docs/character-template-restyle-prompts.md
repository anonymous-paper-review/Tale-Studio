# 캐릭터 템플릿 스타일 중립화 — GPT Image 프롬프트

> 2026-07-12. 배경: 캐릭터 턴어라운드가 애니풍으로 치우치는 원인 진단 결과,
> `public/character-template.png`의 치비 여우 마스코트·발바닥 아이콘·손글씨 폰트가
> 강한 스타일 앵커로 작용(1순위). 템플릿을 스타일 중립(레이아웃 전용)으로 교체한다.
>
> **I2I 권장** — 레이아웃이 보존돼야 (1) 서버 포트레이트 크롭 상대좌표
> (`src/lib/artist/portrait.ts`의 실측 비율)와 (2) 생성 프롬프트의 섹션 명단
> (`buildCharacterTurnaroundPrompt`)이 그대로 유효하다. T2I는 레이아웃이 새로 나와
> 크롭 좌표 재실측 필요(가능은 함 — Claude가 처리).

---

## 🅰️ I2I 프롬프트 (기존 템플릿 이미지 업로드 + 아래 프롬프트) — 추천

```
Restyle this character reference-sheet template into a completely style-neutral, professional studio version. This is a LAYOUT-ONLY edit — keep the exact same composition.

KEEP (do not move or resize anything):
- The exact layout, aspect ratio, and position/size of every section box, divider and panel
- The same section headings with the same wording: CHARACTER CONCEPT, COLOR PALETTE, SIZE GUIDE, TURN AROUND (FRONT / 3/4 FRONT / SIDE / 3/4 BACK / BACK), DETAIL POINT, SKETCH STYLE, DETAIL NOTES, FACE EXPRESSION GUIDE
- The off-white paper background and thin light-gray line borders
- The neutral human silhouette in the SIZE GUIDE

REPLACE:
- Every cute fox mascot placeholder figure → a featureless neutral-gray human artist's mannequin silhouette (like a wooden drawing mannequin), in the SAME pose, position and size as the figure it replaces — turnaround row (front, 3/4 front, side, 3/4 back, back), sketch-style row, and the bicycle illustration (make it a mannequin in the same dynamic riding pose)
- All paw-print icons next to headings → remove them (plain headings, no icons)
- The rounded handwritten/comic font → a clean, neutral, technical sans-serif in uppercase, like an industrial spec sheet

REMOVE:
- Any cute, kawaii, chibi, anime or mascot styling, and any decorative doodles

The result must be a monochrome (light gray on off-white), style-agnostic technical template that imposes NO art style on whoever fills it in. No added text, no new sections, no logos.
```

---

## 🅱️ T2I 프롬프트 (백지 생성 — 레이아웃 달라짐, 크롭 좌표 재실측 필요)

```
A professional, style-neutral character model-sheet template, landscape 16:9, flat vector-style graphic design on an off-white paper background with thin light-gray line borders. Monochrome, no colors except light gray.

Layout: left top — a large rounded rectangle panel titled CHARACTER CONCEPT; left bottom — three small vertical panels titled DETAIL POINT and a row of four featureless gray human mannequin silhouettes titled SKETCH STYLE. Center top — six small empty swatch squares titled COLOR PALETTE, and below it a SIZE GUIDE with horizontal height lines (180cm to 0cm) and one neutral human silhouette. Right top — a row of five featureless neutral-gray artist's mannequin silhouettes titled TURN AROUND, labeled FRONT, 3/4 FRONT, SIDE, 3/4 BACK, BACK. Right middle — an empty rounded panel titled DETAIL NOTES next to a panel with a mannequin in a dynamic action pose. Right bottom — six empty rounded squares in a row titled FACE EXPRESSION GUIDE.

Typography: clean technical uppercase sans-serif, like an industrial specification sheet. No icons, no mascots, no decorations, no anime or chibi styling, no watermark. The template must impose no art style — purely structural.
```

---

## 생성 후 핸드오프 (Claude 작업)

1. 결과 파일 경로 전달 (예: `/home/user/Downloads/새템플릿.png`)
2. Claude: 컨셉 박스 **크롭 좌표 검증/재실측** → 필요 시 `src/lib/artist/portrait.ts` 비율 갱신
3. `public/character-template.png` 교체(리사이즈 포함) + 커밋·푸시
4. (옵션 B, 권장) `buildCharacterTurnaroundPrompt`의 `"clean line art"` 제거 +
   `"do NOT use anime/chibi/mascot style"` + design_tokens 스타일 강조 — 템플릿 교체와 병행 시 효과 최대

## 참고

- ChatGPT가 3:2(1536×1024)로 출력해 비율이 살짝 달라져도 OK — 크롭은 상대좌표라
  레이아웃 구도만 유지되면 대응 가능.
- 진단 요약(기여도): ① 템플릿 여우 마스코트/장식(시각 앵커) ② 프롬프트 "clean line art"
  하드코딩 ③ 캐릭터 시트 장르의 모델 prior. 이 프로젝트 아트 디렉션은
  `industrial_dystopian_noir · weathered_industrial · 8:1` — 애니와 정반대.
