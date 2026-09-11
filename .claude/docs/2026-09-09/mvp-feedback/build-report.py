"""검증 결과와 원본 스크린샷을 외부 자산이 없는 한국어 보고서로 묶는다."""
from pathlib import Path
from collections import Counter
import base64
import html
import json
import sys
import re

ROOT = Path(__file__).resolve().parent
rows = json.loads((ROOT / 'result-index.json').read_text())
checks = json.loads((ROOT / 'verification-summary.json').read_text())
counts = Counter(row['state'] for row in rows)
esc = html.escape
compact = '--compact' in sys.argv
shared_images = {'dialogue-handoff-complete', 'before-1511', 'after-1511', 'before-755', 'after-755', 'global-approval'}


def image(name, alt):
    path = ROOT / f'{name}.png'
    if not path.exists():
        raise FileNotFoundError(path)
    encoded = base64.b64encode(path.read_bytes()).decode()
    return f'<img loading="lazy" src="data:image/png;base64,{encoded}" alt="{esc(alt)}">'


def figure(name, title, caption):
    if compact and name not in shared_images:
        return ''
    return f'<figure>{image(name, title)}<figcaption><strong>{esc(title)}</strong><br>{esc(caption)}</figcaption></figure>'


table = ''.join(f'''<tr data-state="{esc(r['state'])}"><td class="num">{r['id']:02d}</td><td><strong>{esc(r['title'])}</strong><p>{esc(r['result'])}</p></td><td><span class="status {'done' if r['state']=='완료' else 'pending'}">{esc(r['state'])}</span></td><td>{esc(r['limit'])}</td></tr>''' for r in rows)
promises = ''.join(f'''<details class="promise"><summary>{r['id']:02d} · {esc(r['promise'])}</summary><p>왜: {esc(r['why'])}</p><p>결과: {esc(r['result'])}</p><p class="muted">남은 조건: {esc(r['limit'])}</p></details>''' for r in rows)
state_options = ''.join(f'<option value="{esc(state)}">{esc(state)} · {count}개</option>' for state, count in counts.items())
verification_rows = ''.join(f'<tr><th>{esc(check["name"])}</th><td>{esc(check["result"])}</td><td>{esc(check["note"])}</td></tr>' for check in checks['checks'])

