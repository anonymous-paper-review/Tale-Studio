"""최신 사용자 의도·조치·실제 저장 이미지와 검증을 기존 공유 링크에 올릴 원본으로 만든다."""
from pathlib import Path
from html import escape
import base64,json,re
root=Path(__file__).resolve().parent
prior=root.parent/'mvp-feedback-followup'
rows=json.loads((root/'result-index.json').read_text())
images=json.loads((root/'image-manifest.json').read_text())
old=(prior/'report.html').read_text()
def old_section(name):
    return re.search(r'<h2 id="'+name+r'">.*?(?=<h2)',old,re.S).group()
def fig(name,caption):
    p=root/name;mime='image/jpeg' if p.suffix=='.jpg' else 'image/png'
    return f'<figure><img src="data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}" alt="{escape(caption)}"><figcaption>{escape(caption)}</figcaption></figure>'
def actual(name):
    row=next(r for r in images if r['name']==name)
    return f'<figure><a href="{escape(row["url"],quote=True)}" target="_blank" rel="noopener"><img src="{escape(row["url"],quote=True)}" alt="{escape(row["title"])}" loading="lazy"></a><figcaption>{escape(row["title"])} · 누르면 원본 크기로 열립니다.</figcaption></figure>'
table=''.join(f'<tr><td>{r["id"]:02d}</td><td><strong>{escape(r["title"])}</strong><p>{escape(r["result"])}</p></td><td>{escape(r["state"])}</td><td>{escape(r["limit"])}</td></tr>' for r in rows)
body='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Writer 미확인 이미지 수·두 인물 큐 접수 수정 보고</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#242a30;font:16px/1.8 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}main{max-width:1060px;margin:auto;padding:38px 26px 70px}h1{font-size:32px;line-height:1.5;letter-spacing:-.035em}h2{margin:38px 0 14px;padding-top:24px;border-top:1px solid #dbe0e4;font-size:24px}h3{font-size:18px;margin-top:26px}p{margin:10px 0}a{color:#285c7b;text-underline-offset:3px}.lead{font-size:19px}.note,figcaption{font-size:14px;color:#59656d}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #dbe0e4}th{background:#f5f6f7}td p{margin:6px 0 0}.scroll{overflow-x:auto}img{display:block;width:100%;height:auto;border:1px solid #dbe0e4}figure{margin:20px 0}figcaption{margin-top:9px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair figure{margin:8px 0}details{margin:22px 0}summary{cursor:pointer;font-weight:600}li{margin:8px 0}.narrow{max-width:755px;margin:auto}footer{margin-top:40px;border-top:1px solid #dbe0e4;padding-top:18px;color:#59656d;font-size:13px}@media(max-width:640px){main{padding:22px 16px}h1{font-size:26px}.pair{grid-template-columns:1fr}.scroll table{min-width:650px}}
</style></head><body><main>
<p class="note">Tale Studio · 2026-09-10 · 최신 피드백 반영 보고</p>
<h1>Writer에는 아직 안 본 완료 이미지 수를 표시합니다.<br>두 인물의 모습 생성도 각각 큐에 접수되도록 고쳤습니다.</h1>
<p class="lead"><strong>현재 25/30개 완료, 5개 잔여입니다.</strong> 01·12·13·14번 오너 확인을 반영했고,09번은 원래 제공된 프로젝트의 모델 기록에서 최초 유입 지점을 찾았습니다.23번의 실제 저장 이미지는 아래에서 볼 수 있습니다.</p>
<p><strong>main·운영에는 아직 반영하지 않았습니다.</strong> dev 작업 폴더에서 수정·검증한 결과입니다. 전체 검사는 2,791개 통과·2개 실패·기존22개 제외이고, 타입·디자인 검사는 통과했습니다. 두 실패의 내용은 아래에 별도로 설명합니다.</p>
<p><a href="#badges">Writer 숫자</a> · <a href="#artist">두 인물 큐 접수</a> · <a href="#images">실제 이미지 6개</a> · <a href="#names">09 원인</a> · <a href="#remaining">남은 작업</a></p>
<h2 id="badges">19·20: 아직 안 본 Writer 완료 이미지 수</h2>
<p>사용자가 말씀한 것은 <strong>Writer에서 만드는 러프/previz 이미지의 완료 수</strong>입니다. 앞서 이를 Director의 영상과 함께 설명한 것은 제 설명이 잘못된 것입니다. Writer 이미지 집계 경로는 이미 따로 있었고 Director 기능을 새로 엮은 작업이 아닙니다.</p>
<table><tr><th>상황</th><th>왼쪽 Writer 숫자</th></tr><tr><td>다른 탭을 보는 동안4샷 이미지 저장 완료</td><td>4</td></tr><tr><td>이어서5샷 완료</td><td>9</td></tr><tr><td>다시5샷 완료</td><td>14 — 9+로 줄이지 않습니다.</td></tr><tr><td>Writer를 열어 확인</td><td>숫자가 사라집니다.</td></tr><tr><td>떠난 뒤 새 이미지1개 완료</td><td>1 — 확인한14개가 다시 올라오지 않습니다.</td></tr><tr><td>접수·생성 중·실패·같은 결과 재수신</td><td>완료 수가 늘지 않습니다.</td></tr></table>
<p><strong>이미지 카드 한 샷을1개로 셉니다.</strong> 한 샷의 시작·진행·끝 파일3개를3으로 세지 않습니다.4샷 묶음은 실제 저장 완료 뒤4가 더해집니다. 접수만 됐거나 마지막 저장이 남아 있으면 완료로 세지 않습니다.</p>
<p>완료 응답을 놓치던 비교 오류, 완료 이후 기록 수정으로 옛 결과가 되살아나는 오류, 같은 샷의 중복 집계를 고쳤습니다. 하루가 지났거나500건을 넘어도 미확인 결과가 빠지지 않도록 완료 이력 조회도 분리했습니다.</p>
<p class="note">같은 브라우저·프로젝트의 읽음 기록 기준입니다. 진행 중 약4초, 쉬는 동안 약15초마다 서버 상태를 확인하므로 반영 지연은 있습니다. 여러 기기 사이 읽음 동기화는 이번 범위가 아닙니다. 공통 채팅 알림을19·20번의 추가 완료 조건으로 요구하지 않습니다.</p>
__BADGE_9__
__BADGE_1__
<p class="note">실제 Sidebar·완료 조회·읽음 처리 코드를 실행한 로컬 검수 화면입니다. 완료 응답을 통제했으며 새 유료 이미지를 만들지는 않았습니다.4→9→14,중복 재수신,Writer 진입0,이탈 후 새 완료1,첫 방문 뒤 첫 완료1 등9개 화면 검사를 통과했습니다.</p>
<h2 id="artist">25: 두 인물 중 한 명만 큐에 들어가던 문제</h2>
<p><strong>첫 이미지가 완성될 때까지 기다린 다음에야 두 번째 인물을 접수하던 경로를 재현하고 수정했습니다.</strong> 이제 첫 작업의 접수 번호를 받으면 두 번째 인물의 새 모습도 접수합니다. 각 인물의 완료·실패와 결과는 따로 연결됩니다.</p>
<p>‘쿄타로와 코마츠의 잠옷 모습을 추가’라는 요청에서, 두 제안을 받은 뒤 첫 이미지 완료를 멈춰 두면 수정 전에는 큐 기록이1개였습니다. 수정 뒤에는 첫 이미지가 아직 생성 중이어도 두 인물의 큐 기록이2개입니다.</p>
<p>실제 채팅 응답 파싱→승인→모습 저장→이미지 생성 요청→큐 기록까지 연결해 확인했습니다. 두 대상,역순 완료,같은 모습 이름,한쪽 실패,접수 거절 후 재시도,중복 승인,명령 누락,취소 등8개 검사가 통과했습니다. 외부 모델·DB·이미지 제공자 통신은 통제한 검사이며, 운영에서 새 유료 이미지를 생성한 검증은 아닙니다.</p>
<p>원래 운영 기록에서는 쿄타로 잠옷이9월9일22:22:39에 접수되고 코마츠는22:27:05에 접수됐습니다. 사용자가 다시 지적한 뒤 둘째가 시작됐다는 원문과 일치합니다. 당시 최초 모델 응답은 확보하지 못했으므로, 이 사건 전체가 위 대기 문제 하나 때문이었다고 단정하지 않습니다.</p>
<p><strong>25번은 큐 접수 문제입니다.</strong> 제가 이전에 기존 테스트2개의 교체 판정 문제로 설명한 것은 제보의 요지를 놓친 설명이었습니다. 이번에는 실제 큐 접수로 검증했습니다.</p>
<h2 id="images">23: 실제 저장된 이미지</h2>
<p>원래 프로젝트에서 읽어 온 실제 이미지6개입니다. 테스트 도형이 아닙니다. 아래 이미지를 누르면 큰 원본이 열립니다.</p>
<p><strong>밤 이미지는9월9일22:25에 UI 재생성을 거쳐 저장된 결과입니다.</strong> 최초 실패본이나 이번 수정 후 새 생성본으로 제시하지 않습니다. 현재 저장소는 같은 이미지 경로를 덮어쓰므로 최초 버전을 지금 URL만으로 복원할 수 없습니다. 읽어 온 원본6개와 비교 화면은 로컬 보고 폴더에 복사해 보존했습니다.</p>
<h3>학교 옥상 · 기본 낮 / 현재 저장된 밤</h3><div class="pair">__ROOF__</div>
<h3>쿄타로 · 기본 / 잠옷</h3><div class="pair">__KYOTARO__</div>
<h3>코마츠 · 기본 / 잠옷</h3><div class="pair">__KOMATSU__</div>
<p>23번에는 밤 설명에 기존 낮·햇빛 조건이 함께 붙던 입력 충돌 수정이 포함돼 있습니다. <strong>그 수정 후 같은 조건으로 새로 생성한 비교 결과는 아직 없습니다.</strong> 이 자료만으로 수정 후 이미지 품질까지 합격 처리하지 않았습니다.</p>
<h2 id="names">09: 내부 이름이 처음 어디서 들어왔나</h2>
<p><strong>원래 입력에는 없었습니다. 모델의 씬 응답에서 처음 본문으로 새어 나왔습니다.</strong> 이미 주신 프로젝트의 보관된 모델 호출36개를 조회해 확인했습니다. 앞선 조사에서 이 보관 기록을 충분히 확인하지 못했습니다.</p>
<table><tr><th>시각(KST)</th><th>근거</th></tr><tr><td>9월9일22:03:02</td><td>모델이 장소 후보로 식별자 vending_machine_corner와 이름 ‘교내 자판기 코너’를 함께 만듭니다. 식별자 생성 자체는 정상입니다.</td></tr><tr><td>22:03:40</td><td>씬 응답 본문에 ‘쿄타로가 체육관 옆 vending_machine_corner에서 음료수를 뽑고 있다.’가 들어갑니다.</td></tr><tr><td>보존된 실행 상태·기존 미리보기</td><td>같은 문장이 저장됐습니다. 자판기 코너가 본문에만 등장한 후보여서 최종 장소 목록에서 빠졌고, 표시 처리도 후보 이름을 읽지 못했습니다.</td></tr></table>
<p>새 실행의 이름 변환·본문 검사를 유지하면서, <strong>과거 저장본도 당시 기록된 ‘교내 자판기 코너’로 표시</strong>하도록 고쳤습니다. 확정된 이름이 있으면 그것을 우선하고 원본 저장 상태는 바꾸지 않습니다. 새 미리보기 검사3개와 관련 회귀를 합쳐29개가 통과했습니다.</p>
<p>char_2는 이름을 영문 식별자로 바꾸는 기존 코드에서 생깁니다. 영문자가 남지 않으면 첫 인물은char,둘째는char_2가 됩니다. 실제 프로젝트에서 쿄타로·코마츠와 연결됐고 첫 모델 요청에 이미 들어 있었습니다. 다만 char2가 처음 노출된 화면의 정확한 시각까지 확정한 것은 아닙니다.</p>
__PROGRESS__
<h2 id="rough">18: 8→5→4→14와 동시성</h2>
<p>한 번의 제출 수와 전체 목표 수를 섞어 보여준 문제와 실제 중복 접수가 함께 있었습니다. 최대4샷씩 두 묶음을 제출하고 씬 경계에서도 나눠8개,1+4=5개,4개처럼 달라졌습니다. 운영에는 같은5샷이 각각3번 생성된 기록이 있습니다.</p>
<p>외부 생성 접수보다 DB 기록이 늦어 다른 요청이 같은 샷을 다시 고를 수 있었습니다. 외부 접수 전에 예약하고 겹치는 요청은 기존 작업을 확인하도록 고쳤습니다. 개발 DB 동시 요청 검사10개 통과·예약 함수 적용까지 끝났습니다. <strong>운영 적용 후 검증과 원래 ‘14’가 보인 정확한 위치는 아직 남았습니다.</strong></p>
__LATER__
<h2 id="buttons">01·12·13·14와 가짜 버튼</h2>
<p><strong>네 항목 모두 오너 확인을 반영했습니다.</strong> 재확인을 요청하지 않습니다. 이전 보고서의 ‘현재대로 확정·Artist 호출·생성 승인·승인 대기·삭제’는 제가 검수 화면에 추가한 가짜 버튼이었습니다. 그 줄은 제거했고 실제 승인 카드와 보류 화면을 캡처했습니다. 운영 제품에 다섯 버튼을 추가한 것은 아닙니다.</p>
<h2 id="tests">전체 검증과 남은 실패2개</h2>
<ul><li>전체 자동검사: <strong>2,791개 통과·2개 실패·기존22개 제외</strong>.356파일 중352통과·2실패·2제외.</li><li>타입·디자인 검사 통과. 전체 소스 lint 오류0·경고24.</li><li>Writer 완료 집계·저장 순서·읽음·이력: 생성 작업 묶음213개 통과.</li><li>두 인물 실제 실행 연결: 새8개 포함 관련66개 통과.</li><li>미확인 숫자 화면 검사9개 통과·브라우저 미처리 오류0. 임시 제품 검수 경로 제거 완료.</li></ul>
<p>실패2개는 인물·배경의 새 모습을 만드는 호출 문장이 옛 문자열과 일치하는지 보는 검사입니다. 이번 MVP 변경에서 진행 추적·중복 방지 정보를 추가하면서 불일치했습니다. <strong>원래부터 실패하던 검사라고 표현한 것은 부정확했습니다.</strong> 실제 승인·대상별 큐 접수 검사는 통과하지만,기존 두 검사 기대식은 바꾸거나 제외하지 않았습니다. 전체 검사가 통과했다고 보고하지 않습니다.</p>
<p class="note">저장소의 TDD 규칙에 따라 실패한 기대식을 조용히 바꾸지 않았습니다. 이 검사 문제를25번의 사용자 확인 사항으로 돌리지 않습니다. 새 유료 생성·운영DB 수정·main 병합·운영 배포는 이번 검증에 포함하지 않았습니다. 다른 세션의 기존 변경도 있는 현재 작업 폴더 전체를 검사한 결과입니다.</p>
<h2 id="remaining">남은5개는 무엇을 해야 하나</h2>
<p>전부 오너에게 검수해 달라는 뜻이 아닙니다. 개발자가 먼저 재현·수리·자료 준비를 해야 합니다.</p>
<table><tr><th>번호</th><th>남은 일</th></tr><tr><td>18</td><td>운영 적용 후 중복 접수 확인,원래14표시 추적.</td></tr><tr><td>23</td><td>수정 후 같은 조건의 실제 생성 비교를 먼저 준비. 이후 오너가 시간대·외형 품질 판단.</td></tr><tr><td>27</td><td>접수 응답이 사라져 접수 여부를 모르는 작업의 원격 확인·복구.</td></tr><tr><td>29</td><td>브라우저 종료 뒤 대사 변경 재개와 실제 번역 의미 검증.</td></tr><tr><td>30</td><td>‘Director로 넘길게요’ 반복 제보. 최신 저장 대사 확인부터 실제 Director 화면이 한 번 열리는 것까지 재현·수리.</td></tr></table>
<p>30번은 TODO 등록을 유지합니다. ‘⇄ Writer→Director’ 문구나 이동 함수 호출만으로 완료 처리하지 않습니다.</p>
<details><summary>30개 전체 조치와 상태</summary><div class="scroll"><table><tr><th>번호</th><th>조치</th><th>상태</th><th>남은 조건·범위</th></tr>__TABLE__</table></div></details>
<details><summary>확정한 약속과 필요한 이유</summary>__PROMISES__</details>
<footer>최신 기준:25/30 완료. dev 수정·검증 결과이며 main·운영 미반영. 원본28개와 추가29·30번 보존. 앞서 완료한 일회성 콜백은 재전송하지 않았습니다.</footer>
</main></body></html>'''
body=body.replace('__BADGE_9__',fig('badge-unseen-9.jpg','Writer 옆9: 다른 탭에 있는 동안 완료된 미확인 이미지9개. 실제 제품 컴포넌트에 통제한 응답을 넣은 검수 화면.'))
body=body.replace('__BADGE_1__',fig('badge-new-one.jpg','Writer를 방문해 읽은 뒤 다시 떠나면,새로 완료된1개만 표시됩니다.'))
for key,parts in [('ROOF',['roof-day','roof-night']),('KYOTARO',['kyotaro-default','kyotaro-pajamas']),('KOMATSU',['komatsu-default','komatsu-pajamas'])]:body=body.replace('__'+key+'__',''.join(actual(n) for n in parts))
body=body.replace('__PROGRESS__',old_section('progress')).replace('__LATER__',old_section('later')).replace('__TABLE__',table)
promises=''
for filename in ['writer-badges.md','artist-two-queue.md','names-investigation.md']:
    text=(root/filename).read_text()
    lines=[line[2:] for line in text.splitlines() if line.startswith('- “') or line.startswith('- **')]
    promises+='<ul>'+''.join('<li>'+escape(line).replace('**','')+'</li>' for line in lines)+'</ul>'
body=body.replace('__PROMISES__',promises)
(root/'report.html').write_text(body)
(root/'verification-summary.json').write_text(json.dumps({'date':'2026-09-10','branch':'dev','mainApplied':False,'tests':{'passed':2791,'failed':2,'skipped':22,'files':356},'typecheck':'pass','designLint':'pass','sourceLint':{'errors':0,'warnings':24},'browserChecks':9,'browserUnhandledErrors':0,'temporaryRouteRemoved':True,'actualSavedImages':6,'newPaidGenerations':0,'todoComplete':25,'todoOpen':[18,23,27,29,30]},ensure_ascii=False,indent=2))
print(len(body.encode()),'bytes')
