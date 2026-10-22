<?php
    header("Location: /login.php");

    $token = trim(@file_get_contents('/var/www/upload_token'));
?>
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>素材导入后台</title>
</head>
<body>
  <h1>素材导入后台</h1>
  <p>上传 ZIP，自动解压归档并返回导入报告。</p>
  <form action="/upload_<?= htmlspecialchars($token, ENT_QUOTES) ?>.php" method="post" enctype="multipart/form-data">
    <p><label>选择压缩包：<input type="file" name="archive" accept=".zip" required></label></p>
    <p><button type="submit">上传并解压</button></p>
  </form>
  <p><a href="/make_sample.py" download>下载示例脚本</a></p>
</body>
</html>
