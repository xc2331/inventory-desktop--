"""生成 Family Inventory 应用图标（多尺寸 ICO）

设计风格：与 V3 UI 统一的暖白/深石板玻璃拟态，主色 emerald-teal 渐变，
中心为白色“家庭物资箱”剪影，带柔和投影与高光环。
"""
from PIL import Image, ImageDraw, ImageFilter
import os

SIZES = [256, 128, 64, 48, 32, 16]
OUTPUT = os.path.join(os.path.dirname(__file__), 'icon.ico')

# V3 主色
C_TOP = (4, 120, 87)      # emerald-700
C_BOTTOM = (13, 148, 136) # teal-600
C_HIGHLIGHT = (255, 255, 255, 38)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def gradient_bg(size, c1, c2):
    img = Image.new('RGBA', (size, size))
    for y in range(size):
        t = y / (size - 1) if size > 1 else 0
        r = lerp(c1[0], c2[0], t)
        g = lerp(c1[1], c2[1], t)
        b = lerp(c1[2], c2[2], t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b, 255))
    return img


def draw_rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def create_icon(size):
    # 1. 渐变背景
    img = gradient_bg(size, C_TOP, C_BOTTOM)
    draw = ImageDraw.Draw(img)

    pad = max(1, size // 14)
    radius = size // 5

    # 2. 顶部高光（模拟玻璃反光）
    hi_pad = size // 10
    hi_box = [hi_pad, hi_pad, size - hi_pad, size // 3]
    draw.rounded_rectangle(hi_box, radius=radius, fill=C_HIGHLIGHT)

    # 3. 外环
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        outline=(255, 255, 255, 70),
        width=max(1, size // 64)
    )

    # 4. 中心“物资箱”图标（白色实心）
    box_w = int(size * 0.46)
    box_h = int(size * 0.40)
    cx = size // 2
    cy = size // 2 + int(size * 0.02)
    box_left = cx - box_w // 2
    box_top = cy - box_h // 2
    box_right = box_left + box_w
    box_bottom = box_top + box_h
    box_r = box_w // 6

    # 箱体
    draw.rounded_rectangle(
        [box_left, box_top, box_right, box_bottom],
        radius=box_r,
        fill=(255, 255, 255, 245)
    )

    # 箱盖胶带
    tape_h = max(1, int(box_h * 0.18))
    tape_top = box_top + int(box_h * 0.22)
    draw.rounded_rectangle(
        [box_left + box_r // 2, tape_top, box_right - box_r // 2, tape_top + tape_h],
        radius=tape_h // 2,
        fill=(4, 120, 87, 200)
    )

    # 小标签
    label_w = int(box_w * 0.35)
    label_h = int(box_h * 0.22)
    label_left = cx - label_w // 2
    label_top = tape_top + tape_h + int(box_h * 0.18)
    draw.rounded_rectangle(
        [label_left, label_top, label_left + label_w, label_top + label_h],
        radius=label_h // 3,
        fill=(4, 120, 87, 160)
    )

    # 5. 底部投影（让图标在任务栏/桌面上更立体）
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    shadow_pad = size // 6
    sd.ellipse(
        [shadow_pad, size - size // 14, size - shadow_pad, size + size // 14],
        fill=(0, 0, 0, 45)
    )
    img = Image.alpha_composite(shadow, img)

    return img.convert('RGBA')


if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    images = [create_icon(s) for s in SIZES]
    images[0].save(
        OUTPUT,
        format='ICO',
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:]
    )
    print('Saved', OUTPUT)
