"""
Схематичные SVG-изображения для раздела теории «Огни и знаки» (огни и
дневные знаки судов по МППСС-72, часть C). Полный текст правил — в теме
МППСС (data/theory/colregs.json); здесь — прикладная иллюстрированная
шпаргалка для быстрого узнавания типа судна по сочетанию огней/знаков.

Как и другие модули диаграмм: чистый SVG, без JavaScript и без
зависимости от Streamlit.

Условность схемы: круговые/топовые/бортовые огни показаны как цветные
кружки, собранные в вертикальный «стек» слева (сверху вниз — как они
реально расположены по высоте на судне), дневные знаки — как чёрные
силуэты (шар/конус/ромб/цилиндр), тоже вертикальным стеком справа.
Это не чертёж реального расположения по длине/ширине судна.
"""

import math

# Языковая инфраструктура диаграмм (v2 i18n): каждая функция-строитель
# схемы принимает параметр lang ("ru"/"en", по умолчанию "ru" — для
# обратной совместимости со старыми вызовами builder() без аргументов) и
# подставляет текст через _l(lang, ru_text, en_text). Геометрия схем не
# зависит от языка — меняется только текст надписей/подписей.
_CAPTIONS = {
    "ru": "Условная схема для наглядности — не официальный документ/чертёж.",
    "en": "A simplified schematic for illustration only — not an official document/drawing.",
}


def _l(lang: str, ru: str, en: str) -> str:
    """Выбирает текст на языке lang; неизвестный язык откатывается на ru."""
    return en if lang == "en" else ru


def _wrap(svg_inner: str, legend_html: str, w: int = 300, h: int = 220, lang: str = "ru") -> str:
    caption = _CAPTIONS.get(lang, _CAPTIONS["ru"])
    return f"""
<div style="background:#eef6ff;border-radius:8px;padding:10px;font-family:sans-serif;">
  <svg viewBox="0 0 {w} {h}" width="100%" height="{h + 20}" xmlns="http://www.w3.org/2000/svg">
    <rect width="{w}" height="{h}" fill="#eef6ff"/>
    {svg_inner}
  </svg>
  <div style="font-size:12px;margin-top:6px;line-height:1.5;text-align:center;">{legend_html}</div>
  <div style="font-size:11px;color:#667;margin-top:4px;text-align:center;">{caption}</div>
</div>
"""


def _text(x: float, y: float, s: str, size: float = 10.5, anchor: str = "middle",
          color: str = "#111318", weight: str = "normal") -> str:
    return (f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
            f'fill="{color}" font-family="sans-serif" font-weight="{weight}">{s}</text>')


def _wrap_text_lines(s: str, max_chars: int) -> list[str]:
    words = s.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _multiline_text(cx: float, y0: float, s: str, max_chars: int, size: float = 10,
                     line_height: float = 12, weight: str = "normal") -> tuple[str, int]:
    lines = _wrap_text_lines(s, max_chars)
    svg = "".join(_text(cx, y0 + i * line_height, line, size, weight=weight) for i, line in enumerate(lines))
    return svg, len(lines)


WHITE = "#ffffff"
RED = "#c62828"
GREEN = "#2e7d32"
YELLOW = "#f5c518"
BLACK = "#111318"


def _light_dot(cx: float, cy: float, colors, r: float = 8) -> str:
    """colors — одна строка (обычный круговой/топовый огонь) или пара
    строк (бортовые огни — левый порт красный слева, зелёный справа)."""
    if isinstance(colors, str):
        return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{colors}" stroke="#20242b" stroke-width="1"/>'
    left, right = colors
    return (
        f'<circle cx="{cx - r * 0.85}" cy="{cy}" r="{r * 0.75}" fill="{left}" stroke="#20242b" stroke-width="1"/>'
        f'<circle cx="{cx + r * 0.85}" cy="{cy}" r="{r * 0.75}" fill="{right}" stroke="#20242b" stroke-width="1"/>'
    )


def _light_stack(cx: float, top_y: float, items: list[tuple], spacing: float = 24,
                  label_x_offset: float = 26) -> tuple[str, float]:
    """items: [(colors, label), ...] сверху вниз. Возвращает (svg, y последней строки)."""
    n = len(items)
    mast = f'<line x1="{cx}" y1="{top_y - 12}" x2="{cx}" y2="{top_y + spacing * (n - 1) + 14}" stroke="#8a92a0" stroke-width="2"/>'
    svg = mast
    y = top_y
    for colors, label in items:
        svg += _light_dot(cx, y, colors)
        svg += _text(cx + label_x_offset, y + 4, label, 10, anchor="start")
        y += spacing
    return svg, y - spacing


