# Artist 배경 공간 딥다이브 — 다른 각도에서 같은 공간을 유지하는 방법

- 조사일: 2026-08-18
- 범위: `research/experiments/`의 배경·viewsheet·previz·3D/blockout 실측, 외부 문서 직접 확인
- 이번 조사에서는 **유료 API 호출·이미지/영상 생성·코드 수정·테스트·린트·포맷터 실행을 하지 않았다.**
- 원문 인용은 인용부호 안에 보존했고, 내부 근거는 `파일:줄`로 표시했다.

## 1. 먼저 확인한 기존 실측 — 2D 참조는 공간을 회전시키지 못한다

### 1.1 각도 이행 실험: 참조 유무와 무관하게 무너짐

`rough-background-angle-sheet`는 같은 법정을 정면·리버스·측면·하이앵글·로우앵글·디테일의 6각도로 발주하고, 각 각도를 참조 사진 유/무로 2벌(총 12장, 약 $0.8) 만들었다. 오너의 원문 판정은 다음과 같다.

> **"둘 다 쓰레기"** / **"모든 컨시스턴시가 측면, 대각, 하이앵글로 가는 순간 다 박살남 — 레퍼런스를 쓰더라도"**

실패는 두 종류였다.

- **각도 평탄화**: 측면을 요청해도 여전히 정면 3/4 뷰로 남고, 단상·깃발·문장이 정면을 향했다.
- **공간 발명**: 리버스에서 기존 육각 천장·대리석 마감이 이어지지 않고 평천장·목재 양문인 일반 법정을 새로 만들었다.

원문은 다음과 같이 기록돼 있다.

> **"2D 참조는 그 참조가 보여주는 '시점'을 전달할 뿐, '공간'을 전달하지 못한다."** 각도가 참조를 벗어나는 순간 일관성이 붕괴한다. 참조 유무 무관 = **참조 채널로는 못 고치는 구조적 실패.**

근거: `research/experiments/rough-background-angle-sheet/result.md:1-18`.

### 1.2 앞 실험의 정정: 같은 방 판정은 같은 각도 복제였다

`rough-background-ref-holds-room`은 처치군 3/3, 대조군 0/3으로 같은 방 판정을 얻었지만, 세 샷이 모두 판사석 정면이었다. 따라서 공간 전이가 아니라 같은 시점의 복제 충실도를 측정했다.

> **"참조가 방을 붙잡는다"가 아니라 "참조는 그 참조가 보여주는 시점만 붙잡는다"**

유효한 수확은 참조 이미지에서 러프 스케치로 **시점과 양식이 충실히 전이되는 마지막 링크**다. 처치군은 18표 전원 confidence=high, 흑백 러프 유지 18/18이었다. 즉 회전 가능한 기하 소스가 먼저 있으면 `기하 소스 → 해당 각도 렌더 → 참조 → 러프 스케치` 링크를 재사용할 근거가 있다.

근거: `research/experiments/rough-background-ref-holds-room/result.md:1-18`, `:42-78`.

### 1.3 3D 블록아웃은 공간 정체를 전달하지만 시간·순서는 보장하지 않았다

`previz-video-reference-ab/qual2-fullmotion`의 블록아웃 v2는 정면→측면→측면 추적을 0–1초, 1–2초, 2–7초에 배치했다. 출력은 **0–4초 측면 추적 → 4–7초 후방 추종**이었고, 계획한 정면→측면 순서와 반대였다. 그러나 파이프 복도와 격벽 문이 유지돼 **닫힌 실내 정체는 전달**됐다.

원문:

> 블록아웃이 옮긴 것은 **"어떤 카메라 동작이 이 샷에 있는가"**(측면 트래킹 + 정면축 구간 + 좁은 복도)이고, 옮기지 못한 것은 **"그 동작들이 언제 오는가"**(계획 순서)다. 배경 정체 처방은 먹혔다(박스 벽 배치).

근거: `research/experiments/previz-video-reference-ab/qual2-fullmotion/notes.md:1-42`.

### 1.4 영상 참조가 있어도 시간은 밀렸다

