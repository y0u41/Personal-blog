import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSessionHint, markSessionHint } from './session-hint';

// node 测试环境没有 localStorage，用最小内存实现替代
function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe('session-hint', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('从未写过提示时保守返回 true（仍尝试恢复会话）', () => {
    installLocalStorage();
    expect(hasSessionHint()).toBe(true);
  });

  it('标记为有会话后返回 true', () => {
    installLocalStorage();
    markSessionHint(true);
    expect(hasSessionHint()).toBe(true);
  });

  it('明确登出后返回 false（可跳过必然 401 的 refresh）', () => {
    installLocalStorage();
    markSessionHint(true);
    markSessionHint(false);
    expect(hasSessionHint()).toBe(false);
  });

  it('值被篡改为非 0 时按「可能有会话」处理，不会把用户踢成未登录', () => {
    const store = installLocalStorage();
    store.set('blog.session', 'yes');
    expect(hasSessionHint()).toBe(true);
  });

  it('localStorage 不可用时返回 true，且写入不抛异常', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(hasSessionHint()).toBe(true);
    expect(() => markSessionHint(true)).not.toThrow();
    expect(() => markSessionHint(false)).not.toThrow();
  });
});
