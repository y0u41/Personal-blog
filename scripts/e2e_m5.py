"""M5 端到端验证：评论（含审核/树形）、图片上传（白名单/超限/权限）、限流。

依赖：API 运行在 127.0.0.1:3000，MySQL 已初始化（admin/admin12345 存在），
      库中至少有一篇 published 文章。

注意：限流计数保存在 API 进程内存中，脚本最后一步会故意打满 /auth/login 的
      5 次/分钟配额；如需再次运行，先重启 API 以重置计数。
"""

import base64
import http.cookiejar
import json
import random
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "http://127.0.0.1:3000/api"
ORIGIN = "http://127.0.0.1:3000"
SUFFIX = str(random.randint(1000, 9999))

opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
)

PASS = 0
FAIL = 0


def check(cond, label):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        print(f"  [FAIL] {label}")


def call(method, path, body=None, token=None, expect=None, raw=None, ctype=None):
    url = BASE + path
    headers = {}
    data = None
    if raw is not None:
        data = raw
        headers["Content-Type"] = ctype
    elif body is not None:
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
    try:
        parsed = json.loads(payload)
    except Exception:
        parsed = payload
    ok = expect is None or status == expect
    print(f"  {'OK ' if ok else 'XX '}{method} {path} -> [{status}] (expect {expect})")
    if not ok:
        print("       body:", str(parsed)[:300])
    return status, parsed


# ---------------- multipart 上传 ----------------
def multipart(fields, files):
    """files: list of (field, filename, content_type, bytes)"""
    boundary = "----blogboundary" + str(random.randint(10**8, 10**9))
    eol = b"\r\n"
    buf = b""
    for name, value in fields.items():
        buf += b"--" + boundary.encode() + eol
        buf += f'Content-Disposition: form-data; name="{name}"'.encode() + eol + eol
        buf += str(value).encode() + eol
    for field, filename, ctype, content in files:
        buf += b"--" + boundary.encode() + eol
        buf += (
            f'Content-Disposition: form-data; name="{field}"; filename="{filename}"'
        ).encode() + eol
        buf += f"Content-Type: {ctype}".encode() + eol + eol
        buf += content + eol
    buf += b"--" + boundary.encode() + b"--" + eol
    return buf, f"multipart/form-data; boundary={boundary}"


PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)

print("========== M5-1. 准备：登录 admin + 取一篇 published 文章 ==========")
_, adm = call("POST", "/auth/login", {"username": "admin", "password": "admin12345"}, expect=200)
admin_tok = adm["accessToken"]
_, lst = call("GET", "/posts?pageSize=1", expect=200)
assert lst["items"], "库里没有 published 文章，请先跑 e2e_smoke.py 或 seed"
slug = lst["items"][0]["slug"]
SLUG = quote(slug)  # 中文标题生成的 slug 需 URL 编码
print("       target slug:", slug)

print("========== M5-2. 公开评论列表（初始为空或仅已过审）==========")
st, tree0 = call("GET", f"/posts/{SLUG}/comments", expect=200)
base_total = tree0["total"]
print("       initial approved comments:", base_total)

print("========== M5-3. 游客发表评论（无 token）→ pending，不进入公开列表 ==========")
st, guest = call(
    "POST",
    f"/posts/{SLUG}/comments",
    {"content": "游客评论：这篇文章很有帮助", "authorName": "路过的游客"},
    expect=201,
)
check(guest.get("status") == "pending", "游客评论状态为 pending")
check(guest.get("userId") is None, "游客评论 userId 为空")
guest_id = guest["id"]
check(isinstance(guest_id, str), "评论 id 已序列化为 string")
_, tree1 = call("GET", f"/posts/{SLUG}/comments", expect=200)
check(tree1["total"] == base_total, "pending 评论不出现在公开列表")

print("========== M5-4. 游客昵称过短 → 400 ==========")
call("POST", f"/posts/{SLUG}/comments", {"content": "x", "authorName": "a"}, expect=400)