def _shape_icon(kind: str, cx: float, cy: float, size: float = 9) -> str:
    if kind == "ball":
        return f'<circle cx="{cx}" cy="{cy}" r="{size * 0.8}" fill="{BLACK}" stroke="#0c0d10" stroke-width="0.8"/>'
    if kind == "cone_up":
        pts = f"{cx - size},{cy + size * 0.6} {cx + size},{cy + size * 0.6} {cx},{cy - size * 0.7}"
        return f'<polygon points="{pts}" fill="{BLACK}" stroke="#0c0d10" stroke-width="0.8"/>'
    if kind == "cone_down":
        pts = f"{cx - size},{cy - size * 0.6} {cx + size},{cy - size * 0.6} {cx},{cy + size * 0.7}"
        return f'<polygon points="{pts}" fill="{BLACK}" stroke="#0c0d10" stroke-width="0.8"/>'
    if kind == "diamond":
        pts = f"{cx},{cy - size} {cx + size * 0.8},{cy} {cx},{cy + size} {cx - size * 0.8},{cy}"
        return f'<polygon points="{pts}" fill="{BLACK}" stroke="#0c0d10" stroke-width="0.8"/>'
    if kind == "cylinder":
        return f'<rect x="{cx - size * 0.7}" y="{cy - size}" width="{size * 1.4}" height="{size * 2}" fill="{BLACK}" stroke="#0c0d10" stroke-width="0.8"/>'
    return ""


def _shape_stack(cx: float, top_y: float, kinds: list[str], spacing: float = 26) -> tuple[str, float]:
    n = len(kinds)
    mast = f'<line x1="{cx}" y1="{top_y - 12}" x2="{cx}" y2="{top_y + spacing * (n - 1) + 14}" stroke="#8a92a0" stroke-width="2"/>'
    svg = mast
    y = top_y
    for kind in kinds:
        svg += _shape_icon(kind, cx, y)
        y += spacing
    return svg, y - spacing


def _stack_diagram(light_items: list[tuple], shape_kinds: list[str], shape_label: str,
                    w: int = 300, top_y: float = 40, lang: str = "ru") -> tuple[str, int]:
    """Общий макет: слева стек огней с подписями, справа стек дневных
    знаков с одной общей подписью снизу."""
    light_cx = 75
    shape_cx = 225
    header = (
        _text(light_cx, 20, _l(lang, "Огни (ночь)", "Lights (night)"), 11, weight="bold")
        + _text(shape_cx, 20, _l(lang, "Знаки (день)", "Shapes (day)"), 11, weight="bold")
    )
    lights_svg, lights_bottom = _light_stack(light_cx, top_y, light_items)
    shapes_svg, shapes_bottom = ("", top_y - 24)
    if shape_kinds:
        shapes_svg, shapes_bottom = _shape_stack(shape_cx, top_y, shape_kinds)
    bottom = max(lights_bottom, shapes_bottom) + 30
    label_svg, n_lines = _multiline_text(shape_cx, bottom, shape_label, max_chars=20)
    total_h = bottom + n_lines * 12 + 15
    inner = header + lights_svg + shapes_svg + label_svg
    return inner, int(total_h)


# ---------------------------------------------------------------------------


def _sector(cx: float, cy: float, r: float, start_deg: float, end_deg: float,
            color: str, opacity: float = 0.6, stroke: str = "none") -> str:
    def pt(deg: float) -> tuple[float, float]:
        rad = math.radians(deg)
        return cx + r * math.sin(rad), cy - r * math.cos(rad)
    x1, y1 = pt(start_deg)
    x2, y2 = pt(end_deg)
    large_arc = 1 if (end_deg - start_deg) % 360 > 180 else 0
    return (f'<path d="M {cx},{cy} L {x1:.1f},{y1:.1f} A {r},{r} 0 {large_arc} 1 {x2:.1f},{y2:.1f} Z" '
            f'fill="{color}" opacity="{opacity}" stroke="{stroke}" stroke-width="1"/>')


