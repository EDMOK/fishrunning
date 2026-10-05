# 手机横屏自适应取景与输入边沿修复（2026-10-05）

## 问题

1. **横屏画面过小（用户报障）。** 舞台固定 1280×720（16:9），手机横屏普遍是 19.5:9 ~ 21:9。按高度适配后左右各留一条黑边，844×390 的机器上画面只有 672×378，占屏宽 80%，两侧共 172px 是空的。
2. **快速点按滑铲失效（在途改动的回归）。** 未提交的输入简化删掉了「按压边沿缓冲」。手指按下与抬起若落在同一个物理步内（120Hz 步长 8.3ms，而套件里的点按是在同一个 16.7ms 帧内完成的），滑铲请求随手指一起消失。
3. **验证脚本在说谎。** `tools/verify_mobile_controls.cjs` 的布局循环用 `assert` 抛错，抛错发生在写 JSON **之前**，于是磁盘上一直留着上一轮的绿色报告。布局断言实际一直失败，但报告显示 19/19 全过。
4. **`setPointerCapture` 无保护。** 它抛异常（合成事件、浏览器拒绝）会中断 `pointerdown` 处理器，把整个按压吞掉；`wireHold` 里还有一处是注释与代码不符（注释说 capture 不是前提，代码里它就是前提）。

## 改动

### 取景：更宽的屏幕填满宽度，代价从天空里出

- `fitStage()`（`src/game.js`）在触摸设备上判断 `availW/availH > 16/9`，是则改为按宽度适配，并把画布顶部裁掉 `crop` 行后缩放铺满高度。
- 裁切上限 `SKY_CROP_MAX = 72`。约束来自实测：
  - 世界层从画布 y=132 开始（`WORLD_OY = 600 − 600×0.78`），画布 y<132 全是屏幕空间天空，没有任何关卡物体，所以裁切不会切到跑道。
  - 舞台变矮后 HUD 仍锚在舞台顶部，换算到画布坐标等于**整体下移 crop**：分区牌底从 y=143 变成 143+crop。
  - 主角跳跃帧**顶部没有透明留白**（`assets/hero/apex.png` alpha 从第 1 行开始），地面二段跳最高点精灵顶在画布 y≈225。crop=72 时分区牌底 215，余量约 10px；crop=80 时会擦到。
  - 弹簧（`vy = −1120k`）接二段跳可到画布 y≈168，会钻到分区牌后面。这是玩家自找的极限弧线、且那一刻没有需要读取的信息；要让它也不相交，crop 必须 ≤25，等于放弃整个改动。**这是已知取舍。**
  - 标题卡 590 高（`.card` 保留 28px 边距），各视口都放得下。
- 桌面浏览器与竖屏平板不走这条路（`mobileRender` 判定），桌面回归为 0。
- `index.html`：`#stage` 高度改为 `calc(720px - var(--crop,0px))`，canvas 绝对定位并 `top:calc(-1 * var(--crop,0px))`。HUD、两张卡、加载层都是舞台子元素，随舞台一起缩短上移，不会漂出裁剪后的顶边。`#fit` 增加 `env(safe-area-inset-left/right)` 内边距，JS 量的是内容盒，刘海屏与全面屏手势条不再吃掉画面（也省掉一份写死在 JS 里的断点）。

效果（`docs/mobile-controls-verification.json` 的 `framing` 字段）：

| 视口 | 裁切 | 画面 | 屏宽占比 | 屏高占比 |
| --- | --- | --- | --- | --- |
| 568×320 | 0 | 568×320 | 1.000 | 0.998 |
| 844×390 | 72 | 770×390 | 0.913 | 1.000 |
| 844×475 | 0 | 844×475 | 1.000 | 0.999 |
| 926×428 | 72 | 845×428 | 0.913 | 1.000 |
| 1280×720（桌面） | 0 | 1280×720 | 1.000 | 1.000 |

844×390 下画面从 672×378 变为 770×390：**+18.2% 可视面积**，左右黑边由 172px 减到 74px（其余受长宽比上限约束，不是浪费）。

