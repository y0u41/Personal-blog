// 归档热力图的纯计算部分（与渲染分离，便于单测）。
// 日期一律按 UTC 解释：后端发布的年份/日期就是 UTC 口径，这里不能再引入本地时区偏移。

/** 某年某月的天数。用「下个月第 0 天」回退，自动处理闰年与大小月。 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 构造后端约定的日期键：YYYY-MM-DD */
export function dayKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** 按发文量分档着色。0 篇与「无此日期」都用浅灰，视觉上一致。 */
export function levelClass(count: number): string {
  if (count <= 0) return 'bg-slate-100';
  if (count === 1) return 'bg-indigo-200';
  if (count === 2) return 'bg-indigo-400';
  if (count <= 4) return 'bg-indigo-500';
  return 'bg-indigo-700';
}

/** 把 [{date, count}] 转成 date → count 的查找表 */
export function buildDayMap(days: { date: string; count: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) {
    map.set(d.date, d.count);
  }
  return map;
}
