# 오너 메모 보관함

이 파일은 오너가 밤에 남길 말을 그대로 적는 공간이다. 생각, 목표, 질문, 관찰, 우선순위, 보류 이유를 원하는 순서와 길이로 쓴다. 제목이나 정해진 칸, 상태값, 승인 문구는 필요 없다.

밤 루프는 이 원문을 고치거나 지우지 않는다. 실행을 시작할 때 원문을 바이트 그대로 스냅샷하고, 스냅샷의 범위와 해시를 결과 기록에 남긴다. 메모를 고치면 이전 메모를 덮어쓰는 것이 아니라 새로운 메모로 취급한다.

메모를 비워 두거나 문장을 완성하지 않아도 된다. 밤은 읽은 내용을 자기 말로 해석하고, 검증 가능한 실행 단위로 나눈 뒤, 무엇을 했고 무엇을 배웠는지 기록한다. 다음 아침에는 그 결과를 보고 합치기·반려·수정 의견을 남긴다.
---
## 오너
text to video로 힉스필드에서 돌릴떄랑 
실행 프롬프트:
Single unbroken handheld boyfriend vlog take throughout, 30 seconds total. A realistic personal travel vlog filmed by a boyfriend following his girlfriend during a normal day in Tokyo. Use the woman from the reference image as the main character. Maintain her exact facial identity, hairstyle, facial features, body proportions, and overall appearance throughout the entire video. She must remain the same person in every shot. The camera feels like a real boyfriend holding a small mirrorless camera or phone, not a professional production. Natural handheld movement, imperfect framing, occasional camera shake, spontaneous reactions, authentic everyday moments. The woman does not pose for the camera. She behaves naturally, sometimes forgetting the camera is there. 0-5s: Morning at a small Tokyo apartment. The camera starts recording as the boyfriend casually walks into the room. Soft morning sunlight enters through the window. The woman is sitting near the bed, fixing her hair and preparing for the day. She notices the camera, smiles naturally, laughs, and playfully tells him to stop filming. The camera stays close, slightly shaky, capturing a private everyday moment. 5-10s: Walking through Tokyo neighborhood streets. The boyfriend follows behind her as they leave the apartment. She walks through a quiet Tokyo street, carrying a small bag. Morning shops are opening, bicycles pass by, locals walk along the street. She stops at a convenience store. The camera follows her inside. She looks at different drinks and snacks, turns around and asks the person behind the camera which one she should choose. Natural interaction, casual conversation, realistic body language. 10-18s: Local food experience. The camera follows her through a small Tokyo alley to a cozy local restaurant. She sits down and tries a bowl of ramen or a local dish. The camera captures close handheld moments: her picking up chopsticks, tasting the food, reacting naturally, laughing when the food is hotter than expected. The boyfriend laughs behind the camera. The moment feels unplanned and authentic. 18-25s: Tokyo afternoon exploration. The couple walks through a lively neighborhood. She browses small shops, looks at interesting objects, takes photos, and occasionally looks back at the camera. The camera moves naturally between her face, her hands, the street atmosphere, and small details of daily life. Crowds pass naturally around them. The city feels alive and real. 25-30s: Tokyo night ending. Night falls. The camera follows her through illuminated Tokyo streets. She walks slightly ahead, then turns back and smiles at the camera. They ride a train home. She sits beside the window, watching city lights pass outside. The camera slowly moves closer as she rests quietly, ending like a real personal memory. Visual style: Authentic boyfriend travel vlog footage. Realistic handheld camera movement. Natural lighting. Casual documentary realism. Unplanned everyday moments. Real human expressions and interactions. Slight motion blur, natural exposure changes, realistic camera autofocus adjustments. No commercial advertisement style. No dramatic posing. No perfect cinematic composition. No text overlays. No logos. No face changes. No identity changes. No artificial transitions. No CGI feeling. Stable character consistency throughout.

현재 v1,v2 writer 및 우리 워크플로우로 돌렸을때 퀄리티 차이가 존재하는데
뭐가문제인지 모름

입력창 좀 더 말랑하게 만들기 (DB나 백엔드가 딱딱하면 됐지 입력이 딱딱할 필요가 있는가?) ->입력은 뭘들어오든 채팅,다양한확장자 클러드가 배쉬 등 다양한 툴로 해석해서 입력받고 그걸 정보화해서 DB에 저장만 잘하고 재사용하면 되지않나? (producer기준으로?) 무조건 이런 입력이면 이렇게 처리해야해! 이런건 너무 딱딱하지 않은? 방식인듯?


연속 프로젝트 만들때 다른 프로젝트에서 이전 프로젝트 상속받기(캐릭터, 월드, 이어질 전 이야기(compacted))

