"""P0/P1 回归验证：角色权限闭环（提升作者）+ 非法输入不再 500。

覆盖本次修复的每一条缺陷，作为回归基线：
  P0  读者默认不能发文；管理员可在 /users 列出用户并「提升作者」；
      禁止管理员改自己（防自锁）；降级/停用立即生效（JwtStrategy 回查 DB）。
  P1  Prisma 异常映射（P2002/P2003/P2020/P2025 → 4xx）；
      bigint 越界前置校验；重复 tagIds 被 DTO 拦下；
      idOrSlug 越界与纯数字 slug 处理；上传魔数嗅探挡下伪装文件。

依赖：部署栈运行中。默认打 http://127.0.0.1:3000/api（可经 BASE 环境变量覆盖，
      例如 http://127.0.0.1:8080/api 走 Nginx）。
管理员账号：环境变量 BLOG_ADMIN_USER / BLOG_ADMIN_PASS，
           默认使用 seed 的开发账号 admin / admin12345。

注意：本脚本会创建一个 e2e 测试账号与一篇文章，结束时删除文章并停用测试账号
      （无删除用户接口，避免留下可登录的测试账号）。
"""

import base64
import http.cookiejar
import json
import os
import random
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

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
    url = BASE + path
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=30) as r:
            status = r.status
            payload = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status = e.code
        payload = e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        status = -1
        payload = str(e)
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


# ============================================================================
print("========== 0. 管理员登录 ==========")
st, adm = call(
    "POST", "/auth/login", {"username": ADMIN_USER, "password": ADMIN_PASS}, expect=200
)
if st != 200:
    print("!! 管理员登录失败，后续用例无法进行。请检查 BLOG_ADMIN_USER/PASS。")
    raise SystemExit(2)
admin_tok = adm["accessToken"]
admin_id = adm["user"]["id"]
check(adm["user"]["role"] == "admin", "管理员角色为 admin")

print("========== P0-1. 注册新用户默认是 reader ==========")
USERNAME = f"e2e{SUFFIX}"
st, reg = call(
    "POST",
    "/auth/register",
    {
        "username": USERNAME,
        "email": f"{USERNAME}@example.com",
        "password": "Passw0rd!",
    },
    expect=201,
)
user_tok = reg["accessToken"]
user_id = reg["user"]["id"]
check(reg["user"]["role"] == "reader", f"新注册用户默认角色为 reader（实际 {reg['user']['role']}）")

print("========== P0-2. reader 发文 → 403（P0 的核心症状）==========")
call(
    "POST",
    "/posts",
    {"title": "读者不该能发", "content": "x"},
    token=user_tok,
    expect=403,
)

print("========== P0-3. reader 访问管理端 → 403 ==========")
call("GET", "/users", token=user_tok, expect=403)
call("PATCH", f"/users/{admin_id}/role", {"role": "reader"}, token=user_tok, expect=403)

print("========== P0-4. 管理员列用户 + 关键字检索 ==========")
st, listing = call("GET", f"/users?keyword={USERNAME}", token=admin_tok, expect=200)
check(listing["meta"]["total"] == 1, f"按用户名检索到 1 条（实际 {listing['meta']['total']}）")
found = listing["items"][0] if listing.get("items") else {}
check(found.get("id") == user_id, "检索结果 id 一致")
check("passwordHash" not in json.dumps(found), "响应不含 passwordHash")
check("postCount" in found and "createdAt" in found, "管理端返回 postCount/createdAt")

print("========== P0-5. 缺少 role 过滤时按角色筛选可用 ==========")
st, readers = call("GET", "/users?role=reader&pageSize=100", token=admin_tok, expect=200)
check(all(u["role"] == "reader" for u in readers["items"]), "role=reader 结果全部为 reader")

print("========== P0-6. 管理员改自己的角色 → 403（防自锁）==========")
st, self_role = call("PATCH", f"/users/{admin_id}/role", {"role": "reader"}, token=admin_tok, expect=403)
check(code_of(self_role) == 40302, "错误码为 CANNOT_MODIFY_SELF(40302)")
st, self_status = call("PATCH", f"/users/{admin_id}/status", {"status": 0}, token=admin_tok, expect=403)
check(code_of(self_status) == 40302, "改自己状态同样被拒(40302)")

