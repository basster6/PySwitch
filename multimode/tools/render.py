#!/usr/bin/env python3
##############################################################################################################################################
#
# Renders the device screen and switch LEDs of profiles in given states to PNG files, using the real engine
# (simulation), the screen layout of the device (devices.screen_layout) and the PCF fonts of the firmware.
# Text colors and wrapping follow PySwitch's DisplayLabel. Requires Pillow.
#
#   python3 multimode/tools/render.py [--device mini6] [--out DIR] [--scale 2]
#
# Writes one PNG per scenario plus sheet.png with all of them to multimode/screens (not in build/, which mmtool clears).
#
##############################################################################################################################################

import argparse
import os
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont, PcfFontFile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim                                         # noqa: E402
from multimode.devices import screen_layout, DEVICES, DISPLAY_SIZE   # noqa: E402

FONTS_DIR = os.path.join(sim.REPO, "content", "fonts")
LABEL_COLOR = (50, 50, 50)          # pyswitch.colors.DEFAULT_LABEL_COLOR

# Pillow's PCF loader looks up the encoding table by character code instead of (code - first column), which shifts
# all characters of fonts starting at column 32 (H20, A12) by 32. Corrected version for single-row (8 bit) fonts:
def _load_encoding(self):
    fp, format, i16, i32 = self._getformat(PcfFontFile.PCF_BDF_ENCODINGS)
    first_col, last_col = i16(fp.read(2)), i16(fp.read(2))
    first_row, last_row = i16(fp.read(2)), i16(fp.read(2))
    i16(fp.read(2))  # default
    cols = last_col - first_col + 1
    offsets = [i16(fp.read(2)) for _ in range(cols * (last_row - first_row + 1))]
    encoding = [None] * 256
    for code in range(first_col, min(256, last_col + 1)):
        index = (code - first_col) if first_row == last_row else (code - first_col) + (0 - first_row) * cols
        if 0 <= index < len(offsets) and offsets[index] != 0xFFFF:
            encoding[code] = offsets[index]
    return encoding

PcfFontFile.PcfFontFile._load_encoding = _load_encoding

_fonts = {}
_font_dir = tempfile.mkdtemp(prefix = "mm-fonts-")


# Loads a PCF font as PIL bitmap font; returns (font, line height)
def font(path):
    if path in _fonts:
        return _fonts[path]
    name = os.path.basename(path)
    with open(os.path.join(FONTS_DIR, name), "rb") as f:
        pcf = PcfFontFile.PcfFontFile(f)
        pcf.save(os.path.join(_font_dir, name))
        height = max((g[1][3] - g[1][1]) for g in pcf.glyph if g)
    f = ImageFont.load(os.path.join(_font_dir, name[:-4] + ".pil"))
    _fonts[path] = (f, height)
    return _fonts[path]


# Same rule as DisplayLabel.__determine_text_color
def text_color(back):
    if not back:
        return (255, 255, 255)
    lum = back[0] * 0.2126 + back[1] * 0.7151 + back[2] * 0.0721
    return (255, 255, 255) if lum < 140 else (0, 0, 0)


def wrap(text, fnt, max_width):
    if not max_width:
        return text.split("\n")
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split(" "):
            cand = word if not line else line + " " + word
            if fnt.getlength(cand) <= max_width or not line:
                line = cand
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def draw_label(d, bounds, text, back, stroke = 0, max_width = None, line_spacing = 1):
    x, y, w, h, path = bounds
    if back:
        d.rectangle([x + stroke, y + stroke, x + w - stroke - 1, y + h - stroke - 1], fill = tuple(back))
    if not text:
        return
    fnt, lh = font(path)
    lines = wrap(text, fnt, max_width)
    step = int(lh * line_spacing)
    total = step * (len(lines) - 1) + lh
    top = y + (h - total) // 2
    color = text_color(back)
    for i, line in enumerate(lines):
        lw = fnt.getlength(line)
        d.text((x + (w - lw) / 2, top + i * step), line, font = fnt, fill = color)


