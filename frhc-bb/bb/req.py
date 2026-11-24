"""Одиночный запрос для работы в сессии: python -m bb.req METHOD URL [--as A|B] [-H 'K: V'] [-d BODY] [--full]
Через SafeClient (scope, X-Bug-Bounty, rps, лог). Ответ маскируется. Каждый вызов пишется в logs/hypotheses.md."""
import argparse, datetime, sys
from .config import load
from .client import SafeClient
from .report import mask

p = argparse.ArgumentParser()
p.add_argument("method"); p.add_argument("url")
p.add_argument("--as", dest="acct", choices=["A", "B"])
p.add_argument("-H", action="append", default=[])
p.add_argument("-d", "--data")
p.add_argument("--hyp", default="", help="гипотеза, которую проверяем")
p.add_argument("--full", action="store_true")
p.add_argument("--follow", action="store_true")
a = p.parse_args()

cfg = load(); c = SafeClient(cfg)
hdr = dict(h.split(":", 1) for h in a.H); hdr = {k.strip(): v.strip() for k, v in hdr.items()}
r = c.request(a.method.upper(), a.url, account=a.acct, headers=hdr,
              data=a.data.encode() if a.data else None, allow_redirects=a.follow)
body = mask(r.text)
print(f"HTTP {r.status_code}  len={len(r.content)}  type={r.headers.get('Content-Type')}")
for k in ("Server", "Location", "Set-Cookie", "Access-Control-Allow-Origin", "Access-Control-Allow-Credentials", "WWW-Authenticate"):
    if k in r.headers: print(f"{k}: {mask(r.headers[k])[:200]}")
print("-" * 40); print(body if a.full else body[:3000])
with open("logs/hypotheses.md", "a") as f:
    f.write(f"- {datetime.datetime.now(datetime.UTC):%Y-%m-%d %H:%M} `{a.method} {a.url}` as={a.acct} -> {r.status_code} len={len(r.content)} | {a.hyp}\n")
