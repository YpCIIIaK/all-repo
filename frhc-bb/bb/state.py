import sqlite3, json
PHASES = ["recon", "probe", "js", "manual"]   # manual = ваша ручная работа/IDOR

class State:
    def __init__(self, path="state.db"):
        self.db = sqlite3.connect(path)
        self.db.executescript("""
        create table if not exists services(pattern text primary key, tier text, ord int,
            phase text default 'recon', done int default 0);
        create table if not exists hosts(host text primary key, service text, low_value int,
            alive int, info text);
        create table if not exists endpoints(url text primary key, host text, source text);
        create table if not exists findings(id integer primary key, host text, kind text,
            title text, status text default 'candidate', notes text);""")
    def sync_scope(self, scope):
        for i, s in enumerate(scope):
            self.db.execute("insert or ignore into services(pattern,tier,ord) values(?,?,?)",
                            (s["pattern"], s["tier"], i))
        self.db.commit()
    def next_service(self):
        return self.db.execute("select pattern,tier,phase from services where done=0 order by ord limit 1").fetchone()
    def set_phase(self, pattern, phase):
        done = int(phase == "done")
        self.db.execute("update services set phase=?, done=? where pattern=?", (phase, done, pattern)); self.db.commit()
    def add_host(self, host, service, low):
        self.db.execute("insert or ignore into hosts(host,service,low_value) values(?,?,?)", (host, service, int(low)))
    def hosts(self, service, alive_only=False):
        q = "select host from hosts where service=?" + (" and alive=1" if alive_only else "") + " order by host"
        return [r[0] for r in self.db.execute(q, (service,))]
    def set_alive(self, host, alive, info):
        self.db.execute("update hosts set alive=?, info=? where host=?", (int(alive), json.dumps(info), host))
    def add_endpoint(self, url, host, src):
        self.db.execute("insert or ignore into endpoints values(?,?,?)", (url, host, src))
    def commit(self): self.db.commit()
