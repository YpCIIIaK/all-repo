"""IDOR/доступ: повторить запрос от A под B и без сессии, сравнить ответы.
Вход: файл requests.json со списком запросов аккаунта A, например:
[{"method":"GET","url":"https://x.bankffin.kz/api/profile/123"}]
Только ваши аккаунты A и B. Никакого перебора ID."""
import json, hashlib, sys

def fp(r):
    return {"status": r.status_code, "len": len(r.content),
            "hash": hashlib.sha1(r.content).hexdigest()[:10]}

def run(client, path):
    reqs = json.load(open(path))
    for q in reqs:
        m, u, body = q.get("method", "GET"), q["url"], q.get("body")
        res = {}
        for who in ("A", "B", None):
            try: res[who or "anon"] = fp(client.request(m, u, account=who, data=body))
            except Exception as e: res[who or "anon"] = {"err": str(e)}
        a, b, n = res["A"], res["B"], res["anon"]
        flag = ""
        if a.get("status") == 200 and b.get("status") == 200 and abs(a["len"] - b["len"]) < 50:
            flag = "  <-- B видит то же, что A: проверьте вручную"
        if a.get("status") == 200 and n.get("status") == 200 and abs(a["len"] - n["len"]) < 50:
            flag += "  <-- без авторизации!"
        print(f"{m} {u}\n   A={a} B={b} anon={n}{flag}")

if __name__ == "__main__":
    from .config import load; from .client import SafeClient
    run(SafeClient(load()), sys.argv[1])
