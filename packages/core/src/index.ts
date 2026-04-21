import { XMLParser } from 'fast-xml-parser'
import type {
  CategoryScore,
  CheckCategory,
  CheckRemediation,
  CheckResult,
  ScanReport,
  ScanTarget,
} from '@isitagentready/shared'

interface CheckContext {
  target: ScanTarget
  homepage: ResponseSnapshot
  robots?: ResponseSnapshot
}

interface ResponseSnapshot {
  url: string
  status: number
  headers: Record<string, string>
  body: string
}

interface CheckDefinition {
  id: string
  title: string
  category: CheckCategory
  goal: string
  run: (context: CheckContext) => Promise<Omit<CheckResult, 'id' | 'title' | 'category' | 'goal' | 'durationMs'>>
}

const parser = new XMLParser({ ignoreAttributes: false })

function normalizeUrl(input: string): ScanTarget {
  const trimmed = input.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  url.pathname = '/'
  url.search = ''
  url.hash = ''

  return {
    input,
    normalizedUrl: url.toString(),
    hostname: url.hostname,
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<ResponseSnapshot> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'isitagentready/0.1 (+https://github.com/PromptMention/isitagentready)',
      ...(init?.headers || {}),
    },
    ...init,
  })

  const body = await response.text()
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  return {
    url: response.url,
    status: response.status,
    headers,
    body,
  }
}

function okResult(summary: string, score = 100, evidence: CheckResult['evidence'] = {}): Omit<CheckResult, 'id' | 'title' | 'category' | 'goal' | 'durationMs'> {
  return { status: 'pass', score, summary, evidence }
}

function failResult(summary: string, remediation: CheckRemediation, evidence: CheckResult['evidence'] = {}): Omit<CheckResult, 'id' | 'title' | 'category' | 'goal' | 'durationMs'> {
  return { status: 'fail', score: 0, summary, remediation, evidence }
}

function infoResult(summary: string, evidence: CheckResult['evidence'] = {}): Omit<CheckResult, 'id' | 'title' | 'category' | 'goal' | 'durationMs'> {
  return { status: 'info', score: 0, summary, evidence }
}

function extractSitemaps(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^sitemap:/i.test(line))
    .map(line => line.replace(/^sitemap:\s*/i, '').trim())
}

function hasAiBotRule(body: string): boolean {
  return /(gptbot|claude-web|anthropic-ai|google-extended|perplexitybot|ccbot|bytespider)/i.test(body)
}

function hasContentSignal(body: string): boolean {
  return /^content-signal:/im.test(body)
}

function hasMarkdownContentType(headers: Record<string, string>): boolean {
  return (headers['content-type'] || '').includes('text/markdown')
}

function hasLinkHeader(headers: Record<string, string>): boolean {
  return Boolean(headers.link)
}

async function checkRobots(context: CheckContext) {
  if (!context.robots) {
    return failResult(
      'robots.txt was not found.',
      {
        howToFix: 'Publish a valid robots.txt file at the site root with crawl rules and a sitemap directive.',
        docs: [{ label: 'RFC 9309', url: 'https://www.rfc-editor.org/rfc/rfc9309' }],
      },
    )
  }

  const isText = (context.robots.headers['content-type'] || '').includes('text/plain')
  const hasUserAgent = /^user-agent:/im.test(context.robots.body)
  if (context.robots.status === 200 && isText && hasUserAgent) {
    return okResult('robots.txt exists and contains valid crawl directives.', 100, {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    })
  }

  return failResult(
    'robots.txt exists but does not look valid for crawler discovery.',
    {
      howToFix: 'Ensure robots.txt is returned as text/plain and includes at least one User-agent directive.',
      docs: [{ label: 'RFC 9309', url: 'https://www.rfc-editor.org/rfc/rfc9309' }],
    },
    {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    },
  )
}

