import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine, EngineError, EngineRunOpts } from './types.js';

const AUTH_HINT = 'run `codex login` to sign in with your ChatGPT account';

/** Pull a one-line progress string out of a codex --json JSONL event, if any. */
function progressLine(event: Record<string, unknown>): string | null {
  const item = event.item as Record<string, unknown> | undefined;
  if (event.type === 'item.completed' && item) {
    if (item.item_type === 'command_execution' || item.type === 'command_execution')
      return String(item.command ?? '').slice(0, 80) || null;
    if (item.item_type === 'reasoning' || item.type === 'reasoning') {
      const text = String(item.text ?? '').split('\n')[0] ?? '';
      return text ? text.slice(0, 80) : null;
    }
  }
  // legacy event shape: {msg: {type, ...}}
  const msg = event.msg as Record<string, unknown> | undefined;
  if (msg?.type === 'exec_command_begin')
    return String((msg.command as string[] | undefined)?.join(' ') ?? '').slice(0, 80) || null;
  return null;
}

export function codexEngine(): Engine {
  return {
    name: 'codex',
    supportsPdf: false,

    async runStructured(opts: EngineRunOpts) {
      if (opts.pdfs?.length)
        throw new EngineError('PDF input needs Claude Code', 'install Claude Code or convert the PDF');

      const dir = await mkdtemp(join(tmpdir(), 'wdijd-'));
      const schemaFile = join(dir, 'schema.json');
      const outFile = join(dir, 'out.json');
      await writeFile(schemaFile, JSON.stringify(opts.schema));

      const args = [
        'exec',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
        '--color', 'never',
        '-s', 'read-only',
        '-C', opts.cwd,
        '--output-schema', schemaFile,
        '-o', outFile,
      ];
      if (opts.fast) args.push('-c', 'model_reasoning_effort="low"');
      for (const img of opts.images ?? []) args.push('-i', img);
      args.push('-'); // prompt on stdin

      try {
        const { code, stderr } = await new Promise<{ code: number; stderr: string }>(
          (resolve, reject) => {
            const child = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stderr = '';
            let buf = '';
            child.stdout.on('data', (d: Buffer) => {
              buf += d.toString();
              const lines = buf.split('\n');
              buf = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const p = progressLine(JSON.parse(line));
                  if (p) opts.onProgress?.(p);
                } catch {
                  /* non-JSON noise — ignore */
                }
              }
            });
            child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
            child.on('error', reject);
            child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
            child.stdin.write(opts.instructions);
            child.stdin.end();
          },
        );

        if (code !== 0) {
          const tail = stderr.trim().split('\n').slice(-2).join(' ').slice(0, 200);
          const hint = /login|auth|401|unauthorized/i.test(stderr) ? AUTH_HINT : undefined;
          throw new EngineError(`codex failed (exit ${code})${tail ? `: ${tail}` : ''}`, hint);
        }

        let raw: string;
        try {
          raw = await readFile(outFile, 'utf8');
        } catch {
          throw new EngineError('codex produced no output file');
        }
        try {
          return { output: JSON.parse(raw) };
        } catch {
          throw new EngineError('codex final message was not valid JSON');
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