### 输入：按压边沿不随手指消失

- `slideBuffer`（按下沿，来源：手柄滑铲键、键盘 ↓）与 `gestureDownT`（下滑手势的按住，0.52s）都改为**按模拟时间在 `update()` 里衰减**。暂停/商店/切后台时世界冻结，它们也随之冻结，不会在卡片后面过期；也不会再写进 `keys` 而误伤玩家正按着的 ↓（旧实现用 `setTimeout`+`keys['ArrowDown']`，既按真实时间过期又会覆盖键盘按住态）。
- 下滑手势从「过期后主动 release」改为顺带结束跳跃按住（`endTouch`），不需要定时器、语义与「滑动即取消点按」一致。
- `jumpFollowup` 恢复：两次点按落在同一物理步内时，第二次存续到下一步，二段跳不再被吞。这是手机上掉帧时的常见情形。
- `wireHold`：先接受按压再尝试 capture，并用 `try/catch` 包住；释放路径统一走 window 级 `pointerup/pointercancel` + 元素级 `lostpointercapture`，手指滑出按钮仍会释放。
- 舞台手势的 `pointerup/pointercancel` 从元素级改为 window 级（`pointerdown` 时已 `setPointerCapture`），手指抬在画面外的黑边里也能结算，不会卡住 `touchStart` 锁死后续所有触摸。
- **跨模态漏输入（独立验证复现的真实缺陷）。** 旧的 `resetInput()` 会调 `endTouch()`，拆散后 `endTouch` 变成 `bindInput` 内部作用域，商店/暂停/新局三条路径再也够不到它：手指按在屏幕上 → 开商店或用 P 暂停 → 返回后抬起手指，会凭空触发一次跳跃（`inert` 只挡新事件，挡不住已经在途的这一根手指）。修法是让 `endTouch` 回到模块作用域并新增 `clearInput()`（清按键、清在途手指、清手柄按住、清 `player.buffer` 与三个请求缓冲），由 `toggleShop`、`setPause(true)`、`resetWorld()`、`interrupt()` 共用；`pointerup` 结算后也顺手排空请求缓冲，避免 `pointercancel` 路径把它们带进下一局。
- **卡片下拖动手势会存下请求。** `pointermove` 手势增加 `game.state === 'playing'` 前置判断：暂停卡上向下划一下，恢复后不再自动滑铲。
- **滑铲续期语义恢复。** `slidePressed()` 在按下时若正在滑铲则把 `slideT` 归零，重新计满 `SLIDE_MIN`（与旧 `beginSlide()` 一致）；仅在 7 帧这种紧凑时序下才看得出差别，已有专门用例（见下）。
- **`navigator.wakeLock.request()` 同步 try/catch**：规范返回 Promise，但抛异常的实现会挂在渲染帧上。

### 其它移动端短板

- **切后台/锁屏。** 原先只监听 `blur`，而手机上切 App、锁屏更可靠的是 `visibilitychange`（iOS 尤其如此）。补齐为两者都监听：清掉按键与按住态、作废未执行的输入请求、并暂停，避免「看不见的时候把一局跑没」。
- **屏幕自动休眠。** 新增 `syncWakeLock()`（`navigator.wakeLock`，能力检测 + 失败静默）：`playing` 时申请 `screen` 锁、离开 `playing` 释放；浏览器在页面隐藏时会自行释放，恢复游戏后下一帧重新申请。手机跑图几分钟不再中途黑屏。
- **下拉刷新。** `html,body` 加 `overscroll-behavior:none`：左半屏下滑是滑铲手势，Chrome Android 上这类下滑到达页顶会触发下拉刷新。
- **卡片文案。** 暂停卡原先只列键盘操作（「长按空格 滑翔」在手机上根本不存在），结算卡写「按 空格 / Enter 立即重跑」。两张卡改为各自带一份 `.mobileHelp` 触屏说明，触屏下隐藏键盘那份（选择逻辑与标题卡同一组媒体查询），结算卡在触屏下改为「点按屏幕立即重跑」——并且「点按结算卡重跑」本来就有实现，现在补了回归用例。
- **微信/QQ 内置浏览器的「玩不了」。** 在这两类 webview 里，全屏会被拒绝、横屏锁不住、音频也常被限制，从聊天里点开链接的玩家很容易得出「这游戏玩不了」的结论。新增 `#openTip` 提示条（`position:fixed`，`z-index:12`：高于手柄 8、低于竖屏卡 20 与商店面板 30），只在 UA 命中 `MicroMessenger` / `QQ\/\d` **且** `mobileRender` 时出现，文案指向「点右上角 ⋯ 选在浏览器打开」，点「知道了」或开局即收起，所以不会压在 HUD 上。加载失败页在这两类浏览器里也换成同一份指引（不再展示本机起服务器的说明，那对手机玩家没有意义）。桌面浏览器即使 UA 命中也不显示（桌面没有这些问题，提示反而变成噪音）。

