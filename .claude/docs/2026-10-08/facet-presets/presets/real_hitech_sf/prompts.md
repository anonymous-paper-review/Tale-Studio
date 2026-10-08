## CAPSULE
Realistic digital rendering with continuous shading, optical reflection and refraction, fine weave and matte grain, and no brush marks. There are no drawn outlines; forms separate by value edges and reflections, seams and folds appear only as soft shading, and there is no hatching. Gradients blend across every surface, and form shadow is soft and continuous with no cel shapes. Sharp highlights appear only as long bands on metal and thin ridges on glass. Cast shadows are #29333b, directional, about 57% of object height, and soften with distance. Dim interiors run about 31% mean luminance with near black about 26%, not a mostly black image, while evenly lit scenes rise to about 68%. The wall grays also tint the objects: blue grays #3b424a and #687982, dark #04090e, highlights #a7bec5 to #eafaff. The neon saturated cyan accent #17ccea is ≤ 2% of the image and appears as small reflection fragments on glowing edges and rims, never filling cloth, matte objects or skin. Upper left key light, cyan rim light, lens perspective, shallow depth of field. Detail budget: dense, with about 40 seam edges per figure plus about 10 lace lines, hair as about 4 flows with about 12 strand lines, and no decorative marks.

## NEGATIVE
Avoid anime, cartoon, semi-realistic illustration and doll photography looks, ink outlines, flat cel shading, exaggerated fashion proportions, plastic skin, copied still-life arrangement, copied skyline layout, copied outfits or hairstyles, holographic interfaces, ornamental circuit lines, floating particles, decorative embroidery, speed lines, readable text, logos and watermarks.

## SCENE
An interior tabletop still life with buildings visible through a window: a sphere, a metal vessel, a glass, fruit, a potted plant and cloth, with no people. It is seen from slightly above, with the front cloth partly overlapping the objects behind. Separately, two casually dressed adults stand apart, facing front against a plain background, with neutral faces, visible from head to toe.

## PROBE_ANCHORS
There are no outlines; forms separate by value edges and reflections, and there is no hatching. Gradients are continuous, with soft form shadow and no cel shapes. Metal mirrors its surroundings in long bands, and glass refracts. Dim scenes run about 31% mean luminance with near black about 26%, not a mostly black image; evenly lit scenes run about 68%. Objects share the blue gray ground colors. The neon saturated cyan accent #17ccea stays ≤ 2%, only on glowing edges and rims, never on cloth or skin. Figures have realistic adult proportions with jointed volume. Eyes are long horizontal almonds with one small catchlight and soft shaded rims. Lens perspective, viewed from slightly above. The main object is about 26% of frame height. Detail budget: dense, with about 40 seam edges per figure and no decorative marks.

