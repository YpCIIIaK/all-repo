"""Мониторинг изменений поверхности атаки: новые поддомены, JS-бандлы, API-эндпоинты.

  python -m bb.monitor                 # все домены scope
  python -m bb.monitor arbuz.kz        # только один

Снимки: data/monitor/snapshot.json (последний), data/monitor/report-<date>.md (diff).
Все запросы к целям идут через SafeClient (scope, X-Bug-Bounty, rps).
"""
import sys, re, json, hashlib, datetime, pathlib, time
import requests
from urllib.parse import urljoin, urlsplit
from .config import load
from .client import SafeClient, OutOfScope
from .scope import in_scope

DATA = pathlib.Path("data/monitor"); DATA.mkdir(parents=True, exist_ok=True)
SNAP = DATA / "snapshot.json"

SCRIPT = re.compile(r'<(?:script|link)[^>]+(?:src|href)=["\']([^"\']+\.m?js(?:\?[^"\']*)?)["\']', re.I)
PRELOAD = re.compile(r'["\'](/assets/[\w.-]+\.js)["\']')
EP = [
    re.compile(r'["\'`]((?:https?://[a-z0-9.-]+)?/(?:api|v\d)/[^"\'`\s<>]{1,140})["\'`]', re.I),
    re.compile(r'\.(?:get|post|put|patch|delete|auth)\(\s*["\'`]([a-z][\w./{}:-]{2,100})["\'`]'),
    re.compile(r'endpoint:\s*[`"\']([^`"\']{2,120})[`"\']'),
]
TITLE = re.compile(rb"<title[^>]*>(.*?)</title>", re.I | re.S)


def crtsh(domain, tries=3):
    for i in range(tries):
        try:
            r = requests.get("https://crt.sh/", params={"q": f"%.{domain}", "output": "json"}, timeout=90)
            if r.ok:
                out = set()
                for row in r.json():
                    for n in row["name_value"].split("\n"):
                        n = n.strip().lower().lstrip("*.")
                        if n and (n == domain or n.endswith("." + domain)):
                            out.add(n)
                return out
        except Exception:
            pass
        time.sleep(5 * (i + 1))
    print(f"  ! crt.sh недоступен для {domain}")
    return None


def fetch_follow(c, url, hops=4):
    """GET с ручным следованием редиректам только внутри scope."""
    for _ in range(hops):
        r = c.get(url)
        loc = r.headers.get("Location")
        if r.status_code in (301, 302, 303, 307, 308) and loc:
            nxt = urljoin(url, loc)
            if not in_scope(nxt, c.cfg["scope"]):
                return r, url
            url = nxt; continue
        return r, url
    return r, url


def endpoints(js_text):
    found = set()
    for rx in EP:
        for m in rx.findall(js_text):
            m = m.strip()
            if len(m) > 2 and not m.endswith((".png", ".svg", ".css", ".webp", ".jpg", ".woff2")):
                found.add(m)
    return found


def scan_host(c, host):
    info = {"alive": False}
    for scheme in ("https", "http"):
        try:
            r, final = fetch_follow(c, f"{scheme}://{host}/")
        except Exception:
            continue
        t = TITLE.search(r.content[:30000])
        info = {"alive": True, "status": r.status_code, "url": final,
                "title": t.group(1).decode(errors="ignore").strip()[:100] if t else None,
                "cf_block": "Attention Required! | Cloudflare" in r.text[:3000], "js": {}, "endpoints": []}
        if r.status_code != 200 or info["cf_block"]:
            return info
        srcs = set(SCRIPT.findall(r.text)) | set(PRELOAD.findall(r.text))
        eps = set()
        for s in sorted(srcs)[:40]:
            u = urljoin(final, s)
            if "ruxitagent" in u or "cdn-cgi" in u:
                continue
            try:
                j = c.get(u)
            except (OutOfScope, Exception):
                continue
            if j.status_code != 200:
                continue
            key = urlsplit(u)._replace(query="").geturl()
            info["js"][key] = hashlib.sha1(j.content).hexdigest()[:12]
            eps |= endpoints(j.text)
        info["endpoints"] = sorted(eps)
        return info
    return info


