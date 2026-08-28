import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const modifiedTimeCache = new Map<string, number | null>();
const createdTimeCache = new Map<string, number | null>();

export async function getGitModifiedTime(filePath: string): Promise<number | null> {
  const cached = modifiedTimeCache.get(filePath);
  if (cached !== undefined) return cached;

  let epochMillis: number | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%ct', '--', filePath]);
    const committedAt = Number.parseInt(stdout.trim(), 10);
    if (Number.isFinite(committedAt) && committedAt > 0) epochMillis = committedAt * 1000;
  } catch {
    epochMillis = null;
  }

  modifiedTimeCache.set(filePath, epochMillis);
  return epochMillis;
}

export async function getGitCreatedTime(filePath: string): Promise<number | null> {
  const cached = createdTimeCache.get(filePath);
  if (cached !== undefined) return cached;

  let epochMillis: number | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['log', '--reverse', '--format=%ct', '--', filePath]);
    const committedAt = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? '', 10);
    if (Number.isFinite(committedAt) && committedAt > 0) epochMillis = committedAt * 1000;
  } catch {
    epochMillis = null;
  }

  createdTimeCache.set(filePath, epochMillis);
  return epochMillis;
}
