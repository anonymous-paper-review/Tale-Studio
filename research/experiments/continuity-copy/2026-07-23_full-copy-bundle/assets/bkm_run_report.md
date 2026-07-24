# BKM 영상 생성 실행 보고 (2026-07-23)

## 명령
```
node research/experiments/utils/tools/gen/dispatch.mjs \
  --jobs research/experiments/continuity-copy/2026-07-23_full-copy-bundle/jobs.bkm.json \
  --assets research/experiments/continuity-copy/2026-07-23_full-copy-bundle/assets \
  --mode higgsfield --hf-concurrency 4 --hf-cap 80
```

## 결과 요약
- 총 잡: 27개 (i2v_se, Seedance 2.0)
- 최종 완료: **27/27** (실패 잡 없음)
- 실행 패스 수: **2회**
  - Pass 1: 13개 성공, 14개 `higgsfield CLI 실패` (T14, T15, T16a, T16b, T17, T18, T19a, T19b, T20a, T20b, T21, T22, T23, T24)
  - Pass 2 (동일 커맨드 재실행, resume이 완료 13개 skip): 나머지 14개 전부 성공 → 미완료 없음

## 이상 관찰
- Pass 1 실패는 전부 `Error: higgsfield CLI 실패: Command failed: ...` 형태로, provider 어댑터가 stderr 대신 execFile의 일반 `e.message`(명령어 echo)를 잡아 상세 원인이 로그에 드러나지 않았음.
- 실패한 잡 중 하나(T14)를 동일 인자로 higgsfield CLI에 수동 재실행한 결과 **즉시 정상 완료**(`status: completed`, result_url 반환) — 콘텐츠/입력 문제가 아니라 일시적 실패로 확인됨.
- CONVENTIONS 7-2 에러 독트린에 따라 확률적 실패(Ⓐ)로 분류: 재시도만으로 100% 해소, 코드 수정 불필요.
- Pass 1과 Pass 2 사이 동일 잡이 4회 이상 연속 차단된 사례 없음 → Ⓑ(입력 문제) 분류 대상 없음.
- 재과금 없음: `gen_state.json`의 resume 로직이 Pass 1의 성공한 13개를 정확히 skip하고 실패한 14개만 재시도함(과금 방지 확인).

## 검증
- `ls .../clips/arm-bkm | wc -l` → **27**
- ffprobe 무작위 3개 duration 확인:
  - T01.mp4: 5.06s (jobs.bkm.json seconds=5)
  - T14.mp4: 4.06s (jobs.bkm.json seconds=4)
  - T24.mp4: 5.06s (jobs.bkm.json seconds=5)
  - 모두 요청 seconds와 일치(코덱 프레임 반올림 오차 범위 내).

## 결론
BKM 팔(full-copy-bundle) i2v_se 27잡 전편 완주. 실패 잡 없음, 코드 수정 없음, 공용 도구/타 실험 폴더 무변경.