async function checkSitemap(context: CheckContext) {
  if (!context.robots) {
    return failResult(
      'No sitemap could be discovered because robots.txt is missing.',
      {
        howToFix: 'Publish robots.txt with a Sitemap directive or expose a sitemap.xml endpoint.',
        docs: [{ label: 'sitemaps.org', url: 'https://www.sitemaps.org/protocol.html' }],
      },
    )
  }

  const sitemapUrls = extractSitemaps(context.robots.body)
  const fallbackUrl = `${context.target.normalizedUrl}sitemap.xml`
  const candidates = sitemapUrls.length > 0 ? sitemapUrls : [fallbackUrl]

  for (const candidate of candidates) {
    try {
      const snapshot = await fetchText(candidate)
      if (snapshot.status === 200) {
        parser.parse(snapshot.body)
        return okResult('A sitemap was discovered and the XML parsed successfully.', 100, {
          requestUrl: snapshot.url,
          statusCode: snapshot.status,
          responseHeaders: snapshot.headers,
          snippet: snapshot.body.slice(0, 400),
        })
      }
    } catch {
      continue
    }
  }

  return failResult(
    'No valid sitemap could be fetched from the site.',
    {
      howToFix: 'Publish an XML sitemap and reference it from robots.txt using a Sitemap directive.',
      docs: [{ label: 'sitemaps.org', url: 'https://www.sitemaps.org/protocol.html' }],
    },
    {
      notes: candidates,
    },
  )
}

async function checkLinkHeaders(context: CheckContext) {
  if (hasLinkHeader(context.homepage.headers)) {
    return okResult('Homepage response includes Link headers for discovery.', 100, {
      requestUrl: context.homepage.url,
      statusCode: context.homepage.status,
      responseHeaders: context.homepage.headers,
    })
  }

  return failResult(
    'Homepage response does not include Link headers for agent discovery.',
    {
      howToFix: 'Add Link response headers to advertise resources like API catalogs, docs, and service descriptions.',
      example: 'Link: </.well-known/api-catalog>; rel="api-catalog"',
      docs: [
        { label: 'RFC 8288', url: 'https://www.rfc-editor.org/rfc/rfc8288' },
        { label: 'RFC 9727', url: 'https://www.rfc-editor.org/rfc/rfc9727' },
      ],
    },
    {
      requestUrl: context.homepage.url,
      statusCode: context.homepage.status,
      responseHeaders: context.homepage.headers,
    },
  )
}

async function checkMarkdownNegotiation(context: CheckContext) {
  const markdownSnapshot = await fetchText(context.target.normalizedUrl, {
    headers: { Accept: 'text/markdown' },
  })

  if (markdownSnapshot.status === 200 && hasMarkdownContentType(markdownSnapshot.headers)) {
    return okResult('The site responds with markdown when text/markdown is requested.', 100, {
      requestUrl: markdownSnapshot.url,
      statusCode: markdownSnapshot.status,
      responseHeaders: markdownSnapshot.headers,
      snippet: markdownSnapshot.body.slice(0, 400),
    })
  }

  return failResult(
    'The site does not appear to support Markdown for Agents negotiation.',
    {
      howToFix: 'Return a markdown representation of HTML pages when the request Accept header includes text/markdown.',
      docs: [{ label: 'Markdown for Agents', url: 'https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/' }],
    },
    {
      requestUrl: markdownSnapshot.url,
      statusCode: markdownSnapshot.status,
      responseHeaders: markdownSnapshot.headers,
      snippet: markdownSnapshot.body.slice(0, 400),
    },
  )
}

async function checkAiBotRules(context: CheckContext) {
  if (!context.robots) {
    return failResult(
      'AI bot directives cannot be detected without robots.txt.',
      {
        howToFix: 'Publish robots.txt and add User-agent rules for AI bots you want to control.',
        docs: [{ label: 'Cloudflare AI Crawl Control', url: 'https://developers.cloudflare.com/ai-crawl-control/' }],
      },
    )
  }

  if (hasAiBotRule(context.robots.body)) {
    return okResult('robots.txt contains AI-specific user agent rules.', 100, {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    })
  }

  return failResult(
    'No AI-specific user-agent rules were found in robots.txt.',
    {
      howToFix: 'Add directives for crawlers like GPTBot, Claude-Web, and Google-Extended to declare AI access policy explicitly.',
      docs: [{ label: 'Cloudflare AI Crawl Control', url: 'https://developers.cloudflare.com/ai-crawl-control/' }],
    },
    {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    },
  )
}

