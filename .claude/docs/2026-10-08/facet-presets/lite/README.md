# 경량 판 호출 계약 — 유저 이미지 1장 → facet 조각 4개 (lite v0.1, 2026-10-08)

참조 구현 `facet_lite_extract.py`(Python, Anthropic SDK). 제품(TypeScript)으로 옮길 때 아래 계약을 그대로 지킨다. 정본 규칙은 `.claude/skills/artist-style-anchor/scaffolds/facet-template-lite-v0.1.guide.md`(§1 채우기 8항 · §2 컴파일 12항 · 부록 A/B 스펙 · 부록 C 실행 메모).

## 입력

- 이미지 1장(PNG/JPEG/WebP, 제품 media 버킷의 것만 — `isOwnMediaUrl`). 해상도는 1024px 이상 권장(작으면 "판독 불가"가 늘어난다).
- 서식 `facet-template-lite-v0.1.jsonc` 전문(22KB, 주석이 곧 작성법 — **주석을 지우지 않고** 그대로 보낸다).

## 호출 1 — 채움

```
model: claude-sonnet-5-5
max_tokens: 16000
thinking: (기본, adaptive)          # 끄려면 {"type": "between_tools"} — "disabled"는 거부된다
messages: [{ role: "user", content: [
  { type: "image", source: { type: "base64", media_type: <mime>, data: <base64> } },
  { type: "text", text: <부록 A 스펙(코드블록 두 개로 답하라) + "## 채우기 규칙" + 가이드 §1 + "## 서식" + ```jsonc 템플릿``` > }
]}]
```

응답 파싱: 첫 ```json 블록 → `filled.json`(JSON.parse), 첫 ```md 또는 ```markdown 블록 → `scene_summary.md`. 실측 72초(생각 기본) / 44초(생각 끔), 입력 1.4만 · 출력 0.5~1만 토큰.

## 호출 2 — 컴파일

```
model: claude-sonnet-5-5
max_tokens: 6000                     # 4000이면 생각이 다 먹어 본문이 빈다
thinking: (기본)
messages: [{ role: "user", content: [{ type: "text", text: <부록 B 스펙(본문만 답하라) + 형식 + "## 컴파일 규칙" + 가이드 §2 + "## filled.json" + ```json 채움``` + "## scene_summary.md" + 요약> }]}]
```

응답 = 마크다운 본문, 헤더 5개 `## PROBE_ANCHORS` `## FIGURE` `## PRIORITY` `## NEGATIVE` `## SCENE`, 각 헤더 아래 문단 하나. 실측 26~35초(생각 기본), 입력 0.7만 · 출력 0.1~0.5만 토큰.

## 출력 — `fragments.json`

```json
{
 "template": "lite-v0.1", "model": "claude-sonnet-5-5", "thinking": "adaptive", "leaves": 96,
 "probe_anchors": "…",            // "Style anchors: " 뒤에 싣는다 (≤110단어)
 "figure": "…",                   // "Figure rules: " 뒤에 싣는다 (≤150단어). [EXTRAPOLATED] 토큰은 뺐다
 "figure_extrapolated": true,     // 인물 표본 0 → 인물 절이 외삽(관찰된 선·채움 문법만)
 "priority": "Priority order: a → b → c",   // 부정 절 바로 앞
 "negative": "Avoid …",           // 한 문장 (≤40단어)
 "scene": "…",                    // 기록용 — 프롬프트에 싣지 않는다
 "words": {...}, "timing_seconds": {"fill": 67.6, "compile": 35.0}, "usage": {...}
}
```

## 검증 (기계, 실패 시 1회 재시도 → 그래도 실패면 facets 없이 저장)

1. `filled.json` 파싱 성공 · 리프(문자열 값) 수 = 96 · 모든 값의 첫 토큰이 `[실측] [추정] [외삽] [해당 없음]` 중 하나.
2. 헤더 5개 모두 존재, 각 문단 비어 있지 않음(FIGURE는 `[EXTRAPOLATED]`일 수 있음).
3. 단어 상한: PROBE_ANCHORS ≤ 110 · FIGURE ≤ 150 · PRIORITY ≤ 30 · NEGATIVE ≤ 40 · SCENE ≤ 40. 실측(앵커 12장, 생각 기본)에서 상한을 넘긴 것은 FIGURE 155 · PRIORITY 32 · SCENE 42~44처럼 10% 안이었으므로 **상한의 110%까지는 통과**, 그 밖이면 재시도(생각을 끈 호출은 크게 넘긴다 — 앵커 151·인물 170).
4. `priority`가 "Priority order:"로 시작, `negative`가 "Avoid "로 시작.
5. 고유명사(작가·작품·브랜드·캐릭터) 금지는 모델 규칙에 맡기되, 조각을 로그에 남겨 사람이 훑을 수 있게 한다. hex 코드(`#rrggbb`)는 정상이다.

## 조립

README §4와 같다: 역할 문장 → `Style anchors: {probe_anchors}` → 본문 → 표면 가드 → (인물 장면) `Figure rules: {figure}` + 표정 우선 문장 → `{priority}` → `{negative}` → 꼬리. 참조는 앵커(유저 이미지) 1장.

## 시간·비용

끝에서 끝까지 1.5~2분(추출) + 생성 2분. 이미지당 토큰 약 2.2만 입력 · 1~1.5만 출력. 요청 응답 안에서 기다리지 말고 비동기 작업으로.
