"""Извлечение идентификаторов из своего трафика и подстановка A<->B (без перебора)."""
import re, json
from urllib.parse import urlsplit, parse_qsl

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
IDVAL = re.compile(rf"^(?:\d{{3,}}|{UUID}|[0-9a-f]{{24}})$", re.I)
IDKEY = re.compile(r"(?i)(^id$|_?id$|uuid|guid|iin|account|client|user|customer|order|card|contract|policy|wallet|profile)")

def _walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items(): yield from _walk(v, f"{path}.{k}" if path else k)
    elif isinstance(o, list):
        for v in o: yield from _walk(v, path)
    elif isinstance(o, (str, int)) and not isinstance(o, bool):
        yield path, str(o)

def extract(flow):
    """-> {key: {values}} — id-подобные значения с «именем» (сегмент пути/ключ)."""
    out = {}
    def add(k, v):
        if IDVAL.match(v) or (IDKEY.search(k.split(".")[-1]) and len(v) >= 3):
            out.setdefault(k.split(".")[-1].lower(), set()).add(v)
    u = urlsplit(flow["url"])
    segs = [s for s in u.path.split("/") if s]
    for i, s in enumerate(segs):
        if IDVAL.match(s): add(segs[i-1] if i else "path", s)
    for k, v in parse_qsl(u.query): add(k, v)
    for blob in (flow.get("body"), flow.get("resp")):
        try:
            for k, v in _walk(json.loads(blob)): add(k, v)
        except Exception: pass
    return out

def collect(flows):
    acc = {}
    for f in flows:
        for k, vs in extract(f).items(): acc.setdefault(k, set()).update(vs)
    return acc

def swap_candidates(flow_a, ids_a, ids_b):
    """Для запроса A: варианты, где ОДНО значение A заменено на значение B с тем же ключом."""
    req = flow_a["url"] + "\x00" + (flow_a.get("body") or "")
    for key, vals in extract({"url": flow_a["url"], "body": flow_a.get("body")}).items():
        for va in vals:
            if va not in ids_a.get(key, set()): continue
            for vb in sorted(ids_b.get(key, set()) - ids_a.get(key, set()))[:2]:
                if va in req:
                    url, body = req.replace(va, vb).split("\x00", 1)
                    yield key, va, vb, url, body
