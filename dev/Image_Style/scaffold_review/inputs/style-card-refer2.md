# Artist Style Test #2 — refer2 (2026-07-23)

> 파이프라인 정본: `.claude/skills/artist-style-anchor/` — 2회차 실행. 입력: namu CDN 이미지 1장(361×511, webp→png).
> **한계 주지**: 입력 1장 → 콘텐츠/스타일 분리 신뢰도 낮음(권장 3~12장). 확정 레시피(장면=A, 인물=A+B) 사용.
> 원칙: 프랜차이즈/작가명 프롬프트 금지 · 마스크/로고/특정 의상 = Content-bound 제거 · 모작 가드 준수.

## 1. 계산 통계

| 항목 | 값 |
|---|---|
| 팔레트 | `#8f252b` 딥크림슨 12.5% · `#1d1917`/`#2a2a2b`/`#4b4f55` 블랙~차콜 39% · `#ebddc9` 웜크림 14% · `#935947`/`#432c2a` 웜브라운 23% · `#a7958a` 뮤트모브 11% |
| 채도 | 평균 36% (크림슨이 포화 포인트, 바탕은 다크 뉴트럴) |
| 명도 | 평균 48% (미드키 — 다크 그라운드 + 밝은 피부/글로우 팝) |
| 강엣지 | 17.4% (정밀 선화) · 플랫 블록 7% (그라디언트/텍스처 많음 — 플랫 스타일 아님) |

## 2. Style Card (14-facet)

- **매체**: 세미 페인터리 아니메 일러스트 — 정밀 다크 선화 + 2~3단 셀 셰이딩 + 소프트 에어브러시 그라디언트 + 글로시 페인티드 하이라이트 혼합. 상업 키아트급 마감
- **형태**: 우아한 장신 비율(약 7.5~8등신), 날렵한 턱선, 다이내믹 포즈, 레이어드 앙상블 구도
- **선**: 가는~중간 다크 선(다크브라운/블랙), 끝이 날카롭게 테이퍼, 머리카락은 유려한 가닥 클러스터
- **명암**: 미드키 고대비 — 딥 블랙 매스 + 밝은 피부 + 스포트라이트 글로우, 셀 그림자와 소프트 그라디언트 혼용
- **팔레트**: 딥크림슨 + 블랙/차콜 + 웜크림 + 웜브라운 + 뮤트모브, 골드 글로우 액센트 (hex 위 표)
- **조명**: 연극적 스포트라이트 — 상부 웜 글로우, 헤어/어깨 림라이트, 다크 배경 위 밝은 얼굴
- **가장자리**: 피규어 엣지 크리스프, 헤어 팁 면도날, 광 이펙트만 소프트 글로우
- **재질 규칙**: 금속=샤프한 스펙큘러 스트릭, 유리=밝은 글린트, 천=매끈한 폴드+크리스프 셀 그림자+글로시 다크 매스, 유기물=림라이트 엣지
- **질감**: 클린 디지털 + 은은한 에어브러시, 골드 보케 파티클, 종이결 없음
- **디테일 밀도**: 얼굴/헤어/손 고밀도, 의상 중(큰 다크 매스+선택적 디테일), 배경 저~중(추상 다크+글로우)
- **구도**: 방사형 앙상블 포스터, 겹침 깊이, 다크 프레임 + 웜 센터 글로우 — 비대칭 다이내믹
- **모티프(장식)**: 골드 보케 글로우 입자 산포 (supporting)
- **불완전성**: 없음 — 폴리시드 상업 마감

**Content-bound (중립화 제거)**: 마스크류, 특정 의상(롱코트·장갑 등), 로고/문양, 특정 캐릭터 얼굴·헤어 컬러 조합, 앙상블 인물 배치.

