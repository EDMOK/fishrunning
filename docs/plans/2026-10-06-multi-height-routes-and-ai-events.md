# 多高度路线与 AI 奇闻事件扩展计划

日期：2026-10-06

## 目标

把当前“单路线、单层躲避”为主的无尽跑酷，扩展为“地面—中层—高空”三层路线决策玩法：

- 地面路线稳定、收益普通；
- 中层路线需要跳跃或二段跳，收益更高；
- 高空路线依赖连续跳跃、滑翔或快速下落，风险最高但奖励最好；
- 玩家持续在安全、收益、动作难度之间做选择，而不是只等待下一个地面障碍。

同时增加一批 AI 行业讽刺事件，把“额度缩水、模型降智、服务降档、路由伪装”等内容转化为短时、可读、可应对的玩法变化。

## 设计边界

### 纳入本轮

1. 多高度路线编排与路线入口提示。
2. 浮岛链、上下交换、空中交通、塌陷平台等组合。
3. AI 事件数据扩展：
   - 套餐额度缩水；
   - 模型质量回退/降智；
   - 高级模型路由到经济档；
   - 中转站模型伪装；
   - 默认档位悄悄下调。
4. 支撑上述玩法的 UI、路线标识、平台变体、事件主题图标。
5. 路线可达性、随机性、动态难度和浏览器运行时验证。

### 暂不纳入本轮

- 显式左右换道按钮或第二套水平移动系统；
- 大规模新增基础障碍类型；
- 每个事件独立角色动画；
- 复杂品牌 Logo 或真实平台视觉仿制；
- 依赖护盾、冲刺或付费道具才能通过的强制路线；
- 扫描波、传送带、移动数据岛等第二批动态机关。

## 核心玩法

### 三层路线

路线生成器继续保持角色水平位置固定，玩家通过垂直动作选择路线：

- 地面：默认安全路线，安排普通障碍和恢复节奏；
- 中层：浮岛、数据平台和短阶梯，提供额外白饭；
- 高空：高位浮岛、滑翔奖励线和动态空中障碍，提供高价值奖励；
- 路段结束必须提供回到地面的落点或恢复段。

现有动作继续作为唯一操作入口：

- 跳跃：进入中层或高层；
- 二段跳：修正高度和落点；
- 长按跳跃：延长高空路线的可操作时间；
- 空中按下：快速下落、下砸或接地面滑铲；
- 滑铲：通过低空验证条和摆动障碍；
- 冲刺：突破可破坏地面障碍或选择低风险路线。

### 路线组合

首批路线家族：

1. **Vertical Switchback**：高低交替的平台链。
2. **Skyline Weave**：多个高度的浮岛与低空动态障碍交织。
3. **Drop and Dodge**：高处落下后接地面移动障碍。
4. **Air Traffic**：不同高度的巡逻无人机与地面障碍组合。
5. 现有 `cloud-bridge`、`island-hop`、`collapse-chain` 等路线继续保留，并提高出现频率多样性。

每个组合都要满足：

- 至少一条不依赖道具的可达路线；
- 高层路线是奖励路线，不是唯一解；
- 动态障碍运动可预测，并提前显示轨迹或危险窗口；
- 新组合先单体教学，再进入多障碍编排；
- 连续两组高负荷编排之间保留恢复或奖励段。

## 难度与随机性

### 难度预算

建议使用统一预算约束路线组合：

| 内容 | 预算 |
|---|---:|
| 普通地面障碍 | 1 |
| 低空动态障碍 | 2 |
| 高低切换 | 2 |
| 塌陷平台 | 2 |
| 动态障碍叠加 | +1 |
| 连续动作切换 | +1 |
| 高价值风险路线 | +1 |

前期单组预算 1–2，中期 2–3，后期 4–5。难度优先通过路线选择和动作组合增加，不通过无限压缩反应时间增加。

### 随机策略

- 继续使用注入的随机函数，保证验证可复现；
- 保留最近模式排除和 family 连续限制；
- 新模式设置轻微 novelty 权重，避免被旧模式淹没；
- 地面、平台、动态障碍、奖励段保持家族交替；
- 验证至少覆盖多种速度、多个随机种子和大量布局样本；
- 路线生成结果必须记录 pattern id，方便定位不可达布局。

## AI 事件设计

事件继续使用 `src/memes.js` 的数据表和 `game.js` 现有修饰器，不新建第二套事件状态系统。

### 额度缩水

标题示例：`套餐额度重新解释`

效果建议：

- 速度略降；
- 得分与白饭收益下降；
- 障碍间距暂时增加，形成“收益下降但更容易保命”的节奏变化。

### 模型降智

标题示例：`模型突然学会了降智`

效果建议：

- 得分和白饭收益下降；
- 二段跳高度略降；
- 滑翔时间缩短；
- 地面安全路线保持可用。

### 高级模型路由到经济档

标题示例：`高级模型路由到经济档`

效果建议：

- 速度降低；
- 得分降低；
- 障碍间距增加；
- 让玩家转向保守收集或重新适应节奏。

### 中转站模型伪装

标题示例：`中转站换上 Claude / GPT 的面具`

效果建议：

- 触发已有的移动验证条或巡航障碍；
- 事件标题不能替代跑道上的真实视觉信息；
- 通过后给予识别奖励或险过奖励。

该事件明确作为虚构讽刺内容，不指控具体平台，不复制品牌 Logo。所有无法确认的现实说法在 `src/memes.js` 的 `src` 中标记为“社区讨论/游戏化演绎/虚构讽刺”。

## 美术素材计划

### 最小可玩素材集

优先制作约 18–22 个文件：

