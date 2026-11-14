"""
Путевой треугольник — снос судна течением/ветром, решается векторным
сложением скоростей (стандартная штурманская задача, любой курс
навигации/лоции — векторный метод, эквивалентен графическому решению
на маневренном планшете).

Все углы — истинные, по часовой стрелке от норда (0-360°). Компоненты
вектора раскладываются как (Восток, Север) — sin(угол)=Восток,
cos(угол)=Север.

Единицы: скорости — узлы, углы — градусы, расстояния — мили (если
используются производные величины).
"""

import math
from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class TriangleResult:
    steps: list = field(default_factory=list)


def _to_vector(angle_deg: float, magnitude: float) -> tuple[float, float]:
    rad = math.radians(angle_deg)
    return magnitude * math.sin(rad), magnitude * math.cos(rad)


def _to_bearing(east: float, north: float) -> float:
    deg = math.degrees(math.atan2(east, north))
    # округление перед взятием остатка убирает погрешность чисел с
    # плавающей запятой, из-за которой -1e-15 % 360 давало бы 360.0
    # вместо ожидаемых 0.0
    return round(deg, 9) % 360


def resultant_track(course_steered: float, speed_through_water: float, set_deg: float, drift: float) -> dict:
    """
    Путь и скорость по грунту (COG/SOG) при известном курсе и скорости
    судна относительно воды и известном сносе (течение/ветер).

    course_steered — курс, которым судно идёт относительно воды, ° (ИК)
    speed_through_water — скорость судна относительно воды, уз
    set_deg — направление течения/сноса ("куда течёт"), °
    drift — скорость течения/сноса, уз

    Формула: вектор пути = вектор судна (относительно воды) + вектор течения
    """
    ve, vn = _to_vector(course_steered, speed_through_water)
    ce, cn = _to_vector(set_deg, drift)
    re, rn = ve + ce, vn + cn
    sog = math.hypot(re, rn)
    cog = _to_bearing(re, rn)

    steps = [
        CalculationStep(
            description="Вектор судна относительно воды (Восток, Север)",
            formula="(Vвост, Vсев) = V×(sin(ИК), cos(ИК))",
            substitution=f"V={speed_through_water:.2f} уз, ИК={course_steered:.1f}°",
            result=f"({ve:+.3f}, {vn:+.3f}) уз",
        ),
        CalculationStep(
            description="Вектор течения/сноса (Восток, Север)",
            formula="(Cвост, Cсев) = drift×(sin(set), cos(set))",
            substitution=f"drift={drift:.2f} уз, set={set_deg:.1f}°",
            result=f"({ce:+.3f}, {cn:+.3f}) уз",
        ),
        CalculationStep(
            description="Путь по грунту (COG/SOG) — сумма векторов",
            formula="COG = atan2(Vвост+Cвост, Vсев+Cсев); SOG = |V+C|",
            substitution=f"({ve:.3f}+{ce:.3f}, {vn:.3f}+{cn:.3f})",
            result=f"COG = {cog:.1f}°, SOG = {sog:.3f} уз",
        ),
    ]
    return {"cog": cog, "sog": sog, "steps": steps}


def course_to_steer(track_deg: float, speed_through_water: float, set_deg: float, drift: float) -> dict:
    """
    Курс, которым нужно идти относительно воды, чтобы фактический путь
    по грунту совпал с заданным путевым углом (track_deg), при известном
    сносе и известной скорости судна относительно воды. Заодно даёт
    ожидаемую скорость по грунту (SOG) на этом пути.

    track_deg — заданный путевой угол (куда нужно попасть), °
    speed_through_water — скорость судна относительно воды, уз
    set_deg — направление течения/сноса, °
    drift — скорость течения/сноса, уз

    Решение: ищем S>0 такое, что |S×t - c| = V, где t — единичный
    вектор путевого угла, c — вектор течения, V — скорость хода.
    Это квадратное уравнение относительно S:
        S² - 2S(t·c) + (|c|² - V²) = 0
    """
    te, tn = math.sin(math.radians(track_deg)), math.cos(math.radians(track_deg))
    ce, cn = _to_vector(set_deg, drift)

    t_dot_c = te * ce + tn * cn
    c_sq = ce ** 2 + cn ** 2
    discriminant = t_dot_c ** 2 - (c_sq - speed_through_water ** 2)

    if discriminant < 0:
        raise ValueError("err.drift.no_course_solution")

    s1 = t_dot_c + math.sqrt(discriminant)
    s2 = t_dot_c - math.sqrt(discriminant)
    sog = max(s1, s2)
    if sog <= 1e-6:
        raise ValueError("err.drift.no_valid_solution")

    we = sog * te - ce
    wn = sog * tn - cn
    course = _to_bearing(we, wn)

    steps = [
        CalculationStep(
            description="Вектор течения/сноса (Восток, Север)",
            formula="(Cвост, Cсев) = drift×(sin(set), cos(set))",
            substitution=f"drift={drift:.2f} уз, set={set_deg:.1f}°",
            result=f"({ce:+.3f}, {cn:+.3f}) уз",
        ),
        CalculationStep(
            description="Скорость по грунту (SOG) на заданном пути — корень квадратного уравнения",
            formula="S² - 2S(t·c) + (|c|²-V²) = 0",
            substitution=f"t·c={t_dot_c:.4f}, |c|²={c_sq:.4f}, V²={speed_through_water**2:.4f}",
            result=f"SOG = {sog:.3f} уз",
        ),
        CalculationStep(
            description="Курс относительно воды (курс к рулю)",
            formula="(Wвост, Wсев) = SOG×t - C; курс = atan2(Wвост, Wсев)",
            substitution=f"({sog:.3f}×{te:.4f} - {ce:.3f}, {sog:.3f}×{tn:.4f} - {cn:.3f})",
            result=f"Курс к рулю = {course:.1f}°",
        ),
    ]
    return {"course_to_steer": course, "sog": sog, "steps": steps}
