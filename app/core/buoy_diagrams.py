"""
Схематичные SVG-изображения знаков системы МАМС (IALA) — для раздела
теории. Это НЕ фотографии реальных буёв (форма/пропорции у разных
изготовителей отличаются), а условные технические схемы — раскраска,
форма корпуса и топовая фигура показаны в точном соответствии с
описанием системы, что и является главным для распознавания знака.

Технически: чистый SVG (без JavaScript, без зависимости от Streamlit,
как и app/diagrams.py) — можно использовать и в финальном PWA-интерфейсе
без переделки.
"""

_CAPTIONS = {
    "ru": "Условная техническая схема (не фотография) — раскраска, форма и топовая фигура соответствуют системе МАМС.",
    "en": "Schematic technical diagram (not a photograph) — colouring, shape and topmark match the IALA buoyage system.",
}


def _l(lang: str, ru: str, en: str) -> str:
    return en if lang == "en" else ru


CX = 70  # центр по горизонтали
WATER_Y = 186


def _wrap(svg_inner: str, legend_html: str, water: bool = True, lang: str = "ru") -> str:
    caption = _CAPTIONS.get(lang, _CAPTIONS["ru"])
    water_line = (
        f'<path d="M 0,{WATER_Y} q 10,-5 20,0 t 20,0 t 20,0 t 20,0 t 20,0 t 20,0 t 20,0 t 20,0" '
        f'fill="none" stroke="#3a7fb5" stroke-width="2" opacity="0.55"/>'
        if water else ""
    )
    return f"""
<div style="background:#eaf4fb;border-radius:8px;padding:10px;font-family:sans-serif;">
  <svg viewBox="0 0 140 220" width="100%" height="260" xmlns="http://www.w3.org/2000/svg">
    <rect width="140" height="220" fill="#eaf4fb"/>
    {svg_inner}
    {water_line}
  </svg>
  <div style="font-size:12px;margin-top:6px;line-height:1.5;text-align:center;">{legend_html}</div>
  <div style="font-size:11px;color:#667;margin-top:4px;text-align:center;">{caption}</div>
</div>
"""


def _horizontal_bands(x: float, y: float, w: float, h: float, colors: list[str]) -> str:
    n = len(colors)
    band_h = h / n
    out = ""
    for i, color in enumerate(colors):
        out += f'<rect x="{x}" y="{y + i * band_h}" width="{w}" height="{band_h}" fill="{color}" stroke="#20242b" stroke-width="0.6"/>'
    return out


def _vertical_stripes(x: float, y: float, w: float, h: float, colors: list[str]) -> str:
    n = len(colors)
    stripe_w = w / n
    out = ""
    for i, color in enumerate(colors):
        out += f'<rect x="{x + i * stripe_w}" y="{y}" width="{stripe_w}" height="{h}" fill="{color}" stroke="#20242b" stroke-width="0.6"/>'
    return out


def _mast(top_y: float, bottom_y: float) -> str:
    return f'<line x1="{CX}" y1="{bottom_y}" x2="{CX}" y2="{top_y}" stroke="#3a3f47" stroke-width="3"/>'


def _light(cy: float, colors: list[str]) -> str:
    """Кружок огня. Если цветов больше одного — половинки разного цвета (для огня, меняющего цвет)."""
    if len(colors) == 1:
        circle = f'<circle cx="{CX}" cy="{cy}" r="6" fill="{colors[0]}" stroke="#20242b" stroke-width="0.8"/>'
    else:
        circle = (
            f'<path d="M {CX-6},{cy} A 6,6 0 0 1 {CX+6},{cy} Z" fill="{colors[0]}" stroke="#20242b" stroke-width="0.6"/>'
            f'<path d="M {CX+6},{cy} A 6,6 0 0 1 {CX-6},{cy} Z" fill="{colors[1]}" stroke="#20242b" stroke-width="0.6"/>'
        )
    rays = "".join(
        f'<line x1="{CX + 9 * dx}" y1="{cy + 9 * dy}" x2="{CX + 14 * dx}" y2="{cy + 14 * dy}" stroke="#c9a227" stroke-width="1.4"/>'
        for dx, dy in [(1, 0), (-1, 0), (0.7, -0.7), (-0.7, -0.7), (0.7, 0.7), (-0.7, 0.7)]
    )
    return f'<g opacity="0.95">{rays}{circle}</g>'


