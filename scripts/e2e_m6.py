"""M6-A 回归验证：点赞 / 收藏 / 标签归档 / 上下篇 / 相关文章 / 热门文章。

覆盖本轮对标 CSDN 新增的能力，作为回归基线：
  1. 点赞与收藏：幂等（重复点赞不报错、未点赞取消也 200）、
     未登录 401、对不存在或未发布文章一律 404、非法 id 400。
  2. 详情增强：likeCount / favoriteCount / liked / favorited /
     prev / next / related 字段齐全，登录后 liked 能正确翻转。
  3. 标签归档：GET /tags 带「已发布」计数、GET /tags/:slug、不存在 404，
     GET /posts?tagSlug= 过滤生效且与 keyword 可叠加。
  4. 热门文章：GET /posts/hot 只含已发布、按浏览量倒序、limit 生效且越界被拦。

依赖：部署栈运行中。默认打 http://127.0.0.1:3000/api（可用 BASE 覆盖为
      http://127.0.0.1:8080/api 走 Nginx）。
管理员账号：BLOG_ADMIN_USER / BLOG_ADMIN_PASS，默认 admin / admin12345。

注意：脚本会创建临时标签、2 篇临时文章与 1 个读者测试账号，
      结束时全部清理（无删除用户接口，读者账号改为停用）。
"""

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
created_tag_id = None
reader_id = None
reader_username = None

# ============================================================================
# 准备：管理员登录 + 建临时标签与两篇已发布文章 + 注册读者账号
# ============================================================================

