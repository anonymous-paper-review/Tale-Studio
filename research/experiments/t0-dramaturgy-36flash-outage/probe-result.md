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
