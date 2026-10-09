# 旧规则系列归档

当前仓库根目录维护 3.0 遭遇原型。此目录只保存迁移前已有的旧 Python A/B/C 程序；没有改写其引擎、参数、存档格式或既有 Git 历史。

## 下载历史程序

- [v0.3.1 · 集谐路线名称修正](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/tag/v0.3.1)
- [v0.3.0 · 实战行动者实验预发布](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/tag/v0.3.0)
- [v0.2.0 · 易用性实验预发布](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/tag/v0.2.0)
- [v0.1.0 · 第一批 ABC 基线](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/tag/v0.1.0)

历史 v0.2.0 与 v0.3.1 的独立 ZIP 已在 2026-10-09 实际下载，ZIP 完整性及 GitHub 提供的 SHA-256 均核对通过；其 tag 与 Release 未变更。v0.1.0 使用 GitHub 自动生成的源码下载。

## 本目录保存的源码

v2-python-abc/ 是迁移前 main 上的旧规则系列基线，内容对应 v0.1.0（88b9ef654f576c5158a4448aa307a1afbbb9e93d），不是后续 v0.3.1 的源码快照。原有 44 个文件均按原 Git blob 保留；迁移前的完整根 README 保存为 v2-python-abc/README.before-3.0.md。v2-python-abc/README.md 保留旧基线启动、数据升级、测试与来源说明。

旧版本的进一步更新位于上述历史 tag/Release。需要回退时请下载对应完整发行包，保留旧存档并使用同一程序/数据版本，不向当前 3.0 目录覆盖文件。

归档不再维护旧程序的 main 远端数据更新入口。需要实验此基线时，请在 v2-python-abc/ 内运行其旧启动脚本，并参考原说明；它仍需 Python 3.10+。归档源码无新增 Windows 或浏览器验收结论。
