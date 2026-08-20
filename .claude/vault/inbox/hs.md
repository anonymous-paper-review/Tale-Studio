# hs의 밤 메모

형식 없이 아래에 적는다. 이 파일에는 hs만 쓴다.
사람이 쓴 원문 바이트는 고치거나 지우지 않는다. 상태 표식은 검증된 `night-runtime.py`만 붙인다.

---

26.08.18

<!-- vault-inbox-item:start
{"actor":"hs","byte_length":167,"content_sha256":"0ba36660e4513827c285796d88d0f0c83146ee796d84549f60c6ff94be6a7b76","item_id":"25cb264b19892c5a8cd40fc4b5a485f1073605a94f8ad9791c21f54eb90dc61b","schema":1,"snapshot_id":"4ced5ed601919604f1572342fdd0c9ff1c98498ba304352e28ee37ecc7828104","source_key":"inbox/hs.md","source_range":{"end":178,"start":11},"state":"tracked","units":["U1-producer-welcome-order","U2-welcome-refire-fact-pin"]}
-->
1. 채팅창에서 새로고침 시 웰컴 멘트의 위치가 맨위가 아니라 가장 최신 (맨 아래)에 있는데 원래 위치에 삽입되게 수정 필요
<!-- vault-inbox-item:end -->

<!-- vault-inbox-item:start
{"actor":"hs","byte_length":455,"content_sha256":"bd81c11f081698b58698f8a7abfa32c646a7621c2df37f9813b20c5cadd96f43","item_id":"e3f351f01c8fdab5097c34e1cc3342b963b8b5d7582e0e256c7ba160583b8f4b","schema":1,"snapshot_id":"4ced5ed601919604f1572342fdd0c9ff1c98498ba304352e28ee37ecc7828104","source_key":"inbox/hs.md","source_range":{"end":634,"start":179},"state":"tracked","units":["U3-producer-input-type-blueprint"]}
-->
2. producer에서 외부 자료를 입력할 경우 writer가 아닌 producer 채팅창에서 수정을 하려고 할 것이다.  -> 유저를 자연스럽게 writer로 넘어가게 하거나 강제로 옮겨야함 -> 유저가 어떤 파일 유형(ex. 각본, 캐릭터시트, 웹툰, PPT...)을 입력하는지에 따라 유저 블루프린트를 만들지가 달라질 것이고 이 결과에 따라 명확한 해결법을 찾을 수 있을 것이다.
<!-- vault-inbox-item:end -->

<!-- vault-inbox-item:start
{"actor":"hs","byte_length":351,"content_sha256":"fee1c63c752056cc73944d886ce0b125ca1f82ad6a98f94ad23995d2b0a1f3eb","item_id":"5ef1eee735145fff70b5b2b14a6fe1558f80961d26cfad56b059e2f21a410a73","schema":1,"snapshot_id":"4ced5ed601919604f1572342fdd0c9ff1c98498ba304352e28ee37ecc7828104","source_key":"inbox/hs.md","source_range":{"end":986,"start":635},"state":"tracked","units":["U4-producer-image-context-loss","U9-image-context-reject-followup"]}
-->
3. 지금 producer에서 이미지 입력 시 연달은 다음 채팅에서 이미지에 대한 맥락을 모른다. 하지만 writer 파이프라인 결과물에서는 웹툰 내용을 잘 참조한다. 채팅에서도 이미지에 대한 맥락을 가질 수 있게 수정이 필요하다. 현재 원인 분석 및 해결법 강구가 필요하다.
<!-- vault-inbox-item:end -->


26.08.19

<!-- vault-inbox-item:start
{"actor":"hs","byte_length":128,"content_sha256":"51c86635f3d817dc13b58a76fed813a67df930ec0c6a4bf67ccd668780dee69d","item_id":"da4b9c25e717eec8b7946234d2aabd9db86aeef32ac72f35a26159e46a810200","schema":1,"snapshot_id":"4ced5ed601919604f1572342fdd0c9ff1c98498ba304352e28ee37ecc7828104","source_key":"inbox/hs.md","source_range":{"end":1126,"start":998},"state":"tracked","units":["U8-writer-v2-fact-map"]}
-->
1. writer V2의 영상학적, 스토리적 미흡점 분석해서 예시, 사례 기반으로 문제 설명 아티팩트 제작
<!-- vault-inbox-item:end -->