async function checkContentSignals(context: CheckContext) {
  if (!context.robots) {
    return failResult(
      'Content Signals cannot be detected without robots.txt.',
      {
        howToFix: 'Publish robots.txt and add Content-Signal directives that state AI training and inference preferences.',
        docs: [{ label: 'Content Signals', url: 'https://contentsignals.org/' }],
      },
    )
  }

  if (hasContentSignal(context.robots.body)) {
    return okResult('robots.txt includes Content-Signal directives.', 100, {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    })
  }

  return failResult(
    'No Content-Signal directives were found in robots.txt.',
    {
      howToFix: 'Add Content-Signal rules such as ai-train=no, search=yes, ai-input=yes to declare usage preferences for AI systems.',
      example: 'Content-Signal: ai-train=no, search=yes, ai-input=yes',
      docs: [{ label: 'Content Signals', url: 'https://contentsignals.org/' }],
    },
    {
      requestUrl: context.robots.url,
      statusCode: context.robots.status,
      responseHeaders: context.robots.headers,
      snippet: context.robots.body.slice(0, 400),
    },
  )
}

function checkWellKnown(path: string, title: string, goal: string, docs: { label: string; url: string }[]) {
  return async (context: CheckContext) => {
    const snapshot = await fetchText(`${context.target.normalizedUrl}.well-known/${path}`)
    if (snapshot.status === 200) {
      return okResult(`${title} was discovered at the expected well-known path.`, 100, {
        requestUrl: snapshot.url,
        statusCode: snapshot.status,
        responseHeaders: snapshot.headers,
        snippet: snapshot.body.slice(0, 400),
      })
    }

    return failResult(
      `${title} was not found at the expected well-known path.`,
      {
        howToFix: goal,
        docs,
      },
      {
        requestUrl: snapshot.url,
        statusCode: snapshot.status,
        responseHeaders: snapshot.headers,
        snippet: snapshot.body.slice(0, 400),
      },
    )
  }
}

const checks: CheckDefinition[] = [
  {
    id: 'robots-txt',
    title: 'robots.txt',
    category: 'discoverability',
    goal: 'Publish /robots.txt with valid crawl rules and sitemap discovery.',
    run: checkRobots,
  },
  {
    id: 'sitemap',
    title: 'Sitemap',
    category: 'discoverability',
    goal: 'Publish a valid sitemap and reference it from robots.txt.',
    run: checkSitemap,
  },
  {
    id: 'link-headers',
    title: 'Link Headers',
    category: 'discoverability',
    goal: 'Expose Link headers for agent discovery on the homepage.',
    run: checkLinkHeaders,
  },
  {
    id: 'markdown-negotiation',
    title: 'Markdown Negotiation',
    category: 'content',
    goal: 'Return markdown when agents request text/markdown.',
    run: checkMarkdownNegotiation,
  },
  {
    id: 'ai-bot-rules',
    title: 'AI Bot Rules',
    category: 'bot-access-control',
    goal: 'Declare explicit AI bot policy in robots.txt.',
    run: checkAiBotRules,
  },
  {
    id: 'content-signals',
    title: 'Content Signals',
    category: 'bot-access-control',
    goal: 'Declare AI usage preferences with Content-Signal directives.',
    run: checkContentSignals,
  },
  {
    id: 'api-catalog',
    title: 'API Catalog',
    category: 'protocol-discovery',
    goal: 'Publish /.well-known/api-catalog with linkset metadata for your APIs.',
    run: checkWellKnown('api-catalog', 'API catalog', 'Create /.well-known/api-catalog that returns application/linkset+json with service-desc, service-doc, and status relations.', [
      { label: 'RFC 9727', url: 'https://www.rfc-editor.org/rfc/rfc9727' },
    ]),
  },
  {
    id: 'oauth-authorization-server',
    title: 'OAuth Discovery',
    category: 'protocol-discovery',
    goal: 'Publish OAuth or OpenID discovery metadata for protected APIs.',
    run: async (context) => {
      const openid = await fetchText(`${context.target.normalizedUrl}.well-known/openid-configuration`)
      if (openid.status === 200) {
        return okResult('OpenID discovery metadata is available.', 100, {
          requestUrl: openid.url,
          statusCode: openid.status,
          responseHeaders: openid.headers,
          snippet: openid.body.slice(0, 400),
        })
      }

      return checkWellKnown(
        'oauth-authorization-server',
        'OAuth authorization server metadata',
        'Publish /.well-known/openid-configuration or /.well-known/oauth-authorization-server for agent-friendly auth discovery.',
        [
          { label: 'RFC 8414', url: 'https://www.rfc-editor.org/rfc/rfc8414' },
          { label: 'OpenID Discovery', url: 'https://openid.net/specs/openid-connect-discovery-1_0.html' },
        ],
      )(context)
    },
  },
  {
    id: 'oauth-protected-resource',
    title: 'OAuth Protected Resource',
    category: 'protocol-discovery',
    goal: 'Publish /.well-known/oauth-protected-resource for protected APIs.',
    run: checkWellKnown('oauth-protected-resource', 'OAuth protected resource metadata', 'Publish /.well-known/oauth-protected-resource with authorization_servers and scopes_supported fields.', [
      { label: 'RFC 9728', url: 'https://www.rfc-editor.org/rfc/rfc9728' },
    ]),
  },
  {
    id: 'mcp-server-card',
    title: 'MCP Server Card',
    category: 'protocol-discovery',
    goal: 'Publish an MCP server card so agents can discover your MCP capabilities.',
    run: checkWellKnown('mcp/server-card.json', 'MCP server card', 'Serve /.well-known/mcp/server-card.json describing serverInfo, transport, authentication, and tools.', [
      { label: 'MCP Server Card Draft', url: 'https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127' },
    ]),
  },
  {
    id: 'agent-skills-index',
    title: 'Agent Skills Index',
    category: 'protocol-discovery',
    goal: 'Publish an Agent Skills discovery index.',
    run: checkWellKnown('agent-skills/index.json', 'Agent skills index', 'Serve /.well-known/agent-skills/index.json with the current discovery schema and skill entries.', [
      { label: 'Agent Skills Discovery RFC', url: 'https://github.com/cloudflare/agent-skills-discovery-rfc' },
      { label: 'Agent Skills', url: 'https://agentskills.io/' },
    ]),
  },
]

