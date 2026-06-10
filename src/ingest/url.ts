import { SourceSpec } from './types.js';

const INLINE_CAP = 50 * 1024;

/** Crude but dependency-free HTML → text. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** Fetched locally so both engines get the same context — no LLM-side web tools. */
export async function urlSource(url: string): Promise<SourceSpec> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'user-agent': 'wdijd (local study-deck generator)' },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const raw = await res.text();
  const type = res.headers.get('content-type') ?? '';
  const text = type.includes('html') ? htmlToText(raw) : raw;

  return {
    kind: 'url',
    title: new URL(url).hostname + new URL(url).pathname,
    description: url,
    promptContext: `## Content of ${url}\n${text.slice(0, INLINE_CAP)}${text.length > INLINE_CAP ? '\n…(truncated)' : ''}`,
    needsRepoTools: false,
    needsGitTools: false,
    cwd: process.cwd(),
    projectPath: null,
  };
}
