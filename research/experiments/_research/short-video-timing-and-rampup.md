# 짧은 영상 생성의 시간 의도 불이행 + 초반 램프업 어색함 — 웹 조사

- 조사일: 2026-08-11
- 조사 방법: WebSearch/WebFetch. **지출 $0, 코드 변경 없음.**
- 대상 실측: fal 경유 `bytedance/seedance-2.0/reference-to-video`, 720p, 7초, 시작프레임 이미지 + (선택) 3D 블록아웃 영상 참조.
- **인용 규칙**: 아래 인용문 중 `[확인]`은 내가 해당 URL을 직접 fetch 해서 본문에서 읽은 것. `[검색요약]`은 검색엔진 요약에만 나타났고 원문 fetch가 403/404/파싱실패로 막힌 것 — 문구가 정확하지 않을 수 있으니 인용 강도를 낮춰 읽을 것.
- Reddit은 이 환경에서 검색·fetch가 **모두 차단**돼 있음(정책). r/aivideo·r/StableDiffusion 1차 스레드는 못 봤다. §못 찾은 것 참조.

---

## §요약

**질문 1 — 왜 초 단위 시간 의도를 안 따르는가**

1. 통용 명칭은 **"timeline prompting" / "timestamp prompting"**(기법 이름)이고, 실패 현상 자체엔 합의된 고유 명칭이 없다. 학계에서는 **temporal controllability / temporal compositionality / fine-grained temporal control 부재**라고 부른다.
2. **우리 실측(구간 순서는 지켜지고 시각은 밀림)은 문헌과 정확히 일치한다.** 벤더 가이드가 명시적으로 "타임스탬프는 모델이 지킬 수도 있는 힌트지 지켜야 하는 지시가 아니다"라고 쓴다. 학계는 원인을 "diffusion time이 denoising 진행도와 모션 전개를 동시에 대리(proxy)해서 시간 축이 얽혀 있다"로 설명한다.
3. **실무 우회법의 지배적 합의는 "초를 박지 말고 샷 순서(Shot 1/2/3)로 쓰고, 진짜 시각이 중요하면 쪼개서 생성하고 붙여라"**다. 초 단위 카메라 궤적을 실제 입력으로 받는 건 프롬프트가 아니라 **전용 모션 컨트롤 모드**(Kling Motion Control 3.0의 curve dolly camera path, Runway 카메라 컨트롤 등)이며, Seedance reference-to-video에는 그런 파라미터가 **없다**(fal 파라미터 목록 확인).
4. 3D 프리비즈를 참조로 넣는 방식은 학계(Autodesk Research, PrevizWhiz, CHI 2026)와 실무 양쪽에 사례가 있고, 결론도 우리 실측과 같다 — **공간/블로킹은 전달되고 정밀한 시간 전개는 전달된다고 주장되지 않는다.**

**질문 2 — 왜 초반 1~2초가 어색한가**

1. 딱 떨어지는 통용 명칭은 **없다.** 근접한 실무 용어는 `warble`(전반적 흔들림·일렁임), `morphing`, `background drift`, `frozen seam`(클립 이음매), 그리고 "clip 앞뒤 불안정 프레임"을 그냥 서술적으로 부르는 관행이다. **"first-frame warp" / "ramp-up"은 이 도메인의 확립된 용어가 아니다**(검색으로 근거 못 찾음).
2. 원인 중 **가장 근거가 강한 것은 우리 가설 ④(정지→운동 전이)**다. 2026년 논문이 이를 **"static motion bias" / "reference frame dominance"**로 명명하고, **참조 프레임에 인접한 초반 프레임에서 그 지배가 가장 강하다**고 명시한다. 가설 ①(파랄랙스)도 지지 근거가 있다 — 단일 정지 이미지에서 깊이를 추정해야 하므로 전경-배경 분리가 실패하면 "cardboard/slideshow" 붕괴가 난다. 가설 ②(첫 프레임 기하 불안정)는 오픈모델에서 실증된 버그 리포트가 있다. 가설 ③(fps/모션블러)은 **직접 근거를 못 찾았다.**
3. 해결법 합의는 세 가지: **(a) 앞뒤 불안정 구간을 잘라내라(더 길게 뽑고 트림)**, **(b) 시작 프레임을 전경/중경/배경이 분리된 것으로 골라라(평평하면 모델이 깊이를 추측하게 된다)**, **(c) 전경 오브젝트가 있으면 카메라 이동량을 줄여라** — 전경이 찢어지거나 깜빡이면 모션을 줄이라는 게 표준 조언이다.
4. **반증 주의**: 문헌의 지배적 서사는 "**뒤로 갈수록** 품질이 떨어진다"(오차 누적)이다. 오너 관찰(초반이 최악)은 이 서사와 반대다. 즉 우리 케이스는 "품질 열화"가 아니라 **모션 온셋/기하 확정 구간의 문제**로 봐야 앞뒤가 맞는다.

---

## §질문1 상세 — 짧은 영상 생성이 왜 시간 의도를 안 따르는가

### ① 명칭

| 층위 | 용어 | 뜻 |
|---|---|---|
| 기법 이름(실무) | **timeline prompting**, **timestamp prompting**, 중국어 **分时段提示词** | 프롬프트를 `[0-3s] … [3-6s] …`로 쪼개 쓰는 작법 |
| 실패 현상(실무) | 고유 명칭 없음. "timing drift", "the model may honour it as a hint" 식으로 서술 | — |
| 학계 | **temporal controllability**, **fine-grained temporal control**, **temporal compositionality** | 언제 무엇이 일어날지 지정하는 능력 |

> **결론: "이 현상의 이름"을 물으면 영어권은 기법 이름(timeline prompting)으로 답하지 실패 현상의 이름으로 답하지 않는다.** 실패는 "타임스탬프는 힌트다"라는 벤더 면책 문구로 처리된다.

### ② 원인 — 근거 있는 설명만

**(A) 벤더/실무 진영: "타임스탬프는 힌트다"** — `[확인]`

Morphic (Seedance 2.0 가이드):
> "Seedance 2.0's support for precise timing is unstable, and forcing exact durations onto segments can actively break the generation."
> (Seedance 2.0의 정밀 타이밍 지원은 불안정하며, 구간에 정확한 길이를 강제하면 생성 자체를 망가뜨릴 수 있다.)

