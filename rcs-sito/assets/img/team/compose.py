import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, ImageFilter, ImageDraw, ImageEnhance
from rembg import remove, new_session

BASE = Path(__file__).parent
CANVAS_W, CANVAS_H = 1000, 1250  # 4:5 portrait, coerente per tutte le card del team
MAX_INPUT_DIM = 1600  # downscale prima della segmentazione: molto piu' veloce, risoluzione piu' che sufficiente

_session = new_session("u2net")


def load_upright(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    im = im.convert("RGB")
    if max(im.size) > MAX_INPUT_DIM:
        ratio = MAX_INPUT_DIM / max(im.size)
        im = im.resize((int(im.width * ratio), int(im.height * ratio)), Image.LANCZOS)
    return im


def cutout_subject(im: Image.Image) -> Image.Image:
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    out = remove(buf.getvalue(), session=_session)
    rgba = Image.open(io.BytesIO(out)).convert("RGBA")

    # ammorbidisce i bordi del cutout: erode leggero + feather, per evitare l'effetto "sticker"
    r, g, b, a = rgba.split()
    a = a.filter(ImageFilter.MinFilter(3))  # erode ~1px, rimuove l'alone chiaro residuo del bg originale
    a = a.filter(ImageFilter.GaussianBlur(1.6))
    rgba = Image.merge("RGBA", (r, g, b, a))
    return rgba


def bbox_with_margin(rgba: Image.Image, margin_ratio=0.06):
    bbox = rgba.getbbox()
    if not bbox:
        return (0, 0, rgba.width, rgba.height)
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    mx, my = int(w * margin_ratio), int(h * margin_ratio)
    return (
        max(0, x0 - mx),
        max(0, y0 - my),
        min(rgba.width, x1 + mx),
        min(rgba.height, y1 + my),
    )


def prepare_background(bg_path, crop_focus_x=0.5, blur=9, darken=0.93):
    bg = Image.open(bg_path).convert("RGB")
    bg = ImageOps.exif_transpose(bg)
    target_ratio = CANVAS_W / CANVAS_H
    w, h = bg.size
    cur_ratio = w / h
    if cur_ratio > target_ratio:
        new_w = int(h * target_ratio)
        x0 = int((w - new_w) * crop_focus_x)
        x0 = max(0, min(w - new_w, x0))
        bg = bg.crop((x0, 0, x0 + new_w, h))
    else:
        new_h = int(w / target_ratio)
        y0 = (h - new_h) // 2
        bg = bg.crop((0, y0, w, y0 + new_h))
    bg = bg.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(blur))
    bg = ImageEnhance.Brightness(bg).enhance(darken)
    bg = ImageEnhance.Color(bg).enhance(0.97)

    # correzione: se l'immagine ha zone troppo scure/vicine al nero, le solleva leggermente
    # cosi' non appaiono come "buchi neri" dietro al soggetto.
    arr = np.asarray(bg).astype(np.float32)
    floor = 22.0
    arr = floor + arr * ((255.0 - floor) / 255.0)
    bg = Image.fromarray(arr.astype("uint8"), "RGB")

    vignette = Image.new("L", (CANVAS_W, CANVAS_H), 0)
    d = ImageDraw.Draw(vignette)
    d.ellipse((-CANVAS_W * 0.35, -CANVAS_H * 0.3, CANVAS_W * 1.35, CANVAS_H * 1.35), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(140))
    dark_edge = Image.new("RGB", (CANVAS_W, CANVAS_H), (14, 13, 16))
    bg = Image.composite(bg, dark_edge, vignette)
    return bg.convert("RGBA")


def compose(subject_path, bg_path, out_path, scale=0.90, y_offset_ratio=0.015, crop_focus_x=0.5):
    im = load_upright(subject_path)
    cut = cutout_subject(im)
    bx0, by0, bx1, by1 = bbox_with_margin(cut)
    cropped = cut.crop((bx0, by0, bx1, by1))

    target_h = int(CANVAS_H * scale)
    ratio = target_h / cropped.height
    target_w = int(cropped.width * ratio)
    cropped = cropped.resize((target_w, target_h), Image.LANCZOS)

    canvas = prepare_background(bg_path, crop_focus_x=crop_focus_x)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    cx = CANVAS_W // 2
    foot_y = CANVAS_H - int(CANVAS_H * (1 - scale) * 0.35)
    sd.ellipse(
        (cx - target_w * 0.36, foot_y - 20, cx + target_w * 0.36, foot_y + 30),
        fill=(0, 0, 0, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas = Image.alpha_composite(canvas, shadow)

    paste_x = (CANVAS_W - target_w) // 2
    paste_y = CANVAS_H - target_h - int(CANVAS_H * y_offset_ratio)
    canvas.alpha_composite(cropped, (paste_x, paste_y))

    final = canvas.convert("RGB")
    final = ImageEnhance.Contrast(final).enhance(1.03)
    final = ImageEnhance.Color(final).enhance(1.04)
    final.save(out_path, "JPEG", quality=94)
    print(f"saved {out_path}")


if __name__ == "__main__":
    compose(
        BASE / "nemesio-rinaldi-original.jpg",
        BASE / "bg-luxury-office.jpg",
        BASE / "nemesio-rinaldi.jpg",
        crop_focus_x=0.35,
    )
    compose(
        BASE / "theophile-kamdoum-original.jpg",
        BASE / "bg-modern-office.jpg",
        BASE / "theophile-kamdoum.jpg",
        crop_focus_x=0.5,
    )