def diff(old, new):
    lines = []
    for dom, d in new.items():
        o = old.get(dom, {"hosts": {}})
        oh, nh = o["hosts"], d["hosts"]
        sec = []
        added = sorted(set(nh) - set(oh))
        if added: sec.append("**Новые поддомены:** " + ", ".join(f"`{h}`" + (" (жив)" if nh[h].get("alive") else "") for h in added))
        woke = sorted(h for h in nh if h in oh and nh[h].get("alive") and not oh[h].get("alive"))
        if woke: sec.append("**Ожили:** " + ", ".join(f"`{h}`" for h in woke))
        for h in sorted(nh):
            if h not in oh or not nh[h].get("alive"):
                continue
            ojs, njs = oh[h].get("js", {}), nh[h].get("js", {})
            newjs = sorted(set(njs) - set(ojs)); chjs = sorted(k for k in njs if k in ojs and njs[k] != ojs[k])
            neweps = sorted(set(nh[h].get("endpoints", [])) - set(oh[h].get("endpoints", [])))
            gone = sorted(set(oh[h].get("endpoints", [])) - set(nh[h].get("endpoints", [])))
            if newjs or chjs or neweps or gone:
                sec.append(f"- `{h}`: JS новых {len(newjs)}, изменённых {len(chjs)}")
                for e in neweps[:60]: sec.append(f"  - ➕ `{e}`")
                for e in gone[:20]: sec.append(f"  - ➖ `{e}`")
        if sec:
            lines += [f"### {dom}"] + sec + [""]
    return lines


def main(only=None):
    cfg = load(); c = SafeClient(cfg, log_path="logs/monitor_requests.jsonl")
    old = json.loads(SNAP.read_text()) if SNAP.exists() else {}
    new = {}
    for item in cfg["scope"]:
        pat = item["pattern"]; dom = pat[2:] if pat.startswith("*.") else pat
        if only and dom != only:
            if dom in old: new[dom] = old[dom]
            continue
        print(f"== {dom}")
        if pat.startswith("*."):
            names = crtsh(dom)
            if names is None:                      # crt.sh упал — прошлый снимок + state.db
                names = set(old.get(dom, {}).get("hosts", {}))
                try:
                    import sqlite3
                    names |= {r[0] for r in sqlite3.connect("state.db").execute(
                        "select host from hosts where service=?", (pat,))}
                except Exception:
                    pass
                names = names or {dom}
        else:
            names = {dom}
        names = {n for n in names if in_scope(n, cfg["scope"])}
        hosts = {}
        for i, h in enumerate(sorted(names), 1):
            hosts[h] = scan_host(c, h)
            hi = hosts[h]
            if hi["alive"]:
                print(f"  [{i}/{len(names)}] {h} {hi['status']} {'CF-BLOCK ' if hi.get('cf_block') else ''}"
                      f"js={len(hi.get('js', {}))} eps={len(hi.get('endpoints', []))}")
        new[dom] = {"scanned": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"), "hosts": hosts}
    SNAP.write_text(json.dumps(new, ensure_ascii=False, indent=1, sort_keys=True))
    today = datetime.date.today().isoformat()
    if not old:
        body = ["Базовый снимок создан, сравнивать пока не с чем.", ""]
        for dom, d in new.items():
            alive = [h for h, v in d["hosts"].items() if v.get("alive")]
            eps = sum(len(v.get("endpoints", [])) for v in d["hosts"].values())
            body.append(f"- **{dom}**: хостов {len(d['hosts'])}, живых {len(alive)}, эндпоинтов {eps}")
    else:
        body = diff(old, new) or ["Изменений нет."]
    rep = DATA / f"report-{today}.md"
    rep.write_text(f"# Monitor {today}\n\n" + "\n".join(body) + "\n")
    print("\n".join(body)); print(f"\n-> {rep}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