## COVERAGE
| 항목 | 출처 key | 실린 섹션 | 실린 절(영문 원문 발췌) |
|---|---|---|---|
| Core: 선화 없이 연속 명암과 재질별 반사·굴절 | 분류.Core ① | CAPSULE, PROBE_ANCHORS | "There are no drawn outlines; forms separate by value edges and reflections"; "Metal mirrors its surroundings in long bands, and glass refracts" |
| Core: 암청 바탕에 국소 청록광 | 분류.Core ① | CAPSULE, PROBE_ANCHORS | "Objects share the blue gray ground colors. The neon saturated cyan accent #17ccea stays ≤ 2%, only on glowing edges and rims" |
| Core: 사실적 성인 비례와 관절 체적 | 분류.Core ② | PROBE_ANCHORS, FIGURE | "Figures have realistic adult proportions with jointed volume"; "about 7.85 heads tall" |
| Core: 가로로 긴 눈의 절제된 반사와 음영 윤곽 | 분류.Core ② | PROBE_ANCHORS, FIGURE | "Eyes are long horizontal almonds with one small catchlight and soft shaded rims" |
| Supporting: 원경 초점 흐림 | 분류.Supporting | CAPSULE | "shallow depth of field" |
| Supporting: 미세 직조 | 분류.Supporting | CAPSULE | "fine weave and matte grain" |
| Supporting: 방향성 접지 그림자 | 분류.Supporting | CAPSULE | "Cast shadows are #29333b, directional, about 57% of object height, and soften with distance" |
| Supporting: 자연 모발 반사결 | 분류.Supporting | FIGURE | "broken sheen that follows the strand direction rather than a single band" |
| §6 1 선 굵기 | 선.외곽선.굵기 | CAPSULE | "There are no drawn outlines" ([해당 없음]이라 굵기 수치는 싣지 않음) |
| §6 2 역할 배분 | 색.역할 배분 | CAPSULE, PROBE_ANCHORS | "The wall grays also tint the objects"; "Objects share the blue gray ground colors" (배경 전용색 없음) |
| §6 3 액센트 | 색.액센트 규칙 | CAPSULE | "The neon saturated cyan accent #17ccea is ≤ 2% of the image and appears as small reflection fragments on glowing edges and rims, never filling cloth, matte objects or skin" |
| §6 4 구도 | 공간.구도 | PROBE_ANCHORS | "The main object is about 26% of frame height" (여백 25%는 [추정]·예산으로 제외) |
| §6 5 장식 | 장식 | CAPSULE, PROBE_ANCHORS | "no decorative marks" |
| §6 6 모노크롬 | 게이트 판정 | — | 게이트 생략, 엄격 단색 아님 |
| §6 7 재질 사전 | 재질 | CAPSULE | "optical reflection and refraction, fine weave and matte grain"; "long bands on metal and thin ridges on glass" (기계·차량 [외삽]은 장면에 없어 제외) |
| §6 8 곡면 | 형태.곡면 처리 | CAPSULE | "Gradients blend across every surface" |
| §6 9 캐스트 섀도 | 명암.캐스트 섀도 | CAPSULE | "directional, about 57% of object height, and soften with distance" |
| §6 10 인물 | 인물 | FIGURE | 비례·눈·피부·포즈 절 (표정 기본값은 머리말 규칙 1로 제외) |
| §6 11 부정 절 | 생성 규칙.부정 절 | NEGATIVE | "copied still-life arrangement, copied skyline layout" |
| §6 13 폼 섀도 | 명암.폼 섀도 | CAPSULE | "form shadow is soft and continuous with no cel shapes" |
| §6 14 하이라이트 hex | 색.팔레트.Highlight | CAPSULE | "highlights #a7bec5 to #eafaff" |
| §6 16 선의 층별 문장 | 선.적용 범위 | CAPSULE, FIGURE | "There are no drawn outlines"; "no ink lines anywhere" |
| §6 17 내부선 양·역할 | 선.내부선 | CAPSULE, FIGURE | "seams and folds appear only as soft shading"; "about 40 structural garment edges per figure" |
| §6 18 묘사 예산 | 디테일.묘사 밀도 | CAPSULE, PROBE_ANCHORS, FIGURE | "Detail budget: dense, with about 40 seam edges per figure plus about 10 lace lines" |
| §6 24 키 | 명암.키 | CAPSULE, PROBE_ANCHORS | "Dim interiors run about 31% mean luminance with near black about 26%, not a mostly black image, while evenly lit scenes rise to about 68%" |
| §6 26 없음의 전달 | 선·장식·질감 | CAPSULE, NEGATIVE | "there is no hatching"; "no decorative marks"; "speed lines" |
| §6 27 처리·엔진 토큰 | 인물.눈.처리·매체.엔진 | CAPSULE, FIGURE | "Realistic digital rendering"; "standard eyes" |
| §6 28 눈 절 | 인물.눈 | FIGURE | "slightly upturned outer corners … one small round catchlight toward the upper right" |
| §6 29 비례 | 인물.비례 | FIGURE | "torso about 37% of the height, legs about 45% including heels" |
| §6 30 계열 혼합 | 인물.계열 혼합 | FIGURE | "realistic face … on a realistic adult body" |
| §6 31 형태 어휘 | 형태.도형 어휘 | — | 예산; Core 아님 |
| §6 32 포즈 | 인물.포즈 문법 | FIGURE | "poses tend to stand upright … the action comes first" |
| §6 33 명암 면·하이라이트 | 명암.폼 섀도·하이라이트 | CAPSULE | "Sharp highlights appear only as long bands on metal and thin ridges on glass" |
| §6 34 인접 계열 | 부정 절.인접 계열 | NEGATIVE | "Avoid anime, cartoon, semi-realistic illustration and doll photography looks" |
| 조명 | 조명 | CAPSULE | "Upper left key light, cyan rim light" |
| 투영 | 공간.투영 | CAPSULE, PROBE_ANCHORS | "lens perspective"; "Lens perspective, viewed from slightly above" |

