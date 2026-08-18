# n4-direction-end-generation-timing — Direction·END 산출이 언제 트리거되고 어디서 끊기는가

- status: `done  # 조사 완료 — 미생성 경로 확정. END 제외 분기는 부재`
- source: `_INBOX.md` snapshot `751c326ecb3d456facf594118ca278688dd12e0f3dfce4d90c6466957327f6b5` (fingerprint `12dec5aac06db440`, byte range 0-9531)
- run: `night-2026-08-18-b3d63b8d6e5342b6a76bfdead586277e` · contract `86d3be3fdcb41ea6`
- 실행 주체: night-investigator 백지 조사 작업자 (읽기 전용 Read/Grep/Glob, 모델 sonnet — fable 금지 준수)
- 자율성 레벨: 1 (사실 기계 — 조사만, 코드 수정·유료 발주 없음)
- operation_key: `n4-direction-end-timing-v1`

## 원문 인용 (형석 메모)

> Direction, END 언제 생성되는지 확인 (현재 제대로 Direction이 생성되지도 않고 잘 작동하지도 않음)
> END 프레임을 재생성해주되 실제 영상 생성에서 빼기

## interpretation

샷의 연출 지시문(Direction)과 마지막 프레임(END)이 언제 만들어지는지 오너·친구가 파악하지
못하고 있고, Direction 은 아예 산출되지 않는 경우가 있다는 주장이다. 트리거 지점과 선행
조건은 코드 안에 있으므로 사실로 닫힌다. "잘 작동하지 않는다"는 품질 판정이므로 이 조사의
대상이 아니다 — 산출 여부와 경로만 본다.

## observation — 이 조사가 답해야 할 질문

Direction 과 END 프레임을 만들어내는 코드 자리가 각각 어디이고, 그 자리에 도달하지 못한 채
끝나는 경로가 존재하는가.

## 선기입 수용 기준

1. Direction 값을 채우는 자리를 전부 `파일:줄` 로 나열한다. 파이프라인 단계 이름과 실행
   순서상 위치를 함께 쓴다.
2. END 프레임(마지막 프레임 그림)을 만드는 자리를 전부 `파일:줄` 로 나열한다.
3. 각 자리의 **선행 조건**(이 조건이 거짓이면 건너뛴다)을 조건문 근거와 함께 쓴다.
4. "Direction 이 비어 있는 채로 정상 종료되는 경로가 있다"를 **참/거짓/확인 불가** 로 판정한다.
   참이면 그 경로를 단계 이름으로 서술한다. END 에 대해서도 같은 판정을 따로 한다.
5. END 를 만들되 영상 발주 payload 에서는 빼는 분기가 이미 있는지 참/거짓으로 답한다.
6. 그림·영상의 좋고 나쁨은 판정하지 않는다. 산출 여부만 다룬다.

## 시작점 힌트 (전수는 직접 확인할 것)

- `src/lib/writer/pipeline/stages/`, `src/lib/director/`
- `src/app/api/director/generate-video/`, `src/app/api/director/generate-storyboard/`
- 검색어 후보: `direction`, `end_frame`, `endFrame`, `last_frame`, `tail`, `composition_prompt`

## 결과 카드

- 판정: **pass** — 수용 기준 6항목 충족. 핵심 판정 둘 다 나옴
- created_at: 2026-08-18T02:53Z · estimated_review_min: 5 · reviewed_min: — · carryover_min: —
- 지출: $0 · 코드 수정 0건 · 그림/영상 품질 판정 0건

### 확인한 것 — ① Direction 은 왜 안 생기나

**Direction 과 END 는 따로 만들어지지 않는다.** 세 파이프라인 모두 3칸짜리 그림 한 장을 받아
`cropRoughGridFrames` 한 번으로 START·DIRECTION·END 를 **동시에** 잘라낸다
(`src/lib/writer/rough-grid-crop.ts:31-35,402,447`). 그래서 "Direction 만 비는" 손상은
구조적으로 생기지 않는다 — 셋 다 있거나 셋 다 없다.

**비어 있는 채로 정상 종료되는 경로는 있다 (판정: 참).**
Director 단일샷 생성은 진입할 때 러프 3프레임이 **전부** 있어야 3칸 모드로 간다
(`src/app/api/director/generate-storyboard/route.ts:80-88`). 하나라도 없으면 단일 이미지
모드로 갈라지고(`:166-175`), 그 결과는 `frames` 키 **자체가 없는** 채로
`status:'completed'` 로 정상 종결된다(`src/lib/fal/finalize.ts:928-940`).
즉 **writer 러프가 3프레임을 못 갖춘 샷은 director 에서 아무리 다시 만들어도 Direction·END 가
영영 안 생긴다.** 이것이 형석이 본 증상과 가장 잘 맞는 경로다(추정 — 실제로 그 샷이 이 경로를
밟았는지는 DB 이력을 봐야 확정).

부가 사실: 그림이 5만 바이트 미만이면 모더레이션·빈 이미지로 보고 예외를 던져 DB 기입을
건너뛴다(`finalize.ts:1051-1054`, `:843-845`). 그래서 "반쯤 채워진" 손상은 없다.

### 확인한 것 — ② "END 만들되 영상에서 빼기" 는 지금 반대다

**판정: 거짓 — 그런 분기는 없다. 현재 코드는 END 를 넣고 DIRECTION 을 뺀다.**

영상 발주 참조 그림은 `[frames.start, frames.end]` 두 장이다
(`src/stores/director-store.ts:2352-2357` → `generate-video/route.ts:486-490,513`).
previz 영상도 같다(`generate-previz-video/route.ts:93,106`). 주석이 이유를 적어놨다 —
"시작·끝 구도 고정".

반대로 **DIRECTION 은 어떤 영상 발주 payload 에도 들어가지 않는다**. 유일한 소비처는 사람이
화살표를 고치는 편집 화면뿐이다(`src/lib/writer/directing-edit.ts:78,89,135,145,188`,
`src/features/writer/directing-arrow-editor.tsx:52`).

### 확인 못 한 것

- 형석이 본 샷이 셋 중 어느 경로였는지 — 러프 자체 실패인지, 러프 미완성 상태에서 director 를
  부른 것인지, 일괄 생성인지. 코드로는 특정 불가. `shots.rough_storyboard` 와
  `generation_jobs` 이력을 봐야 한다.
- Direction 칸의 화살표가 잘 그려졌는지 등 **그림 품질은 판정하지 않았다**(계약 §9).

### 다음 조치 — 오너/형석 판단 필요

"END 를 빼되 만들어달라"를 구현하려면 `director-store.ts:2357` 의 참조 배열에서 END 를 빼는
게 유력한 자리다. 다만 그 END 는 지금 **끝 구도를 고정하는 용도로 일부러 넣은 것**이라,
빼면 무엇이 끝 구도를 잡을지가 새 질문이 된다. 형석 메모도 "대신 확인해야함 END 프레임처럼
영상이 안 나올 수 있어서"라고 같은 걱정을 적어놨다 — 이건 발주해서 눈으로 봐야 닫히는
항목이고, 레벨 1 밤은 유료 발주를 하지 않는다.
