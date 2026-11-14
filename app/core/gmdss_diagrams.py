"""
Схематичные SVG-изображения для раздела теории ГМССБ (GMDSS) — морские
районы, структура MMSI, порядок подачи/отмены сигнала бедствия по DSC,
АРБ (EPIRB), САРТ, NAVTEX, спутниковая связь.

Как и app/diagrams.py и app/buoy_diagrams.py: чистый SVG (без JavaScript,
без зависимости от Streamlit) — переносится в финальный PWA-интерфейс
без переделки. В отличие от диаграмм МАМС, здесь это не схемы предмета
для распознавания по форме/цвету, а условные функциональные схемы
(потоки действий, структуры номеров, взаимное расположение объектов) —
поэтому местами используется подписанный текст прямо внутри SVG, там,
где без него схема не читается (например цифры MMSI).
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


def _wrap(svg_inner: str, legend_html: str, w: int = 300, h: int = 170, lang: str = "ru") -> str:
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


def _box(x: float, y: float, w: float, h: float, fill: str = "#ffffff",
         stroke: str = "#20242b", sw: float = 1, rx: float = 4) -> str:
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def _text(x: float, y: float, s: str, size: float = 11, anchor: str = "middle",
          color: str = "#111318", weight: str = "normal") -> str:
    return (f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
            f'fill="{color}" font-family="sans-serif" font-weight="{weight}">{s}</text>')


def _wrap_text_lines(s: str, max_chars: int) -> list[str]:
    """Разбивает строку на несколько по словам, не длиннее max_chars символов."""
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


def _multiline_text(cx: float, y0: float, s: str, max_chars: int, size: float = 10.5,
                     line_height: float = 13, anchor: str = "middle", color: str = "#111318",
                     weight: str = "normal") -> tuple[str, int]:
    """Возвращает (svg, число строк) — многострочный центрированный текст."""
    lines = _wrap_text_lines(s, max_chars)
    svg = "".join(
        _text(cx, y0 + i * line_height, line, size, anchor, color, weight)
        for i, line in enumerate(lines)
    )
    return svg, len(lines)


def _arrow(x1: float, y1: float, x2: float, y2: float, color: str = "#20242b") -> str:
    ang = math.atan2(y2 - y1, x2 - x1)
    ah = 5
    ax1 = x2 - ah * math.cos(ang - 0.4)
    ay1 = y2 - ah * math.sin(ang - 0.4)
    ax2 = x2 - ah * math.cos(ang + 0.4)
    ay2 = y2 - ah * math.sin(ang + 0.4)
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="2"/>'
            f'<polygon points="{x2},{y2} {ax1:.1f},{ay1:.1f} {ax2:.1f},{ay2:.1f}" fill="{color}"/>')


def _satellite(cx: float, cy: float, scale: float = 1.0, color: str = "#5a6270") -> str:
    s = scale
    body = _box(cx - 6 * s, cy - 5 * s, 12 * s, 10 * s, fill="#c7cdd6", stroke=color, sw=1)
    panel1 = _box(cx - 22 * s, cy - 3 * s, 12 * s, 6 * s, fill="#3a7fb5", stroke=color, sw=0.8)
    panel2 = _box(cx + 10 * s, cy - 3 * s, 12 * s, 6 * s, fill="#3a7fb5", stroke=color, sw=0.8)
    strut1 = f'<line x1="{cx - 10 * s}" y1="{cy}" x2="{cx - 6 * s}" y2="{cy}" stroke="{color}" stroke-width="1"/>'
    strut2 = f'<line x1="{cx + 6 * s}" y1="{cy}" x2="{cx + 10 * s}" y2="{cy}" stroke="{color}" stroke-width="1"/>'
    dish = f'<circle cx="{cx}" cy="{cy - 9 * s}" r="{3 * s}" fill="none" stroke="{color}" stroke-width="1"/>'
    return body + panel1 + panel2 + strut1 + strut2 + dish


def _ship(cx: float, cy: float, scale: float = 1.0, color: str = "#20242b") -> str:
    s = scale
    hull = (f'<path d="M {cx - 16 * s},{cy} L {cx + 16 * s},{cy} L {cx + 11 * s},{cy + 7 * s} '
            f'L {cx - 11 * s},{cy + 7 * s} Z" fill="#3a4250" stroke="{color}" stroke-width="1"/>')
    deck = _box(cx - 6 * s, cy - 10 * s, 12 * s, 10 * s, fill="#5a6270", stroke=color, sw=1)
    mast = f'<line x1="{cx}" y1="{cy - 10 * s}" x2="{cx}" y2="{cy - 22 * s}" stroke="{color}" stroke-width="1.5"/>'
    return hull + deck + mast


def _antenna(cx: float, cy: float, scale: float = 1.0, color: str = "#20242b") -> str:
    s = scale
    pole = f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy - 26 * s}" stroke="{color}" stroke-width="2"/>'
    cross1 = f'<line x1="{cx - 7 * s}" y1="{cy - 20 * s}" x2="{cx + 7 * s}" y2="{cy - 20 * s}" stroke="{color}" stroke-width="1.4"/>'
    cross2 = f'<line x1="{cx - 5 * s}" y1="{cy - 14 * s}" x2="{cx + 5 * s}" y2="{cy - 14 * s}" stroke="{color}" stroke-width="1.4"/>'
    base = f'<line x1="{cx - 6 * s}" y1="{cy}" x2="{cx + 6 * s}" y2="{cy}" stroke="{color}" stroke-width="2"/>'
    return pole + cross1 + cross2 + base


def _wave_arcs(cx: float, cy: float, radii: list[float], color: str = "#c9a227",
               start_deg: float = -60, end_deg: float = 60) -> str:
    arcs = ""
    for r in radii:
        x1 = cx + r * math.sin(math.radians(start_deg))
        y1 = cy - r * math.cos(math.radians(start_deg))
        x2 = cx + r * math.sin(math.radians(end_deg))
        y2 = cy - r * math.cos(math.radians(end_deg))
        large_arc = 1 if (end_deg - start_deg) > 180 else 0
        arcs += (f'<path d="M {x1:.1f},{y1:.1f} A {r},{r} 0 {large_arc} 1 {x2:.1f},{y2:.1f}" '
                 f'fill="none" stroke="{color}" stroke-width="1.4" opacity="0.85"/>')
    return arcs


def _radar_dots_on_bearing(cx: float, cy: float, angle_deg: float, n: int = 12,
                            spacing: float = 6, r: float = 1.6, color: str = "#2e7d32") -> str:
    rad = math.radians(angle_deg)
    dx, dy = math.sin(rad), -math.cos(rad)
    dots = ""
    for i in range(1, n + 1):
        x = cx + dx * spacing * i
        y = cy + dy * spacing * i
        dots += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{color}"/>'
    return dots


# ---------------------------------------------------------------------------


def gmdss_overview_html(lang: str = "ru") -> str:
    ship = _ship(55, 120, scale=1.1)
    tower = _antenna(245, 120, scale=1.1)
    sat = _satellite(150, 40, scale=1.1)
    waves_to_shore = _wave_arcs(55, 113, [22, 34, 46], start_deg=-70, end_deg=70)
    link_sat_ship = f'<line x1="150" y1="50" x2="70" y2="100" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    link_sat_shore = f'<line x1="150" y1="50" x2="235" y2="100" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    labels = (
        _text(55, 148, _l(lang, "Судно", "Ship"), 11, weight="bold")
        + _text(245, 148, _l(lang, "Берег / MRCC", "Shore / MRCC"), 11, weight="bold")
        + _text(150, 20, _l(lang, "Спутник (Inmarsat)", "Satellite (Inmarsat)"), 10)
    )
    inner = ship + tower + sat + waves_to_shore + link_sat_ship + link_sat_shore + labels
    legend = _l(
        lang,
        "<b>ГМССБ в двух словах</b> — судно передаёт сигнал бедствия/вызов через "
        "радиоволны (DSC) и/или через спутник; сигнал автоматически доходит и до "
        "ближайших судов, и до берега/MRCC.",
        "<b>GMDSS in a nutshell</b> — a ship sends a distress alert/call over "
        "radio (DSC) and/or via satellite; the alert automatically reaches "
        "nearby ships as well as the shore/MRCC.",
    )
    return _wrap(inner, legend, lang=lang)


def sea_areas_html(lang: str = "ru") -> str:
    coast_x, coast_y = 20, 95
    coastline = f'<line x1="{coast_x}" y1="10" x2="{coast_x}" y2="180" stroke="#5a6270" stroke-width="4"/>'
    bands = ""
    radii_labels = [(35, "A1"), (65, "A2"), (100, "A3"), (140, "A4")]
    colors = ["#c8e6c9", "#dcedc8", "#fff3cd", "#f8d7da"]
    prev_r = 0
    for (r, label), color in zip(radii_labels, colors):
        arc = (f'<path d="M {coast_x},{coast_y - r} A {r},{r} 0 0 1 {coast_x},{coast_y + r}" '
               f'fill="none" stroke="{color}" stroke-width="{r - prev_r}" opacity="0.9"/>')
        bands += arc
        prev_r = r
    for r, label in radii_labels:
        bands += _text(coast_x + r - 14, coast_y - 4, label, 11, weight="bold")
    ship = _ship(coast_x + 80, coast_y + 40, scale=0.8)
    inner = bands + coastline + ship
    legend = _l(
        lang,
        "<b>A1</b> — зона VHF DSC от берега, <b>A2</b> — зона MF DSC, "
        "<b>A3</b> — зона покрытия геостационарных спутников (Inmarsat), "
        "<b>A4</b> — остальные районы (только КВ).",
        "<b>A1</b> — shore-based VHF DSC coverage, <b>A2</b> — MF DSC coverage, "
        "<b>A3</b> — geostationary satellite (Inmarsat) coverage, "
        "<b>A4</b> — all other areas (HF only).",
    )
    return _wrap(inner, legend, h=190, lang=lang)


def mmsi_structure_html(lang: str = "ru") -> str:
    digits_mid = "2 7 3"
    digits_num = "1 2 3 4 5 6"
    box1 = _box(40, 60, 70, 34, fill="#c8e6c9", stroke="#2e7d32", sw=1.5)
    box2 = _box(115, 60, 140, 34, fill="#bbdefb", stroke="#1a56c4", sw=1.5)
    t1 = _text(75, 82, digits_mid, 16, weight="bold")
    t2 = _text(185, 82, digits_num, 16, weight="bold")
    l1 = _text(75, 108, _l(lang, "MID — код страны", "MID — country code"), 10)
    l2 = _text(185, 108, _l(lang, "Порядковый номер судна", "Ship's sequential number"), 10)
    brace1 = f'<line x1="40" y1="55" x2="110" y2="55" stroke="#2e7d32" stroke-width="1.4"/>'
    brace2 = f'<line x1="115" y1="55" x2="255" y2="55" stroke="#1a56c4" stroke-width="1.4"/>'
    total = _text(150, 30, _l(lang, "Итого 9 цифр — MMSI судовой станции", "9 digits total — a ship station's MMSI"), 11, weight="bold")
    inner = box1 + box2 + t1 + t2 + l1 + l2 + brace1 + brace2 + total
    legend = _l(
        lang,
        "Пример: 273123456 — 273 (MID России) + 123456 (номер судна).",
        "Example: 273123456 — 273 (Russia's MID) + 123456 (ship's number).",
    )
    return _wrap(inner, legend, h=130, lang=lang)


def mmsi_formats_html(lang: str = "ru") -> str:
    rows = [
        ("MID XXXXXX", _l(lang, "Судовая станция", "Ship station"), "#c8e6c9"),
        ("00 MID XXXX", _l(lang, "Береговая станция", "Coast station"), "#bbdefb"),
        ("0 MID XXXXX", _l(lang, "Групповой вызов", "Group call"), "#fff3cd"),
        ("111 MID XXX", _l(lang, "SAR-авиация", "SAR aircraft"), "#ffe0b2"),
        ("99 MID XXXX", _l(lang, "AIS-знак ограждения", "AIS aid to navigation"), "#e1bee7"),
    ]
    inner = ""
    y = 25
    for pattern, label, color in rows:
        inner += _box(15, y - 14, 110, 22, fill=color, stroke="#20242b", sw=1)
        inner += _text(70, y + 1, pattern, 11, weight="bold")
        inner += _text(135, y + 1, label, 11, anchor="start")
        y += 30
    legend = _l(lang, "MID — код страны (3 цифры), X — порядковые цифры номера.",
                "MID — country code (3 digits), X — sequential digits of the number.")
    return _wrap(inner, legend, w=340, h=185, lang=lang)


def dsc_channels_html(lang: str = "ru") -> str:
    rows = [
        ("VHF DSC", _l(lang, "канал 70 (156.525 МГц)", "channel 70 (156.525 MHz)"), "#c8e6c9"),
        ("MF DSC", "2187.5 кГц" if lang != "en" else "2187.5 kHz", "#bbdefb"),
        ("HF DSC", _l(lang, "несколько частот в разных диапазонах", "several frequencies across bands"), "#fff3cd"),
    ]
    inner = ""
    y = 30
    for band, freq, color in rows:
        inner += _box(15, y - 16, 70, 26, fill=color, stroke="#20242b", sw=1)
        inner += _text(50, y, band, 11, weight="bold")
        inner += _text(95, y, freq, 11, anchor="start")
        y += 40
    note_svg, n_lines = _multiline_text(
        150, 145,
        _l(lang, "Канал DSC зарезервирован только для цифрового вызова — не для голоса.",
           "The DSC channel is reserved for digital calling only — not for voice."),
        max_chars=34, size=10,
    )
    inner += note_svg
    legend = _l(lang, "Каждый диапазон радиосвязи имеет свою выделенную частоту DSC.",
                "Each radio band has its own dedicated DSC frequency.")
    return _wrap(inner, legend, w=300, h=145 + n_lines * 13 + 10, lang=lang)


def _flow_diagram(steps: list[str], w: int = 300) -> tuple[str, int]:
    gap = 14
    box_w = w - 40
    max_chars = 34
    inner = ""
    y = 12
    for i, step in enumerate(steps):
        lines = _wrap_text_lines(step, max_chars)
        line_h = 13
        box_h = max(28, len(lines) * line_h + 14)
        inner += _box(20, y, box_w, box_h, fill="#eaf4fb" if i % 2 == 0 else "#fff3cd", stroke="#20242b", sw=1)
        text_y0 = y + box_h / 2 - (len(lines) - 1) * line_h / 2 + 3.5
        text_svg, _ = _multiline_text(w / 2, text_y0, step, max_chars, size=10.5, line_height=line_h,
                                       weight="bold" if i == 0 else "normal")
        inner += text_svg
        if i < len(steps) - 1:
            inner += _arrow(w / 2, y + box_h, w / 2, y + box_h + gap)
        y += box_h + gap
    total_h = y - gap + 12
    return inner, total_h


def distress_alert_flow_html(lang: str = "ru") -> str:
    steps = _l(
        lang,
        [
            "Удержать защищённую кнопку DISTRESS",
            "DSC-сигнал: MMSI + координаты + время → всем станциям",
            "Перейти на голосовой канал (VHF 16 / MF 2182 кГц)",
            "Передать голосом MAYDAY: название, позывной, координаты, бедствие",
        ],
        [
            "Hold down the protected DISTRESS button",
            "DSC alert: MMSI + position + time → to all stations",
            "Switch to a voice channel (VHF 16 / MF 2182 kHz)",
            "Transmit MAYDAY by voice: name, call sign, position, nature of distress",
        ],
    )
    inner, h = _flow_diagram(steps)
    legend = _l(lang, "Порядок подачи сигнала бедствия через DSC — от нажатия кнопки до голосового MAYDAY.",
                "The distress-alert procedure via DSC — from pressing the button to the voice MAYDAY.")
    return _wrap(inner, legend, w=300, h=h, lang=lang)


def false_alert_cancel_flow_html(lang: str = "ru") -> str:
    steps = _l(
        lang,
        [
            "Замечено случайное/ложное срабатывание DISTRESS",
            "Выключить/сбросить DSC-станцию, включить снова на голосовой частоте бедствия",
            "Голосом (VHF 16 или 2182 кГц): «ALL STATIONS×3… CANCEL MY DISTRESS ALERT OF [время UTC]»",
            "По возможности — дополнительно сообщить напрямую на берег/MRCC",
        ],
        [
            "An accidental/false DISTRESS activation is noticed",
            "Switch off/reset the DSC set, turn it back on on the distress voice frequency",
            "By voice (VHF 16 or 2182 kHz): “ALL STATIONS×3… CANCEL MY DISTRESS ALERT OF [UTC time]”",
            "If possible — also contact the shore/MRCC directly",
        ],
    )
    inner, h = _flow_diagram(steps)
    legend = _l(lang, "Ложную тревогу нужно отменить как можно быстрее — молчание недопустимо (ITU RR ст. 32.53A–E).",
                "A false alert must be cancelled as soon as possible — staying silent is not acceptable (ITU RR Art. 32.53A–E).")
    return _wrap(inner, legend, w=300, h=h, lang=lang)


def epirb_html(lang: str = "ru") -> str:
    buoy_body = f'<ellipse cx="150" cy="110" rx="16" ry="22" fill="#f5a623" stroke="#20242b" stroke-width="1.2"/>'
    buoy_top = f'<rect x="146" y="80" width="8" height="14" rx="2" fill="#20242b"/>'
    antenna = f'<line x1="150" y1="80" x2="150" y2="60" stroke="#20242b" stroke-width="1.6"/>'
    water = f'<path d="M 110,132 q 10,-5 20,0 t 20,0 t 20,0 t 20,0" fill="none" stroke="#3a7fb5" stroke-width="2" opacity="0.6"/>'
    sat = _satellite(150, 25, scale=1.0)
    link = f'<line x1="150" y1="35" x2="150" y2="60" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    label_sat = _text(150, 145, _l(lang, "406 МГц → спутники КОСПАС-SARSAT", "406 MHz → Cospas-Sarsat satellites"), 10, weight="bold")
    label_homing = _text(150, 160, _l(lang, "121.5 МГц — маяк наведения (homing)", "121.5 MHz — homing beacon"), 10)
    inner = water + buoy_body + buoy_top + antenna + sat + link + label_sat + label_homing
    legend = _l(lang, "АРБ всплывает автоматически (гидростатический замыкатель) или включается вручную.",
                "The EPIRB floats free automatically (hydrostatic release) or can be activated manually.")
    return _wrap(inner, legend, h=175, lang=lang)


def sart_radar_html(lang: str = "ru") -> str:
    cx, cy, r = 150, 90, 60
    screen = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#0d1b0f" stroke="#20242b" stroke-width="2"/>'
    rings = "".join(
        f'<circle cx="{cx}" cy="{cy}" r="{r * f}" fill="none" stroke="#1f5c22" stroke-width="0.8"/>'
        for f in (0.33, 0.66, 1.0)
    )
    own_ship = f'<circle cx="{cx}" cy="{cy}" r="2.5" fill="#f5c518"/>'
    bearing = 40
    sweep = (f'<line x1="{cx}" y1="{cy}" x2="{cx + r * math.sin(math.radians(bearing)):.1f}" '
             f'y2="{cy - r * math.cos(math.radians(bearing)):.1f}" stroke="#2e7d32" stroke-width="1"/>')
    dots = _radar_dots_on_bearing(cx, cy, bearing, n=12, spacing=r / 13, r=1.8, color="#ffffff")
    label = _text(cx, cy + r + 20, _l(lang, "12 точек вдоль пеленга — ответ САРТ на запрос радара",
                                       "12 dots along the bearing — the SART's reply to a radar interrogation"), 10)
    inner = screen + rings + sweep + dots + own_ship + label
    legend = _l(lang, "САРТ отвечает на облучение судовым радаром серией из 12 точек по пеленгу.",
                "A SART replies to a ship radar's interrogation with a series of 12 dots along the bearing.")
    return _wrap(inner, legend, h=190, lang=lang)


def navtex_html(lang: str = "ru") -> str:
    antenna = _antenna(60, 110, scale=1.0)
    paper = _box(150, 55, 100, 65, fill="#ffffff", stroke="#20242b", sw=1.2, rx=2)
    lines = "".join(
        f'<line x1="160" y1="{68 + i * 9}" x2="240" y2="{68 + i * 9}" stroke="#5a6270" stroke-width="1.6"/>'
        for i in range(6)
    )
    waves = _wave_arcs(60, 103, [18, 30], start_deg=10, end_deg=100)
    label = (
        _text(150, 165, _l(lang, "Береговая станция NAVTEX", "NAVTEX coast station"), 10, weight="bold")
        + _text(200, 138, _l(lang, "518 кГц (EN)", "518 kHz (EN)"), 10, weight="bold")
        + _text(200, 152, _l(lang, "490 кГц (нац.)", "490 kHz (national)"), 10, weight="bold")
    )
    inner = antenna + waves + paper + lines + label
    legend = _l(lang, "NAVTEX принимает навигационные и метео-предупреждения (МНИ) автоматическим телетайпом.",
                "NAVTEX automatically receives navigational and meteorological warnings by teleprinter.")
    return _wrap(inner, legend, w=300, h=180, lang=lang)


def inmarsat_html(lang: str = "ru") -> str:
    sat = _satellite(150, 35, scale=1.3)
    arc = f'<path d="M 40,120 A 130,130 0 0 1 260,120" fill="none" stroke="#3a7fb5" stroke-width="1.4" stroke-dasharray="4,3" opacity="0.8"/>'
    ship1 = _ship(70, 130, scale=0.9)
    ship2 = _ship(230, 130, scale=0.9)
    link1 = f'<line x1="150" y1="45" x2="80" y2="112" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    link2 = f'<line x1="150" y1="45" x2="220" y2="112" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    label_svg, n_lines = _multiline_text(
        150, 152,
        _l(lang, "Зона покрытия геостационарных спутников ≈ 70°с.ш. — 70°ю.ш. (район A3)",
           "Geostationary satellite coverage ≈ 70°N – 70°S (Sea Area A3)"),
        max_chars=34, size=10,
    )
    inner = arc + sat + link1 + link2 + ship1 + ship2 + label_svg
    legend = _l(lang, "Вне зоны Inmarsat (высокие широты, район A4) связь идёт через КВ (HF).",
                "Outside Inmarsat coverage (high latitudes, Sea Area A4), communication goes via HF.")
    return _wrap(inner, legend, w=300, h=152 + n_lines * 13 + 8, lang=lang)


DIAGRAMS = {
    "gmdss_overview": gmdss_overview_html,
    "sea_areas": sea_areas_html,
    "mmsi_structure": mmsi_structure_html,
    "mmsi_formats": mmsi_formats_html,
    "dsc_channels": dsc_channels_html,
    "distress_alert_flow": distress_alert_flow_html,
    "false_alert_cancel_flow": false_alert_cancel_flow_html,
    "epirb": epirb_html,
    "sart_radar": sart_radar_html,
    "navtex": navtex_html,
    "inmarsat": inmarsat_html,
}


def get_gmdss_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
