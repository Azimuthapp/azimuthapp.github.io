"""
Точка начала поворота (Wheel-Over Point, WOP) и угловая скорость поворота.

Поворот с постоянным радиусом R между двумя курсами (изменение курса A):
дуга циркуляции касается старого и нового курса. Расстояние от точки
пересечения курсов (точка поворота на карте) до точки касания по старому
курсу — длина касательной:

    L = R · tg(A / 2)                                  (геометрия окружности)

Судно начинает поворачивать не сразу после перекладки руля — за время
реакции t_р (перекладка руля + «раскачка» на поворот) оно проходит ещё

    S_р = V · t_р                                      (V в м/с)

поэтому руль кладут раньше: WOP = L + S_р до точки поворота.

Угловая скорость поворота при радиусе R (мили) и скорости V (уз):

    ROT (°/мин) = V / (60·R) · 180/π ≈ 0.955 · V / R

(Bowditch, «American Practical Navigator», гл. 8 «Piloting», «Turning bearing /
wheel over»; формула ROT ≈ 0.96·V/R — стандартная для плавания с постоянной
угловой скоростью, IMO MSC/Circ. 1053 / практика лоцманов). Время поворота T = A / ROT.

Радиус R берут из манёвренных характеристик судна (Wheelhouse poster / Pilot card,
SOLAS V, Res. A.601(15)) для данной скорости и угла перекладки, либо задают
желаемую ROT, а R вычисляют: R = 0.955·V / ROT.
"""

import math
from dataclasses import dataclass, field

NM = 1852.0
CABLE = 185.2


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class WheelOverResult:
    wop_distance_m: float          # от точки поворота (пересечения курсов) по старому курсу, м
    tangent_m: float               # R·tg(A/2), м
    reaction_m: float              # V·t_р, м
    radius_m: float
    rot_deg_min: float
    turn_time_min: float
    alteration: float              # |A|, °
    turn_side: str                 # "starboard" / "port"
    arc_length_m: float
    steps: list = field(default_factory=list)


def _alteration(old_course: float, new_course: float):
    a = (float(new_course) - float(old_course) + 540.0) % 360.0 - 180.0
    return abs(a), ("starboard" if a > 0 else "port")


def wheel_over(old_course: float, new_course: float, speed_kn: float,
               radius_nm: float = 0.0, rot_deg_min: float = 0.0,
               reaction_time_s: float = 0.0) -> WheelOverResult:
    """Расстояние до точки начала поворота.

    Задать либо радиус циркуляции radius_nm (мили), либо желаемую ROT (°/мин) —
    второе используется, если радиус не задан (0).
    """
    for c in (old_course, new_course):
        if not (0.0 <= float(c) <= 360.0):
            raise ValueError("err.wheel_over.bad_course")
    v = float(speed_kn)
    if v <= 0:
        raise ValueError("err.wheel_over.bad_speed")
    if reaction_time_s < 0:
        raise ValueError("err.wheel_over.bad_reaction")
    a, side = _alteration(old_course, new_course)
    if a < 1.0:
        raise ValueError("err.wheel_over.no_alteration")
    if a > 150.0:
        raise ValueError("err.wheel_over.too_big")
    steps = [CalculationStep("Изменение курса", "A = КК₂ − КК₁ (кратчайший угол)",
                             f"{float(new_course):.1f}° − {float(old_course):.1f}°",
                             f"A = {a:.1f}° {'вправо' if side == 'starboard' else 'влево'}")]
    if radius_nm and radius_nm > 0:
        r_nm = float(radius_nm)
        rot = 180.0 / math.pi * v / (60.0 * r_nm)
        steps.append(CalculationStep("Угловая скорость поворота", "ROT = V/(60·R) · 180/π ≈ 0.955·V/R",
                                     f"0.955 × {v:.1f} / {r_nm:.2f}", f"ROT = {rot:.1f} °/мин"))
    elif rot_deg_min and rot_deg_min > 0:
        rot = float(rot_deg_min)
        r_nm = 180.0 / math.pi * v / (60.0 * rot)
        steps.append(CalculationStep("Радиус циркуляции по заданной ROT", "R = 0.955·V / ROT",
                                     f"0.955 × {v:.1f} / {rot:.1f}", f"R = {r_nm:.2f} мили ({r_nm * NM:.0f} м)"))
    else:
        raise ValueError("err.wheel_over.need_radius_or_rot")
    r_m = r_nm * NM
    tangent = r_m * math.tan(math.radians(a) / 2)
    reaction = v * NM / 3600.0 * float(reaction_time_s)
    wop = tangent + reaction
    arc = r_m * math.radians(a)
    t_turn = a / rot
    steps += [
        CalculationStep("Касательная дуги поворота", "L = R · tg(A/2)",
                        f"{r_m:.0f} × tg({a / 2:.1f}°)", f"L = {tangent:.0f} м ({tangent / CABLE:.1f} кбт)"),
        CalculationStep("Путь за время реакции судна", "S_р = V · t_р",
                        f"{v:.1f} уз × {float(reaction_time_s):.0f} с", f"S_р = {reaction:.0f} м"),
        CalculationStep("Точка начала поворота (до точки поворота по старому курсу)", "WOP = L + S_р",
                        f"{tangent:.0f} + {reaction:.0f}", f"WOP = {wop:.0f} м ({wop / CABLE:.1f} кбт)"),
        CalculationStep("Время поворота", "T = A / ROT", f"{a:.1f}° / {rot:.1f} °/мин", f"T = {t_turn:.1f} мин"),
    ]
    return WheelOverResult(wop, tangent, reaction, r_m, rot, t_turn, a, side, arc, steps)
