// Director 이동은 저장된 준비 상태를 확인하고 실제 화면이 열린 뒤에만 완료로 알린다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence',()=>({saveChatMessage:vi.fn(),saveChatTrace:vi.fn(),saveChatTracePatch:vi.fn(),loadLatestChatTrace:vi.fn()}))
import {useGlobalChatStore} from '@/stores/global-chat-store'
import {useProjectStore} from '@/stores/project-store'

const ready={ready:true,blockers:[],warnings:[],counts:{scenes:6,shots:61},path:'/studio/director'}
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(()=>{useGlobalChatStore.getState().reset();useProjectStore.setState({projectId:'handoff-test',currentStage:'writer',reachedStage:'writer',projectLocale:'ko',projectLocaleLocked:true});fetchMock=vi.fn(async()=>Response.json(ready));vi.stubGlobal('fetch',fetchMock)})
afterEach(()=>{useGlobalChatStore.getState().reset();vi.unstubAllGlobals()})
const text=()=>useGlobalChatStore.getState().messages.map(m=>m.content).join('\n')

it('Director 이동 요청은 모델의 답변을 기다리지 않고 저장된 조건을 확인해 화면 이동을 요청한다.',async()=>{
 await useGlobalChatStore.getState().sendMessage('디렉터로 넘겨줘')
 expect(fetchMock.mock.calls.map(c=>c[0])).toEqual(['/api/project/handoff-test/handoff'])
 expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe('move')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
 expect(useProjectStore.getState().canNavigateTo('director')).toBe(true)
 expect(text()).not.toContain('⇄')
 expect(useProjectStore.getState().currentStage).toBe('writer')
})
it('실제 Director 화면이 열렸음을 확인하면 이동 완료를 한 번만 알린다.',async()=>{
 await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
 useGlobalChatStore.getState().confirmDirectorHandoff('handoff-test','/studio/writer')
 expect(text()).not.toContain('⇄')
 useGlobalChatStore.getState().confirmDirectorHandoff('handoff-test','/studio/director')
 useGlobalChatStore.getState().confirmDirectorHandoff('handoff-test','/studio/director')
 expect(text().match(/⇄/g)).toHaveLength(1)
 expect(text()).toContain('Director 화면을 열었어요')
})
it('이동 조건이 부족하면 이유와 필요한 작업을 알리고 이동하지 않는다.',async()=>{
 fetchMock.mockResolvedValue(Response.json({ready:false,blockers:[{code:'missing_image',label:'코마츠: 기본 이미지 필요',action:'Artist에서 코마츠 이미지를 준비해 주세요.',stage:'artist'}],counts:{scenes:6,shots:61},warnings:[]},{status:409}))
 await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
 expect(text()).toContain('코마츠')
 expect(text()).toContain('Artist에서')
 expect(text()).not.toContain('⇄')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
 expect(useProjectStore.getState().reachedStage).toBe('writer')
})
it('이동 가능한지 확인한 뒤 넘겨 달라고 하면 사용자 목적지인 Director로 실행한다.',async()=>{
 await useGlobalChatStore.getState().sendMessage('디렉터러 넘길수잇어?')
 expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe('check')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
 expect(text()).toContain('61')
 await useGlobalChatStore.getState().sendMessage('넘겨줘')
 expect(JSON.parse(fetchMock.mock.calls[1][1].body).action).toBe('move')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
})
it('다 되면 넘겨 달라는 요청은 생성 중에도 유지하고 조건이 갖춰지면 한 번 이동한다.',async()=>{
 fetchMock.mockResolvedValueOnce(Response.json({ready:false,blockers:[{code:'writer_active',label:'씬과 샷을 만들고 있어요.',action:'작업 완료를 기다려주세요.',stage:'writer'}],counts:{scenes:6,shots:0},warnings:[]},{status:409}))
 useGlobalChatStore.setState({messages:[{id:'target',role:'user',stage:'writer',content:'Director로 넘겨줘'}]})
 await useGlobalChatStore.getState().sendMessage('다되면 넘겨줘')
 expect(useGlobalChatStore.getState().directorHandoff?.phase).toBe('waiting')
 await useGlobalChatStore.getState().resumeDirectorHandoff()
 expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
 await useGlobalChatStore.getState().resumeDirectorHandoff()
 expect(fetchMock).toHaveBeenCalledTimes(2)
})
it('자동 이동 대기를 취소하면 뒤늦게 준비되어도 이동하지 않는다.',async()=>{
 fetchMock.mockResolvedValue(Response.json({ready:false,blockers:[{code:'writer_active',label:'작성 중',action:'기다려주세요',stage:'writer'}],counts:{scenes:1,shots:0},warnings:[]},{status:409}))
 useGlobalChatStore.setState({messages:[{id:'target',role:'user',stage:'writer',content:'Director로 넘겨줘'}]})
 await useGlobalChatStore.getState().sendMessage('다되면 넘겨줘')
 await useGlobalChatStore.getState().sendMessage('취소해줘')
 await useGlobalChatStore.getState().resumeDirectorHandoff()
 expect(fetchMock).toHaveBeenCalledTimes(1)
 expect(useGlobalChatStore.getState().directorHandoff).toBeNull()
})
it('이동 저장 권한이 거절되면 성공이라고 말하지 않고 다시 로그인할 필요를 알린다.',async()=>{
 fetchMock.mockResolvedValue(Response.json({error:'Unauthorized'},{status:401}))
 await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
 expect(text()).toContain('로그인')
 expect(text()).not.toContain('⇄')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
 expect(useGlobalChatStore.getState().loading).toBe(false)
})
it('프로젝트를 바꾼 뒤 도착한 이동 응답은 새 프로젝트를 이동시키지 않는다.',async()=>{
 let resolve!:(r:Response)=>void;fetchMock.mockImplementation(()=>new Promise(r=>{resolve=r}))
 const pending=useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
 useGlobalChatStore.getState().reset();useProjectStore.setState({projectId:'other-project',currentStage:'writer',reachedStage:'writer'})
 resolve(Response.json(ready));await pending
 expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
 expect(useProjectStore.getState().reachedStage).toBe('writer')
 expect(text()).toBe('')
})
it('이동 요청 뒤 화면이 열리지 않으면 완료 대신 이동 실패와 재시도 방법을 남긴다.',async()=>{
 await useGlobalChatStore.getState().sendMessage('Director로 넘겨줘')
 useGlobalChatStore.getState().failDirectorHandoff()
 expect(text()).toContain('화면을 열지 못했어요')
 expect(text()).not.toContain('⇄')
 expect(useGlobalChatStore.getState().directorHandoff).toBeNull()
})

it('자동 이동을 기다리며 상태만 물어봐도 기존 완료 후 이동 요청은 유지한다.',async()=>{
 const blocked={ready:false,blockers:[{code:'writer:confirmation',label:'씬 초안 확인 필요',action:'Writer에서 확인해 주세요.',stage:'writer'}],counts:{scenes:1,shots:0},warnings:[]}
 fetchMock.mockImplementation(async()=>Response.json(blocked,{status:409}))
 await useGlobalChatStore.getState().sendMessage('다 되면 Director로 넘겨줘')
 await useGlobalChatStore.getState().sendMessage('왜 Director로 못 넘어가?')
 expect(useGlobalChatStore.getState().directorHandoff?.phase).toBe('waiting')
 fetchMock.mockImplementation(async()=>Response.json(ready))
 await useGlobalChatStore.getState().sendMessage('Director로 갈 수 있어?')
 expect(useGlobalChatStore.getState().pendingNavigatePath).toBeNull()
 expect(useGlobalChatStore.getState().directorHandoff?.phase).toBe('waiting')
 await useGlobalChatStore.getState().resumeDirectorHandoff()
 expect(useGlobalChatStore.getState().pendingNavigatePath).toContain('/studio/director')
})