> "Timestamps are not forbidden and you will see them in ByteDance's own sample prompts. Treat them as a hint the model may honour, not an instruction it must obey."
> (타임스탬프가 금지된 건 아니고 ByteDance 자체 샘플 프롬프트에도 나온다. 다만 **모델이 지켜줄 수도 있는 힌트**로 다뤄라, 반드시 따라야 하는 지시가 아니라.)

출처: https://morphic.com/resources/how-to/seedance-2-guide

같은 계열의 강한 경고 `[검색요약]`(원문 fetch에서 이 문단은 확인 못 함):
> "Do not assign each shot a duration. It is tempting to write `"duration": "3 seconds"` against every beat, and it is the most common way people make their own output worse."
> (각 샷에 길이를 배정하지 마라. 모든 비트에 `"duration": "3 seconds"`를 쓰고 싶겠지만, 사람들이 자기 출력을 스스로 나쁘게 만드는 가장 흔한 방법이다.)

**(B) 벤더 진영 반대편: "1초 단위까지는 받는다"** — `[확인]`

Runware의 Seedance 2.5 프롬프팅 문서는 정반대에 가깝다. `[0-3s]` 형식의 시간 구간을 **약 1초 granularity**로 지원한다고 쓰고, 구간을 연속·비중첩으로 쓰라고 안내한다. 다만 **sub-second 정밀도("high-frequency micro-control")는 "모델을 지휘하는 게 아니라 모델과 싸우는 것"이라고 명시적으로 경고**한다.
출처: https://runware.ai/docs/models/bytedance-seedance-2-5/guides/prompting

fal의 Seedance 2.5 프롬프팅 가이드도 타임스탬프를 **쓴다**. 단 조건부다 — `[확인]`
> "I do not put timestamps in every prompt. A simple action can stay simple. Timing blocks become useful when several events share one shot and the order matters."
> (모든 프롬프트에 타임스탬프를 넣지는 않는다. … 타이밍 블록은 한 샷에 여러 사건이 있고 **순서가 중요할 때** 유용해진다.)

출처: https://fal.ai/learn/devs/seedance-2-5-prompting-guide

> **주목**: fal 가이드조차 타임스탬프의 효용을 **"순서(order)"**로 한정한다. **시각(when)이 아니라 순서(sequence)** — 이게 우리 실측 1("구간 순서만 지켜지고 시각은 2~2.5초 밀린다")과 정확히 일치한다.

Luma 러닝센터도 "10–15초 생성이면 timecode로 구조화할 수 있다"고만 하고, **7초 같은 짧은 클립엔 timecode를 권하지 않는다.** `[확인]` — https://lumalabs.ai/learning-center/articles/advanced-seedance-2.0-workflows

커뮤니티 스킬 문서(dexhunter/seedance2-skill) — `[확인]`:
> "分时段提示词（**10秒以上推荐使用**）"
> (구간별 프롬프트 — **10초 이상에서 사용 권장**)

출처: https://github.com/dexhunter/seedance2-skill/blob/main/zh/SKILL.md

> **→ 우리는 7초에 3구간 타임코드를 쓰고 있다. 벤더/커뮤니티 가이드 다수의 권장 범위 밖이다.**

**(C) 학계: 시간 축이 아키텍처 수준에서 얽혀 있다** — `[확인]`

- *Making Time Editable in Video Diffusion Transformers* (Kuklev et al., arXiv:2606.10183, 2026-06):
  > "diffusion time may act as a proxy for both denoising progress and motion evolution"
  > (diffusion time이 **denoising 진행도와 모션 전개 양쪽의 대리 변수** 노릇을 할 수 있다.)
  > "the model does not reliably capture how temporal discretization relates to the physical evolution of motion"
  > (모델은 **시간 이산화가 모션의 물리적 전개와 어떻게 대응하는지를 신뢰성 있게 포착하지 못한다**.)
  → 즉 "3초"라는 말이 걸릴 축 자체가 모델 안에 독립적으로 존재하지 않는다.

- *TempoControl: Temporal Attention Guidance for Text-to-Video Models* (arXiv:2510.02226):
  > "these models frequently lack fine-grained temporal control, meaning they do not allow users to specify when particular visual elements should appear within a generated sequence."
  > (이 모델들은 정밀한 시간 제어가 결여돼 있어, 특정 시각 요소가 **시퀀스 안 언제 나타나야 하는지**를 사용자가 지정할 수 없다.)

- *TC-Bench* (arXiv:2406.08656, ACL Findings 2025):
  > "most video generators achieve less than 20% of the compositional changes"
  > (대부분의 비디오 생성기는 요구된 구성 변화의 **20% 미만**만 달성한다.)
  → 시간에 따른 상태 전이 자체가 4/5 확률로 실패한다는 정량 근거.

- *BulletTime: Decoupled Control of Time and Camera Pose for Video Generation* (arXiv:2512.05076, 2025-12):
  > "Emerging video diffusion models achieve high visual fidelity but **fundamentally couple scene dynamics with camera motion**, limiting their ability to provide precise spatial and temporal control."
  → 시간과 카메라 포즈가 결합돼 있어서 "1초에 스윙"이 분리 제어되지 않는다.

**(D) "텍스트 인코더가 숫자를 접지 못한다"는 설명은 근거를 못 찾았다.** 그럴듯하지만 이번 조사에서 이를 직접 주장하는 논문/문서를 찾지 못했다. **출처 없음 — 추측으로 취급할 것.**

**(E) 카메라 무빙 특유의 제약** — `[확인]`

