// localStorage shim for Zustand persist middleware in node environment.

const memory = new Map<string, string>()

const localStorageShim = {
  getItem(key: string) {
    return memory.get(key) ?? null
  },
  setItem(key: string, value: string) {
    memory.set(key, value)
  },
  removeItem(key: string) {
    memory.delete(key)
  },
  clear() {
    memory.clear()
  },
  key(index: number) {
    return Array.from(memory.keys())[index] ?? null
  },
  get length() {
    return memory.size
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  writable: true,
  configurable: true,
})