## 验证

`node tools/verify_mobile_controls.cjs` → **38/38 通过**，`errors: []`，产物 `docs/mobile-controls-verification.json`：

- 行为 34 项（含新增 `quick slide tap registers @WxH` ×3，把原先在布局循环里裸奔的断言收进结果集；新增 `hiding the tab pauses and clears fingers`、`screen wake lock follows the run`、`cards drop keyboard wording on touch`、`tap on the game-over card restarts`，以及独立验证逼出来的 `finger held across the shop does not jump on release`、`finger held across a pause does not jump on release`、`swipe on a card does not bank a slide`、`an early repeat tap restarts the slide minimum`）。
- 内置浏览器提示 3 项：正常浏览器不出现、微信 UA 出现且文案指向浏览器、QQ UA 出现；每项都用**全新页面、未做任何交互**时断言——开局会收起提示，若在开局后再断言，即使提示错误地出现过也会通过（这个永真陷阱在对照中被抓到过一次）。
- 新用例全部做过**对照验证**：临时移除对应修复后重跑，用例确实失败（例如去掉 `clearInput()` 里的 `endTouch()` → 两个跨模态用例失败），确认它们不是永真断言。
- 取景 5 项：裁切 < 132（不得侵入世界层）、画面高度占比 ≥ 0.985、宽度占比 ≥ 0.90、标题卡放得进裁剪后的舞台。
- 工具本身修了「断言抛错就不写报告」的问题：布局检查改为逐视口 `try/catch` 记入 `results`，任何失败都会写进 JSON。
- 唤醒锁用例把 `navigator.wakeLock` 打桩后只验证**接线**（运行中申请、暂停时释放、恢复后重新申请）；API 本身在无头页面拿不到，未验证。
- 标题卡在裁切后的舞台（648 画布单位高）实截图确认完整显示；桌面 1366×768 实截图确认无回归（无裁切、满幅）。

**独立验证（subagent，共两轮）**：第一轮给出 FAIL 并复现了跨模态幽灵跳跃（同时独立测量确认：40 秒模拟内被绘制的世界物体最高在画布第 297 行，距 72 行的裁切线还有 225 行，裁切确实只吃到天空；桌面/无裁切路径与旧公式逐像素一致）。修复后第二轮 PASS：原复现步骤不再触发跳跃，点按开始/点按重开/按钮点击/滑动/掉帧连点各路径均正常，且真机无关的 `src/game.js` 哈希在整轮验证中未变。

其余：`python tools/verify_balance.py` PASS；`node tools/verify_routes.cjs`、`verify_experience.cjs`、`verify_special_obstacles.cjs` 通过；`verify_coast.cjs` 通过（需自行在 8123 起静态服务，该脚本不自带服务器）。

**未验证：** 真机（iOS Safari / Android Chrome）上的刘海与手势条内边距、以及真机 120Hz 触控采样下的手感。全部结论来自 Edge 移动模拟 + CDP 触摸事件。