`qual3-timed`는 같은 프롬프트에서 START 이미지에 3D 블록아웃 영상을 추가한 T3D와 TXT를 비교했다. T3D는 1–2초에 시작해야 할 스윙이 약 3초에 시작해 4.25–4.5초에 끝났다. TXT도 약 3.5초에 시작했다. 두 팔 모두 정면→스윙→측면이라는 **순서는 지켰지만 시각이 뒤로 밀렸다**.

원문:

> 양 암 모두 **구간의 순서와 종착 구도는 시간표와 같고(정면 → 스윙 → 측면 유지), 구간의 시각만 뒤로 밀렸다** — 정면 구간이 지시된 1초의 3~3.5배로 늘어났고, 스윙은 지시된 1~2초 창이 아니라 3~4.5초 사이에 일어났다.

비용은 당시 실측 기준 T3D $1.2698(7초, video input), TXT $2.1168(7초, 이미지 input)였다. 판독 해상도는 ±0.25초다.

근거: `research/experiments/previz-video-reference-ab/qual3-timed/notes.md:1-18`, `:75-93`; 실행 배선·단가 기록은 `research/experiments/previz-video-reference-ab/qual3-timed/qual3-run.mts:1-12`, `:36-49`.

### 1.5 전경 3D가 오히려 공간 교체를 일으킨 관찰

`qual5-parallax`에서는 전경 기둥 10개를 넣은 FG3D 팔이 좁은 복도에서 넓은 산업 공간으로 바뀌었고, 전경 기둥의 속도가 벽·바닥과 달랐다. 전경을 제거한 NOFG 팔은 시작부터 끝까지 같은 복도로 읽혔다. 다만 NOFG 시작 이미지가 379×257에서 1088×608로 바뀐 교란이 있어, 3D 전경 기둥만의 효과로 단정할 수 없다.

원문:

> **ⓐ FG3D**: ... 배경도 좁은 복도에서 **넓은 산업 공간(가로 파이프 탱크, 큰 벽면)으로 열린다.**
>
> **ⓑ NOFG**: 0~2초 구간이 **좁은 복도로 일관되게 유지**된다.

근거: `research/experiments/previz-video-reference-ab/qual5-parallax/notes.md:1-18`, `:34-65`.

### 1.6 현재 파이프라인에서 실제로 연결된 범위

읽기 전용 좌표 조사에서 현재 Seedance 경로는 `src/lib/video-models.ts`의 `bytedance/seedance-2.0/reference-to-video`를 사용하고, 영상 입력 조립은 `src/app/api/director/generate-video/route.ts`와 `src/app/api/writer/generate/videos/route.ts`에 있다. 타임코드 하니스는 블록아웃을 `video_urls`에 넣는다.

> 모델 스펙·duration 클램프: ... `endpoint: 'bytedance/seedance-2.0/reference-to-video'`, `duration: { mode: 'flexible', min: 4, max: 15 }`  
> 타임코드 실험 하네스: ... `buildInput`이 `video_urls`에 블록아웃 주입

근거: `research/experiments/_research/short-video-timing-and-rampup.md:269-273`.

## 2. 외부 후보 — 문서 URL을 직접 확인한 근거

### 후보 A — Blender 3D 블록아웃 + 고정 카메라/경로 렌더 (가장 실행 가능)

**외부 근거**