## FIGURE
A realistic face with a three-dimensional nose and lips and small almond eyes, on a realistic adult body, rendered as realistic digital rendering with no outlines, continuous shading, woven cloth texture and hair sheen. The figure stands about 7.85 heads tall, measured from the top of the skull rather than the hair. The head to torso ratio is about 1 to 2.88, with the torso about 37% of the height, legs about 45% of the height including shoe heels, and the lower legs about 1.32 times the thighs. The arms are about 40% of the height, with fingertips reaching the upper thigh and the forearm about 0.85 of the upper arm. The shoulders are about 2.2 skull widths across, the upper arm about 0.36 head widths thick and the wrist about 0.19, and the limbs taper gently toward the ankles. Hands are about 0.63 face heights. Shoes have rounded toes, stand about half a head tall, project about 0.68 head in length and sit on soles about a sixth of their height. The standard eyes have slightly upturned outer corners at about 5 degrees and a normal opening, with the upper lid covering the top fifth of the iris and no sclera showing above. They are long horizontal almonds about 2.8 times wider than tall, each about a fifth of the face width, set at mid head height. The iris shows two soft value zones, darker above and lighter below, with a thin soft rim, a soft edged pupil and no lower reflection. There is one small round catchlight toward the upper right, about a seventh of the iris width, with no secondary catchlight and no glow. Lashes merge into the upper lid band, with no separate strands. The upper lid is a thin gentle arc about 0.1% of image width, and the lower lid is only a faint broken edge. The eye outlines are local brown and reddish brown contact shading, never an ink line. The sclera is a narrow neutral plane, shaded at the top and not pure white, and the inner corner is a small modeled plane. Eyebrows are soft hair textured bands that taper at the ends. Hands have separate fingers and nail planes modeled in volume, with some fingers overlapping. Hair is built from rounded overlapping clumps that thin toward the tips, arranged in about 4 large flows with about 12 separable strand lines and about 7 small tufts breaking the silhouette, carrying a broken sheen that follows the strand direction rather than a single band. Clothing wraps the body and hangs with gravity, showing fold shading and woven texture, never stiff geometric blocks. Poses tend to stand upright, with shoulders and hips nearly level, the weight between both feet, arms almost straight and low gesture intensity, with no exaggerated foreshortening; when the scene specifies an action, the action comes first and this rhythm is applied to it. Expressions are made with eyelid opening, brow shape, lip tension and cheek volume, with no emotion symbols. Skin keeps its natural local color with continuous diffuse shading, a faint satin sheen on the forehead and nose, and slight warmth around the cheeks and mouth, with no blush marks, no plastic gloss and no cel steps. Detail budget: dense, with about 40 structural garment edges per figure regardless of its size on screen (about 20 on the top, 14 on the bottom and 6 on the shoes) plus about 5 lace cross lines per shoe. Eyes carry about 6 separable elements: two iris tones, one pupil, one catchlight and two lids. There are no decorative marks, no hatching and no ink lines anywhere.
