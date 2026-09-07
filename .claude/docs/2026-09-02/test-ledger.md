# 테스트 원장 — 2026-09-02

파일 226 · 케이스 1699(정적 계수 — 반복·표 주도 케이스는 1로 잼) · 머리말 없는 파일 179

한 파일이 여러 묶음에 속하면 아래 표에서는 각각 세고, 본문에서는 첫 묶음에 한 번만 실고 제목에 다른 소속을 적는다.

| 묶음 | 파일 | 케이스 | 설명 |
|---|---:|---:|---|
| writer | 44 | 332 | Writer 파이프라인·러프 previz·샷·단계 전환 |
| producer | 23 | 133 | Producer 입력·게이트·핸드오프·참조 가져오기 |
| artist | 29 | 244 | Artist 이미지·자산·출처·생성 실패 처리 |
| director | 28 | 333 | Director 캔버스·샷·영상 생성 |
| editor | 22 | 171 | Editor·내보내기·미디어 저장 |
| security | 13 | 147 | 권한·입력 경계·red-team 방어 회귀 |
| reference | 5 | 26 | 참조 프로젝트 가져오기 계약 |
| unsorted | 63 | 403 | core 에 들어가지만 어느 도메인 스위트에도 안 잡히는 테스트 — 분류 부채 |
| manual | 12 | 22 | 실제 API·Fal·라이브 스키마가 필요한 수동 테스트 |
| experimental | 1 | 0 | 실험용 파이프라인 검증 — 기본 테스트에 포함하지 않음 |

## writer — Writer 파이프라인·러프 previz·샷·단계 전환

