# 鸣潮回合制 3.0 · 遭遇演算

当前维护版本：**3.0 规则系列 · 遭遇测试原型 v0.2（0.2.0-candidate）**。这是独立、可离线运行的浏览器战斗测试程序，支持 1–4 人编队、四类遭遇、三档难度与本地素材工作台。

**仍为测试候选，正式合格版本数量为 0。** 自动化检查通过不等于真实浏览器、Windows 实机、平衡性或真人趣味性已验收。

## 下载与启动

- [3.0 测试 Release：v3.0.0-test.2](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/tag/v3.0.0-test.2)
- [下载独立程序 ZIP](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/download/v3.0.0-test.2/wuwa-battle-3.0-encounter-v0.2.zip)
- [下载 ZIP 的 SHA-256 校验文件](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases/download/v3.0.0-test.2/wuwa-battle-3.0-encounter-v0.2.zip.sha256)

1. 下载独立程序 ZIP，完整解压到一个新目录。不要在 ZIP 内直接打开单个 HTML。
2. 打开解压目录内的 **index.html**。Windows 也可使用同目录的 **启动遭遇演算.cmd**。
3. 保持 assets/、全部 JS/CSS 和 index.html 的相对位置。运行游戏不需要安装 Python、Node.js、npm 依赖或联网登录。

也可使用仓库的 **Code → Download ZIP** 或克隆 main，然后打开仓库根目录的 index.html。默认入口已经是 3.0；仓库源码 ZIP 额外包含历史归档，Release 的独立程序 ZIP 只包含当前 3.0 程序及公开文档、测试。

Windows 双击、真实浏览器布局与实际音频播放仍待实机验证。如果浏览器限制本地持久存储，请用“导出项目 JSON”备份素材与战局；不同浏览器或新解压路径不保证自动共享原有本地数据。

### 校验下载

Release 同时提供 ZIP 和同名 .sha256 文件。计算 ZIP 的 SHA-256，与校验文件中的 64 位值逐字比对：

```powershell
Get-FileHash .\wuwa-battle-3.0-encounter-v0.2.zip -Algorithm SHA256
```

```sh
# Linux
sha256sum -c wuwa-battle-3.0-encounter-v0.2.zip.sha256
# macOS
shasum -a 256 -c wuwa-battle-3.0-encounter-v0.2.zip.sha256
```

解压后的文件级清单为 SHA256SUMS.txt；在复跑会改写测试证据的脚本之前，可运行 `python tools/verify_publication.py` 检查当前程序快照。VERSION.json 中的 source_delivery_zip_sha256 仅记录早期交付来源，不能用于核对本次 Release ZIP。

## 本版内容

- 1–4 人编队；普通、精英人形、精英非人形、头目四类遭遇
- 轻松、标准、挑战三档难度
- 当前行动角色旁的战斗、技能、防御、道具、交涉、逃跑六项菜单
- 悬停、键盘焦点、选中均说明具体效果、资源消耗、持续时间及禁用原因
- 当前、本轮剩余、下轮预计三层头像行动条
- 精英/头目特殊技、蓄力预警与反制；角色增益差异、延奏收益、手动协奏及有限测试道具
- 89 张默认动作/敌人图片；本地图片、背景、音频导入及素材校准、项目保存/导出
- 敌左朝右、友右朝左，不用整图镜像改变角色方向或不对称设计

详见 [使用说明](使用说明.txt)、[当前规则与变更表](当前执行规则与变更表.txt)、[参数表](parameters.json) 和 [版本变更](CHANGELOG.md)。

## 版本与存档

**3.0** 是当前规则系列；**v0.2 / 0.2.0-candidate** 是该系列内遭遇测试原型的迭代号。GitHub tag 使用 **v3.0.0-test.2**，明确所属主版本并避免与历史 tag 重名；它不表示整个 3.0 游戏已完成。

遭遇原型 v0.1 的素材项目可迁移，但旧战局不在 v0.2 新平衡下继续运行；保留素材与编队后重新开场。不同规则系列的运行时、数据包和存档不能混用。每次升级请解压到独立目录，并保留需要回退的原程序和项目导出。