def _cone(cx: float, cy: float, size: float, point_up: bool, color: str = "#111318") -> str:
    if point_up:
        pts = f"{cx-size},{cy+size*0.6} {cx+size},{cy+size*0.6} {cx},{cy-size*0.6}"
    else:
        pts = f"{cx-size},{cy-size*0.6} {cx+size},{cy-size*0.6} {cx},{cy+size*0.6}"
    return f'<polygon points="{pts}" fill="{color}" stroke="#0c0d10" stroke-width="0.8"/>'


def _cone_base(cx: float, base_y: float, half_w: float, height: float, point_up: bool, color: str = "#111318") -> str:
    """Треугольник (конус), заданный положением ПЛОСКОГО основания (base_y) —
    так проще ставить два конуса встык или с точным зазором, без арифметики
    "на глаз" через центр фигуры."""
    if point_up:
        tip_y = base_y - height
    else:
        tip_y = base_y + height
    pts = f"{cx-half_w},{base_y} {cx+half_w},{base_y} {cx},{tip_y}"
    return f'<polygon points="{pts}" fill="{color}" stroke="#0c0d10" stroke-width="0.8"/>'


def _sphere(cx: float, cy: float, r: float, color: str = "#111318") -> str:
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" stroke="#0c0d10" stroke-width="0.8"/>'


def _cross(cx: float, cy: float, size: float, color: str) -> str:
    # Тёмная подложка чуть шире основной линии — иначе жёлтый крест
    # сливается со светлым фоном схемы и плохо читается.
    return (
        f'<g stroke="#0c0d10" stroke-width="6" stroke-linecap="round">'
        f'<line x1="{cx-size}" y1="{cy-size}" x2="{cx+size}" y2="{cy+size}"/>'
        f'<line x1="{cx-size}" y1="{cy+size}" x2="{cx+size}" y2="{cy-size}"/>'
        f'</g>'
        f'<g stroke="{color}" stroke-width="3.5" stroke-linecap="round">'
        f'<line x1="{cx-size}" y1="{cy-size}" x2="{cx+size}" y2="{cy+size}"/>'
        f'<line x1="{cx-size}" y1="{cy+size}" x2="{cx+size}" y2="{cy-size}"/>'
        f'</g>'
    )


def _upright_cross(cx: float, cy: float, size: float, color: str) -> str:
    # Прямой (Георгиевский) крест — вертикальная + горизонтальная линии,
    # В ОТЛИЧИЕ от _cross() выше (диагональный Андреевский крест/salt-
    # ire, топовая фигура специального знака). Перепутать эти две формы
    # — реальная фактическая ошибка (пойдено при глобальной проверке
    # 2026-09-29): аварийный знак затонувшего судна по IALA несёт
    # именно ПРЯМОЙ крест, не диагональный.
    return (
        f'<g stroke="#0c0d10" stroke-width="6" stroke-linecap="round">'
        f'<line x1="{cx}" y1="{cy-size}" x2="{cx}" y2="{cy+size}"/>'
        f'<line x1="{cx-size}" y1="{cy}" x2="{cx+size}" y2="{cy}"/>'
        f'</g>'
        f'<g stroke="{color}" stroke-width="3.5" stroke-linecap="round">'
        f'<line x1="{cx}" y1="{cy-size}" x2="{cx}" y2="{cy+size}"/>'
        f'<line x1="{cx-size}" y1="{cy}" x2="{cx+size}" y2="{cy}"/>'
        f'</g>'
    )


