"""Прод-сессия на nonprod-двойнике: если demo принимает прод-токен A и отдаёт данные A,
значит общий auth/бэкенд с продом -> impact на прод, а не informational."""
from urllib.parse import urlsplit, urlunsplit
from .flows import Flows

def run(client, cfg):
    fl = Flows(); mA = cfg["accounts"]["A"]["markers"]
    for prod, twin in (cfg.get("twins") or {}).items():
        print(f"== {prod} -> {twin}")
        for f in fl.all("A", prod):
            if f["method"] != "GET" or f["status"] >= 400: continue
            u = urlsplit(f["url"])
            if u.hostname != prod: continue
            url = urlunsplit(u._replace(netloc=twin))
            try:
                r = client.request("GET", url, account="A",
                                   headers={k: v for k, v in f["headers"].items() if k.lower() not in ("cookie", "authorization", "host")})
            except Exception as e:
                print("  err", url, e); continue
            m = [x for x in mA if x and x in r.text]
            tag = "  !! прод-данные A на nonprod" if m else ""
            print(f"  {r.status_code} {len(r.content):>7} {url}{tag}")
