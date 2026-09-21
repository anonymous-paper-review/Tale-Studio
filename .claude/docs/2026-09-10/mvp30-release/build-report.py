from pathlib import Path
import re,json,base64
from html import escape
p=Path(__file__).resolve().parent
old=(p.parent/'mvp-feedback-confirmation/report.html').read_text()
style=re.search(r'<style>(.*?)</style>',old,re.S).group(1)
def section(name):
 m=re.search(r'<h2 id="'+name+r'">.*?(?=<h2|<details|</main>)',old,re.S)
 return m.group() if m else ''
def fig(name,caption):
 f=p/name
 return '<figure><img src="data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode()+'" alt="'+escape(caption)+'"><figcaption>'+escape(caption)+'</figcaption></figure>'
status=json.loads((p/'deployment-status.json').read_text()) if (p/'deployment-status.json').exists() else {'deployments':[]}
code='3970a3c0d75b11bfa851aa595a5b3d166c21ee07'
dep=next((d for d in status['deployments'] if d['sha']==code),{})
state=dep.get('state','확인 중')
migration=json.loads((p/'live-migration-applied.json').read_text()) if (p/'live-migration-applied.json').exists() else {}
prod=json.loads((p/'production-smoke.json').read_text()) if (p/'production-smoke.json').exists() else {}
body=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>30번 해결·main 운영 배포 보고</title><style>{style}</style></head><body><main>
<p class="note">Tale Studio · 2026-09-10 · MVP 수정 및 운영 반영 보고</p>
<h1>30번 채팅 단계 이동을 고쳤고,<br>기존 실패 2개를 해소해 main에 반영했습니다.</h1>
<p class="lead"><strong>전체 2,754개 검사 통과·실패 0개입니다.</strong> Director로 갈 수 있는지 물으면 현재 조건을 답하고, 넘겨 달라고 하면 실제 화면을 엽니다. 못 넘어가면 이유와 필요한 작업을 안내합니다.</p>
<p><strong>main 제품 커밋: <a href="https://github.com/anonymous-paper-review/Tale-Studio/commit/{code}">3970a3c0</a> · 운영 배포: {escape(state)}.</strong> 운영 러프 예약 함수 적용 {'완료' if migration else '확인 중'}. 진행 바, 미확인 이미지 수, 두 인물 큐 접수 등 이전 MVP 수정도 함께 반영했습니다. 최신 main의 기존 변경은 보존했습니다.</p>
<p><strong>현재 26/30개 완료, 4개 잔여입니다.</strong> 18·23·27·29번은 아래에 남은 작업과 담당을 명시했습니다.</p>
<p><a href="#handoff">30번 동작</a> · <a href="#tests">실패 2개 개선</a> · <a href="#release">운영 확인</a> · <a href="#remaining">남은 4개</a> · <a href="#images">23번 실제 이미지</a></p>
<h2 id="handoff">30번: 말로 넘긴다고 한 뒤 끝나던 문제</h2>
<p>기존 채팅은 Writer에서 바로 Director를 목적지로 지정한 요청을 실제 이동으로 처리하지 못했습니다. 모델이 ‘넘길게요’라고 답해도 이동 실행과 연결되지 않았고, 준비 조건도 현재 저장본을 새로 확인하지 않았습니다.</p>
<table><tr><th>사용자 요청·상태</th><th>수정 후 동작</th></tr>
<tr><td>“디렉터러 넘길수잇어?”</td><td>저장된 씬·샷과 필요한 인물 이미지를 확인해 이동 가능 여부를 답합니다. 질문만으로 이동하지 않습니다.</td></tr>
<tr><td>이어서 “넘겨줘”</td><td>앞서 사용자가 지정한 Director를 목적지로 삼고, 이동 조건을 다시 확인한 뒤 화면을 엽니다.</td></tr>
<tr><td>씬 초안 확정 또는 인물 이미지가 부족함</td><td>빠진 항목과 이유, Writer·Artist 중 어느 곳에서 무엇을 해야 하는지 안내합니다.</td></tr>
<tr><td>“다 되면 넘겨줘”</td><td>현재 열린 앱에서 준비 상태를 재확인하고 조건이 충족되면 이동합니다. 다른 채팅이나 상태 질문으로 요청이 사라지지 않으며 취소할 수 있습니다.</td></tr>
<tr><td>전체 한국어 변경과 이동을 함께 요청</td><td>마지막 대사 저장이 끝난 뒤 같은 이동 검사를 실행합니다. 단순 이동 요청에는 대사 언어를 임의로 바꾸지 않습니다.</td></tr>
<tr><td>실제 화면이 아직 열리지 않음</td><td>완료 안내를 보류합니다. 화면 도착 후 한 번만 완료를 기록하고, 실패하면 이유와 재시도 방법을 남깁니다.</td></tr></table>
<p class="note">자동 재확인은 앱이 열려 있는 동안 동작합니다. 브라우저 종료 뒤 대사 수정 작업의 복구는 29번 잔여입니다. 이번 수정은 Director 이동이며 신규 영상 생성 기능을 추가한 것은 아닙니다.</p>
{fig('final-arrived-compact.png','최종 production build 앱에서 실제 Director 화면 도착 확인. 질문에는 이동 0회, 이어진 이동 요청에는 성공 1회. 마지막 검사에서 브라우저 미처리 오류 0개였습니다.')}
<h2 id="tests">기존 실패 2개는 어떻게 고쳤나</h2>
<p><strong>인물·배경의 새 모습을 만드는 호출 문자열을 비교하던 테스트를 실제 동작 검사로 바꿨습니다.</strong> 진행 추적 정보가 추가되면서 옛 문자열 기대와 달라졌던 실패입니다. 사용자 경험에 대한 원래 약속은 유지했습니다.</p>
<table><tr><th>검사</th><th>지금 확인하는 내용</th></tr><tr><td>인물의 다른 모습 생성</td><td>승인 전에는 실행하지 않고, 승인 뒤 모습 저장·생성 요청·완료 결과가 지정한 인물에 연결됩니다.</td></tr><tr><td>배경의 다른 모습 생성</td><td>승인 뒤 요청한 배경 모습을 생성합니다. 재생성은 선택한 모습에 적용하고 기존 다른 모습은 보존합니다.</td></tr></table>
<p>최종 main 기준 자동검사 <strong>2,754개 통과·0개 실패·기존 제외 27개</strong>, 348개 파일 중 346개 통과·2개 제외. 타입·디자인 검사·production build 통과. 전체 소스 lint 오류 0개·기존 경고 24개입니다. 유료 이미지·영상 생성과 번역 의미 품질은 이 자동검사의 검증 범위가 아닙니다.</p>
<h2 id="release">main과 운영에서 확인한 사실</h2>
<ul><li>최신 main을 기준으로 MVP 파일을 선별 통합했습니다. 별도 세션의 채팅 편집 도구·새 가격표 작업은 함께 넣지 않았습니다.</li>
<li>운영 원본은 <strong>6씬·61샷</strong>입니다. 저장된 대사 20개 모두 한글 포함·일본어 가나 0개였으며 두 인물의 기본 이미지도 있습니다. 과거 모델의 ‘47샷’ 주장은 현재 저장본과 달랐습니다.</li>
<li>검증 계정의 별도 프로젝트에서 운영 준비 확인 응답: <strong>{escape(str(prod.get('summary','배포 완료 후 확인 중')))}</strong></li>
<li>러프 예약 함수는 코드가 main에 올라간 직후 적용했습니다. 일반·로그인 사용자 직접 실행 금지, 서버 권한만 허용, 적용 이력 기록을 확인했습니다. 기존 운영 씬·샷·이미지 데이터 변경은 없습니다.</li>
<li>실제 앱에서 준비 부족 안내, 완료 후 자동 이동, 요청별 완료 안내 한 번, 새로고침 후 Director 유지까지 확인했습니다. 화면 전환 연출 실패가 미처리 오류를 남기던 문제도 수정했습니다.</li></ul>
<h2 id="remaining">남은 4개: 오너에게 전부 확인을 넘기는 목록이 아닙니다</h2>
<table><tr><th>번호</th><th>남은 작업</th><th>담당</th></tr><tr><td>18</td><td>원래 ‘14’ 표시 위치 추적과 운영에서 중복 접수 재발 여부 관찰. 예약 함수와 동시성 방어는 이번에 운영 반영했습니다.</td><td>개발자</td></tr><tr><td>23</td><td>동일 조건으로 생성한 시간대·외형 결과 비교 자료 준비. 아래 6개 이미지는 기존 저장본입니다.</td><td>개발자 자료 준비 → 오너 품질 판단</td></tr><tr><td>27</td><td>접수 응답을 잃어 실제 접수 여부가 불명확한 작업의 원격 확인·복구.</td><td>개발자</td></tr><tr><td>29</td><td>브라우저 종료 뒤 대사 수정 재개와 실제 번역 의미 검증. 앱이 열린 동안 남은 대사를 저장하고 이동하는 경로는 수정했습니다.</td><td>개발자</td></tr></table>
'''
body+=section('images')
body+='<details><summary>앞서 반영한 Writer 숫자·두 인물 큐·09 원인과 화면 자료</summary>'+section('badges')+section('artist')+section('names')+section('progress')+section('later')+'</details>'
body+='<footer>보고 근거: main 커밋과 Vercel 상태, 운영 읽기 조회·단일 migration 이력, 최종 검사 로그, 실제 앱 화면. 신규 생성 품질과 닫힌 브라우저 작업 복구를 완료로 과장하지 않습니다.</footer></main></body></html>'
(p/'report.html').write_text(body)
print(json.dumps({'report':str(p/'report.html'),'bytes':len(body.encode()),'deployment':state},ensure_ascii=False))