def _topmark_two_cones(cx: float, base_y: float, orientation: str) -> str:
    """
    Два конуса — топовая фигура кардинального знака. base_y — уровень
    верхушки мачты (нижняя точка всей фигуры). orientation:
      'up_up'          (N) — оба конуса остриём вверх, с зазором между ними
      'down_down'      (S) — оба конуса остриём вниз, с зазором между ними
      'base_to_base'   (E) — основаниями друг к другу, силуэт — ромб
      'point_to_point' (W) — остриями друг к другу, силуэт — бокал/бабочка
    """
    half_w = 9
    h = 13
    gap = 6  # видимый зазор между двумя ОТДЕЛЬНЫМИ конусами (N/S) — иначе они сливаются в один силуэт

    if orientation == "up_up":
        # нижний конус: основание на base_y, остриём вверх (до base_y-h)
        lower = _cone_base(cx, base_y, half_w, h, True)
        # верхний конус: основание выше вершины нижнего на величину gap
        upper_base_y = base_y - h - gap
        upper = _cone_base(cx, upper_base_y, half_w, h, True)
        return lower + upper
    if orientation == "down_down":
        # верхний конус: основание у самой верхушки мачты (base_y-h-gap-h), остриём вниз
        upper_base_y = base_y - h - gap - h
        upper = _cone_base(cx, upper_base_y, half_w, h, False)
        # нижний конус: основание сразу под вершиной верхнего + зазор
        lower_base_y = upper_base_y + h + gap
        lower = _cone_base(cx, lower_base_y, half_w, h, False)
        return upper + lower
    if orientation == "base_to_base":
        # нижний конус остриём вниз (основание сверху = base_y-h), верхний остриём вверх
        # (основание снизу = base_y-h) — основания СОВПАДАЮТ по высоте -> ромб без зазора
        mid_base_y = base_y - h
        lower = _cone_base(cx, mid_base_y, half_w, h, False)
        upper = _cone_base(cx, mid_base_y, half_w, h, True)
        return lower + upper
    if orientation == "point_to_point":
        # оба острия встречаются в одной точке на середине высоты фигуры
        tip_y = base_y - h
        lower = _cone_base(cx, base_y, half_w, h, True)  # остриём вверх, острие = tip_y
        upper = _cone_base(cx, tip_y - h, half_w, h, False)  # остриём вниз, острие тоже = tip_y
        return lower + upper
    return ""


def _buoy(
    body_shape: str,
    body_fill,
    band_orientation: str,
    topmark_svg: str,
    topmark_base_y: float,
    light_colors: list[str] | None,
    light_offset: float = 28,
) -> str:
    """light_offset — расстояние от topmark_base_y (верх мачты) до центра
    огня; должно быть больше фактической высоты топовой фигуры, иначе
    кружок огня и его лучи налезут на топовую фигуру."""
    body_bottom = 178
    if body_shape == "can":
        body_top = 112
        half_w = 22
        body = f'<rect x="{CX-half_w}" y="{body_top}" width="{half_w*2}" height="{body_bottom-body_top}" rx="3" fill="none" stroke="#20242b" stroke-width="0.6"/>'
    elif body_shape == "cone":
        # конус всегда заливается одним цветом (латеральные знаки не бывают полосатыми)
        body_top = 104
        half_w = 22
        pts = f"{CX-half_w},{body_bottom} {CX+half_w},{body_bottom} {CX},{body_top}"
        body = f'<polygon points="{pts}" fill="{body_fill}" stroke="#20242b" stroke-width="0.6"/>'
        mast = _mast(topmark_base_y, body_top)
        light = _light(topmark_base_y - light_offset, light_colors) if light_colors else ""
        return body + mast + topmark_svg + light
    else:  # pillar / spar — используется для кардинальных, опасности, чистой воды, спец. и аварийного знаков
        body_top = 96
        half_w = 11
        body = f'<rect x="{CX-half_w}" y="{body_top}" width="{half_w*2}" height="{body_bottom-body_top}" fill="none" stroke="#20242b" stroke-width="0.6"/>'

    if body_shape == "can":
        if band_orientation == "vertical":
            fills = _vertical_stripes(CX - 22, body_top, 44, body_bottom - body_top, body_fill)
        elif band_orientation == "horizontal":
            fills = _horizontal_bands(CX - 22, body_top, 44, body_bottom - body_top, body_fill)
        else:
            fills = f'<rect x="{CX-22}" y="{body_top}" width="44" height="{body_bottom-body_top}" fill="{body_fill}"/>'
    else:  # pillar
        if band_orientation == "vertical":
            fills = _vertical_stripes(CX - 11, body_top, 22, body_bottom - body_top, body_fill)
        elif band_orientation == "horizontal":
            fills = _horizontal_bands(CX - 11, body_top, 22, body_bottom - body_top, body_fill)
        else:
            fills = f'<rect x="{CX-11}" y="{body_top}" width="22" height="{body_bottom-body_top}" fill="{body_fill}"/>'

    mast = _mast(topmark_base_y, body_top)
    light = _light(topmark_base_y - light_offset, light_colors) if light_colors else ""
    return fills + body + mast + topmark_svg + light


