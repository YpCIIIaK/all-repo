"""Единственная точка выхода HTTP к целям: scope-гейт, X-Bug-Bounty, rate limit, лог."""
import threading, time, json, datetime, pathlib, requests
from .scope import in_scope

class OutOfScope(Exception): pass

class RateLimiter:
    def __init__(self, rps: float):
        self.interval, self.lock, self.next = 1.0 / rps, threading.Lock(), 0.0
    def wait(self):
        with self.lock:
            now = time.monotonic()
            t = max(now, self.next)
            self.next = t + self.interval
        if t > now:
            time.sleep(t - now)

class SafeClient:
    def __init__(self, cfg, log_path="logs/requests.jsonl"):
        self.cfg = cfg
        self.limiter = RateLimiter(cfg["rps"])
        self.s = requests.Session()
        from http.cookiejar import DefaultCookiePolicy
        self.s.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))  # не хранить куки: сессия только явно
        self.s.headers.update({"User-Agent": cfg["user_agent"],
                               "X-Bug-Bounty": cfg["nickname"]})
        self.log = pathlib.Path(log_path); self.log.parent.mkdir(exist_ok=True)
        self.lock = threading.Lock()

    def request(self, method, url, account=None, **kw):
        if not in_scope(url, self.cfg["scope"]):
            raise OutOfScope(url)
        headers = dict(kw.pop("headers", {}) or {})
        if account:
            headers.update({k: v for k, v in self.cfg["accounts"][account]["headers"].items() if v})
        headers["X-Bug-Bounty"] = self.cfg["nickname"]          # нельзя переопределить
        kw.setdefault("timeout", self.cfg["timeout"])
        kw.setdefault("allow_redirects", False)                 # редирект вне scope не пойдёт
        self.limiter.wait()
        t0 = time.time()
        try:
            r = self.s.request(method, url, headers=headers, **kw)
            status, size = r.status_code, len(r.content)
            return r
        except requests.RequestException as e:
            status, size = f"ERR:{type(e).__name__}", 0
            raise
        finally:
            with self.lock, self.log.open("a") as f:
                f.write(json.dumps({"ts": datetime.datetime.now(datetime.UTC).isoformat(), "m": method,
                    "url": url, "acct": account, "status": status, "size": size,
                    "ms": int((time.time()-t0)*1000)}) + "\n")

    def get(self, url, **kw):  return self.request("GET", url, **kw)
