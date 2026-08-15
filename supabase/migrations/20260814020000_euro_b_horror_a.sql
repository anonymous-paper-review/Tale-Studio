-- #anchor-wiring 후속 (2026-08-14, 오너 재확정): euro_period B 켬 / psy_horror A 켬.
-- euro B 는 실측 부작용(촛대 물리 삽입 2/4)을 오너 인지 하에 채택. horror A 는 실측 무해
-- (A는 T처럼 행동 — 주간 보존, 누수 P8 1건)이며 절 문안은 A 팔이 실제 테스트한 generic
-- 2-ref carry 절(어둠 명시 없음 — 어둠을 텍스트로 밀던 B 절의 주간 파괴를 피하는 구성).
-- 적용: supabase db query --linked, 저장소 루트에서 문장 개별 실행. 2026-08-14 적용 완료.

update style_anchors set style_clause='Apply this period look to the whole scene: warm candlelight around 3000K mixed with a soft window glow, low-to-medium contrast, with soft painterly shadows falling off like an old-master oil painting. A muted low-saturation palette of aged gold, umber and deep green. Metal reads as tarnished silver and old brass, glass as antique cut crystal, fabric as fine lace over rich brocade, foliage as dark olive-green. Gentle film grain and a painterly period-drama grade. Mood: dignity and solitude.' where key='real_euro_period';

update style_anchors set use_preview_ref=true, style_clause='Carry HOW the style references render a scene and its figures - their color energy, their pattern and decoration language, their density of set dressing and background detail, and the way they stage depth. Do NOT reproduce their subjects, characters, places or props.' where key='real_psy_horror';
