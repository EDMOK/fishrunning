/* AI 圈二创内容表 — 分区、事件、卡牌、里程碑
 *
 * 这份文件只有数据，没有逻辑；游戏逻辑在 game.js 里解释这些字段。
 *
 * 取材原则（写新条目前请先读）：
 *  1. 每条都带 `src` —— 能核实的真实事件才写进游戏。查不到来源的说法一律不用。
 *     已被调研否掉的：Altman「原子弹爆炸」原话（查无出处，属张冠李戴）、
 *     「Llama 改名梗」、「哀嚎的 GPU」，都不要加回来。
 *  2. 调侃公司行为与公开事实，不涉及具体个人的私德或未经证实的指控。
 *  3. `eval` 字段只用 game.js 认识的效果标签，不要在这里写代码。
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 效果标签
  // game.js 通过 applyEffects() 解释这些键。没有列在这里的键会被忽略，
  // 所以安全地加新标签不会让旧版本崩溃。
  //
  //   speedMul    世界速度乘数（持续）
  //   scoreMul    得分乘数（持续）
  //   riceMul     白饭价值乘数（持续）
  //   gapMul      障碍间距乘数（持续，>1 更稀疏 / <1 更密）。下限被 game.js
  //               夹在 0.88：再密的话满速下的二段跳会越过一整个间隔砸进下一组
  //               障碍。要更密请改障碍本身的编排，不要调这个值。
  //   powerMul    道具时长乘数（永久）
  //   comboAdd    连击窗口加成秒数（永久）
  //   jumpMul     二段跳速度乘数（永久）
  //   glideMul    滑翔体力上限乘数（永久）
  //   stompMul    下砸弹跳高度与得分乘数（永久）
  //   dashAdd     冲刺充能格数加成（永久）
  //   riceRain    立即撒下 n 颗白饭
  //   openAll     立即把场上障碍变成白饭
  //   invuln      立即获得 n 秒无敌
  //   wall        在 n 距离后竖起一道必须跳过的墙
  //   lifeAdd     立即加 n 条命
  //   shuffle     随机让一个道具失效或全部续期
  //   shock       瘫坐 n 秒（纯表演，期间自动无敌，不剥夺操作）
  //   refreshPowers  所有道具立刻续期到满
  //   magnet      立刻获得 n 秒吸附
  //   shield      立刻获得一层防火墙

  // ------------------------------------------------------------------- 分区
  // 沿距离推进。层目录对应 assets/bg/<layers>/，缺图时 game.js 回退到 zone 0。
  var ZONES = [
    {
      id: 'city',
      name: '语料海',
      tag: 'CORPUS SEA',
      at: 0,
      layers: null,                 // 用原有的 bg/ 图层
      rule: null,                   // 教学区，不加规则
      line: '开局先跑起来再说。',
      goal: { kind: 'rice', target: 15, label: '收集白饭' },
      mascot: 'deepseek'
    },
    {
      id: 'arena',
      name: '榜单擂台',
      tag: 'LEADERBOARD ARENA',
      at: 3600,
      layers: 'arena',
      rule: { scoreMul: 1.25, gapMul: 0.92 },
      ruleText: '评分区：得分 ×1.25，障碍更密',
      line: '榜先刷上去，效果后面再复现。',
      goal: { kind: 'nearMiss', target: 3, label: '完成险过' },
      src: 'Meta Llama 4 被曝用 LMArena 特供实验版刷 Elo（2025-04，Meta 承认）',
      mascot: 'gemini'
    },
    {
      id: 'market',
      name: '开源市集',
      tag: 'OPEN-WEIGHT MARKET',
      at: 7500,
      layers: 'market',
      rule: { riceMul: 2.0 },
      ruleText: '开源区：白饭价值 ×2',
      line: '权重放出来了，随便拿。',
      goal: { kind: 'rice', target: 25, label: '收集白饭' },
      src: 'Qwen3.8 首次开源 Max 级模型；DeepSeek V4-Pro 2026-04-24 开源',
      mascot: 'qwen'
    },
    {
      id: 'vault',
      name: '算力金库',
      tag: 'COMPUTE VAULT',
      at: 13000,
      layers: 'vault',
      rule: { powerMul: 1.5, gapMul: 0.95 },
      ruleText: '算力区：道具时长 +50%',
      line: '卡先囤着，跑得动才怪。',
      goal: { kind: 'nearMiss', target: 4, label: '完成险过' },
      src: 'xAI Colossus 2024-07 上线 10 万 H100，后宣称冲 100 万 GPU',
      mascot: 'zhipu'
    },
    {
      id: 'wall',
      name: '合规边境',
      tag: 'COMPLIANCE BORDER',
      at: 21000,
      layers: 'wall',
      rule: { lifeAdd: 1 },
      ruleText: '边境区：多一条命，但要过审',
      line: '请出示你的服务地区。',
      goal: { kind: 'rice', target: 30, label: '收集白饭' },
      src: 'Anthropic 支持地区列表不含中国大陆、香港、澳门，2025-09 进一步收紧',
      mascot: 'claude'
    }
  ];

  // ------------------------------------------------------------------- 事件
  // kind: 'timed' 有持续时间并会还原；'instant' 立刻结算。
  var EVENTS = [
    {
      "id": "quota-spill",
      "title": "额度缩水，袋子漏饭了",
      "who": "qwen",
      "text": "袋子缩水了，漏出来的饭可没缩水！",
      "cue": "前方 12 颗漏饭 · 接住才算你的",
      "topic": "quota",
      "group": "reward",
      "eval": {
        "routeEvent": {
          "kind": "quota-spill"
        }
      },
      "art": "event/qwen_quota_spill",
      "kind": "instant",
      "dur": 3.6,
      "originPlanTopic": "quota",
      "src": "依据 2026-10-06 多高度路线与 AI 奇闻事件计划；虚构游戏演绎，不断言现实平台行为",
      "scene": "stage/supply_dock",
      "sceneLine": "漏出来的饭也算你的！"
    },
    {
      "id": "brain-reboot",
      "title": "脑袋卡住了，敲箱重启",
      "who": "gemini",
      "text": "答案卡在箱子里了，敲开看看！",
      "cue": "可跳过 · 下砸/冲刺开箱并通过，再补 8 颗饭",
      "topic": "quality",
      "group": "hazard",
      "minTier": 1,
      "requiresHint": "cargo",
      "eval": {
        "routeEvent": {
          "kind": "brain-reboot",
          "successRice": 8,
          "needBreak": true
        }
      },
      "art": "event/gemini_brain_reboot",
      "kind": "instant",
      "dur": 3.6,
      "originPlanTopic": "quality",
      "src": "依据 2026-10-06 多高度路线与 AI 奇闻事件计划；虚构游戏演绎，不断言现实平台行为",
      "scene": "stage/repair_dock",
      "sceneLine": "敲开箱子，重启开饭！"
    },
    {
      "id": "economy-route",
      "title": "高级车票，经济站台",
      "who": "gpt",
      "text": "车票没变，站台变矮了。高级餐还在上面！",
      "cue": "地面 6 颗饭 · 可选站台上有 3 颗大米饭",
      "topic": "routing",
      "group": "reward",
      "minTier": 1,
      "eval": {
        "routeEvent": {
          "kind": "economy-route"
        }
      },
      "art": "event/gpt_economy_route",
      "kind": "instant",
      "dur": 3.6,
      "originPlanTopic": "routing",
      "src": "依据 2026-10-06 多高度路线与 AI 奇闻事件计划；虚构游戏演绎，不断言现实平台行为",
      "scene": "stage/scanner_gate",
      "sceneLine": "高级餐还在上面呢！"
    },
    {
      "id": "proxy-parcels",
      "title": "中转站面具掉了",
      "who": "claude",
      "text": "名字都很高级，里面有饭的只有一包。",
      "cue": "认准实心米粒印记 · 空壳不扣饭、不扣命",
      "topic": "identity",
      "group": "reward",
      "minTier": 1,
      "eval": {
        "routeEvent": {
          "kind": "proxy-parcels"
        }
      },
      "art": "event/claude_proxy_parcels",
      "kind": "instant",
      "dur": 3.6,
      "originPlanTopic": "identity",
      "src": "依据 2026-10-06 多高度路线与 AI 奇闻事件计划；虚构游戏演绎，不断言现实平台行为",
      "scene": "stage/scanner_gate",
      "sceneLine": "有米粒印记的才是真货。"
    },
    {
      "id": "chip-reclaim",
      "title": "默认降档，把芯片找回来",
      "who": "zhipu",
      "text": "高速档被拆成碎片了，捡回来就能装好！",
      "cue": "集齐 3 片芯片 → GPU 加速 4 秒",
      "topic": "defaults",
      "group": "reward",
      "minTier": 1,
      "eval": {
        "routeEvent": {
          "kind": "chip-reclaim",
          "quest": "chip"
        }
      },
      "art": "event/zhipu_chip_reclaim",
      "kind": "instant",
      "dur": 3.6,
      "originPlanTopic": "defaults",
      "src": "依据 2026-10-06 多高度路线与 AI 奇闻事件计划；虚构游戏演绎，不断言现实平台行为",
      "scene": "stage/repair_dock",
      "sceneLine": "把三片拼回高速档！"
    },
    {
      "id": "quota-feast",
      "title": "额度刷新，开饭！",
      "who": "qwen",
      "text": "额度补好了，饭也补好了！",
      "cue": "前方 24 颗白饭 · 分三波收集",
      "topic": "quota",
      "group": "reward",
      "eval": {
        "riceRain": 24
      },
      "art": "event/qwen_quota_feast",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/supply_dock",
      "sceneLine": "开饭啦，接住这一波！"
    },
    {
      "id": "outage-refund",
      "title": "刚才掉线，赔你一顿",
      "who": "deepseek",
      "text": "刚才的掉线，补你一顿。",
      "cue": "12 颗补给 + 护盾 · 已有护盾再补 4 颗",
      "topic": "availability",
      "group": "reward",
      "eval": {
        "refundRice": 12
      },
      "art": "event/deepseek_outage_refund",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/supply_dock",
      "sceneLine": "饭和护盾都给你备好了。"
    },
    {
      "id": "rollback-feast",
      "title": "回滚成功，障碍下锅",
      "who": "gpt",
      "text": "这版先撤回，障碍也一起撤。",
      "cue": "前方可见障碍变大米饭 · 留意坑与平台",
      "topic": "quality",
      "group": "reward",
      "eval": {
        "rollbackRice": true
      },
      "art": "event/gpt_rollback_feast",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/repair_dock",
      "sceneLine": "这版撤回，障碍下锅！"
    },
    {
      "id": "permission-nesting",
      "title": "权限套娃，还要再验一次",
      "who": "claude",
      "text": "验证通过，再验证一下。",
      "cue": "前方连续滑铲 · 无碰撞通过后补 8 颗白饭",
      "topic": "verification",
      "group": "hazard",
      "eval": {
        "rewardChallenge": {
          "kind": "doublecheck",
          "rice": 8
        }
      },
      "art": "event/claude_permission_check",
      "minTier": 2,
      "requiresHint": "slide",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/scanner_gate",
      "sceneLine": "先验一次，再验一次。"
    },
    {
      "id": "flash-restock",
      "title": "套餐返场，技能甩卖",
      "who": "zhipu",
      "text": "补货了！这次真的有货！",
      "cue": "随机 2–3 项技能六折 · 12 秒 · 可打开商店",
      "topic": "pricing",
      "group": "shop",
      "eval": {
        "discountShop": true
      },
      "art": "event/zhipu_flash_sale",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/market_stall",
      "sceneLine": "今天补货，六折开卖！"
    },
    {
      "id": "multimodal-box",
      "title": "多模态盲盒，开个惊喜",
      "who": "gemini",
      "text": "看得见、听得见，还能掉装备！",
      "cue": "正在开盒 · 护盾 / 吸附 6 秒 / GPU 4 秒",
      "topic": "multimodal",
      "group": "reward",
      "eval": {
        "powerLottery": true
      },
      "art": "event/gemini_multimodal_box",
      "kind": "instant",
      "dur": 3.6,
      "src": "虚构游戏事件，抽象自 AI 使用体验",
      "scene": "stage/repair_dock",
      "sceneLine": "看看盒子里藏着什么~"
    },
    {
      id: 'busy',
      title: '服务器繁忙，请稍后重试',
      who: 'deepseek',
      text: '算力被抢光了。速度掉下来，但摸鱼期间白饭双倍。',
      group: 'mood', cue: '速度降低 · 白饭翻倍',
      kind: 'timed', dur: 7,
      eval: { speedMul: 0.7, riceMul: 2.0 },
      src: 'DeepSeek 服务繁忙吐槽自 2025-02 起在 V2EX 长期存在'
    },
    {
      id: 'offpeak',
      title: '进入谷时电价',
      who: 'deepseek',
      text: '谷时五折。白饭价值 ×3，抓紧跑。',
      kind: 'timed', dur: 8,
      eval: { riceMul: 3.0 },
      src: 'DeepSeek 2026-08-13 起实行峰谷分时定价，谷时折扣'
    },
    {
      id: 'peak',
      title: '进入峰时电价',
      who: 'deepseek',
      text: '峰时涨价。前方障碍反而变稀了——没人跑得起。',
      kind: 'timed', dur: 8,
      eval: { gapMul: 1.5 },
      src: '同上；峰时为北京时间 9-12 点与 14-18 点'
    },
    {
      id: 'upload',
      title: '正在同步工作区快照',
      who: 'zhipu',
      text: '同步占用了一点算力，但跑道保持清晰可见。',
      kind: 'timed', dur: 6,
      eval: { speedMul: 0.82, gapMul: 1.18 },
      src: '智谱 ZCode 2026-09-18 被逆向发现默认整仓上传，官方当日晚致歉；遮挡改为可读的玩法惩罚'
    },
    {
      id: 'openweights',
      title: '权重放出来了',
      who: 'qwen',
      text: '场上所有障碍原地变成白饭。',
      kind: 'instant',
      eval: { openAll: true },
      src: 'Qwen3.8 首次开源 Max 级模型'
    },
    {
      id: 'rush',
      title: '订阅开抢',
      who: 'zhipu',
      text: '每天十点限量。白饭雨砸下来了。',
      kind: 'instant',
      eval: { riceRain: 26 },
      src: 'GLM Coding Plan 限量抢购、国际站不限购，V2EX 长期吐槽'
    },
    {
      id: 'outsource',
      title: '这活外包给 Qwen 了',
      who: 'qwen',
      text: '召唤千问分身代跑。4 秒内不会受伤。',
      kind: 'instant',
      eval: { invuln: 4 },
      src: 'DeepSeek-R1 蒸馏的 6 个 dense 模型中 4 个以 Qwen2.5 为 backbone'
    },
    {
      id: 'hype',
      title: '冲榜冲刺',
      who: 'gemini',
      text: '分数 ×1.6，但障碍也变密了。',
      kind: 'timed', dur: 7,
      eval: { scoreMul: 1.6, gapMul: 0.88 },
      src: 'Llama 4 与 LMArena 刷分争议'
    },
    {
      id: 'leap',
      title: '换代级提升',
      who: 'gpt',
      text: '看到新版本的那一刻直接瘫坐在地——缓过来之后，速度完全不一样了。',
      kind: 'timed', dur: 9,
      eval: { shock: 0.75, invuln: 2.4, speedMul: 1.35, scoreMul: 1.8 },
      shake: 24, flash: true,
      // 这条是玩梗，不是通告：字面出处（谁在何时说了什么）未能核实，中文搜索
      // 会把「奥特曼」解析成特摄片，英文侧也没有可引的原话。含义本身很明确——
      // 形容一次模型换代提升大到令人震惊失神。可核实的相邻事实是 Altman
      // 2023-05-16 参议院听证引用 IAEA 模式主张国际监管（核类比确有其事，
      // 但「原子弹爆炸」这个措辞不是他的原话）。
      src: '社区梗（字面出处未能核实，按玩梗使用）'
    },
    {
      id: 'demo',
      title: '演示视频已加速',
      who: 'gemini',
      text: '画面掉帧，速度暴涨。小字写着延迟已经降低了。',
      kind: 'timed', dur: 5,
      eval: { speedMul: 1.45 },
      src: 'Gemini 2023-12-06 演示片被指非实时、由静帧拼接，片中有 latency 免责小字'
    },
    {
      id: 'board',
      title: '董事会在开会',
      who: 'gpt',
      text: '投票结果：某个道具进垃圾桶，或者全体续期。',
      kind: 'instant',
      eval: { shuffle: true },
      src: 'OpenAI 2023-11-17 解雇 Altman，11-21 复职，历时五日'
    },
    {
      id: 'region',
      title: '该地区不受支持',
      who: 'claude',
      text: '前方竖起一道闸门。跳过去，或者被拒之门外。',
      kind: 'instant',
      eval: { wall: 900 },
      src: 'Anthropic 支持地区不含中国大陆与港澳；2025-09 收紧至中国控股实体'
    },
    {
      id: 'licence',
      title: '年收入超过两千万美元须另行授权',
      who: 'gpt',
      text: '开源，但不完全开源。道具立刻全部续期。',
      kind: 'instant',
      eval: { refreshPowers: true },
      src: 'MiniMax H3 开源但商业授权设收入门槛；社区称「开源但不完全开源」'
    },
    {
      id: 'queue',
      title: '请求排队中',
      who: 'deepseek',
      text: '前方服务节点排起长队，跑道会更密，但排队期间速度略降。',
      kind: 'timed', dur: 7,
      eval: { speedMul: 0.86, gapMul: 0.92 },
      src: 'AI 服务高峰期排队与限流是公开可见的常见服务现象；本条为游戏化障碍事件'
    },
    {
      id: 'maintenance',
      title: '临时维护窗口',
      who: 'zhipu',
      text: '维护工单在前方落地成一道闸门，跳过去就能继续。',
      kind: 'instant',
      eval: { wall: 1250 },
      src: '在线服务维护公告是公开常见的运营事件；本条为游戏化障碍事件'
    },
    {
      id: 'discount',
      title: '限时特价上架',
      who: 'qwen',
      text: '随机两至三项技能打六折，打开商店即可购买。',
      kind: 'instant',
      eval: { discountShop: true },
      src: '模型服务与订阅促销是公开常见的商业活动；本条为游戏化折扣事件'
    },
    {
      id: 'cachemiss',
      title: '缓存未命中',
      who: 'gemini',
      text: '数据重新计算中：前方障碍略密，但白饭收益提高。',
      kind: 'timed', dur: 8,
      eval: { gapMul: 0.94, riceMul: 1.18 },
      src: '缓存命中率与推理吞吐是公开常见的系统指标；本条为游戏化事件'
    },
    {
      id: 'captcha',
      title: '请完成滑动验证',
      who: 'claude',
      text: '低空验证条横在路上，按住下方向键滑过去。',
      kind: 'instant',
      eval: { challenge: 'captcha' },
      src: '网页滑动验证是公开常见的交互机制；本条为游戏化障碍事件'
    },
    {
      id: 'sweep',
      title: '动态风控巡查',
      who: 'claude',
      text: '验证条在前方来回巡航。看准提示，滑铲通过。',
      group: 'hazard', cue: '移动障碍 · 滑铲通过',
      kind: 'instant',
      eval: { challenge: 'sweep' },
      src: '在线服务动态风控与验证是公开常见的交互机制；本条为游戏化障碍事件'
    },
    {
      id: 'doublecheck',
      title: '二次验证已启用',
      who: 'gpt',
      text: '两道验证条接连出现，保持低姿态穿过去。',
      group: 'hazard', cue: '连续障碍 · 两次滑铲',
      kind: 'instant',
      eval: { challenge: 'doublecheck' },
      src: '二次验证是公开常见的账号安全机制；本条为游戏化障碍事件'
    },
    {
      id: 'cacheflush',
      title: '缓存风暴来袭',
      who: 'gemini',
      text: '失效的数据块在跑道上左右漂移。提前起跳。',
      group: 'hazard', cue: '移动地面障碍 · 提前跳跃',
      kind: 'instant',
      eval: { challenge: 'cacheflush' },
      src: '缓存失效是公开常见的系统运行现象；本条为游戏化障碍事件'
    },
    {
      id: 'batch',
      title: '批量请求合并成功',
      who: 'qwen',
      text: '白饭集中到账，接下来的路也宽松了一些。',
      group: 'reward', cue: '白饭雨 · 障碍间距增加',
      kind: 'timed', dur: 8,
      eval: { riceRain: 14, gapMul: 1.25 },
      src: '批量推理是公开常见的服务能力；本条为游戏化奖励事件'
    },
    {
      id: 'warmup',
      title: '预热完成，吞吐提升',
      who: 'deepseek',
      text: '跑得更快、得分更高，注意观察前方。',
      group: 'mood', cue: '速度与得分提升',
      kind: 'timed', dur: 7,
      eval: { speedMul: 1.18, scoreMul: 1.3 },
      src: '模型服务预热与吞吐提升是公开常见的运行现象；本条为游戏化节奏事件'
    },
    {
      id: 'quota-shrink',
      topic: 'quota',
      title: '套餐额度重新解释',
      who: 'qwen',
      text: '宣传页还是原来的宣传页，剩余额度却突然变短了。跑慢一点，先把能拿的白饭拿走。',
      group: 'mood', cue: '额度缩水 · 收益下降 · 路线放宽',
      kind: 'timed', dur: 8,
      eval: { speedMul: 0.9, scoreMul: 0.72, riceMul: 0.78, gapMul: 1.12 },
      src: 'OpenCode Go 套餐额度变化的社区讨论；本条为讽刺性游戏演绎，不断言具体运营事实'
    },
    {
      id: 'quality-regression',
      topic: 'quality',
      title: '模型突然学会了降智',
      who: 'gemini',
      text: '回答变短了，思路也变直了。二段跳与滑翔窗口缩短，别把高光路线当成必选项。',
      group: 'mood', cue: '模型降智 · 二段跳与滑翔受限',
      kind: 'timed', dur: 7,
      eval: { scoreMul: 0.68, riceMul: 0.82, jumpMul: 0.9, glideMul: 0.72, gapMul: 1.15 },
      src: '社区对模型能力回退的泛化吐槽；本条为讽刺性游戏演绎，不指向未经证实的具体事件'
    },
    {
      id: 'premium-fallback',
      topic: 'routing',
      title: '高级模型路由到经济档',
      who: 'gpt',
      text: '账单仍按高级档计算，回答却绕路去了便宜节点。速度下降，前方暂时留出更多反应时间。',
      group: 'mood', cue: '路由降档 · 速度下降 · 间距增加',
      kind: 'timed', dur: 8,
      eval: { speedMul: 0.76, scoreMul: 0.7, gapMul: 1.3 },
      src: '模型路由与降级服务是公开常见的系统机制；本条为讽刺性游戏演绎'
    },
    {
      id: 'proxy-mask',
      topic: 'identity',
      title: '中转站换上 Claude / GPT 的面具',
      who: 'claude',
      text: '名字写得很高级，跑近才发现是另一条路线。看准巡航验证条，滑铲通过。',
      group: 'hazard', cue: '伪装路由 · 移动验证条',
      kind: 'instant',
      eval: { challenge: 'sweep' },
      src: 'AI 中转服务的模型标注与实际路由存在信息不对称风险；本条为虚构讽刺事件，不指控具体平台'
    },
    {
      id: 'silent-downgrade',
      topic: 'defaults',
      title: '默认档位悄悄下调',
      who: 'deepseek',
      text: '没有公告，没有弹窗，只是输出变得更像自动补全。白饭少一点，但跑道会暂时变宽。',
      group: 'mood', cue: '默认降档 · 收益下降 · 障碍变稀',
      kind: 'timed', dur: 6,
      eval: { scoreMul: 0.62, riceMul: 0.75, gapMul: 1.22 },
      src: '在线服务默认路由与模型降级是公开常见的产品机制；本条为虚构讽刺事件'
    }
  ];

  // ------------------------------------------------------------------- 商店
  // 技能只在本局有效。每级使用固定小幅增益，避免多个倍率系统相乘后失控。
  //
  // 价格分档的依据：一局白饭收入大约每 1000 米 220–260（白饭与大米饭按现有编排
  // 铺，再乘分区/事件倍率）。全部买满约 3000 白饭，所以一局只够挑一条流派里的
  // 几级，这是有意的取舍；首级刻意压在 35–70，保证跑出两三百米就能买到东西。
  //
  // 字段说明：
  //   tag    流派标签，只影响商店卡片的配色与文案
  //   stat   对应 game.js 的 mulOf()/addOf() 键；必须登记在 KNOWN_MULT 或
  //          INSTANT_TAGS 里，否则只在控制台警告、实际不生效
  //   icon   有美术文件时写路径；没有的用 glyph，由 game.js 现画
  //   onBuy  购买时立刻结算一次的即时效果（走 fireInstantTag）
  var SHOP_SKILLS = [
    {
      id: 'combo', name: '缓存命中', tag: '收益', icon: 'item/chip',
      desc: '连击窗口每级 +0.3 秒', stat: 'comboAdd', mode: 'add',
      values: [0.3, 0.3, 0.3], costs: [35, 65, 105]
    },
    {
      id: 'rice', name: '白饭优化', tag: '收益', icon: 'item/rice',
      desc: '白饭收益每级 +8%', stat: 'riceMul', mode: 'mul',
      values: [0.08, 0.08, 0.08], costs: [40, 70, 120]
    },
    {
      id: 'jump', name: '滑动窗口', tag: '机动', icon: 'item/shield',
      desc: '二段跳高度每级 +4%', stat: 'jumpMul', mode: 'mul',
      values: [0.04, 0.04, 0.04], costs: [50, 85, 140]
    },
    {
      id: 'power', name: '算力调度', tag: '强化', icon: 'item/magnet',
      desc: '道具持续时间每级 +8%', stat: 'powerMul', mode: 'mul',
      values: [0.08, 0.08, 0.08], costs: [50, 85, 140]
    },
    {
      id: 'score', name: '评分加权', tag: '收益', glyph: 'chart',
      desc: '跑动与击杀得分每级 +8%', stat: 'scoreMul', mode: 'mul',
      values: [0.08, 0.08, 0.08], costs: [55, 100, 160]
    },
    {
      id: 'glide', name: '流式滑翔', tag: '机动', glyph: 'wing',
      desc: '滑翔体力每级 +25%', stat: 'glideMul', mode: 'mul',
      values: [0.25, 0.25, 0.25], costs: [55, 100, 160]
    },
    {
      id: 'stomp', name: '压栈下砸', tag: '机动', glyph: 'hammer',
      desc: '下砸弹跳高度与得分每级 +15%', stat: 'stompMul', mode: 'mul',
      values: [0.15, 0.15, 0.15], costs: [65, 110, 180]
    },
    {
      id: 'dash', name: '并行冲刺', tag: '机动', glyph: 'bolt',
      desc: '冲刺充能上限 +1 格', stat: 'dashAdd', mode: 'add',
      values: [1, 1, 1], costs: [70, 120, 195]
    },
    {
      id: 'life', name: '冗余副本', tag: '强化', icon: 'ui/heart',
      desc: '立即 +1 条命（买几次加几条）', stat: 'lifeAdd', mode: 'add',
      values: [1, 1, 1], costs: [120, 210, 330], onBuy: { tag: 'lifeAdd', v: 1 }
    }
  ];

  // --------------------------------------------------------------- 里程碑
  // 每 1000m 一次轻反馈；技能在商店购买。
  var MILESTONE = {
    step: 1000,
    words: [
      '稳步推进', '渐入佳境', '架构稳定', '上下文还在', '还在跑',
      '没崩', '服务正常', '吞吐不错', '延迟可控', '继续'
    ]
  };

  // 客串台词：撞到、连击、通关时随口说的。避免指向具体个人。
  var BARKS = {
    hit: ['又被拦了', '这次不算', '重来', '触发了限流'],
    combo: ['连击稳定', '吞吐拉满', '这个势头保持住'],
    zone: ['换区了', '前面是新场子', '注意这段的规矩']
  };

  global.DSMemes = {
    ZONES: ZONES,
    EVENTS: EVENTS,
    SHOP_SKILLS: SHOP_SKILLS,
    MILESTONE: MILESTONE,
    BARKS: BARKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
