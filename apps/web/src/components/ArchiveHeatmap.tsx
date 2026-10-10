import type { ArchiveDay } from '@blog/shared';
import { buildDayMap, dayKey, daysInMonth, levelClass } from '../lib/heatmap';

interface Props {
  year: number;
  days: ArchiveDay[];
  /** 点击某一天时回调其所在月份（用于联动筛选） */
  onSelectMonth?: (month: number) => void;
}

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const LEGEND = ['bg-slate-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700'];

/**
 * 年度发文热力图：12 行（月）× 31 列（日）。
 * 选「按月成行」而不是 GitHub 那种按周对齐的方格：个人博客数据量小，
 * 按自然月排列更容易一眼看出哪个月在写、哪个月断了。
 */
export default function ArchiveHeatmap({ year, days, onSelectMonth }: Props) {
  const countByDay = buildDayMap(days);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-[11px] text-slate-400">
        <span className="mr-1">{year} 年</span>
        <span>少</span>
        {LEGEND.map((c) => (
          <span key={c} className={`h-3 w-3 rounded-sm ${c}`} />
        ))}
        <span>多</span>
      </div>

      <div className="space-y-[3px]">
        {MONTH_LABELS.map((label, idx) => {
          const month = idx + 1;
          const total = daysInMonth(year, month);
          return (
            <div key={month} className="flex items-center gap-2">
              <button
                onClick={() => onSelectMonth?.(month)}
                className="w-8 shrink-0 text-right text-[11px] text-slate-400 hover:text-indigo-600"
                title={`只看 ${year} 年 ${month} 月的文章`}
              >
                {label}
              </button>
              <div className="flex gap-[3px]">
                {Array.from({ length: 31 }, (_, dIdx) => {
                  const day = dIdx + 1;
                  if (day > total) {
                    // 该月没有这一天：占位保持列对齐
                    return <span key={day} className="h-3 w-3" />;
                  }
                  const key = dayKey(year, month, day);
                  const count = countByDay.get(key) ?? 0;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => onSelectMonth?.(month)}
                      title={`${key}：${count} 篇`}
                      className={`h-3 w-3 rounded-sm transition hover:ring-2 hover:ring-indigo-300 ${levelClass(count)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
