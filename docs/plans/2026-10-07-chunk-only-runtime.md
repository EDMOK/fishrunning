# 赛道运行时只加载预制 chunks

2026-10-07

当前入口已完全停用旧障碍物生成器。`index.html` 不再加载 `base-patterns.js`、`route-patterns.js`、`reward-shapes.js`、`action-routes.js`；这些文件只作为历史参考保留并标注。`game.js` 删除旧模式池、动作连段现场构建、事件临时摆放与块库缺失时的旧生成回退。

正式赛道现在只有一条加载链：`chunks-data.js` → `chunks.js` 回放 → `game.js` 的实体加载函数。`addObstacle`、`addPlatform`、`addTrackGap`、`addRice`、`addRiskLine` 保留，它们负责素材、判定、机关状态与实体注册，不再选择旧布局。

`chunk-director.js` 只选择段落，没有实体生成 API。正常跑局、练习模式都回放冻结块。设卡、验证条、缓存风暴、白饭奖励事件申请未来的预制事件块，不修改已生成赛道或侵占恢复跑道。连段奖励继续记录回放产生的真实实体。块库缺失会显示加载错误，不回退到旧生成器。

当前最终块库包含 3,597 个布局，来源为 259 种配方，速度波段 380 / 520 / 700 / 900。其中 24 个手工主题保留 283 个真实引擎通过的变体。组合设计、米带和节奏详见 [手工编排记录](2026-10-07-crafted-chunks.md)。

逐块把关采用几何审查、默认能力的 120 Hz 输入路线搜索、序列化后路线复核，以及真实游戏引擎练习回放。全部 3,597 个保留块都有绑定引擎源码与完整布局/输入签名的无伤回放记录；受伤、落点缺失或无法完成的候选不会入库。模型使用完整动态障碍扫掠包络；真实引擎回放使用固定验证种子，检验的是记录路线，不等同于所有操作、所有动态相位都保证通过。

已完成验证：

- `node tools/verify_chunks.cjs`：3,597 块逐条复核，0 失败，变体去重，全部 10 种障碍素材和动态机关覆盖。
- `node tools/report_chunk_certificates.cjs`：全部保留块均有真实引擎通关证据；24 个手工主题均有通过的实例。
- `node tools/verify_chunk_runtime.cjs`：实际实体生成、素材解码、速度锁定与恢复跑道通过，无脚本错误或缺失资源。
- `node tools/verify_chunk_only_runtime.cjs`：15 个代表块实例化；195 秒生成 48 段、7 个事件段，全部来自冻结 chunks；缺库时明确停止。此项长跑检查清空碰撞实体，只验证生成入口。
- `node tools/audit_chunk_design.cjs`：3 个种子各约 200 秒，检查长组合比例、恢复跑道、奖励连段与米带连接。

报告位于 `docs/chunk-library.json`、`docs/chunk-verification.json`、`docs/chunk-playthrough-verification.json`、`docs/chunk-only-runtime-verification.json`、`docs/chunk-design-audit.json`。配方位于 `tools/lib/authored-chunks.cjs` 与 `tools/lib/handcrafted-chunks.cjs`。修改布局或引擎后必须重新验证，不复用失效签名。
