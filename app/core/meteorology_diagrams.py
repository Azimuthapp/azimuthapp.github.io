"""
Схематичные SVG-изображения для темы «Метеорология» — шкала Бофорта и
условные обозначения на синоптических картах (ветровые перья, облачность
в октантах, атмосферные фронты, центры давления).

Как и другие модули диаграмм в app/: чистый SVG без JavaScript и без
зависимости от Streamlit — переносится в финальный PWA-интерфейс без
переделки. Переиспользует базовые SVG-хелперы из app/gmdss_diagrams.py
(_wrap/_box/_text/_multiline_text и т.д.), чтобы не дублировать
геометрию — тот же приём, что и в app/distress_signals_diagrams.py и
app/smcp_diagrams.py.

Языковая инфраструктура (v2 i18n, тот же приём, что и в
app/gmdss_diagrams.py): каждая функция-строитель схемы принимает
параметр lang ("ru"/"en", по умолчанию "ru" — для обратной совместимости
со старыми вызовами builder() без аргументов) и подставляет текст через
_g._l(lang, ru_text, en_text). Геометрия схем не зависит от языка —
меняется только текст надписей/подписей.
"""

from core import gmdss_diagrams as _g


def beaufort_scale_overview_html(lang: str = "ru") -> str:
    """Расширенная сводная таблица шкалы Бофорта: на каждый балл —
    диапазон скорости в узлах И в м/с, название, ориентировочная высота
    волны в открытом море и мини-схема волны, чья амплитуда растёт вместе
    с баллом (быстрый визуальный ориентир, не для точного чтения)."""
    w = 340
    # (балл, узлы, м/с, название (ru, en), ориентировочная высота волны в
    # метрах — округлённое "вероятное" значение для открытого моря, не
    # официальный табличный столбец WMO как таковой, а справочный ориентир)
    # Английские названия — официальная терминология WMO/NOAA (см.
    # data/theory/meteorology.en.json для согласованности).
    rows = [
        (0, "0-1", "0-0.5", "Штиль", "Calm", 0.0),
        (1, "1-3", "0.5-1.5", "Тихий ветер", "Light Air", 0.1),
        (2, "4-6", "1.6-3.3", "Лёгкий ветер", "Light Breeze", 0.2),
        (3, "7-10", "3.4-5.4", "Слабый ветер", "Gentle Breeze", 0.6),
        (4, "11-16", "5.5-7.9", "Умеренный ветер", "Moderate Breeze", 1.0),
        (5, "17-21", "8.0-10.7", "Свежий ветер", "Fresh Breeze", 2.0),
        (6, "22-27", "10.8-13.8", "Сильный ветер", "Strong Breeze", 3.0),
        (7, "28-33", "13.9-17.1", "Крепкий ветер", "Near Gale", 4.0),
        (8, "34-40", "17.2-20.7", "Очень крепкий ветер", "Gale", 5.5),
        (9, "41-47", "20.8-24.4", "Шторм", "Severe Gale", 7.0),
        (10, "48-55", "24.5-28.4", "Сильный шторм", "Storm", 9.0),
        (11, "56-63", "28.5-32.6", "Жестокий шторм", "Violent Storm", 11.5),
        (12, "64+", "32.7+", "Ураган", "Hurricane", 14.0),
    ]
    row_h = 34
    badge_x = 32
    text_x = 52
    wave_icon_x0, wave_icon_x1 = w - 78, w - 18
    inner = ""
    # Заголовок таблицы.
    inner += _g._text(text_x, 12, _g._l(lang, "уз / м/с", "kt / m/s"), 8, anchor="start", color="#5a6270", weight="bold")
    inner += _g._text(wave_icon_x0 - 6, 12, _g._l(lang, "выс. волны", "wave ht."), 8, anchor="start", color="#5a6270", weight="bold")
    y = 20
    for force, knots, ms, term_ru, term_en, wave_m in rows:
        term = _g._l(lang, term_ru, term_en)
        # Градиент от спокойного синего к штормовому красному по номеру балла.
        t = force / 12
        r = int(190 + t * (200 - 190))
        g = int(225 - t * (225 - 40))
        b = int(245 - t * (245 - 40))
        fill = f"#{r:02x}{g:02x}{b:02x}"
        text_color = "#111318" if force < 8 else "#ffffff"

        inner += _g._box(15, y, w - 30, row_h - 3, fill=fill, stroke="#20242b", sw=0.8, rx=3)

        badge_cy = y + (row_h - 3) / 2
        inner += f'<circle cx="{badge_x}" cy="{badge_cy}" r="12" fill="#ffffff" stroke="{text_color}" stroke-width="1.2"/>'
        inner += _g._text(badge_x, badge_cy + 4, str(force), 12, weight="bold", color="#111318")

        speed_label = _g._l(lang, f"{knots} уз  •  {ms} м/с", f"{knots} kt  •  {ms} m/s")
        inner += _g._text(text_x, y + 14, speed_label, 8.5, anchor="start", color=text_color)
        inner += _g._text(text_x, y + 27, term, 10, anchor="start", weight="bold", color=text_color)

        wave_label = (_g._l(lang, f"~{wave_m:g} м", f"~{wave_m:g} m") if wave_m else _g._l(lang, "0 м", "0 m"))
        inner += _g._text(w - 20, y + 14, wave_label, 8.5, anchor="end", color=text_color)

        # Мини-волна: амплитуда растёт с баллом (0 -> почти прямая линия, 12 -> резкая зигзаг-волна).
        amp = 1 + (force / 12) * 8
        seg = (wave_icon_x1 - wave_icon_x0) / 6
        base_y = y + row_h - 8
        points = []
        for i in range(7):
            px = wave_icon_x0 + i * seg
            py = base_y + (amp if i % 2 == 0 else -amp)
            points.append(f"{px:.1f},{py:.1f}")
        wave_color = text_color
        inner += (f'<polyline points="{" ".join(points)}" fill="none" '
                  f'stroke="{wave_color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>')

        y += row_h
    total_h = y + 8
    legend = _g._l(
        lang,
        "Шкала Бофорта: 0-12 баллов (WMO / Наставление по гидрометеонаблюдениям). "
        "Высота волны — ориентировочное «вероятное» значение для открытого моря, "
        "не точный табличный показатель.",
        "Beaufort scale: forces 0-12 (WMO). Wave height is an approximate "
        "\"probable\" value for the open sea, not a precise tabular figure.",
    )
    return _g._wrap(inner, legend, w=w, h=total_h, lang=lang)


