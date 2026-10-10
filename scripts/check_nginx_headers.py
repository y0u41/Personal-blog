"""Nginx 层回归：安全响应头、静态 404、SPA 回退、上传目录加固。

只打 Web 入口（默认 http://127.0.0.1:8080），用于验证 apps/web/nginx.conf：
  - /、/assets/、/api/ 都带上 X-Content-Type-Options / X-Frame-Options /
    Referrer-Policy / Permissions-Policy / CSP（add_header 是覆盖式继承，容易漏）
  - 带扩展名且不存在的静态请求返回真 404，而不是 200 + index.html（软 404）
  - 页面路由（无扩展名）仍正确回退到 index.html
  - /uploads/ 额外带 nosniff 与 sandbox CSP

用法：BASE_WEB=http://127.0.0.1:8080 python scripts/check_nginx_headers.py
"""

import email.message
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_WEB", "http://127.0.0.1:8080").rstrip("/")

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

PASS = 0
FAIL = 0
FAILED = []


def check(cond, label):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        FAILED.append(label)
        print(f"  [FAIL] {label}")


def fetch(path):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with opener.open(req, timeout=15) as r:
            # 返回原始 HTTPMessage（而不是 dict），以保留重复头（如多条 Cache-Control）
            return r.status, r.headers, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return -1, email.message.Message(), str(e)


REQUIRED = [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Content-Security-Policy",
]


def assert_headers(headers, label):
    missing = [h for h in REQUIRED if not headers.get(h)]
    check(not missing, f"{label} 具备全部安全头" + (f"（缺 {missing}）" if missing else ""))
    check(
        headers.get("X-Content-Type-Options") == "nosniff",
        f"{label} X-Content-Type-Options=nosniff",
    )


print("========== N-1. 首页 / 的安全头 ==========")
status, headers, body = fetch("/")
check(status == 200, f"GET / -> 200（实际 {status}）")
assert_headers(headers, "GET /")

print("========== N-2. 页面路由（无扩展名）回退到 SPA ==========")
status, headers, body = fetch("/login")
check(status == 200, f"GET /login -> 200（实际 {status}）")
assert_headers(headers, "GET /login")

print("========== N-3. 带扩展名的静态请求：不存在必须是真 404 ==========")
status, headers, _ = fetch("/definitely-not-here.png")
check(status == 404, f"GET /definitely-not-here.png -> 404（实际 {status}）")
status, _, _ = fetch("/main.js")
check(status == 404, f"GET /main.js -> 404（实际 {status}）")

print("========== N-4. 真实静态资源仍可访问且有长缓存 ==========")
status, headers, body = fetch("/")
m = re.search(r'src="(/assets/[^"]+)"', body)
if m:
    asset = m.group(1)
    status, headers, _ = fetch(asset)
    check(status == 200, f"GET {asset} -> 200（实际 {status}）")
    all_cc = headers.get_all("Cache-Control") or []
    cc = ", ".join(all_cc) if all_cc else headers.get("Cache-Control", "")
    check(len(all_cc) <= 1, f"{asset} 只有一条 Cache-Control（实际 {len(all_cc)} 条）")
    check(
        "immutable" in cc and "max-age=2592000" in cc,
        f"{asset} 带 immutable 长缓存（实际 {cc!r}）",
    )
    assert_headers(headers, f"GET {asset}")
else:
    print("       （首页未找到 /assets/ 引用，跳过）")

print("========== N-5. /api 反代带上安全头且 404 语义正确 ==========")
# 注意：构建期与运行期健康探针都在根路径 /healthz（未加 /api 前缀），
# 这里用真实的业务接口验证反代
status, headers, _ = fetch("/api/posts?pageSize=1")
check(status == 200, f"GET /api/posts?pageSize=1 -> 200（实际 {status}）")
assert_headers(headers, "GET /api/posts")
status, _, _ = fetch("/api/definitely-not-a-route")
check(status == 404, f"GET /api/definitely-not-a-route -> 404（实际 {status}）")

print("========== N-6. 上传目录是不可信内容，额外带 nosniff + sandbox ==========")
# 找一个已存在的上传文件：通过 API 上传接口拿不到列表，这里直接列出容器卷不可行，
# 改为断言「即使文件不存在，/uploads/ 的响应头也必须是加固后的」
status, headers, _ = fetch("/uploads/__not_exist__.png")
check(
    headers.get("X-Content-Type-Options") == "nosniff",
    f"/uploads/ 带 nosniff（实际 {headers.get('X-Content-Type-Options')!r}）",
)
csp = headers.get("Content-Security-Policy", "")
check("sandbox" in csp, f"/uploads/ CSP 含 sandbox（实际 {csp!r}）")
check(
    "X-Frame-Options" not in headers or headers.get("X-Frame-Options") == "SAMEORIGIN",
    "/uploads/ 未被误加宽松的 frame 策略",
)

print(f"\n===== Nginx 回归 DONE: {PASS} passed, {FAIL} failed =====")
if FAILED:
    print("失败用例：")
    for lb in FAILED:
        print("  -", lb)
sys.exit(1 if FAIL else 0)