print("========== M5-5. 游客内容为空 → 400 ==========")
call("POST", f"/posts/{SLUG}/comments", {"content": "   ", "authorName": "正常昵称"}, expect=400)

print("========== M5-6. admin 发表评论 → 自动过审 approved ==========")
st, adm_c = call(
    "POST",
    f"/posts/{SLUG}/comments",
    {"content": "作者/管理员回复：谢谢支持！"},
    token=admin_tok,
    expect=201,
)
check(adm_c.get("status") == "approved", "管理员评论自动过审")
check(adm_c.get("user") is not None, "登录用户评论带 user 信息")
adm_cid = adm_c["id"]

print("========== M5-7. 游客回复 admin 评论（parentId）→ pending ==========")
st, rep = call(
    "POST",
    f"/posts/{SLUG}/comments",
    {"content": "追问一句：有配套示例吗？", "authorName": "路过的游客", "parentId": int(adm_cid)},
    expect=201,
)
check(rep.get("parentId") == adm_cid, "回复的 parentId 正确")
rep_id = rep["id"]

print("========== M5-8. 非法 parentId → 400 ==========")
call(
    "POST",
    f"/posts/{SLUG}/comments",
    {"content": "回复不存在的评论", "authorName": "游客甲", "parentId": 999999999},
    expect=400,
)

print("========== M5-9. 管理端：pending 列表（admin）==========")
st, pend = call("GET", "/comments?status=pending&pageSize=50", token=admin_tok, expect=200)
check(pend["meta"]["total"] >= 2, f"pending 至少 2 条（实际 {pend['meta']['total']}）")
check(any(c["id"] == guest_id for c in pend["items"]), "pending 列表含游客评论")
check(all(c.get("post") for c in pend["items"]), "管理端列表带 post 信息")

print("========== M5-10. reader 访问管理端列表 → 403 ==========")
_, reg = call(
    "POST",
    "/auth/register",
    {"username": f"carol{SUFFIX}", "email": f"carol{SUFFIX}@example.com", "password": "Passw0rd!"},
    expect=201,
)
carol_tok = reg["accessToken"]
carol_id = reg["user"]["id"]
call("GET", "/comments?status=pending", token=carol_tok, expect=403)

print("========== M5-11. admin 审核通过游客评论 ==========")
st, appr = call("PATCH", f"/comments/{guest_id}", {"status": "approved"}, token=admin_tok, expect=200)
check(appr.get("status") == "approved", "审核后状态为 approved")
_, tree2 = call("GET", f"/posts/{SLUG}/comments", expect=200)
check(tree2["total"] == base_total + 2, f"公开列表 +2（实际 {tree2['total']}）")
found = [c for c in tree2["items"] if c["id"] == adm_cid]
check(len(found) == 1, "admin 评论在公开树中")
if found:
    check(all(ch["id"] != rep_id for ch in found[0]["children"]),
          "pending 的回复仍不显示（未过审）")

print("========== M5-12. 非法审核状态 → 400 ==========")
call("PATCH", f"/comments/{guest_id}", {"status": "whatever"}, token=admin_tok, expect=400)

print("========== M5-13. 上传：无 token → 401 / reader → 403 ==========")
body, ctype = multipart({}, [("file", "a.png", "image/png", PNG_1PX)])
call("POST", "/uploads", raw=body, ctype=ctype, expect=401)
body2, ctype2 = multipart({}, [("file", "a.png", "image/png", PNG_1PX)])
call("POST", "/uploads", raw=body2, ctype=ctype2, token=carol_tok, expect=403)

print("========== M5-14. 上传合法 PNG → 201，且可通过 /uploads 访问 ==========")
body3, ctype3 = multipart({}, [("file", "shot.png", "image/png", PNG_1PX)])
st, up = call("POST", "/uploads", raw=body3, ctype=ctype3, token=admin_tok, expect=201)
if isinstance(up, dict) and up.get("url"):
    print("       uploaded url:", up["url"], "size:", up.get("size"))
    check(up["url"].startswith("/uploads/"), "返回相对 url")
    try:
        with opener.open(ORIGIN + up["url"], timeout=10) as r:
            check(r.status == 200 and r.headers.get("Content-Type", "").startswith("image/"),
                  "静态托管可访问且 Content-Type 为图片")
    except Exception as e:  # noqa: BLE001
        check(False, f"静态托管访问失败: {e}")

