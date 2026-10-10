import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// 初始化脚本：默认管理员账号 + 默认分类 + 默认标签。
// 幂等：使用 upsert，可重复执行。
const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

// 管理员凭据走环境变量；仅在未设置时回退到开发默认值（并在日志中告警）。
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

const DEFAULT_CATEGORIES: Prisma.CategoryCreateInput[] = [
  { name: '技术', slug: 'tech', sortOrder: 1, description: '技术相关文章' },
  { name: '生活', slug: 'life', sortOrder: 2, description: '生活随笔' },
  { name: '随笔', slug: 'essay', sortOrder: 3, description: '杂谈随笔' },
];

const DEFAULT_TAGS = ['TypeScript', 'Node.js', 'React', 'MySQL', '工程实践'];

async function main() {
  const isDefaultPassword = !process.env.SEED_ADMIN_PASSWORD;
  if (isDefaultPassword) {
    // eslint-disable-next-line no-console
    console.warn(
      '[seed] SEED_ADMIN_PASSWORD 未设置，使用开发默认密码，请勿用于生产！',
    );
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { role: 'admin', status: 1 },
    create: {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: '管理员',
      role: 'admin',
      status: 1,
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed] admin ready: ${admin.username} (id=${admin.id})`);

  for (const c of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder ?? 0 },
      create: c,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] ${DEFAULT_CATEGORIES.length} categories ready`);

  for (const name of DEFAULT_TAGS) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `tag-${Date.now()}`;
    await prisma.tag.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] ${DEFAULT_TAGS.length} tags ready`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
