#!/usr/bin/env python3
"""Generate mezamashi app icon assets from an original vector redraw.

Everything here is drawn from primitives, so each target size is rendered
crisply from the same source rather than resampled from one bitmap.

    pip install pillow cairosvg
    python3 scripts/generate-icons.py   # writes straight into assets/
"""
import io
import math
import os

import cairosvg
from PIL import Image

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets"
)

# --- palette -----------------------------------------------------------
# Tracks src/theme.ts so the icon and the app read as one piece: cream/#FAF3E6
# ground, sage/#8FA98B accent, ink/#4A4038 for the hands.
CREAM_HI = "#FEF9F0"
CREAM_LO = "#F5EBD8"
SAGE_HI = "#C9DCC1"
SAGE_MID = "#A8C09E"
SAGE_LO = "#8FA98B"
SAGE_SOFT = "#C2D6B9"
FACE_HI = "#FFFCF5"
FACE_LO = "#F6E7CB"
TICK = "#CBDEC3"
HAND = "#4A4038"
ACCENT = "#F0BE7C"

DEFS = f"""
  <radialGradient id="bg" cx="42%" cy="34%" r="78%">
    <stop offset="0%" stop-color="{CREAM_HI}"/>
    <stop offset="100%" stop-color="{CREAM_LO}"/>
  </radialGradient>
  <linearGradient id="sage" x1="18%" y1="4%" x2="82%" y2="100%">
    <stop offset="0%" stop-color="{SAGE_HI}"/>
    <stop offset="55%" stop-color="{SAGE_MID}"/>
    <stop offset="100%" stop-color="{SAGE_LO}"/>
  </linearGradient>
  <linearGradient id="sageFlat" x1="0%" y1="0%" x2="70%" y2="100%">
    <stop offset="0%" stop-color="{SAGE_HI}"/>
    <stop offset="100%" stop-color="{SAGE_MID}"/>
  </linearGradient>
  <radialGradient id="face" cx="40%" cy="32%" r="76%">
    <stop offset="0%" stop-color="{FACE_HI}"/>
    <stop offset="100%" stop-color="{FACE_LO}"/>
  </radialGradient>
  <radialGradient id="gloss" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"/>
    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="shade" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#6E8B6A" stop-opacity="0.28"/>
    <stop offset="100%" stop-color="#6E8B6A" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="drop" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#9A9070" stop-opacity="0.34"/>
    <stop offset="60%" stop-color="#9A9070" stop-opacity="0.12"/>
    <stop offset="100%" stop-color="#9A9070" stop-opacity="0"/>
  </radialGradient>
"""

CX, CY, R = 500.0, 566.0, 246.0  # clock body
FACE_R = 202.0

LEAF = "M 0 0 C 24 -32 68 -36 94 -10 C 68 24 24 28 0 0 Z"


def ring(cx: float, cy: float, r_out: float, r_in: float) -> str:
    """Donut path. cairosvg has no <mask>, so the hole is an even-odd subpath."""

    def circle(r: float) -> str:
        return (
            f"M {cx - r} {cy} a {r} {r} 0 1 0 {2 * r} 0 "
            f"a {r} {r} 0 1 0 {-2 * r} 0 Z"
        )

    return f'<path fill-rule="evenodd" d="{circle(r_out)} {circle(r_in)}"'


def ticks() -> str:
    out = []
    for i in range(12):
        a = math.radians(i * 30 - 90)
        r1, r2 = FACE_R - 46, FACE_R - 22
        w = 13 if i % 3 == 0 else 10
        x1, y1 = CX + r1 * math.cos(a), CY + r1 * math.sin(a)
        x2, y2 = CX + r2 * math.cos(a), CY + r2 * math.sin(a)
        out.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{TICK}" stroke-width="{w}" stroke-linecap="round"/>'
        )
    return "\n".join(out)


