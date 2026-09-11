// 조회한 대상만 수정하고, 승인과 실제 저장 결과를 확인해 완료·실패를 알린다
import { describe, expect, it, vi } from 'vitest'
import { createChatToolExecutor } from '@/lib/chat-tools/executor'

type ResourceRecord = { id: string; values: Record<string, unknown> }
type ReadRecord = ResourceRecord & { revision: string }

function fixture() {
  const state = {
    current: true,
    records: [
      { id: 'person-1', values: { name: '옥화', appearance: '검은 머리', details: { age: 20 } } },
      { id: 'person-2', values: { name: '하늘', appearance: '갈색 머리' } },
    ] as ResourceRecord[],
  }
  const read = vi.fn(async () => structuredClone(state.records))
  const validate = vi.fn((patch: unknown) => patch as Record<string, unknown>)
  const write = vi.fn<(id: string, patch: Record<string, unknown>, before: Record<string, unknown>) => Promise<{ status: string }>>(async (id, patch) => {
    state.records = state.records.map(record => record.id === id
      ? { ...record, values: { ...record.values, ...patch } }
      : record)
    return { status: 'ok' }
  })
  const controller = new AbortController()
  const executor = createChatToolExecutor({
    resources: { characters: { read, validate, write } },
    isCurrent: () => state.current,
    signal: controller.signal,
  })
  const execute = (call: { id: string; name: string; input: Record<string, unknown> }) =>
    executor({ type: 'tool_use', ...call })
  return { state, read, validate, write, controller, execute }
}

async function readRevision(f: ReturnType<typeof fixture>, requestId = 'read-before-edit') {
  const result = await f.execute({ id: requestId, name: 'read_project', input: { resource: 'characters', id: 'person-1' } })
  expect(result).toMatchObject({ status: 'ok' })
  const record = (result.records as ReadRecord[]).find(item => item.id === 'person-1')
  expect(record).toBeDefined()
  return record!.revision
}

