from pathlib import Path
import math, struct, zlib

assets = Path('assets')
assets.mkdir(exist_ok=True)

def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixels(x, y))
    def chunk(tag, data):
        crc = zlib.crc32(tag + data)
        if crc < 0:
            crc += 2**32
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc % (2**32))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))

def lerp(a,b,t): return int(a+(b-a)*t)
def mix(c1,c2,t): return tuple(lerp(a,b,t) for a,b in zip(c1,c2))

def icon_pixels(w, h, foreground_only=False, monochrome=False):
    cx, cy = w/2, h/2
    def px(x,y):
        nx, ny = x/w, y/h
        if foreground_only or monochrome:
            bg = (0,0,0,0)
        else:
            base = mix((5,11,22), (14,165,233), max(0, min(1, (nx*0.55+ny*0.45))))
            glow = max(0, 1 - math.hypot((x-cx)/(w*0.72), (y-cy)/(h*0.72)))
            bg = mix(base, (56,189,248), glow*0.22) + (255,)
        dist = math.hypot(x-cx, y-cy)
        orb_r = min(w,h)*0.34
        ring_r = min(w,h)*0.40
        color = list(bg)
        if dist < ring_r and not monochrome:
            edge = abs(dist-orb_r)/(ring_r-orb_r)
            if dist > orb_r:
                alpha = max(0, 1-edge) * 0.32
                color = list(mix(color[:3], (125,211,252), alpha)) + [max(color[3], int(255*alpha))]
        if dist < orb_r:
            t = dist/orb_r
            orb = (255,255,255) if monochrome else mix((2,132,199), (125,211,252), 1-t*0.65)
            alpha = 255 if not foreground_only else int(245*(1-t*0.08))
            color = list(orb) + [alpha]
        for i, off in enumerate([-0.12, 0, 0.12]):
            yy = cy + off*h + math.sin((x/w)*math.pi*2.2 + i*0.75)*h*0.035
            if abs(y-yy) < h*0.012 and abs(x-cx) < w*0.20:
                wave = (255,255,255) if monochrome else (240,249,255)
                return wave + (255,)
        return tuple(color)
    return px

write_png(assets/'icon.png', 1024, 1024, icon_pixels(1024,1024))
write_png(assets/'splash-icon.png', 512, 512, icon_pixels(512,512, foreground_only=True))
write_png(assets/'favicon.png', 64, 64, icon_pixels(64,64))
write_png(assets/'android-icon-background.png', 432, 432, lambda x,y: (5,11,22,255))
write_png(assets/'android-icon-foreground.png', 432, 432, icon_pixels(432,432, foreground_only=True))
write_png(assets/'android-icon-monochrome.png', 432, 432, icon_pixels(432,432, foreground_only=True, monochrome=True))
print('generated AgentCall assets')
