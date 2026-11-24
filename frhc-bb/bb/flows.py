import sqlite3, json

class Flows:
    def __init__(self, path="flows.db"):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("""create table if not exists flows(id integer primary key, acct text,
            method text, url text, headers text, body text, status int, resp text,
            unique(acct, method, url, body))""")
    def add(self, acct, method, url, headers, body, status, resp):
        self.db.execute("insert or replace into flows(acct,method,url,headers,body,status,resp) values(?,?,?,?,?,?,?)",
                        (acct, method, url, json.dumps(headers), body, status, resp[:200000]))
        self.db.commit()
    def all(self, acct, host_filter=None):
        rows = self.db.execute("select method,url,headers,body,status,resp from flows where acct=?", (acct,))
        out = [dict(method=m, url=u, headers=json.loads(h), body=b, status=s, resp=r) for m, u, h, b, s, r in rows]
        return [f for f in out if not host_filter or host_filter in f["url"]]