RED = "#c62828"
GREEN = "#2e7d32"
BLACK = "#111318"
YELLOW = "#f5c518"
WHITE = "#ffffff"
BLUE = "#1a56c4"


def lateral_port_a_html(lang: str = "ru") -> str:
    topmark = f'<rect x="{CX-9}" y="60" width="18" height="16" fill="{RED}" stroke="#0c0d10" stroke-width="0.8"/>'
    inner = _buoy("can", RED, "solid", topmark, 76, [RED])
    legend = (
        f'<span style="color:{RED};">■ {_l(lang, "Красный, цилиндр (can)", "Red, can-shaped")}</span> — '
        + _l(lang, "левая сторона фарватера, ", "port hand mark, ")
        + f'<b>{_l(lang, "Регион А", "Region A")}</b> '
        + _l(
            lang,
            "(Европа, Африка, Азия, Австралия). Оставлять по левому борту.",
            "(Europe, Africa, most of Asia, Australia). Leave to port.",
        )
    )
    return _wrap(inner, legend, lang=lang)


def lateral_starboard_a_html(lang: str = "ru") -> str:
    topmark = _cone(CX, 74, 10, True, GREEN)
    inner = _buoy("cone", GREEN, "solid", topmark, 76, [GREEN])
    legend = (
        f'<span style="color:{GREEN};">▲ {_l(lang, "Зелёный, конус (nun)", "Green, conical (nun)")}</span> — '
        + _l(lang, "правая сторона фарватера, ", "starboard hand mark, ")
        + f'<b>{_l(lang, "Регион А", "Region A")}</b>. '
        + _l(lang, "Оставлять по правому борту.", "Leave to starboard.")
    )
    return _wrap(inner, legend, lang=lang)


def lateral_port_b_html(lang: str = "ru") -> str:
    topmark = f'<rect x="{CX-9}" y="60" width="18" height="16" fill="{GREEN}" stroke="#0c0d10" stroke-width="0.8"/>'
    inner = _buoy("can", GREEN, "solid", topmark, 76, [GREEN])
    legend = (
        f'<span style="color:{GREEN};">■ {_l(lang, "Зелёный, цилиндр (can)", "Green, can-shaped")}</span> — '
        + _l(lang, "левая сторона фарватера, ", "port hand mark, ")
        + f'<b>{_l(lang, "Регион Б", "Region B")}</b> '
        + _l(
            lang,
            "(Америка, Япония, Корея, Филиппины). Оставлять по левому борту.",
            "(North and South America, Japan, Republic of Korea, the Philippines). Leave to port.",
        )
    )
    return _wrap(inner, legend, lang=lang)


