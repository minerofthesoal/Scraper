#!/usr/bin/env python3
"""Generate PNG icons for the extension from SVG."""
import struct
import zlib
import os

def create_png(width, height, color_bg=(41, 128, 185), color_fg=(255, 255, 255)):
    """Create a simple PNG icon with a scraper symbol."""
    pixels = []
    cx, cy = width // 2, height // 2
    r_outer = int(width * 0.42)
    r_inner = int(width * 0.30)

    for y in range(height):
        row = []
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5

            if dist <= r_outer:
                # Draw a magnifying glass shape
                if dist >= r_inner and dist <= r_outer:
                    row.extend(color_fg)
                    row.append(255)
                elif abs(dx) < width * 0.08 and dy > 0 and dy < r_inner * 0.7:
                    # Vertical bar inside
                    row.extend(color_fg)
                    row.append(255)
                elif abs(dy) < height * 0.08 and abs(dx) < r_inner * 0.5:
                    # Horizontal bar inside
                    row.extend(color_fg)
                    row.append(255)
                else:
                    row.extend(color_bg)
                    row.append(255)
            elif dx > r_outer * 0.5 and dy > r_outer * 0.5 and abs(dx - dy) < width * 0.12:
                # Handle of magnifying glass
                if dx < r_outer * 1.3:
                    row.extend(color_fg)
                    row.append(255)
                else:
                    row.extend((0, 0, 0, 0))
            else:
                row.extend((0, 0, 0, 0))
        pixels.append(row)

    def make_png(w, h, pixel_rows):
        def chunk(chunk_type, data):
            c = chunk_type + data
            crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
            return struct.pack('>I', len(data)) + c + crc

        header = b'\x89PNG\r\n\x1a\n'
        ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))

        raw = b''
        for row in pixel_rows:
            raw += b'\x00' + bytes(row)

        idat = chunk(b'IDAT', zlib.compress(raw))
        iend = chunk(b'IEND', b'')
        return header + ihdr + idat + iend

    return make_png(width, height, pixels)


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for size in (48, 96):
        png_data = create_png(size, size)
        path = os.path.join(script_dir, f'icon-{size}.png')
        with open(path, 'wb') as f:
            f.write(png_data)
        print(f'Created {path}')
