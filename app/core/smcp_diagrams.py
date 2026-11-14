"""
Схематичные SVG-изображения для темы «SMCP» (Standard Marine Communication
Phrases) — маркеры сообщений, команды на руль и в машину, схема связи с
СУДС (VTS), радиотелефонный алфавит.

Как и другие модули диаграмм в app/: чистый SVG без JavaScript и без
зависимости от Streamlit — переносится в финальный PWA-интерфейс без
переделки. Переиспользует базовые SVG-хелперы из app/gmdss_diagrams.py
(_wrap/_box/_text/_flow_diagram/_multiline_text/_arrow/_ship и т.д.),
чтобы не дублировать геометрию — тот же приём, что и в
app/distress_signals_diagrams.py.
"""

from core import gmdss_diagrams as _g


def message_markers_html(lang: str = "ru") -> str:
    w = 300
    markers = [
        ("INSTRUCTION", _g._l(lang, "обязательное указание", "a mandatory instruction")),
        ("ADVICE", _g._l(lang, "рекомендация — решение за адресатом", "a recommendation — the decision is the addressee's")),
        ("WARNING", _g._l(lang, "предупреждение об опасности", "a warning of danger")),
        ("INFORMATION", _g._l(lang, "констатация факта", "a statement of fact")),
        ("QUESTION", _g._l(lang, "вопрос", "a question")),
        ("ANSWER", _g._l(lang, "ответ на вопрос", "an answer to a question")),
        ("REQUEST", _g._l(lang, "просьба (не о манёвре)", "a request (not for a manoeuvre)")),
        ("INTENTION", _g._l(lang, "объявление о своём манёвре", "a statement of one's own manoeuvre")),
    ]
    box_h, gap = 30, 6
    inner = ""
    y = 10
    for marker, desc in markers:
        inner += _g._box(15, y, w - 30, box_h, fill="#eaf4fb", stroke="#20242b", sw=1)
        inner += _g._text(w / 2, y + 13, marker, 11.5, weight="bold")
        inner += _g._text(w / 2, y + 25, desc, 9.5, color="#3a4250")
        y += box_h + gap
    total_h = y - gap + 10
    legend = _g._l(
        lang,
        "8 маркеров SMCP ставятся перед фразой, чтобы сразу было понятно, как на неё реагировать.",
        "The 8 SMCP message markers are placed before a phrase so it is immediately clear how to respond to it.",
    )
    return _g._wrap(inner, legend, w=w, h=total_h, lang=lang)


def phonetic_alphabet_html(lang: str = "ru") -> str:
    w = 300
    letters = [
        ("A", "Alfa"), ("B", "Bravo"), ("C", "Charlie"), ("D", "Delta"),
        ("E", "Echo"), ("F", "Foxtrot"), ("G", "Golf"), ("H", "Hotel"),
        ("I", "India"), ("J", "Juliett"), ("K", "Kilo"), ("L", "Lima"),
        ("M", "Mike"), ("N", "November"), ("O", "Oscar"), ("P", "Papa"),
        ("Q", "Quebec"), ("R", "Romeo"), ("S", "Sierra"), ("T", "Tango"),
        ("U", "Uniform"), ("V", "Victor"), ("W", "Whiskey"), ("X", "X-ray"),
        ("Y", "Yankee"), ("Z", "Zulu"),
    ]
    cols, rows = 4, 7
    cell_w, cell_h = (w - 20) / cols, 24
    inner = ""
    for idx, (letter, word) in enumerate(letters):
        col, row = idx % cols, idx // cols
        cx = 10 + col * cell_w + cell_w / 2
        cy = 14 + row * cell_h
        inner += _g._text(cx, cy, f"{letter} — {word}", 9.5)
    total_h = 14 + rows * cell_h + 6
    legend = _g._l(
        lang,
        "Радиотелефонный алфавит ИКАО/ИМО — по буквам передают позывные, названия, MMSI.",
        "The ICAO/IMO radiotelephony alphabet — used to spell out call signs, names, MMSI numbers.",
    )
    return _g._wrap(inner, legend, w=w, h=total_h, lang=lang)


def wheel_order_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Вахтенный помощник отдаёт команду на руль голосом",
            "Рулевой ПОВТОРЯЕТ команду вслух дословно",
            "Рулевой ИСПОЛНЯЕТ команду (перекладывает руль)",
            "Рулевой докладывает об исполнении («Руль право 10» и т.п.)",
        ],
        [
            "The OOW gives a wheel order verbally",
            "The helmsman REPEATS the order aloud, word for word",
            "The helmsman EXECUTES the order (puts the rudder over)",
            "The helmsman reports the order carried out (\"Ten degrees to starboard\" etc.)",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "Обязательное правило SMCP: команда всегда повторяется вслух, прежде чем её выполнят.",
        "A mandatory SMCP rule: an order is always repeated aloud before it is carried out.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def engine_order_scale_html(lang: str = "ru") -> str:
    w = 300
    orders = [
        "Full Ahead", "Half Ahead", "Slow Ahead", "Dead Slow Ahead",
        "STOP", "Dead Slow Astern", "Slow Astern", "Half Astern", "Full Astern",
    ]
    box_h, gap = 22, 5
    inner = ""
    y = 10
    for i, order in enumerate(orders):
        fill = "#fff3cd" if order == "STOP" else ("#eaf4fb" if "Ahead" in order else "#fde8e8")
        inner += _g._box(60, y, w - 120, box_h, fill=fill, stroke="#20242b", sw=1)
        inner += _g._text(w / 2, y + 15, order, 10, weight="bold" if order == "STOP" else "normal")
        y += box_h + gap
    total_h = y - gap + 10
    legend = _g._l(
        lang,
        "Шкала команд машинного телеграфа — от полного вперёд до полного назад, STOP посередине.",
        "The engine telegraph order scale — from full ahead to full astern, with STOP in the middle.",
    )
    return _g._wrap(inner, legend, w=w, h=total_h, lang=lang)


def vts_communication_html(lang: str = "ru") -> str:
    w, h = 300, 190
    vts_x, vts_y = w / 2, 45
    ship1 = _g._ship(70, 140, scale=0.9)
    ship2 = _g._ship(230, 140, scale=0.9)
    vts_box = _g._box(vts_x - 45, vts_y - 18, 90, 30, fill="#c7cdd6", stroke="#20242b", sw=1.2)
    vts_label = _g._text(vts_x, vts_y, _g._l(lang, "СУДС / VTS", "VTS"), 11, weight="bold")
    link1 = _g._arrow(vts_x - 40, vts_y + 15, 78, 128)
    link2 = _g._arrow(vts_x + 40, vts_y + 15, 222, 128)
    label1 = _g._text(70, 168, _g._l(lang, "судно 1", "ship 1"), 9.5)
    label2 = _g._text(230, 168, _g._l(lang, "судно 2", "ship 2"), 9.5)
    inner = vts_box + vts_label + link1 + link2 + ship1 + ship2 + label1 + label2
    legend = _g._l(
        lang,
        "СУДС видит и координирует несколько судов сразу — в отличие от связи «судно-судно» напрямую.",
        "VTS sees and coordinates several ships at once — unlike direct ship-to-ship communication.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


DIAGRAMS = {
    "message_markers": message_markers_html,
    "phonetic_alphabet": phonetic_alphabet_html,
    "wheel_order_flow": wheel_order_flow_html,
    "engine_order_scale": engine_order_scale_html,
    "vts_communication": vts_communication_html,
}


def get_smcp_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
