# FRHC bug bounty toolkit (Tumar.One)

Все запросы к целям идут через `bb/client.py` (или `mitm_addon.py` для ручной работы):
scope-гейт по 11 доменам, принудительный `X-Bug-Bounty`, лимит rps (≤10), лог в `logs/requests.jsonl`.

## Процесс (по очереди для каждого сервиса)
1. `recon`  — crt.sh + Wayback (пассивно, цель не трогаем)
2. `probe`  — один GET / на хост
3. `js`     — эндпоинты из JS
4. `manual` — вы: ручной анализ, IDOR-дифф между вашими аккаунтами A/B

```
pip install requests pyyaml mitmproxy
# заполните nickname и accounts в config.yaml
./run.py next     # повторять; ./run.py status — прогресс
```

## Правила программы (не нарушать)
- PoC минимальный: `id`/`whoami`, `version()`, `7*7`. Без шеллов, дампов, persistence.
- ≤2 записи/файла, удалить после отправки отчёта. Только свои аккаунты.
- Privilege escalation — только после одобрения в комментариях к отчёту.
- Не отправлять реальные данные в сторонние AI. `bb/report.py:mask()` маскирует ИИН/телефоны/токены.
- Каждую находку воспроизвести вручную до отправки.
- demo/test-хосты (тег nonprod) проверяем наравне с остальными: баг в самом demo = informational,
  но утечка из него прод-секретов/данных — отчёт с impact на прод.
