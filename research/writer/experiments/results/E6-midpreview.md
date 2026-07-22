# E6 — midPreview 존폐 (ON/OFF × V0 산출) 결과 (기록만 — 판정 보류)

> 실행일: 2026-07-21 · 실행: 서브에이전트(Sonnet) / 셋업: Claude(Fable) · 상태: **🟡 측정 완료 — 제품 오너 일괄 판정 대기**
> 방법: ad·horror-mansion × {OFF(실 skip 경로와 동일한 emptyMidPreview) vs ON(실 midPreview 실행)} × 2 run.
> 1차 측정은 seed의 최직접 소비자 V0만 (V0에서 무의미하면 하류도 seed 경유 효과 없음).
> 원시: `logs/writer-stage-exp/{ad,horror-mansion}__*__e6{off,on}{1,2}.json`

## 요약 (쉬운 말)

midPreview는 "V축 전체의 거친 밑그림을 미리 한 번 그려서 각 단계에 힌트로 주자"는 단계인데, 실서비스
에서는 항상 꺼져 있다. 켜면 나아지는지 실측했더니 결과는 반대였다 — **밑그림을 받은 쪽(ON)이 오히려
출력이 흔들렸다**: 같은 입력인데 매체가 run마다 바뀌고(호러: 3D→실사로 갈아탐), 정해진 어휘로 써야 할
필드가 긴 자유 문장으로 풀어지고, 스타일 명칭이 run마다 크게 달라진다. 반면 꺼진 쪽(OFF)은 프리셋마다
매체·스타일이 안정적으로 수렴했다. 비용은 켜면 run당 9~10초 추가.

## 1. 결과 (8/8 성공)

| 관찰 축 | OFF (현행 skip) | ON (midPreview seed 주입) |
|---|---|---|
| medium 안정성 | **프리셋 내 100% 일관** (ad=live_action ×2, horror=3d_cgi ×2) | horror 1/2 run이 3d_cgi→live_action으로 이탈 |
| 필드 어휘 규율 | 표준 vocabulary 유지 (photorealistic·stylized_pbr·painterly) | render/texture가 문장형 자유 서술로 이탈 (예: "High-contrast Real-time Raytracing with Digital Grain") |
| style 수렴성 | run 간 동일 (ad: cinematic_modern ×2) | run 간 발산 + 장문화 ("Hyper-realistic Tech-Noir to Radiant Optimism") |
| 비용 | 0 | **+9~10s/run (콜 1개)** |

## 2. 해석

- midPreview seed는 V0에 "풍부하지만 덜 수렴적인" 입력을 준다 — V0 프롬프트의 enum 지시보다 seed의
  자유 서술이 우세해져 **스키마 규율이 무너진다**. rendering_method 같은 필드는 하류(디자인 토큰·렌더
  프롬프트)가 짧은 표준 어휘를 전제하므로 문장형 값은 품질이 아니라 부채다.
- 이 실측은 D1 감사의 "midPreview 산출(color_script 등) 소비처 부재"와 합쳐진다: **유일하게 살아 있던
  소비 경로(v0/v1/v3 seed)마저 효과가 음(-)이다.**

## 3. 권고 (판정은 보류)

**삭제 권고** — 켜서 얻는 것이 없고(개선 0, 안정성 악화) 항상 꺼져 있는 현실이 이미 정답이었다.
채택 시 변경: `mid_preview.ts` 삭제 + steps.ts 배선 제거 + v0/v1/v3의 seed 참조 문구 정리(P4)
+ MidPreview 타입·emptyMidPreview 정리. 보류 시 대안 없음 — "켜기"가 선택지가 되려면 seed가 enum
규율을 지키도록 midPreview 프롬프트를 재작성하고 재측정해야 하는데, 소비처 0 현실에서 투자 근거 없음.

## 4. 실행 각주

- 하네스 import 체인(persist_design_tokens→supabase/admin)의 모듈 로드 시점 env 요구로 Supabase env
  추가 로드가 필요했음 (E13 각주와 동일 — 하네스 의존 정리 후보. 키 미출력 확인됨).
