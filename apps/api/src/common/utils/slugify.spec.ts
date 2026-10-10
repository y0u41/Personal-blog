import { slugify, uniqueSlug } from './slugify';

describe('slugify', () => {
  it('把中文标题归一化为可读 slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  多  空格   标题 ')).toBe('多-空格-标题');
  });

  it('去掉标点并合并为单个连字符', () => {
    expect(slugify('Node.js + Prisma, 实践!')).toBe('node-js-prisma-实践');
  });

  it('去掉重音符号', () => {
    expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
  });

  it('空输入回落到默认值（保证 slug 非空）', () => {
    expect(slugify('!!!')).toBe('post');
    expect(slugify('')).toBe('post');
  });

  it('不含点号，避免与静态资源的扩展名规则冲突', () => {
    expect(slugify('a.b.c')).not.toContain('.');
  });
});

describe('uniqueSlug', () => {
  it('首次返回原值，冲突时追加序号', () => {
    expect(uniqueSlug('post', 1)).toBe('post');
    expect(uniqueSlug('post', 2)).toBe('post-2');
  });
});