历史程序可从 [过往 Releases](https://github.com/Whirock/Wuwa-battlesystem-testversion/releases) 下载，源码与原说明已收进 archive/；不再作为当前入口。历史 tag、Release 与 Git 提交保持不变。

## 验证结果与测试边界

当前公开测试证据记录：

- 63/63 规则单元测试；12/12 独立规则组
- 29/29 jsdom DOM 事件集成；4/4 素材检查；3/3 元数据与队列检查
- 30 编队 × 4 遭遇 × 3 难度 = 360 场；11,825 次逐行动保存/恢复结果一致
- 263 胜、94 败、3 场在 60 轮观察窗口未决；这些是候选策略结果，不是最优胜率或最终平衡认证
- 89 张运行 PNG 保持原字节；具体哈希与尺寸见 [运行素材清单](RUNTIME_ASSETS.json)

jsdom 的 Canvas、媒体、计时器与 IndexedDB 均为受控模拟，不能证明真实像素布局、真实音频、浏览器编码兼容性或 Windows 启动。真实浏览器视觉、头像辨识、响应式布局、实际动作/音频播放及 Windows 双击仍待验。没有把部署成功、旧版截图或本地检查写成 GitHub CI 通过。

完整记录见 [测试报告](测试报告.txt)、[独立 QA 报告](docs/独立QA报告_v0.2.txt)、[公开副本检查](PUBLICATION_CHECKS.json) 和 tests/independent/v02/。本次根目录迁移后的复跑记录见 [发行维护检查](docs/RELEASE_MAINTENANCE_CHECKS.json)。

### 复跑测试

仅开发测试需要 Node.js 20+、Python 3.10+；现有记录使用 Node.js 24.19.0、Python 3.12.14。游戏运行不需要它们。在仓库根目录或独立程序解压目录运行：

```sh
python tools/verify_publication.py
node tests/engine.test.cjs
node tests/independent/v02/engine_v02_audit.cjs
node tests/independent/v02/public_asset_audit.cjs
node tests/independent/v02/metadata_queue_audit.cjs
node tests/independent/v02/bounded_progress_audit.cjs
```

DOM 测试使用锁定依赖：

```sh
cd tests/independent/v02
npm ci
node dom_v02_audit.cjs
```

测试会更新结果时间戳/文件哈希，并生成 30 MiB 的超限图片占位 fixture；该占位文件不随发布包分发。请先校验收到的原始快照，再在工作副本里复跑。数值对照脚本在 tests/balance_v02/。上游原图制作依赖未公开输入，仓库不宣称可重建原始美术。

## 目录

```text
index.html / 启动遭遇演算.cmd  当前 3.0 离线入口
app.js / engine.js             界面与规则引擎
parameters.js / parameters.json 当前候选参数
assets/ / assets.js            89 张运行 PNG 与映射
storage.js / style.css         本地保存与样式
VERSION.json / CHANGELOG.md    当前版本与变更
RUNTIME_ASSETS.json            运行素材的相对路径、大小和 SHA-256
SHA256SUMS.txt                 当前程序逐文件校验
使用说明.txt / docs/           操作、规则与验证说明
tests/ / tools/                公开测试、证据及校验工具
history/                      遭遇原型 v0.1 的历史参数与说明
archive/                      旧规则系列归档，仅仓库源码含有
```

## 素材来源与发布范围

默认素材是本项目已有候选工作图的冻结运行副本：84 张友方动作、5 张敌方主体。未重新绘制或镜像，89 张 PNG 保持原字节；不包含完整 master/3× 美术档案、官方模型/纹理、用户参考截图或《八方旅人》专有素材。运行不依赖 character 仓库下载或同步。素材来源、映射、锚点候选及已知 Alpha 边界见 [ASSET_NOTES](ASSET_NOTES.txt) 与 assets/manifest.json。

素材接入授权不等于所有图片已经最终美术验收。真实引擎锚点仍需校准；已知个别图片含中间 Alpha 值，本次保留原图，不伪称全部二值 Alpha 合格。

本次只维护公开程序的目录、说明、校验和发行包，不修改战斗机制、参数或运行图片。不分发私人存档、独立游戏设计主框架、托管配置或未公开的上游制作输入。

本项目为非官方实验用途。角色、项目名和第三方标识的权利归各自权利人；仓库公开不等于授予开放源代码许可，本次未新增 MIT 等许可。
