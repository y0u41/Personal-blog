// 文章响应映射：把 Prisma 的 `_count.likes / _count.favorites / _count.comments`
// 摊平成对外的 likeCount / favoriteCount / commentCount，并把可空的 pinnedAt
// 派生出 isPinned，让前端卡片不必理解 Prisma 的 _count 与 NULL 语义。
// 主键 BigInt → string 由全局 BigIntSerializeInterceptor 统一处理，这里不重复转换。

export interface RelationCounts {
  likes: number;
  favorites: number;
  /** 只统计已过审评论（Prisma 过滤式关系计数），未传时输出 0 */
  comments?: number;
}

/** 映射器需要读取的两个可选字段；其余字段一律原样透传 */
interface CountableRow {
  _count?: RelationCounts;
  pinnedAt?: Date | null;
}

/**
 * 接受任何「可能带 _count / pinnedAt」的文章行，返回去掉 _count、
 * 补上三个计数与 isPinned 的对象。
 *
 * 入参写成 `T & CountableRow` 而不是 `T extends CountableRow`：后者在传裸对象字面量
 * （只有 id 这类字段、与约束无公共属性）时，TS 会把 T 推断成约束本身，进而对 id
 * 报「对象字面量只能指定已知属性」。交叉类型写法既保留原字段类型，又不误伤调用方。
 */
export function toPostWithCounts<T extends object>(row: T & CountableRow) {
  const { _count, ...rest } = row;
  // pinnedAt 可能不存在（例如 raw 查询拼装出的行），统一归一为 null
  const pinnedAt = row.pinnedAt ?? null;
  return {
    ...rest,
    pinnedAt,
    // 单一事实来源：置顶与否只看 pinnedAt 是否为空，避免布尔列与时间列不一致
    isPinned: pinnedAt != null,
    likeCount: _count?.likes ?? 0,
    favoriteCount: _count?.favorites ?? 0,
    commentCount: _count?.comments ?? 0,
  };
}

/** 列表类接口统一使用：批量摊平（顺带把 null 行过滤掉的语义留给调用方） */
export function toPostList<T extends object>(rows: (T & CountableRow)[]) {
  return rows.map(toPostWithCounts);
}
