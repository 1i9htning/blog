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
  title: string;
  activities: PostActivity[];
}

export interface ActivityDay {
  date: string;
  activities: PostActivity[];
}

export interface ContributionsData {
  cells: ContributionCell[];
  months: (string | null)[];
  total: number;
  today: string;
  /** 53 周范围内有活动的日期，按日期倒序排列 */
  activityDays: ActivityDay[];
}

const WEEKS = 53;
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
  const todayTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisWeekStart = todayTime - new Date(todayTime).getUTCDay() * DAY_MS;
  const gridStart = thisWeekStart - (WEEKS - 1) * 7 * DAY_MS;
  const cells: ContributionCell[] = [];
  const months: (string | null)[] = [];
  let previousMonth = -1;
  let total = 0;

  for (let week = 0; week < WEEKS; week++) {
    const sunday = gridStart + week * 7 * DAY_MS;
    const month = new Date(sunday).getUTCMonth();
    months.push(week > 0 && month !== previousMonth ? `${month + 1} 月` : null);
    previousMonth = month;

    for (let day = 0; day < 7; day++) {
      const time = sunday + day * DAY_MS;
      const date = dayKey(time);
      const future = time > todayTime;
      const activities = future ? [] : (activitiesByDay.get(date) ?? []);
      const count = activities.length;
      if (!future) total += count;
      cells.push({
        date,
        count,
        level: levelOf(count),
        future,
        title: `${formatFullDate(date)}，${count > 0 ? `${count} 次活动` : '无活动'}`,
        activities,
      });
    }
  }

  const activityDays: ActivityDay[] = cells
    .filter((cell) => !cell.future && cell.activities.length > 0)
    .map((cell) => ({ date: cell.date, activities: cell.activities }))
    .sort((left, right) => right.date.localeCompare(left.date));

  return { cells, months, total, today: dayKey(todayTime), activityDays };
}