def hand(angle_deg: float, length: float, width: float, colour: str = HAND) -> str:
    a = math.radians(angle_deg - 90)
    x = CX + length * math.cos(a)
    y = CY + length * math.sin(a)
    return (
        f'<line x1="{CX}" y1="{CY}" x2="{x:.1f}" y2="{y:.1f}" stroke="{colour}" '
        f'stroke-width="{width}" stroke-linecap="round"/>'
    )


def clock(shadow: bool) -> str:
    ground = (
        f'<ellipse cx="{CX}" cy="{CY + R + 32}" rx="248" ry="42" fill="url(#drop)"/>'
        if shadow
        else ""
    )
    return f"""
  {ground}
  <!-- handle -->
  <path d="M 344 356 C 386 232 614 232 656 356" fill="none" stroke="url(#sageFlat)"
        stroke-width="42" stroke-linecap="round"/>

  <!-- bell stems -->
  <circle cx="292" cy="330" r="46" fill="url(#sageFlat)"/>
  <circle cx="708" cy="330" r="46" fill="url(#sageFlat)"/>

  <!-- bells -->
  <ellipse cx="318" cy="412" rx="126" ry="106" transform="rotate(-22 318 412)" fill="url(#sage)"/>
  <ellipse cx="682" cy="412" rx="126" ry="106" transform="rotate(22 682 412)" fill="url(#sage)"/>
  <ellipse cx="286" cy="376" rx="52" ry="34" transform="rotate(-26 286 376)" fill="url(#gloss)"/>
  <ellipse cx="714" cy="376" rx="52" ry="34" transform="rotate(26 714 376)" fill="url(#gloss)"/>

  <!-- feet -->
  <line x1="410" y1="{CY + 190:.0f}" x2="372" y2="{CY + 306:.0f}" stroke="url(#sage)"
        stroke-width="52" stroke-linecap="round"/>
  <line x1="590" y1="{CY + 190:.0f}" x2="628" y2="{CY + 306:.0f}" stroke="url(#sage)"
        stroke-width="52" stroke-linecap="round"/>

  <!-- body -->
  <circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#sage)"/>
  <ellipse cx="{CX - 96}" cy="{CY - 128}" rx="120" ry="86"
           transform="rotate(-32 {CX - 96} {CY - 128})" fill="url(#gloss)"/>
  <circle cx="{CX + 40}" cy="{CY + 66}" r="238" fill="url(#shade)"/>

  <!-- dial -->
  <circle cx="{CX}" cy="{CY}" r="{FACE_R}" fill="url(#face)"/>
  {ticks()}
  {hand(2, 132, 20)}
  {hand(122, 176, 19)}
  <circle cx="{CX}" cy="{CY}" r="24" fill="{HAND}"/>
"""


# Flat silhouette for the Android monochrome layer: Android keeps only the
# alpha channel and tints it, so the dial has to be an actual hole.
MONO = f"""
  <g fill="#000" stroke="#000" stroke-linecap="round">
    <path d="M 360 372 C 398 250 602 250 640 372" fill="none" stroke-width="40"/>
    <ellipse cx="332" cy="398" rx="96" ry="84" transform="rotate(-20 332 398)"/>
    <ellipse cx="668" cy="398" rx="96" ry="84" transform="rotate(20 668 398)"/>
    <line x1="416" y1="{CY + 196:.0f}" x2="384" y2="{CY + 300:.0f}" stroke-width="50"/>
    <line x1="584" y1="{CY + 196:.0f}" x2="616" y2="{CY + 300:.0f}" stroke-width="50"/>
    {ring(CX, CY, R, R - 66)} fill="#000" stroke="none"/>
    {hand(2, 118, 44, "#000")}
    {hand(122, 152, 40, "#000")}
  </g>
"""

SPARKS = "\n".join(
    f'<line x1="{760 + 88 * math.cos(math.radians(t)):.1f}" '
    f'y1="{300 - 88 * math.sin(math.radians(t)):.1f}" '
    f'x2="{760 + 142 * math.cos(math.radians(t)):.1f}" '
    f'y2="{300 - 142 * math.sin(math.radians(t)):.1f}" '
    f'stroke="{ACCENT}" stroke-width="22" stroke-linecap="round"/>'
    for t in (73, 47, 21)
)

