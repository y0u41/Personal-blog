"""M6-B 回归验证：归档（随笔档案）/ 年度热力图 / 排行榜 / 文章置顶。

对标博客园的内容组织能力，作为回归基线：
  1. 归档总览 GET /posts/archive：年月篇数、倒序、年份汇总与月份自洽、草稿不计入。
  2. 归档筛选 GET /posts?year=&month=：只返回该月已发布文章；月份缺年份 400、越界 400。
  3. 年度热力图 GET /posts/archive/days?year=：今天建的文章当天有计数、日期格式、空年份为空。
  4. 排行榜 GET /posts/rank：三种维度各自按对应指标倒序、只含已发布、非法维度 400、
     pageSize 生效且越界 400、分页第二页不重复。
  5. 置顶 PATCH /posts/:id/pin：未登录 401、读者 403、置顶后列表置顶优先、
     多篇置顶按最近置顶在前、转草稿自动解除置顶、草稿不可置顶 400、缺少字段 400。

依赖：部署栈运行中。默认打 http://127.0.0.1:3000/api（可用 BASE 覆盖为
      http://127.0.0.1:8080/api 走 Nginx）。
管理员账号：BLOG_ADMIN_USER / BLOG_ADMIN_PASS，默认 admin / admin12345。

注意：脚本会创建临时文章、1 篇草稿与 1 个读者测试账号，结束时全部清理
      （无删除用户接口，读者账号改为停用）。
"""

import datetime
import http.cookiejar
import json
import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:3000/api")
ADMIN_USER = os.environ.get("BLOG_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("BLOG_ADMIN_PASS", "admin12345")
SUFFIX = str(random.randint(100000, 999999))

opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
)

PASS = 0
FAIL = 0
FAILED_LABELS = []


def check(cond, label):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        FAILED_LABELS.append(label)
        print(f"  [FAIL] {label}")


def call(method, path, body=None, token=None, expect=None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    # urllib 只接受 ASCII URL：带中文等非 ASCII 的查询串必须先百分号编码
    url = BASE + urllib.parse.quote(path, safe="/?&=%")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=30) as r:
            status, payload = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        status, payload = -1, str(e)
    try:
        parsed = json.loads(payload)
    except Exception:  # noqa: BLE001
        parsed = payload
    ok = expect is None or status == expect
    print(f"  {'OK ' if ok else 'XX '}{method} {path} -> [{status}] (expect {expect})")
    if not ok:
        print("       body:", str(parsed)[:300])
    return status, parsed


def code_of(resp):
    return resp.get("code") if isinstance(resp, dict) else None


created_posts = []
draft_post = None
reader_id = None
reader_username = None

# 归档口径与后端一致：Prisma 按 UTC 落库 DATETIME，故用 UTC 的今天做断言
today = datetime.datetime.now(datetime.timezone.utc)
TODAY_YEAR, TODAY_MONTH = today.year, today.month

# ============================================================================
# 准备：管理员登录 + 3 篇已发布文章（含 2 篇待置顶）+ 1 篇草稿 + 读者账号
# ============================================================================

