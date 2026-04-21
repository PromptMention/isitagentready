export type CheckCategory =
  | 'discoverability'
  | 'content'
  | 'bot-access-control'
  | 'protocol-discovery'
  | 'commerce'

export type CheckStatus = 'pass' | 'fail' | 'info' | 'not_applicable'

export interface RemediationDoc {
  label: string
  url: string
}

export interface CheckEvidence {
  requestUrl?: string
  statusCode?: number
  responseHeaders?: Record<string, string>
  snippet?: string
  notes?: string[]
}

export interface CheckRemediation {
  howToFix: string
  example?: string
  docs: RemediationDoc[]
}

export interface CheckResult {
  id: string
  title: string
  category: CheckCategory
  status: CheckStatus
  score: number
  goal: string
  summary: string
  evidence: CheckEvidence
  remediation?: CheckRemediation
  durationMs: number
}

export interface CategoryScore {
  passed: number
  applicable: number
  score: number
}

export interface ScanTarget {
  input: string
  normalizedUrl: string
  hostname: string
}

export interface ScanReport {
  target: ScanTarget
  scannedAt: string
  totalScore: number
  level: string
  categoryScores: Record<CheckCategory, CategoryScore>
  checks: CheckResult[]
}