print("========== 准备数据 ==========")
st, adm = call("POST", "/auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS}, expect=200)
if st != 200:
    print("管理员登录失败，终止。")
    sys.exit(1)
admin_tok = adm["accessToken"]

tag_slug = f"m6tag-{SUFFIX}"
st, tag = call(
    "POST",
    "/tags",
    {"name": f"M6标签{SUFFIX}", "slug": tag_slug},
    token=admin_tok,
    expect=201,
)
created_tag_id = tag.get("id") if isinstance(tag, dict) else None
check(created_tag_id is not None, "创建临时标签")

for idx, title in enumerate([f"M6 较早文章 {SUFFIX}", f"M6 较新文章 {SUFFIX}"]):
    st, post = call(
        "POST",
        "/posts",
        {
            "title": title,
            "content": f"# {title}\n\n正文内容，用于 M6 回归。",
            "summary": "M6 回归用文章",
            "status": "published",
            "tagIds": [int(created_tag_id)] if created_tag_id else [],
        },
        token=admin_tok,
        expect=201,
    )
    if isinstance(post, dict) and post.get("id"):
        created_posts.append(post)
        check(True, f"创建已发布文章：{title}")
    else:
        check(False, f"创建已发布文章：{title}")

older = created_posts[0] if len(created_posts) > 0 else None
newer = created_posts[1] if len(created_posts) > 1 else None

reader_username = f"m6reader{SUFFIX}"
st, reg = call(
    "POST",
    "/auth/register",
    {
        "username": reader_username,
        "email": f"{reader_username}@example.com",
        "password": "Passw0rd!",
    },
    expect=201,
)
reader_tok = reg.get("accessToken") if isinstance(reg, dict) else None
reader_id = reg.get("user", {}).get("id") if isinstance(reg, dict) else None
check(reader_tok is not None, "注册读者测试账号")
check(
    isinstance(reg, dict) and reg.get("user", {}).get("role") == "reader",
    "新注册账号默认角色为 reader",
)

if older is None or newer is None or reader_tok is None:
    print("准备数据失败，终止。")
    sys.exit(1)

# ============================================================================
# 1. 列表与标签归档
# ============================================================================

print("\n========== M6-1. 列表项带互动计数 ==========")
st, listed = call("GET", "/posts?pageSize=5", expect=200)
items = listed.get("items", []) if isinstance(listed, dict) else []
check(len(items) > 0, "公开列表非空")
check(
    all("likeCount" in it and "favoriteCount" in it for it in items),
    "列表每项都含 likeCount / favoriteCount",
)

print("\n========== M6-2. 标签归档 ==========")
st, tags = call("GET", "/tags", expect=200)
by_slug = {t["slug"]: t for t in tags} if isinstance(tags, list) else {}
check(tag_slug in by_slug, "GET /tags 能查到新建标签")
check(
    tag_slug in by_slug and by_slug[tag_slug].get("_count", {}).get("postTags") == 2,
    "标签计数只统计已发布文章（应为 2）",
)

st, one_tag = call("GET", f"/tags/{tag_slug}", expect=200)
check(isinstance(one_tag, dict) and one_tag.get("slug") == tag_slug, "GET /tags/:slug 返回标签详情")
call("GET", f"/tags/no-such-tag-{SUFFIX}", expect=404)

st, by_tag = call("GET", f"/posts?tagSlug={tag_slug}", expect=200)
check(by_tag.get("meta", {}).get("total") == 2, "按 tagSlug 过滤命中 2 篇")
tagged_ids = [p["id"] for p in by_tag.get("items", [])]
check(
    set(tagged_ids) == {str(older["id"]), str(newer["id"])},
    "tagSlug 过滤返回的正是带该标签的两篇",
)

print("\n========== M6-3. tagSlug 与 keyword 叠加（AND 语义） ==========")
st, both_hit = call(
    "GET",
    f"/posts?tagSlug={tag_slug}&keyword=M6",
    expect=200,
)
check(both_hit.get("meta", {}).get("total") == 2, "标签 + 关键词同时命中 2 篇")
st, both_miss = call(
    "GET",
    f"/posts?tagSlug={tag_slug}&keyword=绝不可能匹配的词zzz{SUFFIX}",
    expect=200,
)
check(
    isinstance(both_miss, dict) and both_miss.get("meta", {}).get("total") == 0,
    "标签命中但关键词不命中时返回 0（AND 生效）",
)

# ============================================================================
# 2. 点赞 / 收藏
# ============================================================================

post_id = int(newer["id"])

print("\n========== M6-4. 未登录点赞/收藏 → 401 ==========")
call("POST", f"/posts/{post_id}/like", expect=401)
call("POST", f"/posts/{post_id}/favorite", expect=401)

print("\n========== M6-5. 点赞：建立 / 幂等 / 取消 / 幂等 ==========")
st, l1 = call("POST", f"/posts/{post_id}/like", token=reader_tok, expect=201)
check(l1.get("liked") is True and l1.get("likeCount") == 1, "首次点赞 liked=true 且计数为 1")
st, l2 = call("POST", f"/posts/{post_id}/like", token=reader_tok, expect=201)
check(l2.get("likeCount") == 1, "重复点赞幂等，计数仍为 1")
st, l3 = call("DELETE", f"/posts/{post_id}/like", token=reader_tok, expect=200)
check(l3.get("liked") is False and l3.get("likeCount") == 0, "取消点赞后计数归零")
st, l4 = call("DELETE", f"/posts/{post_id}/like", token=reader_tok, expect=200)
check(l4.get("likeCount") == 0, "重复取消点赞幂等（不会 404）")

print("\n========== M6-6. 收藏 + 我的收藏列表 ==========")
st, f1 = call("POST", f"/posts/{post_id}/favorite", token=reader_tok, expect=201)
check(f1.get("favorited") is True and f1.get("favoriteCount") == 1, "收藏成功")
st, favs = call("GET", "/users/me/favorites", token=reader_tok, expect=200)
fav_ids = [p["id"] for p in favs.get("items", [])] if isinstance(favs, dict) else []
check(str(post_id) in fav_ids, "「我的收藏」包含刚收藏的文章")

st, hot_detail = call("GET", f"/posts/{newer['slug']}", token=reader_tok, expect=200)
check(hot_detail.get("liked") is False and hot_detail.get("favorited") is True, "详情里的 favorited 为 true")

st, f2 = call("DELETE", f"/posts/{post_id}/favorite", token=reader_tok, expect=200)
check(f2.get("favorited") is False and f2.get("favoriteCount") == 0, "取消收藏")
st, favs2 = call("GET", "/users/me/favorites", token=reader_tok, expect=200)
fav_ids2 = [p["id"] for p in favs2.get("items", [])] if isinstance(favs2, dict) else []
check(str(post_id) not in fav_ids2, "取消后不再出现在「我的收藏」")

print("\n========== M6-7. 互动接口异常输入一律 4xx（不能是 500） ==========")
call("POST", "/posts/999999999/like", token=reader_tok, expect=404)
call("POST", "/posts/99999999999999999999999/like", token=reader_tok, expect=400)
call("POST", f"/posts/{older['id']}/like", token=admin_tok, expect=201)
# 草稿不参与互动：按「不存在」处理
st, draft = call(
    "POST",
    "/posts",
    {"title": f"M6 草稿 {SUFFIX}", "content": "草稿内容", "status": "draft"},
    token=admin_tok,
    expect=201,
)
if isinstance(draft, dict) and draft.get("id"):
    created_posts.append(draft)
    st, draft_like = call("POST", f"/posts/{draft['id']}/like", token=admin_tok, expect=404)
    check(code_of(draft_like) == 40400, "对草稿点赞返回 404（不泄露草稿存在性）")

# 撤掉前面为验证「非作者也能互动」而点的赞，保持数据干净
call("DELETE", f"/posts/{older['id']}/like", token=admin_tok, expect=200)

# ============================================================================
# 3. 详情：互动状态 / 上下篇 / 相关文章
# ============================================================================

print("\n========== M6-8. 详情字段齐全 ==========")
st, detail = call("GET", f"/posts/{older['slug']}", expect=200)
for field in ("likeCount", "favoriteCount", "liked", "favorited", "prev", "next", "related"):
    check(field in detail, f"详情包含字段 {field}")
check(detail.get("liked") is False, "未登录访问时 liked 为 false")

print("\n========== M6-9. 上下篇（按发布时间倒序） ==========")
check(
    isinstance(detail.get("prev"), dict) and detail["prev"].get("id") == str(newer["id"]),
    "较早文章的「上一篇」指向更晚发布的那篇",
)
check(
    detail.get("next") is None or isinstance(detail.get("next"), dict),
    "「下一篇」为 null 或对象（不参与导航时必须是 null）",
)
if isinstance(detail.get("prev"), dict):
    check(
        set(detail["prev"].keys()) == {"id", "title", "slug"},
        "上下篇只返回 id/title/slug（不复用完整文章对象）",
    )

st, newer_detail = call("GET", f"/posts/{newer['slug']}", expect=200)
check(
    isinstance(newer_detail.get("next"), dict)
    and newer_detail["next"].get("id") == str(older["id"]),
    "较新文章的「下一篇」指向更早发布的那篇",
)

print("\n========== M6-10. 相关文章按共享标签 ==========")
related = detail.get("related", [])
check(isinstance(related, list), "related 是数组")
check(
    any(r.get("id") == str(newer["id"]) for r in related),
    "相关文章包含共享同一标签的另一篇",
)
check(
    all(r.get("id") != str(older["id"]) for r in related),
    "相关文章不包含自己",
)

# ============================================================================
# 4. 热门文章
# ============================================================================

print("\n========== M6-11. 热门文章 ==========")
st, hot = call("GET", "/posts/hot", expect=200)
check(isinstance(hot, list) and 0 < len(hot) <= 5, "GET /posts/hot 默认返回不超过 5 条")
views = [p.get("views", 0) for p in hot] if isinstance(hot, list) else []
check(views == sorted(views, reverse=True), "热门文章按浏览量倒序")
check(
    all("likeCount" in p and "favoriteCount" in p for p in hot),
    "热门文章条目同样带互动计数",
)

st, hot2 = call("GET", "/posts/hot?limit=2", expect=200)
check(isinstance(hot2, list) and len(hot2) <= 2, "limit 生效")
call("GET", "/posts/hot?limit=0", expect=400)
call("GET", "/posts/hot?limit=999", expect=400)

# ============================================================================
# 清理
# ============================================================================

print("\n========== 清理 ==========")
for p in created_posts:
    call("DELETE", f"/posts/{p['id']}", token=admin_tok, expect=200)
print(f"       已删除 {len(created_posts)} 篇临时文章（点赞/收藏随外键级联清除）")

if created_tag_id:
    call("DELETE", f"/tags/{created_tag_id}", token=admin_tok, expect=200)
    print("       已删除临时标签")

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