function emptyCategory(): CategoryScore {
  return { passed: 0, applicable: 0, score: 0 }
}

function summarizeLevel(totalScore: number): string {
  if (totalScore >= 80) return 'Level 4'
  if (totalScore >= 60) return 'Level 3'
  if (totalScore >= 35) return 'Level 2'
  return 'Level 1'
}

export async function scanSite(input: string): Promise<ScanReport> {
  const target = normalizeUrl(input)
  const homepage = await fetchText(target.normalizedUrl)

  let robots: ResponseSnapshot | undefined
  try {
    const robotsUrl = new URL('/robots.txt', target.normalizedUrl).toString()
    const snapshot = await fetchText(robotsUrl)
    if (snapshot.status !== 404) {
      robots = snapshot
    }
  } catch {
    robots = undefined
  }

  const context: CheckContext = { target, homepage, robots }
  const results: CheckResult[] = []

  for (const definition of checks) {
    const startedAt = Date.now()
    const result = await definition.run(context)
    results.push({
      id: definition.id,
      title: definition.title,
      category: definition.category,
      goal: definition.goal,
      durationMs: Date.now() - startedAt,
      ...result,
    })
  }

  const categoryScores: Record<CheckCategory, CategoryScore> = {
    discoverability: emptyCategory(),
    content: emptyCategory(),
    'bot-access-control': emptyCategory(),
    'protocol-discovery': emptyCategory(),
    commerce: emptyCategory(),
  }

  for (const result of results) {
    const bucket = categoryScores[result.category]
    if (result.status === 'not_applicable') {
      continue
    }
    bucket.applicable += 1
    if (result.status === 'pass') {
      bucket.passed += 1
    }
  }

  for (const value of Object.values(categoryScores)) {
    value.score = value.applicable === 0 ? 0 : Math.round((value.passed / value.applicable) * 100)
  }

  const weightedTotal = Math.round(
    (categoryScores.discoverability.score * 0.3)
      + (categoryScores.content.score * 0.2)
      + (categoryScores['bot-access-control'].score * 0.2)
      + (categoryScores['protocol-discovery'].score * 0.3),
  )

  return {
    target,
    scannedAt: new Date().toISOString(),
    totalScore: weightedTotal,
    level: summarizeLevel(weightedTotal),
    categoryScores,
    checks: results,
  }
}
