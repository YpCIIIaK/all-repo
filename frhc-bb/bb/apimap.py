"""Статический анализатор API по JS-бандлам: дерево эндпоинтов, параметры, связи, оценка «слабых мест».

  python -m bb.apimap out/arbuz  bundle1.js bundle2.js ...     # из локальных файлов (к цели не ходит)
  python -m bb.apimap out/site   --url https://site/           # скачать страницу и её JS через SafeClient

Результат: <out>/apimap.json и <out>/apimap.html (интерактивное дерево).
"""
import re, sys, json, pathlib, collections
from urllib.parse import urljoin

# ---------- извлечение вызовов ----------
Q = r'(?:"([^"\n]{1,200}?)"|\'([^\'\n]{1,200}?)\'|`([^`]{1,200}?)`)'
PATTERNS = [
    # axios-like: x.get("path", ...)  /  r.a.auth("post","token")
    ("call", re.compile(r'\.(get|post|put|patch|delete|head)\(\s*' + Q, re.S)),
    ("auth", re.compile(r'\.auth\(\s*["\'](get|post|put|patch|delete)["\']\s*,\s*' + Q, re.S)),
    # fetch("path", {method:"POST"})
    ("fetch", re.compile(r'\bfetch\(\s*' + Q, re.S)),
    # {endpoint:`/x/${id}`, method:"GET"} / {url:"/x", method:"post"}
    ("obj", re.compile(r'\b(?:endpoint|url|uri|path)\s*:\s*' + Q, re.S)),
]
METHOD_NEAR = re.compile(r'method\s*:\s*["\']([A-Za-z]+)["\']')
API_HINT = re.compile(r'(^/?(api|v\d|graphql|rest|auth|oauth)\b)|(/(api|v\d)/)|^[a-z][\w-]*/[\w{}/.:-]+$', re.I)
STATIC = re.compile(r'\.(png|jpe?g|svg|gif|webp|css|woff2?|ttf|ico|map|mp4|html?)(\?|$)', re.I)
TEMPLATE = re.compile(r'\$\{\s*([^}]*)\}')
KEYS = re.compile(r'[{,]\s*["\']?([A-Za-z_$][\w$]{1,40})["\']?\s*:')
AUTH_CTX = re.compile(r'(token\.use|Authorization|Bearer|ACCESS_TOKEN|withCredentials|getToken|accessToken)', re.I)
NOAUTH_CTX = re.compile(r'(noAuth|skipAuth|anonymous|isPublic)', re.I)


def norm_path(p):
    p = TEMPLATE.sub(lambda m: "{" + (re.sub(r'[^\w]', '', m.group(1).split(".")[-1]) or "x") + "}", p)
    p = re.sub(r'^https?://[^/]+', '', p)
    p = p.split("?")[0].split("#")[0]
    p = re.sub(r'/:([A-Za-z_]\w*)', r'/{\1}', p)
    p = re.sub(r'//+', '/', p).strip()
    return p


def looks_api(p):
    if not p or len(p) < 3 or " " in p or STATIC.search(p) or p.startswith(("data:", "#", "./", "../")):
        return False
    if p.count("/") == 0:
        return False
    return bool(API_HINT.search(p))


def extract(text, src):
    found = []
    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            gs = m.groups()
            q = next((x for x in gs[-3:] if x is not None), "")
            if kind == "call":
                method, raw = gs[0].upper(), q
            elif kind == "auth":
                method, raw = gs[0].upper(), "auth/" + q
            else:
                raw, method = q, None
            path = norm_path(raw)
            if not looks_api(path):
                continue
            before, after = text[max(0, m.start() - 220):m.start()], text[m.end():m.end() + 320]
            if method is None:
                mm = METHOD_NEAR.search(text[max(0, m.start() - 120):m.end() + 200])
                method = mm.group(1).upper() if mm else "GET"
            # поля тела/параметров: ключи первого объектного литерала после вызова
            fields = []
            obj = re.search(r'\{[^{}]{0,260}\}', after)
            if obj:
                fields = [k for k in KEYS.findall(obj.group(0)) if k not in ("headers", "method", "timeout", "params", "where")]
            found.append({
                "method": method, "path": path, "raw": raw[:160], "kind": kind,
                "fields": sorted(set(fields))[:20],
                "auth_hint": "yes" if AUTH_CTX.search(before + after) else ("no" if NOAUTH_CTX.search(before + after) else "?"),
                "src": src, "offset": m.start(),
                "ctx": re.sub(r'\s+', ' ', (before[-120:] + "⟦" + text[m.start():m.end()] + "⟧" + after[:160]))[:420],
            })
    return found


