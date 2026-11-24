import os, yaml, pathlib

ENV = {  # переменная окружения -> (аккаунт, заголовок)
    "BB_A_COOKIE": ("A", "Cookie"), "BB_A_AUTH": ("A", "Authorization"),
    "BB_B_COOKIE": ("B", "Cookie"), "BB_B_AUTH": ("B", "Authorization"),
}

def load(path="config.yaml"):
    cfg = yaml.safe_load(pathlib.Path(path).read_text())
    cfg["nickname"] = os.environ.get("BB_NICK") or cfg.get("nickname")
    for var, (acct, hdr) in ENV.items():
        if os.environ.get(var):
            cfg["accounts"][acct]["headers"][hdr] = os.environ[var]
    for acct in ("A", "B"):
        m = os.environ.get(f"BB_{acct}_MARKERS")          # через запятую
        if m: cfg["accounts"][acct]["markers"] = [x.strip() for x in m.split(",") if x.strip()]
    if not cfg.get("nickname") or cfg["nickname"] == "CHANGE_ME":
        raise SystemExit("Нет ника: задайте BB_NICK (нужен для X-Bug-Bounty)")
    if cfg.get("rps", 0) > 10:
        raise SystemExit("rps > 10 нарушает правила программы")
    return cfg
