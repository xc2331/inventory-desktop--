"""生成 Family Inventory v2 图标（多尺寸 ICO）

设计风格：
- 大圆角方形背景（大尺寸）
- 绿色纯色（emerald-500）
- 中心白色「清单/复选框」符号
- 无半透明高光，无外环
- 16x16、32x32 使用像素级精确绘制的极简对勾，保证任务栏/托盘清晰
"""
from PIL import Image, ImageDraw
import os

SIZES = [256, 128, 64, 48, 32, 16]
OUTPUT = os.path.join(os.path.dirname(__file__), 'icon.ico')

BG = (16, 185, 129)
WHITE = (255, 255, 255, 255)


def _draw_check_mark(draw, points, width):
    """绘制对勾"""
    draw.line([points[0], points[1]], fill=WHITE, width=width)
    draw.line([points[1], points[2]], fill=WHITE, width=width)


def _draw_full_design(size):
    """完整设计：绿色圆角背景 + 白色清单卡片 + 复选框（48x48 及以上）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = max(size // 3, 2)
    pad = size // 14
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=BG)

    card_pad = size // 5
    card_top = size // 6
    card_left = card_pad
    card_right = size - card_pad
    card_bottom = size - card_top
    card_radius = max(2, size // 12)
    draw.rounded_rectangle(
        [card_left, card_top, card_right, card_bottom],
        radius=card_radius,
        fill=WHITE
    )

    box_size = int((card_right - card_left) * 0.24)
    box_left = card_left + (card_right - card_left) // 8
    box_top = card_top + (card_bottom - card_top) // 5
    box_radius = max(2, box_size // 5)
    draw.rounded_rectangle(
        [box_left, box_top, box_left + box_size, box_top + box_size],
        radius=box_radius,
        fill=BG
    )

    check_points = [
        (box_left + box_size * 0.22, box_top + box_size * 0.52),
        (box_left + box_size * 0.42, box_top + box_size * 0.72),
        (box_left + box_size * 0.78, box_top + box_size * 0.28),
    ]
    line_width = max(2, int(box_size * 0.16))
    _draw_check_mark(draw, check_points, line_width)

    line_left = int(box_left + box_size + (card_right - card_left) / 9)
    line_y1 = int(box_top + box_size / 3)
    line_y2 = int(box_top + box_size * 2 / 3 + box_size / 6)
    line_right = card_right - (card_right - card_left) // 8
    line_height = max(2, int(box_size * 0.20))
    grey = (203, 213, 225)
    draw.rounded_rectangle([line_left, line_y1, line_right, line_y1 + line_height], radius=line_height // 2, fill=grey)
    draw.rounded_rectangle([line_left, line_y2, line_right, line_y2 + line_height], radius=line_height // 2, fill=grey)

    return img


def _draw_simple_check(size):
    """简化设计：绿色圆角背景 + 大白对勾（32x32）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = max(1, size // 16)
    radius = max(size // 3, 2)
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=BG)

    # 对勾占满约 70% 的区域
    margin = size * 0.15
    left = margin
    bottom = size - margin
    right = size - margin
    top = margin + size * 0.05

    points = [
        (left + size * 0.05, top + size * 0.42),
        (left + size * 0.38, bottom - size * 0.12),
        (right - size * 0.05, top + size * 0.12),
    ]
    line_width = max(3, int(size * 0.16))
    _draw_check_mark(draw, points, line_width)

    return img


def _draw_tiny_check(size):
    """16x16 专用：像素级精确，最大化对比度"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 16x16 用 14x14 背景，1px 边距，2px 圆角
    draw.rounded_rectangle([1, 1, size - 2, size - 2], radius=2, fill=BG)

    # 对勾坐标按 16x16 像素网格精确放置
    # 线条宽度 3px，从 (4,8) -> (7,11) -> (12,5)
    points = [(4, 8), (7, 11), (12, 5)]
    draw.line([points[0], points[1]], fill=WHITE, width=3)
    draw.line([points[1], points[2]], fill=WHITE, width=3)

    return img


def create_icon(size):
    if size == 16:
        return _draw_tiny_check(size)
    if size <= 32:
        return _draw_simple_check(size)
    return _draw_full_design(size)


if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    images = [create_icon(s) for s in SIZES]
    images[0].save(
        OUTPUT,
        format='ICO',
        sizes=[(s, s) for s in SIZES],
        append_images=images[1:]
    )
    # 输出每个尺寸的 PNG 供检查
    for size, img in zip(SIZES, images):
        preview_path = os.path.join(os.path.dirname(OUTPUT), f'icon-preview-{size}.png')
        img.save(preview_path)
    # 单独输出 16x16 tray 图标
    tray_path = os.path.join(os.path.dirname(OUTPUT), 'tray-icon-16.png')
    images[-1].save(tray_path)
    print('Saved', OUTPUT)
