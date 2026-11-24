import re, datetime, pathlib
MASK = [(re.compile(r'\b\d{12}\b'), '<IIN>'), (re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+'), '<EMAIL>'), (re.compile(r'\+?7\d{10}\b'), '<PHONE>'),
        (re.compile(r'(?i)(bearer\s+)[\w\-.]+'), r'\1<TOKEN>'), (re.compile(r'eyJ[\w\-]+\.[\w\-]+\.[\w\-]+'), '<JWT>')]

def mask(text: str) -> str:
    for rx, rep in MASK: text = rx.sub(rep, text)
    return text

TEMPLATE = """# {title}

**Asset:** {host}  
**Type:** {kind}  
**Date:** {date}

## Summary
...

## Steps to reproduce (all requests include `X-Bug-Bounty: {nick}`)
1. ...

## PoC (minimal: e.g. version()/id/7*7, ≤2 records, own test accounts)
```http
...
```

## Impact
Что конкретно может сделать атакующий и с чьими данными.

## Remediation
...

_Downloaded materials will be deleted after submission._
"""

def new(host, kind, title, nick):
    p = pathlib.Path("reports") / f"{datetime.date.today()}_{host}_{kind}.md"
    p.write_text(TEMPLATE.format(title=title, host=host, kind=kind, nick=nick, date=datetime.date.today()))
    return p