# ---------- оценка ----------
RULES = [
    (r'\{[^}]+\}', 3, "ID в пути → IDOR"),
    (r'(^|/)(admin|internal|debug|test|staff|manager|operator|backoffice|superuser)(/|$|-)', 4, "служебная/админ-функция"),
    (r'(upload|import|file|attach|document|avatar|image|media)', 3, "загрузка/файлы"),
    (r'(export|download|report|backup|dump|log)', 2, "выгрузка данных"),
    (r'(pay|card|transaction|wallet|refund|withdraw|transfer|balance|bonus|cashback|promo|coupon|subscription)', 2, "деньги/бонусы"),
    (r'(auth|token|otp|password|reset|login|sms|verify|session|sso|oauth)', 2, "аутентификация"),
    (r'(callback|webhook|redirect|return|proxy|fetch|url|link|hydrate)', 3, "внешний URL/перенаправление (SSRF/redirect)"),
    (r'(user|profile|account|customer|client|address|order|application)', 1, "персональные данные"),
    (r'(graphql)', 3, "GraphQL"),
]
FIELD_RULES = [
    (r'^(url|uri|link|callback\w*|webhook\w*|redirect\w*|returnUrl|imageUrl|src)$', 3, "поле-URL в теле"),
    (r'^(role|roles|isAdmin|is_admin|admin|permissions?|status|state|verified|isVerified|isBankClient|level|tier)$', 3, "поле прав/статуса (mass assignment)"),
    (r'^(amount|price|sum|total|cost|discount|quantity|currency|balance)$', 2, "поле суммы (подмена)"),
    (r'(userId|user_id|ownerId|customerId|clientId|accountId|cardId|orderId|cartId|uuid|iin)$', 2, "чужой ID в теле"),
]
WRITE = {"POST": 1, "PUT": 2, "PATCH": 2, "DELETE": 2}


def score(ep):
    s, why = 0, []
    p = ep["path"].lower()
    for rx, w, label in RULES:
        if re.search(rx, p):
            s += w; why.append(label)
    for m in ep["methods"]:
        if m in WRITE:
            s += WRITE[m]; why.append(f"запись ({m})"); break
    for f in ep["fields"]:
        for rx, w, label in FIELD_RULES:
            if re.search(rx, f):
                s += w; why.append(f"{label}: {f}")
    if ep["auth_hint"] == "no":
        s += 2; why.append("во фронте без токена")
    return s, list(dict.fromkeys(why))


# ---------- сборка ----------
def build(calls):
    eps = {}
    for c in calls:
        key = c["path"].lstrip("/")
        e = eps.setdefault(key, {"path": key, "methods": set(), "fields": set(), "auth_hint": set(), "sites": []})
        e["methods"].add(c["method"]); e["fields"].update(c["fields"]); e["auth_hint"].add(c["auth_hint"])
        if len(e["sites"]) < 4:
            e["sites"].append({"src": c["src"], "offset": c["offset"], "ctx": c["ctx"]})
    out = []
    for e in eps.values():
        ah = e["auth_hint"]
        e2 = {"path": e["path"], "methods": sorted(e["methods"]), "fields": sorted(e["fields"]),
              "auth_hint": "yes" if "yes" in ah else ("no" if ah == {"no"} else "?"), "sites": e["sites"],
              "params": re.findall(r'\{(\w+)\}', e["path"])}
        e2["score"], e2["why"] = score(e2)
        out.append(e2)
    # связи: общие имена параметров/полей (кто «производит» и кто «потребляет» идентификатор)
    by = collections.defaultdict(list)
    for e in out:
        for n in set(e["params"]) | {f for f in e["fields"] if re.search(r'(id|Id|uuid|token|code)$', f)}:
            by[n.lower()].append(e["path"])
    links = [{"param": n, "endpoints": sorted(set(v))} for n, v in by.items() if len(set(v)) > 1 and n not in ("id", "x", "e", "t", "n")]
    return sorted(out, key=lambda e: -e["score"]), links


def tree(eps):
    root = {"name": "/", "children": {}}
    for e in eps:
        node = root
        segs = [s for s in e["path"].split("/") if s]
        for s in segs:
            node = node["children"].setdefault(s, {"name": s, "children": {}})
        node.setdefault("eps", []).append(e["path"])
    def conv(n):
        ch = [conv(c) for c in n["children"].values()]
        d = {"name": n["name"]}
        if ch: d["children"] = sorted(ch, key=lambda c: c["name"])
        if n.get("eps"): d["ep"] = n["eps"][0]
        return d
    return conv(root)


