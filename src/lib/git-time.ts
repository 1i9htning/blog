import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { parseShanghaiTime } from './registry';

const execFileAsync = promisify(execFile);
const contentCommitTimesCache = new Map<string, number[]>();
const firstCommitTimeCache = new Map<string, number | null>();
const registryHistoryCache = new Map<string, RegistryHistory>();

interface GitCommit {
  hash: string;
  /** epoch 毫秒。 */
  epoch: number;
}

function cacheKeyFor(filePath: string, ignore: Set<string>): string {
  return `${filePath}\n${[...ignore].sort().join(',')}`;
}

/** 解析 git log --format=%H%x00%ct 的输出；ignore 中的 hash 被剔除。 */
function parseCommitLog(stdout: string, ignore: Set<string>): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const [hash, seconds] = line.split('\0');
    if (!hash || ignore.has(hash)) continue;
    const epochSeconds = Number.parseInt(seconds ?? '', 10);
    if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) continue;
    commits.push({ hash, epoch: epochSeconds * 1000 });
  }
  return commits;
}

/**
 * 正文文件的 content commit 时间（epoch 毫秒，降序）。
 * 跟随精确重命名（R100），只看新增/修改；注册表、images 等路径的 commit 不在此列。
 */
export async function getContentCommitTimes(filePath: string, ignore: Set<string>): Promise<number[]> {
  const cacheKey = cacheKeyFor(filePath, ignore);
  const cached = contentCommitTimesCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let epochMillis: number[] = [];
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      '--follow',
      '--find-renames=100%',
      '--diff-filter=AM',
      '--format=%H%x00%ct',
      '--',
      filePath,
    ]);
    epochMillis = parseCommitLog(stdout, ignore)
      .map((commit) => commit.epoch)
      .sort((left, right) => right - left);
  } catch {
    epochMillis = [];
  }

  contentCommitTimesCache.set(cacheKey, epochMillis);
  return epochMillis;
}

/**
 * 文件的首次提交时间（epoch 毫秒）；不跟随重命名，忽略名单中的 commit 不算。
 * 查不到（无 Git 历史）时返回 null。
 */
export async function getFirstCommitTime(filePath: string, ignore: Set<string>): Promise<number | null> {
  const cacheKey = cacheKeyFor(filePath, ignore);
  const cached = firstCommitTimeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let epochMillis: number | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['log', '--format=%H%x00%ct', '--', filePath]);
    const commits = parseCommitLog(stdout, ignore);
    if (commits.length > 0) epochMillis = Math.min(...commits.map((commit) => commit.epoch));
  } catch {
    epochMillis = null;
  }

  firstCommitTimeCache.set(cacheKey, epochMillis);
  return epochMillis;
}

export interface RenameEvent {
  id: string;
  from: string;
  to: string;
  /** 事件时间（epoch 毫秒），取产生变化的 commit 时间。 */
  epoch: number;
}

export interface StatusEvent {
  id: string;
  status: 'deleted' | 'merged';
  /** status 为 merged 时取新状态的 mergedInto。 */
  targetId?: string;
  /** 事件时间（epoch 毫秒）；注册表里的 deletedAt/mergedAt 可显式覆盖 commit 时间。 */
  epoch: number;
}

export interface RegistryHistory {
  renames: RenameEvent[];
  statusEvents: StatusEvent[];
  /** commit 时间 ≤ epoch 的最新快照里该 id 的标题；无则 null。 */
  titleAt(id: string, epoch: number): string | null;
}

interface SnapshotPost {
  title: string;
  status: 'active' | 'deleted' | 'merged';
  mergedInto: string | undefined;
  deletedAt: number | undefined;
  mergedAt: number | undefined;
}

interface RegistrySnapshot {
  epoch: number;
  /** 忽略名单中的 commit 不产生事件，但状态链照常经过它。 */
  ignored: boolean;
  posts: Map<string, SnapshotPost>;
}

