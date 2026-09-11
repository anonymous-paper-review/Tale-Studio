"""후속 질문의 답변·검증·현재 TODO와 실제 컴포넌트 캡처를 하나의 공유 보고서로 만든다."""
from pathlib import Path
from html import escape
import json
import base64

root = Path(__file__).resolve().parent
rows = json.loads((root / 'result-index.json').read_text())
done = sum(r['state'] == '완료' for r in rows)

def figure(name, caption):
    data = base64.b64encode((root / f'{name}.png').read_bytes()).decode()
    return f'<figure><a href="data:image/png;base64,{data}" target="_blank"><img src="data:image/png;base64,{data}" alt="{escape(caption)}"></a><figcaption>{escape(caption)}</figcaption></figure>'

table = ''.join(f'<tr><td>{r["id"]:02d}</td><td><strong>{escape(r["title"])}</strong><p>{escape(r["result"])}</p></td><td>{escape(r["state"])}</td><td>{escape(r["limit"])}</td></tr>' for r in rows)
body = '''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MVP 피드백 후속 답변과 조치 · 2026-09-10</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;color:#20252a;background:#fff;font:16px/1.85 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}main{max-width:1000px;margin:auto;padding:42px 24px 70px}h1{font-size:32px;line-height:1.5;letter-spacing:-.04em}h2{font-size:23px;margin:36px 0 14px;border-top:1px solid #d9dee2;padding-top:25px}p{margin:10px 0}a{color:#20577c;text-underline-offset:3px}.lead{font-size:19px}.note,figcaption{color:#58626b;font-size:14px}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px;border:1px solid #dce1e5;vertical-align:top}th{background:#f3f5f6}td p{margin:6px 0 0}figure{margin:22px 0}img{display:block;width:100%;height:auto;border:1px solid #dce1e5}figcaption{margin-top:9px}li{margin:9px 0}.narrow{max-width:755px;margin:auto}details{margin:22px 0}summary{cursor:pointer;font-weight:700}footer{border-top:1px solid #d9dee2;margin-top:36px;padding-top:18px;font-size:13px;color:#58626b}@media(max-width:600px){main{padding:22px 16px}h1{font-size:26px}h2{font-size:21px}.scroll table{min-width:680px}}
</style></head><body><main>
<p class="note">Tale Studio · 2026-09-10 후속 조치 보고 · 개발 작업 폴더 기준</p>
<h1>프로그레스바는 유지하고 잘못된 시간·내부 단계 숫자를 숨겼습니다.<br>알림 싱크 오류 2건을 고쳤습니다.</h1>
<p class="lead">보고서에 넣었던 가짜 상단 버튼을 제거했습니다. 12·13·14번 오너 승인을 반영했고, Director 이동을 반복 예고하는 새 사례는 30번에 등록했습니다.</p>
<p><strong>현재 __DONE__/30 완료, __OPEN__개 잔여.</strong> 나머지를 전부 오너에게 검수해 달라는 뜻이 아닙니다. 개발자가 재현·수리·자료 준비할 항목을 아래에 분리했습니다.</p>
<p class="note">main·운영에는 아직 반영하지 않았습니다. 앞선 러프 예약 함수는 개발 Supabase에만 적용했습니다. 이 문서는 최초 29개 보고에 대한 후속 수정·정정본입니다.</p>

<h2 id="tests">실패 테스트 2개는 무엇인가</h2>
<p><strong>원래부터 실패하던 테스트가 아닙니다.</strong> 이번 MVP 작업에서 제가 진행 추적·중복 접수 방지 정보를 더하면서 기존 검사 두 개가 실패하게 됐습니다. 앞선 “기존 실패”라는 표현이 부정확했습니다.</p>
<table><tr><th>지켜야 하는 약속</th><th>왜 실패하는가</th></tr><tr><td>채팅에서 인물의 새 모습을 요청하면, 승인 후 해당 인물에 추가한다.</td><td rowspan="2">기존 검사가 실제 동작 대신 옛 호출 문장과 글자 그대로 일치하는지 확인합니다. 생성 결과를 추적하는 정보가 추가되어 문자열이 달라졌습니다. 실제 승인·대상별 생성 동작 회귀는 통과했습니다.</td></tr><tr><td>채팅에서 배경의 새 모습을 요청하면 승인 후 추가하며, 선택한 모습만 다시 그릴 수 있다.</td></tr></table>
<p>제안은 <strong>두 약속을 유지하고 검사를 실제 실행 결과로 교체</strong>하는 것입니다. 승인 전 생성 0회, 승인 후 해당 인물·배경·모습만 생성되는지를 검사합니다. 실패를 숨기기 위해 기대식이나 제외 설정을 고치지는 않았습니다.</p>
<p class="note">저장소의 TDD 규칙이 실패한 기대식 변경을 오너 판정 없이 하지 못하도록 정하고 있어 교체 판정을 남겼습니다. 사용자 경험을 새로 정해 달라는 요청은 아닙니다.</p>

<h2 id="buttons">상단에 생긴 버튼의 정체</h2>
<p>‘현재대로 확정·Artist 호출·생성 승인·승인 대기·삭제’는 <strong>제가 색 비교용 검수 화면에 넣은 가짜 버튼</strong>입니다. 제품에 요청한 기능처럼 보이게 보고한 잘못입니다. 검수 화면에서 줄 전체를 삭제하고, 아래는 실제 승인 카드와 보류 목록만 다시 캡처했습니다. 실제 운영 제품에 저 다섯 버튼을 추가한 것은 아닙니다.</p>

<h2 id="progress">05·15: 시간과 내부 파이프라인 노출</h2>
<p>이전 ‘단계 10/11’은 내부 처리 단계를 세어 표시한 것이 맞습니다. 지금은 <strong>그 숫자와 세부 처리 문구를 숨기고, 프로그레스바는 유지</strong>합니다. ‘씬 구성’, ‘샷과 대사 작성’, ‘저장’처럼 사용자가 기다리는 결과를 설명합니다. 중앙과 채팅의 막대는 같은 상태를 읽으며 저장이 끝나기 전에는 완료로 표시하지 않습니다.</p>
<p>시간은 표시하지 않습니다. 과거 계산에는 초안 승인 대기가 섞였고, 단계 기록에는 일부 반복 실행·실패 시간이 빠져 있습니다. 현재 기록의 합계나 평균만 고치면 다시 부정확해지므로 서버에서도 추정 계산을 제거했습니다. <strong>정확한 ETA를 구현했다고 보고하지 않습니다.</strong> 막대 길이는 남은 시간 비율이 아닙니다.</p>
__PROGRESS__

<h2 id="nine">09: 무슨 뜻인가</h2>
<p>‘쿄타로’ 대신 ‘char2’, ‘자판기 코너’ 대신 ‘vending_machine_corner’ 같은 내부 이름이 문장에 노출됐습니다. <strong>09번은 그것이 처음 모델 응답에서 생겼는지, 저장·표시 중에 생겼는지 찾는 개발 조사</strong>입니다. 07·08번의 이름 표시와 검증 수리와 구분한 항목입니다. 오너가 과거 로그를 찾아줄 필요는 없습니다.</p>

<h2 id="rough">18: 8→5→4→14의 원인과 조치</h2>
<p>숫자 혼용과 실제 중복 주문이 함께 있었습니다. 한 번에 최대 4샷씩 두 묶음을 제출하고 씬 경계에서 나누므로 8개, 1+4=5개, 4개처럼 달라집니다. 이 수량을 전체 생성 목표나 전체 동시 처리 개수처럼 보여주면 혼동됩니다. 지금은 전체 대상·완료·생성 중·대기·실패를 구분합니다.</p>
<p><strong>운영 기록에서는 같은 5샷이 각각 세 번 생성된 것을 확인했습니다.</strong> 외부 서비스에 먼저 접수하고 뒤늦게 작업을 기록하던 사이, 다음 자동 요청이 같은 미완료 샷을 다시 선택했습니다.</p>
<p>이제 외부 접수 전에 DB에 샷을 예약하고, 겹치는 요청은 기존 작업을 공유하며, 접수 여부가 불명확하면 새 번호로 재발주하지 않습니다. 개발 DB의 실제 동시 요청 검사 10개가 통과했고 예약 함수를 적용했습니다. <strong>운영 적용 후 검증과 원래 ‘14’가 표시된 정확한 위치는 남았습니다.</strong> 뒤에 추가된 Scene 6의 14샷과 같다고 단정하지 않습니다.</p>

<h2 id="notifications">19·20: 알림을 끈 것인가, 실제 완료와 맞는가</h2>
<table><tr><th>상황</th><th>현재 동작</th></tr><tr><td>러프 이미지 저장 완료</td><td>다른 단계를 보고 있으면 Writer의 미확인 완료 수에 반영합니다. 4샷 그리드 한 장은 4샷으로 셉니다.</td></tr><tr><td>프리비즈 영상 저장 완료</td><td>현재 분류상 Director의 미확인 완료 수에 반영합니다. Writer에도 생성 버튼이 있다는 점과 표시 단계가 다릅니다.</td></tr><tr><td>생성 중·실패·같은 완료의 재수신</td><td>성공 완료 수에 섞거나 같은 작업을 중복 집계하지 않습니다.</td></tr><tr><td>이미 보고 있는 결과</td><td>해당 단계 배지는 숨기고, 보는 동안 받은 완료까지 읽음 처리합니다. 떠난 직후 다시 미확인으로 뜨던 오류를 고쳤습니다.</td></tr><tr><td>프로젝트 전환 중 이전 응답 도착</td><td>이전 응답을 버립니다. 현재 프로젝트의 숫자에 섞이던 오류를 고쳤습니다.</td></tr><tr><td>채팅의 ‘완료됐어요’ 문장</td><td><strong>러프·프리비즈에 대한 공통 완료 통지는 아직 없습니다.</strong> 러프 전체 준비 안내는 해당 화면을 열었을 때 생깁니다. 어느 화면에서나 또는 브라우저 종료 후 돌아왔을 때 완료 채팅을 보장하지 않습니다.</td></tr></table>
<p class="note">서버 상태를 진행 중 약 4초, 쉬는 동안 약 15초 간격으로 확인합니다. 네트워크 지연은 추가됩니다. 읽음은 같은 브라우저 기준이며 다른 기기와 동기화하지 않습니다. 처음 방문하지 않은 단계의 과거 완료는 표시하지 않고, 최근 24시간에 접수된 최대 500개 작업을 조회하는 현재 제한이 있습니다.</p>

<h2 id="later">‘나중에’는 어디에서 다시 여는가</h2>
<ol><li>승인 카드에서 <strong>나중에</strong>를 누릅니다.</li><li>채팅 입력창 위쪽에 생기는 <strong>보류한 작업 (1)</strong>을 펼칩니다.</li><li><strong>다시 열기</strong>를 누르면 원래 두 대상이 담긴 승인 카드가 돌아옵니다. 보류하거나 다시 열기만 해서는 생성하지 않습니다.</li></ol>
<p>이전 공유본에서 제가 ‘보류한 작업’ 캡처를 제외해 보이지 않았습니다. 이번에는 아래에 직접 넣었습니다.</p>
__LATER_BEFORE__
<div class="narrow">__LATER_EXPANDED__</div>
<p class="note">실제 화면 컴포넌트에 고정된 로컬 상태를 넣은 캡처입니다. 실제 유료 생성은 하지 않았습니다. 1511×728과 755×728에서 버튼 클릭·보류·복원, 생성 요청이 발생하지 않음, 미처리 오류 0개를 확인했습니다. 테스트 계정·이미지·문장을 운영 결과로 제시하지 않습니다.</p>

<h2 id="remaining">남은 항목을 어떻게 확인하면 되는가</h2>
<p><strong>12·13·14번은 승인 반영 완료입니다. 다시 확인할 필요 없습니다.</strong> 과거의 잔여 12개에서 승인 3개와 시간 표시 1개를 닫고 새 30번을 추가하여 현재 9개가 열려 있습니다.</p>
<table><tr><th>번호</th><th>오너 확인 또는 개발자 할 일</th></tr><tr><td>01</td><td>오너 확인: 위 실제 승인 카드의 긍정 버튼 색이 괜찮은지. 가짜 상단 버튼은 검수 대상에서 제거했습니다.</td></tr><tr><td>23</td><td>오너의 이미지 품질 확인이 필요합니다. 다만 실제 낮·밤/잠옷 결과를 같은 조건으로 비교하는 자료를 개발자가 먼저 준비해야 합니다. 이전 테스트 도형으로 승인받지 않습니다. 현재 이 자료는 미준비입니다.</td></tr><tr><td>25</td><td>오너 판정: 인물·배경 새 모습 생성 약속은 유지하면서 실패한 문자열 검사를 실제 동작 검사로 바꾸는 안. 두 약속은 위에 모두 적었습니다.</td></tr><tr><td>09·18·20·27·29·30</td><td>개발자 작업: 최초 유입 조사, 중복 접수 운영 검증, 공통 완료 채팅, 불확실 접수 복구, 브라우저 종료 후 재개·실제 번역 확인, 실제 Director 전환 검증. 오너에게 코드·로그 확인을 맡길 항목이 아닙니다.</td></tr></table>

<h2 id="thirty">30: 새 Director 전환 제보</h2>
<p>‘Scene 4~5가 아직 일본어’라고 했다가 ‘전체가 한국어’라고 말을 바꾸고, 사용자가 두 번 넘겨 달라고 해도 ‘⇄ Writer→Director’ 안내만 반복하는 사례를 등록했습니다. <strong>수정 완료로 체크하지 않았습니다.</strong></p>
<p>완료 기준은 최신 저장본으로 언어·씬·샷 수 확인 → 필요한 저장 완료 → 실제 Director 화면 렌더 1회입니다. 이동 문구·라우터 호출만으로 성공 처리하지 않습니다. 기존 29번의 로컬 47샷 검사는 이 새 운영 사례의 성공 증거가 아닙니다.</p>

<h2 id="verification">이번 검증 결과</h2>
<ul><li>최종 전체 자동 테스트: <strong>2,762개 통과 · 2개 실패 · 기존 22개 제외</strong>. 348파일 중 344통과·2실패·2제외. 실패는 위 인물·배경 문자열 검사입니다.</li><li>새 시간 표시 회귀 5개와 알림 회귀 5개: 수정 전 실패 → 수정 후 통과. 생성 작업 묶음 195개 통과.</li><li>타입 검사·디자인 검사 통과. 전체 소스 lint 오류 0개·경고 24개.</li><li>브라우저 검사 5개 통과: 내부 단계·시간·가짜 버튼 미노출, 프로그레스바 유지·저장 전 미완료, 나중에 보류·복원, 생성 요청 없음, 미처리 오류 0개.</li></ul>
<p class="note">검수용 임시 경로가 남아 있을 때 번역 검사와 lint가 한 번 실패했습니다. 캡처 후 임시 경로를 제거하고 전체 검사를 재실행한 최종 수치입니다. 별도 채팅 도구 세션의 공유 변경도 있는 현재 작업 폴더 전체 결과이며, 이 모든 테스트가 이번 추가 수정만을 검사한다는 뜻은 아닙니다. main 배포·실제 유료 모델 실행·이미지 품질은 이번 검증에 포함하지 않았습니다.</p>
<details><summary>현재 30개 전체 상태와 조치 보기</summary><div class="scroll"><table><thead><tr><th>번호</th><th>항목·조치</th><th>상태</th><th>남은 조건</th></tr></thead><tbody>__TABLE__</tbody></table></div></details>
<footer>원문 28개 + 추가 제보 29·30번 보존. 코드 변경과 운영 반영을 구분했으며, 일회성 완료 콜백은 재전송하지 않았습니다. 사용자가 승인한 12·13·14번을 다시 묻지 않습니다.</footer>
</main></body></html>'''
body = body.replace('__DONE__', str(done)).replace('__OPEN__', str(len(rows)-done)).replace('__TABLE__', table)
body = body.replace('__PROGRESS__', figure('progress-draft', '분·초와 내부 단계 숫자 없이 중앙·채팅의 프로그레스바를 유지한 실제 컴포넌트 화면.'))
body = body.replace('__LATER_BEFORE__', figure('later-before', '나중에를 누르기 전. 오른쪽 승인 카드에 두 인물이 함께 남아 있습니다.'))
body = body.replace('__LATER_EXPANDED__', figure('later-expanded-755', '755×728. 입력창 위 보류한 작업 (1)을 펼치면 두 대상과 다시 열기가 보입니다.'))
# 데이터 URL을 링크와 이미지에 중복 포함하면 전송 크기가 불필요하게 두 배가 된다.
import re
body = re.sub(r'<a href="data:image/png;base64,[^"]+" target="_blank">(<img[^>]+>)</a>', r'\1', body)
(root / 'report.html').write_text(body)
print(f'{len(body.encode()):,} bytes · {done}/{len(rows)} 완료')
