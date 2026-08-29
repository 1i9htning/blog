import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const modifiedTimesCache = new Map<string, number[]>();
const createdTimeCache = new Map<string, number | null>();

export async function getGitModifiedTimes(filePath: string): Promise<number[]> {
  const cached = modifiedTimesCache.get(filePath);
  if (cached !== undefined) return cached;

  let epochMillis: number[] = [];
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      '--follow',
      '--find-renames=100%',
      '--diff-filter=AM',
      '--format=%ct',
      '--',
      filePath,
    ]);
    epochMillis = stdout
      .trim()
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => value * 1000)
      .sort((left, right) => right - left);
  } catch {
    epochMillis = [];
  }

  modifiedTimesCache.set(filePath, epochMillis);
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
