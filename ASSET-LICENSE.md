# 素材许可说明

本文件说明运行时素材与源码许可证的边界。

## 运行时成品素材

`assets/` 下的成品素材与源码分开管理，不因仓库中的 MIT License 自动获得 MIT 授权。

公开发布前，仓库维护者需要确认这些素材的来源、生成方式和可再分发权限。尤其是 `assets/mascot/` 中使用的 AI 公司或产品相关形象、名称和标识，可能涉及商标、版权或平台使用规则。

在未完成逐项确认前，请将本仓库视为个人演示或研究用途，不要将素材用于暗示任何相关公司的官方背书，也不要移除来源和权利标记。

## 未随公开版发布的输入素材

以下路径不属于运行时公开版：

- `assets/raw/`：素材构建脚本的原始输入
- `image_形象/`：角色参考图

它们需要单独取得和确认授权，不能因为构建脚本仍在仓库中就推定可以公开分发。

## 代码与素材的区别

- 源码、构建脚本和文档：见根目录 `LICENSE`，采用 MIT License。
- 运行时图片：仅在权利人明确授权的范围内使用；本文件不授予超出该范围的权利。

## 2026-10-01 sunset coast assets

`raw/coast/` and `assets/coast/` contain game assets generated with the built-in imagegen tool using the user's attached image as an art-direction reference. They are new background, terrain, hazard, collectible and cyclist images. The heroine sprites and existing UI remain from the existing project. Prompt records and packaging notes are in `docs/coast-art-prompts.md` and `docs/coast-expansion.md`. This provenance record does not grant rights in third-party character or brand elements.

## 2026-10-01 special obstacle assets

`raw/obstacle_special/` contains three independent transparent images created with the built-in imagegen tool: a rice cargo crab, a whale-tail spring and a transforming warning buoy. Their runtime sprites are `assets/obstacle/new/cargo.png`, `spring.png` and `buoy.png`. Full prompts are recorded in `docs/special-obstacle-art-prompts.json`; `tools/build_special_obstacles.py` preserves alpha and aspect ratio while packaging them. These images are game-compositing assets without a HUD or background.
