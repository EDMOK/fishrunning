# Git 提交整理

2026-10-07。本次提交按三个主分组执行；可选归档与排除项留在工作区，不删除既有文件，也不执行 reset 或 push。

本次采用三个主提交。素材/历史设计归档为后续可选提交。运行时改动交织在同一个 `game.js` 中，不建议为了拆历史步骤而切成无法独立运行的中间提交。

`src/chunks-data.js` 虽是约 8.4 MiB 的生成文件，但静态入口直接加载它，必须提交。`docs/chunk-engine-certificates.json` 约 1.64 MiB，构建器读取它剔除失败候选，也必须提交。全部保留的 3,597 块有有效回放证书；24 个手工主题共 283 个实例。没有需要 Git LFS 的超大文件。

旧生成器文件带有 Legacy 标记，保留为历史参考；不会被入口或新编译器加载。新增事件文本也在当前工作区内，属于这次完整玩法版本的内容改动。

## 1. 主提交：`feat: migrate track generation to curated prefab chunks`

运行时、块库、选择器、练习 UI、旧入口停用和四组实际加载的六帧动画。必须整体提交，避免缺数据或缺素材。

- `index.html`
- `src/art-direction.css`
- `src/game.js`
- `src/memes.js`
- `src/obstacle-specials.js`
- `src/chunks-data.js`
- `src/chunks.js`
- `src/chunk-director.js`
- `src/run-segments.js`
- `src/route-patterns.js`
- `src/base-patterns.js`
- `src/action-routes.js`
- `src/reward-shapes.js`
- `assets/obstacle/new/patrol_scout_frames.png`
- `assets/obstacle/new/pulse_firewall_frames.png`
- `assets/obstacle/new/swing_cable_frames.png`
- `assets/platform/collapse_data_frames.png`

## 2. 主提交：`test: add chunk curation and engine replay evidence`

构建器、配方、求解器、引擎回放、最终报告与当前文档。建议与第一个提交在同一分支一次交付；仅提交第一个不能复现策展过程。README 已更新为当前加载链与验证流程。

- `README.md`
- `tools/build_chunks.cjs`
- `tools/lib/authored-chunks.cjs`
- `tools/lib/handcrafted-chunks.cjs`
- `tools/lib/chunk-audit.cjs`
- `tools/lib/chunk-solver.cjs`
- `tools/lib/chunk-engine-certificates.cjs`
- `tools/cache_chunk_playthrough.cjs`
- `tools/report_chunk_certificates.cjs`
- `tools/verify_chunks.cjs`
- `tools/verify_chunk_runtime.cjs`
- `tools/verify_chunk_only_runtime.cjs`
- `tools/verify_chunk_playthrough.cjs`
- `tools/audit_chunk_design.cjs`
- `tools/inspect_chunk.cjs`
- `tools/measure_variety.cjs`
- `tools/probe_chunk_sequence.cjs`
- `tools/verify_special_obstacles_browser.cjs`
- `docs/chunk-library.json`
- `docs/chunk-engine-certificates.json`
- `docs/chunk-playthrough-verification.json`
- `docs/chunk-verification.json`
- `docs/chunk-only-runtime-verification.json`
- `docs/chunk-design-audit.json`
- `docs/handcrafted-chunks.json`
- `docs/crafted-chunks-gameplay.png`
- `docs/crafted-chunks-menu.png`
- `docs/plans/2026-10-07-chunk-library.md`
- `docs/plans/2026-10-07-chunk-only-runtime.md`
- `docs/plans/2026-10-07-crafted-chunks.md`
- `docs/git-submission-plan.md`
- `docs/git-submission-plan.json`

- `tools/verify_title_links.cjs`
- `docs/mobile-title-links-verification.json`
- `docs/mobile-title-links.png`

- `tools/update_chunk_rewards.cjs`
- `docs/scattered-rice-gameplay.png`

- `tools/verify_dash_charges.cjs`
- `docs/dash-charges-verification.json`

- `docs/mobile-controls-verification.json`

## 3. 主提交：`chore: guard dist cleanup and ignore local balance logs`

发行目录清理边界检查和本地日志忽略；可以独立审查。

- `.gitignore`
- `tools/make_dist.py`

## 4. 可选归档：`docs: archive dynamic hazard artwork and design experiments`

四张静态原图与总览图未被主游戏加载，六帧版本才是运行时依赖。Demo 和四份早期方案可作为设计资产归档；早期方案不代表当前验收结果。

- `assets/obstacle/new/dynamic_hazards_sheet.png`
- `assets/obstacle/new/patrol_scout.png`
- `assets/obstacle/new/pulse_firewall.png`
- `assets/obstacle/new/swing_cable.png`
- `assets/platform/collapse_data.png`
- `dynamic-hazards-demo.html`
- `docs/plans/2026-10-06-combination-difficulty.md`
- `docs/plans/2026-10-06-multi-height-routes-and-ai-events.md`
- `docs/plans/2026-10-06-run-feel-and-dynamic-hazards.md`
- `docs/plans/2026-10-06-unified-segment-contract.md`

