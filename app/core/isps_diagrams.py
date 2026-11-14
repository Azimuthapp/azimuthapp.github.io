"""
Схематичные SVG-изображения для темы «ISPS» (Кодекс по охране судов и
портовых средств) — роли CSO/SSO/PFSO, уровни охраны, оценка и план
охраны судна, свидетельство ISSC, Декларация об охране (DoS), зоны
ограниченного доступа на борту.

Как и другие модули диаграмм в app/: чистый SVG без JavaScript и без
зависимости от Streamlit — переносится в финальный PWA-интерфейс без
переделки. Переиспользует базовые SVG-хелперы из app/gmdss_diagrams.py
(_wrap/_box/_text/_flow_diagram/_ship и т.д.), чтобы не дублировать
геометрию — тот же приём, что и в остальных *_diagrams.py модулях этой
темы (distress_signals, smcp, meteorology).

Языковая инфраструктура диаграмм (v2 i18n): как и в gmdss_diagrams.py,
каждая функция-строитель схемы принимает параметр lang ("ru"/"en", по
умолчанию "ru" — для обратной совместимости со старыми вызовами
builder() без аргументов) и подставляет текст через _g._l(lang, ru, en).
Геометрия схем не зависит от языка. Английская терминология подобрана
по уже переведённому содержанию темы (data/theory/isps.en.json).
"""

from core import gmdss_diagrams as _g