- Morphic: "**One camera move per shot.** Asking a single shot to push in, orbit, and pan at once is the fastest way to destabilise the image." (샷당 카메라 무빙 하나. 한 샷에 푸시인+오빗+팬을 동시에 요구하는 게 이미지를 불안정하게 만드는 가장 빠른 길.)
- SegmentFault(중국 실무자 실측 글, 공식문서 인용 아님):
  > "不支持多指令复合：无法在提示词中实现复杂的运镜组合（如"先推后摇"），**多指令下通常只执行第一个运镜词**。"
  > (다중 지시 복합 미지원: "먼저 밀고 나중에 팬" 같은 복합 운동을 프롬프트로 구현 못 하며, 다중 지시 시 **대개 첫 번째 운동 단어만 실행**한다.)
  > "缺乏精确度量：无法通过数值（如"旋转 45 度"）进行绝对坐标控制，随机性依然存在。"
  > (정밀 계량 결여: 수치(예: "45도 회전")로 절대 좌표 제어 불가, 랜덤성 상존.)
  출처: https://segmentfault.com/a/1190000047866527
- 공식 가이드 해설(apiyi) `[확인]`: 체크리스트에 "Confirm there is only **one primary camera instruction**" / "Multiple conflicting instructions will confuse the model."
- videoinu 리뷰 `[확인]`: "Controls for pacing, camera movement, and emphasis are **typically coarse**, so 'almost right' clips can be hard to fix." (페이싱·카메라·강조 제어는 대체로 **거칠어서**, "거의 맞는" 클립을 고치기 어렵다.)

> **→ 우리 프롬프트 "0-1s 정면 / 1-2s 스윙 / 2-7s 측면 트래킹"은 실질적으로 카메라 무빙 3개 복합이다.** 위 조언 전부를 동시에 위반한다. 시각이 밀리는 것 이전에 **"첫 운동 단어만 실행되고 나머지가 늦게/뭉개져 나오는" 패턴**과 일치한다.

### ③ 실무 우회법

| 우회법 | 근거 | 확인 |
|---|---|---|
| **초 박지 말고 Shot 1/2/3 순서로 쓰기** | Morphic: "Label them **Shot 1, Shot 2, Shot 3**, in the order events happen, and describe each one as: camera move, then subject action, then position, then sound." | `[확인]` |
| **샷당 카메라 무빙 1개** | Morphic / apiyi / novoads("Single subject, one action, one camera move" — "the oldest discipline … it is not a workaround") | `[확인]` |
| **쪼개서 생성 + 마지막 프레임을 다음 클립 시작으로(체이닝)** | fal 가이드: "When I need a clean continuation, I extract the final frame of the first clip and use it as the image reference for the next generation." / "This gives the second prompt a real starting state instead of asking the model to remember one." | `[확인]` |
| 중국어권 동일 조언 | aibook.ren: "把前一个镜头的最后一帧（或接近最后一帧的截图）作为下一个镜头的参考图输入，帮助模型延续视觉状态" (직전 샷의 마지막 프레임(또는 그 근처 스틸)을 다음 샷 참조 이미지로 넣어 시각 상태를 잇게 한다) | `[확인]` |
| **체이닝의 함정: frozen seam** — 생성기가 클립 끝에서 카메라를 감속시켜서 단순 이어붙이면 정지처럼 읽힌다. 감속 꼬리를 잘라내고 모멘텀을 맞춰라 | OCDevel/Gnothi 팟캐스트 요약. 원문 fetch에서 해당 문장 확인 실패 | `[검색요약]` |
| **길이를 내용에 맞춰라** | fal: "The 30-second setting only changes the available duration. **It does not add more events to the prompt.**" (길이 설정은 가용 시간만 바꾸지 프롬프트에 사건을 더해주지 않는다.) | `[확인]` |
| **모션 강도 파라미터** | Seedance reference-to-video에는 **없음**. fal 입력 파라미터 전체: `prompt, image_urls(≤9), video_urls(≤3), audio_urls(≤3), resolution, duration, aspect_ratio, generate_audio, seed, end_user_id`. motion_strength/camera_fixed 계열 **미제공**. | `[확인]` https://fal.ai/models/bytedance/seedance-2.0/reference-to-video |

**초 단위 카메라 궤적을 실제로 입력받는 모델/기능** (프롬프트가 아니라 전용 모드):

| 모델/기능 | 입력 형태 | 확인 |
|---|---|---|
| **Kling Motion Control 3.0** — Curve Dolly Camera Path 모드. pan/tilt/zoom/orbit을 **start/end 키프레임 + 보간 커브**로 지정. Multi-Elements, Camera Shake 모드 병존 | 벤더 API. 공식 문서(kling.ai/document-api/apiReference/model/motionControl)는 HTTP 446으로 fetch 실패 — 파라미터명 미확인. Replicate `kwaivgi/kling-v3-motion-control` 리스팅 존재 | `[검색요약]` |
| **Runway Gen-3 Alpha Turbo / Gen-4 Camera Control** — horizontal/vertical/pan/tilt/zoom/roll 각각 수치. **값은 "속도와 강도"를 뜻하며 0에서 멀수록 이동량이 큼** → 즉 **클립 전체의 진폭이지 시각(when)이 아니다** | Runway 헬프센터 기반 검색요약 | `[검색요약]` |
| **연구용**: MotionCtrl / CameraCtrl / CamCo — 프레임별 카메라 포즈(Plücker 좌표) 시퀀스를 조건으로 주입. CamCo는 epipolar attention으로 3D 일관성 강제 (arXiv:2406.02509, Xu et al., 2024-06) | 논문 | `[확인]` |
| **BulletTime** — world-time 시퀀스 + 카메라 궤적을 4D positional encoding으로 조건화, 시간과 카메라를 **분리** (arXiv:2512.05076) | 논문, 제품 아님 | `[확인]` |

> **핵심**: 상용에서 "초 X에 스윙"을 **하드 제약**으로 받는 건 Kling Motion Control 계열뿐이고, Seedance reference-to-video는 그 축이 아예 없다. Runway 계열도 "얼마나"는 받지만 "언제"는 안 받는다.

**프롬프트 작법 — 시간 표현을 어떻게 쓰면 먹히는가**

- 순서어("begins with", "then", "as the camera moves")로 쓰고 초를 빼라 — 다수 가이드 공통.
- 구간을 쓸 거면 **정수 초, 빈틈 없이 연속**으로. `[검색요약]`
- 한 타임스탬프에 사건 하나. "Overloading beats — stuffing too much into one timestamp — is the #1 timeline mistake." `[검색요약]`
- 카메라 속도를 형용사로 명시("The camera **rapidly** tracks left" > "the camera follows"). `[검색요약]`

