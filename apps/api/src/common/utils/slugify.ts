// 将任意标题转为 URL 友好的 slug：小写、去重音、非字母数字转连字符、去首尾连字符。
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'post';
}

// 在基础 slug 上追加序号保证唯一：title -> title-2 -> title-3 ...
export function uniqueSlug(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`;
}
