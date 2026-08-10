# 가설 — shotCheck 출력 다이어트 (2026-08-10)

- **가설**: shotCheck 단일 콜의 지배 항은 *출력 생성*이다 (실측: in 617k자 / out 34k자에 153.5s, fan-out 회차는 out 148k자에 850.8s — 시간이 입력이 아니라 출력에 붙는다). 분할안(`new_shots`)이 통짜 `ShotSequenceItem[]` 이라 모델이 부모와 동일한 S/C/V/assets/continuity 블록을 자식마다 통째로 재출력한다. `buildSplitChildren` 이 이미 누락 블록을 부모에서 결정론 상속하므로(`ns.X ?? original.X`), 자식당 **실제로 다른 필드만** 내게 하면 판정을 바꾸지 않고 출력만 줄어든다.
- **전제**: 입력은 절대 건드리지 않는다. fan-out 회차의 반증 — 입력 컨텍스트를 자르면(씬 단위 절단) 프롬프트 문구가 같아도 모델 판정 분포가 바뀌었다(이슈 57→170, 연속성 13→97). **출력 스키마 변경도 같은 위험을 갖는다**고 가정하고, 판정 불변을 사전 등록 가드로 건다.
- **예측**: 참이면 — ① 벽시계 **≥30% 단축** ② 이슈 수가 같은 fixture 베이스라인 대비 **±30% 이내** ③ 분할 수 ±30% 이내 ④ 자식 액션 개별화 유지(형제 간 `S.character_action` 이 서로 다르고 비어 있지 않다).
- **측정**: fixture 고정 = `logs/e4da245a-8d89-44e5-8fde-131d016ef2e3` 의 11_v4_shotDesign(157샷)·05_s3_scenes(15씬)·09_v2_design·10b_c_decoupage + INTEGRATED(genre/characters). 제품 `runShotCheck` 직접 호출(복붙 없음), 베이스라인(현행 스키마) vs 다이어트 스키마 각 N회. 수확 = 벽시계 · 출력 문자 수 · 이슈 수/카테고리 · 분할 수 · 형제 액션 개별화.
- **기각 조건**: 이슈 수 폭증(> +30%) → "출력 형태가 판정을 흔든다" — 다이어트 폐기. 분할 퇴화(형제 `S.character_action` 이 동일하거나 공백) → 폐기. 벽시계 단축 < 30% → 이득 없음, 폐기(복잡도만 추가).

좌표: 모델 축 = C축 기본값(claude-sonnet-4-6) · fan-out 게이트 off(모놀리스 경로) · 출력 `results-baseline.json` / `results-diet.json`.
