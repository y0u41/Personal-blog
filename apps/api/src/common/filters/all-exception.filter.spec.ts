import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '@blog/shared';
import { AllExceptionsFilter } from './all-exception.filter';

interface Captured {
  status?: number;
  body?: { code: number; message: string; data: null };
}

function makeHost(method = 'POST', originalUrl = '/api/posts'): {
  host: ArgumentsHost;
  captured: Captured;
} {
  const captured: Captured = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured['body']) {
      captured.body = body;
      return this;
    },
  };
  const request = { method, url: originalUrl, originalUrl };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '5.22.0',
  });
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // 断言「确实写了日志」，但不让日志污染测试输出
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('业务异常保留自定义 code 与 message', () => {
    const { host, captured } = makeHost();
    filter.catch(
      new NotFoundException({ code: ErrorCode.USER_NOT_FOUND, message: '用户不存在' }),
      host,
    );
    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toEqual({
      code: ErrorCode.USER_NOT_FOUND,
      message: '用户不存在',
      data: null,
    });
  });

  it('校验管道抛出的 message 数组会合并为一行', () => {
    const { host, captured } = makeHost();
    filter.catch(new BadRequestException(['page 必须为整数', 'role 不合法']), host);
    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body?.message).toBe('page 必须为整数; role 不合法');
    expect(captured.body?.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('框架限流异常替换为友好文案', () => {
    const { host, captured } = makeHost();
    filter.catch(new HttpException('ThrottlerException', HttpStatus.TOO_MANY_REQUESTS), host);
    expect(captured.status).toBe(429);
    expect(captured.body).toMatchObject({
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: '请求过于频繁，请稍后再试',
    });
  });

  it('请求体过大返回上传相关文案', () => {
    const { host, captured } = makeHost();
    filter.catch(new HttpException('PayloadTooLarge', HttpStatus.PAYLOAD_TOO_LARGE), host);
    expect(captured.status).toBe(413);
    expect(captured.body).toMatchObject({
      code: ErrorCode.UPLOAD_TOO_LARGE,
      message: '图片大小超出限制',
    });
  });

  it('5xx 的 HttpException 会写 error 日志，4xx 不写', () => {
    filter.catch(new HttpException('boom', HttpStatus.BAD_GATEWAY), makeHost().host);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockClear();

    filter.catch(new ForbiddenException('权限不足'), makeHost().host);
    filter.catch(new BadRequestException('参数错误'), makeHost().host);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  describe('Prisma 已知错误映射（此前全部漏成 500）', () => {
    it.each([
      ['P2002', HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE],
      ['P2003', HttpStatus.BAD_REQUEST, ErrorCode.ASSOCIATION_INVALID],
      ['P2020', HttpStatus.BAD_REQUEST, ErrorCode.VALUE_OUT_OF_RANGE],
      ['P2000', HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST],
      ['P2025', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
    ])('%s → %i', (code, status, errorCode) => {
      const { host, captured } = makeHost();
      filter.catch(prismaError(code), host);
      expect(captured.status).toBe(status);
      expect(captured.body?.code).toBe(errorCode);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('未识别的 Prisma 错误码仍按 500 处理并记录日志', () => {
      const { host, captured } = makeHost();
      filter.catch(prismaError('P9999'), host);
      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.body?.code).toBe(ErrorCode.INTERNAL);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  it('未知异常返回通用 500 且必须写日志（此前完全不写日志）', () => {
    const { host, captured } = makeHost();
    filter.catch(new Error('内部细节：连接串 mysql://root:secret@db'), host);
    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({
      code: ErrorCode.INTERNAL,
      message: '服务器内部错误',
      data: null,
    });
    // 绝不回传内部细节
    expect(JSON.stringify(captured.body)).not.toContain('secret');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('非 Error 抛出物（如字符串）也能兜底', () => {
    const { host, captured } = makeHost();
    filter.catch('something odd', host);
    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(errorSpy).toHaveBeenCalled();
  });
});
