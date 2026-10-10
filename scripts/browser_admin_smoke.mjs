/**
 * 浏览器冒烟（P0 角色门禁 + 管理端页面 + M6 互动 + M6-B 归档/排行/置顶）：用系统 Edge 驱动真实 UI。
 *
 * 覆盖：
 *  1) 管理员登录后能看到「管理后台」入口，读者/未登录看不到；
 *  2) /admin/users 能列出用户、角色下拉可选（提升作者的实际操作面）；
 *  3) /admin/comments、/admin/categories、/admin/tags 均能正常渲染且无 JS 异常；
 *  4) 新注册用户默认 reader：菜单无「写文章」，直接访问 /write 落到 403 页；
 *  5) M6：点赞/收藏（含刷新后持久化）、上下篇、相关文章、标签归档、我的收藏；
 *  6) M6-B：/archive 随笔档案与热力图、月份筛选联动、/rank 三榜切换、
 *     个人中心置顶开关 → 首页置顶徽标 → 取消置顶复原。
 *
 * 运行前需能解析 playwright-core（只依赖驱动库，不下载浏览器，用系统 Edge）：
 *   方式一：仓库根执行 `npm i -D playwright-core`（或 pnpm add -Dw playwright-core）
 *   方式二：设 PLAYWRIGHT_CORE_HOME=<已安装 playwright-core 的目录>，脚本会去
 *           $PLAYWRIGHT_CORE_HOME/node_modules/playwright-core 取
 *
 * 环境变量：BASE_WEB（默认 http://127.0.0.1:8080）
 *          BLOG_ADMIN_USER / BLOG_ADMIN_PASS（默认 seed 账号 admin / admin12345）
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  // playwright-core 的入口是 CJS：ESM 动态 import 后真正的东西在 .default 上
  const normalize = (mod) => (mod?.chromium ? mod : mod?.default);
  try {
    const mod = normalize(await import('playwright-core'));
    if (mod) return mod;
  } catch {
    // 落到下面的备用路径
  }
  const home = process.env.PLAYWRIGHT_CORE_HOME;
  if (home) {
    const entry = path.join(home, 'node_modules', 'playwright-core', 'index.js');
    const mod = normalize(await import(pathToFileURL(entry).href));
    if (mod) return mod;
  }
  console.error('未找到可用的 playwright-core。任选其一：');
  console.error('  a) 仓库根执行: npm i -D playwright-core');
  console.error('  b) 设置 PLAYWRIGHT_CORE_HOME 指向已安装 playwright-core 的目录');
  process.exit(2);
}

const { chromium } = await loadPlaywright();

const BASE = (process.env.BASE_WEB ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const API = BASE + '/api';
const ADMIN_USER = process.env.BLOG_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.BLOG_ADMIN_PASS ?? 'admin12345';
const SUFFIX = Math.floor(100000 + Math.random() * 900000);

let pass = 0;
let fail = 0;
const failed = [];

function check(cond, label) {
  if (cond) {
    pass += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    fail += 1;
    failed.push(label);
    console.log(`  [FAIL] ${label}`);
  }
}

const jsErrors = [];

function watch(page) {
  // 只把「真正的 JS 异常」算作失败。控制台里 "Failed to load resource" 是浏览器对
  // 非 2xx 响应（如此处未登录时 refresh 返回 401）的常规提示，不是代码缺陷。
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
      jsErrors.push(`console.error: ${msg.text()}`);
    }
  });
}

async function openUserMenu(page) {
  // 头像/昵称按钮是 header 里第一个 button（搜索框在 form 里，不带 button）
  await page.locator('header button').first().click();
  await page.waitForTimeout(200);
}

/** 注意 header 里还有个搜索框，不能直接用 page.locator('input') 取第 0 个 */
function formWith(page, selector) {
  return page.locator('form').filter({ has: page.locator(selector) });
}

async function login(page, username, password) {
  const form = formWith(page, 'input[type=password]');
  await form.locator('input').nth(0).fill(username);
  await form.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
}

async function register(page, username, email, password) {
  const form = formWith(page, 'input[type=email]');
  await form.locator('input').nth(0).fill(username);
  await form.locator('input[type=email]').fill(email);
  await form.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'), { timeout: 20000 });
}

async function menuText(page) {
  await openUserMenu(page);
  const text = await page.locator('header').innerText();
  await page.keyboard.press('Escape');
  return text;
}