### ④ 3D 프리비즈를 참조로 넣는 방식 — 사례와 결론

**PrevizWhiz** (Autodesk Research, CHI 2026, arXiv:2602.03838) — `[확인]`
- 방식: "rough 3D proxies to establish prop positions, character movement, as well as camera paths"로 3D 블로킹을 만들고 프레임을 뽑아 생성 모델의 조건 입력으로 쓴다. 모션 충실도를 3단계로 둔다: (1) 3D 블로킹의 coarse motion, (2) restyled frame과 결합한 stylized animation, (3) 2D 레퍼런스 영상을 더한 control-video animation.
- 결론: 3D 참조는 **"spatial grounding"**을 제공한다고 서술되며, 워크플로는 "a practical middle ground: faster and cheaper than building full high-fidelity 3D pipelines, yet offering more structure and control than text-to-video approaches"로 규정된다.
- **시간 전개가 전달된다는 주장은 논문에 없다.** 참가자 평가는 "mixed agreement on whether the generated content matched their imagination" (Md=3, IQR=0.5).
- **→ 우리 실측 2(블록아웃은 공간·비율은 전달, 시간 배치는 미전달)와 모순되지 않는다. 오히려 이 논문은 3D 참조의 기여를 공간 쪽으로만 주장한다.**

**실무(Blender 블록아웃 → AI)** `[검색요약]`
- 블록아웃으로 카메라 무빙·액션·타이밍을 잡고 첫 프레임 이미지와 함께 모션/프레이밍 레퍼런스로 넘긴다는 워크플로가 flick.art 등에 서술. 근거 문장: "Text prompts can't precisely control camera move, timing, or spatial layout — blocking in Blender lets you direct the exact camera language and character action, then hand it to the AI as a reference." (텍스트 프롬프트로는 카메라 무빙·타이밍·공간 배치를 정밀 제어할 수 없다.) → **문제 진단은 우리와 같지만, 3D 참조가 타이밍을 해결했다는 실측은 제시되지 않는다.**
- 관련 오픈소스: `wassermanproductions/motion-previs-studio` (모션/뎁스/포즈/카메라무브 프리비즈용 데스크톱 앱). 미검증.

**참조 역할을 명시적으로 분리하라는 조언** — `[확인]`
- fal 가이드: "@Video1 controls only the low parallel tracking motion... **Do not copy the skater, cone, clothing, location**" / "**Do not make an image and a video reference do the same job.**"
- Morphic: 참조는 4가지 기능 역할로 — 캐릭터 앵커(이미지 1–2), 씬 톤(이미지 1), **카메라 무빙(영상 1)**, 리듬/분위기(오디오 1).
- Seedance 커뮤니티 스킬: "上传了5张图片，每一张都必须用 @ 标注清楚用途" (5장 올렸으면 각각 용도를 @로 명시해야 한다), 역할 목록에 首帧/尾帧/人物形象/场景背景/**运镜**/动作/特效.
- **→ 우리는 블록아웃 영상을 `video_urls`로 넣기만 하고 프롬프트에서 "@Video1은 카메라 무빙만 담당, 색·형태는 복사 금지"를 선언하지 않는 것으로 보인다.** 이건 벤더 가이드가 명시적으로 요구하는 계약이다.

---

## §질문2 상세 — 초반 1~2초가 어색한 문제

### ① 명칭

**정직한 답: 이 현상 전용의 통용 명칭은 없다.** 근접 용어들:

| 용어 | 뜻하는 범위 | 우리 현상과의 거리 | 확인 |
|---|---|---|---|
| **warble** | 생성 영상 전반의 일렁임/흔들림, 텍스처 shimmer, 프레임 flicker | 부위 특정 안 함 | `[검색요약]` |
| **morphing** | 주로 얼굴/객체가 프레임 사이 변형 | 얼굴 중심 용법 | `[검색요약]` |
| **background drift** | "the background slowly slides, warps, or shifts perspective over the course of the video" | 우리 배경 불안정에 근접 | `[확인]` picto.video |
| **frozen seam** | 클립 **끝** 감속으로 이어붙이면 정지처럼 보이는 이음매 | 끝단 문제(우리와 반대편) | `[검색요약]` |
| **static motion bias / reference frame dominance** | i2v가 참조 이미지에 과도하게 붙들려 정적이 되는 편향 | **원인 층위에서 가장 정확** | `[확인]` arXiv:2605.19398 |
| "unstable frames at clip start/end" | 서술적 표현. 중국어권 "开头或结尾有明显的画面抖动或形变" | 현상 서술로는 가장 정확 | `[확인]` aibook.ren |

**"first-frame warp", "ramp-up"은 이 분야의 확립된 용어로 확인되지 않았다.** 검색에서 걸리는 건 morphing 관련 특허/기술문서지 생성영상 커뮤니티 용법이 아니다.

### ② 원인 — 우리 가설 4개 대조

**가설 ④ (정지→운동 전이) — 근거 가장 강함** `[확인]`

*Rebalancing Reference Frame Dominance to Improve Motion in Image-to-Video Models* (Jeon et al., arXiv:2605.19398, 2026)
- 문제: **static motion bias** — "Image-to-video models often produce videos that remain overly static compared to their text-to-video counterparts, **even when the prompt explicitly describes motion**." (프롬프트가 모션을 명시해도 i2v는 t2v보다 지나치게 정적으로 나온다.)
- 기제: 어텐션 맵 분석 결과 "query tokens in non-reference frames allocate **substantially more attention to the reference-frame key tokens** than their paired text-to-video counterparts." (비참조 프레임의 쿼리 토큰이 참조 프레임 키 토큰에 훨씬 더 많은 어텐션을 준다.)
- **시간적 국소성: 이 지배는 참조 프레임에 시간적으로 인접한 초반 프레임에서 가장 강하다.**
- 처방(논문): 어텐션을 시간축에 걸쳐 재분배 → 후속 프레임 모션 개선. 기존 연구들은 "modifying the image-conditioning pathway or **weakening the conditioning signal**"로 접근.

