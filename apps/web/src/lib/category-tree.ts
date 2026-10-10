import type { Category, CategoryNode } from '@blog/shared';

// 由扁平的分类列表（含 parentId）组装成树，按 sortOrder 排序。
export function buildCategoryTree(list: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const c of list) {
    nodes.set(c.id, { ...c, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (arr: CategoryNode[]) => {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id));
    arr.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// 输出「父 / 子」形式的层级标签，便于下拉展示
export function flattenCategoryTree(
  tree: CategoryNode[],
  prefix = '',
): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const node of tree) {
    out.push({ id: node.id, label: prefix ? `${prefix} / ${node.name}` : node.name });
    out.push(...flattenCategoryTree(node.children, prefix ? `${prefix} / ${node.name}` : node.name));
  }
  return out;
}
