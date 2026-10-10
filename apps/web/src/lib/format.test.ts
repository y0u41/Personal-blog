import { describe, expect, it } from 'vitest';
import { formatDate, STATUS_LABEL } from './format';

describe('formatDate', () => {
  it('空值与无效日期都返回空串，而不是 Invalid Date', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('不是日期')).toBe('');
  });

  it('按本地时间格式化为 YYYY-MM-DD HH:mm', () => {
    // 用本地时间构造再格式化，避免测试受运行机器时区影响
    const d = new Date(2026, 9, 10, 8, 5);
    expect(formatDate(d.toISOString())).toBe('2026-10-10 08:05');
  });

  it('月/日/时/分均补零到两位', () => {
    expect(formatDate(new Date(2026, 0, 3, 9, 7).toISOString())).toBe(
      '2026-01-03 09:07',
    );
  });

  it('跨零点边界不串日期', () => {
    expect(formatDate(new Date(2026, 11, 31, 23, 59).toISOString())).toBe(
      '2026-12-31 23:59',
    );
  });
});

describe('STATUS_LABEL', () => {
  it('三种文章状态都有中文文案', () => {
    expect(STATUS_LABEL.draft).toBe('草稿');
    expect(STATUS_LABEL.published).toBe('已发布');
    expect(STATUS_LABEL.archived).toBe('已归档');
  });
});