print("========== P0-7. 管理员把该用户提升为 author ==========")
st, promoted = call(
    "PATCH", f"/users/{user_id}/role", {"role": "author"}, token=admin_tok, expect=200
)
check(promoted.get("role") == "author", "提升后角色为 author")

print("========== P0-8. 提升立即生效（refresh 后即可发文）==========")
st, refreshed = call("POST", "/auth/refresh", token=None, expect=200)
user_tok2 = refreshed.get("accessToken") if isinstance(refreshed, dict) else None
check(
    isinstance(refreshed, dict) and refreshed.get("user", {}).get("role") == "author",
    "refresh 返回的 user.role 为 author",
)
check(bool(user_tok2), "拿到新的 accessToken")

st, created = call(
    "POST",
    "/posts",
    {"title": f"作者发文验证 {SUFFIX}", "content": "# 正文\n\n提升后可以发文章了。", "status": "published"},
    token=user_tok2,
    expect=201,
)
created_id = created.get("id") if isinstance(created, dict) else None
created_slug = created.get("slug") if isinstance(created, dict) else None
check(bool(created_id), "作者发布成功")

print("========== P0-9. 作者仍不能进管理端 ==========")
call("GET", "/users", token=user_tok2, expect=403)
call("GET", "/comments?status=pending", token=user_tok2, expect=403)
call("GET", "/categories", token=user_tok2, expect=200)  # 公开接口正常

print("========== P0-10. 降级为 reader 后旧 token 立即失效（实时角色）==========")
call("PATCH", f"/users/{user_id}/role", {"role": "reader"}, token=admin_tok, expect=200)
# 仍用降级前签发的 token，应被拒（JwtStrategy 回查数据库角色）
call("POST", "/posts", {"title": "降级后不该能发", "content": "x"}, token=user_tok2, expect=403)
# 降级后连自己的文章也不能编辑（与后端 @Roles 一致）
call("PATCH", f"/posts/{created_id}", {"title": "偷偷改"}, token=user_tok2, expect=403)

print("========== P0-11. 停用账号后旧 token 立即失效 ==========")
call("PATCH", f"/users/{user_id}/status", {"status": 0}, token=admin_tok, expect=200)
call("GET", "/users/me", token=user_tok2, expect=401)
st, relogin = call(
    "POST",
    "/auth/login",
    {"username": USERNAME, "password": "Passw0rd!"},
    expect=401,
)
# 停用账号对外只暴露「用户名或密码错误」，不泄露账号状态
check(code_of(relogin) == 40101, f"停用账号登录被拒（INVALID_CREDENTIALS 40101，实际 {code_of(relogin)}）")

print("========== P0-12. 非法角色值 → 400 ==========")
call("PATCH", f"/users/{user_id}/role", {"role": "superuser"}, token=admin_tok, expect=400)
call("PATCH", f"/users/{user_id}/status", {"status": 7}, token=admin_tok, expect=400)

print("========== P1-1. 越界 bigint 主键 → 400（此前 500）==========")
call("PATCH", f"/users/99999999999999999999999/role", {"role": "author"}, token=admin_tok, expect=400)
call("GET", "/posts/99999999999999999999999", expect=404)
call("GET", "/posts/18446744073709551616", expect=404)  # uint64 上限 +1

print("========== P1-2. 不存在的分类 → 400 而非 500 ==========")
st, bad_cat = call(
    "POST",
    "/posts",
    {"title": "坏分类", "content": "x", "categoryId": 999999},
    token=admin_tok,
    expect=400,
)
check(code_of(bad_cat) in (40000, 40004), f"分类不存在错误码 40000/40004（实际 {code_of(bad_cat)}）")
check(isinstance(bad_cat, dict) and bad_cat.get("code") != 50000, "不再是 INTERNAL(50000)")