function editInput(revision: string) {
  return { resource: 'characters', id: 'person-1', revision, patch: { appearance: '붉은 머리' } }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('채팅에서 조회한 내용의 변경과 저장 확인', () => {
  it('조회하면 저장된 값과 변경 확인값을 함께 반환한다', async () => {
    // 왜: 모델이 이전 대화의 기억 대신 현재 저장된 대상과 값을 확인해야 한다.
    const f = fixture()
    const all = await f.execute({ id: 'read-all', name: 'read_project', input: { resource: 'characters' } })
    expect(all).toMatchObject({
      status: 'ok', records: f.state.records.map(record => ({ ...record, revision: expect.any(String) })),
    })
    const selected = await f.execute({ id: 'read-one', name: 'read_project', input: { resource: 'characters', id: 'person-1' } })
    expect(selected).toMatchObject({ status: 'ok' })
    expect(selected.records).toHaveLength(1)
    expect((selected.records as ReadRecord[])[0]).toMatchObject({ id: 'person-1', values: f.state.records[0].values })
    expect(f.write).not.toHaveBeenCalled()
  })

  it('조회 전이거나 조회한 값이 바뀌면 변경을 저장하지 않는다', async () => {
    // 왜: 조회 없이 수정하거나 다른 편집이 끼어든 뒤 옛 내용을 덮어쓰면 안 된다.
    for (const scenario of ['조회 전', '확인값 불일치', '저장값 변경']) {
      const f = fixture()
      let revision = 'not-read'
      if (scenario !== '조회 전') revision = await readRevision(f)
      if (scenario === '확인값 불일치') revision = `${revision}-wrong`
      if (scenario === '저장값 변경') f.state.records[0].values.details = { age: 21 }

      const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

      expect(result, scenario).toMatchObject({ status: 'stale_state' })
      expect(f.write, scenario).not.toHaveBeenCalled()
    }
  })

  it('잘못된 수정값은 저장하지 않는다', async () => {
    // 왜: 대상과 조회 시점이 맞아도 도메인이 허용하지 않는 입력은 적용하면 안 된다.
    const f = fixture()
    const revision = await readRevision(f)
    f.validate.mockImplementation(() => { throw new Error('외형 설명을 입력해 주세요') })

    const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

    expect(result).toMatchObject({ status: 'invalid_input' })
    expect(f.write).not.toHaveBeenCalled()
  })

  it('지원하지 않는 요청은 아무것도 변경하지 않는다', async () => {
    // 왜: 모델이 알 수 없는 대상 종류나 실행 이름을 보내도 쓰기 경로로 흘려보내지 않는다.
    for (const call of [
      { id: 'unknown-read-resource', name: 'read_project', input: { resource: 'missing' } },
      { id: 'unknown-edit-resource', name: 'edit_project', input: { ...editInput('unknown'), resource: 'missing' } },
      { id: 'unknown-tool', name: 'delete_everything', input: editInput('unknown') },
    ]) {
      const f = fixture()
      expect(await f.execute(call)).toMatchObject({ status: 'unsupported' })
      expect(f.read).not.toHaveBeenCalled()
      expect(f.write).not.toHaveBeenCalled()
    }
  })

  it('승인이 필요한 변경은 승인 대기로 남긴다', async () => {
    // 왜: 도메인이 승인을 요구하면 조회 재시도나 자동 승인으로 진행하지 않는다.
    const f = fixture()
    const revision = await readRevision(f)
    const approval = { status: 'approval_required', message: '기본 외형을 바꿀까요?', proposalId: 'proposal-1' }
    f.write.mockResolvedValueOnce(approval)

    const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

    expect(result).toEqual(approval)
    expect(f.read).toHaveBeenCalledTimes(2) // 최초 조회와 수정 직전 확인뿐이다.
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(f.state.records[0].values.appearance).toBe('검은 머리')
  })

  it('저장 후 요청한 값이 확인된 경우에만 완료라고 알린다', async () => {
    // 왜: 저장 요청의 성공 응답만으로 실제 저장됐다고 알리면 안 된다.
    for (const persisted of [true, false]) {
      const f = fixture()
      const revision = await readRevision(f)
      const before = structuredClone(f.state.records[0].values)
      if (!persisted) f.write.mockResolvedValueOnce({ status: 'ok' })

      const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

      expect(result).toMatchObject({ status: persisted ? 'ok' : 'unverified' })
      expect(f.write).toHaveBeenCalledExactlyOnceWith('person-1', { appearance: '붉은 머리' }, before)
      expect(f.read).toHaveBeenCalledTimes(3)
    }
  })

  it('저장 응답이 끊겨도 값이 확인되면 다시 저장하지 않고 완료를 알린다', async () => {
    // 왜: 저장은 끝났지만 응답만 유실됐을 때 중복 실행을 막는다.
    const f = fixture()
    const revision = await readRevision(f)
    f.write.mockImplementationOnce(async (id, patch) => {
      f.state.records = f.state.records.map(record => record.id === id
        ? { ...record, values: { ...record.values, ...patch } }
        : record)
      throw new Error('응답 연결 끊김')
    })

    const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

    expect(result).toMatchObject({ status: 'ok', recovered: true })
    expect(f.write).toHaveBeenCalledTimes(1)
    expect(f.read).toHaveBeenCalledTimes(3)
  })

  it('저장 결과를 확인하지 못하면 완료라고 알리거나 다시 저장하지 않는다', async () => {
    // 왜: 응답 유실 뒤 값이 다르거나 재조회까지 실패한 경우 실제 저장 여부를 단정할 수 없다.
    for (const readFails of [false, true]) {
      const f = fixture()
      const revision = await readRevision(f)
      f.write.mockImplementationOnce(async () => {
        if (readFails) f.read.mockRejectedValueOnce(new Error('재조회 연결 끊김'))
        throw new Error('저장 연결 끊김')
      })

      const result = await f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })

      expect(result).toMatchObject({ status: 'unknown_result' })
      expect(f.write).toHaveBeenCalledTimes(1)
      expect(f.read).toHaveBeenCalledTimes(3)
    }
  })

  it('결과가 불확실했던 변경도 이미 저장된 값이면 다시 저장하지 않는다', async () => {
    // 왜: 저장 응답과 재조회가 모두 끊긴 뒤 모델이 같은 변경을 다시 요청해도 중복 저장하지 않는다.
    const f = fixture()
    const revision = await readRevision(f)
    f.write.mockImplementationOnce(async (id, patch) => {
      f.state.records = f.state.records.map(record => record.id === id
        ? { ...record, values: { ...record.values, ...patch } }
        : record)
      f.read.mockRejectedValueOnce(new Error('재조회 연결 끊김'))
      throw new Error('저장 응답 연결 끊김')
    })
    expect(await f.execute({ id: 'first-edit', name: 'edit_project', input: editInput(revision) }))
      .toMatchObject({ status: 'unknown_result' })

    const latestRevision = await readRevision(f, 'read-after-unknown-result')
    const result = await f.execute({ id: 'repeated-edit', name: 'edit_project', input: editInput(latestRevision) })

    expect(result).toMatchObject({ status: 'ok' })
    expect(f.write).toHaveBeenCalledTimes(1)
  })

  it('프로젝트가 바뀌거나 요청을 중단하면 이후 처리를 멈춘다', async () => {
    // 왜: 조회·저장을 기다리는 동안 떠난 프로젝트의 결과를 새 대화에 적용하면 안 된다.
    for (const phase of ['조회', '저장']) {
      for (const interruption of ['프로젝트 이동', '요청 중단']) {
        const f = fixture()
        const revision = await readRevision(f)
        const entered = deferred()
        const release = deferred()
        if (phase === '조회') {
          f.read.mockImplementationOnce(async () => {
            entered.resolve()
            await release.promise
            return structuredClone(f.state.records)
          })
        } else {
          f.write.mockImplementationOnce(async () => {
            entered.resolve()
            await release.promise
            return { status: 'ok' }
          })
        }

        const pending = f.execute({ id: 'edit', name: 'edit_project', input: editInput(revision) })
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        await entered.promise
        if (interruption === '프로젝트 이동') f.state.current = false
        else f.controller.abort()
        release.resolve()

        await rejected
        expect(f.write).toHaveBeenCalledTimes(phase === '조회' ? 0 : 1)
        expect(f.read).toHaveBeenCalledTimes(2) // 중단 뒤 저장 확인을 추가로 시작하지 않는다.
      }
    }
  })
})