## 本轮暂不提交

不丢弃这些文件或改动，只保留在工作区。旧测试需迁移后另行提交。

| 文件 | 原因 |
| --- | --- |
| `tools/implement_action_routes.py` | 一次性文本替换脚本，面向已移除的旧入口；重跑可能破坏当前代码。 |
| `tools/lib/combo-patterns.cjs` | 旧组合编排器，当前构建器与运行时均未引用。 |
| `tools/verify_action_routes.cjs` | 验证旧 DSActionRoutes 配方，未验证当前 chunks。 |
| `tools/verify_action_routes_browser.cjs` | 仍用旧组合 ID 调用新练习入口，当前不兼容。 |
| `tools/verify_dynamic_hazards_browser.cjs` | 仍断言旧速度来源规则，与当前 chunk 锁速和连接跑道规则不一致；当前机关覆盖由新的运行时检查提供。 |
| `tools/verify_balance.py` | 本次增量仍审计旧 PATTERNS 和旧间距公式，未覆盖新冻结块；保留工作区改动，待历史工具归档或迁移后单独提交。 |
| `tools/verify_routes.cjs` | 本次增量主要加载旧路线、奖励形状与动作路线；待历史工具归档或迁移后单独提交。 |
| `docs/action-route-verification.json` | 旧动作路线报告，不能作为当前版本验收证据。 |
| `docs/route-generation-verification.json` | 改动来自旧运行时生成器的布局统计，当前版本已替换。 |
| `docs/special-obstacles-verification.json` | 旧速度阶段生成的快照；如需更新应重新运行当前版本对应测试。 |
| `docs/experience-gameplay.png` | 已有体验截图的重新生成版本，没有本次对应报告更新。 |
| `docs/experience-mobile.png` | 已有体验截图的重新生成版本，没有本次对应报告更新。 |
| `docs/experience-summary.png` | 已有体验截图的重新生成版本，没有本次对应报告更新。 |
| `docs/special-obstacles-city.png` | 旧机关验收截图更新，暂不与当前 chunks 验收混在一起。 |
| `docs/special-obstacles-sunset.png` | 旧机关验收截图更新，暂不与当前 chunks 验收混在一起。 |
| `verify-balance.out` | 本地控制台日志；已加入 .gitignore。 |
| `dist/` | 本地发行构建，可重建；已有 .gitignore。 |
| `dist.zip` | 本地发行压缩包，可重建；已有 .gitignore。 |

## 已完成的准备

- 检查 Git 状态、最近提交、入口加载链、素材引用和构建器依赖。
- 更新 README，移除以旧生成器检查作为当前验收流程的说明。
- 给早期 chunk 方案增加历史状态提示，指向最终设计记录。
- 只忽略 `/verify-balance.out`，没有用宽泛的 JSON/PNG 规则隐藏必要数据。
- 检查最终回放证书、全库离线复核，以及 Git diff 格式；本轮未改游戏行为。

机器可读的同一提交清单位于 `docs/git-submission-plan.json`。后续暂存应按该清单精确选择路径，避免 `git add .` 把旧报告和一次性脚本一起提交。浏览器验证脚本目前仍依赖开发机 Playwright/Edge 的绝对路径，README 已明确注明；移植工具链可另开一个独立提交。

## 手机标题链接修复

社交链接原来会进入舞台的 pointerdown 游戏手势，捕获指针后把 click 重定向到舞台，并在抬手时开始游戏。现在链接、输入框和选择框与按钮一样保留原生交互；社交按钮在舞台缩放后仍至少 48 CSS 像素高。真实触摸验证三个手机横屏尺寸的中心/边缘点击与原生弹窗导航；外部目标响应在测试中模拟，没有依赖外网站点可用性。手机操作回归 38 项通过。

## 米粒分布修正

已改成松散双点、三角小簇和单点，取消按见证路线连续描线。数据文件、散点函数、奖励重排工具、加载器的错层连接点、验证规则、最新报告和截图都属于主提交的依赖；总量较旧线形布局减少约 54%。

## 商店多段冲刺修复

原来的更新循环在冷却为零时每帧补满钱包；多格冲刺使用第一格后仍有剩余，冷却尚未开始，下一帧就补回已消耗格，导致无限冲刺。现在只在最后一格耗尽、冷却结束时补满。购买升级只在冷却空闲时赠送新增容量；其他技能购买不补次数，冷却中升级不取消或重置计时。

回归检查通过真实商店按钮、键盘与手机冲刺输入验证：一级两次、满级四次、耗尽禁用与恢复、其他购买/开关商店不补格、升级仅给新格、冷却中升级及新局重置。测试提供白饭和空跑道夹具来隔离钱包逻辑，不用于证明障碍通关。