> **→ "참조 이미지가 정지 그림이라 초기 몇 프레임이 정지→운동 전이를 어색하게 처리한다"는 우리 가설 ④는 2026년 논문이 명명·정량화한 현상과 일치한다.** 다만 논문은 "초반이 **덜 움직인다**"를 말하지 "초반이 **일그러진다**"를 말하지는 않는다. 우리 관찰(원근/공간감 불안정)까지 이 하나로 다 설명되지는 않는다.

**가설 ① (전경-중경-배경 파랄랙스 실패) — 근거 있음, 실무 조언 다수** `[확인]`

- 시작 프레임이 깊이 정보를 준다:
  > "A well-composed first frame with clear foreground, midground, and background gives the model depth information it can use for parallax effects and natural camera movement."
  > "**A flat, poorly composed first frame leaves the model guessing about spatial relationships, leading to unnatural depth perception in the output.**"
  > (평평하고 구성이 나쁜 첫 프레임은 모델이 공간 관계를 **추측하게** 만들고, 결과적으로 부자연스러운 깊이감을 낳는다.)
  출처: https://seedance-2ai.org/blog/ai-video-first-last-frame-guide

- 레이어를 동등하게 다루면 붕괴한다:
  > "Users who treat these layers with equal importance often encounter a **'slideshow effect,'** where the AI struggles to differentiate between moving objects and static scenery."
  > (세 레이어를 동등 비중으로 다루면 AI가 움직이는 것과 정지한 배경을 구분 못 해 '슬라이드쇼 효과'가 난다.)
  > "high-speed movements often cause motion blur that overwhelms depth cues, leading to a **collapse of the 3D space**." (빠른 이동은 깊이 단서를 덮는 모션블러를 유발해 3D 공간을 붕괴시킨다.) 권장 카메라 속도 "< 0.5m/s".
  > 전경 레이어에서 "temporal inconsistency — the shimmering or warping of pixels — is most noticeable" (전경에서 시간적 불일치, 즉 픽셀의 shimmer/warp가 가장 눈에 띈다).
  출처: https://hailuoai.video/pages/knowledge/foreground-background-ai-video-cinematic-depth

- 겹치는 피사체는 모션 벡터를 혼란시킨다 `[검색요약]`:
  > "I2V models read depth and parallax from object edges. **Multiple overlapping subjects confuse the motion vectors — you end up with blurry seams where the model can't decide what should move and what shouldn't.**"

- "cardboard cutout effect": AI가 깊이를 레이어로 근사하다 실패하면 객체가 부피 없는 평면 판때기로 보인다 — 스테레오 3D 변환 문헌에서 온 용어. `[검색요약]`

- 학계: disocclusion 문제. 카메라가 움직이면 가려졌던 영역이 드러나는데, 그 내용은 원본에 없어서 "naively blending warped inputs often results in severe artifacts, including ghosting effects." 단일 이미지 조건에서는 깊이 자체가 ambiguous. `[검색요약]`
- CamCo(arXiv:2406.02509) `[확인]`: i2v에 정밀 카메라 제어가 결여돼 있고 3D 일관성을 위해 **epipolar attention**을 따로 넣어야 했다 — 즉 기하 일관성은 기본 제공이 아니다.

**가설 ② (참조 이미지→영상 초기 프레임 기하 불안정) — 오픈모델에서 실증** `[확인]`

- Stable Video Diffusion: "[Stable Video Diffusion] **first frame is not equal to initial image**" — 생성 결과의 첫 프레임이 입력 컨디셔닝 이미지와 다르다는 버그 리포트. (미해결, 답변 없음)
  https://github.com/Stability-AI/generative-models/issues/247
- Wan2.1: "When generating long videos, **the first few frames have color shifts and flickering**" — 121프레임 생성 시 초반 몇 프레임에 색 이동·깜빡임. 보고자는 "Is it because the position encoding does not support more than 81 frames?"라고 추정. (답변 없음)
  https://github.com/Wan-Video/Wan2.1/issues/369
- **주의**: 둘 다 오픈 모델(SVD/Wan)이고 Seedance가 같은 병을 앓는다는 직접 증거는 아니다. "i2v 계열에서 초반 프레임 불안정이 실제로 보고된다"는 존재 증명일 뿐.
- 원리 층위: i2v는 참조 이미지를 VAE로 인코딩해 latent로 조건화하므로 재구성 손실·정규화 때문에 첫 프레임이 픽셀 단위로 동일하지 않다. `[검색요약]`

**가설 ③ (프레임레이트·모션블러) — 직접 근거 못 찾음**

- Hailuo 가이드의 "high-speed movements often cause motion blur that overwhelms depth cues" 정도가 간접 근접. `[확인]`
- 초반 1~2초에 특정해 fps/모션블러가 원인이라는 자료는 **찾지 못했다.** 출처 없음.

**반증 — 문헌 다수는 "뒤가 나빠진다"고 말한다** `[검색요약]`
> "Early outputs often appear sharp, detailed, and coherent, while later outputs may look softer, blurrier, or less faithful." / 사용자 표현: "The first part looks great, but later it gets blurry."
> 원인: 오차 누적(error accumulation), 프롬프트 컨디셔닝 감쇠.

> **→ 오너 관찰(초반이 최악)은 이 지배적 서사와 방향이 반대다. 따라서 "일반적 품질 열화"로 설명하면 틀린다.** 초반 특유의 두 축 — 모션 온셋(가설 ④)과 기하/깊이 확정(가설 ①) — 으로 좁혀 보는 게 맞다.

### ③ 해결법