def arcs_of_visibility_html(lang: str = "ru") -> str:
    cx, cy, r = 150, 115, 78
    green = _sector(cx, cy, r, 0, 112.5, GREEN)
    red = _sector(cx, cy, r, -112.5, 0, RED)
    stern = _sector(cx, cy, r, 112.5, 247.5, "#cfd8e3", opacity=0.9, stroke="#5a6270")
    boat = (f'<path d="M {cx},{cy - 26} L {cx + 13},{cy + 8} L {cx + 9},{cy + 28} '
            f'L {cx - 9},{cy + 28} L {cx - 13},{cy + 8} Z" fill="#5a6270" stroke="#20242b" stroke-width="1"/>')
    labels = (
        _text(cx, cy - r - 8, _l(lang, "Топовый (белый) — 225°", "Masthead (white) — 225°"), 10, weight="bold")
        + _text(cx + r * 0.6 + 12, cy - 5, _l(lang, "Зелёный 112.5°", "Green 112.5°"), 9.5, anchor="start", color=GREEN, weight="bold")
        + _text(cx - r * 0.6 - 12, cy - 5, _l(lang, "112.5° Красный", "112.5° Red"), 9.5, anchor="end", color=RED, weight="bold")
        + _text(cx, cy + r + 20, _l(lang, "Кормовой (белый) — 135°", "Sternlight (white) — 135°"), 10, weight="bold")
    )
    inner = green + red + stern + boat + labels
    legend = _l(
        lang,
        "Вид сверху, нос судна вверх. Дуги смежные и в сумме покрывают все 360° — "
        "по видимому огню можно определить примерный курсовой угол на наблюдаемое судно.",
        "Top-down view, bow up. The arcs are adjacent and together cover the full 360° — "
        "the light you see gives an approximate relative bearing to the observed vessel.",
    )
    return _wrap(inner, legend, w=300, h=230, lang=lang)


