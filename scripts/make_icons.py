#!/usr/bin/env python3
"""Generate simple RGBA PNG toolbar icons (a location pin) without external libs."""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(__file__), "..", "extension", "icons")
os.makedirs(OUT, exist_ok=True)

# Base color (indigo) and accent
PIN = (79, 70, 229)      # indigo-600
PIN_DK = (55, 48, 163)   # indigo-800
DOT = (255, 255, 255)


def blend(bg, fg, a):
    return tuple(int(bg[i] * (1 - a) + fg[i] * a) for i in range(3))


def draw(size):
    px = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    cx = size / 2.0
    # Pin: a circle head + a triangular tail (teardrop-ish)
    head_cy = size * 0.40
    head_r = size * 0.30
    tip_y = size * 0.92
    dot_r = size * 0.12

    for y in range(size):
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5
            # distance to head circle
            dh = math.hypot(fx - cx, fy - head_cy)
            inside = False
            edge = 0.0
            if dh <= head_r:
                inside = True
                edge = min(1.0, (head_r - dh) / 1.5)
            else:
                # tail: linear taper from head bottom to tip
                if fy >= head_cy and fy <= tip_y:
                    t = (fy - head_cy) / (tip_y - head_cy)
                    half_w = head_r * (1 - t)
                    if abs(fx - cx) <= half_w:
                        inside = True
                        edge = min(1.0, (half_w - abs(fx - cx)) / 1.5)
            if inside:
                a = max(0.0, min(1.0, edge if edge < 1 else 1.0))
                a = 1.0 if a >= 1 else a
                # subtle vertical shading
                shade = 0.0 if fy < head_cy else min(0.35, (fy - head_cy) / size)
                col = blend(PIN, PIN_DK, shade)
                px[y][x] = (col[0], col[1], col[2], int(255 * a))
            # white dot in head center
            dd = math.hypot(fx - cx, fy - head_cy)
            if dd <= dot_r:
                da = min(1.0, (dot_r - dd) / 1.2)
                px[y][x] = (DOT[0], DOT[1], DOT[2], int(255 * max(0.0, da)) or px[y][x][3])
    return px


def write_png(path, px):
    size = len(px)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            r, g, b, a = px[y][x]
            raw += bytes((r, g, b, a))
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        crc = zlib.crc32(typ + data) & 0xFFFFFFFF
        return c + struct.pack(">I", crc)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))


for s in (16, 32, 48, 128):
    write_png(os.path.join(OUT, f"icon{s}.png"), draw(s))
    print("wrote", f"icon{s}.png")