function snapshotTime(value: unknown): number | undefined {
  if (value instanceof Date) {
    const epoch = value.getTime();
    return Number.isFinite(epoch) ? epoch : undefined;
  }
  if (typeof value === 'string') return parseShanghaiTime(value) ?? undefined;
  return undefined;
}

/** 宽松解析注册表快照；解析失败返回 null（该快照跳过，不进状态链）。 */
function parseSnapshotPosts(source: string): Map<string, SnapshotPost> | null {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch {
    return null;
  }
  const posts = (raw as { posts?: unknown } | null)?.posts;
  const result = new Map<string, SnapshotPost>();
  if (typeof posts !== 'object' || posts === null) return result;
  for (const [id, value] of Object.entries(posts)) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    result.set(id, {
      title: typeof record.title === 'string' ? record.title : '',
      status: record.status === 'deleted' || record.status === 'merged' ? record.status : 'active',
      mergedInto: typeof record.mergedInto === 'string' ? record.mergedInto : undefined,
      deletedAt: snapshotTime(record.deletedAt),
      mergedAt: snapshotTime(record.mergedAt),
    });
  }
  return result;
}

/**
 * 推导注册表的 Git 历史：按 commit 时间升序重放快照，产出标题变更与状态变更事件。
 * 忽略名单中的 commit 不产生事件，但状态链照常经过它；
 * 注册表尚无 Git 历史（未提交）时返回空事件、titleAt 恒 null，不抛错。
 */
export async function getRegistryHistory(registryPath: string, ignore: Set<string>): Promise<RegistryHistory> {
  const cacheKey = cacheKeyFor(registryPath, ignore);
  const cached = registryHistoryCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const snapshots: RegistrySnapshot[] = [];
  try {
    const { stdout } = await execFileAsync('git', [
      'log',
      '--reverse',
      '--format=%H%x00%ct',
      '--',
      registryPath,
    ]);
    for (const commit of parseCommitLog(stdout, new Set())) {
      let posts: Map<string, SnapshotPost> | null = null;
      try {
        const { stdout: source } = await execFileAsync('git', ['show', `${commit.hash}:${registryPath}`]);
        posts = parseSnapshotPosts(source);
      } catch {
        posts = null;
      }
      if (posts === null) continue; // 解析失败的快照跳过
      snapshots.push({ epoch: commit.epoch, ignored: ignore.has(commit.hash), posts });
    }
  } catch {
    // 没有 Git 历史时，返回空事件链。
  }

  const renames: RenameEvent[] = [];
  const statusEvents: StatusEvent[] = [];
  for (let index = 1; index < snapshots.length; index++) {
    const current = snapshots[index];
    if (current.ignored) continue;
    const previous = snapshots[index - 1];
    for (const [id, post] of current.posts) {
      const before = previous.posts.get(id);
      if (before !== undefined && before.title !== post.title) {
        renames.push({ id, from: before.title, to: post.title, epoch: current.epoch });
      }
      // 首次出现即 deleted/merged（注册表补登记历史文章）也视为状态事件
      if ((before === undefined || before.status !== post.status)
        && (post.status === 'deleted' || post.status === 'merged')) {
        const override = post.status === 'deleted' ? post.deletedAt : post.mergedAt;
        statusEvents.push({ id, status: post.status, targetId: post.mergedInto, epoch: override ?? current.epoch });
      }
    }
  }

  const history: RegistryHistory = {
    renames,
    statusEvents,
    titleAt(id, epoch) {
      for (let index = snapshots.length - 1; index >= 0; index--) {
        if (snapshots[index].epoch > epoch) continue;
        return snapshots[index].posts.get(id)?.title ?? null;
      }
      // 早于首个快照：状态向过去延伸，取最早已知快照（注册表建立之前的活动也处于该状态）。
      return snapshots[0]?.posts.get(id)?.title ?? null;
    },
  };

  registryHistoryCache.set(cacheKey, history);
  return history;
}
