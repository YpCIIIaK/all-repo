"""Фаза probe: один GET / на хост (https, затем http) через SafeClient."""
import re

def run(st, client, pattern):
    hosts = st.hosts(pattern)
    for i, h in enumerate(hosts, 1):
        info, alive = {}, False
        for scheme in ("https", "http"):
            try:
                r = client.get(f"{scheme}://{h}/")
                t = re.search(rb"<title[^>]*>(.*?)</title>", r.content[:20000], re.I | re.S)
                info = {"url": f"{scheme}://{h}/", "status": r.status_code,
                        "server": r.headers.get("Server"), "loc": r.headers.get("Location"),
                        "title": t.group(1).decode(errors="ignore").strip()[:100] if t else None}
                alive = True; break
            except Exception:
                continue
        st.set_alive(h, alive, info)
        low = st.db.execute("select low_value from hosts where host=?", (h,)).fetchone()[0]
        print(f"  [{i}/{len(hosts)}] {'[nonprod] ' if low else ''}{h} {'-> '+str(info.get('status'))+' '+str(info.get('title')) if alive else 'dead'}")
    st.commit()
