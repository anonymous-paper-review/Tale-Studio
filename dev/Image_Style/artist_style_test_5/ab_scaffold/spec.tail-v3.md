

## 출력 형식 (`analysis.md` — 지침의 "출력 계약" 표를 따른다. 헤더는 아래 제목까지만 글자 그대로)

```
# Style Card — refer5
## 0. META
## 1. 분석
## 2. 재질 사전
## 3. Style Vector
## 4. 특징 분류
## 5. CAPSULE
## 6. FIGURE_RULES
## 7. NEGATIVE
## 8. OVERRIDE
## 9. QA_CHECKS
## 10. NOTES
```

위 블록은 헤더 이름 예시일 뿐이다 — 실제 Style Card 전체를 코드블록으로 감싸지 않는다. CAPSULE(영문 2~4문장)·FIGURE_RULES(영문 1문단, 표본 없으면 첫 토큰 `[EXTRAPOLATED]`)·NEGATIVE(영문 1문장, 최대 35단어, "Avoid"로 시작)는 각각 헤더 바로 다음 줄에 문단 하나로 적는다 — 표·목록·따옴표·코드블록 금지(파서가 헤더 다음 문단을 그대로 프롬프트에 넣는다).
