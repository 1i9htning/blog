export type TimeSource = 'explicit' | 'auto' | 'missing' | 'forbidden';

export interface ResolvedTime {
  value: Date | null;
  source: TimeSource;
}

export function resolveCreatedAt(raw: Date | 'auto' | null | undefined): ResolvedTime {
  if (raw === undefined) return { value: null, source: 'missing' };
  if (raw === null) return { value: null, source: 'forbidden' };
  if (raw === 'auto') return { value: null, source: 'auto' };
  return { value: raw, source: 'explicit' };
}

export function resolveUpdatedAt(raw: Date | 'auto' | null | undefined): ResolvedTime {
  if (raw === undefined) return { value: null, source: 'missing' };
  if (raw === null) return { value: null, source: 'forbidden' };
  if (raw === 'auto') return { value: null, source: 'auto' };
  return { value: raw, source: 'explicit' };
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatEpochDateTime(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatEpochShort(epoch: number): string {
  const date = new Date(epoch);
  return `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatEpochMonth(epoch: number): string {
  const date = new Date(epoch);
  return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`;
}

export function compareEpochDesc(left: number | null, right: number | null): number {
  if (left !== null && right !== null) return right - left;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return 0;
}

export interface TimelineGroup<T> {
  key: string;
  label: string;
  items: T[];
  unknown: boolean;
}

export function groupByMonth<T>(items: T[], getTime: (item: T) => number | null): TimelineGroup<T>[] {
  const knownGroups: TimelineGroup<T>[] = [];
  const byKey = new Map<string, TimelineGroup<T>>();
  const unknown: T[] = [];

  for (const item of items) {
    const epoch = getTime(item);
    if (epoch === null) {
      unknown.push(item);
      continue;
    }

    const date = new Date(epoch);
    const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: formatEpochMonth(epoch), items: [], unknown: false };
      byKey.set(key, group);
      knownGroups.push(group);
    }
    group.items.push(item);
  }

  if (unknown.length > 0) {
    knownGroups.push({ key: 'unknown', label: '未知时间', items: unknown, unknown: true });
  }

  return knownGroups;
}
