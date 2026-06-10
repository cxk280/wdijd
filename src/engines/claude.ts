import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { Engine, EngineError, EngineRunOpts } from './types.js';

const IMAGE_MEDIA: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const AUTH_HINT = 'run `claude` once to log in';

async function fileBlock(path: string): Promise<Record<string, unknown>> {
  const data = (await readFile(path)).toString('base64');
  const ext = extname(path).toLowerCase();
  if (ext === '.pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    };
  }
  const media = IMAGE_MEDIA[ext];
  if (!media) throw new EngineError(`unsupported attachment type: ${path}`);
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
}

/** Streaming-input prompt: one user message carrying attachments + instructions. */
async function* attachmentPrompt(
  instructions: string,
  paths: string[],
): AsyncGenerator<SDKUserMessage> {
  const blocks: Record<string, unknown>[] = [];
  for (const p of paths) blocks.push(await fileBlock(p));
  blocks.push({ type: 'text', text: instructions });
  yield {
    type: 'user',
    message: { role: 'user', content: blocks },
    parent_tool_use_id: null,
    session_id: '',
  } as unknown as SDKUserMessage;
}

export function claudeEngine(): Engine {
  return {
    name: 'claude',
    supportsPdf: true,

    async runStructured(opts: EngineRunOpts) {
      const allowedTools: string[] = [];
      if (opts.needsRepoTools) allowedTools.push('Read', 'Grep', 'Glob');
      if (opts.needsGitTools)
        allowedTools.push('Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)');

      const attachments = [...(opts.images ?? []), ...(opts.pdfs ?? [])];
      const prompt =
        attachments.length > 0
          ? attachmentPrompt(opts.instructions, attachments)
          : opts.instructions;

      const q = query({
        prompt,
        options: {
          cwd: opts.cwd,
          allowedTools,
          disallowedTools: opts.needsRepoTools || opts.needsGitTools ? undefined : ['*'],
          permissionMode: 'bypassPermissions', // tool surface above is read-only
          maxTurns: opts.maxTurns ?? 25,
          maxBudgetUsd: 1.5,
          model: opts.fast ? 'haiku' : undefined,
          outputFormat: { type: 'json_schema', schema: opts.schema as Record<string, unknown> },
        },
      });

      try {
        for await (const msg of q) {
          if (msg.type === 'assistant') {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                const input = block.input as Record<string, unknown>;
                const target = input.file_path ?? input.pattern ?? input.command ?? '';
                opts.onProgress?.(`${block.name.toLowerCase()} ${String(target)}`.trim());
              }
            }
          } else if (msg.type === 'tool_use_summary') {
            opts.onProgress?.(msg.summary);
          } else if (msg.type === 'result') {
            if (msg.subtype === 'success') {
              if (msg.structured_output === undefined)
                throw new EngineError('claude returned no structured output');
              return { output: msg.structured_output, costUsd: msg.total_cost_usd };
            }
            const detail = 'errors' in msg && msg.errors.length ? `: ${msg.errors[0]}` : '';
            const hint = /auth|login|credential/i.test(detail) ? AUTH_HINT : undefined;
            throw new EngineError(`claude failed (${msg.subtype})${detail}`, hint);
          }
        }
      } catch (e) {
        if (e instanceof EngineError) throw e;
        const m = e instanceof Error ? e.message : String(e);
        const hint = /auth|login|credential|api key/i.test(m) ? AUTH_HINT : undefined;
        throw new EngineError(`claude engine error: ${m}`, hint);
      }
      throw new EngineError('claude ended without a result');
    },
  };
}
