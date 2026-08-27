import { getPublishedPosts } from './posts';

export type ActivityKind = 'created' | 'updated' | 'created-updated';

export interface PostActivity {
  id: string;
  title: string;
  kind: ActivityKind;
}

export interface ContributionCell {
  date: string;
  count: number;
  level: number;
  future: boolean;
  /** 补齐格子：日期落在所选年份之外（年初/年尾跨年周） */
  outside: boolean;
  title: string;
  activities: PostActivity[];
}

export interface ActivityDay {
  date: string;
  activities: PostActivity[];
}

export interface YearContributions {
  year: number;
  /** 周列数：全年网格恒为 53，闰年且 1 月 1 日为周六时为 54 */
  weeks: number;
  cells: ContributionCell[];
  /** 每周列的月份标签；列内含某月 1 号时标注该月 */
  months: (string | null)[];
  total: number;
  current: boolean;
  /** 该年内有活动的日期，按日期倒序排列 */
  activityDays: ActivityDay[];
}

export interface ContributionsData {
  today: string;
  /** 按年份降序，首项为当前年份；仅含当前年份与有活动的历史年份 */
  years: YearContributions[];
}

const DAY_MS = 86400000;

function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function levelOf(count: number): number {
  return count >= 4 ? 4 : count;
}

export function formatFullDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export function activityLabel(kind: ActivityKind): string {
  if (kind === 'created') return '创建内容';
  if (kind === 'updated') return '更新内容';
  return '创建并更新内容';
}

function buildYear(
  year: number,
  activitiesByDay: Map<string, PostActivity[]>,
  todayTime: number,
  currentYear: number,
): YearContributions {
  const firstTime = Date.UTC(year, 0, 1);
  const lastTime = Date.UTC(year, 11, 31);
  // 网格自 1 月 1 日所在周的上一个周日开始，至 12 月 31 日所在周的周六结束
  const gridStart = firstTime - new Date(firstTime).getUTCDay() * DAY_MS;
  const gridEnd = lastTime + (7 - new Date(lastTime).getUTCDay()) * DAY_MS;
  const weeks = Math.round((gridEnd - gridStart) / (7 * DAY_MS));

  const cells: ContributionCell[] = [];
  const months: (string | null)[] = [];
  let total = 0;

  for (let week = 0; week < weeks; week++) {
    const sunday = gridStart + week * 7 * DAY_MS;
    let monthLabel: string | null = null;
    for (let day = 0; day < 7; day++) {
      const time = sunday + day * DAY_MS;
      if (time >= firstTime && time <= lastTime && new Date(time).getUTCDate() === 1) {
        monthLabel = `${new Date(time).getUTCMonth() + 1} 月`;
      }
    }
    months.push(monthLabel);

    for (let day = 0; day < 7; day++) {
      const time = sunday + day * DAY_MS;
      const date = dayKey(time);
      const outside = time < firstTime || time > lastTime;
      const future = time > todayTime;
      const activities = outside || future ? [] : (activitiesByDay.get(date) ?? []);
      const count = activities.length;
      total += count;
      cells.push({
        date,
        count,
        level: levelOf(count),
        future,
        outside,
        title: `${formatFullDate(date)}，${count > 0 ? `${count} 次活动` : '无活动'}`,
        activities,
      });
    }
  }

  const activityDays: ActivityDay[] = cells
    .filter((cell) => cell.activities.length > 0)
    .map((cell) => ({ date: cell.date, activities: cell.activities }))
    .sort((left, right) => right.date.localeCompare(left.date));

  return { year, weeks, cells, months, total, current: year === currentYear, activityDays };
}

export async function getContributions(): Promise<ContributionsData> {
  const posts = await getPublishedPosts();
  const activitiesByDay = new Map<string, PostActivity[]>();
  const addActivity = (day: string, activity: PostActivity) => {
    const existing = activitiesByDay.get(day);
    if (existing) existing.push(activity);
    else activitiesByDay.set(day, [activity]);
  };

  for (const post of posts) {
    const created = post.createdAt.value ? dayKey(post.createdAt.value.getTime()) : null;
    const updated = post.updatedAt.value ? dayKey(post.updatedAt.value.getTime()) : null;
    if (created !== null && created === updated) {
      addActivity(created, { id: post.id, title: post.title, kind: 'created-updated' });
      continue;
    }
    if (created !== null) addActivity(created, { id: post.id, title: post.title, kind: 'created' });
    if (updated !== null) addActivity(updated, { id: post.id, title: post.title, kind: 'updated' });
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const todayTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const yearSet = new Set<number>([currentYear]);
  for (const day of activitiesByDay.keys()) {
    const year = Number(day.slice(0, 4));
    if (year < currentYear) yearSet.add(year);
  }

  const years = [...yearSet]
    .sort((left, right) => right - left)
    .map((year) => buildYear(year, activitiesByDay, todayTime, currentYear));

  return { today: dayKey(todayTime), years };
}
