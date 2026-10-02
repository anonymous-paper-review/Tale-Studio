<!-- 확정 레시피 R1의 "방향어 + 우선순위 줄" 조립 스펙 (2026-10-02 오너 확정, 가이드 §6 36). facet 사이클 9의 R1c 조건에서 쓴 스펙 그대로다 —
     컴파일이 끝난 폴더(filled.json + prompts.md)에서 priority.md를 만든다. 과장 상한("slightly")과 손 항목 보강은 들어 있지 않다(다음 사이클 검증 후보). -->

# 작업: 우선순위 줄과 방향어 보강 (사이클 9 R1c — 컴파일 규칙 후보)

이 폴더의 `filled.json`과 `prompts.md`만 보고 `priority.md`를 쓴다. 원본 이미지는 없다. 템플릿에 없는 속성을 지어내지 마라. 작가·작품·브랜드 고유명사 금지. 다른 파일을 만들거나 고치지 마라. 외부 검색 금지. 최종 메시지에 `priority.md` 전문.

배경: 같은 참조 이미지에서 손으로 쓴 스타일 프롬프트는 "oversized", "compressed", "very thick" 같은 방향어와 끝에 붙인 우선순위 줄로 과장을 전달했고, 우리 컴파일은 수치("0.72 head high", "0.88% of width")만 실어 생성기가 과장을 약하게 그렸다. 수치는 그대로 두고 방향어와 우선순위 줄만 보탠다.

## priority.md 형식 (헤더는 글자 그대로, 헤더 바로 아래에 문단 하나)

## PRIORITY
영문 한 줄, 35단어 이내. "Priority order:"로 시작해 `분류.Core`에 적힌 순서대로 상위 4~5개 특징을 " → "로 잇는다. 수치는 쓰지 않고 방향어로 쓴다(very thick, compressed, stretched, oversized, angular, flat, hard-edged). `분류.Core`에 없는 특징은 넣지 않는다.

## FIGURE
`prompts.md`의 FIGURE 문단을 그대로 옮기되 아래 규칙으로만 고친다. 그 밖의 문장과 수치는 한 글자도 바꾸지 않는다.
- 비례 수치마다 사실 비례 대비 방향어를 그 수치 바로 앞에 붙인다: 몸통 길이가 신장의 30% 미만이면 "a compressed torso"; 종아리(무릎~발바닥) : 허벅지가 1.4 : 1 이상이면 "stretched lower legs"; 다리 비율이 55% 이상이면 "long legs"; 신발 높이가 머리 높이의 0.6배 이상이거나 길이가 0.9배 이상이면 "oversized"; 손이 얼굴 높이의 0.8배 이상이면 "oversized hands"; 어깨 폭이 머리 폭의 1.5배 이하이면 "narrow shoulders". 문턱에 못 미치는 수치에는 방향어를 붙이지 않는다.
- `filled.json`의 `인물.비례.등신` 값에 모자나 머리카락이 정수리를 가렸다는 말이 있거나 등신이 6 미만이면, 등신 구절 뒤에 "measured to the top of the hair or hat, so keep the skull itself small"을 붙인다.
