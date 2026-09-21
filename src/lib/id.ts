export function createId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
