"""Ручное тестирование через браузер/Burp:
   mitmdump -s mitm_addon.py -p 8081 --set account=A     (сессия аккаунта A)
   mitmdump -s mitm_addon.py -p 8082 --set account=B     (сессия аккаунта B)
Добавляет X-Bug-Bounty, блокирует out-of-scope, ограничивает rps,
пишет in-scope трафик в flows.db (для authz/twin модулей)."""
from mitmproxy import http, ctx
from bb.config import load
from bb.scope import in_scope
from bb.client import RateLimiter
from bb.flows import Flows

cfg = load(); lim = RateLimiter(cfg["rps"]); store = Flows()
STATIC = (".js", ".css", ".png", ".jpg", ".svg", ".woff", ".woff2", ".ico", ".gif", ".map")

def load_options(loader):
    loader.add_option("account", str, "A", "чья это сессия: A или B")

def request(flow: http.HTTPFlow):
    if not in_scope(flow.request.pretty_host, cfg["scope"]):
        flow.response = http.Response.make(403, b"blocked: out of scope"); return
    flow.request.headers["X-Bug-Bounty"] = cfg["nickname"]
    lim.wait()

def response(flow: http.HTTPFlow):
    rq = flow.request
    if flow.response is None or rq.path.split("?")[0].lower().endswith(STATIC): return
    if not in_scope(rq.pretty_host, cfg["scope"]): return
    store.add(ctx.options.account, rq.method, rq.pretty_url,
              {k: v for k, v in rq.headers.items() if k.lower() not in ("x-bug-bounty", "content-length")},
              rq.get_text(strict=False) or "", flow.response.status_code,
              flow.response.get_text(strict=False) or "")
