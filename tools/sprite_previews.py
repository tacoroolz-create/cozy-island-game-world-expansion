"""Regenerate 8x preview images from the CONVERTED (quantized) game sprites.

Batch-2 review note: earlier previews were made from the pre-quantization
sources (130-220 colors), so they looked blobby. Always preview the shipped
asset from assets/tiles/, never the source render.
"""
from PIL import Image
import os

RESAMPLE = getattr(getattr(Image, 'Resampling', Image), 'NEAREST')
SRC = 'assets/tiles'
OUT = '/tmp/sprite_previews_converted'
os.makedirs(OUT, exist_ok=True)
names = ['lamp_post', 'facade_cottage', 'facade_shop', 'facade_tall_house',
         'wood_fence', 'hedge', 'cliff_face', 'scree', 'signpost']
sheet_w = sum(16 * 8 + 8 for _ in names)
sheet_h = 32 * 8 + 8
sheet = Image.new('RGBA', (sheet_w, sheet_h), (90, 90, 110, 255))
x = 4
for n in names:
    img = Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')
    up = img.resize((img.width * 8, img.height * 8), RESAMPLE)
    sheet.paste(up, (x, 4), up)
    up.save(os.path.join(OUT, n + '_8x.png'))
    x += img.width * 8 + 8
sheet.save(os.path.join(OUT, '_sheet.png'))
print('previews written to', OUT)
