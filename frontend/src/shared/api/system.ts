export interface SystemInfo {
  name: string
  version: string
}

export async function getSystemInfo(signal?: AbortSignal): Promise<SystemInfo> {
  const response = await fetch('/api/v1/system/info', {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`System request failed: ${response.status}`)
  }

  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    !('name' in data) ||
    typeof data.name !== 'string' ||
    !('version' in data) ||
    typeof data.version !== 'string'
  ) {
    throw new Error('Unexpected system response')
  }

  return { name: data.name, version: data.version }
}
