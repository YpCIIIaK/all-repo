from urllib.parse import urlsplit

def host_of(url_or_host: str) -> str:
    h = urlsplit(url_or_host).hostname if "://" in url_or_host else url_or_host
    return (h or "").lower().rstrip(".")

def match(host: str, pattern: str) -> bool:
    host, pattern = host.lower(), pattern.lower()
    if pattern.startswith("*."):
        base = pattern[2:]
        return host == base or host.endswith("." + base)
    return host == pattern

def in_scope(url_or_host: str, scope: list) -> dict | None:
    h = host_of(url_or_host)
    for item in scope:
        if match(h, item["pattern"]):
            return item
    return None

def is_low_value(host: str, keywords) -> bool:
    labels = host_of(host).replace("-", ".").split(".")
    return any(k in labels for k in keywords)
