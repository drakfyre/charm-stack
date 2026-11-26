# Draws the app icon (pink heart charm on a purple background) at 180 and 512 px.
from PIL import Image, ImageDraw, ImageFilter
import math, sys

def icon(size):
    s = size * 4  # supersample
    img = Image.new('RGB', (s, s))
    d = ImageDraw.Draw(img)
    for y in range(s):
        t = y / s
        d.line([(0, y), (s, y)], fill=(int(70 - 40 * t), int(22 - 12 * t), int(100 - 55 * t)))
    m = s * 0.14
    d.rounded_rectangle([m, m, s - m, s - m], radius=s * 0.16, fill=(200, 60, 125))
    m2 = m + s * 0.025
    d.rounded_rectangle([m2, m2, s - m2, s - m2 - s * 0.03], radius=s * 0.14, fill=(255, 95, 162))
    pts = []
    for i in range(400):
        a = i / 400 * 2 * math.pi
        x = 16 * math.sin(a) ** 3
        y = 13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a)
        pts.append((s / 2 + x * s * 0.0145, s / 2 - y * s * 0.0145 - s * 0.01))
    d.polygon(pts, fill=(255, 240, 248))
    d.ellipse([s * 0.24, s * 0.22, s * 0.40, s * 0.32], fill=(255, 160, 200))
    return img.resize((size, size), Image.LANCZOS)

out = sys.argv[1] if len(sys.argv) > 1 else '.'
for n in (180, 512):
    icon(n).save(f'{out}/icon-{n}.png', optimize=True)