SPRIG = f"""
  <g stroke-linecap="round">
    <path d="M 746 714 C 806 778 846 850 864 938" fill="none" stroke="{SAGE_MID}" stroke-width="13"/>
    <g fill="{SAGE_SOFT}">
      <g transform="translate(756,724) rotate(-58) scale(0.70)"><path d="{LEAF}"/></g>
      <g transform="translate(764,740) rotate(152) scale(0.64)"><path d="{LEAF}"/></g>
      <g transform="translate(796,784) rotate(-42) scale(0.80)"><path d="{LEAF}"/></g>
      <g transform="translate(806,802) rotate(166) scale(0.72)"><path d="{LEAF}"/></g>
      <g transform="translate(836,860) rotate(-28) scale(0.76)"><path d="{LEAF}"/></g>
      <g transform="translate(844,878) rotate(178) scale(0.66)"><path d="{LEAF}"/></g>
      <g transform="translate(860,924) rotate(-74) scale(0.55)"><path d="{LEAF}"/></g>
    </g>
  </g>
"""

# Lift and enlarge the clock slightly so the whole lockup reads centred.
LOCKUP = "translate(512,478) scale(1.04) translate(-512,-512)"


def wrap(inner: str, background: str = "") -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        f'viewBox="0 0 1024 1024"><defs>{DEFS}</defs>{background}'
        f'<g transform="{LOCKUP}">{inner}</g></svg>'
    )


def rasterise(markup: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(
        bytestring=markup.encode(), output_width=size, output_height=size
    )
    return Image.open(io.BytesIO(png)).convert("RGBA")


def fit(inner: str, size: int, coverage: float) -> Image.Image:
    """Centre `inner` and scale it so its longest side covers `coverage` of the canvas.

    Used for the Android adaptive layers, where artwork has to land inside the
    guaranteed-visible safe zone rather than wherever the source happened to sit.
    """
    probe = rasterise(wrap(inner), 512)
    box = probe.getbbox()
    if box is None:
        raise ValueError("nothing was drawn")
    left, top, right, bottom = (v * 2 for v in box)  # back to 1024 units
    w, h = right - left, bottom - top
    scale = coverage * 1024 / max(w, h)
    cx, cy = (left + right) / 2, (top + bottom) / 2
    shift = f"translate({512 - cx * scale:.2f},{512 - cy * scale:.2f}) scale({scale:.4f})"
    return rasterise(wrap(f'<g transform="{shift}">{inner}</g>'), size)


def main() -> None:
    bg = '<rect width="1024" height="1024" fill="url(#bg)"/>'
    full = clock(shadow=True) + SPARKS + SPRIG

    # iOS / main icon: full bleed, the platform applies its own mask. Saved
    # without an alpha channel — App Store review rejects transparent icons.
    rasterise(wrap(full, bg), 1024).convert("RGB").save(f"{OUT}/icon.png")

    # Android adaptive layers. The foreground drops the corner decoration so
    # nothing important falls outside the 66% safe zone.
    rasterise(wrap("", bg), 512).convert("RGB").save(
        f"{OUT}/android-icon-background.png"
    )
    fit(clock(shadow=False), 512, 0.55).save(f"{OUT}/android-icon-foreground.png")
    fit(MONO, 432, 0.53).save(f"{OUT}/android-icon-monochrome.png")

    # Splash: transparent so it sits on the splash background colour.
    rasterise(wrap(clock(shadow=False) + SPARKS + SPRIG), 1024).save(
        f"{OUT}/splash-icon.png"
    )

    # Favicon: fine decoration disappears at 48px, so render the clock alone.
    fit(clock(shadow=False), 48, 0.92).save(f"{OUT}/favicon.png")


if __name__ == "__main__":
    main()