def _match(static, real):
    """Совпадает ли статический путь (с {param}) с хвостом реального пути."""
    a, b = static.strip("/").split("/"), real.strip("/").split("/")
    if len(a) > len(b): return False
    for x, y in zip(reversed(a), reversed(b)):
        if not (x == y or x.startswith("{") or y.startswith("{")): return False
    return True


def canon(path, eps):
    best = None
    for e in eps:
        if e["path"] == path: return path
        if _match(e["path"], path) and (best is None or len(e["path"]) > len(best)): best = e["path"]
    return best or path


def merge_observed(eps, observed):
    """Склеивает реальный трафик со статикой: HAR-путь /api/v1/cart/{uuid} ↔ static cart/{id}."""
    by = {e["path"]: e for e in eps}
    for real, o in observed.items():
        key = canon(real, eps)
        e = by.get(key)
        if e is None: continue
        e["observed"] = dict(o, real_path=o.get("real_path", real))
        if not e.get("auth_hint") or e["auth_hint"] == "?":
            e["auth_hint"] = "yes" if o["auth_headers"] else "no"
        extra = [k.split(".")[-1].strip("[]") for k in o["resp_keys"] if re.search(r'(?i)(email|phone|iin|address|card|token|password|secret|passport|birth)', k)]
        if extra:
            e["why"] = list(dict.fromkeys(e["why"] + [f"в ответе чувствительные поля: {', '.join(sorted(set(extra))[:6])}"]))
            e["score"] += 2
        if any(str(st).startswith("2") for st in o["status"]) and "{" in e["path"]:
            e["why"].append("ID-эндпоинт реально отвечает 2xx")
    return sorted(by.values(), key=lambda e: -e["score"])


def main():
    for st in (sys.stdout, sys.stderr):            # консоль Windows (cp1251/cp866)
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    args = sys.argv[1:]
    out = pathlib.Path(args[0]); out.mkdir(parents=True, exist_ok=True)
    calls = []
    if len(args) > 2 and args[1] == "--url":
        from .config import load
        from .client import SafeClient
        c = SafeClient(load()); base = args[2]
        page = c.get(base).text
        srcs = set(re.findall(r'<(?:script|link)[^>]+(?:src|href)=["\']([^"\']+\.m?js[^"\']*)', page, re.I))
        srcs |= set(re.findall(r'["\'](/assets/[\w.-]+\.js)["\']', page))
        calls += extract(page, base)
        for s in sorted(srcs):
            u = urljoin(base, s)
            if "ruxitagent" in u or "cdn-cgi" in u: continue
            try:
                r = c.get(u)
                if r.ok: calls += extract(r.text, u.split("/")[-1])
            except Exception as e:
                print("skip", u, e)
    observed, flows, sources, har_calls = {}, [], [], []
    if not (len(args) > 2 and args[1] == "--url"):
        for f in args[1:]:
            fp = pathlib.Path(f); sources.append(fp.name)
            if fp.suffix.lower() == ".har":
                from . import har
                hc, ob, fl, jsb = har.load(fp)
                har_calls += hc; observed.update(ob); flows += fl
                for name, body in jsb:
                    calls += extract(body, name)
            else:
                calls += extract(fp.read_text(encoding="utf-8", errors="ignore"), fp.name)
    if har_calls:                                   # реальные пути -> канонические статические
        static_eps, _ = build(calls) if calls else ([], [])
        for hc in har_calls:
            hc["path"] = canon(hc["path"], static_eps)
        observed = {canon(k, static_eps): dict(v, real_path=k) for k, v in observed.items()}
        flows = [dict(f, **{"from": canon(f["from"], static_eps), "to": canon(f["to"], static_eps)}) for f in flows]
        calls += har_calls
    eps, links = build(calls)
    eps = merge_observed(eps, observed)
    flows = [dict(f, **{"from": canon(f["from"], eps), "to": canon(f["to"], eps)}) for f in flows]
    data = {"endpoints": eps, "links": links, "flows": flows, "sources": sources, "tree": tree(eps)}
    (out / "apimap.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tpl = (pathlib.Path(__file__).parent / "apimap_template.html").read_text(encoding="utf-8")
    (out / "apimap.html").write_text(tpl.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    print(f"вызовов {len(calls)}, эндпоинтов {len(eps)}, связей {len(links)} -> {out}/apimap.html")
    for e in eps[:15]:
        print(f"{e['score']:>3}  {','.join(e['methods']):<12} {e['path']:<55} {'; '.join(e['why'][:4])}")


if __name__ == "__main__":
    main()
