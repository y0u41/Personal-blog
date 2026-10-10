import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function makeContext(user?: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(roles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('未标注 @Roles 的接口一律放行（含未登录）', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
    expect(guard.canActivate(makeContext({ id: '1', role: 'reader' }))).toBe(true);
  });

  it.each(['admin', 'author'])('@Roles(author,admin) 允许 %s', (role) => {
    const guard = new RolesGuard(makeReflector(['author', 'admin']));
    expect(guard.canActivate(makeContext({ id: '1', role }))).toBe(true);
  });

  it('reader 访问作者接口抛出 403', () => {
    const guard = new RolesGuard(makeReflector(['author', 'admin']));
    expect(() => guard.canActivate(makeContext({ id: '1', role: 'reader' }))).toThrow(
      ForbiddenException,
    );
  });

  it('已登录但无 role 字段时拒绝', () => {
    const guard = new RolesGuard(makeReflector(['admin']));
    expect(guard.canActivate(makeContext({ id: '1' }))).toBe(false);
  });

  it('未登录访问仅管理员接口时拒绝', () => {
    const guard = new RolesGuard(makeReflector(['admin']));
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });
});