### tests/adherence-core.test.ts (10)
> 생성물 정합 검사 코어(#adherence P2, 2026-08-07) 회귀 — 순수 판정만(IO 없음).
- 액션·인원·초점을 판정 가능한 claim 으로 조립한다
- 무인물은 empty scene 으로 명시(인물 유무가 흔한 불일치 축)
- static/handheld_drift/rack_focus 는 카메라 정지 취급
- large 는 카메라 magnitude 또는 인물 large 어느 쪽이든 잡는다
- 방향성 이동만 directional 로 표시(정지·무방향 제외)
- dyn 없음 → null (검사 불가 — skipped 경로)
- 정지 계약 + 큰 diff = over_motion (증상: static 인데 움직임)
- large 설계 + 작은 diff = under_motion (증상: 시간 대비 변화 없음)
- 정지 + 미세 diff(생명감) = ok — 얼어붙음을 강요하지 않는다
- 화면 기준 양방향 서술(중의성 제거)

### tests/camera-contract-default.test.ts (4) — director 에도 속함
> 카메라 규율 계약의 기본 팔 잠금(#camera-contract-relax 2026-08-11).
- env 미설정 = 완화본(relaxed-v3) — 2026-08-11 승격
- legacy 로만 옛 문구가 나온다 (되돌림 스위치 생존)
- 과거 실험 팔(relaxed / relaxed-v2)이 여전히 재현된다
- 모르는 값은 옛 문구로 새지 않는다 (기본과 같게 동작)

### tests/facet-render.test.ts (7)
> (머리말 없음)
- returns the same hash for the same spec and a different hash when facets change
- renders deterministically and includes shot type and blocking vocabulary
- 결정론적이고, 연필이 못 옮기는 채널(렌즈·DoF·조명·색·초점)을 담는다
- 시트가 이미 운반하는 채널(블로킹 pose/gaze·프레이밍 레이어·소품)은 제외한다
- facet 부재는 조용히 건너뛴다(빈 spec → 빈/짧은 라인, 예외 없음)
- falls back to the deterministic template when injected LLM rendering throws
- uses the template and does not call the injected LLM when FACET_RENDER is off

### tests/motion-contract-duration.test.ts (9) — director 에도 속함
> (머리말 없음)
- 긴 샷에는 "느리게 하지 말라"를 명시한다
- 짧은 샷도 자연 속도 원칙 — 스트레치 지시가 주 슬로모 경로였다 (#d3 오너 실측)
- 같은 spec 이라도 길이가 다르면 계약문이 달라진다
- 큰 동작은 긴 샷이어도 여파 문구를 덧붙이지 않는다 — 이미 화면을 채운다
- magnitude 자체는 손대지 않는다 — 연출 의도를 앱이 바꾸지 않는다
- 결정론 유지 — 같은 입력이면 같은 계약문(LLM 없음)
- 같은 character_id 의 2동사는 then 으로 이어지고 순서 문장이 붙는다
- 다른 인물의 동사는 병렬 나열 그대로다
- 긴 샷의 small 첫 동사라도 뒤에 같은 인물 동사가 이어지면 aftermath tail 이 없다

### tests/motion-contract.test.ts (11) — director 에도 속함
> 영상 모션 계약(#motion-contract 2026-08-07) 회귀.
- static 카메라 → LOCKED 계약 + cameraStatic=true (증상①의 처방)
- handheld_drift 는 이동 없음 취급(cameraStatic=true) + 여행 금지 문구
- pan 방향은 시야·화면 콘텐츠 양방향으로 못박는다 (증상②의 처방)
- duration 스케일 + 완료 조항이 실린다 (증상③의 처방)
- 시선 arc·환경 변화도 계약에 실린다
- 금지절(계약 외 카메라·인물·액션 지어내기 금지)이 항상 붙는다
- dyn 미전달 → 빈 계약 (레거시 경로 불변)
- P0: 정지 계약이면 START/END 수렴 지시가 "구도 유지" 분기로 바뀐다
- 이동 계약이면 기존 연속 이동 수렴 지시 유지
- 계약문이 프롬프트 맨 앞에 실린다
- dynamicSpec 미전달 → 기존 프롬프트와 완전히 동일 (레거시 불변)

### tests/motion-vocabulary.test.ts (20)
> 모션 어휘 교정(#motion-vocab 2026-08-11) 회귀.
- pan_right → type "pan" + direction "right" 을 되살린다 (방향을 버리지 않는다)
- 업계 통용어를 정본으로 접는다
- 정본 9종은 손대지 않고 그대로 통과한다
- 못 알아본 유형은 static 으로 접지 않고 원문을 유지한다
- 카메라 스케일 낱말 "moderate" 를 인물 스케일 "medium" 으로 맞바꿔 받는다
- 미상·누락은 최소가 아니라 medium 으로 둔다 (동작이 삼켜지지 않게)
- 진짜 최소를 뜻하는 낱말은 micro 로 남는다
- 정본 입력은 교정 기록이 비어 있다
- 한 번 교정한 값을 다시 통과시켜도 같다 (소비처가 몇 번 불러도 안전)
- 교정한 내용을 사람이 읽을 수 있게 남긴다 (조용한 열화 금지)
- 명시된 direction 이 유형에서 떼어낸 방향보다 우선한다
- pan_right 이어도 pan 전용 절 "회전만 — 카메라는 이동하지 않는다" 가 살아남는다
- pan_right 은 정지 계약이 아니다
- 인물 magnitude "moderate" 가 "미세한 움직임" 으로 뒤집히지 않는다
- tracking 은 pan 과 반대로 "카메라가 실제로 이동" 을 명시한다
- pan_right 이 더 이상 전 축 0 으로 떨어지지 않는다
- pan_right 도 방향 판정 대상에 들어온다 (검수기가 눈을 감지 않는다)
- 정본 9종을 하나도 빠뜨리지 않고 싣는다 (말줄임표로 끝나던 자리)
- 두 스케일의 가운데 낱말이 다르다는 것을 명시한다
- 방향을 유형 이름에 붙이지 말라고 못박는다 (pan_right 의 직접 처방)

### tests/pipeline-progress.test.ts (26)
> (머리말 없음)
- 생성 중 패널이 없으면 null (전부 완료 = 핀 해제)
- 생성 중이면 완료/전체/실패 개수를 파생한다
- 액션 없는 샷은 생성 자격이 없어 분모에서 빠진다
- 생성 중이면 done/total 을 담은 진행 핀을 세운다
- 확정 대기(awaiting_confirmation)면 핀을 안 세운다 — 정지 상태라 가짜 진행 문구 금지
- 완료·실패·미시작·null 은 핀이 없다
- total_units 가 0 이면 분수를 숨긴다(스피너만)
- writer 러프는 이전 완료 샷을 제외하고 진행 중 묶음에만 합산한다
- director 촬영용 그림도 같은 묶음 규칙을 쓴다
- director 영상도 기존 완료 take를 새 묶음에 섞지 않는다
- 초기 잠금 구간: 활동 증거(큐 또는 in-flight)가 있을 때 서버 집계 ready/total 노출
- D13: 아무것도 안 돌면 미완성 프로젝트여도 "생성 중" 핀을 세우지 않는다 (0/N 상시 고착 수리)
- stalled/failed 로 큐가 멈추면 "진행 중"이 아니므로 null
- 잠금 해제 후엔 in-flight 재생성 개수로만 뜬다
- 생성 중 샷이 없으면 null
- 생성 중이면 샷 노드만 세어 완료/전체를 파생 (다른 노드 무시)
- 생성 중 비디오 노드가 있을 때만 완료/전체/실패를 파생
- 러프: 화면 상태가 전부 미생성이어도 큐에 잡이 있으면 진행 중으로 뜬다
- 러프: 큐가 비면 다시 null (완료 후 알림바가 스스로 사라진다)
- director 실사: 큐의 writerShotId 로 생성 중을 복원한다
- director 영상: 노드가 아직 없어도 큐 개수만으로 알림바를 세운다
- artist: store in-flight 가 비어도 큐 개수가 있으면 진행 중
- 배치 전 구간에서 분모가 전체 작업량(제출분+잔량)으로 유지된다
- 잔량 없이(단건 재생성 경로) 쓰면 종전 동작 그대로다
- 0건인 종류는 줄을 만들지 않는다
- 종류별로 담당 에이전트 이름과 색(stage)을 붙여 세운다

### tests/pipeline/asset_refs.test.ts (5)
> (머리말 없음)
- builds canonical registry from S2 + L2
- recovers version-suffixed character refs (the _v1/_v2 bug)
- drops invented refs that match no real asset
- resolves canonical (Korean) location ids exactly
- normalizes the real shot sequence: only canonical refs survive + locations recovered via scene fallback

### tests/pipeline/shot_design_concurrency_ab.test.ts (1)
> shotDesign 병렬화 A/B 실험 하네스(#parallel-shotdesign 2026-07-21).
- concurrency를 올리면 wall-clock이 줄고, 샷 수·shot_id 순서는 불변이다

### tests/pipeline/shot_design_resume.test.ts (13)
> shotDesign 씬 단위 이어달리기(#A) + 샷 청크 분할(#B) 계약 검증 (long-writer-run 2026-07-15).
- 예산 없으면 전 씬 완주(done=true), 씬당 1호출(소형 씬)
- softDeadline이 이미 지났어도 패스당 최소 1씬은 처리하고 부분 반환한다
- resume이 주어지면 완료 씬을 건너뛰고 이어서 생성한다
- 씬의 데쿠파주 샷이 청크 크기를 넘으면 청크 단위로 나눠 호출하고 병합한다
- 청크 크기 이하 씬은 단일 호출(기존 동작 보존)
- 케이스 ⑤: 샷 id 키 맵(배열 래핑, 2026-07-15 실측 shape)을 순서대로 평탄화한다
- 케이스 ⑤: 단일 객체 id 맵도 파싱한다
- 기존 케이스(①~③) 회귀 없음
- 해석 불가 shape은 throw
- 첫 응답이 비정형이면 1회 재시도 후 성공한다
- 2회 연속 비정형이면 그 씬에서 throw(스테이지 실패로 표면화)
- 샷 수 대량 소실(기대 4 → 1)은 재시도 후에도 수용하지 않고 표면화한다
- 경미한 샷 수 어긋남(기대 4 → 3)은 재시도 후 수용하고 배지로 남긴다

### tests/prompt-trace.test.ts (4)
> 프롬프트 트레이스 선택(#debug-prompts 확장) 회귀 — 샷 매칭 3경로 + kind 별 최신 1건 +
- 영상 잡: full_prompt=최종, prompt=소스, motionContract 분리 추출
- 그리드 잡은 writerShotIds[]/shotIds[] 로도 매칭된다
- kind 별 최신 1건만 — 최신순 입력에서 첫 매칭 채택
- 다른 샷 잡·미허용 kind·빈 프롬프트는 제외

### tests/rough-frame-cycle-urls.test.ts (4)
> (머리말 없음)
- frames가 있으면 start→direction→end 3장, 캐시버스트 쿼리 포함
- frames가 없는 구버전 패널은 단일 주소로 떨어진다
- 세 프레임 전부 썸네일 주소가 되고 ?v= 쿼리가 보존된다 (ThumbImage 경유 계약)
- v 없으면 그대로, 있으면 ?v= 를 붙이고 기존 쿼리에는 & 로 잇는다

### tests/rough-grid-crop-label-invasion.test.ts (3)
> (머리말 없음)
- 드리프트·라벨 밴드가 있어도 프레임은 스펙 셀 내부 크기로 상시 균일
- 캔버스가 요청과 다른 크기로 와도(리샘플) 비례 좌표가 절대 좌표를 유지한다
- 레거시(null 포맷)는 종전 적응형 경로 유지 — 레거시 비례 시트 파스

### tests/rough-regenerate-inflight-block.test.ts (8)
> (머리말 없음)
- force + 특정 샷이면 막고 있는 잡을 fal 진실로 회수한다
- 회수로 종결된 샷은 in_flight 집합에서 빠져 같은 요청에서 제출된다
- 회수 실패는 삼키고 기존 중복 방지는 유지한다
- reconcile 이 원본 빈 message 대신 합성 증거를 넘긴다
- message 가 비어도 status 가 남아 종결 가드를 통과한다
- 클릭 유래(force) 요청이 전부 막히면 스피너를 풀고 안내한다
- 안내 문구가 한국어 사전에 있다
- 자동 경로는 여전히 조용하다 — 진짜 생성 중 표시를 지우지 않는다

### tests/rough-spec-shape-guard.test.ts (5)
> #v2-rough-500 (2026-08-17) 회귀 가드.
- rich 스펙(framing.layers·character_blocking)은 통과한다
- writer-v2 previz 스펙은 rich 가 아니다 → db_fallback 경로
- framing 은 있으나 layers 가 없으면 rich 가 아니다
- character_blocking 이 배열이 아니면 rich 가 아니다
- null·원시값은 rich 가 아니다

### tests/rough-storyboard-quota-gate.test.ts (3)
> (머리말 없음)
- quota 거절이면 프로젝트/DB 조회 전에 429 를 반환한다
- 전역 슬롯(scope=global) 거절도 429 로 표면화한다
- quota 통과면 429 를 내지 않는다(이후 project not found 로 404)

### tests/rough-storyboard-zoom-shortcuts.test.ts (2)
> (머리말 없음)
- 보드의 Ctrl/Command + 키만 한 단계씩 조절한다
- 최소·최대에서 더 내려가거나 올라가지 않는다

### tests/rough-template-assets.test.ts (7)
> (머리말 없음)
- 포맷 템플릿 8장: 존재 + 치수 = 스펙 캔버스
- 스키마 준수: 캔버스 16배수 · 최대 변 3840 · AR ≤3:1 · 총 0.66~8.29MP
- 레거시 템플릿 2장: 실측 좌표의 기준 치수 그대로 (1672×941 / 488×941 — null 포맷 전용)
- 셀 비례 좌표: 0~1 범위 + 인접 셀 사이 거터 (크롭 불변식 "거터=빈 종이")
- 16:9 grid4: 러프 캔버스는 1728×768(검증 대역), 리페인트는 2880×1280(#hd-grid)
- 세로 스트립만 frameAxis cols — 나머지는 rows
- 셀 종횡비 = 포맷 정확값 (±1% — 레거시 16:9 셀의 -13.2% 오차를 반복하지 않는다)

### tests/rough-v2-cell-direction.test.ts (4)
> #v2-cell-dedup (2026-08-17) 회귀 가드.
- 같은 유닛 공통값이라도 previzDirection 이 다르면 셀 서술이 갈라진다
- previz 카메라 무브가 MOTION 재료가 된다 — static hold 균질화 방지
- previzDirection 이 없으면 기존 서술 그대로다 (레거시 무변화)
- rich spec 이 있으면 previzDirection 은 무시된다

### tests/shot-design-resolve.test.ts (4)
> 샷→설계 해석 가드(#split-spec 2026-08-10) 회귀 — 실측 버그(e1a9fd08 sh_03_15) 방어.
- design_ref 가 있으면 ref 로만 조인한다
- ref 체계 프로젝트에서 ref 없는 샷(분할 자식)은 main-id 폴백 금지 — 옆 설계 도난 방지
- ref 가 있는데 설계가 없으면 null — main-id 로 새지 않는다
- 레거시 프로젝트(전 샷 ref 없음)는 main-id 직조인 유지

### tests/stage-errors.test.ts (9)
> (머리말 없음)
- network — 429/타임아웃/네트워크/5xx 는 예산 무차감 재시도 클래스 (오너 정책 확장)
- LLM 출력 형태 실패(JSON/계약)는 transient — 재샘플이 고칠 수 있다
- 결정 오류 — DB 제약/권한/결제/모더레이션은 permanent
- 모르는 오류는 transient — 1회 재시도 후 표면화 (비용 상한 있음)
- transient 첫 시도(count=1) 실패는 자동 재시도한다
- 두 번째(count=2)부터는 표면화 — resume 버튼이 사람 방아쇠
- permanent 는 첫 시도도 재시도하지 않는다
- network 는 이 예산 경로가 아니다 — 러너의 무차감 경로(캡 소진 후엔 즉시 표면화)
- 안전핀 캡은 양수, 백오프는 지수 증가 후 15s 상한

### tests/stage-shortcuts.test.ts (6)
> (머리말 없음)
- Alt + 1~5 가 STAGES 순서와 1:1 로 대응한다 (넘패드 포함)
- 모디파이어가 없으면 발화하지 않는다 (그냥 타이핑)
- Ctrl/Cmd/Shift 가 섞이면 양보한다 — 브라우저·선택 조작의 몫
- 할당되지 않은 키는 무시한다
- e.key 가 아니라 code 로 판정 — macOS 의 Option+숫자(¡™£…)도 잡힌다
- macOS 는 Option, 나머지는 Alt 로 표기

### tests/stage-transition.test.ts (11)
> (머리말 없음)
- 스테이지 경로를 파이프라인 순서로 해석한다
- 쿼리·하위 경로가 붙어도 startsWith 로 매칭된다
- 비스테이지 경로는 -1
- 순방향(파이프라인 진행)은 forward — 오른쪽에서 들어온다
- 역방향은 back — 왼쪽에서 들어온다
- 초기 진입(이전 없음)·같은 stage·비스테이지는 연출 없음
- 새 template 마운트(resolveStageCommit)로 즉시 해소된다
- 커밋이 늦으면 타임아웃으로 해소 — VT 가 화면을 오래 얼리지 않는다
- resolve 는 1회용 — StrictMode 이중 effect 의 두 번째 호출은 무해
- VT 미지원 환경(node)에서는 그냥 이동한다
- 방향이 없으면 연출 없이 이동한다

### tests/storyboard-real-cineline.test.ts (5)
> REAL 리페인트 프롬프트의 시네 라인 주입(#viz-gap 2026-08-07) 회귀.
- cineLines 미전달 시 현행 프롬프트와 완전히 동일하다(라이브 무변경)
- cineLines 전달 시 컬럼 번호로 라인을 붙이고 포즈·구도 보호 가드를 명시한다
- 빈 라인만 있으면 블록을 넣지 않는다
- cineLine 미전달 시 현행과 동일
- cineLine 전달 시 시네 채널 + 포즈 보호 가드를 붙인다

### tests/v2design-image-trigger.test.ts (4)
> (머리말 없음)
- calls triggerAssetDrafts after design_tokens and asset persists
- fails the v2Design step when persistDesignTokens rejects
- absorbs triggerAssetDrafts rejection after both persists
- writer/start after() no longer imports or calls the draft trigger

### tests/writer-appearance-selection.test.ts (9)
> (머리말 없음)
- selects the one appearance matching the scene narrative time
- falls back to the unique overall default when no time matches
- rejects a zero-match scene without a unique overall default
- rejects multiple matching appearances without one matching default
- selects the only default among multiple matching appearances
- lets a valid explicit override win over the narrative-time match
- rejects an override that is not one of the character appearances
- treats nested flashbacks as relative to the fixed story present
- does not use time_of_day to resolve an appearance

### tests/writer-chat-id-resolve.test.ts (5)
> 채팅 샷 id 관용 해석(#p4-understand A2, 2026-08-06) 회귀.
- 실재 id 는 그대로 통과한다
- 레거시 shot_N 을 전역 번호로 메인 id 에 매핑한다
- 구 프로젝트(레거시 행)에선 메인 표기를 레거시로 역매핑한다
- 위치형 지칭을 씬 순서 × 씬 내 순서로 해석한다
- 해석 불가는 null — 호출자가 skipped 로 표면화한다

### tests/writer-chat-updates.test.ts (13)
> (머리말 없음)
- keeps dialogue spec fields (emotion/delivery/durationHint) and drops unknown/invalid extras
- strips malformed dialogueLines entries and drops non-array dialogueLines
- keeps existing shot field validation behavior
- keeps existing scene field validation behavior
- applies same-length, longer, and new dialogue patches
- requires confirmation when the next dialogue array is shorter
- passes valid line refs and strips invalid labels or empty refs
- returns an empty array for non-arrays and caps output at 200 entries
- 발명 id 는 걸러지고 정본만 남는다 + dropped 수집
- 전부 발명 id 면 characters 필드 자체가 빠진다 (씬 상속 폴백)
- charactersPresent(씬)와 dialogueLines 화자도 같은 집합으로 거른다
- allowed 미지정이면 종전 동작 — 무필터 (구 클라 하위 호환)
- 명시적 빈 대사 배열([])의 "전체 삭제" 의미는 필터와 무관하게 보존된다

### tests/writer-dialogue-join.test.ts (5)
> 샷 ↔ 대사 조인 정합 (#dialogue-join 2026-08-10) — 회귀 방지.
- ① 오배치 0 — 모든 샷이 자기 소스의 대사를 물고, 씬도 일치한다
- ② 형제는 첫 자식만 상속 — 둘째 자식은 빈 대사
- ③ 분할 0이면 종전(직접 id 조인)과 동일
- ④ source_shot_id 없는 구 시퀀스는 직접 id 조인으로 폴백
- 대사 트랙이 없으면 빈 맵

### tests/writer-dialogue.test.ts (20)
> 대사 스테이지(#dialogue-v4) 단위 테스트 — 샷 집합 계약·메모리 누적·부분 진행·장애 흡수.
- 'dialogue'가 유효 탭으로 통과한다 (준비 중 시절 가드 잔존 시 탭 클릭 무시 사고)
- 누락 샷은 침묵으로 채우고 여분 샷은 버린다 (순서 = decoupage)
- 빈 line·배열 래핑·공백 내레이션을 정규화한다
- shots 없는 응답은 throw
- 응답에 없던 샷을 missing_shot_ids 로 표면화한다 (침묵 vs 소실 구분)
- 전 샷이 응답에 있으면 missing_shot_ids 를 달지 않는다
- 누적 + 미제공 필드는 유지
- 슬라이딩 윈도우 — 사실 12·대사 10 유지
- 프로파일 1회 + 씬별 호출, 메모리가 다음 씬 프롬프트에 반영된다
- 씬 호출 2회 실패 → 그 씬만 침묵 흡수, 파이프라인은 계속
- softDeadline 경과 시 체크포인트 반환(done=false) → resume이 이어간다 (프로파일 재사용)
- 첫 씬은 빈 메모리 (선행 씬이 없으므로 유도할 것도 없다)
- 선행 씬들의 dialogue_summary 를 확립 사실로, 직전 씬 감정 끝을 관계 상태로 유도한다
- notable_lines 는 항상 비어 있다 — 사전 유도 불가가 병렬화의 유일한 대가
- 확립 사실은 순차 체인과 같은 유계 계약(최근 12개)을 지킨다
- 전 씬을 호출하고 출력은 원래 씬 순서로 병합된다 (결정론 병합)
- 기본값이 병렬+원장이다 (2026-08-11 채택 — opts 없이 호출해도 원장이 주입된다)
- ledger=true 면 선행 씬 요약이 프롬프트에 들어간다 (순차 메모리의 대체재)
- ledger=false 면 확립 사실이 비어 프롬프트에 선행 씬이 없다 (바닥 대조군)
- 병렬에서도 씬 실패는 그 씬만 침묵 흡수 (순차와 같은 계약)

### tests/writer-duration-reallocation.test.ts (15)
> 인지 부하 기반 시간 재배분(#p2-pacing 2026-08-04 → #duration-surgery 2026-08-31 개정) 회귀.
- 대사 있는 2초 샷은 실발화+0.5s 로 증액된다 (이중 여백 폐지)
- 과대 배정은 ceil(needed)+slack 까지 감액된다 (양방향 밴드)
- pacing_intent='long_take' 는 감액을 면제받는다 (연출 의도 보존)
- dynamic_spec 이 있으면 동사별 magnitude 를 실제로 읽는다
- 신규 인물 첫 등장 샷은 가산받고, 재등장은 가산 없다
- 초장문 대사도 상한(10s)을 넘지 않는다
- 라틴 스크립트는 빠른 발화 속도로 계산된다
- 같은 씬 3단계↑ 점프는 WARNING, 씬 경계는 무시한다
- 인서트 복귀 문법(MS→ECU→MS)은 면제된다
- 같은 씬에서 to→from 이 끊기면 WARNING, 이어지면 무경고
- 씬 경계와 arc 미출력(분할 자식·구 산출)은 건너뛴다
- 실측 재현: 시선 비트 정지 단독 샷 + 반응 없는 다인 비트 → 경고 2건
- 시선을 따라가는 카메라 무브 또는 뒤따르는 reveal/reaction 샷이 있으면 무경고
- source_beats 미운반(구 산출·분할 자식)은 판단하지 않는다
- "전당포 노인" 캐릭터가 산문의 "노인이"로, "추적자들"이 "추적자가"로 잡힌다

### tests/writer-lane-checkpoint.test.ts (6)
> shotsAndDialogue 합성 step 의 유료 호출 보존 계약(2026-08-11).
- 남은 예산이 부족하면 shotCheck 를 시작하지 않고 shotDesign 을 체크포인트한다
- 예산이 충분하면 그대로 이어서 shotCheck·renderPrompts 까지 간다
- 예산이 없으면(로컬 러너) 게이트가 걸리지 않는다
- 대사 레인이 실패해도 비주얼 레인 산출물을 버리지 않는다 (throw 없음)
- 비주얼 레인이 실패해도 대사 레인 산출물을 버리지 않는다
- 진전이 0 인데 레인이 실패하면 표면화한다 (무한 재시도 방지)

### tests/writer-moderation-fallback.test.ts (14)
> 모더레이션 폴백(#moderation-fallback 2026-08-05) 회귀 — 실측 2d47b311: gemini 하드 필터
- gemini PROHIBITED_CONTENT → claude 로 같은 콜 재시도 (maxTokens 바닥 16k)
- gemini 의 다른 오류는 폴백 없이 그대로 던진다
- claude 프로바이더 오류엔 폴백하지 않는다
- 접지 콜은 gemini(접지 모델 핀)로 먼저 간다 — claude 를 거치지 않는다
- 접지 모델이 죽으면(예: preview 소멸 404) claude 로 폴백한다
- 접지 콜이 아니면 gemini 실패에 claude 폴백하지 않는다
- 접지 콜도 손실 복구 재호출 보호를 받는다 (종전엔 early return 이라 건너뛰었다)
- 무손실 복구(펜스 제거·잉여 문자 삭제)는 종전대로 값을 돌려준다
- 잘린 응답은 LossyRepairError 로 던지되 살아남은 값을 실어 보낸다
- 비-strict repairJson 의 계약은 그대로다 (기존 호출자 무영향)
- 손실 복구가 감지되면 같은 질문을 한 번 다시 던진다
- 재호출도 잘리면 살아남은 값으로 진행한다 (종전과 동일한 최악치)
- 재호출이 다른 오류로 죽으면 그 오류를 표면화한다
- 손실 복구가 없으면 재호출하지 않는다

### tests/writer-n1-continuity.test.ts (4)
> n−1 연속성 주입(#n-1 2026-08-05) 회귀 — PREVIZ#2 "shot이 자기 자신만 참조" 해소.
- 직전 K=2개의 first_frame/motion 만 실린다
- 직전 샷이 없으면 빈 문자열 — 첫 청크는 기존 프롬프트 그대로
- 그리기 금지를 명시하고 110자에서 클립한다
- 이전 텍스트가 없으면 null — 셀은 그대로

### tests/writer-persist-guard.test.ts (6)
> persist DB 쓰기 가드(#persist-guard 2026-07-31) — supabase-js 는 에러를 throw 하지 않고
- shots insert 가 error 를 반환하면 throw 한다 (조용한 0행 금지)
- shots delete 가 error 를 반환해도 throw 한다
- 정상 경로 — 에러 없으면 delete → insert 순으로 완료된다
- delete 는 source=pipeline 으로 스코프된다 — 수동 샷은 재런에서 살아남는다
- 파이프라인 insert 행은 source=pipeline 을 명시한다
- 생존 수동 샷과 shot_id 충돌 시 수동이 이긴다 — 파이프라인 행 스킵 + 경고 표면화

### tests/writer-previz-enrich.test.ts (10)
> previz 정보 강화(#previz-enrich ①+③, 2026-08-07) 회귀 — lab/viz-gap previz A/B 검증 후 이관.
- START 에 조명 방향 해칭 + 그림자 반대 방향 + 초점 디테일 지시가 실린다
- END 에도 동일 조명·초점 지시가 실린다(같은 조명 셋업 유지)
- hard 조명은 crisp 엣지로 서술한다
- KEY/카메라/FOCUS/색온도 라벨을 DIRECTION(motion)에 싣는다
- 색온도 버킷: 5500K 초과는 COOL, 4000~5500 은 NEUTRAL
- 정적 샷도 라벨은 실린다(static hold 유지 + 라벨 병기)
- blocking+레이어 셀은 동일 대상 명시 + moment 만 언급된 인물 off-screen 금지를 싣는다
- 스펙 없는 fallback 셀은 기존 인원수 고정 가드를 유지한다(#split-spec)
- 해칭·라벨 지시가 전혀 실리지 않는다
- 말미 금지 조항이 DIRECTION 행의 기술 라벨을 정식 허용한다

### tests/writer-rerun-consent.test.ts (5)
> (머리말 없음)
- holds the initial Producer-to-Writer run behind a proposal until approval
- runs the handoff directly without a second approval card when the explicit button consents
- speaks an honest failure message when the approved handoff fails
- turns completed-run 409 into a consent proposal without rerunning
- sends rerun consent with the explicit rerun flag and keeps cancellation side-effect free

### tests/writer-shotcheck-reconcile.test.ts (3)
> (머리말 없음)
- 입력 shotDesign 1개당 ShotSequenceItem 정확히 1개, 입력 순서 보존
- 렌더 프롬프트(first_frame/motion)를 L4에서 그대로 확보한다 — v5_prompts가 최우선 소비
- 씬 목록에 없는 scene_id여도 죽지 않고 L4 intent 기반으로 채운다

### tests/writer-shotcheck-wiring.test.ts (19)
> shotCheck 배선 수정(#p2-wiring 2026-08-04) 회귀 — 진단: lab/previz-quality/REPORT.md
- 데쿠파주 beat native 가 최우선으로 character_action 이 된다
- native 부재 시 beat EN, beat 부재 시 motion_prompt, 최후에만 dramatic_purpose
- design_ref 와 static_spec 원본이 아이템에 부착된다
- CRITICAL/WARNING+constraint 만 부착되고 INFO·constraint 부재는 제외된다
- 글 전용 constraint는 shotCheck 보고서에만 남고 check_notes에는 부착하지 않는다
- 분할 자식은 _splitFrom(부모 id)으로 부모의 제약을 상속한다
- 매칭 이슈가 없으면 샷은 그대로다
- F1: 분할 부모의 action_budget 제약은 자식에게 상속되지 않는다 (분할이 곧 수정)
- design_ref 는 첫 자식만 — 둘째는 부분 상속 스펙을 받는다 (#split-inherit: 훔치지도 굶기지도 않는다)
- 모델이 new_shots 에 design_ref 를 에코해도 무시된다 — provenance 는 시스템 소유 (실측 92948d6f)
- S 누락 자식은 자기 모션 서술로 표시문이 개별화된다 (T4)
- S2: 둘째의 산문 채널은 부모 통짜 상속 금지 — 델타 없으면 빈다 (부모 START/전체모션은 자식에 거짓)
- S3: 둘째의 dynamic_spec 은 축소 계약 — 카메라·환경 유지, 인물 동사·시선 아크 제거, 모션 산문은 자기 것
- S3: 전환 재배치 — transition_in 은 첫째만, transition_out 은 막내만
- S1: 둘째의 blocking pose 는 자기 액션 텍스트로 — 부모의 순간 자세를 물려받지 않는다
- 1자리 번호도 메인 포맷으로 — 한 프로젝트 두 체계 공존 결함 재발 방지
- 정상 배열에서 constraint 문자열만 추출한다
- 배열이 아니거나 깨진 값은 빈 배열 — 프롬프트는 원문 유지
- 제약이 있으면 프롬프트 꼬리에 한 줄로 첨부된다

### tests/writer-start-rerun-payload.test.ts (1)
> (머리말 없음)
- builds rerun input from scenes, shots, chat, and producer decisions

### tests/writer-status-assets.test.ts (6)
> (머리말 없음)
- adds opt-in assets with partial producer-character completion
- marks stalled for R3 dead-end: $name (표)
- counts stuck queued draft jobs as failed, not queued
- grandfathers existing images and main candidates as ready
- degrades asset query errors to zero assets without failing status
- does not compute assets or query supabase without ?assets=1

### tests/writer-ui-store.test.ts (1)
> (머리말 없음)
- keeps supported tabs (dialogue 활성화됨 #dialogue-v4) and falls back for malformed values

### tests/writer-v0-style-anchor.test.ts (2)
> v0 스타일 앵커 연결 (2026-07-14, docs/style-anchor-art-style-authority.md §9-2 후속)
- 앵커 있으면 프롬프트에 매체-고정 제약 블록이 들어간다
- 앵커 없으면 프롬프트에 앵커 블록이 없다 (기존 동작 보존)

### tests/writer-v2-semantic-unit.test.ts (3)
> (머리말 없음)
- accepts a complete unit with production references and previz direction
- rejects a unit that hides missing asset references
- rejects duplicate semantic and shot identifiers

## producer — Producer 입력·게이트·핸드오프·참조 가져오기

### tests/card-mention.test.ts (15)
> (머리말 없음)
- uses the name when present, type as hint
- gives unnamed cards a fallback label and keeps stable ref
- disambiguates multiple unnamed of same type with an index
- backgroundMentions falls back for unnamed backgrounds
- extracts refs for @mentions present in the text
- returns empty when the mention is removed
- does not confuse a prefix label with the longer indexed one
- handles multiple distinct mentions
- appends the token to empty input
- appends after existing text with a single separating space
- removes the token on re-toggle and tidies whitespace
- is prefix-safe: toggling L5 never touches L51
- labels carry no internal ids — refs alone stay distinct
- keeps Director Previz and Real references separate
- only returns a label for a known modifier-click target

### tests/cast-slug.test.ts (3)
> (머리말 없음)
- snake_cases ascii names
- strips non-ascii (한글) and falls back to char
- keeps existing characterId and dedupes generated collisions

### tests/chat-choices.test.ts (5)
> 채팅 선택지 파서(#p4-choices 2026-08-06) 회귀 — [CHOICES] a | b | c 추출·제거.
- 선택지를 추출하고 본문에서 그 줄을 제거한다
- 마커가 없으면 원문 그대로, 선택지 빈 배열
- 공백으로 둘러싸인 슬래시도 선택지 구분자로 읽는다
- 후보가 2개 미만이면 무시한다 (버튼 1개는 선택지가 아님)
- 후보는 최대 4개로 자른다

### tests/chat-persistence-drafts.test.ts (2)
> (머리말 없음)
- 새로고침 후 선택지를 라벨만 복원하고 실행 가능한 action 은 복원하지 않는다
- 깨진 내부 표식은 화면에 노출하지 않고 조용히 버린다

### tests/content-safety-hint.test.ts (5)
> (머리말 없음)
- 미성년+위해 조합이면 risky (2026-06-28 실패 케이스)
- 미성년만 있고 위해 없음 → not risky
- 위해만 있고 미성년 없음 → not risky
- 둘 다 없음 → not risky
- 영어 혼합도 감지

### tests/handoff-intent.test.ts (9)
> (머리말 없음)
- 제안 버튼이 보내는 문장은 반드시 인식된다 (버튼 = 타이핑 동치)
- 사용자가 자기 말로 요청해도 같은 판정을 탄다
- 이동 동사가 없으면 평범한 요청이다
- 대상 언급이 없으면 평범한 요청이다
- 범용 동사(진행·시작)는 이동으로 치지 않는다
- 한 칸 앞으로만 — 건너뛰는 대상은 인식하지 않는다
- 핸드오프가 정의되지 않은 stage 는 항상 null — editor 가 마지막이다
- writer → artist 도 커버한다
- 대소문자·공백에 흔들리지 않는다

### tests/handoff-nudge.test.ts (3)
> (머리말 없음)
- 아직 그 스테이지까지만 도달했으면 띄운다
- 다음 스테이지에 이미 도달했으면(수락됨) 다시 띄우지 않는다
- reached 가 from 보다 뒤(비정상)여도 안전하게 띄운다

### tests/handoff-soft-warning.test.ts (4)
> (머리말 없음)
- producer → writer still blocks when a hard field (background) is missing
- producer → writer: missing subGenre/tone(soft) still offers the handoff proposal with a quality warning
- writer → artist: no scenes/shots (soft) still hands off with a quality warning in the reply
- artist → director: characters with only a main view (soft) still hands off with a quality warning

### tests/output-language.test.ts (11)
> (머리말 없음)
- en: 영어 강제 절 — 생성기 필드 예외 조항 포함
- 영문 대문자 시작 규칙 포함(오너 지시 2026-08-31)
- ko: 한국어 강제 절
- 미지정(레거시): 빈 문자열 — 종전 프롬프트 바이트 불변
- en 은 wpm 기준, ko/미지정은 음절 기준(종전 유지)
- 잠긴 프로젝트: 잠긴 값이 출력 언어, 재잠금 없음
- 레거시(unlocked): 스토리 감지값을 쓰고 그 값으로 잠근다 — 종전 산출과 동일
- 잠겼는데 locale 값이 미상: 미주입(undefined) — 절 없이 종전 관례
- 파싱: 4개 값만 통과, 그 외·미지정은 undefined(레거시 = 출력 언어 추종)
- 절: 설정 시에만 발화 필드 덮어쓰기 문구, 미지정은 빈 문자열(무주입)
- 발화 속도: 대사 언어 우선, 미지정이면 출력 언어 기준(종전)

### tests/parse-extracted-settings.test.ts (8)
> (머리말 없음)
- trailing fenced json: extracts settings, reply is clean prose
- unfenced trailing json object does not leak
- mid-message fenced json (text after the block) does not leak
- multiple fenced blocks: none leak, last valid extracted wins
- malformed json inside fence does not leak (block stripped, settings empty)
- uppercase JSON fence label is handled
- unterminated fence (token cutoff) leaves no fence marker or json in reply
- plain reply with no json returns text untouched and empty settings

### tests/pending-proposal-store.test.ts (6)
> (머리말 없음)
- post-handoff overwrites become a pending proposal instead of mutating source immediately
- pre-handoff empty/fill updates still apply directly
- reports rejected when the proposal slot is already occupied
- accepts a Director storyboard image proposal and only calls the generation path after approval
- rejects a Director image proposal with no executable updates
- keeps one pending proposal at a time

### tests/pending-proposal.test.ts (4)
> (머리말 없음)
- accepts compact Korean and English approvals
- rejects negative or unrelated messages
- creates serializable proposal payloads
- formats impact bullets for proposal cards

### tests/produce-reference-digest.test.ts (4) — reference 에도 속함
> (머리말 없음)
- returns prompt shape and provider usage without exposing the prompt
- appends a read-only reference block after current project context
- silently omits a missing or unauthorized reference digest
- warns on system digest failure but keeps chat available

### tests/producer-chat-sync.test.ts (6)
> (머리말 없음)
- overwrites a pipeline placeholder ("미정") appearance directly when not user-edited
- removes a stale card directly when not user-edited
- merges two cards (remove loser + update survivor) in one patch
- gates overwrite of a user-edited card value behind the approval proposal
- gates deletion of a user-edited card behind the approval proposal
- still fills an empty field on a user-edited card without gating (no clobber)

### tests/producer-draft.test.ts (5)
> (머리말 없음)
- returns null for non-object / malformed payloads
- parses a well-formed draft and coerces fields
- returns db board unchanged when no draft exists
- restores the draft when DB is empty (the re-entry bug fix)
- merges writer-origin DB cards that are absent from the draft

### tests/producer-gate.test.ts (15)
> (머리말 없음)
- blocks when a hard setting is missing
- blocks when story is not ready
- reports empty tone/subGenre as SOFT only (not blocking)
- D1 (10s) allows zero cast
- D3 (120s) requires at least one person
- D3 person missing arc/want is blocked
- object only needs name + appearance even at D3
- D4 (600s) recommends a second person as SOFT
- requires at least one complete background source card
- ignores an incomplete writer-origin person (partial writer run addition)
- ignores writer-origin backgrounds for the min-complete requirement
- still requires a producer-origin background (writer-only backgrounds do not satisfy)
- 스타일 미선택이면 다른 항목이 다 차 있어도 막힌다
- 미지정(undefined)도 미선택과 같다
- 스타일이 선택되면 통과한다

### tests/producer-handoff-gate.test.ts (2)
> (머리말 없음)
- blocks handoff and never calls writer/start when no complete background exists
- proceeds past the gate and starts the writer when a complete background exists

### tests/producer-ref-fill.test.ts (4)
> (머리말 없음)
- fills an unnamed cast card by ref — no duplicate
- fills an unnamed background card by ref — no duplicate
- disambiguates: ref targets the exact unnamed card among several
- named edits still match by name (no regression)

### tests/producer-system-prompt.test.ts (0)
> (머리말 없음)

### tests/project-reference-gate.test.ts (8) — reference 에도 속함
> (머리말 없음)
- rejects unauthenticated callers before reading workspace state
- fails closed when the slot RPC fails
- blocks a free workspace at its one-project limit
- fails closed on an unexpected RPC status without leaking a project
- routes reference selection through the server helper for an open plan
- keeps the old body-less call working with the Untitled title
- locks the locale only when the account actually stored one
- locks the locale when user_metadata carries a real setting

### tests/reference-digest.test.ts (4) — reference 에도 속함
> (머리말 없음)
- rechecks owner and plan, then serializes the source project within 1500 characters
- returns null for another owner or a plan without reference access
- throws system query failures so the chat route can warn and continue
- reads only the current project reference pointer

### tests/reference-import-plan-limits.test.ts (3) — reference 에도 속함
> (머리말 없음)
- %s plan has %i project slots (표)
- fails closed to the free limit for unknown plans
- opens reference import only for plans with at least two slots

### tests/reference-import.test.ts (7) — reference 에도 속함
> (머리말 없음)
- rejects a source project outside the requester workspace without revealing it
- rejects a closed plan after rechecking the source workspace owner
- copies a custom anchor and the selected last-shot storyboard start frame internally
- uses rough storyboard frames when the final storyboard has no start frame
- warns and never copies an external custom-anchor URL
- turns storage copy failures into warnings instead of throwing after insert
- turns source scene lookup failures into frame warnings

## artist — Artist 이미지·자산·출처·생성 실패 처리

### tests/artist-appearance-patch.test.ts (6)
> (머리말 없음)
- 유효한 외형 문자열 → ok + trim
- 문자열 아님/누락 → 거부
- 빈 문자열/공백만 → 거부(외형 비우기는 이 경로로 불가)
- 최대 길이 초과 → 거부
- 최대 길이 경계는 통과
- body 자체가 객체 아님 → 거부

### tests/artist-background-source.test.ts (4)
> (머리말 없음)
- builds a Producer-only world prompt when no writer scene exists yet
- keeps the person exclusion scoped to background prompts
- adds writer scene context when available for regeneration prompts
- marks explicit generation as user-edited but leaves auto first-fill unmarked

### tests/artist-chat-updates.test.ts (15)
> (머리말 없음)
- 자동 허용 type 화이트리스트 = createCharacter / createAppearance / regenerate* 만
- F6: 기존 캐릭터 외형(원천) 변경 update 는 거부(드롭)
- 알 수 없는/비객체 type 거부
- regenerateCharacter(파생 이미지) 통과 + 잘못된 view 필터
- AC13: regenerateCharacter 의 instruction(유저 델타) 통과
- regenerateCharacter — characterId 없으면 드롭
- createCharacter(신규 생성) 통과 — appearance 는 신규에만 허용(원천 변경 아님)
- regenerateWorldAsset(파생) 통과 / locationId 없으면 드롭
- 혼합 입력 — 허용분만 통과, 외형변경은 섞여 있어도 드롭
- 유효한 model 키는 통과한다
- 무효한 model 값은 드롭한다(오타·임의 endpoint 주입 차단)
- model 없으면 필드 자체가 없다(라우트 기본 모델 사용)
- changeAppearance → 제안으로 추출 (자동경로 아님)
- validateUpdates 는 여전히 changeAppearance 를 자동경로에서 거부(F6 불변)
- characterId/appearance 누락 시 제안 드롭

### tests/artist-gate-copy.test.ts (10)
> (머리말 없음)
- stalled 와 failed 를 한 조건으로 묶어 같은 문구를 쓰지 않는다
- 지연 전용 문구가 존재하고 한국어 사전에 등록돼 있다
- 실패 문구는 그대로 실패라고 말한다
- 복귀 시 DB 를 재수화하고 최근 완료·미반영 잡을 보고한다
- 추가 완료 조회는 복귀 1회 opt-in 이고 4초 active 폴링에는 붙지 않는다
- 실패·지연 판정 순간 토스트를 띄운다
- 토스트 문구가 한국어 사전에 있다
- Artist 게이트 폴러가 탭 복귀에 재조회한다
- Writer 진행 폴러도 탭 복귀에 재조회한다
- 화면을 계속 보고 있어도 매달린 요청을 끊고 다음 폴링을 예약한다

### tests/artist-lock-gate.test.ts (10)
> (머리말 없음)
- blocks only artist navigation until artistImagesReady
- lets grandfathered projects through when status assets seed images_ready
- seeds failed and stalled CTA fields from status assets
- does not let the old producer-source-location reachability bypass open artist
- resets artist image gate fields with the project gate flags
- does not flag failed while retry jobs are queued (in-flight), latches when queue drains
- POSTs retry-drafts and clears failed/stalled on 200 (resumes polling)
- also clears on 409 (drafts already queued = progress)
- keeps the CTA (does not clear) on quota/other errors
- no-ops without a projectId

### tests/artist-lock-poll.test.ts (8)
> (머리말 없음)
- stops and unlocks when images_ready (no stalled latch)
- stops immediately (no debounce) when failed_count>0
- does NOT latch stalled on the first stalled poll (persist→submit race debounce)
- latches stalled and stops on the second consecutive stalled poll
- resets the streak when a poll is no longer stalled (jobs queued again)
- does not treat stalled as a stalled-signal when images_ready is also set
- failure takes precedence over stalled (no stalled latch even at streak 2)
- does not latch failure while retry jobs are queued (in-flight)

### tests/artist-refresh-look-pending.test.ts (2)
> (머리말 없음)
- look-pending 초안 + writer-무이미지만 main 재생성, fresh/producer-무이미지 제외
- 대상 없으면 아무 것도 호출 안 함

### tests/artist-retry-drafts.test.ts (6)
> (머리말 없음)
- returns 401 when unauthenticated
- returns 400 for an invalid body
- returns 403 when the user does not own the project
- returns quota-exceeded 4xx before checking project queued drafts
- rejects when the project already has queued draft jobs
- calls triggerAssetDrafts and returns idempotent skip counts on the happy path

### tests/artist-turnaround.test.ts (4)
> (머리말 없음)
- 델타 없으면 델타 절 미포함(하위호환)
- 델타 주면: 룩 토대(스타일/팔레트/외형) 유지 + 델타 절 덮어쓰기로 추가
- 방향뷰도 델타 + reference 일관성 지시 유지
- 공백만인 델타는 무시

### tests/artist-world-user-edited.test.ts (2)
> (머리말 없음)
- auto first-fill generates from Producer source without marking user_edited
- explicit chat regeneration marks the producer-only location user_edited

### tests/asset-authority-clause.test.ts (3)
> (머리말 없음)
- 인물 시트·배경 역할을 번호로 선언하고 연필은 구도만 정한다고 못박는다
- 배경 레퍼런스가 없어도 환경 불변(지형 합치기·이동·발명 금지)을 요구한다
- 스트립 프롬프트에 권위 절이 실린다 (인물·배경 경계 반영)

### tests/classify-image-stale.red-team.test.ts (13) — security 에도 속함
> (머리말 없음)
- fuzzes normalized appearance equivalence against fresh/look-pending/edited branches
- treats empty appearanceHash as a recorded value, not legacy null
- treats empty sourceHash as unknown provenance and therefore fresh
- documents the FNV-1a boundary: appearanceHash equality is the available discriminator
- returns none for empty, nullish, and empty-string-only inputs
- is reorder-invariant while preserving duplicate multiplicity
- changes when costume or look tokens change
- is deterministic for sorted palette values, null elision, and repeated aggregation
- fuzzes reorder determinism with duplicate and null entries
- is deterministic for identical appearance/look inputs
- normalizes nullish and whitespace-only appearances to the same source hash
- keeps look-scoped hashes distinct from appearance-only hashes for the same normalized text
- changes when only the look fingerprint changes

### tests/classify-image-stale.test.ts (11)
> (머리말 없음)
- sourceHash 없으면 fresh (지문 미상)
- stale 아니면 fresh (현재 외형+룩 == sourceHash)
- look-pending (durable): 외형 그대로 + 룩만 도착, appearanceHash 일치
- look-pending (legacy null): appearanceHash null + 외형-only == sourceHash
- edited: 외형 변경 → appearanceHash 불일치
- edited (legacy null + 룩 박힌 sourceHash): 보수적 edited
- SCENARIO-6 회귀: handoff → v1 → refresh → v2 재실행 → edit
- reorder 불변 (정렬 집계)
- costume/룩 변경 → 다른 키
- 룩 전부 부재 → none
- null 섞여도 present 만 집계

### tests/draft-trigger.test.ts (9)
> (머리말 없음)
- design_tokens null skips all submits and never records look_present=false
- design_tokens query error also skips (fail-safe, never look_present=false)
- look-present asset trigger creates a look-bearing character job with workspace target
- filters writer-origin opencast characters out of server drafts
- triggerWorldDrafts uses prompt-only source_hash parity with generate-world and preserves target shape
- triggerWorldDrafts skips when a queued world_shot already exists
- absorbs per-entity submit failures into counts
- quota 거절이면 제출 전역 스킵하고 asset_trigger_blocked(reason:quota) 이벤트를 낸다
- quota 통과이면 정상 제출을 진행한다(기존 동작 무해)

### tests/fal-image-size.test.ts (13)
> (머리말 없음)
- edit 모델: 'WxH' 는 {width,height} 객체로 변환된다 (문자열 그대로는 422 실측)
- edit 모델: preset 문자열은 그대로 통과한다
- edit 모델: image_size 미지정이면 aspect_ratio 유도 preset (기존 계약 유지)
- flux 계열: 명시 'WxH' 를 객체로 존중, 미지정이면 preset ('auto' 미지원 → 16:9)
- grok: image_size 는 스키마에 없어 어떤 값이든 전송하지 않는다 (422 방어)
- nano t2i: aspect_ratio 를 그대로 싣고 image_urls/image_size 는 없다
- nano edit: reference 를 image_urls 로, aspect_ratio 'auto' 는 생략(입력 비율 추종)
- seedream t2i: image_size 사용, aspect_ratio 는 preset 으로 유도(스키마에 aspect_ratio 없음)
- seedream: canvas 미지정이면 image_size 를 생략한다(모델 기본 2048² 정사각)
- seedream edit: reference 를 image_urls 로, 'WxH' 는 {width,height} 객체로
- 그리드: 셀 AR 정확·데드밴드 제거 캔버스 (horizontal 도 레거시에서 스펙 시트로 이동)
- 포맷 미상(구 프로젝트 null)만 레거시 캔버스 유지 — 하위 호환
- 스트립: 세로 포맷만 가로 3열(1536x896), 나머지는 적층

### tests/fal-media-host.test.ts (6)
> #fal-cdn-host (2026-08-01) 회귀 가드.
- 실제로 막혔던 호스트를 통과시킨다
- 기존 호스트도 그대로 통과한다
- 앞으로 늘어날 서브도메인도 통과한다 (정적 목록이 낡지 않게)
- 대소문자·공백에 흔들리지 않는다
- 도메인을 사칭하는 호스트는 막는다 (접미사 판정의 점 포함)
- 무관한 호스트는 막는다

### tests/fal-model-schemas.test.ts (3)
> (머리말 없음)
- returns an empty array when only allowed fields are sent
- returns field names that are not allowed for the registered model
- returns an empty array for unregistered models so schema diff can be skipped

### tests/image-models.test.ts (10)
> (머리말 없음)
- 모든 editEndpoint 는 '/edit' 로 끝나거나 null 이다 (style-anchor Rule M 존중 조건)
- 레지스트리의 모든 엔드포인트가 model-schemas(FAL_INPUT_ALLOWLIST)에 등록돼 있다
- IMAGE_MODEL_ORDER 는 레지스트리 키와 정확히 일치한다(중복·누락 없음)
- normalizeImageModelKey: 유효 키·레거시 endpoint·미상 처리
- isImageModelKey: 화이트리스트 판정 (채팅 cc 입력 검증용)
- imageModelSupportsReference: editEndpoint 유무를 반영
- resolveImageEndpoint: reference 있으면 edit, 없으면 t2i
- resolveImageEndpoint: reference 미지원 모델은 reference 요청이 와도 T2I 로 폴백
- 시트 부적합 모델(기본 nano-banana 포함)은 검증된 시트 모델로 강제된다
- 시트 가능 모델의 선택은 존중된다

### tests/image-provenance.red-team.test.ts (8) — security 에도 속함
> (머리말 없음)
- empty look containers and whitespace-only fields produce null look fingerprint
- separator-shaped NUL sequence in appearance does not collide with look-scoped hash
- palette duplicate values are deterministic and blank values are ignored
- very long appearance and look strings remain deterministic and content-sensitive
- unicode and emoji are preserved while whitespace is normalized
- costume-only look creates a normalized look fingerprint
- isImageStale crosses appearance-only change, look arrival, both changes, and absent data
- world image hash keeps character-hash backward compatibility symmetry

### tests/image-provenance.test.ts (33)
> (머리말 없음)
- 동일 외모 → 동일 지문 (결정적)
- 사소한 공백 편집은 같은 지문 (헛-stale 방지)
- 내용이 바뀌면 다른 지문
- null/undefined/빈문자 → 안전 (빈 문자열 지문)
- F1: lookFingerprint 부재 → 레거시 1인자 출력과 바이트 동일
- 룩 반영 시 지문이 달라진다 (룩 미반영 초안과 구분)
- 룩 전혀 없으면 null
- palette 입력 순서 비의존 (정렬로 결정적)
- art_style/shape/costume 반영
- 의상만 있어도 룩 지문 생성
- costume 공백 정규화 (헛-stale 방지)
- Q5: 앵커 키 부재/null/undefined ⇒ 레거시 바이트 동일 (F1)
- Q5: 앵커 키 있으면 anchor: 파트 추가 + 값 변경
- Q5: 앵커만 있어도 룩 지문 생성
- Q5: 앵커 키 변경 ⇒ 지문 변경 (결정적)
- Q5: 서버/클라 동일 raw 키 ⇒ 지문 일치 (false-stale 방지)
- 앵커 변경(외형 불변) ⇒ look-pending (edited 아님)
- 앵커 그대로면 fresh
- lookVersionKey — 앵커 변경 시 버전키 변경
- F1: lookFingerprint 부재 → visualDescription만 (결정적·하위호환)
- 룩 반영 시 달라진다
- 지문 미상(null) → stale 아님 (레거시 backfill)
- 현재 외모+룩이 후보 지문과 같으면 stale 아님
- 외모를 고치면 stale
- AC7: 룩 미반영 초안은 룩 도착 후 stale
- camelCase view key → snake_case candidate view (019 백필과 정합)
- 미선택 후보 보관 = 5장 (결정)
- cap 이하 → evict 없음
- cap 초과(전부 비보호) → 최신 N장 보관, 가장 오래된 것부터 evict
- 선택본은 가장 오래돼도 evict 안 함
- 핀 후보는 evict 안 함
- 보호 후보만으로 cap 초과 → 비보호 전부 evict, 보호는 유지
- 기본 retention = CANDIDATE_RETENTION(5)

### tests/image-url.test.ts (8)
> (머리말 없음)
- swaps a media bucket public image URL to its _thumb.webp sibling
- preserves the version query (?v=)
- leaves non-media URLs unchanged (fal/blob/external)
- 다른 Supabase 프로젝트의 주소는 건드리지 않는다
- leaves extension-less paths unchanged
- 이미 썸네일인 파일은 재치환하지 않는다 (_thumb.webp / 영상 _thumbnail.jpg)
- normalizes null/undefined/empty to undefined
- passes through the original when the thumbs flag is disabled

### tests/stores/asset-storage-store.test.ts (1)
> (머리말 없음)
- id로 저장 + getCharacter 조회

### tests/style-anchor-chat.test.ts (2)
> D12 — 채팅이 이름/느낌으로 고른 스타일 앵커 키를 카탈로그 검증 후 즉시 반영한다 (2026-08-31 오너).
- applies a catalog key through setStyleAnchor
- rejects a key the catalog does not have — the model must not invent anchors

### tests/style-anchor-noop.test.ts (9)
> (머리말 없음)
- D.1 generate-sheet person main uses template edit opts with no aspect_ratio
- D.2 generate-sheet person main falls back to 3:2 T2I when no base URL exists
- D.4 generate-sheet directional view uses the main image as edit reference with no aspect_ratio
- D.5 generate-sheet safeMode forwards the safe prompt and records safe_mode in inputSnapshot
- D.6 generate-world forwards caller prompt/aspect only, with no model or reference urls
- D.7 generate-storyboard forwards caller prompt/aspect/references with no model key
- D.8 triggerCharacterDrafts submits current template and fallback opts
- D.9 PREVIZ GUARD keeps rough storyboard source free of style-anchor wiring
- D.10 fal submit layer stays free of style-anchor global injection

### tests/style-anchor-routes.test.ts (11)
> (머리말 없음)
- AC1 generate-sheet person/template injects anchor before the layout template
- AC1b generate-sheet with anchor drops only media-word tokens — benign art_style survives (#F-004 B4, 2026-07-14 판정의 명시적 번복)
- AC10 Q5 generate-sheet folds the anchor key into source_hash (false-stale guard)
- AC2 generate-sheet person/T2I fallback injects anchor and normalizes to the edit model
- AC4 generate-sheet directional views stay anchor-free even when the project has an anchor key
- AC5 generate-world injects anchor fields and records the post-injection snapshot
- AC6 generate-storyboard with caller refs uses multiref mode and records the post-injection snapshot
- AC6 generate-storyboard without caller refs uses single mode
- AC7 triggerCharacterDrafts injects anchor for character main template and fallback drafts
- AC7 triggerCharacterDrafts treats an inactive anchor as a fail-soft no-op for draft opts
- AC9 treats an inactive anchor row as a fail-soft no-op for fal submit opts

### tests/style-anchor.test.ts (14)
> (머리말 없음)
- returns the same object reference for null anchors in every mode
- exports the exact style anchor clause strings
- assembles the prompt clause matrix by mode
- prepends anchor references while preserving existing reference order
- pins aspect ratio only when needed and warns when single mode has no ratio source
- returns null for empty keys without querying
- resolves and caches an active style anchor row
- returns null for inactive rows
- returns null for missing rows
- returns null for query errors
- returns null and warns when the query throws
- uses a positive cache hit without re-querying
- re-queries after the positive cache TTL expires
- does not cache %s results (표)

### tests/template-asset.test.ts (13)
> (머리말 없음)
- 내용 해시가 경로에 들어간다 (레포 PNG 교체 시 자동 무효화)
- 프로세스당 한 번만 올린다 (콜드스타트마다 1.4MB 재업로드 금지)
- 현재 해시 객체가 이미 있으면 업로드를 건너뛴다
- 업로드 실패는 던지지 않고 null — 호출부가 T2I 로 폴백한다
- 없는 파일도 null (생성 경로를 막지 않는다)
- 파일마다 다른 해시 → 다른 경로
- 구판 해시만 고르고 현재본은 남긴다
- base 가 다른 자산의 접두여도 잘못 잡지 않는다 (grid ⊄ grid-cinema)
- 해시 패턴이 아닌 이름은 무시한다
- queued 잡이 참조하는 객체는 보호한다 (?v= 쿼리 포함)
- 승격 시 같은 base 의 구판 객체를 remove 한다
- queued 잡이 참조하는 구판은 지우지 않는다
- 청소 실패는 URL 반환을 막지 않는다 (다음 콜드스타트 재시도)

### tests/turnaround-safemode.red-team.test.ts (6) — security 에도 속함
> (머리말 없음)
- keeps safeMode:false byte-identical to omitted across varied inputs
- preserves gender nouns, skin words, art style, and English partial matches in safeMode
- removes supported explicit minor and graphic tokens from appearance and costumes
- applies safeMode scrubbing to every directional view while preserving reference invariants
- scrubs Korean numeric ages and standalone 어린 without over-scrubbing 어린이날
- handles empty, unicode, and long strings stably under safeMode

### tests/turnaround-safemode.test.ts (4)
> (머리말 없음)
- safeMode 미지정 == safeMode:false (byte-identical, 기존 동작 보존)
- safeMode off: 원본 묘사/나이 유지, safe 토큰 없음
- safeMode on: 미성년 나이 + 그래픽 제거, adult/stylized 토큰 추가
- safeMode on: 방향 뷰도 동일 변형 + reference 일관성 문구 유지

## director — Director 캔버스·샷·영상 생성

### tests/build-video-prompt.test.ts (9)
> (머리말 없음)
- snapshots a standard Kling I2V prompt with camera text and no movement preset fragment
- snapshots a T2V movement preset fragment
- snapshots a camera preset gear fragment
- snapshots the Veo under-8s black-screen instruction and 1000 character cap path
- appends the START/END convergence clause for V2 two-reference I2V, but not for T2V
- describes ordered START/REF/END roles without treating REF as a temporal keyframe
- does not claim an END frame when only REF images are supplied
- keeps legacy START/END convergence when roles are absent
- snapshots the 500 character base prompt cap boundary

### tests/director-completion-shots-cache-invalidate.test.ts (1)
> (머리말 없음)
- generateStoryboardImage 완료 뒤 다음 loadShots(다른 화면 재진입 시뮬레이션)는 30초 신선 기간과 무관하게 다시 받는다

### tests/director-context-menu.test.ts (14)
> 우클릭 컨텍스트 메뉴 결정 로직 + 노드 대표 이미지 해석(#context-menu 2026-08-31).
- scene/shot/video는 편집과 삭제를 가진다
- 이미지가 있으면 복사·다운로드가 추가된다
- 이미지가 없으면 복사·다운로드가 빠진다
- asset Image는 편집·복사가 가능하지만 upstream 연결 때문에 직접 삭제하지 않는다
- 파생 카드 kind(구 persist 쟔재)는 편집 없이 삭제만 남는다 (#node-merge)
- prompt는 삭제만 있다
- Shot은 완료된 스토리보드 이미지 URL을 준다
- 생성 전/실패 Shot과 Scene은 null
- Video는 썸네일을 준다
- 없는 노드는 null
- 부모 Scene 없이 생성되고 parent 엣지가 없다
- 독립 Shot에서도 Video Branch가 가능하다
- 영속 clip을 받은 뒤 Video 하나만 만들고 Shot·parent 엣지를 만들지 않는다
- 최신 자체 설정을 같은 clip의 생성 snapshot으로 보낸다

### tests/director-editor-nudge.test.ts (4)
> (머리말 없음)
- 영상 1개만으로 제안하던 조건이 남아 있지 않다
- 샷 대비 영상 비율로 판정한다
- 기준이 1개도 100%도 아니다 — 마지막 몇 샷 남기고 편집 시작하는 흐름을 막지 않는다
- 문구가 실제 수치를 말한다 — "완성됐다"고 단정하지 않는다

### tests/director-frame-wiring.test.ts (8)
> (머리말 없음)
- START/END는 한 개씩 저장하고 같은 source도 서로 다른 슬롯에 연결한다
- START/END 재연결은 기존 입력을 교체하고 REF는 여러 장·중복 방지다
- writer 샷 본체에서 연결한 frame 엣지가 rebuild 후에도 복원된다 (#node-merge)
- frame 엣지를 삭제하면 대응하는 입력만 제거한다
- 여러 이미지 source를 Shot에 연결하고 중복은 한 번만 저장한다
- image 엣지를 삭제하면 해당 source만 Shot 입력에서 제거한다
- applyUpdates가 connectImage를 같은 배선 경로로 적용한다
- writer 샷 본체의 image 엣지가 rebuild 후에도 복원된다 (#node-merge)

### tests/director-interaction.test.ts (20)
> (머리말 없음)
- shot/video/asset Image는 좌측 패널 선택
- scene은 모달(패널 미지원)
- prompt는 액션 없음
- 그리드 뷰는 scene/shot/video 모달 허용
- 노드 뷰는 scene만 모달 — shot/video는 좌측 패널 (#panel-unify)
- asset/prompt는 모달 없음
- scene은 모달, shot/video/asset은 좌측 패널 (#panel-unify)
- prompt는 no-op
- 같은 노드 재클릭 → 선택 해제(null)
- 다른 노드 클릭 → 그 노드 선택
- 선택 없음에서 클릭 → 그 노드 선택
- targetHandle=prompt → 프롬프트 와이어링
- Shot 이미지 레퍼런스 핸들 → 이미지 와이어링
- Video 프레임 입력 핸들 → 프레임 와이어링
- 이전 Video 마지막 프레임 핸들 → Video 체인 와이어링
- 다른 핸들 → 관계 모달
- keeps the newest successful playback when a newer attempt fails
- treats the latest overall attempt, rather than any historical failure, as the failure badge source
- derives generation and failure badges from the same newest attempt
- orders malformed take values deterministically without NaN

### tests/director-no-auto-real.test.ts (16)
> (머리말 없음)
- 자동 채움 함수가 코드베이스에 남아 있지 않다
- sync 훅 Pass 2.7 의 자율 채움 호출이 없다
- 수동 일괄 경로(runRealBatch)는 살아 있다 — 전체 버튼이 쓰는 길
- 채팅 액션 목록에 generateImage 가 있다
- id 가 있으면 개별 샷, 없으면 전체 일괄로 갈린다
- Shot 노드가 아니면 건너뛴다
- 채팅 generateImage는 즉시 실행하지 않고 Director 승인 카드로 보낸다
- 이미지 생성 의도는 사용자가 명시했을 때만 낸다
- 프롬프트가 영상 요청에 generateVideo/addVideoTake 둘 다 내지 말라고 명시한다
- generateVideo skip 사유가 있으면 유저에게 정직한 문구를 모델 메시지로 남긴다 (클라 방어선)
- 생성 액션이 viewMode 를 강제로 바꾸지 않는다
- 스토리보드 뷰에 있을 때만 실사 모드로 맞춘다
- connectFrame is documented and whitelisted with the three target handles
- store applies connectFrame through the existing frame wiring path
- connectImage is documented and restricted to image-reference
- store applies connectImage through the existing image wiring path

### tests/director-regenerate-all.test.ts (7)
> (머리말 없음)
- 서버가 force 를 받고, force 면 이미 생성된 샷도 대상에 넣는다
- 클라 러너가 force 를 서버로 전달한다
- 전부 생성된 상태에서 안내로 끝나지 않고 확인 모달을 연다
- 과금이 큰 동작이라 확인을 거친다 — 바로 쏘지 않는다
- 생성 중 disabled 상태에 사유 툴팁이 붙는다
- 안내 문구가 한국어 사전에 있다
- uses each shot’s persisted appearance key and exact appearance sheet, never legacy character images

### tests/director-shot-chain.test.ts (6)
> Shot 체인 배선(#node-merge 2026-08-31 대공사) — rebuildShotChainNodes 검증.
- 파생 카드(shotImage/videoPlaceholder)를 만들지 않는다
- 구 persist 잔재(파생 노드)를 멱등 정리한다
- writer 샷의 Shot→Video parent 엣지를 직결 chain 엣지로 대체한다
- 수동 샷(writerShotId 없음)의 Video는 parent 엣지를 유지한다
- 멱등 — 두 번 돌려도 노드/체인 엣지 수가 늘지 않는다
- undo 후에도 체인이 재계산된다

### tests/director-stage.test.ts (15)
> (머리말 없음)
- 캐릭터 원본을 editable Image로 만들고 rebuild 뒤 편집값을 보존한다
- storyboardImage 없으면 rough
- storyboardImage completed면 live
- storyboardImage가 generating이면 아직 rough (완료만 live)
- 자식 Video가 있으면 video — storyboardImage가 generating이어도 우선
- 존재하지 않는 노드는 rough
- addPromptNode가 prompt 노드를 추가
- wirePromptToShot이 prompt 엣지를 추가하고 Shot.promptOverride를 동기
- 대상이 Shot이 아니면 no-op
- prompt 엣지는 rebuildAssetNodes 후에도 생존 (references와 달리 wipe 안 됨)
- 해당 writerShotId의 roughStoryboard 반환
- roughStoryboard 없는 샷은 null
- null id는 null
- 없는 샷은 null
- 참조 안정 — 같은 입력은 같은 객체 참조

### tests/director-standalone-video.test.ts (2)
> (머리말 없음)
- creates a strict owner key and detached complete defaults
- rejects partial, extra, and malformed persisted configs

### tests/director-state-boundaries.test.ts (24)
> (머리말 없음)
- keeps a prior successful take playable when a later canonical reconciliation fails
- projects the newest attempt independently from Final intent
- preserves contradictory canonical failure status even when a legacy row retains a URL
- only replays a structurally signed recovery receipt for the active attempt
- reserves one new take while a same-shot generation is in flight and releases the lock
- prevents simultaneous regeneration of the same take
- retains an unsaved generating take when an older hydration snapshot commits
- preserves a newer local attempt identity over a stale persisted clip snapshot
- replaces an older local generating attempt with a newer canonical terminal attempt
- preserves storyboard mutations made after hydration starts
- accepts a newer persisted attempt over an older non-generating local identity
- replays a signed recovery receipt and reaches a completed polling terminal state
- sends manually wired START/REF/END images with aligned roles
- uses a previous Video last frame as the target START image without sending video input
- does not fall back to T2V when a configured video chain has no frame
- sends wired Shot image references to storyboard I2I without leaking node IDs
- stops signed recovery when the attempt is stale
- exhausts signed recovery retries without polling
- fails a malformed successful generation response without losing the provisional attempt identity
- records failed polling terminal state and releases its shot reservation
- rolls back the optimistic sibling Final flags when PATCH and hydration both fail
- does not let an older rejected Final intent overwrite the newest sibling intent
- reconciles a rejected latest Final PATCH to canonical flags and leaves its queue reusable
- cleans a rejected Final queue entry without a detached rejecting promise

### tests/director-sync-prompt-contract.test.ts (6)
> (머리말 없음)
- 신규 v2 Shot sync는 writer prompt를 derivedPrompt에 쓴다
- 기존 Shot re-sync는 promptOverride를 보존하고 derivedPrompt만 갱신한다
- legacy prompt가 sync source와 같으면 derivedPrompt로 흡수하고 migrated flag를 세운다
- legacy prompt가 sync source와 다르면 promptOverride로 1회 이관한다
- effectivePrompt 우선순위는 override → derived → legacy prompt → empty
- sync hook contract writes writer source to derivedPrompt, not legacy prompt

### tests/director-video-batch.test.ts (2)
> (머리말 없음)
- keeps Shot node order and excludes playable or generating children
- runs at most three jobs, counts null results as failures, and clears progress

### tests/director-video-chain.test.ts (6)
> (머리말 없음)
- rejects an incomplete source without creating a chain edge
- restores a valid persisted chain edge and rejects a cycle
- cleans up an optimistic chain when browser frame capture is unavailable
- captures and uploads the source last frame before completing the chain
- applyUpdates uses the dedicated connectVideo action and handle
- invalidates a dependent frame when the source Video attempt changes

### tests/director-video-generation-api.test.ts (35)
> (머리말 없음)
- 형식이 UUID 가 아닌 traceId 는 400 으로 거절한다
- uses a standalone clip’s persisted config without loading a Shot
- uses the dialogue speaker’s exact persisted appearance snapshot rather than the current character appearance
- rejects a missing exact dialogue appearance before reserving or submitting paid video work
- rejects a missing appearance snapshot before reserving or submitting paid video work
- reserves a new take and persists the provider-authoritative request
- uses regeneration reservation and returns attached replay without resubmitting
- validates regeneration ancestry before accepting a same-key recovery replay
- does not treat a same-key regeneration on another clip as a replay
- persists a submission failure and reports a failed attempt
- leaves a truly ambiguous submission queued for manual recovery without auto-resubmitting
- treats a zero-row ambiguity resolution CAS as retryable persistence failure
- accepts reordered JSON replay snapshots without submitting twice
- does not resubmit a replayed reservation whose provider state is unknown
- accepts a replayed pre-438 new-take snapshot without metadata
- rejects a replayed new-take snapshot whose stored metadata differs
- returns recovery details when the failure transition itself cannot persist
- submits a fresh reservation from its immutable FAL snapshot
- rejects changed replay inputs without submitting provider work
- returns terminal jobs without resubmitting reserved placeholders
- returns the provider recovery handle when request attachment fails
- recovers a failed FAL attachment from its signed receipt without a second submission
- rejects changed new-take %s on a replay without submitting provider work (표)
- rejects an unrecognized raw provider handle as a conflicting operation
- keeps a local job queued when immutable upload landed but completion persistence failed
- rejects tampered recovery input without terminalizing the queued attempt
- terminalizes fresh off-origin local provider output rather than stranding the attempt
- returns %s polling result without reconciliation (표)
- rejects a job owned by another user before reconciling it
- returns %s provider state (표)
- returns a server error when reconciliation cannot establish state
- reconciles a queued poll to %s provider state (표)
- attaches only a valid matching local receipt and never resubmits provider work
- rejects %s receipts without attaching or submitting (표)
- rejects %s receipt mismatches without attaching or submitting (표)

### tests/director-video-lifecycle.test.ts (38)
> (머리말 없음)
- persists an immutable object and dispatches linked completion with the exact key
- accepts a new fal CDN subdomain (#fal-cdn-host) — 정적 목록에 없어도 도메인 소속이면 통과
- still rejects a host that merely impersonates the fal domain
- propagates immutable storage conflicts and does not falsely complete the attempt
- rejects corrupt provider media before immutable upload
- rejects %s before immutable upload (표)
- accepts a playable MP4 when its content length is absent
- rejects an ftyp-only MP4 before immutable upload
- rejects malformed %s before immutable upload (표)
- rejects invalid track metadata: %s (표)
- rejects an inflated fixed-size sample count without uploading
- rejects a top-level box flood before immutable upload
- rejects many mdat ranges with a late invalid sample without uploading
- rejects repeated video tracks beyond the aggregate sample budget without uploading
- allows configured local and FAL media origins
- blocks unsafe FAL media target %s before fetching (표)
- blocks local media targets outside the configured origin
- blocks redirects that leave the approved provider policy
- follows approved redirects and cancels each intermediate body
- rejects redirect budget exhaustion and cancels the final redirect body
- cancels a non-success response body before terminalizing it
- aborts a stalled total video download deadline as retryable
- cancels a body that stalls after headers at the download deadline
- rejects streamed %s content-length overruns at the configured byte limit (표)
- classifies immutable conflicts and explicit database failures as terminal
- keeps transient storage status %s=%s retryable (표)
- keeps unknown persistence failures retryable after immutable upload
- dispatches linked provider failure through the video-attempt RPC
- reconciles a linked local result through the Director completion dispatcher
- reconciles an unlinked local result through the generic completion dispatcher
- terminalizes an invalid unlinked local result through the generic failure dispatcher
- terminalizes unlinked local results outside the configured origin: %s (표)
- terminalizes a permanent linked provider lookup error through the attempt RPC
- retains queued state for unclassified provider lookup errors
- retains queued state after a transient provider fetch failure
- propagates terminal linked failure persistence errors
- surfaces database write errors from terminal transitions
- distinguishes a non-terminal CAS miss from an idempotent terminal outcome

### tests/director-video-retakes-db.integration.test.ts (7)
> (머리말 없음)
- rejects non-object reservation snapshots before normalization
- projects each live clip newest linked attempt job
- atomically merges submission resolution and returns false after reservation CAS loss
- scopes regeneration replay keys to the clip and preserves new-take network replay identity
- serializes a concurrent cross-shot new-take key into an idempotency conflict
- normalizes legacy blanks before hardening constraints validate
- enforces service-only RPC access, replay identity, take semantics, and terminal invariants

### tests/director-video-retakes.test.ts (11)
> (머리말 없음)
- uses newest live success for the grid, ignoring Final and unusable newer takes
- uses successful Final for handoff, otherwise the newest successful take
- breaks equal-take equal-time ties deterministically by id
- returns null when no live successful URL exists
- treats blank URLs as unusable and selects the latest attempt regardless of status
- exposes a stable newest-first comparator for consumers with richer records
- rejects blank result media fields before calling the atomic completion RPC
- preserves legacy scalar and null input snapshots when normalizing linked video jobs
- defaults only undefined input snapshots and rejects non-object shapes before reservation RPCs
- wires successful completion and trimmed failure evidence to their terminal RPCs
- rejects blank failure evidence and propagates terminal RPC errors

### tests/director-video-takes-api.test.ts (34)
> (머리말 없음)
- maps every natural identifier into a versioned storage segment without safe-ID aliases
- rejects unauthenticated requests
- creates one persisted standalone Video without a Shot row
- rejects malformed standalone positions before writing
- rejects projects the user does not own
- rejects client-owned invariant fields
- dispatches Final changes through the transactional helper and returns the refreshed take
- updates valid nullable metadata (표)
- rejects mixed final and metadata mutations before either write
- maps %s without changing the stable response contract (표)
- maps deletion %s without treating it as a state conflict (표)
- soft-deletes live takes through the projection-aware helper
- rejects DELETE bodies that are not exactly {projectId} (표)
- maps each documented compatibility conflict message (표)
- does not map adjacent conflict-like messages to 409
- hydrates attempt fields from the bounded live-clip projection without loading generation job history
- rejects malformed %s metadata (표)
- rejects %s before storage writes (표)
- rejects a missing project member target before storage writes
- uses a Korean natural ID for target membership rather than rejecting it as a storage segment
- stores a Director derivative without overwriting its Character source row
- rejects a vanished target after storage succeeds instead of reporting an orphaned upload
- keeps invalid image validation fail-closed while logging bounded decoder diagnostics
- sanitizes non-video upload server failures
- rejects cross-project thumbnail uploads before querying clips or jobs
- rejects %s before querying linked records or storage (표)
- requires the linked generation job to be completed before uploading a thumbnail
- replays an existing completed thumbnail object and refreshes authorized clip metadata
- stores an extracted chain frame immutably without changing thumbnail metadata
- rejects %s before storage writes (표)
- rejects %s thumbnail authority (표)
- rejects deleted clips by requiring deleted_at to be null before storage writes
- rejects immutable thumbnail %s without publishing a URL or updating clip metadata (표)
- treats guarded metadata update races as a conflict

### tests/director-video-webhook.test.ts (5)
> (머리말 없음)
- keeps the job retryable when immutable upload succeeded but completion persistence failed
- terminalizes an ordinary linked finalization failure
- terminalizes a %s media mismatch without invoking the finalizer (표)
- rejects an unknown runtime job kind without dispatching a finalizer
- rejects signed payloads with absent or malformed request identifiers

### tests/director-wiring-persistence.test.ts (9)
> Director 수동 연결의 DB 직렬화 계약(#wiring-persistence 2026-08-31).
- writer 샷·클립·에셋은 안정 참조로 직렬화되고 같은 캔버스에서 되돌아온다
- 안정 키가 없는 노드(수동 Shot·미생성 테이크)는 직렬화 불가(null)
- 구 DB의 'shotImage' 참조는 부모 Shot 노드로 해석된다 (#node-merge 하위호환)
- frameInputs가 새 캔버스의 대응 노드 id로 복원된다
- imageInputs 복원은 사라진 참조를 버리고 중복을 제거한다
- 형태가 어긋난 참조는 버리고 유효한 것만 남긴다
- frame_inputs/video_chain 파싱 — null·불량 형태는 null
- 빈 frameInputs 판정 — 스윕이 DB에 null을 쓰는 기준
- 완료 테이크의 videoClipId가 안정 키로 쓰인다

### tests/real-grid-identity.test.ts (10)
> (머리말 없음)
- characterRefs 가 오면 레퍼런스 순서 규약과 칸별 배정을 명시한다
- 두 인물이 한 칸에 같이 나오면 and 로 병기한다
- 인물 없는 칸은 사람 없이 유지하라고 지시한다 (인서트 샷)
- characterRefs 미전달(구 호출자)이면 현행 익명 문장 그대로 — 하위 호환
- 인물 레퍼런스가 0이면 배정 블록 자체가 없다
- 스타일 앵커(LAST) 지시는 배정 블록과 공존한다
- 그리드: sceneLighting 이 오면 시트 전역 조명 줄이 실리고 앵커 절에서 조명·그레이드 문구가 빠진다
- 그리드: sceneLighting 미전달·공백이면 현행 프롬프트 그대로 — 하위 호환
- 그리드: 앵커가 없어도(라이브액션 폴백) 씬 조명 줄은 독립적으로 실린다
- 스트립: 같은 계약 — 조명 줄 + 앵커 절 권위 이관, 미전달이면 현행 그대로

### tests/video-models.test.ts (4)
> (머리말 없음)
- DEFAULT_VIDEO_MODEL 은 seedance 다
- FAL_VIDEO_MODEL_ORDER 첫 항목은 기본 모델과 일치한다
- normalizeProvider: 유효 키·legacy alias·미상 처리
- clampDuration: flexible 모델은 spec 범위로 가두고, fixed 모델은 고정 seconds 를 반환

### tests/video-prompt-dialogue.test.ts (16)
> (머리말 없음)
- 대사 원문을 그대로 넣는다 (번역·요약 금지 — 입모양이 어긋난다)
- 립싱크를 명시적으로 요구한다 — 모델은 무성 클립 편향이 있다
- 어조(emotion·delivery)를 함께 싣는다
- 여러 줄이면 순서를 명시한다
- 대사가 없거나 빈 문자열이면 아무것도 안 붙인다
- 동작을 대사에 맞춰 싱크하라고 지시한다 (memo: 단어 시점 연기)
- 대사 없는 샷의 프롬프트는 대사 절이 없다
- 대사가 있으면 프롬프트와 parts 양쪽에 실린다
- 대사가 길이 캡에 잘려 사라지지 않는다
- 모션 계약이 대사보다 앞에 온다 — 앞 토큰 가중 순서 유지
- speakers 맵이 있으면 이름과 외형 앵커가 실린다
- 외형 앵커는 문장 경계로 잘려 과도하게 길지 않다 (~120자)
- 다중 화자 샷에서 각 줄이 제 화자에게 귀속된다
- 맵에 없는 characterId 는 종전 무명 표기로 폴백한다
- characterId 없는 라인은 V.O. 내레이션 — 립싱크 대상에서 제외한다
- buildVideoPrompt 가 dialogueSpeakers 를 절까지 배선한다

## editor — Editor·내보내기·미디어 저장

### tests/editor-render-loop-guard.test.ts (3)
> 무한 되그리기 회귀 잠금 (#editor-render-loop 2026-08-24).
- useT 는 렌더마다 새 함수를 만들지 않는다 (locale 로만 갱신)
- t 를 훅 deps 로 쓰는 화면이 실제로 있다 — 위 잠금이 살아있는 이유
- editor 마운트 로드 effect 의 deps 는 전부 안정 참조다

### tests/editor-server-save.test.ts (3)
> (머리말 없음)
- 410(삭제된 프로젝트)은 1회 시도 후 중단 — 5초 재시도 루프 없음
- 500(일시 장애)은 3회 백오프 후 5초 뒤 재시도 사이클 지속
- 성공하면 스냅샷을 비우고 멈춘다

### tests/editor-trim-cut-persistence.test.ts (6)
> (머리말 없음)
- classifies cut pieces and drag instances
- restores a cut piece whose base shot is canonical, replaying the base clip current url
- drops a piece whose base shot no longer exists (deleted media must not resurrect)
- updates the clip locally and persists canonical trims to /api/editor/trim (debounced)
- never sends synthetic piece trims to the shots table route
- rejects degenerate ranges

### tests/editor-video-handoff.test.ts (14)
> (머리말 없음)
- uses the Final take URL, thumbnail, and completed status over a newer successful take
- keeps the newest successful media when a later attempt failed
- does not revive a legacy projection when relational rows are unusable
- uses the legacy projection only when there are no relational rows
- clears prior project media after an empty or failed reload
- discards late successful and rejected loads after reset without changing projects
- discards a late persisted snapshot after reset without changing projects
- keeps a populated new-project canonical snapshot when an old-project load resolves late
- keeps a populated new-project canonical snapshot when an old-project load rejects late
- keeps the newest same-project canonical load when an older load resolves last
- keeps the newest same-project canonical snapshot when an older load rejects late
- clears a stale load error after a populated canonical reload succeeds
- sends the in-flight snapshot before only the newest pending snapshot
- does not retry a stale failure and retries the newest snapshot

### tests/export-core.red-team.test.ts (17) — security 에도 속함
> (머리말 없음)
- falls back for empty, all-reserved, and dot/space-only segments
- caps Korean names at 80 code points rather than 80 bytes
- prefixes Windows device names even when cased or extension-bearing
- neutralizes traversal and embedded path separators inside one segment
- normalizes combining-mark input to NFC before trimming and capping
- dedupes many identical files as base, base-2, and base-3
- treats IMG and img as a case-insensitive collision
- keeps the same sanitized name independent across different directories
- dedupes file() and child() calls through the same directory namespace
- records a thrown media fetch as a failed entry without throwing
- records a non-ok media response as a failed entry without creating the media file
- creates an empty archive and zeroed result for an empty files array
- keeps all-media-fail archives downloadable with _failed.txt and failed equal to total
- fetches the same media URL once while writing every sharing path
- records nullish text content as failures while preserving explicit empty strings
- collapses newlines and escapes leading heading or blockquote markers
- maps known content types, URL fallbacks, and unknowns to safe extensions

### tests/export-g002.red-team.test.ts (10) — security 에도 속함
> (머리말 없음)
- returns 401 before ownership or writer_runs access for unauthenticated requests
- returns 403 for a valid user who owns project A but requests project B
- prefers an older completed usable run over a newer failed usable run
- falls back to the newest usable run when every usable run failed
- returns an all-null 200 when recent runs have non-record or empty unusable state
- throws on supabaseAdmin writer_runs errors instead of masking them as empty exports
- does not throw or inline raw JSON braces for deeply malformed partial projections
- keeps markdown injection in scene prose inside escaped table cells
- uses native text over EN base fields when native variants are present
- does not throw on malformed missing board fields and remains markdown-only

### tests/export-g003.red-team.test.ts (8) — security 에도 속함
> (머리말 없음)
- dedupes 3+ same-name character folders, keeps media-less index rows, and sanitizes hostile names
- renders assets.md native-first without raw JSON-braced prose
- is pure and does not throw on malformed artist rows
- keeps native-first renderer columns selected by the director loader
- emits storyboard pngs only for completed storyboard_image rows with usable urls and notes every omitted status
- selects successful live Finals before newer takes, otherwise orders successful takes deterministically, and falls back to legacy URLs
- renders native-first readable directing prose without JSON braces and escapes markdown injection
- is pure and does not throw on malformed director rows

### tests/export-manifest.test.ts (6)
> (머리말 없음)
- prepends README.md listing all four stages with counts matching bundled files
- marks a zero-file stage as 비어 있음 without adding an empty folder artifact
- records a failed stage as 오류 and keeps exporting the remaining stages
- escapes pipes and newlines in README manifest error cells
- uses DB-derived producer files when the default producer collector runs with a cold store
- uses sanitizeSegment(project.name) for project and stage zip names

### tests/export-md-artist.test.ts (4)
> (머리말 없음)
- emits present artist media with remapped filenames and deduped folders
- renders a readable assets.md index with native-first descriptions and remap notes
- renders an explicit Korean empty note when there are no artist assets
- stays pure and does not import the asset-storage store

### tests/export-md-director.test.ts (5)
> (머리말 없음)
- emits storyboard pngs only for completed storyboard_image rows with a url
- selects a successful live Final over newer takes, otherwise uses the newest successful take, and only uses shots.video_url without relational rows
- renders a readable native-first shotlist without raw JSON bodies
- prefers a usable Final, then the newest usable take while excluding deleted, failed, pending, and whitespace URLs
- uses deterministic ids to resolve equal take timestamps and attempt timestamps before take ordering

### tests/export-md-producer.test.ts (5)
> (머리말 없음)
- emits readable producer markdown artifacts for a populated board
- renders explicit Korean empty notes for empty story, cast, and backgrounds
- falls back to English labels for the en locale (and the unset-key default)
- does not emit producer background image files for today\'s BackgroundSource shape
- maps producer_draft plus character/location rows into a producer artifact board

### tests/export-md-writer.test.ts (2)
> (머리말 없음)
- renders the four writer markdown files with native-first prose and EN prompts
- marks incomplete pipeline sections and renders injected DB fallback rows for a no-run projection

### tests/export-menu.test.ts (5)
> (머리말 없음)
- maps current project stages to export stages
- estimates bytes from positive per-kind file counts only
- requires confirmation only at the large export threshold
- marks the estimate unknown when a database query fails so export uses its confirmation fail-safe
- counts the default appearance sheet and portrait, not legacy character views

### tests/export-sanitize.test.ts (11)
> (머리말 없음)
- RT-01 normalizes NFC and collapses whitespace runs into single dashes
- RT-02 replaces reserved filesystem chars, path separators, and controls without dropping Unicode
- RT-03 preserves Korean and Unicode letters/digits as first-class filename text
- RT-04 prefixes Windows device names case-insensitively
- RT-05 trims leading/trailing dash, dot, and space so Windows trailing-dot/space bans cannot leak
- RT-06 caps output to 80 code points after sanitizing
- RT-06b re-trims trailing dots and dashes left by the 80-code-point cap
- RT-07 falls back to untitled when every character is unsafe or trimmed away
- RT-08 dedupes identical file names in one directory before the extension
- RT-09 keeps identical names independent across different directories
- RT-10 treats collisions case-insensitively while preserving the requested case

### tests/export-zip.test.ts (5)
> (머리말 없음)
- prefers Content-Type and falls back to safe URL extensions
- bundles text artifacts and fetched media artifacts into the expected zip entries
- records failed media in _failed.txt without throwing or creating the missing entry
- writes every duplicate media URL path with one fetch and identical bytes
- records nullish text content in _failed.txt while preserving explicit empty text entries

### tests/media-cache-control.test.ts (5)
> (머리말 없음)
- 초 숫자로 시작한다
- '%s' 를 포함하지 않는다 — Supabase 가 접두사를 이미 붙인다 (표)
- 생략하면 기본값을 넘긴다
- 호출부가 준 값이 기본값을 이긴다
- 캐시 기간을 넣어도 contentType·upsert 는 그대로 간다

### tests/media-migration-plan.test.ts (13)
> (머리말 없음)
- 작업공간/프로젝트 형태에서 프로젝트 id를 꺼낸다
- 공용 자산 경로는 null
- 화면에 쓰이는 결과물은 옮긴다
- 작은 그림도 같이 옮긴다 — 다시 만들려면 원본과 변환 도구가 필요하다
- 공용 자산은 프로젝트와 무관하게 옮긴다
- 생성용 임시 시트는 옮기지 않는다
- 임시물 판정이 프로젝트 판정보다 먼저다
- 주인 프로젝트가 없으면 옮기지 않는다
- 시험·샘플 프로젝트도 옮긴다 — 버릴지는 이전 후에 정한다
- 업로드 원본도 조각도 옮긴다
- 앞의 슬래시가 붙어도 같은 판정
- 빈 경로는 사람이 본다
- 판정마다 사람이 읽을 근거가 붙는다

### tests/media-url-env.test.ts (3)
> (머리말 없음)
- env 에 개행·공백이 붙어도 생성 주소는 한 줄이고, 자가 판정을 통과한다
- override env 도 동일 — 끝 공백·개행·슬래시 전부 무해
- 개행이 이미 박힌 저장분 주소도 판정은 인정한다 (new URL 정규화 경유)

### tests/media-url.test.ts (14)
> (머리말 없음)
- 경로를 붙여 절대 주소를 만든다
- 앞의 슬래시는 중복되지 않게 떨어낸다
- 다른 회사로 옮기면 접두사만 바뀐다
- 주소를 경로로 되짚는다 (왕복)
- 캐시버스트 쿼리(?v=)를 무시한다
- 이전 기간에는 옛 주소와 새 주소를 둘 다 인식한다
- 우리 주소가 아니면 null
- 다른 버킷은 우리 것이 아니다
- 경로가 비면 null
- 우리 보관함 주소만 통과시킨다
- 문자열이 아니면 거부
- 지나치게 긴 주소는 거부
- 경로 조작으로 접두사를 빠져나가려 하면 거부
- 내부망 주소를 우리 주소로 위장해도 거부

### tests/media-word-scrub.test.ts (8)
> (머리말 없음)
- 매체어를 품은 토큰은 토큰째 드롭 (2026-07-14 dark_cinematic_realism 교훈 보존)
- 무해한 토큰은 유지 — 앵커에 부합하는 3d_animation 이 살아남는 것이 이 수리의 목적
- 영어·한국어 매체어를 걷어내고 문장은 유지한다
- 개행은 프롬프트 구조라 보존한다
- 매체어가 없으면 원문 그대로 (no-op)
- containsMediaWord 는 부분 문자열(리얼리스틱 안의 실사 아님)도 정확히 잡는다
- 앵커가 있으면 base.prompt 의 매체어가 걷힌다
- 앵커가 없으면 스크럽도 없다 (전체 no-op)

### tests/storage-immutable-object.test.ts (5)
> (머리말 없음)
- accepts an exact immutable retry only after metadata and digest match
- accepts exact retries for %s (표)
- rejects a 409 containing different bytes without accepting it as a retry
- rejects immutable retries with %s (표)
- propagates non-conflict upload failures without inspection

### tests/upload-ingest.test.ts (19)
> (머리말 없음)
- 지원 확장자를 계열로 분류한다
- SVG·HWP·PDF 는 이유를 붙여 거부한다
- 계열별 크기 상한을 적용한다
- 상한 이하는 그대로 둔다
- 한글을 깨뜨리지 않고 바이트 상한 안으로 자른다
- 우리 스토리지 경로만 통과시킨다
- 거부된 개수를 보고한다
- 배열이 아니면 빈 결과
- 신고된 MIME 과 실제 내용이 다르면 사유와 함께 거부한다
- 지원하지 않는 MIME 은 포맷을 알려주며 거부한다
- 스크롤 웹툰 높이를 받아준다 (2026-08-13 회귀)
- 한도를 넘는 세로는 무엇이 문제인지 말해준다
- 한도 안 이미지는 자르지 않는다
- 세로로 긴 웹툰 스트립을 조각내고 각 조각의 긴 변이 한도를 넘지 않는다
- 폭이 한도를 넘으면 먼저 줄인 뒤 자른다
- 마지막 얇은 조각을 만들지 않는다
- 스크롤 웹툰 한 화 전체를 자른다 (2026-08-13 회귀)
- 그레이스케일·알파 입력도 3채널로 모아 처리한다
- 실제 디코드 가능한 JPEG 를 낸다

## security — 권한·입력 경계·red-team 방어 회귀

### tests/action-guard.test.ts (9)
> (머리말 없음)
- 첫 요청은 통과시킨다
- 창 안의 두 번째 요청은 버린다
- 창이 지나면 다시 통과시킨다
- 창은 키마다 따로다 — 다른 샷은 서로를 막지 않는다
- 같은 키면 어느 버튼에서 왔든 같은 창을 공유한다
- 버튼 층(ui:)과 store 층은 서로의 창을 막지 않는다
- 막힌 요청은 창을 연장하지 않는다 — 연타 중에도 첫 클릭 기준으로 만료된다
- release 하면 창이 남아 있어도 즉시 다시 통과한다 (실패 후 재시도)
- 키가 많이 쌓이면 만료된 것만 정리하고 살아있는 창은 지키지 않는다

### tests/admin-gate.test.ts (6)
> 관리자 디버그 게이트(#debug-prompts) 회귀 — 2026-08-07 실측 버그 방어.
- 작업 워크스페이스 소유 계정(admin@tale.studio)을 관리자로 인정한다
- 개인 관리자 계정도 인정한다
- 대소문자·공백을 정규화한다
- 일반 계정·빈 값은 거부한다
- ADMIN_EMAILS 환경변수로 확장할 수 있다
- 관리자 이메일과 워크스페이스 소유자가 모두 일치할 때만 통과한다

### tests/api-project-access-guard.test.ts (29)
> requireProjectAccess — 프로젝트 종속 API 라우트의 접근 가드 (2026-08-11 보안 감사).
- 비로그인은 401 — 감사 이전엔 이게 200 이었다
- 소유자는 통과하고 검증된 projectId 를 돌려준다
- 로그인했지만 남의 프로젝트면 403 (IDOR 차단)
- 워크스페이스가 하나도 없는 유저도 403
- 형태가 틀린 projectId 는 400 (DB 조회 전에 끊는다)
- projectId 가 없으면 400
- allowShare 없이는 유효한 티켓이어도 401 — 쓰기 라우트 보호
- 쿠키의 유효한 티켓은 통과(viaShare)
- ?share= 쿼리의 유효한 티켓도 통과 (쿠키 차단 브라우저 경로)
- revoke 된 티켓은 거부
- 만료된 티켓은 거부
- 다른 프로젝트의 티켓으로는 이 프로젝트를 못 연다
- 형태가 틀린 티켓은 DB 조회조차 하지 않는다
- POST /api/artist/generate-sheet — 403
- POST /api/artist/generate-world — 403
- POST /api/artist/character — 403 before any character or prop write
- PATCH /api/artist/character — 403 before entity lookup or write
- POST /api/artist/appearance — 403 before canonical appearance or prop write
- POST /api/writer/rough-storyboard — 403
- POST /api/director/generate-storyboard — 403
- POST /api/director/generate-storyboard-batch — 403
- POST /api/director/generate-previz-video — 403
- GET /api/editor/state — 403
- PUT /api/editor/state — 403
- PATCH /api/editor/speed — 403
- POST /api/writer/scene-gate — 403 (revise 의 scenes/storyCheck 삭제 전에 끊긴다)
- POST /api/writer/dialogue — 403
- POST /api/writer/shot-configs — 403
- 비로그인은 401 (예: scene-gate)

### tests/classify-fal-failure.red-team.test.ts (5)
> (머리말 없음)
- honors blocked as a whole word without broad block false positives
- matches content policy separator variants case-insensitively
- matches violat and disallow stems as intentional partial keywords
- keeps ordinary infrastructure failures generic
- handles nullish, blank, unicode, symbols, and long messages deterministically

### tests/demo-seam.test.ts (13)
> (머리말 없음)
- filters by eq from snapshot (no real DB)
- orders ascending + limit + maybeSingle
- writes are no-op
- missing table → empty array
- passes share endpoints and non-api
- read-noop on api GET
- write-noop on api mutation/generation
- covers all stages
- detects demo cookie
- blocks writes with 403 when demo cookie present
- parses valid 64-hex share param
- rejects malformed tokens
- withDemoShare is a no-op outside browser (SSR/node)

### tests/generation-jobs-terminal.test.ts (13)
> (머리말 없음)
- stores an empty object when inputSnapshot is omitted at creation
- accepts only an exact completed replay with its result URL
- rejects opposite terminal outcomes and only replays the exact failure
- records completed_at when failing a queued job
- rejects blank terminal evidence before issuing mutations
- refuses linked shot_video jobs through generic terminal helpers and scopes both CAS mutations to unlinked rows
- projects response_snapshot when reading a generation job by ID
- delegates response-snapshot patches to the atomic RPC and validates patch shape
- rejects blank response-snapshot request IDs before issuing the RPC
- propagates missing-row and other response-snapshot RPC errors
- propagates ownership, list, and count query errors
- give-up 게이트는 provider/infra 실패를 세지 않는다 (#error-class 오너 정책 2026-08-13)
- uses the quota fallback only for the exact legacy schema-cache error

### tests/script-lines.red-team.test.ts (10)
> (머리말 없음)
- RT-01 resolves Korean particles but rejects malformed line-token variants
- RT-02 scans very long mention text without duplicate or runaway output
- RT-03 tolerates nullish dialogueLines and does not synthesize dialogue entries
- RT-04 keeps orphan-only manifests line-numbered without headings
- RT-05 keeps script refs unambiguous when shotId values collide
- RT-06 rejects prototype-inherited refs and label regex bypasses
- RT-07 handles circular sanitizeLineRefs input without recursion
- RT-08 drops nested malformed patches and type-confused dialogueLines
- RT-09 ignores deleteScene requests with non-string ids
- RT-10 treats same-reference and empty dialogue patches as apply

## unsorted — core 에 들어가지만 어느 도메인 스위트에도 안 잡히는 테스트 — 분류 부채

### tests/admin-billing-route.test.ts (10)
> (머리말 없음)
- 비인증은 401
- 비admin 은 403
- GET 도 비admin 은 403
- plan 갱신 + grant_plan 적립을 둘 다 수행한다
- free 로 전환하면 grant 를 적립하지 않는다
- reason 없으면 400
- reason 있으면 manual_adjust 행을 삽입한다
- 알 수 없는 kind 는 400
- 유효한 grant 는 200 + grant 행 삽입
- plan/entitlements/takeBalance 를 반환한다

### tests/agentic-reply-guard.test.ts (12)
> 채팅 updates JSON 유출 방어 (임시 조치 2026-07-15) — 잘린/깨진 펜스가 raw 로 노출되지 않는 계약.
- 펜스가 없는 일반 응답은 그대로 통과한다
- 닫히지 않은 ```json 펜스(max_tokens 잘림)는 잘라내고 안내 문구로 대체한다
- 본문 없이 펜스로 시작하면 안내 문구만 남긴다
- 펜스가 없으면 실패가 아니라 순수 대화 턴(none)이다
- 정상 펜스는 본문만 남기고 updates 를 넘긴다
- 잘린 펜스는 온전한 항목만 살린다(종전: 전부 폐기) — 안내 문구는 검증 후 붙는다
- 복구 불가면 raw 를 노출하지 않고 미적용을 알린다
- 펜스 뒤에 후행 텍스트가 있어도 파싱한다(끝 고정 정규식의 사각)
- 잘리다 만 마지막 항목은 버린다 — 반쪽짜리 값이 커밋되면 안 된다
- 복구 시 적용 건수와 재개 지점을 문구에 담는다
- 건수는 화이트리스트 통과분 기준이다(과대 보고 금지)
- 정상 응답에는 안내를 붙이지 않는다

### tests/anchor-clause-wiring.test.ts (9)
> (머리말 없음)
- styleClause 가 있으면 앵커 절 다음 줄에 실린다 (스크럽 대상 아님 — 매체어 포함 가능)
- styleClause 미설정(역사극·공포 NULL)이면 종전 프롬프트 그대로 — 하위 호환
- refs 가 [앵커, preview, ...기존] 이 되고 절이 FIRST TWO 로 바뀐다
- turnaround 는 2번 슬롯이 레이아웃 템플릿 계약이라 preview 를 넣지 않는다
- 그리드: styleClause 가 앵커 절 다음 항목으로 실린다
- 그리드: 서브룩(anchorKeepsGrade)은 씬 조명이 있어도 그레이드·팔레트를 앵커에 남긴다 (Rule 6)
- 그리드: 매체 앵커는 종전 권위 이관 유지 (F-006 그대로)
- 스트립: styleRefCount=2 면 LAST TWO + 캐릭터 구간 "between the first and the last two"
- 스트립: 서브룩 + 씬 조명 — 그레이드 유지 분기

### tests/backfill-filter.test.ts (13)
> (머리말 없음)
- 배치 스토리보드 생성용 참조 시트(real_grid_ref_*)를 거른다
- 단건 스토리보드 생성용 참조 띠(_storyboard_ref_strip)를 거른다
- 생성 모델용 고정 템플릿(templates/)을 거른다
- 원본 업로드(uploads/)는 화면 노출 확인 전까지 보류한다
- %s 는 백필 대상이다 (표)
- 프로젝트 하위가 아닌 루트 파일도 기본 통과 (제외 목록 원칙)
- 생성용 임시 재료에 붙은 썸네일은 삭제 대상이다 (141개 대표 케이스)
- 화면에 뜨는 정상 썸네일은 절대 삭제하지 않는다
- 썸네일이 아닌 파일(원본)은 경로가 제외 패턴이어도 삭제 대상이 아니다
- 배치 격자 원본을 제외한다
- 참조 시트도 계속 제외한다 (real_grid_ 규칙이 삼키지 않는지 확인)
- 격자에 잘못 붙은 축소본은 삭제 대상이다
- 샷 프레임은 격자 규칙에 걸리지 않는다

### tests/character-appearance-tabs.test.ts (8)
> (머리말 없음)
- sends young explicitly without using current sheet or key
- rejects a missing appearance key before making a request
- resolves only one declared default appearance for automatic callers
- patches only the explicitly selected appearance
- updates exactly the selected appearance row
- does not update when project access is denied
- creates a person and its current appearance atomically through the RPC
- creates an object only in props

### tests/character-base-face-reference.test.ts (9)
> (머리말 없음)
- 기본 portrait가 있으면 정체성을 이어받으라고 지시한다
- 그대로 베끼지 말고 선택한 모습의 나이와 상태를 따른다
- 요청한 모습과 같은 캐릭터의 명시적 기본 모습을 정확히 조회한다
- 비기본 모습은 같은 캐릭터의 기본 portrait가 없으면 생성하지 않는다
- 다른 캐릭터를 참조하는 baseCharacterId 우회 경로는 없다
- hasPriorRender: 직전 렌더를 정체성 앵커로 유지하라고 지시한다
- hasPriorRender 미지정이면 그 지시가 없다 (첫 생성 동작 보존)
- route: 턴어라운드가 직전 시트(refMain)를 정체성 참조에 포함한다
- route: 첫 생성(refMain 없음)은 템플릿만 — identityRefs 가 refMain 유무로 결정된다

### tests/character-template-assets.test.ts (3)
> (머리말 없음)
- 커밋된 템플릿 존재 + 치수 = 스펙 캔버스
- 타일이 캔버스 안에 있고 서로 겹치지 않는다 (정형 타일 불변식)
- 포트레이트 크롭 좌표가 스펙 파생값과 일치한다 (v3 — v2 시트에 쓰지 말 것)

### tests/chat-blocks.test.ts (19)
> (머리말 없음)
- 유저 메시지는 user
- 완료(✓)/실패(⚠) 알림은 status
- 일반 에이전트 발화는 text (본문 중간의 ✓ 는 무관)
- 연속 model text 두 개 → 첫 번째만 plate
- 유저 발화가 run 을 리셋 → 다음 model text 가 새 plate
- status 는 턴을 열지 않는다 — plate 없음, 뒤따르는 text 가 plate 를 연다
- text 뒤의 status 는 plate 를 다시 열지 않는다
- 구간이 model 로 시작해도 첫 text 에 plate (섹션 경계 = 턴 시작)
- 빈 목록은 빈 블록
- 직렬화 ↔ 파싱 왕복
- 형태가 어긋나면 null (렌더러가 flat 으로 폴백)
- handoff 는 턴을 열지 않는다 — plate 없음, 다음 text 가 연다
- 왕복해도 본문이 보존된다
- 첨부가 없으면 본문을 건드리지 않는다
- 본문 없이 첨부만 보낸 경우도 처리한다
- 여러 줄 본문의 마지막 줄만 마커로 본다
- 사용자가 직접 친 📎 는 마커로 오인하지 않는다
- URL 이 아닌 토큰이 섞이면 마커가 아니다
- 마커가 붙어도 user 로 분류된다 (상태 행으로 새지 않는다)

### tests/chat-sections.test.ts (7)
> 채팅 stage 구간 분할 (#chat-continuity 2026-07-31) — 채팅방은 프로젝트당 하나이고
- 연속된 같은 stage 메시지는 한 구간으로 묶는다
- 되돌아온 stage 는 새 구간이다 — 시간순이 진실
- 발화 없는 stage 로 이동하면 빈 현재 구간을 끝에 만든다
- 마지막 구간이 현재 stage 면 빈 구간을 덧붙이지 않는다
- current 는 마지막 구간에만 붙는다 (같은 stage 가 앞에 또 있어도)
- 메시지가 하나도 없어도 현재 stage 구간 하나를 돌려준다
- 입력 배열을 변형하지 않는다

### tests/chat-trace-api.test.ts (3)
> (머리말 없음)
- requires authentication and project ownership
- upserts a trace while ignoring fields outside the safe receipt
- whitelists patches and returns the persisted trace

### tests/chat-trace.test.ts (2)
> (머리말 없음)
- keeps request shape separate from provider usage
- provides safe zero usage when a mocked LLM does not report metadata

### tests/classify-fal-failure.test.ts (4)
> (머리말 없음)
- 모더레이션/콘텐츠정책 키워드 → moderation
- 일반 에러 → generic
- null/undefined/빈 문자열 → generic
- 대소문자 무관

### tests/custom-style-anchor.test.ts (7)
> (머리말 없음)
- url 이 있어야만 앵커로 인정한다
- label·medium 은 문자열일 때만 취한다
- 커스텀 앵커가 있으면 카탈로그를 아예 조회하지 않는다
- 커스텀 key 를 그대로 되돌려준다 (룩 지문·생성 기록의 정체성)
- 커스텀이 없으면 카탈로그로 폴백한다
- url 없는 깨진 jsonb 는 커스텀으로 치지 않고 카탈로그로 넘어간다
- 둘 다 없으면 null (앵커 없이 진행 — 기존 동작)

### tests/depth.test.ts (2)
> (머리말 없음)
- maps boundary seconds to the documented depth levels
- clamps below-range and very-long runtimes

### tests/display-name.test.ts (5)
> 오픈캐스트 슬러그 노출 방지(#opencast-name 2026-08-06) 회귀.
- 번호식·서술적 slug 를 사람이 읽는 표기로 바꾼다
- 한국어 등 비슬러그 문자열은 그대로 통과한다
- 실제 이름이 있으면 그대로, slug 반복·공백이면 humanize(id) 폴백
- mergeOpenCast: 모델이 name 에 slug 를 되풀이하면 humanize 로 대체한다
- mergeOpenWorld: 새 로케이션 name 은 humanize, id(조인 키)는 원본 유지

### tests/duration-regression.harness.test.ts (1)
> (머리말 없음)
- 게이트 꺼짐 — CI 무부하

### tests/fal-keys.test.ts (11)
> fal 다중 키 레지스트리(#fal-key-pool) 회귀 가드.
- throws when FAL_KEYS is unset
- throws when FAL_KEYS is broken JSON
- throws when FAL_KEYS is an empty array
- throws when FAL_KEYS has a duplicate id
- does not throw at import time — only on first use (lazy)
- picks the key with the largest headroom (maxInflight - inflight)
- breaks ties toward the earlier array entry
- returns the least-loaded key even when every key is saturated (429 is the quota gate\u2019s job)
- returns null for an unknown id
- returns the matching entry for a known id
- sums maxInflight across all registered keys

### tests/fal-observability-capture.test.ts (2)
> (머리말 없음)
- reports fields omitted by a registered fal model allowlist
- maps the exact fal request body into an input snapshot patch

### tests/fal-reconcile-duplicate-finalize.test.ts (3)
> #dup-finalize-null-url (2026-07-31) 회귀 가드.
- 경쟁에 져도 DB 의 result_url 을 돌려준다 (queued 스냅샷의 null 을 흘리지 않음)
- 승자가 실패로 종결했으면 실패를 그대로 보고한다
- 경쟁이 없으면 finalize 결과 URL 을 그대로 쓴다

### tests/finalize-frame-thumbs.test.ts (2)
> (머리말 없음)
- 샷마다 start/direction/end 세 장 전부, 업로드와 같은 경로·같은 버퍼로 썸네일을 만든다
- 실사 그리드도 storyboard start/direction/end 세 장 전부 썸네일을 만든다

### tests/generation-failure-evidence.test.ts (7)
> (머리말 없음)
- wraps fal placeholder "<none>" with job context instead of storing it bare
- wraps other meaningless placeholders (undefined/null/[object Object])
- passes real failure messages through untouched
- includes error name, HTTP status and cause when present
- stringifies non-Error throwables
- returns jobs that left the active queue since the previous tick
- returns nothing when the queue only grew

### tests/generation-failure.test.ts (10)
> (머리말 없음)
- 레퍼런스 다운로드 실패를 알아본다 (실제 원문)
- 만료된 URL 문구도 같은 분류
- 콘텐츠 정책은 완화·안전모드를 안내한다
- 레이트리밋은 기다리라고 한다
- 인증 오류는 사용자가 못 푸는 종류라고 말한다
- 모르는 오류는 지어내지 않고 원문을 짧게 보여준다
- JSON 덩어리는 msg 만 뽑아 축약한다
- 빈 문자열도 안전하다
- 실패 메시지는 상태 행 마커(⚠)로 시작한다
- give-up 메시지는 사람이 눌러야 한다는 걸 명시한다

### tests/generation-ghost-reconcile.test.ts (8)
> #ghost-reconcile (2026-08-17) 회귀 가드 — 리뷰 반영 개정판 (S2·S3·S5·M5·M11).
- 완료된 유령 잡을 finalize 로 회수하고, 스윕 쿼리 인자가 계약대로다 (S5)
- 목록 조회 후 남이 먼저 종결한 잡은 재조회에서 건너뛴다 (M11)
- 아직 진행 중(IN_PROGRESS)인 잡은 건드리지 않는다
- 404(영구 조회 실패)는 failed 로 종결한다 — 실제 update 체인 경유 (M5)
- 401/403(자격증명 문제)은 잡을 파괴하지 않고 queued 로 남긴다 (S2)
- 같은 프로젝트 연속 호출은 스로틀돼 재조회하지 않는다
- 스윕이 도는 중엔 스로틀 창이 지나도 재진입하지 않는다 (S3)
- 조회 실패는 삼키고 0 을 돌려준다 (목록 조회를 막지 않는다)

### tests/generation-jobs-client.test.ts (2)
> (머리말 없음)
- reports queued and completed without exposing result data to the trace callback
- reports a failed terminal job before rejecting

### tests/generation-jobs-columns.test.ts (4)
> (머리말 없음)
- finalize 가 읽는 input_snapshot 을 포함한다
- finalize 가 읽는 target 을 포함한다
- 작업 target은 appearanceKey를 보존한다
- 대기와 실패 슬롯은 characterId, appearanceKey, view를 모두 구분한다

### tests/generation-queue.test.ts (6)
> (머리말 없음)
- 그리드 잡의 writerShotIds 를 펴서 전부 대상으로 삼는다
- 구 단일 경로(writerShotId)와 director 의 shotId 도 함께 인식한다
- 요청하지 않은 종류의 잡은 세지 않는다 (영상 큐가 이미지 스피너를 켜면 안 된다)
- target 이 비어도 터지지 않는다
- 캐릭터/로케이션을 종류별로 갈라 담는다
- 해당 종류가 하나라도 있으면 true

### tests/generation-quota-rejection-event.test.ts (3)
> (머리말 없음)
- records the rejection as an observability event with kind/scope/counts
- keeps the standard quota body contract the client toast depends on
- never lets a recording failure change the 429 response

### tests/generation-quota-split-pools.test.ts (7)
> (머리말 없음)
- counts only video kinds against the video cap (3)
- counts only image kinds against the image cap (6)
- lets video run while the image pool is saturated — the C1 regression
- exempts admin accounts from the per-user cap
- still applies the global fal-slot semaphore to admins
- treats admin-lookup failure as a normal user (quota still applies)
- names the saturated pool so the client toast can distinguish video vs image

### tests/i18n-korean-scan.test.ts (1)
> (머리말 없음)
- 비주석 한글 라인 수가 허용 목록을 넘지 않는다 (배치마다 래칫 다운)

### tests/i18n-missing-key-scan.test.ts (4)
> (머리말 없음)
- t()/translate() 로 부르는 정적 키가 한국어 사전에 전부 있다
- 스캐너가 실제로 키를 찾아낸다 (빈 결과로 통과하는 것 방지)
- 이어붙인 문자열도 한 키로 합쳐 본다
- 변수가 섞인 동적 키는 판정하지 않는다

### tests/inline-markdown.test.ts (16)
> (머리말 없음)
- strips **bold** markers to plain text (bold suppressed in chat UI)
- renders *italic* and _italic_ as <em>
- strips __bold__(밑줄 2개) markers to plain text (오너 실측: 밑줄 노출)
- strips __bold__ mixed with sentence, no leftover underscore or <strong>
- strips leading #/##/### heading markers but keeps the body text
- does not strip a mid-line # (only line-start heading markers)
- renders `code` as <code>
- removes all double asterisks without leaving <strong>
- escapes raw HTML so injected markup cannot execute (XSS)
- strips bold markers around a script tag but still escapes it (no <strong>, no exec)
- escapeHtml handles &, <, >, quotes
- plain text passes through unchanged
- 문두/공백 뒤 @토큰을 sky span으로 감싼다
- 구두점 앞에서 토큰이 끝난다
- 이메일 주소는 물들이지 않는다
- escape된 HTML 안전성 유지 (멘션 뒤 태그 주입 불가)

### tests/instrumentation.test.ts (6)
> (머리말 없음)
- nodejs 런타임에서 server_errors 에 insert 한다
- edge 런타임은 insert 를 스킵한다
- message/stack 을 각각 500/1000자로 절단한다
- Error 가 아닌 값도 문자열화해 기록한다
- insert 실패는 삼킨다(진단이 제품을 막지 않는다)
- supabaseAdmin import 자체가 던져도 삼킨다

### tests/internal-id-scrub.test.ts (9)
> (머리말 없음)
- sh_02_07 → Scene 2 · Shot 7 (로케일 무관 단일형, 0패딩 제거)
- sc_04 → Scene 4, 패턴 밖은 null
- 산문 속 샷·씬 id 를 표시명으로 치환한다
- 과거 스테이지 마커는 걷고 [L3] 스크립트 라인 참조는 보존한다
- 과거 스테이지 마커는 새 요청 이력에서도 제거한다
- 이름 맵이 오면 char/loc id 도 이름으로 바꾼다
- ---·ㅡㅡㅡ·—— 만으로 된 줄은 걷힌다
- 본문 속 하이픈과 "- " 목록 항목은 보존한다
- 라벨에 id 가 붙지 않고, ref 가 식별을 전담한다

### tests/job-error-class.test.ts (2)
> (머리말 없음)
- 빈/모르는 메시지는 unknown — 분류 실패가 아니라 축적 대상
- moderation 만 moderation, 나머지는 generic — Bad Request 는 reconcile 경로로 가야 한다

### tests/lifecycle.test.ts (8)
> (머리말 없음)
- cast order does not change the source hash
- contracted source field changes alter the hash
- background source changes alter the source hash
- reports writer stale and selected artist image stale without regenerating anything
- requires fallback non-object producer cast main images and warns on objects/worlds
- uses writer references when provided and ignores non-referenced fallback characters
- treats unknown writer status as blocking, never ready
- unlockThrough advances reachedStage without changing currentStage

### tests/llm-archive.test.ts (6)
> LLM 호출 전문 아카이브(#llm-archive 2026-08-10) 회귀.
- 호출 전문(system/prompt/response)과 계측을 그대로 기록한다
- DB 프로젝트가 아닌 run(로컬 하네스 id)은 기록하지 않는다
- 킬 스위치가 켜지면 즉시 no-op
- 비정상적으로 큰 본문은 상한에서 자르고 잘렸음을 남긴다
- DB 실패는 삼킨다 — 파이프라인을 죽이지 않는다
- 빈 배열은 호출하지 않는다

### tests/llm-retry.test.ts (6)
> (머리말 없음)
- classifies network / overload errors as transient (retryable)
- classifies per-request timeout / abort as transient (sleep/stall recovery)
- treats permanent errors (4xx / parse) as non-transient (fail fast)
- separates quota exhaustion from generic overload
- counts 429 retries but not 503 retries
- counts a quota hit even when retries are exhausted

### tests/llm-schema-gate.test.ts (7)
> #p4-json-guard — LLM 산출 스키마 게이트 검증.
- Dramaturgy: world_inventory 소실을 거부한다
- Scenes: 빈 씬 배열(절단 복구가 아이템을 다 버린 형태)을 거부한다
- Scenes: 씬에 scene_actions 가 없으면 거부한다
- Scenes: narrative_time 누락·임의 문자열을 거부한다
- %s 출력 형식이 narrative_time과 time_of_day를 분리한다 (표)
- Scenes: 미지 필드는 거부하지 않는다(원본 반환 원칙과 합)
- NarrativeStructure: acts 빈 배열을 거부한다

### tests/login-capslock.test.ts (1)
> (머리말 없음)
- 키 입력에서 CapsLock 상태를 읽고, 꺼짐과 blur 때 안내를 숨긴다

### tests/object-blocking-enforcement.test.ts (7)
> (머리말 없음)
- 실사고 재현: 엿판이 blocking 에 있으면 prop_placement 로 옮긴다
- 사물만 있는 인서트 컷도 처리한다 — blocking 이 비어도 소품은 남는다
- 이미 prop_placement 에 있으면 중복해 넣지 않는다 (모델이 양쪽에 쓴 경우)
- 사물이 없으면 원본을 그대로 돌려준다 (불필요한 객체 생성 없음)
- blocking 이 비어 있으면 손대지 않는다
- 사람 여럿 + 사물 여럿을 한 번에 가른다
- 결정론 — 같은 입력이면 같은 출력

### tests/persist-facets.test.ts (6)
> (머리말 없음)
- persists static_spec and prompt_source_hash on inserted shot rows
- keeps the legacy prompt path when FACET_RENDER is off
- uses facet rendered prose only for static_spec shots when FACET_RENDER is on
- falls back to deterministic templates when a FACET_RENDER chunk throws
- skips facet rendering and preserves prompt when prompt_source_hash matches
- carries forward current user-edit columns while overwriting pipeline facet outputs

### tests/plan-entitlements.test.ts (11)
> (머리말 없음)
- free
- s1
- s2
- s5
- s10
- p10
- p15
- p20
- p25
- p30
- 미지 plan은 free로 떨어진다

### tests/portrait-paper-trim.test.ts (3)
> (머리말 없음)
- 우측 [보더 2px + 종이 15px]·상단 종이 6px 가 걷힌다 (실측 모사)
- 띠 없는 그림(세로 그라데이션 배경)은 그대로 — 배경을 종이로 오인하지 않는다
- 전면 종이색(243) 극단 입력도 변당 10% 상한까지만 걷는다

### tests/produce-chat-locale-follow.test.ts (6)
> (머리말 없음)
- 한글 발화 + en 프로젝트: ko 로 저장하고 이번 턴부터 ko 로 응답한다
- 영어 발화 + ko 프로젝트: en 으로 강등하지 않는다 (비대칭)
- 영어 발화 + en 프로젝트: 채택 없음, contentLocale 은 en 그대로
- writer 산출물이 있는 프로젝트는 한글 발화여도 언어를 바꾸지 않는다
- 저장 실패 시 locale 을 승격하지 않는다 — 응답 언어와 저장 상태가 갈리면 안 된다
- 소유가 아닌 프로젝트는 조회도 채택도 하지 않는다

### tests/project-delete-route.test.ts (6)
> (머리말 없음)
- rejects unauthenticated callers before touching the database
- deletes through the single RPC with the caller identity
- maps not_found to 404
- maps forbidden to 403
- surfaces RPC errors as 500 without claiming success
- fails closed on an unexpected RPC status

### tests/project-store-create-errors.test.ts (2)
> (머리말 없음)
- returns a failure and does not expose the previous project id after a slot-limit response
- returns the created id and warnings without changing the request contract

### tests/ref-sheet-cleanup.test.ts (3)
> (머리말 없음)
- 배치 그리드 ref (타임스탬프 네이밍) — 경로 추출
- 단건 스트립 ref (고정 네이밍 + ?v= 캐시버스터) — 쿼리 제거 후 추출
- ref 가 아닌 자산은 전부 null — 러프 프레임·실사 산출·템플릿·업로드

### tests/repaint-crop.test.ts (2)
> (머리말 없음)
- 보더가 스펙 자리 그대로여도, +6px 드리프트해도 프레임에 보더·종이 픽셀이 없다
- 세 프레임 크기가 전부 동일하다 (셀 표준 — 영상 레퍼런스 전제)

### tests/resolve-entity-names.test.ts (10)
> (머리말 없음)
- 문장 안의 id 를 이름으로 바꾼다
- 접두 일치로 오인하지 않는다 — char_30 을 char_3 으로 읽으면 다른 인물이 된다
- 이름을 모르는 id 는 그대로 둔다 (지어내지 않는다)
- 맨몸 "Char" 는 건드리지 않는다 — 어느 인물인지 알 수 없다
- 치환 후 남는 동격 괄호는 벗긴다
- 이름이 아닌 괄호는 유지한다
- char_ ↔ character_ 표기 차이를 흡수한다
- 빈 입력·빈 목록에 안전하다
- 인물과 장소를 한 목록으로 — 한 문장에 섞여 나온다
- manifest 가 없으면 빈 목록

### tests/route-writer-export.test.ts (6)
> (머리말 없음)
- returns 401 for unauthenticated requests
- returns 403 for authenticated non-owners
- returns a normalized projection for an owner with a completed run
- prefers an older completed run over a newer failed run with data
- prefers an older completed run from the scoped extra query when the recent window is failed-only
- returns all-null stages for an owner with no run

### tests/script-lines.test.ts (9)
> (머리말 없음)
- uses global continuous numbering across scene headings, actions, and dialogue
- keeps one semantic line per heading, shot action, and dialogue entry
- formats scene headings with location only or location plus mood
- handles empty input, scenes without shots, and orphan shots at the end
- uses L labels with stable line refs
- stays prefix-safe with activeMentionRefs for @L4 and @L45
- keeps [L#] markers aligned with buildScriptLines line numbers
- resolves L45 and @L45 against the send-time line snapshot
- drops missing labels, avoids prefix confusion, dedupes, and handles empty lines

### tests/seed-test-accounts.test.ts (10)
> (머리말 없음)
- defaults to 10 when no count is given
- reads a positional integer
- reads --count <n> and --count=<n>
- clamps above the max (100)
- rejects zero, negatives, NaN, and non-integers
- produces a test- prefixed 8-hex local part
- produces an @tale.studio email
- is unique across calls
- is a 16-char base64url string
- is unique across calls

### tests/shots-cache.test.ts (7)
> (머리말 없음)
- 동시 호출 둘은 한 요청으로 합쳐진다 (writer·director 가 같이 진입하는 상황)
- 신선 기간(30초) 안의 재호출은 네트워크 없이 즉답한다
- 프로젝트가 다르면 칸이 다르다 — 섞이지 않는다
- 무효화 뒤의 loadShots 는 신선 기간과 무관하게 다시 받는다
- 다른 프로젝트의 칸은 건드리지 않는다
- 성공: { data: 행들, error: null }
- 실패: 던지지 않고 { data: null, error: { message } } — 옛 supabase 반환 모양 보존

### tests/suggestion-dismiss.test.ts (12)
> (머리말 없음)
- 다른 제안(선택지)이 떠 있으면 핸드오프 제안은 무시된다 — 슬롯이 비면 재시도로 성공
- implicit dismiss(유저가 다른 말) 후에는 같은 id 가 다시 뜰 수 있다
- explicit dismiss("나중에") 후에는 같은 id 재발사가 막힌다
- 선점 요청이 없으면 기존 제안이 유지된다 (암묵 교체 금지)
- 선점 요청이 있으면 떠 있는 선택지를 밀어낸다
- 내릴 수 없는 제안(웰컴 등)은 선점해도 밀리지 않는다
- 이미 그 제안이 떠 있으면 선점해도 그대로 (반복 호출이 상태를 흔들지 않는다)
- 명시적으로 거절한 제안은 선점으로도 되살아나지 않는다
- 명시적 dismiss(확정 실패·수정 피드백) 후에도 blocking 게이트는 다시 뜬다
- 일반(dismissible 미지정) 제안은 여전히 명시적 dismiss 후 재발사가 막힌다 (래치 회귀 방지)
- 떠 있는 blocking 게이트는 다른 제안이 선점(preempt)으로도 못 밀어난다
- 폴링 self-heal(반복 재등록)은 떠 있는 게이트를 흔들지 않는다

### tests/take-cost.test.ts (5)
> (머리말 없음)
- v4 확정 계수 표를 갖는다
- 모델별 계수를 그대로 반환한다
- null/undefined 는 드래프트 기준 1로 폴백한다
- 레지스트리에 없는 임의 문자열도 1로 폴백한다
- 항상 드래프트 단가 1을 반환한다

### tests/take-hold-wiring.test.ts (5)
> (머리말 없음)
- mode=off 는 hold RPC 를 타지 않고 정상 제출한다
- enforce 모드에서 잔액 부족이면 402 + 잡을 failed 로 마킹하고 shots 낙관 갱신을 하지 않는다
- shadow 모드는 잔액 부족이어도 통과시켜 잡을 정상 제출한다
- director-video-takes.markDirectorVideoAttemptFailed 는 fail RPC 후 release RPC 를 부른다
- release 실패는 삼키고 실패 마킹 자체는 성공한다

### tests/take-hold.test.ts (13)
> (머리말 없음)
- 미설정이면 off
- 미지 값도 off로 폴백한다
- shadow/enforce 를 그대로 인식한다
- mode=off 는 RPC 를 타지 않고 통과시킨다
- admin 워크스페이스는 RPC 를 타지 않고 통과시킨다
- shadow 는 enforce=false 로 RPC 를 호출한다
- enforce 는 enforce=true 로 호출하고 insufficient 를 그대로 전파한다
- insufficient 이버트 generation_submit_rejected_takes 이벤트를 기록한다
- RPC 에러를 전파한다
- admin 판별 실패는 일반 유저로 취급해 RPC 를 타다
- mode=off 여도 RPC 를 호출한다(과거 shadow hold 정리)
- null 데이터는 0으로 정규화한다
- RPC 에러를 전파한다

### tests/take-ledger.test.ts (11)
> (머리말 없음)
- 원장 delta 를 합산한다
- 빈 원장은 0을 반환한다
- 쿼리 에러를 전파한다
- 양수 delta 로 grant 행을 삽입한다
- amount<=0 은 삽입 전 throw 한다 (grant 계열 check 위반 방어)
- 정수가 아닌 amount 는 삽입 전 throw 한다
- grant_* 가 아닌 kind 는 거부한다
- reason 이 있으면 manual_adjust 행을 삽입한다(음수 delta 허용)
- reason 없으면 삽입 전 throw 한다
- adminUserId 없으면 삽입 전 throw 한다
- delta=0 은 삽입 전 throw 한다

### tests/unstable-hook-deps.test.ts (3)
> 훅 deps 불안정 참조 감지 — 실패 모드 (2026-08-25 오너 결정으로 경고→실패 승격).
- 검사기가 크래시하지 않고 src/ 전체를 검사한다
- 베이스라인 밖 새 검출이 있으면 실패한다
- 베이스라인 3건은 여전히 검사기 결과에 unknown 으로 존재한다 (참고용 — 사라지면 검토)

### tests/v2-dynamic-spec-shape.test.ts (3)
> writer-v2 가 저장한 dynamic_spec 모양(문자열)이 모션 계약 컴파일을 깨뜨리는지 재현.
- character_motion 이 문자열이면 계약 컴파일이 죽지 않아야 한다
- camera_motion 문자열의 실제 뜻(tracking)이 static 으로 접히지 않아야 한다
- character_motion 문자열을 영상 계약에 보존해야 한다

### tests/v3-scene-plan-extract.test.ts (3)
> (머리말 없음)
- 기대형 { scene_plans: [...] } 수용
- 최상위 배열 [...] (Gemini 변형) 수용 — 사고 케이스
- 빈/malformed 응답은 빈 배열

### tests/v4-shot-count-guard.test.ts (10)
> #p4-json-guard — v4 샷 배열 가드 (Q6 "repairJson 무신호 손실"의 현장).
- 정확히 맞으면 ok
- 기대치가 없으면(Compact) 항상 ok
- plan 경로의 ±1 은 허용(프롬프트 계약과 합치)
- 데쿠파주 경로는 ±1 도 재시도 대상(index 매핑이라 정확 일치 필요)
- Q6 시나리오: 최종 시도에 8→2 는 fatal (수용 금지)
- 경미한 어긋남(8→6)은 최종 시도에서 수용 — 배지로만 남는다
- 절반 경계(8→4)는 수용, 그 아래(8→3)는 fatal
- 초과는 소실이 아니므로 최종 시도에서 수용(배지)
- repairJson 은 복구에 성공하지만 손실 경고를 남긴다(종전: 무신호)
- 복구된 배열은 파싱을 통과하지만 개수 가드가 fatal 로 잡는다

### tests/wheel-notch.test.ts (5)
> Ctrl+휠 축척 스텝퍼(#a1 2026-07-15) — burst(연속 이벤트 묶음) = 1단계 계약 검증.
- 단발 노치(이벤트 1개) = 1단계, 방향은 deltaY 부호
- 스무스 스크롤이 노치 1칸을 여러 이벤트로 쪼개 보내도(간격<GAP) 1단계만
- 의도적으로 띄엄띄엄 굴리면(간격>GAP) 굴림마다 1단계
- 길게 이어지는 burst(프리스핀)는 REPEAT 간격마다만 추가 단계
- deltaY=0 이벤트는 무시한다

## manual — 실제 API·Fal·라이브 스키마가 필요한 수동 테스트

### tests/appearance-flashback-live.manual.test.ts (7)
> 회상 장면에서 모습이 실제로 골라지는지 — 운영 DB 에 실데이터를 만들어 검증한다.
- 과거 모습이 둘이면 지정 없이는 자동 선택하지 않는다
- 그 장면에 모습을 지정하면 지정한 것이 이긴다
- 현재 장면은 기본 모습을 고른다
- 미래 장면은 맞는 모습이 없어 기본 모습으로 떨어진다
- DB 제약이 "기본 모습은 하나"를 실제로 막는다
- DB 제약이 없는 모습을 가리키는 지정을 막는다
- DB 제약이 허용되지 않는 시점 값을 막는다

### tests/i18n-layer-bleed-live.manual.test.ts (1)
> (머리말 없음)
- 같은 한국어 스토리+캐스트로 outputLocale en/ko 순차 구동 — 레이어별 JSON 저장

### tests/i18n-output-locale-live.manual.test.ts (1)
> (머리말 없음)
- outputLocale=en → 산출 자유서술 전부 영어 / ko → 한국어

### tests/narrative-time-live.manual.test.ts (1)
> 이야기 생성이 서사 시점을 실제로 내놓는지 — 진짜 모델을 호출해 검증한다.
- 회상이 있는 스토리에서 씬마다 present/past/future 중 하나가 나온다

### tests/produce-attach-live.manual.test.ts (1)
> (머리말 없음)
- 실존 슬라이스 URL 이 화이트리스트를 통과하고, 모델이 내용을 실제로 읽는다

### tests/queue-console-live.manual.test.ts (1)
> (머리말 없음)
- 목록 → stale 회수 no-op → 가짜 실패 잡 삽입·삭제 → completed 삭제 거부

### tests/rough-crop-battery.manual.test.ts (1) — writer 에도 속함
> (머리말 없음)
- 코퍼스 ${files.length}장: 균일·빈밴드·라벨 지표

### tests/rough-sheet-live.manual.test.ts (1) — writer 에도 속함
> (머리말 없음)
- ${FMT} grid4: storage 템플릿 → fal 생성 → cropRoughGridFrames 파싱

### tests/sheet-formats-e2e.manual.test.ts (1)
> (머리말 없음)
- templateAssetUrl 시드 → rough force 재생성(세로 grid) → director 개별 재생성(가로 3열 리페인트)

### tests/sheet-formats-live.manual.test.ts (1)
> (머리말 없음)
- 신규 템플릿 러프 4종 + 세로 스트립 리페인트 — 수락·치수·크롭 파스

### tests/storyboard-appearance-live.manual.test.ts (5) — writer 에도 속함
> 최종 스토리보드가 "샷에 저장된 모습"으로 참조 이미지를 고르는지 — 실제 DB 로 검증한다.
- 운영 샷이 등장인물마다 모습 키를 하나씩 갖는다
- 저장된 모습 키가 실제 모습 행을 가리킨다 (끊어진 참조 0건)
- 과거 장면으로 바꾸면 그 샷의 참조가 젊은 시절 시트로 바뀐다
- 스냅샷이 비면 유료 제출 전에 막힌다
- 영상 경로도 같은 스냅샷 계약을 쓴다

### tests/template-asset-live.manual.test.ts (1) — artist 에도 속함
> (머리말 없음)
- 가짜 구판을 심으면 승격 호출이 지우고, 현재본과 타 자산은 남는다

## experimental — 실험용 파이프라인 검증 — 기본 테스트에 포함하지 않음

### tests/pipeline/writer_stage_experiment.test.ts (0) — writer 에도 속함
> writer 단계 실험 하네스 — 실 stage 함수를 gemini-3-flash로 직접 호출(#length-experiment 2026-07-21).