print("========== M5-15. 上传非法类型（.txt / text/plain）→ 400 ==========")
body4, ctype4 = multipart({}, [("file", "evil.txt", "text/plain", b"hello")])
st, bad = call("POST", "/uploads", raw=body4, ctype=ctype4, token=admin_tok, expect=400)
if isinstance(bad, dict):
    check(bad.get("code") == 40002, "错误码为 UPLOAD_TYPE_INVALID(40002)")

print("========== M5-16. 伪装扩展名（.png 但 text/plain）→ 400 ==========")
body5, ctype5 = multipart({}, [("file", "fake.png", "text/plain", b"not an image")])
call("POST", "/uploads", raw=body5, ctype=ctype5, token=admin_tok, expect=400)

print("========== M5-17. 超出大小上限（6MB）→ 413 ==========")
big = b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024)
body6, ctype6 = multipart({}, [("file", "big.png", "image/png", big)])
st, over = call("POST", "/uploads", raw=body6, ctype=ctype6, token=admin_tok, expect=413)
if isinstance(over, dict):
    check(over.get("code") == 40003, "错误码为 UPLOAD_TOO_LARGE(40003)")

print("========== M5-18. 删除评论：他人不可删（reader 删 admin 评论 → 403）==========")
call("DELETE", f"/comments/{adm_cid}", token=carol_tok, expect=403)

print("========== M5-19. admin 删除已过审游客评论 → 200，公开列表恢复 ==========")
call("DELETE", f"/comments/{guest_id}", token=admin_tok, expect=200)
_, tree3 = call("GET", f"/posts/{SLUG}/comments", expect=200)
check(all(c["id"] != guest_id for c in tree3["items"]), "删除后公开列表不再包含该评论")
check(tree3["total"] == base_total + 1, f"公开列表回到 +1（实际 {tree3['total']}）")

print("========== M5-19b. 清理本脚本造的数据（既往版本会残留评论与账号） ==========")
# admin 自己的评论与游客对它的回复都会留在库里，逐条删掉
call("DELETE", f"/comments/{adm_cid}", token=admin_tok, expect=200)
call("DELETE", f"/comments/{rep_id}", token=admin_tok, expect=200)
_, tree4 = call("GET", f"/posts/{SLUG}/comments", expect=200)
check(tree4["total"] == base_total, f"公开评论数回到基线（实际 {tree4['total']}）")
if carol_id:
    call("PATCH", f"/users/{carol_id}/status", {"status": 0}, token=admin_tok, expect=200)
    print(f"       carol{SUFFIX} 已停用（无删除用户接口）")
print("       注意：上传的临时图片无删除接口，需从 uploads 卷手动清理")

print("========== M5-20. 限流：/auth/login 5 次/分钟（第 6 次 429）==========")
statuses = []
for i in range(1, 8):
    st, _ = call("POST", "/auth/login", {"username": "nobody", "password": "wrong-pass"})
    statuses.append(st)
    if st == 429:
        print(f"       throttled at attempt #{i} (overall attempts include 1 earlier login)")
        break
check(429 in statuses, f"触发 429（状态序列 {statuses}）")
st, t = call("POST", "/auth/login", {"username": "nobody", "password": "wrong-pass"})
if isinstance(t, dict):
    check(t.get("code") == 42900, "限流错误码为 TOO_MANY_REQUESTS(42900)")
    check("频繁" in str(t.get("message", "")), "限流返回中文文案")

print(f"\n===== M5 E2E DONE: {PASS} passed, {FAIL} failed =====")
raise SystemExit(1 if FAIL else 0)
