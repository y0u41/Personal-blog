import json
import urllib.request
import urllib.error
import http.cookiejar
import random
from urllib.parse import quote

BASE = "http://127.0.0.1:3000/api"
SUFFIX = str(random.randint(1000, 9999))

# 禁用代理，避免环境 HTTP_PROXY 干扰本地请求
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
)


def call(method, path, body=None, token=None, expect=None):
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=15) as r:
            status = r.status
            payload = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status = e.code
        payload = e.read().decode("utf-8")
    try:
        parsed = json.loads(payload)
    except Exception:
        parsed = payload
    flag = "OK " if (expect is None or status == expect) else "XX "
    print(f"{flag}{method} {path} -> [{status}] (expect {expect})")
    return status, parsed


def jprint(obj, n=260):
    s = json.dumps(obj, ensure_ascii=False)
    print("     " + (s[:n] + ("..." if len(s) > n else "")))


print("========== 1. 登录 admin ==========")
_, adm = call("POST", "/auth/login", {"username": "admin", "password": "admin12345"}, expect=200)
admin_tok = adm["accessToken"]
print("     admin role:", adm["user"]["role"])

print("========== 2. admin 创建文章（published） ==========")
st, post = call("POST", "/posts", {
    "title": "端到端验证文章",
    "summary": "E2E 摘要",
    "content": "# 标题\n\n正文 **粗体**",
    "categoryId": 1,
    "tagIds": [1, 2],
    "status": "published",
}, token=admin_tok, expect=201)
pid = post["id"]
slug = post["slug"]
print("     post id:", pid, "| slug:", slug, "| publishedAt:", post["publishedAt"])
assert post["publishedAt"] is not None, "publishedAt 仍为空！"
assert isinstance(pid, str), "id 未序列化为 string！"

print("========== 3. 公开列表 GET /posts ==========")
st, lst = call("GET", "/posts", expect=200)
print("     total:", lst["meta"]["total"], "first title:", lst["items"][0]["title"])
assert lst["meta"]["total"] >= 1

print("========== 4. 分类筛选 GET /posts?categoryId=1 ==========")
st, lst2 = call("GET", "/posts?categoryId=1", expect=200)
print("     total(cat1):", lst2["meta"]["total"])

print("========== 5. 关键词搜索 GET /posts?keyword=端到端 ==========")
st, lst3 = call("GET", f"/posts?keyword={quote('端到端')}", expect=200)
print("     total(keyword):", lst3["meta"]["total"])

print("========== 6. 详情 GET /posts/{slug}（浏览量 +1）==========")
st, detail = call("GET", f"/posts/{quote(slug)}", expect=200)
print("     views:", detail["views"], "| tags:", [t["tag"]["name"] for t in detail["postTags"]])

print("========== 7. 更新 PATCH /posts/{id} ==========")
st, upd = call("PATCH", f"/posts/{pid}", {"title": "端到端验证文章(已改)"}, token=admin_tok, expect=200)
print("     new title:", upd["title"])

print("========== 8. reader 建分类（预期 403） ==========")
_, reg = call("POST", "/auth/register", {"username": f"bob{SUFFIX}", "email": f"bob{SUFFIX}@example.com", "password": "Passw0rd!"}, expect=201)
bob_tok = reg["accessToken"]
bob_id = reg["user"]["id"]
call("POST", "/categories", {"name": "违规分类"}, token=bob_tok, expect=403)

print("========== 9. admin 建分类（预期 201） ==========")
_, new_cat = call("POST", "/categories", {"name": "数据库", "parentId": 1, "sortOrder": 5}, token=admin_tok, expect=201)
new_cat_id = new_cat["id"] if isinstance(new_cat, dict) else None
st, cats = call("GET", "/categories", expect=200)
print("     category count:", len(cats))

print("========== 10. GET /users/me（admin） ==========")
st, me = call("GET", "/users/me", token=admin_tok, expect=200)
print("     me:", me["username"], me["role"], "avatar=", me["avatar"])

print("========== 11. GET /users/me/posts（admin 全部状态） ==========")
st, mine = call("GET", "/users/me/posts", token=admin_tok, expect=200)
print("     my posts total:", mine["meta"]["total"])

print("========== 12. 无 token 访问 /users/me（预期 401） ==========")
call("GET", "/users/me", expect=401)

print("========== 13. refresh 静默刷新 ==========")
st, refreshed = call("POST", "/auth/refresh", expect=200)
print("     new accessToken len:", len(refreshed["accessToken"]))

print("========== 14. DELETE /posts/{id} ==========")
call("DELETE", f"/posts/{pid}", token=admin_tok, expect=200)
st, lst4 = call("GET", "/posts", expect=200)
print("     total after delete:", lst4["meta"]["total"])

print("========== 15. 清理本脚本造的数据（既往版本会残留分类与账号） ==========")
if new_cat_id:
    call("DELETE", f"/categories/{new_cat_id}", token=admin_tok, expect=200)
    print("     temp category removed:", new_cat_id)
if bob_id:
    call("PATCH", f"/users/{bob_id}/status", {"status": 0}, token=admin_tok, expect=200)
    print(f"     account bob{SUFFIX} deactivated（无删除用户接口）")

print("\n===== E2E DONE =====")
