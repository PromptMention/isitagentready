import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { CategoryScore, CheckResult, RemediationDoc, ScanReport } from '@isitagentready/shared'
import { runScan } from '../lib/api'

function statusColor(status: string) {
  if (status === 'pass') return '#3ddc97'
  if (status === 'fail') return '#ff6b6b'
  return '#9aa7cf'
}

export default function ScanForm() {
  const [url, setUrl] = useState('promptmention.com')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<ScanReport | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const next = await runScan(url)
      setReport(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <form className="card" style={{ padding: 24 }} onSubmit={onSubmit}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label htmlFor="url" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Website URL</label>
            <input id="url" value={url} onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)} placeholder="example.com" required />
          </div>
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Scanning...' : 'Scan site'}
          </button>
          {error ? <div style={{ color: '#ff8f8f' }}>{error}</div> : null}
        </div>
      </form>

      {report ? (
        <div className="grid" style={{ gap: 24 }}>
          <section className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="muted">Results for</div>
                <h2 style={{ margin: '8px 0 4px', fontSize: 32 }}>{report.target.hostname}</h2>
                <div className="muted">Scanned {new Date(report.scannedAt).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted">Agent readiness score</div>
                <div style={{ fontSize: 48, fontWeight: 800 }}>{report.totalScore}</div>
                <div>{report.level}</div>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 24 }}>
              {Object.entries(report.categoryScores).map(([name, value]) => {
                const category = value as CategoryScore
                return (
                  <div key={name} className="card" style={{ padding: 18, borderRadius: 18 }}>
                    <div className="muted" style={{ textTransform: 'capitalize' }}>{name.replace(/-/g, ' ')}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{category.score}</div>
                    <div className="muted">{category.passed}/{category.applicable} passed</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="grid" style={{ gap: 16 }}>
            {report.checks.map((check: CheckResult) => (
              <article key={check.id} className="card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
                  <div>
                    <div className="muted" style={{ textTransform: 'capitalize' }}>{check.category.replace(/-/g, ' ')}</div>
                    <h3 style={{ margin: '6px 0 8px' }}>{check.title}</h3>
                    <p className="muted" style={{ marginTop: 0 }}>{check.goal}</p>
                  </div>
                  <div style={{ color: statusColor(check.status), fontWeight: 700, textTransform: 'uppercase' }}>{check.status}</div>
                </div>
                <p>{check.summary}</p>
                {check.evidence.requestUrl ? (
                  <div className="muted" style={{ fontSize: 14 }}>Checked: {check.evidence.requestUrl}</div>
                ) : null}
                {check.evidence.snippet ? <pre>{check.evidence.snippet}</pre> : null}
                {check.remediation ? (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ marginBottom: 8 }}>How to fix</h4>
                    <p className="muted">{check.remediation.howToFix}</p>
                    {check.remediation.example ? <pre>{check.remediation.example}</pre> : null}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {check.remediation.docs.map((doc: RemediationDoc) => (
                        <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer" className="pill">{doc.label}</a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  )
}