| 조치 | 근거 문장 | 확인 |
|---|---|---|
| **앞뒤 불안정 구간 잘라내기** | "有些片段的开头或结尾有明显的画面抖动或形变。**把这些不稳定的部分裁掉，保留每个镜头最干净的段落**" (일부 클립은 시작이나 끝에 뚜렷한 흔들림·형변형이 있다. 이 불안정한 부분을 잘라내고 각 샷의 가장 깨끗한 구간만 남겨라.) — aibook.ren | `[확인]` |
| 같은 문서: 생성 길이는 계획과 어긋난다 | "生成的片段通常比镜头表里规划的时长要长一些或短一些" (생성 클립은 대개 샷 리스트에 계획한 길이보다 길거나 짧다.) | `[확인]` |
| **더 길게 뽑고 트림(패딩)** | "pad extra frames: Generate slightly longer (e.g., +0.5 s at start/end) so you can trim or freeze later." / "AI clips often have **0.5–1 seconds of unstable frames at the beginning and end**" — 두 문장 모두 검색요약에만 등장, 원문 fetch 실패. **미검증 민간요법으로 취급.** | `[검색요약, 미검증]` |
| **시작 프레임 선택: 전/중/배경이 분리된 프레임을 골라라** | seedance-2ai.org 위 인용. "Good first frames leave room for the subject to move." | `[확인]` |
| **전경 장애물이 있으면 카메라 이동량을 줄여라** | "Test the occlusion at low motion first; **if it tears, flickers, or changes object type, reduce the camera movement.**" / "keep the motion small so the depth cue stays believable" — naviya.chat | `[확인]` |
| 전경 오클루전은 **금지가 아니라 조절 대상** | 같은 문서는 "sliding reveal"(전경에 가렸다가 옆으로 빠지며 드러남)을 권장 기법으로 소개. 즉 "전경 격자 구도를 피하라"는 조언은 **없다** — "모션을 줄여라"가 표준 답. | `[확인]` |
| 레이어별로 디테일 배분(전경 최다, 배경 최소·bokeh) | Hailuo "pyramid of detail" | `[확인]` |
| **카메라 무빙 하나만, 느리게** | "simple, motivated movements. A 'slow push-in' or 'steady tracking' is more likely to maintain depth." | `[확인]` |
| 첫 프레임 컨디셔닝을 약화 | 논문 층위 처방("weakening the conditioning signal"). **API로는 불가** — Seedance에 해당 파라미터 없음. | `[확인]` |
| fps/보간 조치 | 근거 못 찾음. RIFE 등 보간 도구는 있으나 "초반 어색함"을 고친다는 근거는 없음. | 출처 없음 |

### ④ 우리와 유사한 사례 (좁은 복도 + 전경 격자 + 카메라 후퇴)

**정확히 같은 케이스 리포트는 못 찾았다.** 가장 가까운 것들:

- **전경 오클루전 + 카메라 이동**: naviya.chat의 전경 오클루전 가이드 전체가 이 상황을 다룬다. 핵심 조언은 "파랄랙스를 살리되(전경이 피사체와 다르게 움직여야 함) 모션은 작게, 찢어지면 줄여라". `[확인]`
- **카메라 후퇴(pullback)**: "'Camera pullback' is usually more reliable than 'zoom out' — AI models often understand 'pullback' as a real camera moving backward, while 'zoom out' may sometimes create less natural scaling." `[검색요약]` — 우리가 "pull back" 계열 어휘를 쓰고 있는지 점검할 가치.
- **넓은 화면 가장자리 붕괴**: "warped geometry, duplicated objects at the sides, and drifting perspective during camera movement… more noticeable when action is staged close to the edge or when the camera reframes mid-shot." (카메라 이동 중 기하 왜곡·측면 객체 중복·원근 드리프트. 액션이 프레임 가장자리에 있거나 샷 도중 리프레이밍할 때 더 두드러진다.) — filmdaft. 원문 403, `[검색요약]`. **좁은 복도는 벽이 프레임 가장자리를 채우는 구도라 이 실패 모드의 정면 과녁이다.**
- **공간 지속성 부재**: "current systems lack spatial persistence: they fail to maintain stable scene structures over long trajectories, frequently hallucinating details when cameras revisit previously observed locations." `[검색요약]`

---

## §우리에게 적용 가능한 것

우리 파이프라인 좌표(읽기만 함, 수정 없음):
- 모델 스펙·duration 클램프: `/Users/xcape/projects/tale-studio/src/lib/video-models.ts` (`seedance` 엔트리: `endpoint: 'bytedance/seedance-2.0/reference-to-video'`, `duration: { mode: 'flexible', min: 4, max: 15 }`)
- fal 입력 조립: `/Users/xcape/projects/tale-studio/src/app/api/director/generate-video/route.ts`, `/Users/xcape/projects/tale-studio/src/app/api/writer/generate/videos/route.ts`
- 모션 프롬프트 생성 단계: `/Users/xcape/projects/tale-studio/src/lib/writer/pipeline/stages/v5_prompts.ts`, `v7_videos.ts`
- 타임코드 실험 하네스: `/Users/xcape/projects/tale-studio/research/experiments/previz-video-reference-ab/qual3-timed/qual3-run.mts` (`clampDuration(spec, 7)`, `buildInput`이 `video_urls`에 블록아웃 주입)

