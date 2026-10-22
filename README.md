# 2026 SpiritCTF · Web

2026 SpiritCTF Web 方向个人出题归档，包含题目源码、Docker 构建文件及题解

本仓库仅收录本人编写的 3 道 Web 题目，并非赛事完整题目归档

## 题目列表

| 题目 | 题目描述 | 题解 |
| --- | --- | --- |
| login？ | [查看](login/attachments/README.md) | [查看](login/author/writeup.md) |
| GPA Calculator | [查看](gpa-calculator/attachments/README.md) | [查看](gpa-calculator/author/writeup.md) |
| 秘密便签 | [查看](secret-notes/attachments/README.md) | [查看](secret-notes/author/writeup.md) |

## 目录说明

- `challenge/`：题目源码及用于本地测试的 Docker 构建文件
- `attachments/`：题目描述及原始比赛附件
- `author/`：题解及已有解题脚本
- `release/`：题目发布副本，启动容器时需传入非空 `FLAG` 环境变量

## 备注

- 所有 `challenge/` Docker 镜像默认使用 `flag{fake_for_local_test}`，可在启动容器时通过 `FLAG` 环境变量覆盖
- 题解中的实例地址、提交记录及样例 flag 保留为历史记录
- 解题脚本中的地址与参数需按实际运行环境调整

## License

代码用 [MIT](LICENSE)，题目描述和题解用 [CC BY-NC-SA 4.0](LICENSE-CONTENT)

第三方代码和素材保留原许可
