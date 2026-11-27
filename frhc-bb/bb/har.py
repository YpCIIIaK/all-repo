"""Разбор HAR (DevTools → Network → Save all as HAR): реальные запросы/ответы и потоки идентификаторов.

Ничего не отправляет. Значения заголовков (куки, токены) не сохраняются — только имена.
"""
import json, re, collections
from urllib.parse import urlsplit, parse_qsl

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
IDLIKE = re.compile(r'^(?:\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,64}|[A-Za-z0-9_-]{20,})$', re.I)
AUTH_HDR = {"authorization", "cookie", "x-auth-token", "x-api-key", "x-access-token"}
SKIP = re.compile(r'\.(png|jpe?g|svg|gif|webp|css|woff2?|ttf|ico|map|mp4)(\?|$)|/rb_[0-9a-f-]+|/cdn-cgi/|google-analytics|googletagmanager|yandex|facebook|tiktok|amplitude|doubleclick', re.I)


def seg_kind(s):
    if UUID.match(s): return "{uuid}"
    if re.fullmatch(r'\d{2,}', s): return "{id}"
    if re.fullmatch(r'[0-9a-f]{24,64}', s, re.I): return "{hash}"
    if re.fullmatch(r'[A-Za-z0-9_-]{28,}', s) and re.search(r'\d', s): return "{token}"
    return s


def norm(url):
    u = urlsplit(url)
    segs = [seg_kind(s) for s in u.path.split("/") if s]
    return u.hostname or "", "/".join(segs)


def walk(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from walk(v, f"{p}.{k}" if p else k)
    elif isinstance(o, list):
        for v in o[:50]: yield from walk(v, p + "[]")
    elif isinstance(o, (str, int)) and not isinstance(o, bool):
        yield p, str(o)


def parse_body(text, mime=""):
    if not text: return None
    t = text.strip()
    if t[:1] in "{[":
        try: return json.loads(t)
        except Exception: return None
    if "x-www-form-urlencoded" in (mime or "") or ("=" in t and "&" in t and " " not in t[:200]):
        return dict(parse_qsl(t))
    return None


def load(path, host_filter=None):
    har = json.load(open(path, encoding="utf-8", errors="ignore"))
    entries = sorted(har["log"]["entries"], key=lambda e: e.get("startedDateTime", ""))
    calls, js_bodies = [], []
    obs = collections.defaultdict(lambda: {"count": 0, "status": collections.Counter(), "hosts": set(),
                                           "auth_headers": set(), "req_keys": set(), "query_keys": set(),
                                           "resp_keys": set(), "content_types": set(), "examples": []})
    produced = {}          # значение -> (endpoint, поле), где оно впервые появилось в ответе
    flows = collections.Counter()
    for e in entries:
        rq, rs = e["request"], e["response"]
        url = rq["url"]
        if not url.startswith("http"): continue
        ctype = (rs.get("content", {}).get("mimeType") or "").lower()
        body_txt = rs.get("content", {}).get("text") or ""
        if "javascript" in ctype or url.split("?")[0].endswith((".js", ".mjs")):
            if body_txt and rs.get("content", {}).get("encoding") != "base64":
                js_bodies.append((url.split("?")[0].split("/")[-1] or url, body_txt))
            continue
        if SKIP.search(url): continue
        host, path = norm(url)
        if host_filter and not (host == host_filter or host.endswith("." + host_filter)): continue
        if not path: continue
        if "json" not in ctype and rq["method"] == "GET" and "api" not in path: continue
        key = path
        o = obs[key]; o["count"] += 1; o["status"][rs.get("status")] += 1; o["hosts"].add(host)
        o["content_types"].add(ctype.split(";")[0])
        hdrs = {h["name"].lower() for h in rq.get("headers", [])}
        o["auth_headers"] |= (hdrs & AUTH_HDR) | {h for h in hdrs if h.startswith("x-") and "dt" not in h}
        q = dict(parse_qsl(urlsplit(url).query)); o["query_keys"] |= set(q)
        rbody = parse_body((rq.get("postData") or {}).get("text"), (rq.get("postData") or {}).get("mimeType"))
        req_vals = []
        if isinstance(rbody, (dict, list)):
            for p, v in walk(rbody): o["req_keys"].add(p); req_vals.append((p, v))
        for k, v in q.items(): req_vals.append(("?" + k, v))
        for raw, s in zip([x for x in urlsplit(url).path.split("/") if x], path.split("/")):
            if s.startswith("{"): req_vals.append((s, raw))
        # поток: значение из прошлого ответа пришло в этот запрос
        for p, v in req_vals:
            if IDLIKE.match(v) and v in produced and produced[v][0] != key:
                src, field = produced[v]
                flows[(src, key, f"{field} → {p}")] += 1
        rjson = parse_body(body_txt) if "json" in ctype else None
        if isinstance(rjson, (dict, list)):
            for p, v in walk(rjson):
                o["resp_keys"].add(p)
                if IDLIKE.match(v) and v not in produced:
                    produced[v] = (key, p)
        if len(o["examples"]) < 3:
            o["examples"].append({"method": rq["method"], "status": rs.get("status"),
                                  "query": sorted(q), "req_body_keys": sorted({p for p, _ in req_vals})[:25]})
        calls.append({"method": rq["method"], "path": path, "raw": url[:160], "kind": "har",
                      "fields": sorted({p.split(".")[-1].strip("[]?") for p, _ in req_vals if not p.startswith("{")})[:20],
                      "auth_hint": "yes" if hdrs & AUTH_HDR else "no", "src": "HAR", "offset": 0, "ctx": f"{rq['method']} {url[:300]}"})
    observed = {k: {"count": v["count"], "status": dict(v["status"]), "hosts": sorted(v["hosts"]),
                    "auth_headers": sorted(v["auth_headers"]), "query_keys": sorted(v["query_keys"]),
                    "req_keys": sorted(v["req_keys"])[:40], "resp_keys": sorted(v["resp_keys"])[:60],
                    "content_types": sorted(v["content_types"]), "examples": v["examples"]} for k, v in obs.items()}
    flow_list = [{"from": a, "to": b, "field": f, "count": n} for (a, b, f), n in flows.most_common()]
    return calls, observed, flow_list, js_bodies
