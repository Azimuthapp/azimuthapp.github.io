"""
Расчёт дистанции и курса между двумя точками (широта/долгота):
ортодромия (great circle) и локсодромия (rhumb line).

Источники формул: стандартные формулы сферической навигации
(haversine — для ортодромии; меркаторское плавание — для локсодромии),
общепринятые в штурманской практике и учебниках навигации (например,
"Навигация и лоция"; Bowditch, American Practical Navigator, гл. 24).
Земля принята шаром, у которого 1 морская миля = 1′ дуги меридиана
(R = 10800/π ≈ 3437.747 мили) — так считают в учебниках навигации и при
счислении (Bowditch, гл. 24); сжатие Земли не учитывается (расхождение
с эллипсоидом WGS-84 — до ~0,5 %);
для точных расчётов дальнего плавания использовать судовые навигационные
системы/электронные карты.

Единицы: широта/долгота — градусы (N/S и E/W задаются знаком: N/E — "+",
S/W — "-"), расстояние — морские мили, курс — градусы (0-360, истинный).
"""

import math
from dataclasses import dataclass, field

EARTH_RADIUS_NM = 10800 / math.pi  # ≈ 3437.747: 1 миля = 1′ дуги меридиана (Bowditch, гл. 24)


def _check_lat(*lats: float):
    """Широта точки должна быть в пределах −90…+90° (полюс для курса/локсодромии не допускается)."""
    for lat in lats:
        if not (-90.0 <= float(lat) <= 90.0):
            raise ValueError("err.sailing.bad_latitude")


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class SailingResult:
    distance_nm: float
    course_deg: float
    steps: list[CalculationStep] = field(default_factory=list)


def _normalize_course(deg: float) -> float:
    return deg % 360.0


def great_circle(lat1: float, lon1: float, lat2: float, lon2: float) -> SailingResult:
    """
    Ортодромия — кратчайшее расстояние по дуге большого круга и начальный
    истинный курс (haversine formula).

    lat1, lon1 — координаты точки отхода, градусы (N/E = "+", S/W = "-")
    lat2, lon2 — координаты точки прихода, градусы

    Формулы:
      a = sin²(Δφ/2) + cos φ1 × cos φ2 × sin²(Δλ/2)
      c = 2 × atan2(√a, √(1-a))
      Дистанция = R × c
      Начальный курс = atan2(sin Δλ × cos φ2, cos φ1 × sin φ2 - sin φ1 × cos φ2 × cos Δλ)
    """
    _check_lat(lat1, lat2)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = EARTH_RADIUS_NM * c

    y = math.sin(d_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda)
    initial_course = _normalize_course(math.degrees(math.atan2(y, x)))

    steps = [
        CalculationStep(
            description="Центральный угол между точками (haversine)",
            formula="a = sin²(Δφ/2) + cosφ1·cosφ2·sin²(Δλ/2); c = 2·atan2(√a, √(1-a))",
            substitution=f"Δφ={lat2-lat1:.4f}°, Δλ={lon2-lon1:.4f}°",
            result=f"c = {math.degrees(c):.4f}°",
        ),
        CalculationStep(
            description="Дистанция по дуге большого круга",
            formula="Дистанция = R × c (R = 10800/π ≈ 3437.75 мили, 1′ = 1 миля)",
            substitution=f"Дистанция = {EARTH_RADIUS_NM:.3f} × {c:.6f} рад",
            result=f"Дистанция = {distance:.1f} миль",
        ),
        CalculationStep(
            description="Начальный истинный курс ортодромии",
            formula="ПУ = atan2(sinΔλ·cosφ2, cosφ1·sinφ2 - sinφ1·cosφ2·cosΔλ)",
            substitution=f"ПУ = atan2({y:.4f}, {x:.4f})",
            result=f"ПУ = {initial_course:.1f}°",
        ),
    ]
    return SailingResult(distance_nm=distance, course_deg=initial_course, steps=steps)