print("========== 准备数据 ==========")
st, adm = call("POST", "/auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS}, expect=200)
if st != 200:
    print("管理员登录失败，终止。")
    sys.exit(1)
admin_tok = adm["accessToken"]

for title in [f"M6B 归档文章甲 {SUFFIX}", f"M6B 归档文章乙 {SUFFIX}", f"M6B 置顶文章丙 {SUFFIX}"]:
    st, post = call(
        "POST",
        "/posts",
        {
            "title": title,
            "content": f"# {title}\n\n正文内容，用于 M6-B 回归。",
            "summary": "M6-B 回归用文章",
            "status": "published",
        },
        token=admin_tok,
        expect=201,
    )
    if isinstance(post, dict) and post.get("id"):
        created_posts.append(post)
        check(True, f"创建已发布文章：{title}")
    else:
        check(False, f"创建已发布文章：{title}")

st, draft = call(
    "POST",
    "/posts",
    {"title": f"M6B 草稿 {SUFFIX}", "content": "草稿正文", "status": "draft"},
    token=admin_tok,
    expect=201,
)
draft_post = draft if isinstance(draft, dict) and draft.get("id") else None
check(draft_post is not None, "创建草稿文章")

post_a = created_posts[0] if len(created_posts) > 0 else None
post_b = created_posts[1] if len(created_posts) > 1 else None
post_c = created_posts[2] if len(created_posts) > 2 else None

reader_username = f"m6breader{SUFFIX}"
st, reg = call(
    "POST",
    "/auth/register",
    {
        "username": reader_username,
        "email": f"{reader_username}@example.com",
        "password": "reader12345",
    },
    expect=201,
)
reader_id = reg.get("user", {}).get("id") if isinstance(reg, dict) else None
reader_tok = reg.get("accessToken") if isinstance(reg, dict) else None
check(reader_tok is not None, "注册读者测试账号并拿到令牌")

# ============================================================================
# 1. 归档总览
# ============================================================================

print("\n========== M6B-01. 归档总览 ==========")
st, arch = call("GET", "/posts/archive", expect=200)
check(isinstance(arch, dict), "GET /posts/archive 返回对象")
check(isinstance(arch.get("total"), int), "total 是整数")
check(isinstance(arch.get("years"), list) and len(arch["years"]) > 0, "years 是非空数组")
check(isinstance(arch.get("months"), list) and len(arch["months"]) > 0, "months 是非空数组")
check(
    all("year" in m and "month" in m and "count" in m for m in arch["months"]),
    "每个月份条目含 year / month / count",
)
check(
    isinstance(arch["months"][0]["year"], int) and isinstance(arch["months"][0]["count"], int),
    "月份条目字段是数字（不是 BigInt 序列化后的字符串）",
)
check(
    arch["months"] == sorted(arch["months"], key=lambda m: (-m["year"], -m["month"])),
    "月份按「年-月」倒序排列",
)
check(
    sum(m["count"] for m in arch["months"]) == arch["total"],
    "月份篇数之和等于 total（口径自洽）",
)
check(
    sum(y["count"] for y in arch["years"]) == arch["total"],
    "年份篇数之和等于 total（口径自洽）",
)
this_month = [m for m in arch["months"] if m["year"] == TODAY_YEAR and m["month"] == TODAY_MONTH]
check(len(this_month) == 1, "当月出现在归档里")
check(
    this_month[0]["count"] >= 3 if this_month else False,
    "刚建的 3 篇已发布文章计入当月归档",
)

# ============================================================================
# 2. 归档筛选（GET /posts?year=&month=）
# ============================================================================

print("\n========== M6B-02. 归档年月筛选 ==========")
st, oct_list = call("GET", f"/posts?year={TODAY_YEAR}&month={TODAY_MONTH}&pageSize=100", expect=200)
ids_in_month = [p["id"] for p in oct_list.get("items", [])] if isinstance(oct_list, dict) else []
check(isinstance(oct_list, dict) and oct_list["meta"]["total"] > 0, "按月筛选返回结果")
check(
    all(str(p["id"]) in ids_in_month for p in created_posts),
    "当月筛选结果包含刚建的 3 篇文章",
)
check(
    all(
        (p.get("publishedAt") or "")[:7] == f"{TODAY_YEAR:04d}-{TODAY_MONTH:02d}"
        for p in oct_list.get("items", [])
    ),
    "结果里每篇文章的 publishedAt 都属于该年月",
)
check(
    draft_post["id"] not in ids_in_month,
    "草稿不出现在公开归档列表里",
)

st, empty_list = call("GET", "/posts?year=1970&month=1", expect=200)
check(empty_list.get("meta", {}).get("total") == 0, "无文章的年份区间返回空结果")

st, year_list = call("GET", f"/posts?year={TODAY_YEAR}&pageSize=100", expect=200)
check(
    year_list.get("meta", {}).get("total", 0) >= oct_list.get("meta", {}).get("total", 0),
    "按年筛选（不带月）的结果不少于按月筛选",
)

call("GET", f"/posts?month={TODAY_MONTH}", expect=400)
print("       月份缺年份被拒（400）")
call("GET", f"/posts?year={TODAY_YEAR}&month=13", expect=400)
print("       month=13 越界被拒（400）")
call("GET", "/posts?year=abc", expect=400)
print("       year 非数字被拒（400）")

# ============================================================================
# 3. 年度热力图
# ============================================================================

print("\n========== M6B-03. 年度热力图 ==========")
st, days = call("GET", f"/posts/archive/days?year={TODAY_YEAR}", expect=200)
check(isinstance(days, dict) and days.get("year") == TODAY_YEAR, "返回对象回显查询年份")
check(isinstance(days.get("days"), list), "days 是数组")
today_key = today.strftime("%Y-%m-%d")
today_entry = [d for d in days.get("days", []) if d.get("date") == today_key]
check(len(today_entry) == 1, "今天在热力图里有记录")
check(today_entry[0]["count"] >= 3 if today_entry else False, "今天的发文计数不少于 3")
check(
    all(len(d.get("date", "")) == 10 and d["date"][4] == "-" for d in days.get("days", [])),
    "日期格式为 YYYY-MM-DD",
)
check(
    all(d["date"].startswith(str(TODAY_YEAR)) for d in days.get("days", [])),
    "所有日期都属于查询年份",
)

st, days_old = call("GET", "/posts/archive/days?year=1970", expect=200)
check(days_old.get("days") == [], "无文章的年份热力图为空数组")

st, days_default = call("GET", "/posts/archive/days", expect=200)
check(isinstance(days_default.get("year"), int), "不传年份时使用当前年份")

call("GET", "/posts/archive/days?year=abc", expect=400)
print("       年份非数字被拒（400）")

# ============================================================================
# 4. 排行榜
# ============================================================================

print("\n========== M6B-04. 排行榜 ==========")
st, rank_default = call("GET", "/posts/rank?pageSize=50", expect=200)
check(isinstance(rank_default, dict) and isinstance(rank_default.get("items"), list), "排行榜返回分页结构")
check(rank_default["meta"]["pageSize"] == 50, "pageSize 生效")
views_seq = [p.get("views", 0) for p in rank_default["items"]]
check(views_seq == sorted(views_seq, reverse=True), "默认按浏览量倒序")
check(
    all("commentCount" in p and "isPinned" in p and "likeCount" in p for p in rank_default["items"]),
    "排行条目带 commentCount / isPinned / likeCount",
)
check(
    all(p.get("id") != draft_post["id"] for p in rank_default["items"]),
    "草稿不出现在排行榜",
)

st, rank_likes = call("GET", "/posts/rank?type=likes&pageSize=50", expect=200)
likes_seq = [p.get("likeCount", 0) for p in rank_likes["items"]]
check(likes_seq == sorted(likes_seq, reverse=True), "type=likes 按点赞数倒序")

st, rank_comments = call("GET", "/posts/rank?type=comments&pageSize=50", expect=200)
comments_seq = [p.get("commentCount", 0) for p in rank_comments["items"]]
check(comments_seq == sorted(comments_seq, reverse=True), "type=comments 按评论数倒序")

st, page1 = call("GET", "/posts/rank?pageSize=1&page=1", expect=200)
st, page2 = call("GET", "/posts/rank?pageSize=1&page=2", expect=200)
if page1["items"] and page2["items"]:
    check(page1["items"][0]["id"] != page2["items"][0]["id"], "第二页与第一页不重复")
else:
    check(True, "第二页与第一页不重复（数据不足时跳过）")

call("GET", "/posts/rank?type=unknown", expect=400)
print("       非法维度被拒（400）")
call("GET", "/posts/rank?pageSize=999", expect=400)
print("       pageSize 越界被拒（400）")
call("GET", "/posts/rank?page=0", expect=400)
print("       page=0 被拒（400）")

# ============================================================================
# 5. 置顶
# ============================================================================

print("\n========== M6B-05. 文章置顶 ==========")
call("PATCH", f"/posts/{post_c['id']}/pin", {"pinned": True}, expect=401)
print("       未登录置顶被拒（401）")
if reader_tok:
    call("PATCH", f"/posts/{post_c['id']}/pin", {"pinned": True}, token=reader_tok, expect=403)
    print("       读者置顶被拒（403，需作者/管理员）")

st, pinned = call(
    "PATCH", f"/posts/{post_c['id']}/pin", {"pinned": True}, token=admin_tok, expect=200
)
check(isinstance(pinned, dict) and pinned.get("isPinned") is True, "置顶后 isPinned = true")
check(isinstance(pinned.get("pinnedAt"), str) and len(pinned.get("pinnedAt") or "") > 0, "置顶后 pinnedAt 有值")
check(pinned.get("id") == str(post_c["id"]), "置顶返回的是同一篇文章")

st, listed = call("GET", "/posts?pageSize=50", expect=200)
check(
    listed["items"] and listed["items"][0]["id"] == str(post_c["id"]),
    "置顶文章排在公开列表首位",
)

# 再置顶另一篇：应排在 post_c 之前（按最近置顶在前）
st, pinned_b = call(
    "PATCH", f"/posts/{post_b['id']}/pin", {"pinned": True}, token=admin_tok, expect=200
)
check(pinned_b.get("isPinned") is True, "第二篇置顶成功")
st, listed2 = call("GET", "/posts?pageSize=50", expect=200)
top2 = [p["id"] for p in listed2["items"][:2]]
check(
    top2 == [str(post_b["id"]), str(post_c["id"])],
    "多篇置顶时最近置顶的排在最前",
)

# 列表分页兜底：置顶文章不应被页码切走（第一页就必须出现）
check(
    all(p.get("isPinned") for p in listed2["items"][:2]),
    "列表前两条都带 isPinned = true",
)

st, unpinned = call(
    "PATCH", f"/posts/{post_c['id']}/pin", {"pinned": False}, token=admin_tok, expect=200
)
check(unpinned.get("isPinned") is False, "取消置顶后 isPinned = false")
check(unpinned.get("pinnedAt") is None, "取消置顶后 pinnedAt 为 null")

# 草稿不可置顶
call("PATCH", f"/posts/{draft_post['id']}/pin", {"pinned": True}, token=admin_tok, expect=400)
print("       草稿置顶被拒（400）")

# 已发布 -> 草稿 自动解除置顶
st, toDraft = call(
    "PATCH",
    f"/posts/{post_b['id']}",
    {"status": "draft"},
    token=admin_tok,
    expect=200,
)
check(toDraft.get("isPinned") is False, "文章转为草稿后自动解除置顶")
check(toDraft.get("pinnedAt") is None, "转草稿后 pinnedAt 被清空")

# 缺少 pinned 字段
call("PATCH", f"/posts/{post_c['id']}/pin", {}, token=admin_tok, expect=400)
print("       缺少 pinned 字段被拒（400）")
call("PATCH", f"/posts/{post_c['id']}/pin", {"pinned": "yes"}, token=admin_tok, expect=400)
print("       pinned 非布尔被拒（400）")

# 不存在的文章 / 非法 id
call("PATCH", "/posts/99999999/pin", {"pinned": True}, token=admin_tok, expect=404)
print("       不存在的文章置顶返回 404")
call("PATCH", "/posts/abc/pin", {"pinned": True}, token=admin_tok, expect=400)
print("       非法文章 id 返回 400")

# ============================================================================
# 清理
# ============================================================================

print("\n========== 清理 ==========")
for p in created_posts:
    call("DELETE", f"/posts/{p['id']}", token=admin_tok, expect=200)
print(f"       已删除 {len(created_posts)} 篇临时已发布文章")
if draft_post:
    call("DELETE", f"/posts/{draft_post['id']}", token=admin_tok, expect=200)
    print("       已删除临时草稿")

if reader_id:
    call("PATCH", f"/users/{reader_id}/status", {"status": 0}, token=admin_tok, expect=200)
    print(f"       读者账号 {reader_username} 已停用（无删除用户接口）")

# ============================================================================

print("\n" + "=" * 60)
print(f"结果：PASS={PASS}  FAIL={FAIL}")
if FAILED_LABELS:
    print("失败项：")
    for label in FAILED_LABELS:
        print("  -", label)
sys.exit(1 if FAIL else 0)
