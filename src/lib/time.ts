export type TimeSource = 'explicit' | 'auto' | 'missing' | 'forbidden';

export interface ResolvedTime {
  value: Date | null;
  source: TimeSource;
}

export type ResolvedTimeHistory = ResolvedTime[];

export function resolveCreatedAt(raw: Date | 'auto' | null | undefined): ResolvedTime {
  if (raw === undefined) return { value: null, source: 'missing' };
  if (raw === null) return { value: null, source: 'forbidden' };
  if (raw === 'auto') return { value: null, source: 'auto' };
  return { value: raw, source: 'explicit' };
}

/**
 * updatedAt 四态归一：undefined（missing，未声明）与 null（forbidden，历史未知基线）
 * 都解析为空历史，二者来源靠 declareUpdatedAt 区分；Date/数组为显式条目。
 */
export function resolveUpdatedAt(raw: Date | Date[] | null | undefined): ResolvedTimeHistory {
  if (raw === undefined) return [];
  if (raw === null) return [];
  if (Array.isArray(raw)) return raw.map((value) => ({ value, source: 'explicit' }));
  return [{ value: raw, source: 'explicit' }];
}

/** updatedAt 的声明形态，用于在空历史时区分「未知基线」（null）与「未声明」（missing）。 */
export function declareUpdatedAt(raw: Date | Date[] | null | undefined): 'explicit' | 'null' | 'missing' {
  if (raw === undefined) return 'missing';
  if (raw === null) return 'null';
  return 'explicit';
}

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

// 归日/归月只取历法日，另用一个不含时分秒的上海墙钟 formatter（同样的 en-CA parts 思路）。
const shanghaiDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 上海墙钟的历法日部件；month/day 为两位数字符串。 */
function shanghaiDayParts(epoch: number): { year: string; month: string; day: string } {
  const parts = shanghaiDayFormatter.formatToParts(new Date(epoch));
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** epoch 归入上海自然日，键为 YYYY-MM-DD；与构建机器时区无关。 */
export function shanghaiDayKey(epoch: number): string {
  const { year, month, day } = shanghaiDayParts(epoch);
  return `${year}-${month}-${day}`;
}

export function formatEpochShort(epoch: number): string {
  const { month, day } = shanghaiDayParts(epoch);
  return `${month}-${day}`;
}

export function formatEpochMonth(epoch: number): string {
  const { year, month } = shanghaiDayParts(epoch);
  return `${year} 年 ${Number(month)} 月`;
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

    const { year, month } = shanghaiDayParts(epoch);
    const key = `${year}-${month}`;
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