| # | 조치 | 어디를 고치나 | 비용 | 난이도 | 근거 강도 |
|---|---|---|---|---|---|
| **1** | **타임코드를 버리고 "Shot 1/2/3 순서 + 샷당 카메라 무빙 1개"로 재작성** — 7초에 3구간 타임코드는 벤더 권장(10초 이상)과 "one camera move per shot" 양쪽을 위반 | 모션 프롬프트 템플릿(`v5_prompts.ts`) + 실험 frozen prompt | 생성 1회 비용(720p 7s ≈ $2.12 텍스트만 / $1.27 영상입력) | 낮음 | **높음** (벤더 가이드 다수 일치, 우리 실측과 정합) |
| **2** | **참조 역할 계약 명시** — 프롬프트에 "@Video1 controls only the camera movement; do not copy its colors, shapes, or subjects", "@Image1 controls the first frame and set dressing only" 형태로 각 참조의 담당·비담당을 선언 | `buildInput`이 만드는 `prompt` (실험) / `v5_prompts.ts` (제품) | 생성 1회 | 낮음 | **높음** (fal·Morphic·중문 스킬 문서 모두 요구) |
| **3** | **길게 뽑고 앞을 버리기** — 7초 대신 9초 생성 후 앞 1.5~2초 트림. 실측 3(초반 최악)과 "앞뒤 불안정 구간을 잘라내라"는 실무 합의에 정면 대응. 단 **동일 프롬프트로 duration만 바꾸면 사건 배치가 통째로 재배열될 수 있음**("길이 설정은 사건을 더해주지 않는다")에 유의 | `clampDuration(spec, 7)` → 9, 그리고 편집 단계에 head-trim 규약 추가 | +2초분 생성비 (≈ +$0.36~0.60/클립) | 낮음 | 중간 (조치 자체는 다수 실무 조언, 정확한 "0.5–1초" 수치는 미검증) |
| **4** | **전경 격자 구도에서 카메라 이동량 축소 실험** — 동일 시작프레임으로 (a) 현행 이동량 (b) 절반 이동량 A/B. "찢어지면 모션을 줄여라"가 이 상황의 표준 처방이고, 우리 실측 3의 육안 어색함과 직결 | 실험 arm 하나 추가 (`qual3-timed` 패턴 재사용) | 2회 생성 | 낮음 | 중간~높음 (naviya·Hailuo 일관) |
| **5** | **시작 프레임 자체를 진단** — 현재 시작 프레임에 전/중/배경이 분리돼 보이는가? 전경 격자가 피사체와 겹쳐 "overlapping subjects"를 만드는가? 겹침이 심하면 격자를 프레임 가장자리로 밀거나 전경 대비를 낮춘 시작 프레임을 별도 생성해 A/B | 시작프레임 생성 프롬프트(이미지 파이프라인) | 이미지 1~2장 | 중간 | 중간 (seedance-2ai / Hailuo, 실무 조언) |
| **6** | **초 단위 시각이 정말 필요하면 쪼개서 체이닝** — 1구간=1클립으로 생성하고 직전 클립 마지막 프레임을 다음 `image_urls`로. frozen seam(끝단 감속) 대비로 각 클립 꼬리를 잘라 이음 | `v7_videos.ts` + 편집 조립 로직 (신규 배선 필요) | 클립 수만큼 배수 | **높음** (파이프라인 구조 변경) | 높음 (fal 공식 가이드가 직접 권장) |
| **7** | **모델 축 재검토(장기)** — 초 단위 카메라 궤적을 하드 제약으로 원한다면 Seedance reference-to-video로는 불가. Kling Motion Control 3.0(curve dolly camera path) 계열이 유일한 상용 후보 | `video-models.ts`에 모델 추가 | 조사 + 파일럿 생성비 | 높음 | 중간 (Kling 공식 문서 fetch 실패, 파라미터 미확인 — **먼저 문서 확보부터**) |
| **8** | **하지 말 것** — 타임코드를 더 촘촘히(0.5초 단위) 쓰기. Runware 문서가 sub-second micro-control을 "모델과 싸우는 것"이라 명시적으로 경고 | — | — | — | 높음 |

**우선순위 제안**: 1 → 2 → 4 를 한 배치로(같은 시작프레임·같은 씬, arm 3~4개). 3은 1·2가 끝난 뒤 별도. 6·7은 1·2·4가 실패했을 때만.

---

## §신뢰도

| 주장 | 등급 | 비고 |
|---|---|---|
| Seedance reference-to-video 입력 파라미터에 모션강도/카메라고정/궤적 없음 | **공식(벤더 API 문서), 직접 확인** | fal 모델 페이지 |
| "타임스탬프는 모델이 지킬 수도 있는 힌트" | **벤더 계열 서드파티 가이드, 직접 확인** | Morphic. ByteDance 공식 문구는 아님 |
| Seedance 2.5는 `[0-3s]` 1초 granularity 지원, sub-second는 경고 | **API 프로바이더 문서, 직접 확인** | Runware. **2.5 얘기지 2.0 아님** — 우리 모델은 2.0 |
| 타임코드는 10~15초 생성에서 권장 | **벤더 러닝센터 + 커뮤니티 스킬, 직접 확인** | Luma / dexhunter |
| 샷당 카메라 무빙 1개 | **가이드 다수 합치, 직접 확인** | Morphic·apiyi·novoads·theseanclaude |
| "다중 운동 지시 시 첫 번째만 실행" | **실무자 실측 주장(중국어), 공식 아님** | SegmentFault. 저자 본인 테스트 기반, 공식 문서 미인용 |
| diffusion time이 denoising과 모션 전개를 동시에 대리 | **논문(2026-06), 직접 확인** | arXiv:2606.10183 |
| 비디오 생성기의 시간적 구성 변화 달성률 <20% | **논문(ACL Findings 2025), 직접 확인** | arXiv:2406.08656 |
| i2v의 static motion bias, 참조 프레임 인접 초반에서 최강 | **논문(2026), 직접 확인** | arXiv:2605.19398. 요약은 fetch 도구가 PDF를 읽고 정리한 것 — 원문 문장 그대로의 축자 인용은 abstract 수준만 |
| PrevizWhiz는 3D 참조의 기여를 공간 쪽으로 주장, 시간 전달은 미주장 | **논문(CHI 2026), 직접 확인** | arXiv:2602.03838 |
| SVD/Wan 초반 프레임 불안정 버그 리포트 | **1차 이슈 트래커, 직접 확인. 단 미해결·답변 없음** | 재현 조건 미검증, Seedance 무관 |
| "전경 찢어지면 카메라 이동량 줄여라" | **실무 가이드(콘텐츠 마케팅성 블로그), 직접 확인** | naviya / Hailuo. 실측 데이터 없음 |
| "시작 프레임이 평평하면 깊이 추측하게 된다" | **실무 가이드, 직접 확인** | seedance-2ai.org. 벤더 아님, 팬사이트 성격 |
| "클립 앞뒤에 0.5~1초 불안정 프레임" | **미검증 민간요법** | 검색요약에만 등장, 원문 fetch 실패. 수치 신뢰 말 것 |
| "+0.5초 패딩 후 트림" | **미검증 민간요법** | 동일 |
| frozen seam(끝단 감속) | **미검증** | 검색요약 2회 일관 등장했으나 원문 미확인 |
| Kling Motion Control 3.0의 키프레임/보간 커브 | **미검증** | 공식 문서 HTTP 446. 파라미터명 확인 못 함 |
| Runway 카메라 컨트롤 값 = 속도·강도(진폭)지 시각 아님 | **미검증** | 헬프센터 원문 미확인 |
| warble 정의 | **미검증** | LTX 블로그 fetch 실패(파싱 에러) |
| "later frames가 더 나빠진다"(우리 관찰과 반대) | **미검증(다수 2차 자료 일관)** | vidmodel.ai 등 |
| fps/모션블러가 초반 어색함의 원인 | **출처 없음** | 찾지 못함 |
| 텍스트 인코더가 초 단위 수치를 못 접지 | **출처 없음** | 그럴듯하나 근거 미발견 |

