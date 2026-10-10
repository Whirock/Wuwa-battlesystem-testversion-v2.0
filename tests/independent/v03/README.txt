独立 QA 脚本

在发行仓库根目录执行：
  node --test tests/independent/v03/engine_e_independent.cjs
  node tests/independent/v03/matrix_e_independent.cjs
  node tests/independent/v03/cost_e_independent.cjs
  node tests/independent/v03/boss_e_independent.cjs

DOM 集成使用 v03 多回调 RAF 受控模拟器，复用 v02 依赖和测试夹具，并非真实浏览器：
  cd tests/independent/v02 && npm ci --ignore-scripts && cd ../../..
  node tests/independent/v03/dom_e_independent.cjs
  node tests/independent/v03/asset_increment_e_independent.cjs
  node tests/independent/v03/tether_e_independent.cjs
  node tests/independent/v03/advanced_assets_e_independent.cjs
  node tests/independent/v03/critical_revision_e_independent.cjs
  node tests/independent/v03/focus_e_independent.cjs

PNG 文件、哈希、Alpha 与映射检查需 Python 3 + Pillow：
  python tests/independent/v03/assets_e_independent.py

各测试都执行实际发行的 engine.js / parameters.json / app.js。
规则隔离用例可调整生命、速度、AP或资源来触发边界；这种夹具不算平衡性实测。
矩阵使用实际参数，逐个行动对比保存/恢复及下一步确定性；自动策略和随机合法策略均不是最优解证明。
Boss 四种独立策略不调用实现者 AI；不同策略明确限制各自能使用的行为，用于机制投入对照。
同资源循环成本对照使用真实琳奈个人资源和真实标准 Boss，不凭空预充。
DOM 测试的 Canvas、Image、Audio、IndexedDB、计时器与布局为模拟；不能证明浏览器像素、输入默认行为、音频编解码或 Windows 离线运行。
asset 存在性检查会把未制作的空槽视为失败，不把它计为已交付图片。
完整覆盖、最终结论、未测项及文件指纹以独立 QA 报告为准。