- Blender 공식 매뉴얼 [Follow Path Constraint](https://docs.blender.org/manual/en/latest/animation/constraints/relationship/follow_path.html) 직접 확인:
  > "The *Follow Path* constraint positions an object or bone on a [Curve]."
  > "By animating these properties, the object or bone can be made to move along the Curve."
  > "Use cases include cameras on rails..."
- Blender 공식 매뉴얼 [Animation Output](https://docs.blender.org/manual/en/latest/render/output/animation.html) 직접 확인:
  > "Frame Sequence ... render your scene out to a set of images, where each image is a frame in the sequence."

**입력 → 출력 → 일관성 방식**

- 입력: 사람이 만든 단순 벽·천장·기둥·문·랜드마크, 카메라, 필요하면 Curve 경로와 키프레임.
- 출력: 각 카메라 위치의 정지 PNG 또는 카메라 경로의 프레임 시퀀스/영상.
- 일관성: 같은 3D 좌표와 같은 카메라를 다시 렌더하므로, 보이지 않던 면을 매번 이미지 모델이 새로 발명하지 않는다. 단, 블록아웃의 좌표·랜드마크를 사람이 잘못 만들면 그 오류가 그대로 반복된다.
- 현재 연결성: **높음.** 이미 `qual2/qual3`의 headless Blender 블록아웃과 `video_urls` 주입이 있고, `rough-background-angle-sheet`가 보여준 마지막 링크(참조 렌더 → 러프)가 작동한다.
- 예상 비용: Blender 렌더 자체는 이번 내부 스크립트 기준 0.5초(로컬 실행)이며 API 비용은 없다(`research/experiments/previz-bg-plate-ab/plates/blockout_notes.md:1-26`). 향후 생성 비용은 아래 Seedance 단가만 추가된다. 사람 작업 시간은 이번 자료에서 측정하지 않아 미상으로 남긴다.
- 1인 운영 난도: **중간**. 한 공간의 기본 도형과 랜드마크는 손으로 한 번 만들고, 이후 각도/경로를 재생산할 수 있다. 사람 손으로 보이지 않는 면을 추정하는 초기 작업이 병목이다.

### 후보 B — 3D 블록아웃을 카메라 경로 영상으로 렌더해 Seedance에 전달 (단기 상위 후보)

**외부 근거**

- fal 공식 [Seedance 2 Reference to Video](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video) 직접 확인:
  > "Generate video from up to 9 images, 3 videos, and 3 audio clips with native audio and cinematic camera control."
  > `video_urls`: "Reference videos to guide video generation ... Up to 3 videos"
  > 출력: `video` URL과 `seed`.
- 같은 문서의 가격: **720p 이미지 전용 $0.3034/초**, 영상 입력 동반 시 **$0.1814/초**. 따라서 7초 기준 약 $2.1238(이미지 전용), 약 $1.2698(영상 입력)이다. 실제 내부 qual3도 T3D $1.2698을 기록했다.

**입력 → 출력 → 일관성 방식**

- 입력: START PNG + Blender가 렌더한 블록아웃 MP4(카메라 이동만 표현) + 카메라/장면 역할을 분리한 프롬프트.
- 출력: Seedance 영상. 공간·카메라의 coarse motion은 video reference가 제공하고, 최종 스타일·인물은 START/스타일 참조가 제공한다.
- 일관성: 경로의 프레임 시퀀스가 같은 3D 좌표를 반복해서 보여주는 방식. 그러나 내부 qual3에서 **순서는 유지돼도 시각은 밀림**이 관찰됐으므로, 정확한 초 단위 제약으로 약속하면 안 된다.
- 현재 연결성: **높음.** 현행 엔드포인트가 `video_urls`를 이미 받고, 블록아웃 재사용 URL과 비용 기록까지 있다.
- 예상 비용: 4초 1편이면 영상 입력 기준 약 $0.7256, 7초 1편이면 약 $1.2698(현재 fal 문서 가격 기준). 블록아웃 렌더 비용은 로컬이며, 오디오를 끄는 옵션을 사용해도 문서상 영상 단가는 동일하다.
- 1인 운영 난도: **중간**. Blender 경로 한 번 세우면 재사용 가능하지만, 영상 참조 역할을 프롬프트에 명시해야 한다. 초 단위 정밀성이 필요하면 별도 컷 분할/편집이 필요하다.

### 후보 C — 다중 뷰 확산/단일 이미지→3D (장기 후보, 바로 연결하지 않음)

**외부 근거**

- [Wonder3D: Single Image to 3D using Cross-Domain Diffusion](https://arxiv.org/abs/2310.15008) 직접 확인:
  > "we introduce ... a cross-domain diffusion model that generates multi-view normal maps and the corresponding color images."
  > "geometry-aware normal fusion algorithm ... extracts high-quality surfaces from the multi-view 2D representations."
- [MVDream: Multi-view Diffusion for 3D Generation](https://arxiv.org/abs/2308.16512) 직접 확인:
  > "generate consistent multi-view images from a given text prompt."
  > "the consistency of 3D renderings."

**입력 → 출력 → 일관성 방식**

- Wonder3D 입력은 단일 이미지, 출력은 여러 뷰의 색/법선과 융합된 3D 표면이다. MVDream 입력은 텍스트 프롬프트이며 출력은 일관된 다중 뷰 이미지이고, 3D 생성의 prior로 사용된다.
- 일관성은 단순히 2D 이미지를 각도별로 다시 그리는 것이 아니라, 뷰 간 attention/법선 융합 또는 3D prior를 통해 유지한다.
- **현재 연결성: 낮음.** 내부 `gpt-image-2/edit` 각도 시트 레인과 같은 제품 경로가 아니며, 현재 저장소에는 이 모델의 실행기·호출 계약·방 렌더 파서가 없다. 특히 Wonder3D는 물체 단일 이미지 연구에 가깝고, 법정/방 같은 방 규모 공간에서의 성공을 내부 자료가 증명하지 않는다.
- 예상 비용: 공개 논문에는 상용 API 단가가 없다. 이번 조사에서 호출하지 않았고, 로컬 GPU/호스팅 비용은 환경에 따라 달라 **미상**으로 둔다.
- 1인 운영 난도: **높음**. 모델 실행 환경, 방 규모 데이터의 품질, 메시 정리·카메라 보정·렌더 연결을 새로 운영해야 한다.

### 후보 D — 카메라 포즈/궤적 조건화 모델 (연구 근거 강함, 제품 연결 낮음)

**외부 근거**

- [CamCo: Camera-Controllable 3D-Consistent Image-to-Video Generation](https://arxiv.org/abs/2406.02509) 직접 확인:
  > "CamCo ... allows fine-grained Camera pose Control for image-to-video generation."
  > "We equip a pre-trained image-to-video generator with accurately parameterized camera pose input using Plücker coordinates."
  > "an epipolar attention module ... enforces epipolar constraints ..."
- [CamCtrl3D: Single-Image Scene Exploration with Precise 3D Camera Control](https://arxiv.org/abs/2501.06006) 직접 확인:
  > "generating fly-through videos of a scene, from a single image and a given camera trajectory."
  > 조건으로 raw camera extrinsics, camera rays, 재투영 비디오, global 3D representation을 결합한다고 설명한다.

**입력 → 출력 → 일관성 방식**

- 입력: 단일 시작 이미지 + 프레임별 카메라 포즈/trajectory(또는 extrinsics·camera rays).
- 출력: 카메라 궤적을 따르는 fly-through/I2V 영상.
- 일관성: CamCo는 Plücker 좌표와 epipolar attention으로 3D 관계를 강제하고, CamCtrl3D는 reprojection과 global 3D representation을 결합한다.
- 현재 연결성: **낮음.** 둘 다 연구 모델/논문이며 현재 fal 엔드포인트에 해당 포즈 입력 필드가 없다. fal의 현행 스키마는 `prompt`, `image_urls`, `video_urls`, `audio_urls`, `resolution`, `duration`, `aspect_ratio`, `generate_audio`, `bitrate_mode`, `end_user_id`를 제공하지만 별도의 `camera_trajectory`·`camera_pose` 필드는 문서에 없다.
- 예상 비용: 논문에는 상용 호출 가격이 없다. 실행하지 않았고, 별도 GPU·모델 포팅 비용은 미상이다.
- 1인 운영 난도: **매우 높음**. 연구 코드·가중치·포즈 추정·카메라 좌표 보정·제품 배선이 모두 필요하다.

### 탈락 후보 — 2D I2I로 한 장에서 5–8개 뷰 만들기

- 내부 실측에서 각도 평탄화와 공간 발명이 모두 나왔고, `rough-background-angle-sheet`가 I2I 뷰 시트 레인을 명시적으로 기각했다(`result.md:32-48`).
- 외부 다중 뷰 논문은 단순 I2I가 아니라 뷰 간 attention/3D prior/geometry fusion을 추가한 연구다. 따라서 “다중 뷰”라는 이름만으로 기존 I2I 레인을 부활시키지 않는다.

## 3. 실행 가능성 비교

| 후보 | 입력 | 출력 | 일관성의 근거 | 현재 파이프라인 연결성 | 예상 비용(사실/미상 분리) | 1인 운영 난도 | 판정 |
|---|---|---|---|---|---|---|---|
| **A Blender 블록아웃** | 3D 도형+카메라/Curve | 각도 PNG·프레임 시퀀스 | 동일 좌표·카메라로 재렌더 | **높음**: 기존 Blender headless와 이미지 참조 링크 | 로컬 렌더 API $0; 내부 렌더 0.5초. 초기 사람 시간 미측정 | 중간 | **1순위** |
| **B 블록아웃→video_urls** | START PNG+3D MP4 | Seedance 영상 | 같은 3D 경로를 프레임으로 전달; 시간은 drift 가능 | **높음**: 현재 Seedance 입력 계약에 이미 연결 | 720p 영상 입력 $0.1814/s; 4초 $0.7256, 7초 $1.2698 | 중간 | **2순위/단기 실험** |
| **C Wonder3D/MVDream** | 단일 이미지 또는 텍스트 | multi-view 색/법선, 메시 또는 3D prior | cross-view attention·normal fusion·3D prior | 낮음: 실행기/방 파서 없음 | 상용 단가 없음, GPU 비용 미상 | 높음 | 장기 조사 |
| **D CamCo/CamCtrl3D** | 이미지+포즈/궤적 | trajectory 영상 | Plücker/epipolar 또는 global 3D 조건 | 낮음: 제품 입력 필드 없음 | 논문 가격 없음, 포팅/GPU 미상 | 매우 높음 | 장기 연구 |
| **기존 2D I2I 시트** | 한 장 참조+각도 문장 | 각도별 러프 이미지 | 시점 복제에만 강함 | 이미지 호출은 가능하지만 공간 전이는 실패 | 12장 약 $0.8 실측 | 낮음 | **기각** |

## 4. 상위 후보의 다음 실험 설계 (생성은 다음 승인 후에만)

### 4.1 질문과 가설

- 질문: **한 공간을 3D 기하로 한 번 세운 뒤, 보유하지 않은 4개 각도에서도 같은 랜드마크가 유지되는가?**
- 주 가설: Blender 블록아웃에서 각 카메라를 렌더하면 2D I2I 단독보다 랜드마크·상대 위치 일관성이 높아진다.
- 보조 가설: 블록아웃 MP4를 `video_urls`로 넣으면 공간 정체는 유지되지만, qual3에서 이미 관찰된 것처럼 구간 시각은 늦어질 수 있다.

### 4.2 고정할 입력

- 공간: 내부 법정 Sample1, wide shot 1장.
- 3D 랜드마크 5개: 육각 천장 코퍼/코브 조명, 중앙 대리석 베이·두 기둥, 원형 문장·명판, 좌측 태극기·우측 법원기, 양쪽 출입구·유리 연단.
- 카메라: 정면 마스터·리버스·측면·하이앵글 4개. Blender 파일/스크립트, 카메라 좌표, 렌더 설정, 랜드마크 좌표를 모두 저장한다.
- 스타일·출력: 내부 러프 프롬프트와 동일하게 고정하고, 사람은 제외해 배경 기하만 판정한다.

### 4.3 팔과 절차

1. **2D 기준 팔**: 기존 wide shot 1장 + 각도 문장. 기존 실패를 재현하는 기준선으로만 둔다.
2. **3D 정지 팔(우선)**: 같은 Blender 공간에서 4개 각도 PNG를 렌더하고, 각 PNG를 기존 러프 참조 배열에 넣는다. 각도별 3회 반복(총 12장)으로 랜드마크 유지 여부를 본다.
3. **3D 영상 팔(후속)**: 같은 공간에서 4초·단일 카메라 이동(예: 정면에서 천천히 측면으로) MP4를 렌더해 START PNG + `video_urls`로 전달한다. 초 단위 안무를 넣지 않고, 방향·속도·종착 상태만 적는다.
4. **다중 뷰 연구 팔(조건부)**: C 후보를 실행할 수 있는 재현 가능한 환경/방 규모 검증이 확보될 때만 별도 팔로 추가한다. 현재는 호출하지 않는다.

### 4.4 판정표(사전 등록 제안)

- **정지 각도 랜드마크 점수**: 각 출력에서 5개 랜드마크의 존재·상대 위치·벽/천장 연결을 0/1로 기록.
- **교차 각도 일관성**: 4개 뷰의 6쌍에서 같은 방으로 읽히는지 블라인드 다수결. 기준 제안: 6쌍 중 5쌍 이상에서 5개 랜드마크 중 4개 이상 유지하면 3D 정지 팔 승격.
- **2D 기준 대비**: 같은 판독표로 기준 팔과 비교하되, 기존 2D 실패를 새로 “해결”했다고 과장하지 않고 차이를 기록한다.
- **영상 팔**: 0/2/4초 프레임에서 랜드마크 소실·새 구조 발명·공간 교체를 체크하고, 카메라 순서와 종착 구도를 분리해 기록한다. 시간 오차는 ±0.25초 판독 한계를 명시한다.
- **비용/재현성**: 실제 호출 전에 `video_urls`/`image_urls`, 모델, duration, 해상도, seed, request_id를 manifest에 저장할 준비만 한다. 이번 조사에서는 유료 호출하지 않는다.

### 4.5 다음 실험의 예상 자원

- Blender 공간 구성·4개 PNG·1개 MP4: 로컬, 내부 선례처럼 API 비용 0. 사람 작업 시간은 이번 조사에서 측정하지 않았으므로 미상.
- Seedance 4초 영상 팔: 현재 fal 문서의 video input 단가를 적용하면 약 $0.7256/편(오디오 포함 여부와 무관한 문서 단가). 정지 러프 이미지 단가는 실험 전 현재 가격을 다시 확인해야 한다.
- 총 예산·시행 수는 오너 승인 전에는 고정하지 않는다. 기존 실험처럼 모든 입력·단가·실패/반려를 manifest에 남긴다.

## 5. 결론과 남은 미지수

1. **지금 실행 가능한 최고 후보는 3D 블록아웃을 단일 기하 원천으로 삼는 것**이다. 내부 실측이 요구하는 “회전 가능한 소스”를 직접 만들고, 현재의 참조 이미지→러프 링크를 그대로 재사용할 수 있다.
2. **단기 영상 후보는 3D 블록아웃 MP4를 `video_urls`로 전달하는 것**이다. 공간·coarse camera motion에는 연결되지만, qual3가 보여준 시간 지연을 해결한다고 주장하지 않는다.
3. **다중 뷰/카메라 포즈 논문은 일관성 메커니즘의 근거는 강하지만 현재 제품 후보가 아니다.** 실행 환경·방 규모 검증·제품 배선이 없어 비용과 성공률을 사실처럼 적지 않았다.
4. **I2I 뷰 시트는 탈락**이다. 정면과 다른 각도를 같은 공간으로 유지해야 하는 이번 문제를 참조 한 장에 다시 맡기는 것은 이미 실패한 경로를 반복한다.

남은 미지수: ① 한 장에서 손으로 세운 3D 블록아웃이 보이지 않는 면의 실제 공간을 얼마나 잘 추정하는가, ② 3D 렌더를 참조로 받은 러프가 표면 재질·랜드마크를 얼마나 보존하는가, ③ 영상 입력이 공간을 지키면서도 전경 구조를 교체하지 않는가, ④ Wonder3D/MVDream의 방 규모 일반화가 가능한가. 이 네 가지는 생성 없이 해결할 수 없으므로 다음 승인된 실험으로 분리한다.

한 줄 요약: **한 장짜리 사진을 회전시키는 대신 3D 블록아웃을 한 번 세우고 각도별 렌더를 참조로 쓰는 것이 현재 파이프라인에서 가장 싸고 검증 가능한 경로다.**
