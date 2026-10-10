// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Post } from '@blog/shared';
import PostCard from './PostCard';

afterEach(cleanup);

function post(over: Partial<Post> = {}): Post {
  return {
    id: '1',
    title: '标题',
    slug: 'hello-world',
    summary: null,
    content: '',
    coverImage: null,
    authorId: '5',
    categoryId: null,
    status: 'published',
    views: 12,
    createdAt: '2026-10-10T00:05:00.000Z',
    updatedAt: '2026-10-10T00:05:00.000Z',
    publishedAt: '2026-10-10T08:05:00.000Z',
    pinnedAt: null,
    isPinned: false,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    author: {
      id: '5',
      username: 'yu',
      displayName: 'Yu',
      avatar: null,
      bio: null,
      role: 'author',
    },
    category: null,
    ...over,
  };
}

function renderCard(p: Post) {
  return render(
    <MemoryRouter>
      <PostCard post={p} />
    </MemoryRouter>,
  );
}

describe('PostCard 文章卡片', () => {
  it('标题渲染为指向 /post/:slug 的链接', () => {
    renderCard(post());

    const link = screen.getByRole('link', { name: '标题' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/post/hello-world');
  });

  it('slug 中的特殊字符会被转义，避免拼出畸形 URL', () => {
    renderCard(post({ slug: 'a b/c', title: '带空格' }));

    const link = screen.getByRole('link', { name: '带空格' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/post/a%20b%2Fc');
  });

  it('未置顶时不显示置顶徽标', () => {
    renderCard(post({ isPinned: false }));

    expect(screen.queryByText('置顶')).toBeNull();
  });

  it('置顶时显示置顶徽标', () => {
    renderCard(post({ isPinned: true, pinnedAt: '2026-10-10T09:00:00.000Z' }));

    expect(screen.getByText('置顶')).toBeTruthy();
  });

  it('展示阅读量与三项计数', () => {
    renderCard(post({ views: 42, commentCount: 3, likeCount: 5, favoriteCount: 7 }));

    expect(screen.getByText('👁 42')).toBeTruthy();
    expect(screen.getByText('💬 3')).toBeTruthy();
    expect(screen.getByText('👍 5')).toBeTruthy();
    expect(screen.getByText('⭐ 7')).toBeTruthy();
  });

  it('计数缺失时回退为 0，而不是渲染出 undefined', () => {
    const broken = post();
    // 模拟老接口或字段缺失的场景
    delete (broken as unknown as Record<string, unknown>).likeCount;
    delete (broken as unknown as Record<string, unknown>).favoriteCount;
    delete (broken as unknown as Record<string, unknown>).commentCount;

    renderCard(broken);

    expect(screen.getByText('💬 0')).toBeTruthy();
    expect(screen.getByText('👍 0')).toBeTruthy();
    expect(screen.getByText('⭐ 0')).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('有分类时展示分类名，无分类时不渲染', () => {
    const { unmount } = renderCard(
      post({
        category: {
          id: '2',
          name: '技术',
          slug: 'tech',
          parentId: null,
          description: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );
    expect(screen.getByText('技术')).toBeTruthy();
    unmount();

    renderCard(post({ category: null }));
    expect(screen.queryByText('技术')).toBeNull();
  });

  it('有封面时才渲染图片，alt 取标题', () => {
    const { unmount } = renderCard(post({ coverImage: '/uploads/a.png' }));
    expect(screen.getByAltText('标题')).toBeTruthy();
    unmount();

    renderCard(post({ coverImage: null }));
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('作者昵称为空时回退显示用户名', () => {
    renderCard(
      post({
        author: {
          id: '5',
          username: 'yu',
          displayName: '',
          avatar: null,
          bio: null,
          role: 'author',
        },
      }),
    );

    expect(screen.getByText('yu')).toBeTruthy();
  });

  it('优先用发布时间展示日期', () => {
    const d = new Date(2026, 9, 10, 8, 5);
    renderCard(
      post({
        publishedAt: d.toISOString(),
        createdAt: new Date(2020, 0, 1).toISOString(),
      }),
    );

    expect(screen.getByText('2026-10-10 08:05')).toBeTruthy();
  });

  it('未发布（publishedAt 为 null）时回落到创建时间', () => {
    const d = new Date(2026, 2, 4, 6, 7);
    renderCard(post({ publishedAt: null, createdAt: d.toISOString() }));

    expect(screen.getByText('2026-03-04 06:07')).toBeTruthy();
  });
});
