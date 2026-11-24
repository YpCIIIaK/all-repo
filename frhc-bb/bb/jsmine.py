"""Фаза js: скачать JS с главных страниц живых хостов, извлечь эндпоинты/параметры."""
import re, json
from urllib.parse import urljoin
from .client import OutOfScope

SRC = re.compile(r'<script[^>]+src=["\']([^"\']+)', re.I)
EP  = re.compile(r'["\'`](/(?:api|v\d|graphql|rest|internal|admin|auth|user|account)[A-Za-z0-9_\-/{}.:?=&]*)["\'`]')
ABS = re.compile(r'https?://[a-z0-9.\-]+\.(?:kz|life|credit)[^\s"\'`<>]*', re.I)

def run(st, client, pattern, max_js_per_host=15):
    for h in st.hosts(pattern, alive_only=True):
        row = st.db.execute("select info from hosts where host=?", (h,)).fetchone()
        base = json.loads(row[0] or "{}").get("url")
        if not base: continue
        try:
            page = client.get(base).text
        except Exception: continue
        scripts = [urljoin(base, s) for s in SRC.findall(page)][:max_js_per_host]
        found = set()
        for js in scripts:
            try: body = client.get(js).text
            except (OutOfScope, Exception): continue
            found |= {urljoin(base, p) for p in EP.findall(body)}
            found |= set(ABS.findall(body))
        for u in found:
            st.add_endpoint(u, h, "js")
        print(f"  {h}: {len(scripts)} js, {len(found)} endpoints")
    st.commit()
