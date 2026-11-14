"""
CPA/TCPA — кратчайшее расстояние расхождения (Closest Point of
Approach) и время до него (Time to CPA) при радиолокационной прокладке
относительного движения.

Источник: стандартный метод векторной прокладки относительного
движения (векторный треугольник скоростей), базовая тема любого курса
РЛС/САРП (ARPA) — эквивалентен построению на маневренном планшете
(манёвренный планшет/"vector triangle for collision avoidance").

Метод: относительная скорость Vr = скорость цели - скорость своего
судна (векторно). Относительное положение цели R — из пеленга и
дистанции. TCPA — время, за которое цель по относительному движению
подойдёт ближе всего к своему судну; CPA — соответствующее расстояние.

Формулы:
  t* = -(R · Vr) / |Vr|²           (время до точки кратчайшего сближения)
  CPA = sqrt(|R|² - (R·Vr)² / |Vr|²)

Единицы: пеленг/курс — градусы (истинные), дистанция — мили, скорость
— узлы, TCPA возвращается в минутах.
"""

import math
from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


def _to_vector(angle_deg: float, magnitude: float) -> tuple[float, float]:
    rad = math.radians(angle_deg)
    return magnitude * math.sin(rad), magnitude * math.cos(rad)


def cpa_tcpa(
    own_course: float,
    own_speed: float,
    target_bearing: float,
    target_range: float,
    target_course: float,
    target_speed: float,
) -> dict:
    """
    own_course/own_speed — курс (°) и скорость (уз) своего судна
    target_bearing/target_range — истинный пеленг (°) и дистанция (мили) на цель, ОТ своего судна
    target_course/target_speed — курс (°) и скорость (уз) цели

    Возвращает {"cpa_nm", "tcpa_min", "approaching": bool, "steps"}.
    Если относительная скорость равна нулю (курсы/скорости идентичны),
    относительное положение не меняется — TCPA не определён.
    """
    own_e, own_n = _to_vector(own_course, own_speed)
    tgt_e, tgt_n = _to_vector(target_course, target_speed)
    rel_ve, rel_vn = tgt_e - own_e, tgt_n - own_n
    rel_speed_sq = rel_ve ** 2 + rel_vn ** 2

    re, rn = _to_vector(target_bearing, target_range)

    steps = [
        CalculationStep(
            description="Относительное положение цели (Восток, Север)",
            formula="(Rвост, Rсев) = Dist×(sin(Пел), cos(Пел))",
            substitution=f"Dist={target_range:.2f} миль, Пел={target_bearing:.1f}°",
            result=f"({re:+.3f}, {rn:+.3f}) миль",
        ),
        CalculationStep(
            description="Относительная скорость (скорость цели минус скорость своего судна)",
            formula="Vr = Vцели - Vсвоего (векторно)",
            substitution=f"Vr = ({tgt_e:.3f}, {tgt_n:.3f}) - ({own_e:.3f}, {own_n:.3f})",
            result=f"Vr = ({rel_ve:+.3f}, {rel_vn:+.3f}) уз, |Vr| = {math.sqrt(rel_speed_sq):.3f} уз",
        ),
    ]

    if rel_speed_sq < 1e-9:
        steps.append(
            CalculationStep(
                description="Относительная скорость близка к нулю",
                formula="Vr ≈ 0",
                substitution="цель и своё судно движутся практически одинаково",
                result="TCPA не определён, дистанция не меняется",
            )
        )
        return {"cpa_nm": target_range, "tcpa_min": None, "approaching": False, "steps": steps}

    r_dot_v = re * rel_ve + rn * rel_vn
    tcpa_hours = -r_dot_v / rel_speed_sq
    tcpa_min = tcpa_hours * 60

    cpa_sq = (re ** 2 + rn ** 2) - (r_dot_v ** 2) / rel_speed_sq
    cpa = math.sqrt(max(cpa_sq, 0.0))

    steps.append(
        CalculationStep(
            description="Время до кратчайшего сближения (TCPA)",
            formula="t* = -(R·Vr) / |Vr|²",
            substitution=f"t* = -({r_dot_v:.4f}) / {rel_speed_sq:.4f} ч",
            result=f"TCPA = {tcpa_min:.1f} мин" + (" (в прошлом — цель удаляется)" if tcpa_min < 0 else ""),
        )
    )
    steps.append(
        CalculationStep(
            description="Кратчайшее расстояние расхождения (CPA)",
            formula="CPA = sqrt(|R|² - (R·Vr)²/|Vr|²)",
            substitution=f"CPA = sqrt({re**2+rn**2:.3f} - {r_dot_v**2:.3f}/{rel_speed_sq:.3f})",
            result=f"CPA = {cpa:.3f} миль",
        )
    )

    return {"cpa_nm": cpa, "tcpa_min": tcpa_min, "approaching": tcpa_min >= 0, "steps": steps}
