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

// 创建/更新时间固定按中国标准时间（Asia/Shanghai）展示，与构建机器时区无关。
// 用 en-CA 取数值分量后自行拼接，分隔符不交给 locale 决定，避免格式漂移；
// hourCycle 'h23' 保证午夜为 00 而非 24，不请求秒与时区标识。
const shanghaiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatEpochDateTime(epoch: number): string {
  const parts = shanghaiFormatter.formatToParts(new Date(epoch));
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
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
