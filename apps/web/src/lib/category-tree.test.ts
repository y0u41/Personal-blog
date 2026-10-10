import { describe, expect, it } from 'vitest';
import type { Category } from '@blog/shared';
import { buildCategoryTree, flattenCategoryTree } from './category-tree';

function cat(partial: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  return {
    slug: `s-${partial.id}`,
    parentId: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildCategoryTree', () => {
  it('按 parentId 组树，并按 sortOrder 排序', () => {
    const list = [
      cat({ id: '1', name: '技术', sortOrder: 2 }),
      cat({ id: '2', name: '生活', sortOrder: 1 }),
      cat({ id: '3', name: '前端', parentId: '1', sortOrder: 2 }),
      cat({ id: '4', name: '后端', parentId: '1', sortOrder: 1 }),
    ];

    const tree = buildCategoryTree(list);

    expect(tree.map((n) => n.name)).toEqual(['生活', '技术']);
    const tech = tree.find((n) => n.name === '技术');
    expect(tech?.children.map((n) => n.name)).toEqual(['后端', '前端']);
  });

  it('父分类缺失（被删除）的节点上浮为根节点，不丢数据', () => {
    const list = [
      cat({ id: '1', name: '孤儿', parentId: '999' }),
      cat({ id: '2', name: '根' }),
    ];

    const tree = buildCategoryTree(list);

    expect(tree.map((n) => n.name).sort()).toEqual(['孤儿', '根']);
  });

  it('空列表返回空数组', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe('flattenCategoryTree', () => {
  it('输出「父 / 子」层级标签', () => {
    const list = [
      cat({ id: '1', name: '技术' }),
      cat({ id: '2', name: '前端', parentId: '1' }),
      cat({ id: '3', name: 'React', parentId: '2' }),
    ];

    const flat = flattenCategoryTree(buildCategoryTree(list));

    expect(flat).toEqual([
      { id: '1', label: '技术' },
      { id: '2', label: '技术 / 前端' },
      { id: '3', label: '技术 / 前端 / React' },
    ]);
  });
});
