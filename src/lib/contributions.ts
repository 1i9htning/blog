import { getRegistryHistory } from './git-time';
import { getAllRegistryPosts, getPublishedPosts } from './posts';
import { REGISTRY_FILE, getIgnoredCommits, getRegistry, type RegistryPost } from './registry';
import { shanghaiDayKey } from './time';
import { validateIgnoredCommits } from './validate';

export type ActivityKind = 'created' | 'updated' | 'created-updated' | 'renamed' | 'merged' | 'deleted';

export interface ActivityAnnotation {
  type: 'renamed' | 'merged';
  targetId: string;
  targetTitle: string;
}

export interface PostActivity {
  /** 活动所属文章的注册表 id；聚合行（merged）为 null。是否可跳转由 linkId 决定。 */
  id: string | null;
  title: string;
  kind: ActivityKind;
  /** 文章已删除：标题渲染为纯文本并带“（已删除）”后缀。 */
  deleted: boolean;
  /** renamed 事件的新名字 / merged 事件的目标名。 */
  to?: string;
  /** 标题（或 to）链接到 /blog/<linkId>/；null 或缺省表示纯文本。 */
  linkId?: string | null;
  /** 后缀标注：“（已改名至 X）”或“（已合并至 X）”，X 为链接。 */
  annotation?: ActivityAnnotation;
}

/** 渲染用行片段：纯文本或链接，灰字复用 contrib-deleted-title 样式。 */
export interface ActivityPart {
  text: string;
  /** 链接地址（/blog/<id>/）；缺省为纯文本。 */
  href?: string;
  /** 灰字片段（历史名称、连接词、括号标注等不可点文本）。 */
  gray?: boolean;
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

// 活动归日统一为上海墙钟（time.shanghaiDayKey）：格子日键、事件同日聚合、
// 今天/今年的归属全部同口径，与构建机器时区无关。
const dayKey = shanghaiDayKey;

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
  if (kind === 'created-updated') return '创建并更新内容';
  if (kind === 'renamed') return '改名';
  if (kind === 'merged') return '合并';
  return '删除';
}

/** 行内标注后缀：“（已改名至 X）”或“（已合并至 X）”，X 为链接。 */
function annotationParts(annotation: ActivityAnnotation): ActivityPart[] {
  return [
    { text: `（已${annotation.type === 'renamed' ? '改名' : '合并'}至 `, gray: true },
    { text: annotation.targetTitle, href: `/blog/${annotation.targetId}/` },
    { text: '）', gray: true },
  ];
}

/** 把一行活动展开为渲染片段序列；服务端模板与客户端脚本共用同一套规则。 */
export function activityParts(activity: PostActivity): ActivityPart[] {
  const parts: ActivityPart[] = [];

  if (activity.kind === 'deleted') {
    parts.push({ text: `删除 ${activity.title}`, gray: true });
    return parts;
  }

  if (activity.kind === 'renamed') {
    if (activity.deleted) {
      parts.push({ text: `${activity.title} 改名至 ${activity.to ?? ''}（已删除）`, gray: true });
      return parts;
    }
    if (activity.linkId) {
      parts.push(
        { text: `${activity.title} 改名至 `, gray: true },
        { text: activity.to ?? '', href: `/blog/${activity.linkId}/` },
      );
    } else {
      parts.push({ text: `${activity.title} 改名至 ${activity.to ?? ''}`, gray: true });
    }
    if (activity.annotation) parts.push(...annotationParts(activity.annotation));
    return parts;
  }

  if (activity.kind === 'merged') {
    if (activity.linkId) {
      parts.push(
        { text: `${activity.title} 合并至 `, gray: true },
        { text: activity.to ?? '', href: `/blog/${activity.linkId}/` },
      );
    } else {
      parts.push({ text: `${activity.title} 合并至 ${activity.to ?? ''}`, gray: true });
    }
    return parts;
  }

  // created / updated / created-updated：标题加可选标注后缀
  if (activity.deleted) {
    parts.push({ text: `${activity.title}（已删除）`, gray: true });
    return parts;
  }
  if (activity.linkId) parts.push({ text: activity.title, href: `/blog/${activity.linkId}/` });
  else parts.push({ text: activity.title, gray: true });
  if (activity.annotation) parts.push(...annotationParts(activity.annotation));
  return parts;
}

