
## 출력 형식 (`analysis.md` — 지침의 "출력 계약" 표를 따른다. 헤더는 아래 제목까지만 글자 그대로)

```
# Style Card — refer5
## 0. META
## 1. 분석
## 2. 재질 사전
## 3. Style Vector
## 4. 특징 분류
## 5. FIELDS
## 6. CAPSULE
## 7. FIGURE_RULES
## 8. NEGATIVE
## 9. OVERRIDE
## 10. QA_CHECKS
## 11. NOTES
```

위 블록은 헤더 이름 예시일 뿐이다 — 실제 Style Card 전체를 코드블록으로 감싸지 않는다. FIELDS(`key: value` 한 줄씩, 허용값 표의 ASCII 토큰만)·CAPSULE(영문 2~4문장, 필수 토큰 포함)·FIGURE_RULES(영문 1문단, 표본 없으면 첫 토큰 `[EXTRAPOLATED]`)·NEGATIVE(영문 1문장, 최대 35단어, "Avoid"로 시작)는 각각 헤더 바로 다음에 코드블록 없이 문단/블록 하나로 적는다 — 파서가 헤더 다음 내용을 그대로 프롬프트에 넣는다. 런타임 입력(figure_request, user_purity_toggle)은 하네스가 제공하므로 FIELDS에 쓰지 않는다.
