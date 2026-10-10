import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// 全局响应拦截器：递归把响应里的 BigInt 转为字符串，避免 JSON 序列化失败
// （Prisma 所有实体主键均为 BigInt unsigned）。同时安全处理 Date 与循环引用。
@Injectable()
export class BigIntSerializeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data) => this.convert(data, new WeakSet())));
  }

  private convert(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value instanceof Date) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.convert(item, seen));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        out[key] = this.convert(val, seen);
      }
      return out;
    }
    return value;
  }
}