body = f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MVP 피드백 조치 보고 · 2026-09-10</title>
<style>
:root{{color-scheme:light;--ink:#1b2530;--muted:#576472;--line:#d7dde2;--paper:#fff;--bg:#f3f5f7;--accent:#164b68;--success:#e6f1eb;--wait:#fff1d6}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 -apple-system,BlinkMacSystemFont,'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif}}main{{max-width:1160px;margin:auto;padding:52px 28px 80px}}header{{border-top:6px solid var(--accent);padding:28px 0}}.eyebrow{{color:var(--accent);font-weight:750;font-size:13px;letter-spacing:.09em}}h1{{font-size:clamp(29px,4.2vw,46px);line-height:1.35;letter-spacing:-.045em;max-width:990px;margin:16px 0 22px}}h2{{font-size:25px;letter-spacing:-.025em;margin:0 0 18px}}h3{{font-size:19px;line-height:1.5;margin:0 0 9px}}p{{margin:0 0 12px}}.lead{{font-size:19px;line-height:1.85;max-width:1000px}}.muted,small{{color:var(--muted)}}.meta{{font-size:13px;color:var(--muted);margin-bottom:18px}}nav{{display:flex;flex-wrap:wrap;gap:9px 24px;margin:24px 0}}a{{color:var(--accent);text-underline-offset:4px}}.metrics{{display:grid;grid-template-columns:repeat(3,1fr);border-block:1px solid var(--line);margin:24px 0 8px}}.metric{{padding:20px 24px 20px 0}}.metric b{{font-size:34px;line-height:1.3;display:block;letter-spacing:-.04em}}.metric span{{color:var(--muted);font-size:14px}}section{{padding:30px 0;border-top:1px solid var(--line)}}.cards{{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}}article,.notice{{background:var(--paper);border:1px solid var(--line);padding:23px}}article p:last-child{{margin:0}}.notice{{border-left:5px solid var(--accent);margin:20px 0}}.caution{{border-left-color:#aa731b;background:#fffbf3}}.flow{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}}.flow div{{background:var(--paper);border-top:3px solid var(--accent);padding:17px}}.flow b{{display:block;margin-bottom:8px}}.flow p{{font-size:14px;margin:0;color:var(--muted)}}.two{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}figure{{margin:0 0 22px;background:var(--paper);border:1px solid var(--line)}}img{{display:block;width:100%;height:auto}}figcaption{{padding:14px 18px;font-size:14px;color:var(--muted)}}figcaption strong{{color:var(--ink)}}.scroll{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;background:var(--paper);font-size:14px}}th,td{{text-align:left;padding:15px 17px;border-bottom:1px solid var(--line);vertical-align:top}}thead th{{background:#e9eef2;font-size:13px;white-space:nowrap}}td p{{margin:6px 0 0;color:var(--muted)}}td.num{{font-variant-numeric:tabular-nums;color:var(--muted);width:55px}}.status{{display:inline-block;white-space:nowrap;padding:2px 9px;font-size:12px;font-weight:700}}.done{{background:var(--success);color:#246045}}.pending{{background:var(--wait);color:#7b5010}}.toolbar{{display:flex;align-items:center;gap:12px;margin:18px 0}}select{{padding:9px 12px;border:1px solid #a5b0b8;border-radius:4px;background:#fff;font:inherit;font-size:14px}}details{{border:1px solid var(--line);padding:15px 19px;background:var(--paper);margin:10px 0}}summary{{cursor:pointer;font-weight:650}}details p:first-of-type{{margin-top:14px}}.promise{{font-size:14px}}.promise p{{padding-left:20px}}ul,ol{{padding-left:23px}}li{{margin:8px 0}}footer{{margin-top:35px;color:var(--muted);font-size:13px}}[hidden]{{display:none!important}}@media(max-width:740px){{main{{padding:24px 18px 45px}}.cards,.two{{grid-template-columns:1fr}}.flow{{grid-template-columns:repeat(2,1fr)}}.metric b{{font-size:26px}}.metric{{padding-right:10px}}.metric span{{font-size:12px}}td,th{{padding:12px}}.lead{{font-size:17px}}table{{min-width:700px}}}}@media print{{body{{background:white}}main{{max-width:none;padding:0}}nav,.toolbar{{display:none}}section,article,figure{{break-inside:avoid}}details{{display:block}}details>*{{display:block}}table{{font-size:11px}}h1{{font-size:30px}}}}
</style></head><body><main>
<header>
<div class="eyebrow">TALE STUDIO · MVP 피드백 조치 보고</div>
<h1>일부 씬 처리 예고에서 끊기던 요청을<br>전체 저장 확인 후 Director 이동까지 연결했습니다.</h1>
<p class="lead">채팅 요청 유실, 잘못된 진행 표시, 모습별 이미지 상태를 수정했습니다. 추가 제보는 <strong>MVP-29</strong>로 등록했습니다. 운영 기록에서 확인한 <strong>같은 러프 5샷의 3회 중복 생성</strong>은 숫자 표시와 별개의 접수 경합으로 다뤘습니다.</p>
<p class="meta">보고 기준: 2026-09-10 KST · 작업: 2026-09-09~10 · 개발 작업 사본에서 수정·검증 · 운영 기록은 읽기 전용 확인</p>
<div class="metrics"><div class="metric"><b>{counts['완료']} / 29</b><span>엄격한 항목 완료 체크</span></div><div class="metric"><b>40 + 7샷</b><span>대사 수정 저장 + 기존 한국어 유지</span></div><div class="metric"><b>Director 1회</b><span>전체 저장 후 이동 · 저장 전 0회</span></div></div>
<p class="muted">남은 {29-counts['완료']}개는 부분 수정·외형 검수·기록 부족·테스트 판정을 구분해 열어뒀습니다. 코드 적용을 운영 해결 완료로 표시하지 않았습니다.</p><div class="notice caution"><strong>배포 판정 보류</strong><p>개발 Supabase의 실제 DB 검증과 예약 함수 적용은 끝났습니다. 기존 테스트2개의 판정 및 main·운영 반영은 남아 있습니다.</p></div>
<nav aria-label="보고서 목차"><a href="#outcomes">사용자 경험 변화</a><a href="#evidence">검증 결과</a><a href="#screens">화면 검수</a><a href="#remaining">남은 조건</a><a href="#all">29개 전체 결과</a></nav>
</header>
<section id="outcomes"><h2>사용자 경험은 이렇게 달라집니다</h2>
<div class="cards"><article><h3>요청한 끝까지 이어서 처리</h3><p>“전체 한국어로 맞추고 넘겨줘”라는 목표와 대상 전체를 유지합니다. 일부만 돌아오면 저장 결과를 기다린 뒤 남은 씬을 요청합니다. 끝내지 못하면 이유와 남은 씬을 알립니다.</p></article><article><h3>여러 대상과 승인 기회 보존</h3><p>두 인물·두 배경의 요청을 카드 한 장에 모두 남깁니다. 다른 단계에서도 승인할 수 있고, “나중에”는 보류 목록에서 다시 열 수 있습니다. 완료한 대상을 다시 생성하지 않습니다.</p></article><article><h3>범위가 분명한 진행 표시</h3><p>초안·검토 대기·샷과 대사 저장을 구분합니다. 중앙과 채팅은 같은 상태를 표시합니다. 현재 구간과 맞지 않는 남은 시간 숫자는 제거했습니다.</p></article><article><h3>대화와 모습이 제자리에 유지</h3><p>탭을 옮겨도 안내와 읽던 위치가 유지됩니다. 밤 모습은 해당 모습의 이미지·생성 상태를 보여주며, 입력에 기존 낮·햇빛 조건을 섞지 않습니다.</p></article></div>
<h3 style="margin-top:28px">추가 제보의 완료 기준</h3>
<div class="flow"><div><b>① 전체 목표 고정</b><p>6씬·47샷 중 변경할 일본어 40샷과 Director 목적지를 보존</p></div><div><b>② 실제 저장 대기</b><p>1~3씬 응답을 저장. 응답이 늦으면 다음 요청·이동을 기다림</p></div><div><b>③ 남은 씬 계속</b><p>4씬·5씬을 이어 처리. 기존 한국어 7샷은 그대로 유지</p></div><div><b>④ 결과에 따라 종료</b><p>전부 저장되면 완료 안내 후 이동. 실패하면 남은 대상과 이유 표시</p></div></div>
<p class="muted">이 자동 이어가기는 현재 열린 브라우저 세션 기준입니다. 브라우저 종료 뒤 자동 재개하는 서버 작업과 번역의 의미·말맛 검수는 포함하지 않았습니다.</p>
</section>
<section id="evidence"><h2>검증 결과와 그 범위</h2>
<div class="scroll"><table><thead><tr><th>검사</th><th>결과</th><th>판정 범위</th></tr></thead><tbody>{verification_rows}</tbody></table></div>
<div class="notice"><strong>운영 기록에서 확인한 사실</strong><p>같은 실행의 초안은 약 61초, 전체 Writer는 약 10분 25초였습니다. “1분”은 초안 구간과 일치하지만, 당시 “18분”을 만든 표본은 남아 있지 않습니다. 또한 같은 5샷이 서로 다른 작업으로 세 번씩 완료됐습니다. 청구액은 확인하지 않았습니다.</p></div>
<p class="muted">운영의 현재 목록은 추가 씬을 포함해 6씬·61샷입니다. 채팅이 말한 6씬·47샷과 같은 시점의 실제 수량으로 취급하지 않았습니다. 자동 검수의 6씬·47샷은 제보 조건을 재현한 별도 고정 자료입니다.</p>
</section>
<section id="screens"><h2>화면 검수 자료</h2><p class="muted">실제 화면 컴포넌트에 고정 응답을 넣어 캡처했습니다. 이동 호출을 확인하는 로컬 검수 화면이며 전체 운영 페이지 이동이나 실제 생성 품질의 검수 자료는 아닙니다.</p>
{figure('dialogue-handoff-complete','전체 저장 후 완료 안내와 Director 이동','진행 안내는 40개 메시지 대신 한 줄에서 갱신됩니다. 일본어 40샷의 저장과 기존 한국어 7샷 유지 후 Director 이동 1회를 확인했습니다.')}
<div class="two">{figure('before-1511','색·메뉴 정리 전 · 1511×728','빨간 긍정 버튼과 Help, 서로 다른 하단 메뉴 치수. 이 자료는 시각 정리 전이며 진행 계산은 이미 수정된 시점입니다.')}{figure('after-1511','색·메뉴 정리 후보 · 1511×728','긍정 행동은 회백색, Help는 보조 메뉴로 정리했습니다. 중앙과 채팅은 같은 초안 단계와 50% 막대를 표시합니다.')}</div>
<div class="two">{figure('before-755','색·메뉴 정리 전 · 755×728','원 제보와 같은 좁은 화면에서 메뉴와 버튼을 비교합니다.')}{figure('after-755','색·메뉴 정리 후보 · 755×728','공통 크기·간격을 적용했습니다. 최종 외형은 오너 검수 대기입니다.')}</div>
<div class="two">{figure('global-approval','다른 단계에서도 두 대상 승인 유지','Writer 채팅에서 Artist의 쿄타로·코마츠 요청을 한 카드로 확인합니다.')}{figure('deferred','“나중에” 이후 다시 열기','보류한 작업을 펼쳐 수동 재개합니다. 보류 자체는 생성이나 취소가 아닙니다.')}</div>
<div class="two">{figure('appearance-default','기본 모습 선택','이미지 선택 경로 확인을 위한 테스트 도형입니다. 실제 생성 결과가 아닙니다.')}{figure('appearance-night','밤 모습 선택','탭 선택 후 다른 저장 이미지 URL을 표시합니다. 밤의 시각적 품질 합격을 뜻하지 않습니다.')}</div>
<details><summary>추가 검수 화면 보기 — 저장 대기·검토 대기·좁은 승인 화면·밝은 테마</summary>
{figure('dialogue-waiting-save','저장 응답이 아직 오지 않은 상태','24번째 저장 응답을 지연시켰을 때 다음 모델 요청과 Director 이동은 발생하지 않았습니다.')}
<div class="two">{figure('review-wait','초안 검토 대기','검토·확정을 기다리는 상태에는 진행 중 막대를 표시하지 않습니다.')}{figure('saving','최종 저장 단계','후반 단계 10/11과 저장 작업 설명을 함께 표시합니다.')}</div>
<div class="two">{figure('global-approval-755','다른 단계 승인 · 755×728','좁은 화면에서도 원래 담당자와 여러 요청 대상을 보존합니다.')}{figure('deferred-755','보류한 작업 · 755×728','보류 목록을 열어 재개와 취소를 구분합니다.')}</div>
{figure('light-focus','밝은 테마와 포커스 상태','공통 버튼을 실제 화면에서 확인한 자료입니다. 전체 페이지의 외형 승인으로 취급하지 않습니다.')}</details>
</section>
<section id="remaining"><h2>완료로 닫지 않은 조건</h2>
<ol><li><strong>외형·이미지 검수:</strong> 회백색 버튼, 메뉴 크기·정렬·선 굵기, Help는 전후 화면을 준비했습니다. 실제 밤 이미지와 잠옷 품질은 별도 생성 결과 검수가 필요합니다.</li><li><strong>과거 기록의 공백:</strong> 당시 18분의 추정 표본, 내부 식별자가 최초 생긴 응답, 원래 14 표시의 위치, 활성 탭에 배지9가 남았던 조건은 아직 확정하지 못했습니다.</li><li><strong>복구 범위:</strong> 접수 여부를 모르는 작업의 자동 원격 확인, 브라우저 종료 후 대사 작업 재개는 남아 있습니다. 확인되지 않은 요청을 바로 다시 발주하지 않도록 보존합니다.</li><li><strong>기존 테스트 판정:</strong> 실제 채팅→승인→생성 검사는 통과했지만 호출 문장 모양을 검사하는 기존2개는 실패 상태를 보존했습니다. 한국어 약속을 유지한 채 실제 동작 검사로 바꾸는 검토안을 별도로 남겼습니다.</li><li><strong>적용 단계:</strong> {esc(checks['deployment'])}</li></ol>
<div class="notice caution"><strong>승인된 정책으로 새로 정하지 않은 것</strong><p>최종 색, 예상 시간 허용 오차·표본 수, 자동 복구 횟수·시간 상한은 임의로 확정하지 않았습니다. 기존 요청 범위의 국소 수정과 검증을 수행했고, 테스트 실패를 숨기기 위해 기대값·제외 설정을 바꾸지 않았습니다.</p></div>
</section>
<section id="all"><h2>29개 항목별 결과</h2><p>완료는 약속과 필요한 증거가 확보된 항목만 체크했습니다. 부분 수정·검수 대기·조사 대기는 완료 수에 포함하지 않습니다.</p>
<div class="toolbar"><label for="filter">상태별 보기</label><select id="filter"><option value="all">전체 · 29개</option>{state_options}</select><span id="shown" aria-live="polite">29개 표시</span></div>
<div class="scroll"><table id="results"><thead><tr><th>번호</th><th>항목과 조치</th><th>상태</th><th>제한·후속 조건</th></tr></thead><tbody>{table}</tbody></table></div>
</section>
<section><h2>한국어 약속 원문과 필요한 이유</h2><p class="muted">검수할 항목을 펼치면 약속과 결과를 같은 자리에서 볼 수 있습니다.</p>{promises}</section>
<footer>원문28개 보존 + 추가 제보1개 · 상세 실행 증거와 검증 로그는 프로젝트의 MVP 피드백 보고 폴더에 보존 · 이 문서는 상급자에게 전달할 수 있는 검토용 산출물이며 실제 외부 수신자에게 발송하지 않았습니다.</footer>
</main><script>document.getElementById('filter').addEventListener('change',function(){{let n=0;document.querySelectorAll('#results tbody tr').forEach(row=>{{const show=this.value==='all'||row.dataset.state===this.value;row.hidden=!show;if(show)n++}});document.getElementById('shown').textContent=n+'개 표시'}})</script></body></html>'''
if compact:
    body = re.sub(r'<details><summary>추가 검수 화면 보기.*?</details>', '', body, flags=re.S)
    body = body.replace('<div class="two"></div>', '')
    body = body.replace('<h2>화면 검수 자료</h2>', '<h2>화면 검수 자료</h2><p class="muted">공유본에는 핵심 화면6장을 담았습니다. 모든 원본 화면과 전체 보고서는 프로젝트 보고 폴더에 보존했습니다.</p>')
name = 'mvp-feedback-report-share.html' if compact else 'mvp-feedback-report.html'
(ROOT / name).write_text(body)
print(f'보고서 생성: {len(body.encode()):,} bytes / {len(rows)}개 항목 / 완료 {counts["완료"]}개')
