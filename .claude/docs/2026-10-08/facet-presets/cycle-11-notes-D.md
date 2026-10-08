# 트랙 D — 현행 style_clause ↔ facet 인물 절 충돌 점검 (2026-10-08 밤)

`index.json`의 `style_clause_current`(제품이 지금 보내는 손글씨 절)와 `facets.figure`(v3, 인물 보드에서 잰 인물 절)를 대조했다. "둘 다" 구성은 두 문장을 함께 보내므로 어긋나는 수치가 있으면 생성기가 어느 쪽을 따르는지가 문제다.

| 스타일 | clause 등신 | facet 등신(보드 실측) | clause에 인물 절 | 충돌 |
|---|---|---|---|---|
| jp_anime | 7.5 | 8.4 | 있음(비례·눈·헤어·셀 음영·색선) | **있음** — clause는 7.5등신을 시키지만 제품이 그 clause로 그린 보드는 8.4등신이었다. 둘 다 구성에는 7.5와 8.4가 같이 실린다 |
| us_cartoon | 5.5 | 5.6 | 있음(비례·눈·코·입·헤어·채움·외곽선) | 없음 — 일치 |
| stop_motion | — | 6.1 | 있음(인형 재질·구슬눈, 수치 없음) | 없음 — 수치가 한쪽에만 있다. 구슬눈·한 광점은 facet과 일치 |
| real · real_3d | — | 7.9 · 7.4 | 없음(장면 언어 절) | 없음 |
| 실사 서브룩 6종 | — | 7.7~8.0 | 없음(룩·그레이드 절; euro_period·psy_horror는 null) | 없음 |
| watercolor | — | 7.7 | 없음(매체·비례 '언어'만) | 없음 |

결론: 수치 충돌은 **jp_anime 하나**. 눈·윤곽·헤어 서술은 보드가 clause로 생성된 것이라 facet이 clause를 따라 적혀 있어 어긋나지 않는다.

시험: jp_anime(충돌)와 us_cartoon(대조군)에서 "둘 다" 프롬프트의 clause에서 비례 구절("about seven and a half heads tall, with long limbs and small refined hands" / "roughly five and a half heads tall, …")만 뺀 변형(D1)을 캐릭터 1장씩 만들어 v3 둘 다와 쌍 비교(판정 2명, 보드 대비 인물 방언). 프롬프트 `<key>/gen_v4d/both_character.txt`.