def roles_triangle_html(lang: str = "ru") -> str:
    w, h = 300, 260
    cso = (150, 35)
    sso = (60, 175)
    pfso = (240, 175)
    box_w, box_h = 96, 44
    half_h = box_h / 2
    inner = ""
    # Линии связи между ролями.
    inner += f'<line x1="{cso[0]}" y1="{cso[1]+half_h}" x2="{sso[0]}" y2="{sso[1]-half_h}" stroke="#5a6270" stroke-width="1.3"/>'
    inner += f'<line x1="{cso[0]}" y1="{cso[1]+half_h}" x2="{pfso[0]}" y2="{pfso[1]-half_h}" stroke="#5a6270" stroke-width="1.3"/>'
    inner += f'<line x1="{sso[0]+36}" y1="{sso[1]}" x2="{pfso[0]-36}" y2="{pfso[1]}" stroke="#20242b" stroke-width="1.8"/>'

    def _role_box(cx, cy, code, label, fill):
        label_svg, _ = _g._multiline_text(cx, cy + 6, label, 17, size=7.3, line_height=9)
        return (_g._box(cx - box_w / 2, cy - half_h, box_w, box_h, fill=fill, stroke="#20242b", sw=1.2, rx=6)
                + _g._text(cx, cy - 7, code, 12, weight="bold")
                + label_svg)

    inner += _role_box(*cso, "CSO", _g._l(lang, "офицер охраны компании", "Company Security Officer"), "#eaf4fb")
    inner += _role_box(*sso, "SSO", _g._l(lang, "офицер охраны судна", "Ship Security Officer"), "#fff3cd")
    inner += _role_box(*pfso, "PFSO", _g._l(lang, "офицер охраны порта", "Port Facility Security Officer"), "#e8f6ec")
    text_svg, _ = _g._multiline_text(
        (sso[0] + pfso[0]) / 2, sso[1] + 46,
        _g._l(lang, "прямое взаимодействие в каждом порту", "direct interaction at every port call"),
        30, size=8.5, color="#3a4250",
    )
    inner += text_svg
    legend = _g._l(
        lang,
        "CSO задаёт политику компании; SSO и PFSO согласовывают меры охраны напрямую при каждом заходе в порт.",
        "The CSO sets company policy; the SSO and PFSO coordinate security measures directly at every port call.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


def security_levels_html(lang: str = "ru") -> str:
    w = 300
    levels = [
        (1, _g._l(lang, "Нормальный", "Normal"),
         _g._l(lang, "минимальный набор мер, действует постоянно", "minimum set of measures, always in effect"),
         "#c7e3d4"),
        (2, _g._l(lang, "Повышенный", "Heightened"),
         _g._l(lang, "усиленное патрулирование, досмотр, зоны доступа шире", "increased patrols, screening, wider restricted areas"),
         "#ffe6a8"),
        (3, _g._l(lang, "Исключительный", "Exceptional"),
         _g._l(lang, "один контролируемый вход, возможна эвакуация", "single controlled access point, evacuation possible"),
         "#f3b3ad"),
    ]
    row_h = 62
    inner = ""
    y = 10
    for level, term, desc, fill in levels:
        inner += _g._box(15, y, w - 30, row_h - 6, fill=fill, stroke="#20242b", sw=1, rx=5)
        inner += f'<circle cx="40" cy="{y + (row_h - 6) / 2}" r="14" fill="#ffffff" stroke="#20242b" stroke-width="1.2"/>'
        inner += _g._text(40, y + (row_h - 6) / 2 + 5, str(level), 14, weight="bold")
        text_svg, n = _g._multiline_text(w / 2 + 20, y + 20, desc, 30, size=8.5, line_height=11)
        inner += _g._text(w / 2 + 20, y + 14, term, 10.5, weight="bold")
        inner += text_svg
        if level < 3:
            inner += _g._arrow(w / 2, y + row_h - 6, w / 2, y + row_h + 4)
        y += row_h
    total_h = y + 6
    legend = _g._l(
        lang,
        "Каждый следующий уровень добавляет меры к предыдущему; понижать уровень самостоятельно экипаж не вправе.",
        "Each successive level adds measures to the previous one; the crew has no authority to lower the level on its own.",
    )
    return _g._wrap(inner, legend, w=w, h=total_h, lang=lang)


def ssa_ssp_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Оценка охраны судна (SSA): угрозы, уязвимости, ключевые объекты",
            "На основе SSA составляется План охраны судна (SSP)",
            "SSP утверждает администрация флага (или RSO от её имени)",
            "SSP — конфиденциальный рабочий документ на борту",
        ],
        [
            "Ship Security Assessment (SSA): threats, vulnerabilities, key assets",
            "The Ship Security Plan (SSP) is drawn up based on the SSA",
            "The SSP is approved by the flag Administration (or an RSO on its behalf)",
            "The SSP is a confidential working document kept on board",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "Без актуальной SSA утверждённый SSP не опирается на реальные риски конкретного судна.",
        "Without a current SSA, an approved SSP is not based on the real risks of that particular ship.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def issc_timeline_html(lang: str = "ru") -> str:
    w, h = 300, 215
    axis_y = 90
    x0, x1 = 25, 275
    inner = f'<line x1="{x0}" y1="{axis_y}" x2="{x1}" y2="{axis_y}" stroke="#20242b" stroke-width="1.5"/>'
    points = [
        (x0, _g._l(lang, "Выдача ISSC", "ISSC issued"), "0"),
        (x0 + (x1 - x0) * 0.45, _g._l(lang, "Промежуточное освидетельствование", "Intermediate verification"), _g._l(lang, "2-3 г.", "2-3 yr")),
        (x1, _g._l(lang, "Срок истекает", "Expires"), _g._l(lang, "5 лет", "5 years")),
    ]
    for x, label, year in points:
        inner += f'<line x1="{x}" y1="{axis_y-6}" x2="{x}" y2="{axis_y+6}" stroke="#20242b" stroke-width="1.5"/>'
        text_svg, _ = _g._multiline_text(x, axis_y - 22, label, 14, size=8, line_height=10)
        inner += text_svg
        inner += _g._text(x, axis_y + 22, year, 9, weight="bold", color="#2b6cb0")
    caption_svg, n_lines = _g._multiline_text(
        w / 2, axis_y + 45,
        _g._l(lang, "Максимум 5 лет; промежуточное освидетельствование обязательно",
              "Maximum 5 years; an intermediate verification is mandatory"),
        34, size=8.5, color="#3a4250",
    )
    inner += caption_svg
    box_y = axis_y + 45 + n_lines * 13 + 8
    inner += _g._box(40, box_y, 220, 32, fill="#fff3cd", stroke="#20242b", sw=1, rx=5)
    inner += _g._text(w / 2, box_y + 14, _g._l(lang, "Временное свидетельство:", "Interim certificate:"), 8.5, weight="bold")
    inner += _g._text(w / 2, box_y + 26, _g._l(lang, "до 6 мес, без продления", "up to 6 months, not renewable"), 8.5, weight="bold")
    legend = _g._l(
        lang,
        "ISSC выдаётся администрацией флага (или RSO) на срок не более 5 лет с промежуточной проверкой.",
        "The ISSC is issued by the flag Administration (or an RSO) for a period not exceeding 5 years, with an intermediate verification.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


def dos_flow_html(lang: str = "ru") -> str:
    steps = _g._l(
        lang,
        [
            "Судно на более высоком уровне охраны, чем порт/партнёр — или инцидент/угроза",
            "SSO (или PFSO) инициирует Декларацию об охране (DoS)",
            "Согласовываются меры охраны каждой стороны на время взаимодействия",
            "Подписи: капитан/SSO судна + PFSO портового средства, с датой",
        ],
        [
            "Ship at a higher security level than the port/partner — or an incident/threat",
            "The SSO (or PFSO) initiates a Declaration of Security (DoS)",
            "The security measures each party will apply during the interface are agreed",
            "Signatures: ship's master/SSO + PFSO of the port facility, with the date",
        ],
    )
    inner, h = _g._flow_diagram(steps)
    legend = _g._l(
        lang,
        "DoS фиксирует письменно, кто из двух сторон обеспечивает какие меры охраны.",
        "The DoS records in writing which security measures each of the two parties will provide.",
    )
    return _g._wrap(inner, legend, w=300, h=h, lang=lang)


def restricted_areas_html(lang: str = "ru") -> str:
    w, h = 300, 200
    hull = (f'<path d="M 30,120 L 270,120 L 250,150 L 50,150 Z" fill="#eef2f5" stroke="#20242b" stroke-width="1.3"/>')
    deck = f'<rect x="34" y="64" width="232" height="54" fill="#ffffff" stroke="#20242b" stroke-width="1.2"/>'
    inner = hull + deck

    def _zone(x, y, w_, h_, label):
        label_svg, _ = _g._multiline_text(x + w_ / 2, y + h_ / 2 + 3, label, 18, size=7.5, line_height=9, weight="bold")
        return _g._box(x, y, w_, h_, fill="#f3b3ad", stroke="#c0392b", sw=1, rx=3) + label_svg

    # Сетка 2×2 внутри палубной надстройки — достаточно ширины (104px на
    # зону) под самые длинные английские подписи ("Dangerous cargo"),
    # без переполнения бокса.
    inner += _zone(38, 68, 104, 22, _g._l(lang, "Мостик", "Bridge"))
    inner += _zone(158, 68, 104, 22, _g._l(lang, "Радио", "Radio"))
    inner += _zone(38, 94, 104, 22, _g._l(lang, "МО", "Engine room"))
    inner += _zone(158, 94, 104, 22, _g._l(lang, "Груз. опасн.", "Dangerous cargo"))
    inner += _g._text(150, 20, _g._l(lang, "Зоны ограниченного доступа (restricted areas)", "Restricted areas"), 9.5, weight="bold")
    inner += f'<circle cx="150" cy="135" r="6" fill="#2b6cb0"/>'
    inner += _g._text(150, 170, _g._l(lang, "Трап — контролируемая точка входа", "Gangway — controlled access point"), 9)
    inner += f'<line x1="150" y1="141" x2="150" y2="158" stroke="#2b6cb0" stroke-width="1.3" stroke-dasharray="3,2"/>'
    legend = _g._l(
        lang,
        "Доступ в закрашенные зоны — только для уполномоченных лиц; на уровне 2-3 зоны расширяются.",
        "Access to the highlighted areas is restricted to authorized persons only; at levels 2-3 the areas are extended.",
    )
    return _g._wrap(inner, legend, w=w, h=h, lang=lang)


DIAGRAMS = {
    "isps_roles_triangle": roles_triangle_html,
    "isps_security_levels": security_levels_html,
    "isps_ssa_ssp_flow": ssa_ssp_flow_html,
    "isps_issc_timeline": issc_timeline_html,
    "isps_dos_flow": dos_flow_html,
    "isps_restricted_areas": restricted_areas_html,
}


def get_isps_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
