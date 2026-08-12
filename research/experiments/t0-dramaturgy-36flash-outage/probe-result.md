# 조합 분리 프로브 — 3.6-flash 빈 응답 원인 확정 (2026-08-11 오전, 오너 요청)

REST v1beta 직행, 동일 프롬프트 × 4조합 × 2모델 (probe-websearch-json.mjs):

| 모델 | googleSearch+JSON | JSON만 | 툴만 | 둘 다 없음 |
|---|---|---|---|---|
| gemini-3.6-flash | **HTTP 200 · candidates 0** (finish 없음·promptFeedback null·에러 없음) | 정상 | 정상 | 정상 |
| gemini-3-flash-preview | 정상 | 정상 | 정상 | 정상 |

**확정**: 원인은 `googleSearch 툴 + responseMimeType: application/json` **조합 그 자체**이고, 3.6-flash에서만
무신호(200 + 빈 candidates)로 온다. 에러도 안전차단 피드백도 없어 클라이언트가 구분할 수 없음 —
제품은 gemini.ts:95에서 "empty response"로 던지고, s0.5만 Safe가 흡수한다.

## 영향 반경 (grep: webSearch: true — 전부 generateJson=JSON 강제 경유)

- `s0_dramaturgy.ts:110` — Safe 흡수 → **무신호 사망** (재료 없이 진행)
- `s1_structure.ts:80` · `s3_scenes.ts:282` · `s1s3_merged.ts:166` — Safe 없음 → 재시도 소진 후 **런 하드 실패**

즉 f6d8e58(기본 3.6-flash) 이후의 **다음 writer 풀런은 s1에서 죽는다** (완료 런 writer_test_260810은 8/10, 전환 전).

## 수리 선택지 (오너 결정)

(a) webSearch 콜만 JSON mime 해제 → 텍스트로 받고 repairJson 파싱 (조합 회피, 모델 유지)
(b) webSearch 스테이지만 preview 계열로 모델 예외 핀 (조합 유지, 모델 이원화)
(c) 2단 분리: 검색 콜(텍스트) → JSON 정형화 콜 (콜 2배)

## 수리 적용 (2026-08-11 오전, 오너 지시)

- 외부 문서 결론: 공식 문서는 "Gemini 3 계열은 구조화 출력+검색 병용 지원"이라 하나, 실측상 3.6-flash는
  스키마 동반(A2)·mime 해제(B) 모두 **검색이 발화하지 않음**(groundingMetadata 부재) — 안 죽을 뿐 접지 상실.
  같은 증상 스레드에 Google 스태프 "Investigating"(2026-08-05) — 공식 픽스 없음, 리포터도 preview 회귀 중.
- **채택 수리 = (b) 그라운딩 모델 핀**: `src/lib/writer/llm/gemini.ts` — `opts.webSearch`면 axisConfig 모델보다
  우선해 `GROUNDING_MODEL='gemini-3-flash-preview'` 사용(접지 실동작 유일 확인 모델). 리그레션 해소 시 핀 제거.
- **+ 접지 미발화 감시**: webSearch 요청인데 groundingMetadata 없으면 console.warn (무신호 기능 상실 표면화, throw 아님).
- 검증: 제품 경로 그대로(S축 3.6-flash 해석) 브리지 재실행 → 핀 발동·스테이지 정상(17.2s, 후보 3) + vitest 973 통과.

## 최종 처방 (2026-08-11 오후, 오너 결정: "claude랑 병합")

- **채택 = (d) 접지 콜 프로바이더 이관**: `dispatch.generateJson`이 `webSearch && gemini`를 C축 기본
  (claude-sonnet-4-6)으로 라우팅, `claude.ts`에 `web_search_20260209` 서버 툴 배선(max_uses 5) +
  접지 미발화 warn(gemini와 대칭). gemini preview 핀은 직접 호출자용 2차 방어로 유지.
