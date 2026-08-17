# t0-higgsfield-vs-pipeline-quality-gap — 힉스필드 직접 사용 대비 우리 영상 발주의 코드상 차이 확정

- status: `needs-owner` (사실 조사 완료 — 다음 단계는 오너 선택)
- source: `_INBOX.md` 2026-08-17 메모 "text to video로 힉스필드에서 돌릴떄랑 현재 v1,v2 writer 및 우리 워크플로우로 돌렸을때 퀄리티 차이가 존재하는데 뭐가문제인지 모름"
- run: 데모 실행(낮, 오너 요청 디버그) — provider claim·스냅샷 소비 표식 없음. 오늘 밤 정식 실행은 이 티켓을 연결만 하고 재조사하지 않는다.
- operation_key: `higgsfield-gap-code-trace-v1`
- 실행 주체: GJC 세션 + architect subagent 2개 (모델 `anthropic/claude-fable-5` — fable 금지 지시 **이전** 발주분. 이후 실행부터 금지 적용)
- 사람 보고서: `../reports/2026-08-17-inbox-debug.html`

## interpretation

오너가 Higgsfield 앱에서 직접 text-to-video를 돌린 결과와, tale-studio 워크플로우(writer v1/v2 → shots persist → `/api/director/generate-video` → fal)로 만든 영상의 품질 격차 원인을 모른다. 밤은 그림 판정을 하지 않으므로, "우리가 모델에 실제로 보내는 것"을 코드에서 전수 확정하고 격차를 설명할 수 있는 구조적 차이 후보를 사실/추정 구분으로 나열한다.

## observation (선기입 수용 기준 → 결과)

- 수용 기준 1: 운영 영상 발주의 유일 경로와 전송 payload 필드를 파일:줄 근거로 명세화 — **달성**
- 수용 기준 2: writer v1/v2 각각 장면 텍스트→프롬프트 재료 변환 체인과 손실 지점 목록 — **달성**
- 수용 기준 3: 유료 생성 0건, 코드 수정 0건 — **준수** (지출 $0)

## 확정 사실 (판정은 오너 몫, 아래는 코드 사실만)

1. 운영 유일 경로는 `/api/director/generate-video` → fal reference-to-video (I2V 지배). 기본 모델 `alibaba/happy-horse/reference-to-video`, 레퍼런스 없을 때만 kling v2.1 T2V 폴백. `src/app/api/director/generate-video/route.ts:143-188`, `src/lib/video-models.ts:52-127`
2. 영상 프롬프트 본문 = **이미지용 정적 first_frame 묘사문 재활용** (`shots.prompt` = composition_prompt ?? first_frame_prompt, `persist_manifest.ts:646-651,714-721`). v4가 설계한 `dynamic_spec.motion_prompt`(동작 묘사문 50~80자)는 운영 경로 어디서도 미소비 — 소비처는 프로덕션 도달 불가 v7뿐.
3. 프롬프트 캡: 계약문 있으면 950자(START/END 시 1200, veo 단축 시 1400), 없으면 500/800/1000 — 뒤쪽 파트(gear·cameraText)부터 절단. `video-prompt.ts:44-66`
4. `negative_prompt` 고정 4단어는 R2V 4모델 스키마 allowlist에 없어 무시(자체 레지스트리 `model-schemas.ts` 기준). 실효는 T2V 폴백뿐.
5. 오디오 전 모델 `audioDefault: true` — 주석 "전 모델 OFF"와 정반대. kling-o3는 키 이름도 `audio`(공식 `generate_audio`)로 무시 추정. `video-models.ts:38-41,60,71,83,95`
6. 해상도 `720p` 하드코딩(veo 4k 지원에도), aspect 16:9 하드코딩, 구조화 camera_control 미전송(카메라는 자연어만). `video-models.ts defaultResolution`, `director-store.ts:2379`
7. writer v2는 `dynamic_spec`에 자유 문자열 저장(`v2/persist.ts:122-126`) — `ShotDynamicSpec` 계약(enum+배열) 위반. `compileMotionContract`에 문자열 진입 시 TypeError 또는 static 접힘→"LOCKED tripod" 모순 계약문(런타임 재현은 미실행·추론).
8. 스타일 앵커/팔레트 텍스트는 영상 프롬프트에 미주입(gear 억제에만 사용), 대사도 미주입.

## 다음 관측 후보 (오너 선택)

- A/B 재현 실험(과금): 같은 shot 1개를 (a) 현행 payload (b) 동작 묘사문 주입 (c) 1080p로 3발주 → 오너 블라인드 비교. 예상 비용 < $3.
- 오너 제공 필요: Higgsfield 앱 쪽 사용 모델·해상도·프롬프트 원문 스크린샷 (밤이 접근 불가).
- v2 dynamic_spec 정규화 수리는 별도 티켓으로 분리 가능 (코드 확정 버그).
