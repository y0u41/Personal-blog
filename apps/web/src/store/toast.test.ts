import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToastStore } from './toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('push 追加一条消息，类型与文案透传', () => {
    useToastStore.getState().push('error', '出错了');

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ type: 'error', message: '出错了' });
  });

  it('多条消息按入队顺序排列且 id 互不相同', () => {
    useToastStore.getState().push('info', '第一条');
    useToastStore.getState().push('success', '第二条');

    const { toasts } = useToastStore.getState();
    expect(toasts.map((t) => t.message)).toEqual(['第一条', '第二条']);
    expect(toasts[0].id).not.toBe(toasts[1].id);
  });

  it('3 秒后自动移除，且只移除自己那一条', () => {
    useToastStore.getState().push('info', '会消失');
    vi.advanceTimersByTime(2999);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    useToastStore.getState().push('info', '晚来的');
    vi.advanceTimersByTime(1); // 第一条到点
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      '晚来的',
    ]);
  });

  it('remove 可按 id 提前移除', () => {
    useToastStore.getState().push('info', 'a');
    const id = useToastStore.getState().toasts[0].id;

    useToastStore.getState().remove(id);

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('remove 一个不存在的 id 不影响既有消息', () => {
    useToastStore.getState().push('info', 'a');

    useToastStore.getState().remove(999999);

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('toast.success / error / info 是 push 的语法糖', () => {
    toast.success('成功');
    toast.error('失败');
    toast.info('提示');

    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual([
      'success',
      'error',
      'info',
    ]);
  });
});
