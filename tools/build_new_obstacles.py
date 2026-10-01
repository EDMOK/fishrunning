"""Prepare the seven generated obstacle illustrations for the game canvas."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "raw" / "obstacle_new"
DEST = ROOT / "assets" / "obstacle" / "new"
SIZES = {
    "patrol": (80, 65),
    "crystals": (96, 76),
    "mine": (88, 88),
    "drone": (114, 96),
    "turret": (128, 128),
    "gate": (76, 148),
    "sentry": (84, 152),
}


def build(name: str, size: tuple[int, int]) -> None:
    image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
    alpha = image.getchannel("A")
    bounds = alpha.point(lambda a: 255 if a >= 8 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"{name} has no visible pixels")
    image = image.crop(bounds)
    # Resize once at authoring time. Repeated 15:1 canvas shrinkage gave the
    # generated line art noisy edges, especially on the thin glowing pieces.
    margin = 2
    scale = min((size[0] - 2 * margin) / image.width,
                (size[1] - 2 * margin) / image.height)
    drawn = image.resize((round(image.width * scale), round(image.height * scale)),
                         Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(drawn, ((size[0] - drawn.width) // 2,
                                   size[1] - margin - drawn.height))
    canvas.save(DEST / f"{name}.png", optimize=True)


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    for name, size in SIZES.items():
        build(name, size)
