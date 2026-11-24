"""Безопасные варианты запросов A (только чтение, флаги для ручного разбора):
 - откат версии API: /v3/ -> /v2/, /v1/  (старые версии часто без проверок доступа)
 - запрос A под B через старую версию
Ничего не меняет на сервере: только GET."""
import re
from .flows import Flows

VER = re.compile(r"/v(\d+)/")

def run(client, cfg, host=None):
    fl = Flows(); mA = cfg["accounts"]["A"]["markers"]
    seen = set()
    for f in fl.all("A", host):
        if f["method"] != "GET": continue
        m = VER.search(f["url"])
        if not m or int(m.group(1)) < 2: continue
        for v in range(int(m.group(1)) - 1, 0, -1):
            url = VER.sub(f"/v{v}/", f["url"], count=1)
            if url in seen: continue
            seen.add(url)
            try:
                ra = client.request("GET", url, account="A")
                rb = client.request("GET", url, account="B")
            except Exception as e:
                print("  err", url, e); continue
            leak = [x for x in mA if x and x in rb.text]
            print(f"  v{v} A={ra.status_code} B={rb.status_code} {url}" + (f"  !! B видит A: {leak}" if leak else ""))