def lateral_starboard_b_html(lang: str = "ru") -> str:
    topmark = _cone(CX, 74, 10, True, RED)
    inner = _buoy("cone", RED, "solid", topmark, 76, [RED])
    legend = (
        f'<span style="color:{RED};">▲ {_l(lang, "Красный, конус (nun)", "Red, conical (nun)")}</span> — '
        + _l(lang, "правая сторона фарватера, ", "starboard hand mark, ")
        + f'<b>{_l(lang, "Регион Б", "Region B")}</b>. '
        + _l(lang, "Оставлять по правому борту.", "Leave to starboard.")
    )
    return _wrap(inner, legend, lang=lang)


def cardinal_north_html(lang: str = "ru") -> str:
    topmark = _topmark_two_cones(CX, 62, "up_up")
    inner = _buoy("pillar", [BLACK, YELLOW], "horizontal", topmark, 62, [WHITE], light_offset=44)
    legend = f"<b>{_l(lang, 'North (Север)', 'North')}</b> — " + _l(
        lang,
        "два чёрных конуса остриём вверх. Чёрный/жёлтый. Огонь белый, непрерывный частый проблесковый. Проходить севернее знака.",
        "two black cones, both points upward. Black over yellow. Light white, continuous quick/very quick flashing. Pass to the north of the mark.",
    )
    return _wrap(inner, legend, lang=lang)


def cardinal_south_html(lang: str = "ru") -> str:
    topmark = _topmark_two_cones(CX, 62, "down_down")
    inner = _buoy("pillar", [YELLOW, BLACK], "horizontal", topmark, 62, [WHITE], light_offset=44)
    legend = f"<b>{_l(lang, 'South (Юг)', 'South')}</b> — " + _l(
        lang,
        "два чёрных конуса остриём вниз. Жёлтый/чёрный. Огонь белый, 6 частых проблесков + один длинный. Проходить южнее знака.",
        "two black cones, both points downward. Yellow over black. Light white, group of 6 quick flashes plus one long flash. Pass to the south of the mark.",
    )
    return _wrap(inner, legend, lang=lang)


def cardinal_east_html(lang: str = "ru") -> str:
    topmark = _topmark_two_cones(CX, 62, "base_to_base")
    inner = _buoy("pillar", [BLACK, YELLOW, BLACK], "horizontal", topmark, 62, [WHITE], light_offset=44)
    legend = f"<b>{_l(lang, 'East (Восток)', 'East')}</b> — " + _l(
        lang,
        "два чёрных конуса основаниями друг к другу (ромб). Чёрный/жёлтый/чёрный. Огонь белый, 3 частых проблеска. Проходить восточнее знака.",
        "two black cones base to base (diamond silhouette). Black/yellow/black. Light white, group of 3 quick flashes. Pass to the east of the mark.",
    )
    return _wrap(inner, legend, lang=lang)


def cardinal_west_html(lang: str = "ru") -> str:
    topmark = _topmark_two_cones(CX, 62, "point_to_point")
    inner = _buoy("pillar", [YELLOW, BLACK, YELLOW], "horizontal", topmark, 62, [WHITE], light_offset=44)
    legend = f"<b>{_l(lang, 'West (Запад)', 'West')}</b> — " + _l(
        lang,
        "два чёрных конуса остриями друг к другу (бокал). Жёлтый/чёрный/жёлтый. Огонь белый, 9 частых проблесков. Проходить западнее знака.",
        "two black cones point to point (wine-glass silhouette). Yellow/black/yellow. Light white, group of 9 quick flashes. Pass to the west of the mark.",
    )
    return _wrap(inner, legend, lang=lang)


def isolated_danger_html(lang: str = "ru") -> str:
    topmark = _sphere(CX, 66, 7, BLACK) + _sphere(CX, 50, 7, BLACK)
    inner = _buoy("pillar", [BLACK, RED, BLACK], "horizontal", topmark, 74, [WHITE], light_offset=44)
    legend = f"<b>{_l(lang, 'Знак отдельной опасности', 'Isolated Danger Mark')}</b> — " + _l(
        lang,
        "два чёрных шара один над другим. Чёрный с красной полосой(ами). Огонь белый, группами по 2 проблеска. Ставится прямо над опасностью.",
        "two black spheres, one above the other. Black with one or more red bands. Light white, group flashing (2). Erected directly over the danger.",
    )
    return _wrap(inner, legend, lang=lang)


