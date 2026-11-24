"""Динамическая проверка доступа на основе реального трафика A и B (аналог Autorize).
Тесты на каждый записанный запрос A:
  1. replay под B          — B получает данные A?
  2. replay без сессии     — данные доступны анонимно?
  3. swap ID A->B под A    — A получает объект B? (только ID, увиденные в трафике B)
Сигнал = маркеры чужого аккаунта в ответе (самый надёжный) + похожесть ответа."""
import difflib
from .flows import Flows
from . import ids
from .report import mask

def sim(a, b): return difflib.SequenceMatcher(None, a[:5000], b[:5000]).quick_ratio()

def strip_auth(h):
    return {k: v for k, v in h.items() if k.lower() not in ("cookie", "authorization")}

def has(text, markers): return [m for m in markers if m and m in text]

def run(client, cfg, host=None, out="logs/authz.txt"):
    fl = Flows(); A, B = fl.all("A", host), fl.all("B", host)
    mA, mB = cfg["accounts"]["A"]["markers"], cfg["accounts"]["B"]["markers"]
    if not (mA and mB): print("! задайте markers для A и B — без них только эвристика по похожести")
    idsA, idsB = ids.collect(A), ids.collect(B)
    print(f"flows A={len(A)} B={len(B)}; id-ключей A={len(idsA)} B={len(idsB)}")
    log = open(out, "a")
    def hit(tag, f, r, why):
        line = f"[{tag}] {f['method']} {f['url']} -> {r.status_code} len={len(r.content)} :: {why}"
        print("  !!", line); log.write(mask(line) + "\n")

    for f in A:
        if f["status"] >= 400 or not f["resp"]: continue
        if f["method"] not in ("GET", "POST") and not cfg.get("authz_allow_writes"):
            continue   # PUT/PATCH/DELETE не повторяем без явного разрешения
        base_h = strip_auth(f["headers"])
        kw = dict(headers=base_h, data=f["body"].encode() if f["body"] else None)
        try:
            rb = client.request(f["method"], f["url"], account="B", **kw)
            if rb.status_code < 300:
                m = has(rb.text, mA)
                if m: hit("B->A data", f, rb, f"маркеры A в ответе B: {m}")
                elif sim(rb.text, f["resp"]) > 0.95 and not has(f["resp"], mB) and has(f["resp"], mA):
                    hit("B->A similar", f, rb, "ответ B ≈ ответ A")
            rn = client.request(f["method"], f["url"], **kw)
            if rn.status_code < 300 and has(rn.text, mA):
                hit("ANON", f, rn, f"данные A без авторизации: {has(rn.text, mA)}")
        except Exception as e:
            print("  err", f["url"], e)
        for key, va, vb, url, body in ids.swap_candidates(f, idsA, idsB):
            try:
                r = client.request(f["method"], url, account="A", headers=base_h,
                                   data=body.encode() if body else None)
                m = has(r.text, mB)
                if r.status_code < 300 and m:
                    hit("IDOR swap", {**f, "url": url}, r, f"{key}: {va}->{vb}, маркеры B: {m}")
            except Exception as e:
                print("  err", url, e)
    print(f"готово, совпадения -> {out}")
