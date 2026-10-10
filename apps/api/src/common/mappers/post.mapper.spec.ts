import { toPostWithCounts, toPostList } from './post.mapper';

describe('toPostWithCounts', () => {
  it('把 _count 摊平成三个计数并去掉 _count 字段', () => {
    const result = toPostWithCounts({
      id: 1n,
      title: 't',
      _count: { likes: 3, favorites: 1, comments: 5 },
    });

    expect(result).toMatchObject({ likeCount: 3, favoriteCount: 1, commentCount: 5 });
    expect('_count' in result).toBe(false);
  });

  it('pinnedAt 有值时 isPinned 为 true（单一事实来源是 pinnedAt，而非另一个布尔列）', () => {
    const result = toPostWithCounts({ id: 1n, pinnedAt: new Date('2026-10-10T00:00:00Z') });

    expect(result.isPinned).toBe(true);
    expect(result.pinnedAt).toBeInstanceOf(Date);
  });

  it('pinnedAt 为 null 时 isPinned 为 false', () => {
    const result = toPostWithCounts({ id: 1n, pinnedAt: null });

    expect(result.isPinned).toBe(false);
    expect(result.pinnedAt).toBeNull();
  });

  it('行里没有 pinnedAt / _count 时也能安全通过（raw 拼装的行）', () => {
    const result = toPostWithCounts({ id: 1n });

    expect(result).toMatchObject({
      isPinned: false,
      pinnedAt: null,
      likeCount: 0,
      favoriteCount: 0,
      commentCount: 0,
    });
  });

  it('toPostList 对数组逐项做同样的摊平', () => {
    const items = toPostList([
      { id: 1n, _count: { likes: 1, favorites: 0, comments: 0 } },
      { id: 2n, pinnedAt: null },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0].likeCount).toBe(1);
    expect(items[1].isPinned).toBe(false);
  });
});
