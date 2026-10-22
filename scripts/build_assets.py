#!/usr/bin/env python3
"""Builds local font subsets (woff), icons and the Open Graph image. Needs Pillow + fontTools."""
import os, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/usr/share/fonts/opentype/inter"
WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x400, 0x460)) + \
           [0x401, 0x451, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2116, 0x2190, 0x2191, 0x2192, 0x2193, 0x00D7]

for w, name in WEIGHTS.items():
    opts = subset.Options()
    opts.flavor = "woff"
    opts.layout_features = ["kern", "liga", "calt", "tnum", "case"]
    opts.name_IDs = [1, 2]
    opts.notdef_outline = True
    f = TTFont(f"{SRC}/Inter-{name}.otf")
    s = subset.Subsetter(opts)
    s.populate(unicodes=UNICODES)
    s.subset(f)
    out = f"{ROOT}/assets/fonts/inter-{w}.woff"
    f.flavor = "woff"
    f.save(out)
    print(out, os.path.getsize(out) // 1024, "KB")

RED, DARK = (225, 29, 46), (20, 19, 22)

def rounded_icon(size, radius_ratio=0.22, pad_bg=None):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=RED)
    font = ImageFont.truetype(f"{SRC}/Inter-ExtraBold.otf", int(size * 0.62))
    d.text((size / 2, size / 2 + size * 0.02), "K", font=font, fill="white", anchor="mm")
    return img

for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    img = rounded_icon(size, 0.0 if name.startswith("apple") else 0.22)
    if name.startswith("apple"):  # iOS rounds the corners itself, so keep the square flat
        flat = Image.new("RGB", (size, size), RED)
        d = ImageDraw.Draw(flat)
        d.text((size / 2, size / 2 + size * 0.02), "K", font=ImageFont.truetype(f"{SRC}/Inter-ExtraBold.otf", int(size * 0.62)), fill="white", anchor="mm")
        img = flat
    img.save(f"{ROOT}/assets/icons/{name}")

# OG image 1200x630
W, H = 1200, 630
og = Image.new("RGB", (W, H), DARK)
d = ImageDraw.Draw(og)
glow = Image.new("RGB", (W, H), DARK)
gd = ImageDraw.Draw(glow)
for r in range(520, 0, -8):
    k = (520 - r) / 520
    col = tuple(int(DARK[i] + (RED[i] - DARK[i]) * (k ** 2.2) * 0.55) for i in range(3))
    gd.ellipse([W - 80 - r, -120 - r, W - 80 + r, -120 + r], fill=col)
og.paste(glow)
d = ImageDraw.Draw(og)
d.rounded_rectangle([72, 72, 72 + 96, 72 + 96], radius=26, fill=RED)
d.text((72 + 48, 72 + 52), "K", font=ImageFont.truetype(f"{SRC}/Inter-ExtraBold.otf", 62), fill="white", anchor="mm")
d.text((190, 120), "Kernel's Source", font=ImageFont.truetype(f"{SRC}/Inter-Bold.otf", 40), fill="white", anchor="lm")
h = ImageFont.truetype(f"{SRC}/Inter-ExtraBold.otf", 104)
d.text((72, 270), "Sideload more,", font=h, fill="white", anchor="ls")
d.text((72, 390), "search less.", font=h, fill=RED, anchor="ls")
d.text((72, 470), "AltStore / SideStore source — HDRezka, AyuGram", font=ImageFont.truetype(f"{SRC}/Inter-Medium.otf", 34), fill=(190, 188, 196), anchor="ls")
d.rounded_rectangle([72, 520, 72 + 470, 520 + 62], radius=31, outline=(70, 68, 78), width=2)
d.text((72 + 28, 551), "rep.kerneldev.qzz.io", font=ImageFont.truetype(f"{SRC}/Inter-SemiBold.otf", 28), fill="white", anchor="lm")
og.save(f"{ROOT}/assets/og.png", optimize=True)
print("og.png", os.path.getsize(f"{ROOT}/assets/og.png") // 1024, "KB")
