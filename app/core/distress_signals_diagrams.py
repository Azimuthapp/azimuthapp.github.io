"""
Схематичные SVG-изображения для темы «Сигналы бедствия» — подача и
отмена сигнала бедствия на устройствах, ещё не охваченных диаграммами
в app/gmdss_diagrams.py (Inmarsat-C, ПВ/КВ голосом, отдельная процедура
выключения АРБ), плюс сравнение широковещательных и точечных систем.

Часть диаграмм этой темы (VHF DSC подача/отмена, работа АРБ, общая
схема ГМССБ) НЕ дублируется — тема ссылается на уже существующие
диаграммы app/gmdss_diagrams.py по тем же именам ("distress_alert_flow",
"false_alert_cancel_flow", "epirb", "gmdss_overview"); поиск диаграммы
в app/main.py проверяет несколько модулей по очереди, так что повторно
объявлять их здесь не нужно.

Переиспользует базовые SVG-хелперы из app/gmdss_diagrams.py, чтобы не
дублировать геометрию (_wrap/_text/_flow_diagram/_satellite и т.д.).
"""

# Модуль лежит рядом, в app/ (не пакет) — обычный import и обращение
# через префикс, чтобы переиспользовать _wrap/_text/_flow_diagram и т.д.,
# не дублируя их геометрию.
from core import gmdss_diagrams as _g


def mf_hf_voice_distress_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Удержать кнопку DISTRESS (DSC на 2187.5 кГц ПВ или частоте КВ)",
            "DSC-сигнал: MMSI + координаты + время → в зоне действия частоты",
            "Перейти на голосовую частоту бедствия (2182 кГц ПВ / парная частота КВ)",
            "Передать голосом MAYDAY: название, позывной, координаты, бедствие",
        ],
        [
            "Hold down the DISTRESS button (DSC on 2187.5 kHz MF or an HF frequency)",
            "DSC alert: MMSI + position + time → within the frequency's range",
            "Switch to the distress voice frequency (2182 kHz MF / paired HF frequency)",
            "Transmit MAYDAY by voice: name, call sign, position, nature of distress",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "ПВ/КВ: тот же принцип, что и на УКВ — DSC-сигнал, затем голосовой MAYDAY на парной частоте.",
        "MF/HF: the same principle as VHF — a DSC alert, then a voice MAYDAY on the paired frequency.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def inmarsat_c_distress_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Удержать защищённую кнопку DISTRESS на терминале Inmarsat-C",
            "Выбрать характер бедствия из меню (или без выбора — «неопределённое»)",
            "Сигнал уходит через спутник на LES/CES с наивысшим приоритетом",
            "LES передаёт сигнал в координирующий RCC — НЕ широковещательно",
        ],
        [
            "Hold down the protected DISTRESS button on the Inmarsat-C terminal",
            "Select the nature of distress from the menu (or leave it — \"undesignated\")",
            "The alert goes via satellite to the LES/CES with the highest priority",
            "The LES forwards the alert to the coordinating RCC — NOT broadcast",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "В отличие от VHF/MF/HF DSC, сигнал Inmarsat-C адресован одному RCC, а не всем судам вокруг.",
        "Unlike VHF/MF/HF DSC, an Inmarsat-C alert is addressed to a single RCC, not to all ships nearby.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def inmarsat_c_cancel_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Замечено случайное/ложное срабатывание кнопки DISTRESS",
            "Широковещательной отмены нет — нужен прямой контакт с RCC/LES",
            "Связаться с координирующим RCC любым доступным способом",
            "Сообщить: MMSI, время сигнала, координаты, «тревога ложная»",
        ],
        [
            "An accidental/false activation of the DISTRESS button is noticed",
            "There is no broadcast cancellation — direct contact with the RCC/LES is required",
            "Contact the coordinating RCC by any available means",
            "Report: MMSI, time of the alert, position, \"alert is false\"",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "Отменять нужно точечно — тому же RCC, куда пришёл сигнал, а не эфирным объявлением.",
        "Cancellation must be point-to-point — to the same RCC that received the alert, not by an over-the-air announcement.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def epirb_deactivate_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Замечено случайное включение АРБ (EPIRB)",
            "Сразу связаться с ближайшим MRCC любым доступным каналом связи",
            "Выключить буй (переключатель OFF / инструкция модели)",
            "Сообщить MRCC: HEX ID буя, время включения/выключения, координаты",
        ],
        [
            "An accidental activation of the EPIRB is noticed",
            "Immediately contact the nearest MRCC by any available means of communication",
            "Switch off the beacon (OFF switch / model-specific instructions)",
            "Report to the MRCC: the beacon's HEX ID, activation/deactivation time, position",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "Официальная рекомендация NAVCEN: сначала связаться с MRCC — само по себе выключение буя тревогу в системе не отменяет.",
        "Official NAVCEN guidance: contact the MRCC first — switching off the beacon by itself does not cancel the alert in the system.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def broadcast_vs_point_to_point_html(lang: str = "ru") -> str:
    w, h = 300, 210
    col1_x, col2_x = 90, 225
    header = (
        _g._text(col1_x, 22, _g._l(lang, "Широковещательные", "Broadcast"), 10.5, weight="bold")
        + _g._text(col1_x, 36, "(VHF / MF / HF DSC)", 10)
        + _g._text(col2_x, 22, _g._l(lang, "Точечные", "Point-to-point"), 10.5, weight="bold")
        + _g._text(col2_x, 36, "(Inmarsat-C / EPIRB)", 10)
    )
    ship = _g._ship(col1_x, 90, scale=1.0)
    waves = _g._wave_arcs(col1_x, 83, [22, 34, 46], start_deg=-150, end_deg=150)
    many = (
        _g._ship(col1_x - 55, 60, scale=0.55)
        + _g._ship(col1_x + 55, 60, scale=0.55)
        + _g._antenna(col1_x, 140, scale=0.8)
    )
    left = waves + many + ship + _g._text(col1_x, 168, _g._l(lang, "слышат ВСЕ рядом", "heard by ALL nearby"), 9.5)

    ship2 = _g._ship(col2_x, 100, scale=1.0)
    sat = _g._satellite(col2_x, 55, scale=0.9)
    link = f'<line x1="{col2_x}" y1="63" x2="{col2_x}" y2="88" stroke="#c9a227" stroke-width="1.4" stroke-dasharray="3,3"/>'
    rcc = _g._text(col2_x, 168, _g._l(lang, "приходит только в 1 RCC", "reaches only 1 RCC"), 9.5)
    right = sat + link + ship2 + rcc

    divider = f'<line x1="{w/2}" y1="45" x2="{w/2}" y2="185" stroke="#c7cdd6" stroke-width="1" stroke-dasharray="2,3"/>'
    inner = header + left + right + divider
    legend = _g._l(
        lang,
        "Поэтому и порядок отмены разный: широковещательным сигналам — объявление в эфир, точечным — прямой контакт с получателем.",
        "That is also why cancellation differs: broadcast alerts are cancelled by an over-the-air announcement, point-to-point ones by direct contact with the recipient.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


DIAGRAMS = {
    "mf_hf_voice_distress_flow": mf_hf_voice_distress_flow_html,
    "inmarsat_c_distress_flow": inmarsat_c_distress_flow_html,
    "inmarsat_c_cancel_flow": inmarsat_c_cancel_flow_html,
    "epirb_deactivate_flow": epirb_deactivate_flow_html,
    "broadcast_vs_point_to_point": broadcast_vs_point_to_point_html,
}


def get_distress_signals_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
