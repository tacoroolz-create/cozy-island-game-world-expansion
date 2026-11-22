"""Convert a generated 1920x1920 sprite image to a true 16x16/16x32 game sprite (pure PIL)."""
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
w, h = int(sys.argv[3]), int(sys.argv[4])

img = Image.open(src).convert('RGB')
# bounding box of non-near-white pixels, via point ops (no numpy)
gray = img.convert('L')
mask = gray.point(lambda p: 255 if p < 240 else 0)
bbox = mask.getbbox()
if not bbox:
    print('ERROR: no subject found')
    sys.exit(1)
crop = img.crop(bbox)
s = crop.resize((w, h), Image.NEAREST)
q = s.convert('P', palette=Image.ADAPTIVE, colors=16).convert('RGBA')
# white -> transparent
px = q.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if r > 235 and g > 235 and b > 235:
            px[x, y] = (r, g, b, 0)
q.save(out)
print('saved', out, q.size)
