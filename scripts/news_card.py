#!/usr/bin/env python3
"""Draws a 1200x630 "news" card for a release, in the same style as assets/og.png.

Needs Pillow. Fonts live next to this file (scripts/fonts, Inter, SIL OFL).
CLI test:  python3 scripts/news_card.py out.png "HDRezka" 1.7.0 "Fixed search\nFaster catalog" [icon.png] [ru|en]
"""
import io, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
W, H = 1200, 630
RED, DARK, MUTED = (225, 29, 46), (20, 19, 22), (190, 188, 196)
LABELS = {"ru": "НОВАЯ ВЕРСИЯ", "en": "NEW RELEASE"}
DOMAIN = "rep.kerneldev.qzz.io"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, f"Inter-{name}.otf"), size)


def fit(draw, text, fnt, max_w):
    """Trim text with an ellipsis until it fits max_w."""
    if draw.textlength(text, font=fnt) <= max_w:
        return text
    while text and draw.textlength(text + "…", font=fnt) > max_w:
        text = text[:-1]
    return text.rstrip() + "…"


def wrap(draw, text, fnt, max_w, max_lines):
    """Word-wrap paragraphs; the last allowed line gets an ellipsis if text remains."""
    lines = []
    for para in [p.strip() for p in text.splitlines() if p.strip()]:
        cur = ""
        for word in para.split():
            trial = (cur + " " + word).strip()
            if draw.textlength(trial, font=fnt) <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = fit(draw, lines[-1] + " …", fnt, max_w)
    return [fit(draw, l, fnt, max_w) for l in lines]


def background():
    img = Image.new("RGB", (W, H), DARK)
    glow = ImageDraw.Draw(img)
    for r in range(520, 0, -8):
        k = (520 - r) / 520
        col = tuple(int(DARK[i] + (RED[i] - DARK[i]) * (k ** 2.2) * 0.55) for i in range(3))
        glow.ellipse([W - 80 - r, -120 - r, W - 80 + r, -120 + r], fill=col)
    return img


def rounded(img, size, radius):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def letter_icon(letter, size, radius):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=RED)
    d.text((size / 2, size / 2 + size * 0.02), letter, font=font("ExtraBold", int(size * 0.55)), fill="white", anchor="mm")
    return img


def make_card(path, app_name, version, notes="", icon_bytes=None, lang="ru", date_text=""):
    img = background()
    d = ImageDraw.Draw(img)

    # header: brand + label pill
    d.rounded_rectangle([72, 56, 72 + 64, 56 + 64], radius=18, fill=RED)
    d.text((72 + 32, 56 + 35), "K", font=font("ExtraBold", 42), fill="white", anchor="mm")
    d.text((154, 88), "Kernel's Source", font=font("Bold", 30), fill="white", anchor="lm")
    label = LABELS.get(lang, LABELS["en"])
    lf = font("Bold", 22)
    lw = d.textlength(label, font=lf)
    d.rounded_rectangle([W - 72 - lw - 44, 60, W - 72, 116], radius=28, outline=RED, width=2)
    d.text((W - 72 - lw / 2 - 22, 88), label, font=lf, fill=RED, anchor="mm")

    # app icon + name + version
    isz = 176
    icon = None
    if icon_bytes:
        try:
            icon = rounded(Image.open(io.BytesIO(icon_bytes)), isz, 42)
        except Exception:
            icon = None
    if icon is None:
        icon = letter_icon((app_name or "?")[0].upper(), isz, 42)
    img.paste(icon, (72, 170), icon)
    tx = 72 + isz + 36
    name_f = font("ExtraBold", 84)
    d.text((tx, 232), fit(d, app_name, name_f, W - tx - 72), font=name_f, fill="white", anchor="ls")
    vf = font("SemiBold", 40)
    vtxt = "v" + str(version).lstrip("vV")
    d.text((tx, 300), vtxt, font=vf, fill=RED, anchor="ls")

    # notes
    nf = font("Medium", 34)
    fallback = "Доступна новая версия приложения" if lang == "ru" else "A new version is available"
    lines = wrap(d, notes or fallback, nf, W - 144, 3)
    y = 392
    for line in lines:
        d.text((72, y), line, font=nf, fill=MUTED, anchor="ls")
        y += 50

    # footer: domain pill + date
    ff = font("SemiBold", 28)
    dw = d.textlength(DOMAIN, font=ff)
    d.rounded_rectangle([72, 530, 72 + dw + 56, 592], radius=31, outline=(70, 68, 78), width=2)
    d.text((72 + 28, 561), DOMAIN, font=ff, fill="white", anchor="lm")
    if date_text:
        d.text((W - 72, 561), date_text, font=font("Medium", 28), fill=MUTED, anchor="rm")

    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(path, optimize=True)
    return path


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    out, name, ver = sys.argv[1:4]
    notes = sys.argv[4].replace("\\n", "\n") if len(sys.argv) > 4 else ""
    icon = open(sys.argv[5], "rb").read() if len(sys.argv) > 5 and os.path.exists(sys.argv[5]) else None
    lang = sys.argv[6] if len(sys.argv) > 6 else "ru"
    make_card(out, name, ver, notes, icon, lang, "22 октября 2026" if lang == "ru" else "Oct 22, 2026")
    print("saved", out)