# Renders the screen of a simulation (240x240) plus the LEDs of the switches above and below it
def render(s, scale = 2):
    layout = screen_layout(s.engine.device)
    screen = Image.new("RGB", (DISPLAY_SIZE, DISPLAY_SIZE), (0, 0, 0))
    d = ImageDraw.Draw(screen)

    # Same strokes and default colors as setup.build_display()
    for key, rects in layout["keys"].items():
        draw_label(d, rects["label"], s.labels[key].text, s.labels[key].back_color or LABEL_COLOR, stroke = 1)
        draw_label(d, rects["hint"], s.hints[key].text, s.hints[key].back_color or LABEL_COLOR, stroke = 1)

    draw_label(d, layout["status"], s.status.text, s.status.back_color or (0, 0, 0))
    draw_label(d, layout["power"], s.power.text, s.power.back_color or (0, 0, 0))
    for i, rects in enumerate(layout["tiles"]):
        t = s.tiles[i]
        draw_label(d, rects["caption"], t["caption"].text, t["caption"].back_color or LABEL_COLOR, stroke = 1)
        draw_label(d, rects["value"], t["value"].text, t["value"].back_color or LABEL_COLOR, stroke = 1)
    draw_label(d, layout["message"], s.message.text, s.message.back_color or (0, 0, 0), stroke = 1)

    screen = screen.resize((DISPLAY_SIZE * scale, DISPLAY_SIZE * scale), Image.NEAREST)

    # LEDs: 3 per switch, brightness scaled
    rows = DEVICES[s.engine.device]["rows"]
    pad = 18 * scale
    img = Image.new("RGB", (screen.width, screen.height + 2 * pad), (70, 74, 80))
    img.paste(screen, (0, pad))
    d = ImageDraw.Draw(img)
    for r, row in enumerate(rows):
        cw = img.width / len(row)
        y = pad / 2 if r == 0 else img.height - pad / 2
        for i, key in enumerate(row):
            colors, brightness = s.leds(key)
            for j in range(len(colors)):
                c = colors[j]
                b = min(1.0, (brightness[j] if j < len(brightness) else 0) * 2.5)
                c = tuple(int(v * b + 30 * (1 - b)) for v in c)
                cx = cw * i + cw / 2 + (j - 1) * 9 * scale
                rad = 3 * scale
                d.ellipse([cx - rad, y - rad, cx + rad, y + rad], fill = c)
    return img


def scenarios(device):
    def qc():
        return sim.Sim("qc", device = device)

    def ana():
        return sim.Sim("anagram", device = device)

    def battery(s, percent = 98):
        s.engine.ns.update({"pw": "BAT", "pws": 1, "pwp": percent})
        s.engine.refresh()
        return s

    out = []
    s = qc(); out.append(("qc-boot", "QC: after boot (Chain)", battery(s)))
    s = qc(); s.long("1"); out.append(("qc-tuner", "QC: tuner on (hold 1)", s))
    s = qc(); s.short("3"); out.append(("qc-pending", "QC: 3 pressed, waiting for double click", s))
    s = qc(); s.short("3"); s.settle(); out.append(("qc-mode", "QC: mode cycled to SCN", s))
    s = qc(); s.long("A"); out.append(("qc-scene", "QC: scene -1 (hold A), message", s))
    s = qc(); s.long("A"); s.advance(2000); out.append(("qc-scene-later", "QC: 2 s later", s))
    s = qc(); s.long("C"); out.append(("qc-gig", "QC: Gig View (hold C)", s))
    s = qc(); s.long("C"); s.double("3"); out.append(("qc-gig-flip", "QC: Gig View flipped (double 3)", s))
    s = qc(); s.long("3"); out.append(("qc-page1", "QC: footswitch page I (hold 3)", s))
    s = ana(); out.append(("ana-boot", "Anagram: after boot", battery(s, 37)))
    s = ana(); s.short("1"); s.short("B"); out.append(("ana-play", "Anagram: foot A on, scene +", s))
    s = ana(); s.long("C"); s.short("1"); out.append(("ana-looper", "Anagram: looper, recording", s))
    return out


def sheet(images, cols = 4):
    w, h = images[0][1].size
    cap = 26
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGB", (cols * (w + 16) + 16, rows * (h + cap + 16) + 16), (24, 26, 30))
    d = ImageDraw.Draw(out)
    for i, (title, img) in enumerate(images):
        x = 16 + (i % cols) * (w + 16)
        y = 16 + (i // cols) * (h + cap + 16)
        d.text((x, y + 4), title, fill = (220, 224, 230))
        out.paste(img, (x, y + cap))
    return out


# Writes the advance widths (pixels) of the printable ASCII characters of the firmware fonts, used by the
# validation (sim.py) and the editor preview to detect texts which do not fit
def write_metrics(path):
    import json
    from multimode.devices import FONT_SMALL, FONT_LABEL, FONT_LARGE
    metrics = {}
    for f in (FONT_SMALL, FONT_LABEL, FONT_LARGE):
        fnt, _ = font(f)
        metrics[f] = {chr(c): int(fnt.getlength(chr(c))) for c in range(32, 127)}
    with open(path, "w") as out:
        json.dump(metrics, out, separators = (",", ":"))


def main():
    p = argparse.ArgumentParser(description = "Render device screens of the profiles")
    p.add_argument("--device", default = "mini6", choices = list(DEVICES))
    p.add_argument("--out", default = os.path.join(sim.REPO, "multimode", "screens"))
    p.add_argument("--scale", type = int, default = 2)
    p.add_argument("--metrics", action = "store_true", help = "Write tools/font_metrics.json and exit")
    args = p.parse_args()

    if args.metrics:
        write_metrics(os.path.join(os.path.dirname(os.path.abspath(__file__)), "font_metrics.json"))
        return

    os.makedirs(args.out, exist_ok = True)
    images = []
    for name, title, s in scenarios(args.device):
        img = render(s, args.scale)
        img.save(os.path.join(args.out, name + ".png"))
        images.append((title, img))
    sheet(images).save(os.path.join(args.out, "sheet.png"))
    print(os.path.join(args.out, "sheet.png"))


if __name__ == "__main__":
    main()
