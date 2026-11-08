# Regenerates the hand and armpit charts in src/components/treatment/charts/.
# Needs Pillow and potrace (brew install potrace).
# Usage: python3 scripts/generate-body-charts.py src/components/treatment/charts "$(mktemp -d)"
# Generates hands_back.svg, hands_palm.svg and axillae.svg: shapes are drawn as
# bitmaps at 3x, the outline is silhouette minus an eroded copy, details are
# drawn on top, and potrace turns it into smooth filled paths (same style as the
# traced face).
import math, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
K = 3                    # bitmap scale (800 -> 2400)
N = 800 * K
OUT = sys.argv[1]
TMP = sys.argv[2]
LINE = 10                # outline width in 800-space
DET = 5.5                # detail line width

def P(x, y): return (x * K, y * K)

def bez(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        pts.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return pts

def stroke(d, pts, w):
    pts = [P(*p) for p in pts]
    d.line(pts, fill=0, width=int(w * K), joint="curve")
    r = w * K / 2
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=0)

def dashed(d, pts, w, dash=14, gap=12):
    # walk along the polyline and draw dashes
    acc, on, seg = 0, True, [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        pos = 0
        while pos < L:
            step = min(L - pos, (dash if on else gap) - acc)
            t = (pos + step) / L
            q = (a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)
            if on: seg.append(q)
            acc += step; pos += step
            if acc >= (dash if on else gap):
                if on and len(seg) > 1: stroke(d, seg, w)
                on = not on; acc = 0; seg = [q]
    if on and len(seg) > 1: stroke(d, seg, w)

def capsule(d, a, b, ra, rb):
    ang = math.atan2(b[1]-a[1], b[0]-a[0]) + math.pi/2
    ca, sa = math.cos(ang), math.sin(ang)
    poly = [(a[0]+ca*ra, a[1]+sa*ra), (b[0]+ca*rb, b[1]+sa*rb), (b[0]-ca*rb, b[1]-sa*rb), (a[0]-ca*ra, a[1]-sa*ra)]
    d.polygon([P(*p) for p in poly], fill=255)
    for c, r in ((a, ra), (b, rb)):
        d.ellipse([P(c[0]-r, c[1]-r), P(c[0]+r, c[1]+r)], fill=255)

def lerp(a, b, t): return (a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)

# ── Right hand, thumb on the left, fingers up (local 800-space coordinates) ──
FINGERS = [  # base, tip, base half-width, tip half-width
    ((150, 352), (139, 152), 23, 18.5),   # index
    ((200, 340), (203, 118), 24, 19.5),   # middle
    ((250, 350), (263, 142), 22.5, 18),   # ring
    ((293, 374), (322, 220), 19, 15.5),   # little
]
THUMB = [((132, 610), (74, 498), 32, 27), ((74, 498), (42, 380), 27, 20.5)]
PALM = [(121, 760), (113, 600), (110, 520), (118, 420), (138, 360), (175, 334), (225, 334), (270, 350), (305, 378), (316, 420), (310, 500), (292, 600), (274, 760)]
# thumb web: smooth concave edge from the thumb up to the index finger base
WEB = bez((70, 470), (92, 470), (110, 440), (122, 400), 24) + [(150, 420), (150, 600), (110, 600)]

def silhouette(d, tf):
    d.polygon([P(*tf(p)) for p in PALM], fill=255)
    d.polygon([P(*tf(p)) for p in WEB], fill=255)
    for a, b, ra, rb in FINGERS: capsule(d, tf(a), tf(b), ra, rb)
    for a, b, ra, rb in THUMB: capsule(d, tf(a), tf(b), ra, rb)

def cross(d, tf, a, b, t, frac=0.62, w=DET, curve=0.0):
    # short crease across a finger at fraction t from base a to tip b
    c = lerp(a, b, t)
    ang = math.atan2(b[1]-a[1], b[0]-a[0]) + math.pi/2
    half = frac * (FW(a, b, t))
    p0 = (c[0] + math.cos(ang)*half, c[1] + math.sin(ang)*half)
    p1 = (c[0] - math.cos(ang)*half, c[1] - math.sin(ang)*half)
    dx, dy = (b[0]-a[0]), (b[1]-a[1]); L = math.hypot(dx, dy); ux, uy = dx/L, dy/L
    m = (c[0] + ux*curve, c[1] + uy*curve)
    stroke(d, [tf(q) for q in bez(p0, lerp(p0, m, 0.6), lerp(p1, m, 0.6), p1, 16)], w)

_FW = {}
def FW(a, b, t):
    ra, rb = _FW[(a, b)]
    return ra + (rb - ra) * t

for a, b, ra, rb in FINGERS + THUMB: _FW[(a, b)] = (ra, rb)

def details_back(d, tf):
    # nails, knuckle (DIP/PIP) wrinkles, MCP knuckles and the five metacarpals
    for a, b, ra, rb in FINGERS:
        n0, n1 = lerp(a, b, 0.80), lerp(a, b, 0.97)
        w = rb * 0.62
        ang = math.atan2(b[1]-a[1], b[0]-a[0]) + math.pi/2
        ca, sa = math.cos(ang), math.sin(ang)
        # nail: U shape open towards the tip
        q0 = (n1[0] + ca*w, n1[1] + sa*w); q1 = (n0[0] + ca*w, n0[1] + sa*w)
        q2 = (n0[0] - ca*w, n0[1] - sa*w); q3 = (n1[0] - ca*w, n1[1] - sa*w)
        stroke(d, [tf(p) for p in bez(q0, q1, q2, q3, 24)], DET)
        cross(d, tf, a, b, 0.66, 0.45, DET, -3)
        cross(d, tf, a, b, 0.40, 0.55, DET, -4)
        cross(d, tf, a, b, 0.43, 0.40, DET, 4)
    ta, tb = THUMB[1][0], THUMB[1][1]
    _FW[(ta, tb)] = (THUMB[1][2], THUMB[1][3])
    n0, n1 = lerp(ta, tb, 0.70), lerp(ta, tb, 0.97)
    ang = math.atan2(tb[1]-ta[1], tb[0]-ta[0]) + math.pi/2; ca, sa = math.cos(ang), math.sin(ang); w = 13
    stroke(d, [tf(p) for p in bez((n1[0]+ca*w, n1[1]+sa*w), (n0[0]+ca*w, n0[1]+sa*w), (n0[0]-ca*w, n0[1]-sa*w), (n1[0]-ca*w, n1[1]-sa*w), 24)], DET)
    cross(d, tf, ta, tb, 0.42, 0.5, DET, -4)
    # MCP knuckles: small arcs above each finger base
    for a, b, ra, rb in FINGERS:
        c = lerp(a, b, -0.02)
        stroke(d, [tf(p) for p in bez((c[0]-ra*0.6, c[1]+6), (c[0]-ra*0.3, c[1]-4), (c[0]+ra*0.3, c[1]-4), (c[0]+ra*0.6, c[1]+6), 14)], DET)
    # five metacarpals (extensor tendons) converging to the wrist
    ends = [(170, 665), (194, 672), (218, 672), (242, 662)]
    for (a, b, ra, rb), e in zip(FINGERS, ends):
        s0 = lerp(a, b, -0.10)
        stroke(d, [tf(p) for p in bez(s0, lerp(s0, e, 0.35), lerp(s0, e, 0.7), e, 24)], DET)
    stroke(d, [tf(p) for p in bez((86, 500), (102, 560), (128, 612), (150, 662), 24)], DET)

def details_palm(d, tf):
    for a, b, ra, rb in FINGERS:
        cross(d, tf, a, b, 0.70, 0.62, DET, 0)
        cross(d, tf, a, b, 0.42, 0.62, DET, 0)
        cross(d, tf, a, b, 0.455, 0.55, DET, 0)
        cross(d, tf, a, b, 0.07, 0.6, DET, 0)
    ta, tb = THUMB[1][0], THUMB[1][1]
    cross(d, tf, ta, tb, 0.45, 0.62, DET, 0)
    # heart line, head line, life line (thenar crease), wrist crease
    stroke(d, [tf(p) for p in bez((308, 432), (270, 410), (215, 392), (172, 380), 30)], DET)
    stroke(d, [tf(p) for p in bez((122, 450), (170, 470), (240, 478), (292, 488), 30)], DET)
    stroke(d, [tf(p) for p in bez((124, 448), (175, 520), (180, 600), (166, 690), 30)], DET)
    stroke(d, [tf(p) for p in bez((126, 696), (170, 704), (225, 704), (268, 696), 30)], DET)

def erode(img, px):
    for _ in range(px):
        img = img.filter(ImageFilter.MinFilter(3))
    return img

def outline_of(sil):
    inner = erode(sil, int(LINE * K))
    ring = ImageChops.subtract(sil, inner)       # 255 on the outline
    return ImageChops.invert(ring)               # black outline on white

def trace(img, name, extra_svg=""):
    pbm = os.path.join(TMP, name + ".pbm"); svg = os.path.join(TMP, name + ".svg")
    img.point(lambda v: 0 if v < 128 else 255, "1").save(pbm)
    subprocess.run(["potrace", pbm, "-s", "-o", svg, "--turdsize", "30", "--alphamax", "1.1", "--opttolerance", "0.4"], check=True)
    s = open(svg).read()
    body = s[s.index("<g "):s.rindex("</svg>")]
    out = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {N} {N}">' + body + extra_svg + "</svg>\n"
    open(os.path.join(OUT, name + ".svg"), "w").write(out)
    print(name, len(out))

def label(x, y, text):
    return f'<text x="{x*K}" y="{y*K}" fill="#6b7280" font-family="Helvetica, Arial, sans-serif" font-size="{30*K}" text-anchor="middle">{text}</text>'

def hands(name, detail_fn, right_x, left_x, right_label_x, left_label_x):
    # right hand as drawn; left hand mirrored around its own centre
    cx = 185
    tf_r = lambda p: (p[0] - cx + right_x, p[1] + 10)
    tf_l = lambda p: (cx - p[0] + left_x, p[1] + 10)
    sil = Image.new("L", (N, N), 0); d = ImageDraw.Draw(sil)
    silhouette(d, tf_r); silhouette(d, tf_l)
    img = outline_of(sil); d = ImageDraw.Draw(img)
    # open wrist: the forearm continues below the drawing
    d.rectangle([0, 748 * K, N, N], fill=255)
    detail_fn(d, tf_r); detail_fn(d, tf_l)
    trace(img, name, label(right_label_x, 786, "rechts") + label(left_label_x, 786, "links"))

# Back of the hands seen from above (hands flat on the table): left hand left, right hand right, thumbs inward
hands("hands_back", details_back, right_x=590, left_x=210, right_label_x=590, left_label_x=210)
# Palms seen from the front (like the face chart): patient's right hand on the left, thumbs outward
hands("hands_palm", details_palm, right_x=210, left_x=590, right_label_x=210, left_label_x=590)

# ── Armpits: close-up of both axillae, arms raised, seen from the front ──
def axilla(d, tf):
    L = lambda pts, w=LINE: stroke(d, [tf(p) for p in pts], w)
    # outer contour of the raised arm running into the side of the chest
    L(bez((40, 20), (60, 180), (95, 300), (110, 380)) + bez((110, 380), (118, 500), (112, 650), (125, 790))[1:])
    # inner contour of the arm running into the front axillary fold (pectoralis), ending before the chest
    L(bez((290, 20), (282, 140), (272, 240), (262, 300)) + bez((262, 300), (282, 380), (320, 450), (372, 500))[1:])
    # back axillary fold (latissimus)
    L(bez((130, 280), (150, 360), (160, 440), (148, 560)), DET)
    # floor of the armpit hollow
    L(bez((150, 440), (180, 500), (245, 500), (282, 390)), DET)
    # hair-bearing area (usual injection field for axillary hyperhidrosis)
    pts = []
    for i in range(121):
        t = 2 * math.pi * i / 120
        x, y = 58 * math.cos(t), 100 * math.sin(t)
        a = math.radians(-8)
        pts.append((205 + x*math.cos(a) - y*math.sin(a), 350 + x*math.sin(a) + y*math.cos(a)))
    dashed(d, [P(*tf(p)) for p in pts], DET)

img = Image.new("L", (N, N), 255); d = ImageDraw.Draw(img)
def dashed(d, pts, w, dash=14*K, gap=12*K):
    acc, on, seg = 0, True, [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b); pos = 0
        while pos < L:
            step = min(L - pos, (dash if on else gap) - acc)
            t = (pos + step) / L
            q = (a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t)
            if on: seg.append(q)
            acc += step; pos += step
            if acc >= (dash if on else gap):
                if on and len(seg) > 1:
                    d.line(seg, fill=0, width=int(w*K), joint="curve")
                    r = w*K/2
                    for p in (seg[0], seg[-1]): d.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=0)
                on = not on; acc = 0; seg = [q]
axilla(d, lambda p: p)                      # patient's right armpit on the left (facing the viewer)
axilla(d, lambda p: (800 - p[0], p[1]))     # left armpit mirrored
trace(img, "axillae", label(190, 775, "rechts") + label(610, 775, "links"))