def pd_vessel_small_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Топовый", "Masthead")),
        ((RED, GREEN), _l(lang, "Бортовые", "Sidelights")),
        (WHITE, _l(lang, "Кормовой", "Sternlight")),
    ]
    inner, h = _stack_diagram(lights, [], "", lang=lang)
    legend = _l(
        lang,
        "Судно с механическим двигателем, менее 50 м — один топовый + бортовые + кормовой.",
        "Power-driven vessel, less than 50 m — one masthead light + sidelights + sternlight.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def pd_vessel_large_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Топовый задний (выше)", "After masthead (higher)")),
        (WHITE, _l(lang, "Топовый носовой", "Forward masthead")),
        ((RED, GREEN), _l(lang, "Бортовые", "Sidelights")),
        (WHITE, _l(lang, "Кормовой", "Sternlight")),
    ]
    inner, h = _stack_diagram(lights, [], "", lang=lang)
    legend = _l(
        lang,
        "Судно с механическим двигателем, 50 м и более — два топовых (задний выше и позади) + бортовые + кормовой.",
        "Power-driven vessel, 50 m or more — two masthead lights (the after one higher and further aft) + sidelights + sternlight.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def pd_vessel_tiny_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Круговой белый", "All-round white")),
        ((RED, GREEN), _l(lang, "Бортовые (если есть)", "Sidelights (if fitted)")),
    ]
    inner, h = _stack_diagram(lights, [], "", lang=lang)
    legend = _l(
        lang,
        "Судно менее 12 м (менее 7 м — можно без бортовых) — один круговой белый вместо топового/кормового.",
        "Vessel less than 12 m (less than 7 m — sidelights may be omitted) — one all-round white light instead of masthead/sternlight.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def towing_vessel_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Топовый №2 (выше)", "Masthead #2 (higher)")),
        (WHITE, _l(lang, "Топовый №1", "Masthead #1")),
        ((RED, GREEN), _l(lang, "Бортовые", "Sidelights")),
        (YELLOW, _l(lang, "Буксировочный", "Towing light")),
        (WHITE, _l(lang, "Кормовой", "Sternlight")),
    ]
    shape_label = _l(lang, "Ромб — при буксире длиннее 200 м", "Diamond — when the tow exceeds 200 m")
    inner, h = _stack_diagram(lights, ["diamond"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Буксирующее судно: 2 топовых по вертикали (3-й — если длина буксира более 200 м) "
        "+ бортовые + кормовой + жёлтый буксировочный над кормовым.",
        "Towing vessel: 2 masthead lights in a vertical line (a 3rd if the tow exceeds 200 m) "
        "+ sidelights + sternlight + a yellow towing light above the sternlight.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def sailing_vessel_html(lang: str = "ru") -> str:
    lights = [((RED, GREEN), _l(lang, "Бортовые", "Sidelights")), (WHITE, _l(lang, "Кормовой", "Sternlight"))]
    shape_label = _l(lang, "Конус вниз — если одновременно работает двигатель", "Cone, point down — when also under power")
    inner, h = _stack_diagram(lights, ["cone_down"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Парусное судно на ходу — бортовые и кормовой, БЕЗ топового огня (главное отличие ночью).",
        "Sailing vessel underway — sidelights and sternlight, WITHOUT a masthead light (the key distinction at night).",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def fishing_vessel_html(lang: str = "ru") -> str:
    lights = [
        (GREEN, _l(lang, "Траление: зелёный сверху", "Trawling: green on top")),
        (RED, _l(lang, "Прочий лов: красный сверху", "Other fishing: red on top")),
        (WHITE, _l(lang, "…белый снизу (оба варианта)", "…white below (both cases)")),
    ]
    shape_label = _l(lang, "Два конуса вершинами вместе", "Two cones, apex to apex")
    inner, h = _stack_diagram(lights, ["cone_down", "cone_up"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Цвет верхнего кругового огня — признак: зелёный сверху = траление, красный сверху = прочий лов.",
        "The colour of the upper all-round light is the tell: green on top = trawling, red on top = fishing other than trawling.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def not_under_command_html(lang: str = "ru") -> str:
    lights = [(RED, _l(lang, "Красный", "Red")), (RED, _l(lang, "Красный", "Red"))]
    shape_label = _l(lang, "Два чёрных шара", "Two black balls")
    inner, h = _stack_diagram(lights, ["ball", "ball"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Лишённое возможности управляться (NUC) — два красных огня/шара, без белого посередине.",
        "Not under command (NUC) — two red lights/balls, with no white in between.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def restricted_maneuverability_html(lang: str = "ru") -> str:
    lights = [(RED, _l(lang, "Красный", "Red")), (WHITE, _l(lang, "Белый", "White")), (RED, _l(lang, "Красный", "Red"))]
    shape_label = _l(lang, "Шар — ромб — шар", "Ball — diamond — ball")
    inner, h = _stack_diagram(lights, ["ball", "diamond", "ball"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Ограниченное в манёвренности (RAM) — красный-белый-красный, в отличие от NUC (только красный-красный).",
        "Restricted in ability to manoeuvre (RAM) — red-white-red, unlike NUC (red-red only).",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def constrained_by_draft_html(lang: str = "ru") -> str:
    lights = [(RED, _l(lang, "Красный", "Red")), (RED, _l(lang, "Красный", "Red")), (RED, _l(lang, "Красный", "Red"))]
    shape_label = _l(lang, "Цилиндр", "Cylinder")
    inner, h = _stack_diagram(lights, ["cylinder"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Стеснённое своей осадкой — необязательный доп. сигнал (три красных огня/цилиндр) к обычным огням судна.",
        "Constrained by her draught — an optional additional signal (three red lights/a cylinder) in addition to the vessel's normal lights.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def pilot_vessel_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Белый", "White")),
        (RED, _l(lang, "Красный", "Red")),
        ((RED, GREEN), _l(lang, "Бортовые (на ходу)", "Sidelights (underway)")),
        (WHITE, _l(lang, "Кормовой (на ходу)", "Sternlight (underway)")),
    ]
    inner, h = _stack_diagram(lights, [], "", lang=lang)
    legend = _l(
        lang,
        "Лоцманское судно при исполнении обязанностей — белый над красным на топе.",
        "Pilot vessel engaged on pilotage duty — white over red at the masthead.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def at_anchor_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Носовой белый", "Forward white")),
        (WHITE, _l(lang, "Кормовой (суда ≥50м)", "After (vessels ≥50 m)")),
    ]
    shape_label = _l(lang, "Один чёрный шар", "One black ball")
    inner, h = _stack_diagram(lights, ["ball"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Судно на якоре — круговой белый в носу (плюс кормовой у крупных судов), днём — шар.",
        "Vessel at anchor — an all-round white light forward (plus an after light on larger vessels); by day, a ball.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


def aground_html(lang: str = "ru") -> str:
    lights = [
        (WHITE, _l(lang, "Якорные (как на якоре)", "Anchor lights (as at anchor)")),
        (RED, _l(lang, "Красный", "Red")),
        (RED, _l(lang, "Красный", "Red")),
    ]
    shape_label = _l(lang, "Три чёрных шара", "Three black balls")
    inner, h = _stack_diagram(lights, ["ball", "ball", "ball"], shape_label, lang=lang)
    legend = _l(
        lang,
        "Судно на мели — якорные огни/знаки ПЛЮС два красных круговых огня; днём — три шара.",
        "Vessel aground — anchor lights/shapes PLUS two all-round red lights; by day, three balls.",
    )
    return _wrap(inner, legend, h=h, lang=lang)


DIAGRAMS = {
    "arcs_of_visibility": arcs_of_visibility_html,
    "pd_vessel_small": pd_vessel_small_html,
    "pd_vessel_large": pd_vessel_large_html,
    "pd_vessel_tiny": pd_vessel_tiny_html,
    "towing_vessel": towing_vessel_html,
    "sailing_vessel": sailing_vessel_html,
    "fishing_vessel": fishing_vessel_html,
    "not_under_command": not_under_command_html,
    "restricted_maneuverability": restricted_maneuverability_html,
    "constrained_by_draft": constrained_by_draft_html,
    "pilot_vessel": pilot_vessel_html,
    "at_anchor": at_anchor_html,
    "aground": aground_html,
}


def get_light_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
