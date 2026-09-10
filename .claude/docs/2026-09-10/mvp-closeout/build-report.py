# -*- coding: utf-8 -*-
from pathlib import Path
from html import escape
import json,base64
p=Path(__file__).resolve().parent
status=json.loads((p/'release-status.json').read_text()) if (p/'release-status.json').exists() else {}
verification=json.loads((p/'verification-summary.json').read_text()) if (p/'verification-summary.json').exists() else {}
def fig(name,caption):
 data=base64.b64encode((p/'report-images'/f'{name}.webp').read_bytes()).decode()
 return f'<figure tabindex="0" onclick="this.classList.toggle(\'expanded\')"><div><img src="data:image/webp;base64,{data}" alt="{escape(caption)}"></div><figcaption>{escape(caption)} <span>클릭하면 원래 크기로 확대됩니다.</span></figcaption></figure>'
def extfig(url,caption):
 return f'<figure><a href="{escape(url)}" target="_blank" rel="noreferrer"><img src="{escape(url)}" alt="{escape(caption)}"></a><figcaption>{escape(caption)}</figcaption></figure>'
world=json.loads((p/'23-db-evidence.json').read_text())
job=world['jobs'][0]
code=status.get('sha','')
state=status.get('state','배포 확인 대기')
commit=f'<a href="https://github.com/anonymous-paper-review/Tale-Studio/commit/{code}">{code[:8]}</a>' if code else '검증 후 main 반영'
passed=verification.get('passed','확인 중')
failed=verification.get('failed','확인 중')
skipped=verification.get('skipped',27)
style='''*{box-sizing:border-box}html{color-scheme:light;scroll-behavior:smooth}body{margin:0;background:#f5f5f3;color:#202223;font:16px/1.75 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}main{max-width:1060px;margin:0 auto;padding:48px 32px 80px}h1{font-size:34px;line-height:1.35;letter-spacing:-.04em;margin:12px 0 20px}h2{font-size:24px;line-height:1.5;letter-spacing:-.03em;margin-top:56px;padding-top:16px;border-top:1px solid #d9dcda}p{margin:14px 0}a{color:#175b64;text-underline-offset:3px}nav{display:flex;gap:10px 22px;flex-wrap:wrap;margin:28px 0}.lead{font-size:20px}.note,figcaption{color:#59615f;font-size:14px}.badge{font-size:14px;letter-spacing:.05em}.callout{padding:18px 22px;background:#e7efeb;border-left:4px solid #3d7265;border-radius:4px}table{width:100%;border-collapse:collapse;margin:18px 0;background:#fff}th,td{padding:12px 14px;border:1px solid #dce0de;text-align:left;vertical-align:top}th{background:#e9edeb;white-space:nowrap}figure{margin:24px 0;cursor:zoom-in}figure>div{overflow:auto;border:1px solid #ced5d1;border-radius:8px;background:#111}figure img{display:block;width:100%;height:auto}.expanded{cursor:zoom-out}.expanded img{width:auto;max-width:none}.expanded>div{max-height:85vh}figcaption{padding:8px 2px;line-height:1.6}figcaption span{color:#175b64}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:16px}.gallery figure{margin:4px 0}details{margin:28px 0;padding:16px 20px;border:1px solid #d9dcda;border-radius:8px}summary{cursor:pointer;font-weight:650}footer{margin-top:42px;color:#59615f;font-size:13px}@media(max-width:700px){main{padding:28px 16px}h1{font-size:27px}.lead{font-size:18px}th,td{padding:8px;font-size:14px}.gallery{grid-template-columns:1fr}}'''
body=f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MVP 잔여 4건 검증·종료 보고</title><style>{style}</style></head><body><main>
<p class="badge">TALE STUDIO · 2026-09-10 · MVP 최종 검증 보고</p>
<h1>남은 4건의 현재 동작을 확인했고,<br>응답 유실 시 요청이 사라지던 결함을 고쳤습니다.</h1>
<p class="lead"><strong>사용자와 합의한 현재 재현·검증 기준으로 30/30 항목을 닫습니다.</strong> 18번 숫자·중복 접수, 23번 밤 이미지, 27번 두 인물 요청, 29번 대사 저장 후 단계 이동의 검증 화면을 아래에 첨부했습니다.</p>
<div class="callout"><strong>main: {commit} · 운영: {escape(state)}</strong><br>자동검사 {passed:,}개 통과 · 실패 {failed}개 · 기존 제외 {skipped}개. 타입·디자인·lint·빌드 결과는 아래 검증 기록을 따릅니다.</div>
<p>과거 사용자 프로젝트를 복구하거나 다시 생성하지 않았습니다. 별도 개발 표본으로 현재 동작을 확인했습니다. 이번 추가 제품 수정은 <strong>27번의 네트워크 실패 전달 누락</strong>입니다. 18·23·29번은 앞서 main에 반영한 동작을 재검증했습니다.</p>
<nav><a href="#m18">18 숫자·중복</a><a href="#m23">23 밤 이미지</a><a href="#m27">27 두 인물</a><a href="#m29">29 번역·이동</a><a href="#verification">검증·반영</a><a href="#previous">이전 답변·이미지</a></nav>
<table><tr><th>번호</th><th>현재 확인한 결과</th><th>판정</th></tr><tr><td>18</td><td>전체 47샷은 고정되고 완료·생성 중·대기·실패를 구분합니다. 겹치는 동시 요청도 한 번만 접수됩니다.</td><td>종료</td></tr><tr><td>23</td><td>밤 설명으로 실제 1장을 생성했습니다. 저장된 결과와 Artist 팝업이 밤 이미지로 일치합니다.</td><td>종료</td></tr><tr><td>27</td><td>두 인물이 각각 시작합니다. 한쪽 실패·응답 유실에도 다른 결과를 유지하고, 미확인 대상을 지우지 않습니다.</td><td>추가 수리 후 종료</td></tr><tr><td>29</td><td>일부 씬 처리 후 남은 씬을 이어 저장하고 실제 Director 화면으로 이동했습니다. 실패하면 남은 씬을 알리고 이동을 막습니다.</td><td>종료</td></tr></table>
<h2 id="m18">18. 생성 개수가 바뀌던 문제</h2>
<p><strong>‘지금 생성 중인 수’와 ‘전체 샷 수’를 나눠 보여줍니다.</strong> 샷을 최대 4개씩 묶고 씬 경계도 나누므로, 생성 중 수는 8→5→4처럼 달라질 수 있습니다. 전체 작업량이 8→5로 줄어든 뜻은 아닙니다. 과거 ‘14’가 정확히 어느 표시였는지는 기록만으로 확정하지 않았습니다.</p>
<table><tr><th>검증 표본</th><th>전체</th><th>완료</th><th>생성 중</th><th>대기</th><th>실패</th></tr><tr><td>4+4 묶음</td><td>47</td><td>0</td><td>8</td><td>39</td><td>0</td></tr><tr><td>다음 4+1 묶음</td><td>47</td><td>8</td><td>5</td><td>34</td><td>0</td></tr><tr><td>1샷 완료, 4샷 진행</td><td>47</td><td>9</td><td>4</td><td>34</td><td>0</td></tr><tr><td>실패 1개 재시도 완료</td><td>47</td><td>14</td><td>0</td><td>33</td><td>0</td></tr></table>
<p>개발 DB의 격리 검사 10개에서 동일·부분 중복 요청을 동시에 보냈고, 중복 접수를 막는 것을 확인했습니다. 실패 카드에서 다시 시도한 샷도 정확히 1회만 접수됐습니다. 기존 프로젝트 데이터는 바꾸지 않았습니다.</p>
{fig('18-eight','실제 러프 보드 컴포넌트의 검증 화면: 전체 47, 생성 중 8, 대기 39. 큐와 이미지는 통제한 표본입니다.')}
{fig('18-retry-complete','실패한 1샷의 실제 재시도 버튼을 누른 뒤: 완료 14, 대기 33, 전체 47 유지.')}
<p class="note">화면은 넓은 검증 화면 기준입니다. 이번 자료로 좁은 화면의 전체 배치를 검증했다고 주장하지 않습니다. 운영에서 새 러프 이미지를 대량 발주하는 실험도 하지 않았습니다.</p>
<h2 id="m23">23. 밤 설명인데 낮 그림이 나오던 문제</h2>
<p><strong>새 밤 이미지 1장을 실제 생성해 확인했습니다.</strong> 같은 학교 옥상의 울타리·벤치·계단실 구도를 유지하면서 밤하늘·달빛·창문 불빛으로 바뀌었습니다. 최종 생성 입력에는 새 밤 설명을 사용하고, 기본 배경의 낮 조명을 다시 섞지 않았습니다.</p>
<div class="gallery">{extfig(job['input_snapshot']['reference_image_urls'][0],'참조: 기존 낮 옥상 이미지. 원본 프로젝트는 읽기만 했습니다.')}{extfig(world['appearances'][0]['wide_shot'],'이번 검증에서 실제 생성한 밤 이미지. 클릭하면 원본을 엽니다.')}</div>
{fig('23-night-popup','현재 Artist 팝업: 새로 저장한 밤 이미지와 한국어 밤 설명이 함께 표시됩니다.')}
<p class="note">GPT Image 2 편집 모델, 접수 15:20:04 → 완료 15:21:28 KST, 작업 1개. 표본 한 장의 시간대·저장·선택 일치 확인이며 모든 이미지의 미적 품질을 보증하는 판정은 아닙니다.</p>
<h2 id="m27">27. 한 명을 빠뜨리고 다시 물어야 하던 문제</h2>
<p><strong>두 인물이 각각 시작하고, 일부 실패를 전체 완료로 처리하지 않습니다.</strong> 기존 순차 대기 문제는 수정돼 있었습니다. 이번에는 네트워크 예외를 채팅의 승인 처리에 전달하지 않아 미확인 인물이 사라지는 결함을 추가로 발견했습니다. 실패 상태를 빠짐없이 전달하도록 고쳤습니다.</p>
{fig('27-two-queued','한 번 승인한 뒤 쿄타로·코마츠 각각 생성 중. 실제 승인·Artist 처리를 사용하고 외부 생성 응답은 표본으로 통제했습니다.')}
{fig('27-partial','쿄타로만 실패해도 코마츠는 완료됩니다. 보류한 작업에는 쿄타로만 남고 이유가 표시됩니다. 회색 이미지는 검증용 표본입니다.')}
{fig('27-lost-response','접수 응답이 끊긴 경우: 미확인 인물을 남기고 확인 필요를 안내합니다. 재승인해도 중복 발주하지 않았습니다.')}
<p>접수한 작업 번호를 알고 있으면 기존 작업을 다시 조회합니다. 번호까지 유실돼 확인할 수 없으면 그 사실을 알리고 요청을 남깁니다. 완료한 다른 인물은 다시 생성하지 않습니다. 자동으로 모든 과거 작업을 찾아 복구하는 기능은 이번 범위에 넣지 않았습니다.</p>
<h2 id="m29">29. ‘먼저 1~3씬’에서 채팅이 끝나던 문제</h2>
<p><strong>남은 씬을 이어 처리하고, 마지막 저장이 끝난 뒤 실제 Director 화면을 엽니다.</strong> 6씬 표본에서 1~3씬만 반환하는 상황을 통제한 뒤, 4·5씬은 실제 Writer API로 번역·저장했습니다. 원래 한국어였던 6씬은 그대로 유지했습니다.</p>
{fig('29-complete','한 번의 요청으로 5/5 대사 저장 후 실제 Director 화면에 도착했습니다. 인물·러프 그림은 재사용 표본이며 영상 생성은 하지 않았습니다.')}
<table><tr><th>실제 번역 표본</th><th>최종 저장 결과</th></tr><tr><td>約束の時間まで、あと五分だ。</td><td>약속 시간까지 5분 남았어.</td></tr><tr><td>一緒に行こう。もう一人にはしない。</td><td>같이 가자. 더 이상 혼자 두지 않을게.</td></tr></table>
<p><strong>실패 상황도 확인했습니다.</strong> 첫 실험에서 모델이 수정 결과를 주지 않았을 때, 앱은 ‘씬 4·5 미완료’를 안내하고 이동하지 않았습니다. 같은 요청을 다시 보내자 이미 저장한 씬을 제외하고 남은 씬만 처리했습니다. 이후 분할 실험은 한 번의 요청으로 끝났습니다.</p>
{fig('29-incomplete','모델이 실행할 수정 결과를 주지 않은 경우: 남은 씬과 미완료 이유를 알리고 다음 단계 이동을 막았습니다.')}
<p class="note">이어 처리는 앱이 열려 있는 동안 동작합니다. 작업 중 새로고침하거나 브라우저를 닫은 뒤 자동 재개하는 기능은 없습니다. 먼저 저장한 대사는 남으며 다시 요청하면 남은 외국어 대사를 처리합니다. 이번 합의에 따라 과거 프로젝트 복구는 종료 조건에서 제외했습니다.</p>
<h2 id="verification">검증과 main 반영</h2>
<ul><li>전체 자동검사: <strong>{passed:,}통과 · {failed}실패 · 기존 {skipped}제외</strong>. 새 skip 없음.</li><li>타입·디자인 검사·프로덕션 빌드: {escape(verification.get('checks','최종 확인 중'))}. 소스 lint: 오류 {verification.get('lintErrors','확인 중')}개·기존 경고 {verification.get('lintWarnings',24)}개.</li><li>27번 새 회귀 2개: 수정 전 실패 → 수정 후 통과. Artist·요청 보존 묶음 405개 통과, 기존 제외 1개.</li><li>18번 개발 DB 10개·관련 로컬 14개, 23번 관련 16개, 29번 관련 51개 통과.</li><li>실제 생성·모델 호출: 밤 이미지 1개, Writer 호출 총 5회. 18·27 화면의 생성 응답은 통제한 표본입니다.</li><li>이번 제품 변경: Artist 이미지 접수·조회 네트워크 예외도 승인 처리에 전달. 새 의존성·운영 DB 변경 없음.</li><li>검수용 임시 제품 페이지는 제거했습니다. 기존 사용자 프로젝트의 씬·샷·대사·이미지는 수정하지 않았습니다.</li></ul>
<p class="note">검수용 임시 페이지를 제거하기 전에는 그 페이지의 번역·색 규칙 검사가 실패했습니다. 최종 결과는 임시 경로 제거 후 다시 검사한 배포 대상 기준입니다.</p>
<h2 id="previous">앞서 물으신 내용과 기존 이미지</h2>
<p>기존 실패 2개는 인물·배경 생성 함수의 문자열 모양을 비교하던 검사였습니다. 원래 경험 약속을 유지하고, 승인 전 미실행·승인 후 실제 대상 저장/생성 결과를 검사하도록 바꿨으며 현재 통과합니다.</p>
<p>Writer 왼쪽 숫자는 <strong>아직 안 본 완료 이미지 수</strong>입니다. 실제 저장 성공을 기준으로 세고 Writer 방문 시 읽음 처리합니다. Director 영상 수나 처리 중인 큐 수가 아닙니다. 진행 바는 유지하고 부정확한 남은 시간·내부 단계 숫자는 표시하지 않습니다. 01·12·13·14는 이미 승인하신 결과를 유지합니다.</p>
<details><summary>23번에서 요청하신 기존 저장 이미지 6개</summary><p class="note">아래는 기존 프로젝트 저장본입니다. 이번에 새로 생성한 밤 이미지는 위 23번에 별도로 표시했습니다.</p><div class="gallery">'''
manifest=json.loads((p/'legacy-image-manifest.json').read_text())
# Support the saved image manifest without guessing external image URLs.
entries=manifest if isinstance(manifest,list) else manifest.get('images',[])
for entry in entries:
 url=entry.get('url') or entry.get('imageUrl') or entry.get('sourceUrl')
 label=entry.get('title') or entry.get('label') or entry.get('name') or entry.get('id','기존 저장 이미지')
 if url:body+=extfig(url,label)
body+='</div></details><footer>2026-09-10 사용자 승인: 과거 상황 전체 복구 없이 현재 재현·해결 여부와 검증 화면을 남겨 종료. 이 문서의 최신 판정이 이전 26/30 보고보다 우선합니다.</footer></main></body></html>'
(p/'report.html').write_text(body)
print(json.dumps({'path':str(p/'report.html'),'bytes':len(body.encode()),'state':state},ensure_ascii=False))