def rhumb_line(lat1: float, lon1: float, lat2: float, lon2: float) -> SailingResult:
    """
    Локсодромия — линия постоянного курса (меркаторское плавание).
    Курс постоянен на всём переходе (в отличие от ортодромии).

    lat1, lon1 — координаты точки отхода, градусы
    lat2, lon2 — координаты точки прихода, градусы

    Формулы (меркаторское плавание):
      Δψ = ln(tan(π/4 + φ2/2) / tan(π/4 + φ1/2))  — разность мерид. частей
      ПУ = atan2(Δλ, Δψ)
      q = Δφ / Δψ  (если Δψ ≈ 0 — курс East/West, q = cosφ1)
      Дистанция = √(Δφ² + q²·Δλ²) × R
    """
    _check_lat(lat1, lat2)
    if abs(lat1) >= 90.0 or abs(lat2) >= 90.0:
        raise ValueError("err.sailing.pole_rhumb")
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lon2 - lon1)
    # кратчайший путь по долготе (не более 180° в любую сторону)
    if abs(d_lambda) > math.pi:
        d_lambda = d_lambda - math.copysign(2 * math.pi, d_lambda)

    d_psi = math.log(math.tan(math.pi / 4 + phi2 / 2) / math.tan(math.pi / 4 + phi1 / 2))

    if abs(d_psi) > 1e-12:
        q = d_phi / d_psi
        course = math.degrees(math.atan2(d_lambda, d_psi))
    else:
        q = math.cos(phi1)
        course = 90.0 if d_lambda > 0 else 270.0
    course = _normalize_course(course)

    distance = math.sqrt(d_phi ** 2 + (q ** 2) * (d_lambda ** 2)) * EARTH_RADIUS_NM

    steps = [
        CalculationStep(
            description="Разность меридиональных частей (изометрическая широта)",
            formula="Δψ = ln(tan(π/4 + φ2/2) / tan(π/4 + φ1/2))",
            substitution=f"φ1={lat1:.4f}°, φ2={lat2:.4f}°",
            result=f"Δψ = {d_psi:.6f} рад",
        ),
        CalculationStep(
            description="Постоянный курс локсодромии",
            formula="ПУ = atan2(Δλ, Δψ)",
            substitution=f"ПУ = atan2({math.degrees(d_lambda):.4f}°, Δψ)",
            result=f"ПУ = {course:.1f}°",
        ),
        CalculationStep(
            description="Дистанция по локсодромии",
            formula="Дистанция = √(Δφ² + q²·Δλ²) × R,  q = Δφ/Δψ",
            substitution=f"q = {q:.6f}",
            result=f"Дистанция = {distance:.1f} миль",
        ),
    ]
    return SailingResult(distance_nm=distance, course_deg=course, steps=steps)


@dataclass
class PositionResult:
    lat: float
    lon: float
    steps: list[CalculationStep] = field(default_factory=list)


def _normalize_lon(lon: float) -> float:
    return ((lon + 180.0) % 360.0) - 180.0


def dead_reckoning_position(lat1: float, lon1: float, course_deg: float, distance_nm: float) -> PositionResult:
    """
    Счисление места — прямая задача плавания (меркаторское/локсодромическое
    счисление): точка отхода + постоянный курс + пройденное расстояние ->
    точка прихода. Обратная по отношению к rhumb_line() задача (там: две
    точки -> курс и дистанция; здесь: точка, курс, дистанция -> вторая точка).

    lat1, lon1 — координаты точки отхода, градусы
    course_deg — истинный курс (постоянный на переходе), градусы (0-360)
    distance_nm — пройденное расстояние по курсу, морские мили

    Формулы (меркаторское плавание, обращение формул rhumb_line()):
      Δφ = (S/R) × cos(ПУ)                          — приращение широты
      φ2 = φ1 + Δφ
      Δψ = ln(tan(π/4+φ2/2) / tan(π/4+φ1/2))         — разность мерид. частей
      Δλ = Δψ × tg(ПУ)     — общий случай
      Δλ = (S/R) / cos(φ1), со знаком по курсу — частный случай ПУ≈90°/270°
           (чистый Ost/Vest, где Δψ→0 и общая формула вырождена)
    """
    _check_lat(lat1)
    if abs(lat1) >= 90.0:
        raise ValueError("err.sailing.pole_rhumb")
    if distance_nm < 0:
        raise ValueError("err.sailing.negative_distance")
    phi1 = math.radians(lat1)
    course_rad = math.radians(course_deg)
    cos_course = math.cos(course_rad)

    d_phi = (distance_nm / EARTH_RADIUS_NM) * cos_course
    lat2 = lat1 + math.degrees(d_phi)
    if abs(lat2) >= 90.0:
        # локсодромия не может пройти через полюс — путь короче/другим способом
        raise ValueError("err.sailing.pole_crossing")
    phi2 = math.radians(lat2)

    pure_ew = abs(cos_course) < 1e-9
    if not pure_ew:
        d_psi = math.log(math.tan(math.pi / 4 + phi2 / 2) / math.tan(math.pi / 4 + phi1 / 2))
        d_lambda = d_psi * math.tan(course_rad)
        d_lambda_formula = "Δλ = Δψ × tg(ПУ)"
        d_lambda_substitution = f"Δλ = {d_psi:.6f} × tg({course_deg:.1f}°)"
    else:
        d_lambda = (distance_nm / EARTH_RADIUS_NM) / math.cos(phi1)
        if math.sin(course_rad) < 0:
            d_lambda = -d_lambda
        d_lambda_formula = "Δλ = (S/R) / cos(φ1), знак по курсу (Ost/Vest)"
        d_lambda_substitution = f"Δλ = ({distance_nm:.2f}/{EARTH_RADIUS_NM:.1f}) / cos({lat1:.4f}°)"

    lon2 = _normalize_lon(lon1 + math.degrees(d_lambda))

    steps = [
        CalculationStep(
            description="Приращение широты",
            formula="Δφ = (S/R) × cos(ПУ)",
            substitution=f"Δφ = ({distance_nm:.2f}/{EARTH_RADIUS_NM:.1f}) × cos({course_deg:.1f}°)",
            result=f"φ2 = {lat2:.4f}°",
        ),
        CalculationStep(
            description="Приращение долготы",
            formula=d_lambda_formula,
            substitution=d_lambda_substitution,
            result=f"λ2 = {lon2:.4f}°",
        ),
    ]
    return PositionResult(lat=lat2, lon=lon2, steps=steps)