**캡슐**: semi-painterly Japanese anime illustration — crisp fine dark lineart with sharply tapered tips; two-to-three-step cel shading blended with soft airbrush gradients and glossy painted highlights; dramatic theatrical spot lighting (warm golden glow from above, bright rim light on upper edges, deep near-black shadows); palette of deep crimson #8f252b, near-black charcoal #1d1917 #2a2a2b, warm cream #ebddc9, warm brown #935947, muted mauve #a7958a on a dark ground with a warm glowing center; scattered soft golden bokeh glow particles in an uneven rhythm; polished commercial finish, no paper texture.

**인물 방언 절**: realistic elegant anime proportions (~7.5 heads) with long slim limbs; sharp tapered chin, refined jawline; large expressive anime eyes with bright saturated irises and crisp white specular glints; thin delicate nose, small mouth; hair as flowing layered strand clusters with razor-sharp tips and bright rim highlights; smooth skin with soft blush and one crisp cel shadow edge; confident poised attitude.

## 3. 생성 기록 (2026-07-23, gpt_image_2 · 1:1 · 2k)

| 산출물 | job id | refs | 결과 |
|---|---|---|---|
| anchor_board.png | 8fecfbf5-bad1-492a-9a67-0be3bdf30354 | `[refer2]` | ✅ **1회 통과** |
| test_character.png | (로그) | `[보드, refer2]` + 방언 절 (A+B) | ✅ 4.5/5 |
| test_cafe.png | (로그) | `[보드, refer2]` 장면 절 (A) | ✅ 4.5~5/5 |
| test_scooter.png | (로그) | `[보드, refer2]` 장면 절 (A) | ✅ 4.5/5 (바디가 살짝 3D-스무스 쪽) |
| test_action.png | (로그) | `[보드, refer2]` + 방언 절 (A+B) | ✅ **5/5** — 키아트 에너지 재현 최고 |

### 전이 검수 요약 (2026-07-23)

- **전이 성공**: 정밀 선화+셀·그라디언트 혼합, 연극적 웜 글로우+림라이트+딥 섀도, 골드 보케, 글로시 하이라이트 — 4프로브 전 표면에서 유지. 인물 방언(장신 우아 비율·유려한 가닥 헤어·스펙큘러 눈동자·날렵한 턱) 채택.
- **누수 게이트**: 4장 모두 통과 — 원작 앙상블 캐릭터·마스크·로고·텍스트 없음. 표준 콘텐츠(청록머리 배달원)는 원작 인물들과 비유사.
- **관찰 1 — 크림슨 약화**: 보드와 프로브 모두 "레드-블랙 펀치"보다 "웜 앰버 글로우"로 수렴. 원작의 크림슨-블랙 아이덴티티는 상당 부분 콘텐츠(브랜드) 결합 요소로 보이며, 중립 추출은 조명 드라마+마감을 가져감. 레드-블랙 축을 원하면 팔레트 텍스트로 후행 주입 가능(E 교훈: 팔레트=유저 파라미터).
- **관찰 2 — 파이프라인 일반화 입증**: refer1(플랫 벡터 팝)과 정반대 축(세미 페인터리 키아트)에서 보드 1회 통과 + 프로브 전 통과 — 스킬 레시피(장면=A, 인물=A+B)가 스타일 축에 무관하게 작동.

### 비용

보드 7 + 프로브 4×7 = **35크레딧** (refer2 런).

### 보드 QA (vision)

세미 페인터리(선화+셀·에어브러시 혼합+글로시 하이라이트) ✓ · 연극적 웜 글로우+림라이트+딥 블랙 ✓ · 재질 규칙(금속 스펙큘러 스트릭/유리 글린트/글로시 다크 천/림릿 유기물) ✓ · 불균일 골드 보케 ✓ · 정물 7요소 ✓ · 캐릭터/마스크/로고 누수 없음 ✓ · 비대칭 배치 ✓. **관찰**: 딥크림슨이 카드 스펙 대비 약함(웜 앰버 우세) — 사과·그림자에만 잔존. 프로브에서 2nd ref(원작) 보완 여부 관찰.