def wind_barbs_html(lang: str = "ru") -> str:
    w, h = 300, 190
    stem_len = 55

    def _barb_shaft(cx, top_y, half=False, full=0, pennant=0, label=""):
        bottom_y = top_y + stem_len
        svg = f'<line x1="{cx}" y1="{top_y}" x2="{cx}" y2="{bottom_y}" stroke="#20242b" stroke-width="1.5"/>'
        svg += f'<circle cx="{cx}" cy="{bottom_y}" r="2.5" fill="#20242b"/>'
        y = top_y
        step = 9
        for _ in range(pennant):
            svg += (f'<polygon points="{cx},{y} {cx + 14},{y + 4} {cx},{y + 8}" '
                    f'fill="#20242b" stroke="#20242b" stroke-width="0.5"/>')
            y += step
        for _ in range(full):
            svg += f'<line x1="{cx}" y1="{y}" x2="{cx + 14}" y2="{y + 4}" stroke="#20242b" stroke-width="2"/>'
            y += step
        if half:
            svg += f'<line x1="{cx}" y1="{y}" x2="{cx + 7}" y2="{y + 2}" stroke="#20242b" stroke-width="2"/>'
        svg += _g._text(cx, bottom_y + 16, label, 9)
        return svg

    xs = [30, 100, 170, 245]
    inner = ""
    inner += f'<circle cx="{xs[0]}" cy="70" r="9" fill="none" stroke="#20242b" stroke-width="1.5"/>'
    inner += _g._text(xs[0], 101, _g._l(lang, "штиль", "calm"), 9)
    inner += _barb_shaft(xs[1], 30, half=True, label=_g._l(lang, "5 уз", "5 kt"))
    inner += _barb_shaft(xs[2], 30, full=1, label=_g._l(lang, "10 уз", "10 kt"))
    inner += _barb_shaft(xs[3], 30, pennant=1, label=_g._l(lang, "50 уз", "50 kt"))
    inner += _g._text(w / 2, 175, _g._l(lang, "Пример: перо + флажок = 55 узлов", "Example: barb + pennant = 55 knots"), 9.5, color="#3a4250")
    legend = _g._l(
        lang,
        "Ветровые перья на синоптической карте: половина пера = 5 уз, целое перо = 10 уз, флажок = 50 уз.",
        "Wind barbs on a synoptic chart: half barb = 5 kt, full barb = 10 kt, pennant = 50 kt.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


def cloud_cover_oktas_html(lang: str = "ru") -> str:
    w, h = 300, 130
    labels = ["0/8", "2/8", "4/8", "6/8", "8/8"]
    fills = [0, 2, 4, 6, 8]
    cx_positions = [40, 100, 160, 220, 270]
    inner = ""
    for cx, fraction, label in zip(cx_positions, fills, labels):
        r = 16
        inner += f'<circle cx="{cx}" cy="45" r="{r}" fill="#ffffff" stroke="#20242b" stroke-width="1.3"/>'
        if fraction > 0:
            # Простая заливка сектора по доле октантов (не точная картография станции, только для наглядности).
            angle = 360 * (fraction / 8)
            import math as _m
            large_arc = 1 if angle > 180 else 0
            rad = _m.radians(angle - 90)
            x2 = cx + r * _m.cos(rad)
            y2 = 45 + r * _m.sin(rad)
            if fraction == 8:
                inner += f'<circle cx="{cx}" cy="45" r="{r}" fill="#5a6270"/>'
            else:
                inner += (f'<path d="M {cx},45 L {cx},{45 - r} A {r},{r} 0 {large_arc},1 {x2:.1f},{y2:.1f} Z" '
                           f'fill="#5a6270"/>')
            inner += f'<circle cx="{cx}" cy="45" r="{r}" fill="none" stroke="#20242b" stroke-width="1.3"/>'
        inner += _g._text(cx, 78, label, 9.5)
    legend = _g._l(
        lang,
        "Облачность в октантах (восьмых долях неба) — стандартный элемент модели станции на карте погоды.",
        "Cloud cover in oktas (eighths of the sky) — a standard element of the station model on a weather chart.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


def weather_fronts_html(lang: str = "ru") -> str:
    w, h = 300, 175
    rows = [
        (_g._l(lang, "Холодный фронт", "Cold front"), "#2b6cb0", "triangle"),
        (_g._l(lang, "Тёплый фронт", "Warm front"), "#c0392b", "semicircle"),
        (_g._l(lang, "Окклюзия", "Occluded front"), "#7d3c98", "mixed"),
        (_g._l(lang, "Стационарный фронт", "Stationary front"), "#20242b", "alt"),
    ]
    inner = ""
    y = 22
    line_len = 90
    x0 = 25
    for label, color, kind in rows:
        line_y = y
        inner += f'<line x1="{x0}" y1="{line_y}" x2="{x0 + line_len}" y2="{line_y}" stroke="{color}" stroke-width="2"/>'
        if kind == "triangle":
            for i in range(3):
                cx = x0 + 15 + i * 25
                inner += f'<polygon points="{cx},{line_y} {cx - 6},{line_y - 8} {cx + 6},{line_y - 8}" fill="{color}"/>'
        elif kind == "semicircle":
            for i in range(3):
                cx = x0 + 15 + i * 25
                inner += f'<path d="M {cx - 6},{line_y} A 6,6 0 0,1 {cx + 6},{line_y}" fill="{color}"/>'
        elif kind == "mixed":
            for i in range(3):
                cx = x0 + 12 + i * 28
                if i % 2 == 0:
                    inner += f'<polygon points="{cx},{line_y} {cx - 6},{line_y - 8} {cx + 6},{line_y - 8}" fill="{color}"/>'
                else:
                    inner += f'<path d="M {cx - 6},{line_y} A 6,6 0 0,1 {cx + 6},{line_y}" fill="{color}"/>'
        elif kind == "alt":
            for i in range(3):
                cx = x0 + 15 + i * 25
                inner += f'<polygon points="{cx},{line_y} {cx - 6},{line_y - 8} {cx + 6},{line_y - 8}" fill="#c0392b"/>'
                inner += f'<path d="M {cx - 6},{line_y} A 6,6 0 0,0 {cx + 6},{line_y}" fill="#2b6cb0"/>'
        inner += _g._text(x0 + line_len + 10, line_y + 4, label, 10, anchor="start")
        y += 38
    legend = _g._l(
        lang,
        "Условные обозначения фронтов на синоптической карте (направление значков — куда движется фронт).",
        "Front symbols on a synoptic chart (the direction the symbols point is the direction the front is moving).",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


def pressure_systems_html(lang: str = "ru") -> str:
    w, h = 300, 190
    cx_l, cx_h = 95, 205
    cy = 90
    inner = ""
    for cx, letter, color in ((cx_l, "L", "#2b6cb0"), (cx_h, "H", "#c0392b")):
        for r in (18, 32, 46):
            inner += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#8a94a3" stroke-width="1" stroke-dasharray="3,2"/>'
        inner += _g._text(cx, cy + 6, letter, 20, weight="bold", color=color)
    # Стрелки вращения (Северное полушарие: против часовой вокруг L, по часовой вокруг H).
    inner += f'<path d="M {cx_l - 32},{cy} A 32,32 0 0,1 {cx_l},{cy - 32}" fill="none" stroke="#2b6cb0" stroke-width="1.5"/>'
    inner += f'<path d="M {cx_h + 32},{cy} A 32,32 0 0,1 {cx_h},{cy - 32}" fill="none" stroke="#c0392b" stroke-width="1.5"/>'
    inner += _g._text(cx_l, cy + 62, _g._l(lang, "циклон", "cyclone (Low)"), 9.5)
    inner += _g._text(cx_h, cy + 62, _g._l(lang, "антициклон", "anticyclone (High)"), 9.5)
    inner += _g._text(w / 2, 20, _g._l(lang, "Изобары и направление вращения ветра (Северное полушарие)",
                                        "Isobars and wind rotation direction (Northern Hemisphere)"), 9, color="#3a4250")
    legend = _g._l(
        lang,
        "L (циклон) — против часовой стрелки, H (антициклон) — по часовой (Северное полушарие; в Южном — наоборот).",
        "L (Low/cyclone) — counter-clockwise, H (High/anticyclone) — clockwise (Northern Hemisphere; reversed in the Southern Hemisphere).",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


DIAGRAMS = {
    "beaufort_scale_overview": beaufort_scale_overview_html,
    "wind_barbs": wind_barbs_html,
    "cloud_cover_oktas": cloud_cover_oktas_html,
    "weather_fronts": weather_fronts_html,
    "pressure_systems": pressure_systems_html,
}


def get_meteorology_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
