import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@blog/shared';

/** MySQL BIGINT UNSIGNED 上限 */
const MAX_UNSIGNED_BIGINT = 18_446_744_073_709_551_615n;

/**
 * 把对外暴露的主键（路径参数为字符串、请求体为数字）安全地转为 BigInt。
 *
 * 直接 `BigInt(value)` 的问题：JSON 里的 `99999999999999999999999` 会被解析成
 * 浮点数 `1e23`，`BigInt(1e23)` 不报错，但写进 MySQL 的 UNSIGNED BIGINT 会因
 * 越界抛出 P2020，最终以 500 返回给用户。前置校验把它降级为语义正确的 400。
 */
export function parseId(value: string | number, field = 'id'): bigint {
  const raw = typeof value === 'number' ? String(value) : value;
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException({
      code: ErrorCode.BAD_REQUEST,
      message: `${field} 不合法`,
    });
  }
  const id = BigInt(raw);
  if (id > MAX_UNSIGNED_BIGINT) {
    throw new BadRequestException({
      code: ErrorCode.VALUE_OUT_OF_RANGE,
      message: `${field} 超出取值范围`,
    });
  }
  return id;
}

/**
 * 宽松版本：仅当取值确实是「合法的 64 位无符号整数字符串」时返回 BigInt，否则返回 null。
 * 用于「既可能是 id 也可能是 slug」的场景（如 GET /posts/:idOrSlug），
 * 避免越界的纯数字被误当成主键查询从而抛出 500。
 */
export function tryParseId(value: string | number): bigint | null {
  const raw = typeof value === 'number' ? String(value) : value;
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const id = BigInt(raw);
  return id > MAX_UNSIGNED_BIGINT ? null : id;
}
