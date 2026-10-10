import { describe, expect, it } from 'vitest';
import { buildDayMap, dayKey, daysInMonth, levelClass } from './heatmap';

describe('daysInMonth', () => {
  it('平年 2 月 28 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('闰年 2 月 29 天', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('世纪闰年规则：2000 年是闰年、1900 年不是', () => {
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it('大小月正确', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('dayKey', () => {
  it('补零成 YYYY-MM-DD', () => {
    expect(dayKey(2026, 10, 10)).toBe('2026-10-10');
    expect(dayKey(2026, 1, 5)).toBe('2026-01-05');
  });

  it('与后端返回的日期键格式一致', () => {
    expect(dayKey(2026, 10, 3)).toBe('2026-10-03');
  });
});

describe('levelClass', () => {
  it('0 篇与负数都是最浅档（负数只是防御，正常不会出现）', () => {
    expect(levelClass(0)).toBe('bg-slate-100');
    expect(levelClass(-1)).toBe('bg-slate-100');
  });

  it('随篇数分档加深', () => {
    expect(levelClass(1)).toBe('bg-indigo-200');
    expect(levelClass(2)).toBe('bg-indigo-400');
    expect(levelClass(3)).toBe('bg-indigo-500');
    expect(levelClass(4)).toBe('bg-indigo-500');
    expect(levelClass(5)).toBe('bg-indigo-700');
    expect(levelClass(100)).toBe('bg-indigo-700');
  });
});

describe('buildDayMap', () => {
  it('把数组转成查找表', () => {
    const map = buildDayMap([
      { date: '2026-10-10', count: 3 },
      { date: '2026-10-01', count: 1 },
    ]);
    expect(map.get('2026-10-10')).toBe(3);
    expect(map.get('2026-10-01')).toBe(1);
    expect(map.get('2026-10-11')).toBeUndefined();
  });

  it('空数组得到空表', () => {
    expect(buildDayMap([]).size).toBe(0);
  });
});