우리 시스템으로 뮤직비디오, 광고, 웹툰 실시화, 애니 실시화해보기
- 가능하다면 외부조사로 뮤비,광고,웹툰에대한 입력 가져오고
이거하려면 각 입력에대해서 스토리,연출,비주얼축을 각각 뽑는 해석(입력)기가 필요한데 그걸 claude 채팅하나가 해줄수있을까?


 원격저장소개념, 친구 harvest, 내 harvest, 내 inbox, 친구 inbox를 가장 적절한 형태로 상태관리하고 저장하는게 어떤걸까?
- 각자의 로컬에 있어서 문제가되는건데
- harvest는 어떻게든 .omc, .claude같은데서 긁어오는게 필요할거고 (push까지 원격저장소 혹은 노션 이런곳으로 빼내거나,,,) 결국 저장소의 개념이 필요할듯,, 일종의 맥락을 담고있는?
- 그게 노션일지 깃일지 아니면 다른 개념일지 저장소가 필요없을지? 이런게 감이안오네
night run의 목적: 둘이서 개발을 따로한다, 둘이 서로다른세션을쓴다 거기서 막히거나 열린논의가있다, 그런걸 밤러너가 닫거나 추가조사해주면 좋겠다.
추가로 inbox에 사람이 기록해놓은 마일스톤이나 해야할일이 있다 그것도 해주면 좋다.
그리고 그날 돌았던 기능개발, 없으면 기존의 커밋이 많이일어난 장소에대해 디버깅이나 QA, 버그발견등을 해주면좋다.


## 형석
목각 인형 영상 + asset으로 영상 만들기 -> 성능 테스트
목각 인형 사진 (Previz) + asset으로 영상 만들기  -> 성능 테스트

재생성 히스토리를 보여줄 수 있게 하기 (버전 관리)

END 프레임을 재생성해주되 실제 영상 생성에서 빼기 (대신 확인해야함 END 프레임처럼 영상이 안 나올 수 있어서) -> 영상 생성 및 실제 테스트 필요

artist 탭에서 배경이 한 장의 이미지로 관리되는게 문제다 -> 영화는 배경이 아닌 공간으로 활용을 하는데 그렇기에 같은 장소(공간)을 여러 방향으로 사용하면서 다양한 느낌을 주는데 AI 영상들은 그런게 잘 없다.

previz 이미지 다른 각도로 찍는 것처럼 돌려보기 (viz 이미지는 이미지 생성 모델로 다른 각도 이미지 생성 요청 시 consistency가 깨져서 사용성이 없다. 하지만 previz에서 유저가 원하는 카메라 위치 변경을 요청했을 때 연출적 요소를 잘 만족할 경우 조금 consistency가 깨져도 사용할 수 있지 않을까)

Direction, END 언제 생성되는지 확인 (현재 제대로 Direction이 생성되지도 않고 잘 작동하지도 않음)

축척 단축키 지정 (Ctrl/Command + +/-)

에이전트 얼굴 변경 -> 만든걸로

shot 중에 인물 asset 잘 못 연결된 부분 찾기

재생성 로직돌때 상단바에 더 정보를 줄 수 있 수 있을 것 같다
 - 버그 : 작업 끝나고 다른 작업인 것 같은데 이전에 완료된 작업 수가 합산된다. (처음 시작이 6/8)
 - 호버링하면 현재 작업 중인 목록 보여주기?
 - 호버링하면 현재 진행 중인 작업 카드 하이라이트
 - 예상 종료 시간 보여주기

로그인 화면에서 capslock 켜졌으면 표기

채팅창에서 외부 파일(이미지, 글감) 드래그 앤 드롭 활성화

선택지가 뜬 상태에서 새로고침이나 다른 탭 갔다오면 선택지가 안 뜸
이미지 입력 후 새로고침하면 다 날아감 (버그)

채팅창 웰컴 멘트 날아가지 않게 수정
다음 에이전트에게 넘기기 멘트도 날아가지 않게 수정 (대신 승낙, 취소 버튼은 지우기 -> 남겨두면 추후 에러뜰 수 있음)

writer도 새로고침하면 안 보이는데 director로 동일한 로직 (DB에서 생성/대기 상태 및 시작 시간 확인 후 진행 시간 띄워주는 로직 + 기타 모든 로직) 적용하고 앞으로 writer, director의 경우 동일한 로직으로 적용되게 관리

director의 뷰어 writer랑 동일하게 수정

director도 마지막 보고 있던 탭 DB로 관래해서 새로고침 시 해당 탭이 바로 보이게 수정 (맨 처음 Node 애니메이션 보여주는거는 director 넘겨주세요 채팅 이후 프로젝트 당 최초 한 번만 보여주기)

배경에 인물 안 나오게 수정

여러 탭에 다른 프로젝트 띄워두고 작업할 수 있게 수정

producer가 스타일 글로 물어보는데 못 물어보게 수정

writer 끝나고 다시 writer 다시 요청하면 갇힘