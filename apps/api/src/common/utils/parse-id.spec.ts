import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@blog/shared';
import { parseId, tryParseId } from './parse-id';

describe('parseId', () => {
  it('接收字符串形式的主键', () => {
    expect(parseId('1')).toBe(1n);
    expect(parseId('18446744073709551615')).toBe(18446744073709551615n);
  });

  it('接收数字形式的主键', () => {
    expect(parseId(42)).toBe(42n);
  });

  it.each(['', 'abc', '-1', '1.5', '1e3', ' 1', '0x10'])(
    '非法取值 %p 抛 400',
    (value) => {
      expect(() => parseId(value)).toThrow(BadRequestException);
    },
  );

  it('超出 64 位无符号范围时抛 400（而不是让 MySQL 报 P2020 变成 500）', () => {
    // 1e20 的十进制展开仍是纯数字字符串，能被 BigInt 接受，但超出 uint64 上限
    try {
      parseId(1e20, '分类 id');
      fail('应当抛出 BadRequestException');
    } catch (err) {
      const e = err as BadRequestException;
      expect(e.getStatus()).toBe(400);
      expect(e.getResponse()).toMatchObject({ code: ErrorCode.VALUE_OUT_OF_RANGE });
    }
  });

  it('超大 JSON 数字退化为「不合法」的 400（1e23 会被转成指数写法）', () => {
    expect(() => parseId(1e23)).toThrow(BadRequestException);
  });
});

describe('tryParseId', () => {
  it('合法主键返回 BigInt', () => {
    expect(tryParseId('7')).toBe(7n);
  });

  it('非数字或越界返回 null（供 slug/id 二义判断使用）', () => {
    expect(tryParseId('hello-world')).toBeNull();
    expect(tryParseId('99999999999999999999999')).toBeNull();
  });
});
