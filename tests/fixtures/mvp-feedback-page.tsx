'use client'
// 로컬 검수 전용: 실제 화면 컴포넌트에 고정 응답을 공급한다. 실행 스크립트가 임시 경로에 설치/제거한다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { NavigationPromisesContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import { useArtistStore } from '@/stores/artist-store'
import { WorldPanel } from '@/features/artist/world-panel'
import { CharacterPanel } from '@/features/artist/character-panel'
import { createPendingProposal } from '@/lib/pending-proposal'
import { Sidebar } from '@/components/layout/sidebar'
import { GlobalChat } from '@/components/layout/global-chat'
import { WriterGenerationView } from '@/features/writer/writer-generation-view'
import { RoughStoryboardView } from '@/features/writer/rough-storyboard-view'
import { useWriterStatus, restartWriterStatus } from '@/lib/writer/use-writer-status'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterStore } from '@/stores/writer-store'
import { EMPTY_LIFECYCLE_STATUS } from '@/lib/lifecycle'
import { useLocaleStore } from '@/stores/locale-store'
import { markStageSeen } from '@/lib/stage-seen'
import { refreshGenerationQueue, type ActiveJob } from '@/lib/generation-queue'
import type { Scene, Shot, StageId } from '@/types'

const pid = 'mvp-local-fixture'
const firstStatus = { projectId: pid, engine: 'v1', started: true, pipeline_completed: false, pipeline_failed: false, current_stage: 'scenes', current_status: 'running', completed_units: 2, total_units: 15, progress_percent: 13, error: null, last_timestamp: new Date().toISOString(), available: {}, eta_total_ms: 1080000 }
const preview = { started: true, running: true, completed: false, failed: false, roster: [{slug:'char_1',name:'쿄타로'},{slug:'char_2',name:'코마츠'},{slug:'roof',name:'학교 옥상'}], scenes: [{sceneId:'s1',index:1,beats:['학교 옥상에서 쿄타로와 코마츠가 서로를 바라본다. 바람이 불고 두 사람은 잠시 말을 멈춘다.'],shotStories:[]}], characters:[{id:'char_1',name:'쿄타로',role:'주인공',description:'교복을 입은 학생. 검은 머리와 차분한 눈빛.',portraitUrl:null,templateUrl:null},{id:'char_2',name:'코마츠',role:'친구',description:'밝은 표정의 학생. 단정한 교복 차림.',portraitUrl:null,templateUrl:null}], worlds:[{id:'roof',name:'학교 옥상',description:'난간 너머로 학교와 도시가 보이는 옥상.'}] }
export default function MvpFeedbackFixture() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [path, setPath] = useState('/studio/writer')
  const [roughMode, setRoughMode] = useState(false)
  const [artistMode, setArtistMode] = useState(false)
  const [navigations] = useState<string[]>([])
  useEffect(() => {
    if (!['localhost','127.0.0.1'].includes(location.hostname)) return
    const original = window.fetch
    const state = { status: {...firstStatus}, requests: [] as string[], completions: [] as unknown[], errors: [] as string[], dialogueRequests: 0, writes: [] as string[], holdSave: false, releaseSave: (() => {}) as () => void, navigations, roughSample: '', roughJobs: [] as ActiveJob[], roughSubmissions: [] as string[] }
    const artistSample = { loseSubmitResponse: false, submissions: [] as string[], jobs: new Map<string, { characterId:string; status:string; resultUrl:string|null; error:string|null }>(), polls: new Map<string, (response:Response)=>void>() }
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      if (!url.pathname.startsWith('/api/') && !url.hostname.includes('supabase')) return original(input, init)
      state.requests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
      let body: unknown = {}
      if (url.pathname === '/api/artist/chat') body = {reply:'두 인물의 다른 시간대 모습을 추가할게요. 아래 내용을 확인해 주세요.',updates:[],appearanceCreations:['kyotaro','komatsu'].map(characterId=>({type:'createAppearance',characterId,label:'잠옷',appearance:characterId==='kyotaro'?'blue pajamas at night':'red pajamas at night',narrativeTime:'future'}))}
      else if (url.pathname === '/api/artist/character-appearance') body = {...JSON.parse(String(init?.body ?? '{}')),appearanceKey:'pajamas',appearanceNative:'밤에 입은 잠옷'}
      else if (url.pathname === '/api/artist/generate-sheet') {
        const {characterId} = JSON.parse(String(init?.body ?? '{}')) as {characterId:string}
        const jobId = `artist-sample-${artistSample.submissions.length+1}`
        artistSample.submissions.push(characterId)
        artistSample.jobs.set(jobId,{characterId,status:'queued',resultUrl:null,error:null})
        if (artistSample.loseSubmitResponse && characterId==='kyotaro') throw new TypeError('Failed to fetch')
        body={jobId}
      }
      else if (url.pathname.startsWith('/api/generation-jobs/artist-sample-')) {
        const jobId=url.pathname.split('/').at(-1)!
        const job=artistSample.jobs.get(jobId)
        if (job?.status==='queued') return new Promise<Response>(resolve=>artistSample.polls.set(jobId,resolve))
        body={data:job}
      }
      else if (url.pathname === '/api/artist/generation-status') body = {failures:[],worldFailures:[]}
      else if (url.pathname === '/api/writer/chat') {
        state.dialogueRequests++
        const targets = useWriterStore.getState().shots.filter(s => state.dialogueRequests === 1 ? (s.sortOrder ?? 0) <= 24 : s.sceneId === `s${state.dialogueRequests + 2}`)
        body = {reply:'먼저 Scene 1~3부터 처리할게요.',updates:targets.map(s=>({type:'updateShot',id:s.shotId,patch:{dialogueLines:s.dialogueLines.map(l=>({...l,text:'안녕하세요.'}))}}))}
      }
      else if (url.pathname.endsWith('/rest/v1/shots') && init?.method === 'PATCH') {
        const id = url.searchParams.get('shot_id')?.replace(/^eq\./,'') ?? ''
        state.writes.push(id)
        if (state.holdSave && id === 'shot_24') await new Promise<void>(resolve => {state.releaseSave=resolve})
        body = {shot_id:id}
      }
      else if (url.pathname.startsWith('/api/writer/status/')) body = state.status
      else if (url.pathname.startsWith('/api/writer/preview/')) body = preview
      else if (url.pathname === '/api/generation/active') body = { data: { jobs: state.roughJobs, batches: [], completions: state.completions } }
      else if (url.pathname === '/api/writer/rough-storyboard') {
        const input = JSON.parse(String(init?.body ?? '{}')) as { force?: boolean; shotIds?: string[] }
        if (input.force && input.shotIds?.includes('rough-14')) {
          state.roughSubmissions.push('rough-14')
          setRoughSample('retry')
          body = { ok: true, data: { submitted: [{shotId:'rough-14',jobId:'rough-retry-14'}], skipped: [], remaining: 0 } }
        } else body = { ok: true, data: { submitted: [], skipped: [], remaining: 0 } }
      }
      else if (url.pathname === '/api/generation-jobs/rough-retry-14') body = { ok:true,data:{status:state.roughSample === 'retry-complete' ? 'completed':'queued',resultUrl:picture('검증용 완료 이미지','#6b7280'),error:null} }
      else if (url.pathname === '/api/billing/take-balance') body = { balance: 100, mode: 'shadow' }
      else if (url.pathname.includes('/auth/')) body = { user: null }
      else if (url.pathname.includes('/rest/')) body = []
      else if (url.pathname.includes('style')) body = { anchors: [], presets: [] }
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    }
    useLocaleStore.getState().setLocaleForDisplay('ko')
    useProjectStore.setState({ projectId: pid, projectTitle: 'MVP 피드백 검수', currentStage:'writer', reachedStage:'editor', artistImagesReady:true, writerComplete:true, writerActive:true, initLoading:false, projectLocale:'ko', projectLocaleLocked:true, canNavigateTo:()=>true })
    useGlobalChatStore.setState({ messages:[], loading:false, loadMessages:async()=>{} })
    const picture = (label: string, fill: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${fill}"/><text x="320" y="190" text-anchor="middle" fill="white" font-size="28">${label}</text></svg>`)
    const setRoughSample = (sample: string) => {
      const samples: Record<string, { done:number; grids:number[][]; failed?:number }> = {
        eight: {done:0,grids:[[1,2,3,4],[5,6,7,8]]},
        five: {done:8,grids:[[9],[10,11,12,13]]},
        four: {done:9,grids:[[10,11,12,13]]},
        failed: {done:13,grids:[],failed:14},
        retry: {done:13,grids:[[14]],failed:14},
        'retry-complete': {done:14,grids:[]},
      }
      const selected = samples[sample]
      if (!selected) throw new Error('Unknown local rough sample')
      state.roughSample = sample
      state.roughJobs = selected.grids.map((grid,i)=>({id:sample==='retry'?'rough-retry-14':`${sample}-grid-${i}`,kind:'shot_rough_storyboard',target:{writerShotIds:grid.map(id=>`rough-${id}`)},startedAt:Date.now()}))
      useWriterStore.setState({shots:useWriterStore.getState().shots.map((shot,i)=>({...shot,roughStoryboard:i+1===selected.failed ? {url:'',status:'failed',errorMessage:'검증 표본: 접수 거절',generatedAt:0} : i<selected.done ? {url:picture(`검증용 완료 이미지 ${i+1}`,'#6b7280'),status:'completed',errorMessage:null,generatedAt:0} : null}))})
      refreshGenerationQueue()
    }
    useArtistStore.setState({  characterAssets:[{characterId:'kyotaro',name:'쿄타로',entityType:'person',appearances:[],views:{main:null,back:null,sideLeft:null,sideRight:null},viewCandidates:{}},{characterId:'komatsu',name:'코마츠',entityType:'person',appearances:[],views:{main:null,back:null,sideLeft:null,sideRight:null},viewCandidates:{}}], worldAssets:[{locationId:'roof',name:'학교 옥상',sceneId:'s1',wideShot:picture('기본 모습 테스트 이미지', '#62798b'),visualDescription:'School roof in daylight',visualDescriptionNative:'낮의 학교 옥상',appearances:[{appearanceKey:'night',label:'밤',narrativeTime:'present',visualDescription:'School roof at night under moonlight',visualDescriptionNative:'달빛 아래 밤의 학교 옥상',wideShot:picture('밤 모습 테스트 이미지','#29344c'),candidates:[]}]}], selectedLocationAppearances:{roof:'default'},generatingLocations:[],worldFailures:{} })

    markStageSeen(pid, 'writer', 1); markStageSeen(pid, 'artist', 1)
    Object.assign(window, { __mvp: {
      state, chat: useGlobalChatStore, project: useProjectStore, artist: useArtistStore, writer:useWriterStore, proposal: createPendingProposal,
      artistSample,
      prepareArtist: (loseSubmitResponse = false) => {
        artistSample.loseSubmitResponse=loseSubmitResponse;artistSample.submissions=[];artistSample.jobs.clear();artistSample.polls.clear()
        useGlobalChatStore.getState().reset()
        useGlobalChatStore.setState({messages:[],loadMessages:async()=>{}})
        useProjectStore.setState({currentStage:'artist',projectTitle:'두 인물 요청 검수 · 외부 응답 대체',writerActive:false,lifecycleStatus:structuredClone(EMPTY_LIFECYCLE_STATUS)})
        Object.assign(state.status,{pipeline_completed:true,current_status:'completed',completed_units:15,total_units:15,progress_percent:100})
        restartWriterStatus(pid)
        useArtistStore.setState({characterAssets:[{characterId:'kyotaro',name:'쿄타로'},{characterId:'komatsu',name:'코마츠'}].map(char=>({...char,entityType:'person',views:{main:null,back:null,sideLeft:null,sideRight:null},viewCandidates:{},appearances:[{appearanceKey:'default',label:'현재',isDefault:true,narrativeTime:'present',appearance:'school uniform',appearanceNative:'교복',sheetUrl:picture(`${char.name} · 검증용 기본 이미지`,'#6b7280'),portraitUrl:null,viewCandidates:{}}]})),generatingViews:[],viewFailures:{},error:null,sceneManifest:null})
        state.requests=[];setPath('/studio/artist');setArtistMode(true)
      },
      finishArtist: (characterId:string, error:string|null = null) => {
        const entry=[...artistSample.jobs.entries()].find(([,job])=>job.characterId===characterId)
        if (!entry) throw new Error('Artist sample has not been submitted')
        const [jobId,job]=entry
        Object.assign(job,{status:error?'failed':'completed',error,resultUrl:error?null:picture(`${characterId==='kyotaro'?'쿄타로':'코마츠'} · 검증용 잠옷 이미지`,'#6b7280')})
        artistSample.polls.get(jobId)?.(Response.json({data:job}));artistSample.polls.delete(jobId)
      },
      prepareRough: () => {
        useProjectStore.setState({currentStage:'writer',projectTitle:'러프 진행 검수 · 47샷',writerActive:false})
        useGlobalChatStore.setState({messages:[{id:'rough-sample',stage:'writer',role:'model',content:'현재 동작 검수 표본입니다. 보드 전체 47샷을 완료·생성 중·대기·실패로 나눠 확인합니다. 실제 유료 생성은 호출하지 않습니다.'}],suggestion:null})
        const scenes = [9,8,30].map((count,i)=>({sceneId:`rough-scene-${i+1}`,sortOrder:i+1,location:'roof',timeOfDay:'day',mood:'calm',narrativeSummary:`검수 장면 ${i+1} · ${count}샷`,originalTextQuote:'',charactersPresent:['kyotaro'],estimatedDurationSeconds:count*5} satisfies Scene))
        const shots = Array.from({length:47},(_,i)=>({shotId:`rough-${i+1}`,sceneId:`rough-scene-${i<9?1:i<17?2:3}`,sortOrder:i+1,shotType:'MS',actionDescription:'학교 옥상에서 쿄타로가 바람을 느끼며 도시를 바라본다.',characters:['kyotaro'],durationSeconds:5,generationMethod:'T2V',dialogueLines:[],camera:{horizontal:0,vertical:0,pan:0,tilt:0,roll:0,zoom:0},lighting:{position:'front',brightness:50,colorTemp:5000}} satisfies Shot))
        useWriterStore.setState({sceneManifest:{scenes,characters:[],locations:[]},shots,error:null,loadProject:async()=>{}})
        Object.assign(state.status,{pipeline_completed:true,current_status:'completed',completed_units:15,total_units:15,progress_percent:100})
        state.requests=[];state.roughSubmissions=[]
        restartWriterStatus(pid);setPath('/studio/writer');setRoughSample('eight');setRoughMode(true)
      },
      setRoughSample,
      prepareDialogue: () => {
        useProjectStore.setState({currentStage:'writer', lifecycleStatus:structuredClone(EMPTY_LIFECYCLE_STATUS)})
        useGlobalChatStore.getState().reset()
        useGlobalChatStore.setState({messages:[{id:'initial-director-request',stage:'writer',role:'user',content:'디렉터로 넘겨주세요'},{id:'language-question',stage:'writer',role:'model',content:'Scene 6은 한국어이고, 나머지는 일본어 대사예요. 언어를 통일할까요?'}],loadMessages:async()=>{}})
        const scenes = Array.from({length:6},(_,i)=>({sceneId:`s${i+1}`,sortOrder:i+1,location:'roof',timeOfDay:'day',mood:'calm',narrativeSummary:`장면 ${i+1}`,originalTextQuote:'',charactersPresent:['kyotaro'],estimatedDurationSeconds:40} satisfies Scene))
        const shots = Array.from({length:47},(_,i)=>({shotId:`shot_${i+1}`,sceneId:`s${Math.floor(i/8)+1}`,sortOrder:i+1,shotType:'MS',actionDescription:'대화',characters:['kyotaro'],durationSeconds:5,generationMethod:'T2V',dialogueLines:[{characterId:'kyotaro',text:i<40?'こんにちは。':'이미 한국어예요.',emotion:'calm',delivery:'soft',durationHint:1}],camera:{horizontal:0,vertical:0,pan:0,tilt:0,roll:0,zoom:0},lighting:{position:'front',brightness:50,colorTemp:5000}} satisfies Shot))
        useWriterStore.setState({sceneManifest:{scenes,characters:[],locations:[]},shots,error:null})
        Object.assign(state.status,{pipeline_completed:true,current_status:'completed',completed_units:15})
        restartWriterStatus(pid)
        state.holdSave=true;state.dialogueRequests=0;state.writes=[];state.navigations.length=0
      },
      setStatus: (patch: Record<string, unknown>) => { Object.assign(state.status, patch); restartWriterStatus(pid) },
      go: (stage: StageId) => { setPath(`/studio/${stage}`);useProjectStore.getState().setStage(stage) },
      badge: () => { state.completions = [{stage:'artist',lane:'artist',at:Date.now(),units:9}]; refreshGenerationQueue() },
      setCompletions: (completions: unknown[]) => { state.completions = completions; refreshGenerationQueue() },
    } })
    queueMicrotask(() => setReady(true))
    return () => { window.fetch = original }
  }, [navigations])
  const navigate = (href: string) => { navigations.push(href);const stage = href.split('/')[2]?.split('?')[0] as StageId; setPath(href);if (['writer','artist','producer','director','editor'].includes(stage)) useProjectStore.getState().setStage(stage) }
  return ready ? <AppRouterContext.Provider value={{...router, push:navigate, prefetch:async()=>{}}}><NavigationPromisesContext.Provider value={null}><PathnameContext.Provider value={path}>
    <Sidebar />
    <main className="ml-24 flex h-screen flex-col p-3">
      <div className="flex min-h-0 flex-1 gap-3"><div className="flex min-w-0 flex-1 rounded-xl border border-border">{path.startsWith('/studio/artist') ? artistMode ? <CharacterPanel columns={2} /> : <WorldPanel /> : roughMode ? <RoughStoryboardView /> : <Central />}</div><div className="flex w-80 shrink-0 flex-col rounded-xl border border-border"><GlobalChat /></div></div>
    </main>
  </PathnameContext.Provider></NavigationPromisesContext.Provider></AppRouterContext.Provider> : <p>로컬 검수 화면 준비 중</p>
}
function Central() { const {status} = useWriterStatus(pid); return <WriterGenerationView projectId={pid} status={status} /> }