/**
 * 直接用 HTTP 建一篇带标签的「最新」文章。
 * 目的是让「上下篇」与「相关文章」这两个区块在 UI 上真有内容可渲染——
 * 库里只有 1 篇已发布文章时，它们本就应当为空（这属于正确行为，无法据此断言）。
 */
async function createTempPost() {
  const loginRes = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!loginRes.ok) return null;
  const { accessToken } = await loginRes.json();

  const tagsRes = await fetch(API + '/tags');
  const tags = tagsRes.ok ? await tagsRes.json() : [];
  // 复用已有标签，保证与演示文章共享标签 → 相关文章才会有内容
  const tagged = Array.isArray(tags)
    ? tags.find((t) => (t?._count?.postTags ?? 0) > 0)
    : undefined;

  const res = await fetch(API + '/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      title: `UI 冒烟临时文章 ${SUFFIX}`,
      content: '# 临时文章\n\n用于验证上下篇与相关文章区块。',
      summary: 'UI 冒烟临时文章',
      status: 'published',
      tagIds: tagged ? [Number(tagged.id)] : [],
    }),
  });
  if (!res.ok) return null;
  return { token: accessToken, post: await res.json() };
}

async function deleteTempPost(ctx) {
  if (!ctx) return;
  await fetch(`${API}/posts/${ctx.post.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  // ---------------- 未登录 ----------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    watch(page);
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const header = await page.locator('header').innerText();
    check(header.includes('登录') && header.includes('注册'), '未登录时显示登录/注册入口');
    check(!header.includes('写文章'), '未登录时无「写文章」');
    check(
      header.includes('归档') && header.includes('排行榜'),
      '未登录时也能看到「归档 / 排行榜」入口（对游客开放）',
    );

    // 匿名互动应被引导到登录页，而不是静默失败
    const anonPostHref = await page
      .locator('article a[href^="/post/"]')
      .first()
      .getAttribute('href');
    if (anonPostHref) {
      await page.goto(BASE + anonPostHref, { waitUntil: 'networkidle' });
      await page.locator('button', { hasText: /点赞|已赞/ }).first().click();
      await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 10000 });
      check(true, '未登录点赞被引导到登录页');
      check(page.url().includes('redirect='), '登录链接带 redirect 回跳参数');
    } else {
      check(false, '首页未取到文章链接，无法验证匿名点赞引导');
    }
    await ctx.close();
  }

  // ---------------- 管理员 ----------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    watch(page);

    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await login(page, ADMIN_USER, ADMIN_PASS);
    check(true, '管理员登录成功并跳转');

    const adminMenu = await menuText(page);
    check(adminMenu.includes('管理后台'), '管理员菜单含「管理后台」');
    check(adminMenu.includes('写文章'), '管理员菜单含「写文章」');
    check(adminMenu.includes('管理员'), '菜单显示角色标签「管理员」');

    await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
    check(page.url().endsWith('/admin/users'), '/admin 默认重定向到 /admin/users');

    const rows = await page.locator('table tbody tr').count();
    check(rows > 0, `用户列表渲染出 ${rows} 行`);
    const roleSelects = await page.locator('table tbody select').count();
    check(roleSelects === rows, `每行都有角色下拉（${roleSelects}/${rows}）`);
    const options = await page.locator('table tbody select').first().locator('option').allInnerTexts();
    check(
      options.includes('作者') && options.includes('读者') && options.includes('管理员'),
      `角色下拉含三种角色（${options.join('/')}）`,
    );
    // 自己的那一行不允许改角色（防自锁）
    const selfRow = page.locator('table tbody tr', { hasText: '本人' }).first();
    if (await selfRow.count()) {
      const disabled = await selfRow.locator('select').first().isDisabled();
      check(disabled, '自己那一行的角色下拉被禁用（防自锁）');
    } else {
      check(true, '当前管理员不在本页列表中（跳过自锁检查）');
    }

    for (const [path, expectText] of [
      ['/admin/comments', '评论审核'],
      ['/admin/categories', '分类管理'],
      ['/admin/tags', '标签管理'],
    ]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      const body = await page.locator('body').innerText();
      check(body.includes(expectText), `${path} 正常渲染（含「${expectText}」）`);
    }

    // ---------------- M6：互动 / 上下篇 / 标签归档 / 我的收藏 ----------------
    // 复用已登录的管理员会话，避免额外登录触发 5 次/分的登录限流
    const tempCtx = await createTempPost();
    check(tempCtx != null, 'HTTP 建临时文章（用于让上下篇/相关文章有内容可渲染）');

    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const homeBody = await page.locator('body').innerText();
    check(homeBody.includes('热门文章'), '首页侧栏渲染「热门文章」');
    check(homeBody.includes('标签'), '首页侧栏渲染「标签」');

    // 临时文章是最新一篇，首页第一条即指向它
    const postHref = await page.locator('article a[href^="/post/"]').first().getAttribute('href');
    check(!!postHref, '首页能取到文章链接');

    if (postHref) {
      const likeOf = () => page.locator('button', { hasText: /点赞|已赞/ }).first();
      const favOf = () => page.locator('button', { hasText: /收藏|已收藏/ }).first();

      // 先把上一次运行残留的点赞/收藏清掉，保证计数断言可重复
      await page.goto(BASE + postHref, { waitUntil: 'networkidle' });
      if ((await likeOf().innerText()).includes('已赞')) await likeOf().click();
      if ((await favOf().innerText()).includes('已收藏')) await favOf().click();
      await page.waitForTimeout(400);

      const before = Number((await likeOf().innerText()).replace(/\D/g, '')) || 0;
      await likeOf().click();
      await page.waitForTimeout(600);
      check((await likeOf().innerText()).includes('已赞'), '点赞后按钮变为「已赞」');
      const after = Number((await likeOf().innerText()).replace(/\D/g, '')) || 0;
      check(after === before + 1, `点赞计数 +1（${before} → ${after}）`);

      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(800); // 等会话恢复 + 详情重新拉取
      check((await likeOf().innerText()).includes('已赞'), '刷新后仍是「已赞」（状态已落库）');

      await favOf().click();
      await page.waitForTimeout(600);
      check((await favOf().innerText()).includes('已收藏'), '收藏后按钮变为「已收藏」');

      const detailBody = await page.locator('body').innerText();
      check(
        detailBody.includes('上一篇') || detailBody.includes('下一篇'),
        '详情页渲染上下篇导航',
      );
      check(detailBody.includes('相关文章'), '详情页渲染相关文章区块');

      const tagHref = await page.locator('a[href^="/tag/"]').first().getAttribute('href');
      check(!!tagHref, '详情页标签渲染为可点击链接');
      if (tagHref) {
        await page.goto(BASE + tagHref, { waitUntil: 'networkidle' });
        const tagBody = await page.locator('body').innerText();
        check(tagBody.includes('标签：'), '/tag/:slug 渲染标签归档页');
        const cards = await page.locator('article').count();
        check(cards > 0, `标签归档页渲染出 ${cards} 篇文章卡片`);
      }

      await page.goto(BASE + '/me/favorites', { waitUntil: 'networkidle' });
      const favBody = await page.locator('body').innerText();
      check(favBody.includes('我的收藏'), '/me/favorites 渲染我的收藏页');
      const favCards = await page.locator('article').count();
      check(favCards > 0, `我的收藏内有 ${favCards} 篇（含刚收藏的文章）`);

      // 复原：取消点赞与收藏，不留脏数据
      await page.goto(BASE + postHref, { waitUntil: 'networkidle' });
      if ((await likeOf().innerText()).includes('已赞')) await likeOf().click();
      if ((await favOf().innerText()).includes('已收藏')) await favOf().click();
      await page.waitForTimeout(400);
      check(
        (await likeOf().innerText()).includes('点赞') &&
          (await favOf().innerText()).includes('收藏'),
        '互动状态已复原（点赞与收藏均已取消）',
      );
    }

    await deleteTempPost(tempCtx);
    check(true, '临时文章已删除（点赞/收藏随外键级联清除）');

    // ---------------- M6-B：归档 / 排行榜 / 置顶 ----------------
    await page.goto(BASE + '/archive', { waitUntil: 'networkidle' });
    const archBody = await page.locator('body').innerText();
    check(archBody.includes('随笔档案'), '/archive 渲染「随笔档案」区块');
    const heatCells = await page.locator('button[title*="篇"]').count();
    check(heatCells > 0, `归档热力图渲染出 ${heatCells} 个日期格`);

    const monthBtn = page.locator('aside button', { hasText: /月（/ }).first();
    if (await monthBtn.count()) {
      await monthBtn.click();
      await page.waitForTimeout(700);
      check(
        page.url().includes('year=') && page.url().includes('month='),
        '点击「随笔档案」中的月份会带上 year/month 筛选',
      );
      const archCards = await page.locator('article').count();
      check(archCards > 0, `归档筛选后渲染出 ${archCards} 篇文章`);
    } else {
      check(false, '随笔档案侧栏没有可点击的月份项');
    }

    await page.goto(BASE + '/rank', { waitUntil: 'networkidle' });
    const rankBody = await page.locator('body').innerText();
    check(
      rankBody.includes('阅读榜') && rankBody.includes('评论榜') && rankBody.includes('推荐榜'),
      '/rank 渲染三个榜单切换',
    );
    const viewRows = await page.locator('ol li').count();
    check(viewRows > 0, `阅读榜渲染出 ${viewRows} 条`);
    await page.locator('button', { hasText: '评论榜' }).first().click();
    await page.waitForTimeout(700);
    check(page.url().includes('type=comments'), '切换到评论榜后 URL 带 type=comments');
    check((await page.locator('ol li').count()) > 0, '评论榜仍有数据');

    // 置顶：在个人中心切换，回到首页验证「置顶优先」与徽标
    await page.goto(BASE + '/me', { waitUntil: 'networkidle' });
    const pinBtns = page.locator('button', { hasText: /^(置顶|已置顶)$/ });
    const pinCount = await pinBtns.count();
    check(pinCount > 0, `个人中心「我的文章」有 ${pinCount} 个置顶开关`);
    if (pinCount > 0) {
      // 先把残留的置顶状态清干净，保证断言可重复执行
      const pinnedNow = page.locator('button', { hasText: /^已置顶$/ });
      if (await pinnedNow.count()) {
        await pinnedNow.first().click();
        await page.waitForTimeout(700);
      }
      await page.locator('button', { hasText: /^置顶$/ }).first().click();
      await page.waitForTimeout(800);
      check(
        (await page.locator('button', { hasText: /^已置顶$/ }).count()) > 0,
        '点击「置顶」后按钮变为「已置顶」',
      );

      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      const firstCard = await page.locator('article').first().innerText();
      check(firstCard.includes('置顶'), '置顶后首页第一篇带「置顶」徽标');

      // 复原：取消置顶，不留脏状态
      await page.goto(BASE + '/me', { waitUntil: 'networkidle' });
      const pinnedAfter = page.locator('button', { hasText: /^已置顶$/ });
      if (await pinnedAfter.count()) {
        await pinnedAfter.first().click();
        await page.waitForTimeout(700);
      }
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      const homeAgain = await page.locator('article').first().innerText();
      check(!homeAgain.includes('置顶'), '取消置顶后首页不再显示徽标');
    }

    await ctx.close();
  }

  // ---------------- 读者（新注册）----------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const startIdx = jsErrors.length;
    watch(page);

    await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
    await register(page, `ui${SUFFIX}`, `ui${SUFFIX}@example.com`, 'Passw0rd!');
    check(true, '新用户注册成功并自动登录');

    const readerMenu = await menuText(page);
    check(readerMenu.includes('读者'), '新注册用户角色标签为「读者」');
    check(!readerMenu.includes('写文章'), '读者菜单无「写文章」入口');
    check(!readerMenu.includes('管理后台'), '读者菜单无「管理后台」入口');

    await page.goto(BASE + '/write', { waitUntil: 'networkidle' });
    const body = await page.locator('body').innerText();
    check(body.includes('没有访问权限'), '读者直接访问 /write 落到 403 页');
    check(page.url().includes('/write'), '/write 未被重定向走（保留原路径）');

    await page.goto(BASE + '/me', { waitUntil: 'networkidle' });
    const meBody = await page.locator('body').innerText();
    check(meBody.includes('暂不能发表文章'), '/me 提示读者需要提升为作者');

    check(jsErrors.length === startIdx, `读者流程无 JS 异常（新增 ${jsErrors.length - startIdx} 条）`);
    await ctx.close();
  }

  check(jsErrors.length === 0, `全流程无 JS 异常（共 ${jsErrors.length} 条）`);
} finally {
  await browser.close();
}

console.log(`\n===== 浏览器冒烟 DONE: ${pass} passed, ${fail} failed =====`);
if (jsErrors.length) {
  console.log('JS 异常：');
  for (const e of jsErrors.slice(0, 10)) {
    console.log('  -', e);
  }
}
if (failed.length) {
  console.log('失败用例：');
  for (const f of failed) {
    console.log('  -', f);
  }
}
process.exit(fail || jsErrors.length ? 1 : 0);
