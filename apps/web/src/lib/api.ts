import type { ScanReport } from '@isitagentready/shared'

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://127.0.0.1:8787'

export async function runScan(url: string): Promise<ScanReport> {
  const response = await fetch(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    throw new Error(`Failed to scan site: ${response.status}`)
  }

  return response.json()
}
