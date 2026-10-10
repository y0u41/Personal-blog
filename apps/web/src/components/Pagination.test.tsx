// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Pagination from './Pagination';

// 未开启 vitest globals 时 RTL 不会自动注册清理钩子，
// 不手动 cleanup 会让上一个用例的 DOM 残留、导致后续查询命中多个元素。
afterEach(cleanup);

describe('Pagination 分页器', () => {
  it('只有一页时不渲染任何内容', () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={8} onChange={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('total 为 0 时同样不渲染', () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={0} onChange={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('页数按向上取整计算（25 条 / 每页 10 → 3 页）', () => {
    render(<Pagination page={1} pageSize={10} total={25} onChange={() => {}} />);

    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '3' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '4' })).toBeNull();
  });

  it('第一页禁用「上一页」，最后一页禁用「下一页」', () => {
    const { unmount } = render(
      <Pagination page={1} pageSize={10} total={30} onChange={() => {}} />,
    );
    expect(
      (screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    unmount();

    render(<Pagination page={3} pageSize={10} total={30} onChange={() => {}} />);
    expect(
      (screen.getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('点击页码回调目标页；点上一页/下一页回调相邻页', () => {
    const onChange = vi.fn();
    render(<Pagination page={2} pageSize={10} total={30} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(onChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('首尾页码始终保留，中间按当前页收敛，跨段处显示省略号', () => {
    render(<Pagination page={5} pageSize={10} total={100} onChange={() => {}} />);

    // 首页、尾页、当前页及其前后各一页
    for (const label of ['1', '4', '5', '6', '10']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // 2、3 被折叠，出现省略号
    expect(screen.queryByRole('button', { name: '2' })).toBeNull();
    expect(screen.getAllByText('…')).toHaveLength(2);
  });
});
