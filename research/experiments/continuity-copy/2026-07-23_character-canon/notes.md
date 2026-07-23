# 캐릭터 신원 정본 — 진행 기록

레퍼런스 카피 실험(입력 포맷 비교)에서 모든 방식이 **같은 인물**을 재현해야 저작 변수를 지운다.
그래서 "이 인물이 누구인가"를 먼저 하나로 고정했다.

## 무엇을 했나

1. **텍스트 후보 4종 생성 → 폐기**. 인물을 글(프롬프트)로만 묘사해 4장을 뽑아봤다
   (![](assets/thumbs/candidate_1.jpg) ![](assets/thumbs/candidate_2.jpg)
   ![](assets/thumbs/candidate_3.jpg) ![](assets/thumbs/candidate_4.jpg)).
   오너 판정: 글 묘사로는 레퍼런스의 인물과 같은 사람이 안 나온다 → **전부 폐기**.
2. **레퍼런스 정면 1장을 정본으로 확정**. 원본 영상 10.9초 지점의 정면 프레임 한 장을
   신원 기준으로 채택했다 → ![](assets/thumbs/identity_ref.jpg).
   (레퍼런스에서 뽑아둔 각도 팩은 ![](assets/thumbs/_pack_preview.jpg) 에 보관 — 원본은 `assets/ref_extracted/_pack_preview.jpg`.)
3. **신원 전파 테스트 2컷 성공**. 정본 1장으로 다른 포즈·앵글을 생성해 같은 인물로 유지되는지 확인 —
   ![](assets/thumbs/test_34_fullbody.jpg) ![](assets/thumbs/test_profile_sit.jpg) 모두 통과.

## 다음 용도

이 정본(`identity_ref.jpg`)은 입력 포맷 실험의 **공통 재료**다 — 모든 방식이 이 한 장을 신원 기준으로
받아 같은 인물로 콘티를 재현한다. → [`../2026-07-23_input-format/conti.md`](../2026-07-23_input-format/conti.md)
