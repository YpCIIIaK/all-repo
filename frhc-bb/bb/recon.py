"""Фаза recon: только пассивные источники (не трогают цель)."""
import requests
from .scope import in_scope, is_low_value

def crtsh(domain):
    try:
        r = requests.get("https://crt.sh/", params={"q": f"%.{domain}", "output": "json"}, timeout=60)
        r.raise_for_status()
        names = set()
        for row in r.json():
            for n in row["name_value"].split("\n"):
                n = n.strip().lower().lstrip("*.")
                if n: names.add(n)
        return names
    except Exception as e:
        print(f"  crt.sh error: {e}"); return set()

def wayback_hosts_and_urls(domain, limit=20000):
    try:
        r = requests.get("https://web.archive.org/cdx/search/cdx", timeout=90, params={
            "url": f"*.{domain}/*", "output": "json", "fl": "original", "collapse": "urlkey", "limit": limit})
        rows = r.json()[1:] if r.ok and r.text.strip() else []
        return [x[0] for x in rows]
    except Exception as e:
        print(f"  wayback error: {e}"); return []

def run(st, cfg, pattern):
    base = pattern[2:] if pattern.startswith("*.") else pattern
    names = crtsh(base) | {base}
    urls = wayback_hosts_and_urls(base)
    from urllib.parse import urlsplit
    for u in urls:
        h = urlsplit(u).hostname
        if h: names.add(h.lower())
    n = 0
    for h in names:
        if in_scope(h, [{"pattern": pattern, "tier": ""}]):
            st.add_host(h, pattern, is_low_value(h, cfg["low_value_keywords"])); n += 1
    for u in urls:
        if in_scope(u, cfg["scope"]):
            st.add_endpoint(u, urlsplit(u).hostname, "wayback")
    st.commit()
    print(f"  hosts: {n}, archived urls: {len(urls)}")