```text
assets/ui/route_ground.png
assets/ui/route_mid.png
assets/ui/route_high.png
assets/ui/route_safe.png
assets/ui/route_risk.png
assets/ui/route_bonus.png

assets/platform/sky_bridge.png
assets/platform/sky_bridge_end.png
assets/platform/data_shelf.png
assets/platform/data_shelf_end.png
assets/platform/boost_pad.png
assets/platform/fragile_data_cracked.png

assets/ui/arrow_up.png
assets/ui/arrow_down.png
assets/ui/route_split.png
assets/ui/landing_target.png

assets/event/quota_shrink.png
assets/event/quality_drop.png
assets/event/model_fallback.png
assets/event/proxy_mask.png
assets/event/route_mismatch.png
assets/event/latency_spike.png
```

### 后续增强素材

真人试玩确认路线可读后，再增加：

```text
assets/ui/event_status_sheet.png
assets/ui/reward_shortcut.png
assets/ui/risk_dynamic.png
assets/ui/risk_chain.png
assets/platform/boost_pad_active.png
assets/platform/fragile_data.png
assets/bg/route/upper_clouds.png
assets/bg/route/data_airway.png
assets/bg/route/floating_signs.png
assets/hero/stomp.png
assets/hero/land.png
```

素材约束：

- 透明背景；
- 不在图片内写中文，文字由 HTML/Canvas 绘制；
- 沿用蓝白科技外壳、橙黄/粉红危险核心、厚描边和硬投影；
- 路线标识必须在世界内清晰可见，不能只依赖 HUD；
- 动态素材优先使用统一图集，避免每帧创建图片；
- 需要碰撞的素材才登记到 `assets/manifest.json`；
- 所有资源通过现有 `assetURL()` 和预加载清单加载；
- 不使用真实公司 Logo，使用抽象的额度、芯片、路由、面具、延迟图形。

## 模块改动范围

### `src/route-patterns.js`

- 增加多高度路线家族；
- 使用注入的随机函数；
- 给新模式登记 `min`、`family`、必要的 `devices` 和教学提示；
- 保留安全路线和恢复段规则；
- 调整 novelty 权重，避免新模式长期不出现。

### `src/game.js`

- 接入路线标识和高低路线的视觉提示；
- 复用现有平台、动态障碍、滑翔、下砸与落地逻辑；
- 必要时补充路线统计和事件状态显示；
- 继续通过 `KNOWN_MULT` 审计事件效果标签；
- 不引入第二套移动或事件状态系统。

### `src/memes.js`

- 增加 AI 事件数据；
- 只使用已支持的 `speedMul`、`scoreMul`、`riceMul`、`gapMul`、`jumpMul`、`glideMul` 和 `challenge`；
- 为现实依据不足的内容明确写成讽刺性游戏演绎；
- 设置合理的事件组，避免同类事件连续出现。

### 验证工具

- `tools/verify_routes.cjs`：增加随机种子、垂直路线签名、混合障碍和平台可达性检查；
- `tools/verify_balance.py`：登记新路线的最低 tier、障碍组合和几何预算；
- 动态障碍浏览器测试：确认路线提示、事件状态、暂停冻结和素材预加载；
- 如维护 `dist/` 发布产物，源代码验证通过后再统一生成，不手工维护两份逻辑。

## 验收标准

### 玩法

- 玩家能明显区分地面、中层、高层路线；
- 至少三种新路线组合在实际运行中出现；
- 高层路线提供额外奖励但不是唯一解；
- 跳跃、二段跳、滑翔、下砸和滑铲能在同一路段形成连续动作；
- 新路线不会长期重复同一高度或同一障碍组合。

### 平衡

- 慢速、中速和后期速度均存在可达路线；
- 平台路线通过可达性审计；
- 地面障碍不生成在坑中或不可落地区域；
- 动态障碍的运动包络计入跳跃预算；
- 事件负面效果不会让基础路线不可操作；
- 事件结束后所有临时修饰器正确移除。

### 美术与 UI

- 新素材全部预加载，无 404 或控制台警告；
- 路线入口提示至少提前一个可反应节拍出现；
- 事件 Banner、世界内提示和 HUD 状态颜色一致；
- 缺少可选素材时仍能回退到现有程序化绘制；
- 手机横屏状态下路线提示和事件 Banner 不遮挡角色与关键障碍。

### 验证命令

```text
python tools/verify_balance.py
node tools/verify_routes.cjs
node tools/verify_experience.cjs
node tools/verify_special_obstacles.cjs
node tools/verify_experience_browser.cjs
node tools/verify_mobile_controls.cjs
node tools/verify_dynamic_hazards_browser.cjs
```

真人试玩需要额外确认：

- 高空路线是否足够诱人；
- 路线标识是否一眼可读；
- 高低切换是否让人感到“操作丰富”，而不是“画面混乱”；
- AI 事件是否改变了玩法，而不仅是换一段文案；
- 事件负面效果是否有趣且不会令人觉得被随机惩罚。

## 实施顺序

1. 确认并制作第一优先级路线与事件素材。
2. 完成多高度路线模式和世界内提示。
3. 扩展 AI 事件数据并验证修饰器组合。
4. 更新路线与平衡审计。
5. 接入素材预加载、manifest 和版本号。
6. 运行静态与浏览器回归。
7. 进行真人试玩，根据可读性和重复感调整权重与素材优先级。
8. 真人试玩通过后，再制作第二批平台、事件状态和角色反馈素材。

## 2026-10-07 随机特殊事件落地

按后续用户要求，以上五个 AI 主题已补为五种有实际跑道内容的随机特殊事件：漏饭、敲箱重启、经济站台、包裹验货、找回芯片。各有对应角色专属姿态，配发饭台、维修台或验货门微场景与进退场演出。完整效果、美术和验证见 [实现记录](2026-10-07-origin-plan-random-events.md)。本记录只确认随机事件部分的完成。
