#!/usr/bin/env python3
"""Generate PNG icons for WebScraper Pro extension.

Creates a modern gradient icon with a document/extraction motif:
- Gradient background (indigo to pink)
- Three horizontal lines representing text/data
- Small green dot indicating active extraction
- Rounded corners
"""
import struct
import zlib
import math
import os


def create_icon(size):
    """Create a modern WebScraper Pro icon at the given size."""
    pixels = []
    s = size
    pad = max(1, int(s * 0.08))  # corner rounding

    for y in range(s):
        row = []
        for x in range(s):
            # Rounded rectangle mask
            in_rect = True
            corners = [
                (pad, pad), (s - 1 - pad, pad),
                (pad, s - 1 - pad), (s - 1 - pad, s - 1 - pad)
            ]
            if x < pad and y < pad:
                in_rect = math.hypot(x - pad, y - pad) <= pad
            elif x > s - 1 - pad and y < pad:
                in_rect = math.hypot(x - (s - 1 - pad), y - pad) <= pad
            elif x < pad and y > s - 1 - pad:
                in_rect = math.hypot(x - pad, y - (s - 1 - pad)) <= pad
            elif x > s - 1 - pad and y > s - 1 - pad:
                in_rect = math.hypot(x - (s - 1 - pad), y - (s - 1 - pad)) <= pad

            if not in_rect:
                row.extend((0, 0, 0, 0))
                continue

            # Gradient background: indigo (#4f46e5) to pink (#db2777)
            t = (x + y) / (2 * s)  # diagonal gradient 0..1
            r = int(79 + (219 - 79) * t)
            g = int(70 + (39 - 70) * t)
            b = int(229 + (119 - 229) * t)

            # Add subtle noise for depth
            noise = ((x * 7 + y * 13) % 5) - 2
            r = max(0, min(255, r + noise))
            g = max(0, min(255, g + noise))
            b = max(0, min(255, b + noise))

            # Draw three horizontal data lines (white, semi-transparent)
            line_drawn = False
            lx_start = int(s * 0.18)
            line_h = max(2, int(s * 0.06))  # line thickness

            # Line 1: longest (top)
            l1y = int(s * 0.28)
            l1x_end = int(s * 0.78)
            if l1y <= y < l1y + line_h and lx_start <= x <= l1x_end:
                r, g, b = 255, 255, 255
                line_drawn = True

            # Line 2: medium (middle)
            l2y = int(s * 0.44)
            l2x_end = int(s * 0.62)
            if l2y <= y < l2y + line_h and lx_start <= x <= l2x_end:
                r, g, b = 255, 255, 255
                line_drawn = True

            # Line 3: short (bottom)
            l3y = int(s * 0.60)
            l3x_end = int(s * 0.48)
            if l3y <= y < l3y + line_h and lx_start <= x <= l3x_end:
                r, g, b = 255, 255, 255
                line_drawn = True

            # Green extraction dot (bottom-right)
            dot_cx = int(s * 0.74)
            dot_cy = int(s * 0.72)
            dot_r = max(2, int(s * 0.09))
            dot_dist = math.hypot(x - dot_cx, y - dot_cy)
            if dot_dist <= dot_r:
                # Green dot with slight inner highlight
                if dot_dist <= dot_r * 0.5:
                    r, g, b = 52, 211, 153  # lighter green center
                else:
                    r, g, b = 16, 185, 129  # #10b981

            # Small arrow/chevron suggesting extraction (right side)
            arrow_cx = int(s * 0.84)
            arrow_cy = int(s * 0.42)
            arrow_size = max(2, int(s * 0.08))
            ax = x - arrow_cx
            ay = y - arrow_cy
            # Right-pointing chevron: two diagonal lines
            if abs(ax - abs(ay)) <= max(1, int(s * 0.025)) and abs(ay) <= arrow_size:
                r, g, b = 255, 255, 255

            row.extend((r, g, b, 255))
        pixels.append(row)

    return _make_png(s, s, pixels)


def _make_png(w, h, pixel_rows):
    """Encode pixel data as PNG."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))

    raw = b''
    for row in pixel_rows:
        raw += b'\x00' + bytes(row)

    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for size in (48, 96):
        png_data = create_icon(size)
        path = os.path.join(script_dir, f'icon-{size}.png')
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'Created {path} ({len(png_data)} bytes)')