- **배선 중 실측 2건**: ① 검색 동반 시 Claude 최종 텍스트가 "서술+```json 펜스"로 와서 파서 거부
  → JSON 본체 슬라이스 복구 폴백 + webSearch 전용 지시 보강으로 해소. ② 제품 경로 검증에서
  검색 실발화 확인(실존 뉴스 접지), 단 **그라운딩 콜 지연 큼**(재난물 픽스처 260s vs preview 15s —
  검색 3회+대형 응답). 산출 후보 수도 6개로 gemini(3)와 다름 — 스타일 차는 후속 A/B 재료.
- 검증: 직접 프로브 OK(23s) + 제품 경로 브리지 OK(260s, 라우팅 로그 확인) + vitest 973 통과.

## 재판정 (2026-08-12, 오너 질문 "다른 flash 모델로 옮기면 안 되나")

**계기 결함부터**: 앞 프로브(`probe-websearch-json.mjs`)는 HTTP/candidates/textLen 만 봤다. 3.6-flash 의
실제 증상은 "응답은 오는데 검색이 발화하지 않는다"(groundingMetadata 부재)라 **접지 여부를 직접 봐야**
판정이 된다. 그리고 2모델만 봤다 — stable 계열은 미검증이었다. → `probe-grounding-models.mjs` 로 재측정.

flash 5종 × 2조합, groundingMetadata·webSearchQueries 직접 확인:

| 모델 | tools+json (제품 경로) | tools-only | 속도 | 비고 |
| --- | --- | --- | --- | --- |
| gemini-3.5-flash | ❌ 접지 없음 | ❌ | 22.9s | 3.6 과 같은 무신호 양상 |
| **gemini-3-flash-preview** | **✅ 검색어 4개** | ✅ 4개 | **18.7s** | 제품 조합에서 유일하게 발화 |
| gemini-3.6-flash | ❌ 빈 candidates | ❌ | 50.1s | 리그레션 재확인 |
| gemini-2.5-flash | ❌ **API 거부** | ✅ 3개 | 5.7s | `Tool use with a response mime type: 'application/json' is unsupported` |
| gemini-3.1-flash-lite | ❌ | ❌ | 1.8s | |

- **리그레션은 3.6 만의 문제가 아니다** — 3.5-flash·3.1-flash-lite 도 에러 없이 접지가 안 붙는다.
  즉 "stable flash 로 옮기기"는 선택지가 아니다(오너 가설 기각).
- **claude 라우팅의 실제 성적**(2026-08-11 풀런): 접지 콜 3건 중 **2건이 접지 미발화**
  (`web_search_tool_result` 부재), 소요 154.6s·144.2s. 8배 비싼 값을 내고 목적은 1/3 달성.

### 최종 처방 개정 (2026-08-12, 오너 결정 "a로 진행")

**(e) 접지 모델 우선 + claude 폴백** — `dispatch.generateJson` 의 early-return 라우팅을 제거하고,
gemini 를 1차로 두되(= `gemini.ts` 의 `GROUNDING_MODEL` 핀이 preview 로 갈아탐) **실패했을 때만**
claude 로 떨어뜨린다. 모더레이션 폴백과 같은 갈래로 합쳤다.

- preview 수명 리스크(종전 claude 채택 사유)는 **폴백이 흡수**한다 — "사라지기 전부터 느린 길로
  다니기" 대신 "사라지면 그때 떨어지기".
- 부수 이득: 접지 콜이 early-return 을 안 타게 되어 **손실 복구 재호출·모더레이션 폴백 보호를 함께**
  받는다(종전엔 둘 다 건너뛰었다).
- **제품 경로 실물 검증**(`verify-product-path.mts`): `gemini/gemini-3-flash-preview · 8.1s`,
  접지 미발화 경고 없음(= 검색 실발화), 항목 정상. claude 경유 154.6s 대비 **19배**.
- vitest 1115 통과(접지 경로 4건 신규: 1차 gemini 확인 / preview 소멸 시 claude 폴백 /
  비-접지 콜은 폴백 없음 / 접지 콜도 손실 복구 보호).
