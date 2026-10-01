"""Repair skyline alpha masks; keep originals for repeatable asset preparation."""
from pathlib import Path
import shutil
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / 'raw' / 'background_before_cleanup'

def main():
    for layer in ('far', 'mid'):
        canonical = ROOT / 'assets/bg/zones/dawn' / f'{layer}.png'
        paths = [ROOT / 'assets/bg' / f'{layer}.png']
        paths += sorted((ROOT / 'assets/bg/zones').glob(f'*/{layer}.png'))
        for path in paths:
            backup = BACKUP / path.relative_to(ROOT / 'assets/bg')
            if not backup.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, backup)
        source = np.array(Image.open(BACKUP / canonical.relative_to(ROOT / 'assets/bg')).convert('RGBA'))
        # Undo the old row fade before tracing the silhouette, otherwise a
        # fixed threshold chops every tall building at the same height.
        a = source[:, :, 3].astype(float)
        row_max = np.maximum(1, a.max(axis=1, keepdims=True))
        mask = ndimage.median_filter(a / row_max, size=3) > .58
        mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
        # Remove detached flecks, then trim the contaminated white/cyan matte.
        labels, count = ndimage.label(mask)
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        mask = sizes[labels] > 90
        mask = ndimage.minimum_filter(mask, size=5, mode='nearest')
        alpha = (ndimage.gaussian_filter(mask.astype(float), .65) * 255).astype('uint8')
        for path in paths:
            original = BACKUP / path.relative_to(ROOT / 'assets/bg')
            pixels = np.array(Image.open(original).convert('RGBA'))
            if pixels.shape[:2] != alpha.shape:
                raise ValueError(f'Unexpected layer size: {path}')
            pixels[:, :, 3] = alpha
            pixels[alpha == 0, :3] = 0
            # The previous 1/8-width crossfade doubled entire trees/buildings.
            # Remove those strips, leaving only a narrow join at tile ends.
            trim = pixels.shape[1] // 8
            pixels = pixels[:, trim:-trim].copy()
            n = 10
            ramp = np.linspace(0, 1, n)[None, :, None]
            pixels[:, :n] = (pixels[:, :n] * ramp + pixels[:, -n:] * (1 - ramp)).astype('uint8')
            Image.fromarray(pixels[:, :-n]).save(path)

if __name__ == '__main__':
    main()
