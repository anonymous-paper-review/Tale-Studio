# (보존용) 2026-09-03 복원 이전의 SKILL.md 단계 2 — "약한 스캐폴드" 원문

> 기존 `artist_style_test_5/` 런(Claude 분석)이 사용한 스캐폴드. 세 번째 비교 조건(Codex + 약한 스캐폴드)이 필요해지면 이 텍스트를 [분석 지침]으로 사용.

## 단계 2 — facet 분석 → Style Card (LLM = Claude 수행)

레퍼런스 이미지를 Read로 보고 아래 1번의 14-facet 루브릭으로 분석. 출력 계약:

1. **facet별 통제 서술** (매체/형태/선/명암/팔레트hex/조명/가장자리/재질규칙/질감/디테일밀도/카메라/구도/모티프/불완전성)
2. **캡슐 2~3문장** — 앵커 보드 프롬프트용 rendering rules (재질 번역 규칙 포함: 금속/유리/천이 이 스타일에서 어떻게 그려지는가)
3. **인물 방언 절** (있으면) — 비율·이목구비·헤어 규칙. 앵커 보드가 못 나르는 부분이므로 캐릭터 프롬프트 텍스트 보강용으로 별도 기록
4. Core / Supporting / Content-bound 특징 3등급 분류 (Content-bound는 중립화에서 제거)

**금지**: 작가·프랜차이즈·작품 고유명사 — 부정문에 넣어도 생성기가 nsfw 거부 (2026-07-21 실측). 중립 서술어와 hex만.

**기본 포함 절 (E′ 실측 교훈, 2026-07-22)**: 모델은 지시가 없으면 **대칭 구조물·균일 선굵기·균등 장식 배치의 기본값으로 회귀**한다. 스타일이 비대칭/선 위계를 갖는다면 반드시 명시: ① "furniture, buildings, props and garments are never perfectly symmetric — nothing lines up in a perfect grid" ② 선화 3단계("outer silhouettes > object interior > background interior thinnest") ③ 장식 "uneven irregular rhythm, never evenly spaced".
