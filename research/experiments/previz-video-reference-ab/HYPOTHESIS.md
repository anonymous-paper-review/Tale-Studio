# 가설 — 블록아웃 프리비즈 영상 레퍼런스 (모션 전달 축 3암 A/B)

> **초안 2026-08-11 — 등록 대기.** 기각 bar 숫자([N] 표기)를 오너가 확정해야 사전 등록 성립.
> **2026-08-11 오너 지시: 등록 전 정성평가 선행** — sh_04_16 × 3암 × 1회 입력/출력 갤러리(`qualitative/`)로 육안 1차 후 bar·본실험 재론.
> 배경: 모션 채널 '전달' 미결의 제3후보. 계기는 외부 증언(반토막AI 데모, n=1), 성립 전제는
> 배선 실측(seedance `video_urls`). 경위·오염 논의 전문: `.claude/vault/2026-08-11-blockout-previz-video-reference.md`
> + 리포트 https://claude.ai/code/artifact/eeaf07e8-2708-4a0a-8d19-6fdb9d5caa82

- **가설**: 블록아웃 프리비즈 영상을 `video_urls` 레퍼런스로 병용하면(텍스트 계약 유지), 텍스트
  계약 단독 대비 **카메라 경로·타이밍 이행이 오르고 구도 드리프트가 준다** (Seedance 2.0 경로).
- **전제**: ① seedance-2.0/reference-to-video 스키마에 `video_urls` 실존(model-schemas.ts:28-39
  실측) — 단 의미론(참조 해석 방식)은 미검증 ② 텍스트 계약 방향 이행 6/6은 **happy-horse 실측**
  — Seedance 이식은 미검증(그래서 (a)암이 대조군 겸 이식 검증) ③ END 사진은 상태만 끌고 구도를
  흘림(previz-channel-ablation A2 기각②) ④ 외부 증언은 n=1 데모 — 마케팅 할인 ⑤ 블록아웃은
  3규칙(단순 도형만·색으로 종류 구분·역할 분리) 준수, previz 클립 길이 = 발주 duration 일치.
- **예측**: 참이면 — (c)의 경로·타이밍 이행률과 2AFC 선호가 (a) 초과, 구도 드리프트 감소, 도형·
  회색 질감 유출 0. 거짓이면 — 무증분, 또는 유출·배경 정체성 오염·스타일 오염 관측. 부수 판정:
  (a)가 happy-horse의 6/6을 재현 못 하면 "텍스트 계약 6/6"은 모델 종속 — 별도 결론으로 분리.
- **측정**: 픽스처 = ti2v-camera-cap-recheck 3샷 재사용(Sample2 6d66cacd — sh_04_16 질주/tracking
  7s · sh_01_02 발견 인서트/dolly_in 5s · sh_02_05 설정 와이드/pan 5s), 프롬프트는 제품
  buildVideoPrompt 전문 동결. 3암 **전부 Seedance 2.0 720p 통일**(모델 confound 제거): (a) 텍스트
  계약+START ref (b) (a)+END 크롭 (c) (a)+블록아웃 프리비즈 영상(`video_urls`). 각 3반복 = 27클립
  ≈ $46. 판정: 블라인드(암 은닉) 1fps 판독 — **상태 도달 / 구도 유지 / 경로 서술 3분리 라벨**
  (A2 혼합 지표 교훈 + framing_stability 4지선다 재설계) + 쌍대 2AFC((a)vs(c)). 지각은 LLM,
  채점은 코드. 요청 payload 전문 provenance.json. (b)암은 A2′ 재측정 겸용 — 분리 오라클로 A2
  기각②의 계기 교정 판정을 흡수.
- **기각 조건**: ① (c)의 주지표(경로·타이밍 이행) 증분이 (a) 대비 ≤ 0 → 제3후보 기각, 전달 축은
  텍스트 계약(+END 병용 여부는 (b) 결과로) 확정 ② 도형·질감 유출이 (c) 9클립 중 **[N]개** 이상 →
  이행과 무관하게 채택 불가(오염) ③ 스모크 단계 유출 2/2 → 본실험 진입 없이 조기 종료.

## 실행 계단 (조기기각 설계)

0. **Phase 0 — 제작 가능성 프로브** (등록 전 선행 가능, 크레딧 0): Blender headless(bpy)로 픽스처
   3샷의 카메라 절(모션 계약이 소비하는 dynamic_spec)에서 카메라 트랙을 코드로 유도 → 블록아웃
   mp4 3개. 판별 질문: "에이전트+코드만으로 샷당 재현 가능하게 나오는가?" 수동 개입이 과다하면
   채널 경제성 자체가 기각 신호(실험 무의미). 준비물: Blender 설치, fal storage 업로드 경로.
1. **스모크** (~$4): sh_04_16 × (a),(c) × 1회 — 유출·오염 육안 확인. 2/2 유출이면 종료.
2. **본실험** (~$46): 27클립 전체 + 블라인드 판독.

## 관련 좌표

- vault: `2026-08-11-blockout-previz-video-reference.md` (경위·오염 조건 논의) ·
  `2026-08-10-previz-motion-channel.md` §3.2 (전달 축 미결 본체) ·
  `2026-08-10-prompt-contract-audit.md` D-2026-08-10-b (판정 프레임 정본)
- 픽스처·판독 자산: `research/experiments/ti2v-camera-cap-recheck/` (probe.mts·provenance.json)
- 배선: `src/lib/fal/model-schemas.ts` (seedance video_urls) · `src/lib/video-models.ts` (refParam)