function buildYear(
  year: number,
  activitiesByDay: Map<string, PostActivity[]>,
  todayTime: number,
  currentYear: number,
): YearContributions {
  // 网格按历法日期容器计算：Date.UTC 构造的时间戳只作 Y-M-D 载体，
  // getUTCDay/getUTCDate 作用于容器是纯公历运算（星期几、月首判定），与时区无关；
  // 时区口径完全由 epoch → 日键的上海归日（dayKey）决定。
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

/** 同一天内行的确定性排序：先按事件类别，再按标题、目标名、文章 id。 */
const kindOrder: Record<ActivityKind, number> = {
  created: 0,
  'created-updated': 1,
  updated: 2,
  renamed: 3,
  merged: 4,
  deleted: 5,
};

function compareActivities(left: PostActivity, right: PostActivity): number {
  return kindOrder[left.kind] - kindOrder[right.kind]
    || left.title.localeCompare(right.title, 'zh-Hans-CN')
    || (left.to ?? '').localeCompare(right.to ?? '', 'zh-Hans-CN')
    || (left.id ?? '').localeCompare(right.id ?? '');
}

export async function getContributions(): Promise<ContributionsData> {
  const ignored = getIgnoredCommits();
  const violations = await validateIgnoredCommits(ignored);
  if (violations.length > 0) {
    throw new Error(
      `博客注册表 ${REGISTRY_FILE} 的忽略名单（ignoredCommits）校验失败：\n${violations.map((violation) => `- ${violation}`).join('\n')}`,
    );
  }

  const registry = getRegistry();
  const history = await getRegistryHistory(REGISTRY_FILE, ignored);
  const posts = await getPublishedPosts();
  // 已删除/已合并文章改由中央注册表提供；是否有可跳转详情页由 linkId 表达
  const retiredPosts = (await getAllRegistryPosts()).filter((post) => post.status !== 'active');

  const activitiesByDay = new Map<string, PostActivity[]>();
  const addActivity = (day: string, activity: PostActivity) => {
    const existing = activitiesByDay.get(day);
    if (existing) existing.push(activity);
    else activitiesByDay.set(day, [activity]);
  };

  /** 已合并文章的标注：目标当前标题取自注册表（校验保证目标存在且为 active）。 */
  const mergedAnnotation = (meta: RegistryPost): ActivityAnnotation | undefined => {
    if (meta.status !== 'merged' || meta.mergedInto === undefined || meta.mergedInto === '') return undefined;
    const target = registry.posts.get(meta.mergedInto);
    return { type: 'merged', targetId: meta.mergedInto, targetTitle: target?.title ?? meta.mergedInto };
  };

  const contentActivity = (
    id: string,
    meta: RegistryPost,
    kind: 'created' | 'updated' | 'created-updated',
    epoch: number,
  ): PostActivity => {
    const currentTitle = meta.title;
    const title = history.titleAt(id, epoch) ?? currentTitle;
    if (meta.status === 'deleted') {
      return { id, title, kind, deleted: true, linkId: null };
    }
    const merged = mergedAnnotation(meta);
    if (merged !== undefined) {
      return { id, title, kind, deleted: false, linkId: null, annotation: merged };
    }
    if (title === currentTitle) {
      return { id, title, kind, deleted: false, linkId: id };
    }
    // 历史标题与当前名不同：标注“已改名至 当前名”
    return {
      id,
      title,
      kind,
      deleted: false,
      linkId: null,
      annotation: { type: 'renamed', targetId: id, targetTitle: currentTitle },
    };
  };

  const addPostActivities = (
    id: string,
    createdEpoch: number | null,
    updatedEpochs: number[],
  ) => {
    const meta = registry.posts.get(id);
    if (meta === undefined) return;
    const createdWasUpdated = createdEpoch !== null && updatedEpochs.includes(createdEpoch);
    const createdIsOnlyUpdate = createdWasUpdated && updatedEpochs.length === 1;

    if (createdEpoch !== null) {
      const kind = createdWasUpdated && !createdIsOnlyUpdate ? 'created-updated' : 'created';
      addActivity(dayKey(createdEpoch), contentActivity(id, meta, kind, createdEpoch));
    }
    for (const updatedEpoch of updatedEpochs) {
      if (updatedEpoch !== createdEpoch) {
        addActivity(dayKey(updatedEpoch), contentActivity(id, meta, 'updated', updatedEpoch));
      }
    }
  };

  for (const post of posts) {
    addPostActivities(
      post.id,
      post.createdAt.value?.getTime() ?? null,
      post.updatedAtHistory
        .map((updatedAt) => updatedAt.value?.getTime() ?? null)
        .filter((epoch): epoch is number => epoch !== null),
    );
  }

  for (const post of retiredPosts) {
    addPostActivities(
      post.id,
      post.createdAt.value?.getTime() ?? null,
      post.updatedAtHistory
        .map((updatedAt) => updatedAt.value?.getTime() ?? null)
        .filter((epoch): epoch is number => epoch !== null),
    );
  }

  // 改名事件：title 为旧名，to 为新名；标注只指向最新状态
  for (const rename of history.renames) {
    const meta = registry.posts.get(rename.id);
    const deleted = meta === undefined || meta.status === 'deleted';
    const merged = meta === undefined ? undefined : mergedAnnotation(meta);
    let linkId: string | null = null;
    let annotation: ActivityAnnotation | undefined;
    if (deleted) {
      // 已删除文章整行纯文本
    } else if (merged !== undefined) {
      annotation = merged;
    } else if (meta !== undefined && rename.to === meta.title) {
      linkId = rename.id;
    } else if (meta !== undefined) {
      // 多次改名只标注最新：指向当前名
      annotation = { type: 'renamed', targetId: rename.id, targetTitle: meta.title };
    }
    addActivity(dayKey(rename.epoch), {
      id: rename.id,
      title: rename.from,
      kind: 'renamed',
      deleted,
      to: rename.to,
      linkId,
      annotation,
    });
  }

  // 合并事件：按（目标 id，上海时区自然日）聚合为一行，来源名以“、”连接
  const mergeGroups = new Map<string, { targetId: string; day: string; names: string[] }>();
  for (const event of history.statusEvents) {
    if (event.status !== 'merged' || event.targetId === undefined) continue;
    const day = dayKey(event.epoch);
    const name = history.titleAt(event.id, event.epoch)
      ?? registry.posts.get(event.id)?.title
      ?? event.id;
    const key = `${event.targetId}\n${day}`;
    const group = mergeGroups.get(key);
    if (group === undefined) mergeGroups.set(key, { targetId: event.targetId, day, names: [name] });
    else group.names.push(name);
  }
  for (const group of mergeGroups.values()) {
    const target = registry.posts.get(group.targetId);
    addActivity(group.day, {
      id: null,
      title: group.names.join('、'),
      kind: 'merged',
      deleted: false,
      to: target?.title ?? group.targetId,
      linkId: target?.status === 'active' ? group.targetId : null,
    });
  }

  // 删除事件：纯文本行
  for (const event of history.statusEvents) {
    if (event.status !== 'deleted') continue;
    const title = history.titleAt(event.id, event.epoch)
      ?? registry.posts.get(event.id)?.title
      ?? event.id;
    addActivity(dayKey(event.epoch), {
      id: event.id,
      title,
      kind: 'deleted',
      deleted: false,
      linkId: null,
    });
  }

  for (const activities of activitiesByDay.values()) activities.sort(compareActivities);

  // 今天/今年同样按上海墙钟取，future 判定、年份归属与格子日键同口径；
  // Date.UTC 在这里只是历法日期容器（见 buildYear 注释）。
  const [currentYear, currentMonth, currentDay] = dayKey(Date.now()).split('-').map(Number);
  const todayTime = Date.UTC(currentYear, currentMonth - 1, currentDay);

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
