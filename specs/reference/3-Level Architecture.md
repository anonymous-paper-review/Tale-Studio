Level 1: Scene Architect
├── 스토리 → 씬 분할

                               └── Act 구조 배분 (ex. 기승전결)

├── 캐릭터/로케이션 정의 및 입력
└── 펌프업

Level 2: Shot Template
├── (2-1. 씬 프롬프트 → 샷 시퀀스 프롬프트) 샷 쪼개기 생성

           └──샷에 필요한 요소 자동 완성 (추천)

                      ├── 촬영기법(카메라, 조명에 대한 내용 L3에서 가져옴)

                      └──Start-End, Only Start, Only End, Add Characters

├── (2-2. 샷 프롬프트 → 샷 이미지) 확정된 샷 이미지 생성 (API)
           └── 커스터마이징 (카메라, 조명)
└── (2-3. 비디오 생성) 확정된 샷 영상 생성 (API)

Level 3: Prompt Builder
├── 샷 → 최종 프롬프트 생성
├── DB 기반 cinematography 주입
└── 캐릭터 fixed_prompt 결합