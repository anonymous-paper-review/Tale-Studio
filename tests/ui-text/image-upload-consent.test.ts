// 이미지 사용 동의는 매번 직접 체크해야 하며 취소하거나 화면을 떠나면 파일을 보내지 않는다.
import { beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const hooks = vi.hoisted(() => ({
  lane: 'request', cursor: 0, slots: {} as Record<string, unknown[]>,
  cleanups: [] as Array<() => void>,
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const slots = hooks.slots[hooks.lane] ??= []
    const slot = hooks.cursor++
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial
    return [slots[slot], (value: unknown) => {
      slots[slot] = typeof value === 'function' ? value(slots[slot]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const slots = hooks.slots[hooks.lane] ??= []
    const slot = hooks.cursor++
    if (!(slot in slots)) slots[slot] = { current: initial }
    return slots[slot]
  },
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect()
    if (cleanup) hooks.cleanups.push(cleanup)
  },
}))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))

import { ImageUploadConsentDialog, useImageUploadConsent } from '@/components/upload/image-upload-consent'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  return isValidElement<Record<string, unknown>>(node)
    ? [node, ...elements(node.props.children as ReactNode)] : []
}
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return typeof node === 'string' ? node : ''
}
function renderRequest(scope = 'project-1') {
  hooks.lane = 'request'; hooks.cursor = 0
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Deterministic hook harness, no mounted React tree.
  return useImageUploadConsent(scope)
}
function renderDialog() {
  const element = renderRequest().imageUploadConsentDialog!
  expect(element).not.toBeNull()
  hooks.lane = `dialog-${element.key}`; hooks.cursor = 0
  return elements(ImageUploadConsentDialog(element.props))
}
function uploadButton(nodes: Element[]) {
  return nodes.find(node => node.type === Button && textOf(node) === 'Upload')!
}
function checkConsent(nodes: Element[], checked: boolean) {
  const checkbox = nodes.find(node => node.type === 'input' && node.props.type === 'checkbox')!
  ;(checkbox.props.onChange as (event: unknown) => void)({ target: { checked } })
}
const file = () => new File(['image'], 'portrait.png', { type: 'image/png' })

beforeEach(() => { hooks.slots = {}; hooks.cleanups = []; hooks.cursor = 0 })

it('동의창에서 키를 누르면 뒤쪽 편집 화면의 단축키로 전달하지 않고 버튼 기본 동작을 유지한다', () => {
  void renderRequest().requestImageUploadConsent([file()])
  const content = renderDialog().find(node => node.type === DialogContent)!
  const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() }
  ;(content.props.onKeyDown as (event: unknown) => void)?.(event)
  expect(event.stopPropagation).toHaveBeenCalledOnce()
  expect(event.preventDefault).not.toHaveBeenCalled()
})

it('이미지를 올리려 하면 지정한 동의 문구와 해제된 체크박스를 보여주고 전송을 기다린다', async () => {
  const send = vi.fn()
  const decision = renderRequest().requestImageUploadConsent([file()]).then(send)
  const nodes = renderDialog()
  expect(nodes.some(node => textOf(node).includes('I have the right to use this image, and if it shows an identifiable person, I have their consent to use it here.'))).toBe(true)
  expect(nodes.find(node => node.type === 'input')?.props.checked).toBe(false)
  expect(uploadButton(nodes).props.disabled).toBe(true)
  ;(uploadButton(nodes).props.onClick as () => void)()
  await Promise.resolve()
  expect(send).not.toHaveBeenCalled()
  const cancel = nodes.find(node => node.type === Button && textOf(node) === 'Cancel')!
  ;(cancel.props.onClick as () => void)()
  await decision
  expect(send).toHaveBeenCalledWith(false)
})

it('동의를 직접 체크하고 업로드를 누르면 선택한 이미지 전송을 한 번 허용한다', async () => {
  const send = vi.fn()
  const decision = renderRequest().requestImageUploadConsent([file()]).then(send)
  checkConsent(renderDialog(), true)
  const button = uploadButton(renderDialog())
  expect(button.props.disabled).toBe(false)
  expect(send).not.toHaveBeenCalled()
  ;(button.props.onClick as () => void)()
  ;(button.props.onClick as () => void)()
  await decision
  expect(send).toHaveBeenCalledExactlyOnceWith(true)
  expect(renderRequest().imageUploadConsentDialog).toBeNull()
})

it('동의 체크를 다시 해제하면 업로드를 허용하지 않는다', async () => {
  const send = vi.fn()
  void renderRequest().requestImageUploadConsent([file()]).then(send)
  checkConsent(renderDialog(), true)
  checkConsent(renderDialog(), false)
  const button = uploadButton(renderDialog())
  expect(button.props.disabled).toBe(true)
  ;(button.props.onClick as () => void)()
  await Promise.resolve()
  expect(send).not.toHaveBeenCalled()
})

it('동의창을 닫으면 선택한 이미지를 전송하지 않는다', async () => {
  const decision = renderRequest().requestImageUploadConsent([file()])
  checkConsent(renderDialog(), true)
  const dialog = renderDialog().find(node => node.type === Dialog)!
  ;(dialog.props.onOpenChange as (open: boolean) => void)(false)
  expect(await decision).toBe(false)
})

it('다음 이미지를 올리려 하면 이전 동의를 기억하지 않고 다시 체크를 요구한다', async () => {
  const first = renderRequest().requestImageUploadConsent([file()])
  checkConsent(renderDialog(), true)
  ;(uploadButton(renderDialog()).props.onClick as () => void)()
  expect(await first).toBe(true)
  void renderRequest().requestImageUploadConsent([file()])
  expect(renderDialog().find(node => node.type === 'input')?.props.checked).toBe(false)
  expect(uploadButton(renderDialog()).props.disabled).toBe(true)
})

it('동의 중 다른 이미지를 선택하면 이전 선택은 취소하고 새 선택의 동의를 받는다', async () => {
  const first = renderRequest().requestImageUploadConsent([file()])
  checkConsent(renderDialog(), true)
  void renderRequest().requestImageUploadConsent([new File(['image'], 'second.png')])
  expect(await first).toBe(false)
  const nodes = renderDialog()
  expect(nodes.some(node => textOf(node).includes('second.png'))).toBe(true)
  expect(uploadButton(nodes).props.disabled).toBe(true)
})

it('동의 중 화면을 떠나면 선택한 이미지를 전송하지 않는다', async () => {
  const decision = renderRequest().requestImageUploadConsent([file()])
  hooks.cleanups[0]()
  expect(await decision).toBe(false)
  expect(renderRequest('project-2').imageUploadConsentDialog).toBeNull()
})

it('동의 중 다른 화면으로 갔다가 돌아오면 취소된 동의창을 다시 열지 않는다', async () => {
  const decision = renderRequest().requestImageUploadConsent([file()])
  hooks.cleanups[0]()
  renderRequest('project-2')
  expect(await decision).toBe(false)
  expect(renderRequest('project-1').imageUploadConsentDialog).toBeNull()
})
