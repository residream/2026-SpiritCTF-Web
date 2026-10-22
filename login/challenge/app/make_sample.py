import zipfile

#小 r 感觉直接用脚本生成示例压缩包然后 curl 上传更方便呢
#curl http://localhost:3000 -F "archive=@sample.zip"
with zipfile.ZipFile("sample.zip", "w") as z:
    z.writestr("notes.txt", "这是示例素材包。\n系统会保留内部目录结构进行解压归档。\n")
    z.writestr("images/cover.txt", "封面占位")
