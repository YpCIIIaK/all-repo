"""Сессия-куки для аккаунта из локального json (вне репозитория) + авто-refresh arbuz."""
import json, os, pathlib
from .client import SafeClient
JAR_DIR = os.environ.get("BB_JAR_DIR", "/tmp/claude-0/-home-user/4b6bc161-d7e2-5c1e-bb06-77e0f8e2579a/scratchpad")

def path(acct): return pathlib.Path(JAR_DIR) / f"arbuz_{acct}.json"
def cookie_header(acct):
    return "; ".join(f"{k}={v}" for k, v in json.loads(path(acct).read_text()).items())

def refresh(client: SafeClient, acct):
    jar = json.loads(path(acct).read_text())
    r = client.request("POST", "https://arbuz.kz/api/auth/v2/token/refresh",
                       headers={"Cookie": cookie_header(acct), "Content-Type": "application/json",
                                "Accept": "application/json"}, data=b"{}")
    for c in r.cookies: jar[c.name] = c.value
    path(acct).write_text(json.dumps(jar)); os.chmod(path(acct), 0o600)
    return r.status_code, sorted(c.name for c in r.cookies)
