#!/usr/bin/env python3
"""Проход по сервисам по очереди.
  ./run.py status         — где мы
  ./run.py next           — выполнить следующую фазу текущего сервиса
  ./run.py skip           — пометить текущий сервис завершённым
  ./run.py idor reqs.json — дифф A/B/anon по списку
  ./run.py authz [host]   — Autorize-проверки по записанному трафику A/B
  ./run.py twin           — прод-сессия на nonprod-двойниках
  ./run.py tamper [host]  — откат версий API
  ./run.py report HOST KIND "Title"
"""
import sys
from bb.config import load
from bb.state import State, PHASES
from bb.client import SafeClient
from bb import recon, probe, jsmine, idor, report, authz, twin, tamper

def main():
    cfg, st = load(), State(); st.sync_scope(cfg["scope"])
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        for p, t, ph, d in st.db.execute("select pattern,tier,phase,done from services order by ord"):
            alive = st.db.execute("select count(*) from hosts where service=? and alive=1", (p,)).fetchone()[0]
            eps = st.db.execute("select count(*) from endpoints e join hosts h on e.host=h.host where h.service=?", (p,)).fetchone()[0]
            print(f"{'✓' if d else '·'} {p:22} {t:5} phase={ph:7} alive={alive} endpoints={eps}")
        return
    if cmd == "skip":
        s = st.next_service(); st.set_phase(s[0], "done"); print("done:", s[0]); return
    if cmd == "idor":
        idor.run(SafeClient(cfg), sys.argv[2]); return
    if cmd == "authz":
        authz.run(SafeClient(cfg), cfg, sys.argv[2] if len(sys.argv) > 2 else None); return
    if cmd == "twin":
        twin.run(SafeClient(cfg), cfg); return
    if cmd == "tamper":
        tamper.run(SafeClient(cfg), cfg, sys.argv[2] if len(sys.argv) > 2 else None); return
    if cmd == "report":
        print(report.new(sys.argv[2], sys.argv[3], sys.argv[4], cfg["nickname"])); return
    if cmd == "next":
        s = st.next_service()
        if not s: print("Все сервисы пройдены"); return
        pattern, tier, phase = s
        print(f"== {pattern} [{tier}] phase: {phase}")
        client = SafeClient(cfg)
        if phase == "recon":   recon.run(st, cfg, pattern)
        elif phase == "probe": probe.run(st, client, pattern)
        elif phase == "js":    jsmine.run(st, client, pattern)
        elif phase == "manual":
            print("Ручной этап:\n"
                  "  1) mitmdump -s mitm_addon.py -p 8081 --set account=A  и  -p 8082 --set account=B\n"
                  "  2) пройдите все функции сервиса в двух браузерах (A и B)\n"
                  f"  3) ./run.py authz {pattern.lstrip('*.')} ; ./run.py tamper ; ./run.py twin\n"
                  "  4) ./run.py skip"); return
        st.set_phase(pattern, PHASES[PHASES.index(phase) + 1])

if __name__ == "__main__":
    main()