print("========== P1-3. 重复 tagIds → 400（ArrayUnique 拦下，不再 P2002→500）==========")
st, tags = call("GET", "/tags", expect=200)
if isinstance(tags, list) and tags:
    tid = int(tags[0]["id"])
    st, dup = call(
        "POST",
        "/posts",
        {"title": "重复标签", "content": "x", "tagIds": [tid, tid]},
        token=admin_tok,
        expect=400,
    )
    check(isinstance(dup, dict) and dup.get("code") != 50000, "重复标签返回 4xx 而非 500")
else:
    print("       （库里没有标签，跳过）")

print("========== P1-4. 超大的 categoryId（JSON 数字溢出）→ 400 ==========")
st, overflow = call(
    "POST",
    "/posts",
    {"title": "溢出分类", "content": "x", "categoryId": 99999999999999999999999},
    token=admin_tok,
    expect=400,
)
check(isinstance(overflow, dict) and overflow.get("code") != 50000, "溢出 categoryId 返回 4xx 而非 500")

print("========== P1-5. 非法 parentId（超大数值）→ 400 ==========")
st, posts = call("GET", "/posts?pageSize=1", expect=200)
if isinstance(posts, dict) and posts.get("items"):
    slug = quote(posts["items"][0]["slug"])
    call(
        "POST",
        f"/posts/{slug}/comments",
        {"content": "回复", "authorName": "测试游客", "parentId": 99999999999999999999999},
        expect=400,
    )
else:
    print("       （库里没有已发布文章，跳过）")

print("========== P1-6. 上传：伪装成 PNG 的 HTML → 400（魔数嗅探）==========")
BOUNDARY = "----p0p1boundary"


def multipart(field, filename, ctype, content):
    eol = b"\r\n"
    body = b""
    body += b"--" + BOUNDARY.encode() + eol
    body += (
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"'
    ).encode() + eol
    body += f"Content-Type: {ctype}".encode() + eol + eol
    body += content + eol
    body += b"--" + BOUNDARY.encode() + b"--" + eol
    return body, f"multipart/form-data; boundary={BOUNDARY}"


def upload(token, filename, ctype, content, expect):
    body, ct = multipart("file", filename, ctype, content)
    req = urllib.request.Request(
        BASE + "/uploads",
        data=body,
        headers={"Content-Type": ct, "Authorization": "Bearer " + token},
        method="POST",
    )
    try:
        with opener.open(req, timeout=30) as r:
            status, payload = r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read().decode("utf-8", "replace")
    ok = status == expect
    print(f"  {'OK ' if ok else 'XX '}POST /uploads ({filename}, {ctype}) -> [{status}] (expect {expect})")
    if not ok:
        print("       body:", str(payload)[:300])
    try:
        return status, json.loads(payload)
    except Exception:  # noqa: BLE001
        return status, payload


st, fake = upload(admin_tok, "evil.png", "image/png", b"<html><body>x</body></html>", expect=400)
check(code_of(fake) in (40002,), f"伪装 HTML 被拒（UPLOAD_TYPE_INVALID 40002，实际 {code_of(fake)}）")

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)
st, real = upload(admin_tok, "ok.png", "image/png", PNG_1PX, expect=201)
check(isinstance(real, dict) and str(real.get("url", "")).startswith("/uploads/"), "真实 PNG 上传成功")

print("========== 清理 ==========")
if created_id:
    call("DELETE", f"/posts/{created_id}", token=admin_tok, expect=200)
# 停用测试账号（没有删除用户接口，避免留下可登录账号）
call("PATCH", f"/users/{user_id}/status", {"status": 0}, token=admin_tok, expect=200)
print(f"       测试账号 {USERNAME} 已停用；文章已删除")

print(f"\n===== P0/P1 回归 DONE: {PASS} passed, {FAIL} failed =====")
if FAILED_LABELS:
    print("失败用例：")
    for lb in FAILED_LABELS:
        print("  -", lb)
sys.exit(1 if FAIL else 0)
