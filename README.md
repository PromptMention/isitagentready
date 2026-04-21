# Is It Agent Ready?

An open-source agent readiness scanner for websites, built for teams that want to support AI agents better.

It checks whether a site supports emerging AI agent standards like:

- `robots.txt`
- sitemap discovery
- homepage `Link` headers
- Markdown for Agents negotiation
- AI bot rules in `robots.txt`
- `Content-Signal` directives
- `/.well-known/api-catalog`
- OAuth discovery metadata
- OAuth protected resource metadata
- MCP server cards
- Agent Skills discovery

Built and maintained by [PromptMention](https://promptmention.com).

PromptMention helps brands monitor and improve AI visibility across emerging search and agent-driven discovery surfaces.

## Stack

- Astro for the public web app
- Hono on Cloudflare Workers for the scan API
- TypeScript shared packages for checks and scoring

## Monorepo layout

```text
apps/
  api/   Cloudflare Worker API
  web/   Astro frontend
packages/
  core/    scan engine and checks
  shared/  shared types
```

## Local development

Install dependencies:

```bash
pnpm install
```

Run the API:

```bash
pnpm dev:api
```

Run the web app:

```bash
pnpm dev:web
```

By default the web app expects the API at `http://127.0.0.1:8787`.

## Build

```bash
pnpm build
```

## Release notes

V1 includes the HTTP-based checks needed to ship a practical agent-readiness scanner. Browser-only checks like WebMCP detection can be added later with Cloudflare Browser Run and Queues.