---

## §못 찾은 것

1. **Reddit 1차 스레드 전부.** r/aivideo, r/StableDiffusion, r/comfyui — 이 환경에서 reddit.com은 검색 도메인 필터와 WebFetch 양쪽에서 차단(`Claude Code is unable to fetch from www.reddit.com`). 실무자 raw 증언은 이번 조사에 **하나도 반영되지 않았다.** 사람이 직접 검색해야 한다.
2. **X/Twitter 스레드.** 검색엔진이 인덱싱한 게 없어 하나도 못 찾음. Discord 공개 요약도 마찬가지.
3. **ByteDance 공식 Seedance 2.0 프롬프트 가이드의 시간/운동 규칙.** Volcengine 공식 글(volcengine.com/article/40840)을 읽었으나 파라미터(길이·해상도·비율) 수준 안내뿐, **타임라인 규칙도 운동 개수 제한도 없었다.** 시중의 "공식 가이드 해설" 글들이 인용하는 원문을 특정하지 못했다.
4. **Kling Motion Control 3.0의 실제 파라미터 스키마.** 공식 문서 HTTP 446. "초 단위 카메라 궤적을 실제로 받는가"를 **확정하지 못했다** — 이게 질문 1 ③의 가장 중요한 미결이다.
5. **Seedance 2.0(우리가 쓰는 버전) 자체의 타이밍 실측 벤치마크.** 누가 초 단위로 재서 "평균 X초 밀린다"를 보고한 자료 없음. 우리 실측(2~2.5초 밀림)이 이 주제에서 내가 본 유일한 정량치다.
6. **초반 1~2초 문제의 전용 명칭.** 없다고 결론. 만약 정말 필요하면 우리가 명명해서 쓰는 게 낫다(예: "motion onset window").
7. **fps/모션블러와 초반 어색함의 연결.** 근거 전무.
8. **3D 블록아웃 참조의 시간 전달 실패를 정면으로 측정한 연구.** PrevizWhiz는 "공간은 전달"만 주장하고 시간은 다루지 않는다. 우리 실측 2(블록아웃 구간 순서가 출력에서 뒤집힌 사례)에 대응하는 선행 보고를 못 찾았다 — **이건 우리가 원저자일 수 있는 지점.**
9. **좁은 복도 + 전경 격자 + 후퇴 카메라의 동일 케이스 리포트.** 없음. 구성 요소별 조언만 존재.

---

## 부록 — 주요 출처 URL

**벤더/프로바이더 문서**
- fal Seedance 2.0 reference-to-video: https://fal.ai/models/bytedance/seedance-2.0/reference-to-video
- fal Seedance 2.5 프롬프팅 가이드: https://fal.ai/learn/devs/seedance-2-5-prompting-guide
- Runware Seedance 2.5 프롬프팅: https://runware.ai/docs/models/bytedance-seedance-2-5/guides/prompting
- Luma 러닝센터 Advanced Seedance 2.0 Workflows: https://lumalabs.ai/learning-center/articles/advanced-seedance-2.0-workflows
- Volcengine 공식(내용 얕음): https://www.volcengine.com/article/40840

**실무 가이드**
- Morphic Seedance 2 가이드(가장 유용): https://morphic.com/resources/how-to/seedance-2-guide
- apiyi 공식가이드 해설: https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html
- SegmentFault 중국 실무자 실측: https://segmentfault.com/a/1190000047866527
- dexhunter/seedance2-skill (중문): https://github.com/dexhunter/seedance2-skill/blob/main/zh/SKILL.md
- MindStudio timeline prompting: https://www.mindstudio.ai/blog/timeline-prompting-seedance-2-cinematic-ai-video
- theseanclaude Seedance 프롬프트 가이드: https://theseanclaude.substack.com/p/seedance-20-prompt-guide-how-to-get
- novoads 2.5에서 은퇴한 트릭: https://novoads.ai/en/blog/seedance-2-5-prompt-workarounds-now-features
- videoinu Seedance 2.0 리뷰: https://videoinu.com/hub/review/seedance-2.0
- 전경 오클루전 프롬프트: https://www.naviya.chat/en/blog/foreground-occlusion-ai-image-video-prompts
- Hailuo 전경/배경 깊이 가이드: https://hailuoai.video/pages/knowledge/foreground-background-ai-video-cinematic-depth
- 첫/마지막 프레임 가이드: https://seedance-2ai.org/blog/ai-video-first-last-frame-guide
- 클립 체이닝 실무(Medium): https://medium.com/@shrutisaagar13/first-frame-last-frame-how-i-chain-ai-clips-into-one-continuous-shot-e6649434e689
- 중문 AI영상 입문(트림·체이닝 조언): https://aibook.ren/archives/ai-video-generation-basics
- 시간적 일관성 아티팩트 분류: https://picto.video/en/learn/temporal-consistency/

**논문**
- Making Time Editable in Video Diffusion Transformers: https://arxiv.org/abs/2606.10183
- TempoControl: https://arxiv.org/abs/2510.02226
- TC-Bench: https://arxiv.org/abs/2406.08656
- BulletTime: https://arxiv.org/abs/2512.05076
- Rebalancing Reference Frame Dominance (static motion bias): https://arxiv.org/abs/2605.19398
- Image-to-Video Diffusion: From Foundations to Open Frontiers (서베이): https://arxiv.org/abs/2605.17248
- CamCo: https://arxiv.org/abs/2406.02509
- PrevizWhiz (CHI 2026): https://arxiv.org/abs/2602.03838 / https://dl.acm.org/doi/10.1145/3772318.3790534

**1차 이슈 트래커**
- SVD 첫 프레임 불일치: https://github.com/Stability-AI/generative-models/issues/247
- Wan2.1 초반 프레임 색이동·깜빡임: https://github.com/Wan-Video/Wan2.1/issues/369