def safe_water_html(lang: str = "ru") -> str:
    topmark = _sphere(CX, 68, 9, RED)
    inner = _buoy("pillar", [RED, WHITE, RED, WHITE, RED, WHITE], "vertical", topmark, 78, [WHITE])
    legend = f"<b>{_l(lang, 'Знак чистой воды', 'Safe Water Mark')}</b> — " + _l(
        lang,
        "вертикальные красные/белые полосы, топовая фигура — один красный шар. Огонь белый, длинный проблеск/изофазный/Morse «А». Вокруг — безопасная вода (например, ось фарватера).",
        "vertical red/white stripes, topmark a single red sphere. Light white, long flash/isophase/occulting/Morse \"A\". Navigable water all around (for example, the centreline of a fairway).",
    )
    return _wrap(inner, legend, lang=lang)


def special_html(lang: str = "ru") -> str:
    topmark = _cross(CX, 66, 10, YELLOW)
    inner = _buoy("pillar", [YELLOW], "solid", topmark, 76, [YELLOW])
    legend = f"<b>{_l(lang, 'Специальный знак', 'Special Mark')}</b> — " + _l(
        lang,
        "жёлтый, топовая фигура (если есть) — жёлтый крест X. Не навигационная опасность, а особый район (кабель, свалка грунта, зона учений и т.д.).",
        "yellow, topmark (if fitted) a single yellow X-shape (saltire). Not a navigational danger but a special area or feature (cable, spoil ground, exercise zone, etc.).",
    )
    return _wrap(inner, legend, lang=lang)


def emergency_wreck_html(lang: str = "ru") -> str:
    # Топовая фигура — ПРЯМОЙ (Георгиевский) крест, не диагональный
    # (см. комментарий у _upright_cross выше) — исправлено при
    # глобальной проверке 2026-09-29, была перепутана с _cross()
    # (диагональный крест специального знака).
    topmark = _upright_cross(CX, 66, 10, YELLOW)
    inner = _buoy("pillar", [BLUE, YELLOW, BLUE, YELLOW], "vertical", topmark, 76, [BLUE, YELLOW])
    legend = f"<b>{_l(lang, 'Аварийный знак затонувшего судна', 'Emergency Wreck Marking Buoy')}</b> — " + _l(
        lang,
        "чередующиеся синие/жёлтые вертикальные полосы, топовая фигура — жёлтый прямой крест (Георгиевский крест). Огонь чередующийся синий/жёлтый. Временный знак над новым, ещё не нанесённым на карту препятствием.",
        "alternating blue/yellow vertical stripes, topmark a yellow upright cross (St George's cross). Light alternating blue and yellow flashes. A temporary mark over a new obstruction not yet shown on the chart.",
    )
    return _wrap(inner, legend, lang=lang)


DIAGRAMS = {
    "lateral_port_a": lateral_port_a_html,
    "lateral_starboard_a": lateral_starboard_a_html,
    "lateral_port_b": lateral_port_b_html,
    "lateral_starboard_b": lateral_starboard_b_html,
    "cardinal_north": cardinal_north_html,
    "cardinal_south": cardinal_south_html,
    "cardinal_east": cardinal_east_html,
    "cardinal_west": cardinal_west_html,
    "isolated_danger": isolated_danger_html,
    "safe_water": safe_water_html,
    "special": special_html,
    "emergency_wreck": emergency_wreck_html,
}


def get_buoy_diagram_html(name: str, lang: str = "ru") -> str | None:
    builder = DIAGRAMS.get(name)
    return builder(lang) if builder else None
