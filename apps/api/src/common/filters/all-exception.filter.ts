import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorCode } from '@blog/shared';

interface MappedError {
  status: number;
  code: number;
  message: string;
}

// 统一异常过滤器（单过滤器方案，避免多全局过滤器排序导致的 HttpException 被兜底吞掉）：
// - HttpException：取实际 HTTP 状态；若响应体自带业务 code 则优先采用，否则按状态映射；
//   业务异常以 { code, message } 抛出时即可返回统一响应体 { code, message, data }。
// - Prisma 已知错误：按错误码映射为语义正确的 4xx，避免约束冲突/越界冒泡成 500。
// - 其余异常：返回通用 500，绝不泄露堆栈或内部细节；同时写入服务端日志。
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = `${request.method} ${request.originalUrl ?? request.url}`;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res: unknown = exception.getResponse();
      const body =
        typeof res === 'object' && res !== null
          ? (res as Record<string, unknown>)
          : {};
      const customCode =
        typeof body['code'] === 'number' ? (body['code'] as number) : undefined;
      const rawMessage =
        typeof res === 'string' ? res : body['message'] ?? exception.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : (rawMessage as string);

      // 框架抛出的限流 / 请求体过大，统一替换为面向用户的文案
      let finalMessage = message;
      if (status === HttpStatus.TOO_MANY_REQUESTS && customCode === undefined) {
        finalMessage = '请求过于频繁，请稍后再试';
      }
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        finalMessage = '图片大小超出限制';
      }

      // 5xx 属于服务端问题，必须留下日志（4xx 是预期内的用户错误，不刷日志）
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `[${status}] ${path} -> ${finalMessage}`,
          exception.stack,
        );
      }

      response.status(status).json({
        code: customCode ?? this.toCode(status),
        message: finalMessage,
        data: null,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      this.logger.warn(
        `[${mapped.status}] ${path} -> prisma ${exception.code}: ${mapped.message}`,
      );
      response.status(mapped.status).json({
        code: mapped.code,
        message: mapped.message,
        data: null,
      });
      return;
    }

    // 兜底：记录完整堆栈，但只向客户端返回通用文案
    this.logger.error(
      `[500] ${path} -> 未处理异常`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCode.INTERNAL,
      message: '服务器内部错误',
      data: null,
    });
  }

  /**
   * Prisma 已知错误 → 语义正确的 4xx。
   * 之前这些错误会直接冒泡成 500，例如「重复标签」「分类 id 不存在」「id 越界」。
   */
  private mapPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): MappedError {
    switch (exception.code) {
      case 'P2002': // 唯一约束冲突
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.DUPLICATE_RESOURCE,
          message: '数据已存在，请勿重复提交',
        };
      case 'P2003': // 外键约束失败（关联的记录不存在）
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.ASSOCIATION_INVALID,
          message: '关联的资源不存在',
        };
      case 'P2020': // 数值超出字段类型允许范围
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.VALUE_OUT_OF_RANGE,
          message: '数值超出允许范围',
        };
      case 'P2000': // 字段值过长
        return {
          status: HttpStatus.BAD_REQUEST,
          code: ErrorCode.BAD_REQUEST,
          message: '数据超出字段长度限制',
        };
      case 'P2025': // 目标记录不存在（更新/删除）
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: '资源不存在',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ErrorCode.INTERNAL,
          message: '服务器内部错误',
        };
    }
  }

  private toCode(status: number): number {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.TOO_MANY_REQUESTS;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.UPLOAD_TOO_LARGE;
      default:
        return status >= 400 && status < 500
          ? ErrorCode.BAD_REQUEST
          : ErrorCode.INTERNAL;
    }
  }
}
