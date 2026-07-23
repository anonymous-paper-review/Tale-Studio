# Ⓒ 클러스터 체이닝 — 이 팔의 재료는 어디에 있나

> 설계: [`../../blueprint-c.md`](../../blueprint-c.md) · B1과 같되 딱 하나가 다르다:
> **같은 사건 묶음 안에서는 앞 샷이 "실제로 생성된" 클립의 마지막 화면을 뽑아 다음 샷의 시작
> 프레임 제작에 물린다.** 설계상의 연결이 아니라 실물 연결 — 동작이 컷을 관통하는 느낌을 가장
> 충실히 재현한다는 가설. 대가는 순차 실행(앞 클립이 나와야 다음이 시작됨).

## 이 폴더에 이미지 파일이 없는 이유

C 팔의 재료는 두 종류로 갈리고, 둘 다 여기 저장할 것이 없다:

1. **설계 프레임 (샷 1·3·4 시작 + 샷 1~6 끝 전부)** — B1과 동일하므로 **`../arm-b1/frames/`를
   그대로 재사용**한다 (blueprint-c §2: "Ⓑ1과 동일"). 복사본을 만들면 두 팔이 다른 파일을 쓰는
   것처럼 보이므로 만들지 않았다.
2. **체인 프레임 (샷 2·5·6 시작)** — **정의상 사전 생성이 불가능하다.** 앞 샷 클립의 "실제 마지막
   화면"이 입력인데, 클립은 영상 단계에서야 생긴다. 대신 payloads.json에 실행 절차가 명세로 실려
   있다 (아래).

## 영상 모델에 실제로 넘어가는 것 (payloads.json `arms.c`, `execution: "sequential"`)

| 샷 | start_image | end_image | 비고 |
|---|---|---|---|
| 1 | `arm-b1/frames/s1_start.jpg` | `arm-b1/frames/s1_end.jpg` | 설계 프레임 |
| 2 | **null — 런타임 제작** | `arm-b1/frames/s2_end.jpg` | `chain` 블록: 클립1 마지막 프레임에서 |
| 3 | `arm-b1/frames/s3_start.jpg` | `arm-b1/frames/s3_end.jpg` | 마스터 쉼표 — 체이닝 미적용 |
| 4 | `arm-b1/frames/s4_start.jpg` | `arm-b1/frames/s4_end.jpg` | 설계 프레임 |
| 5 | **null — 런타임 제작** | `arm-b1/frames/s5_end.jpg` | `chain` 블록: 클립4 마지막 프레임에서 |
| 6 | **null — 런타임 제작** | `arm-b1/frames/s6_end.jpg` | `chain` 블록: 클립5 마지막 프레임에서 |

체인 샷의 `chain` 블록에 담긴 런타임 절차 (러너가 그대로 수행):

```
1. ffmpeg으로 앞 샷 클립(from_shot_clip)의 마지막 프레임 추출
2. 편집 모델(openai/gpt-image-2/edit)에 [추출 프레임, 캐릭터 정본] 2장 참조 + chain_prompt
   → 이 샷의 시작 프레임 생성   (여기서 이미지 ~3콜 추가 발생)
3. (시작, 끝) 2장 + 동작 텍스트로 I2V — 이후는 B1과 동일
```

체이닝 프롬프트 (blueprint-c §2 그대로, payloads에 수록):

- **샷 2** ← 클립1: "Continue this exact moment: the same woman, same wand position at her lips,
  but seen from a left side profile at the counter. Same lighting, same room."
- **샷 5** ← 클립4: "The next instant: her gaze drops from the mirror to the sink below — now seen
  from inside the sink looking up at her face over the orange rim."
- **샷 6** ← 클립5: "What she is looking at: extreme close-up of the same orange basin and chrome
  drain, no person."

## 관전 포인트

- B1 대비 1→2, 4→5→6 이어받기(립글로스 위치·머리 각도·시선의 실물 상속)가 더 자연스러운가.
- 오류 전파: 클립1이 이상하면 사슬 전체에 번진다 (B1은 샷별 독립 — 이 트레이드오프가 본질).
- 세대 열화: 생성 클립의 마지막 화면은 원본 그림보다 흐릿할 수 있다 — 체인 시작 프레임의 디테일 관찰.
