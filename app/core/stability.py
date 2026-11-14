"""
Простая проверка поперечной остойчивости — метацентрическая высота (GM)
и крен/дифферент от переноса, погрузки или выгрузки груза.

Источник: стандартные формулы поперечной остойчивости, используемые в
курсе "Ship Stability for Masters and Mates" (Barrass/Derrett) и в
любом учебнике по теории судна — формула переноса момента веса
относительно центра тяжести и формула крена от переносного момента при
малых углах. Контрольный пример (крен 2.29° при переносе 20 т на 6 м
при GM=0.5 м и водоизмещении 6000 т) — классический учебный пример из
этого курса, воспроизведён в тестах.

ВАЖНО — границы применимости (обязательно к прочтению перед использованием):
  - Формула крена tan(крен) = w×d / (Δ×GM) — приближение для МАЛЫХ углов
    (обычно годится примерно до 10°). При большем крене нужна кривая
    плеч остойчивости (GZ curve) из "Информации об остойчивости" судна,
    здесь она не считается.
  - Это НЕ замена обязательной проверке по "Информации об остойчивости
    для капитана" конкретного судна и не проверка на соответствие
    критериям Intact Stability Code (IMO IS Code 2008) — здесь нет
    данных о форме корпуса судна, чтобы это подтвердить.
  - GM ниже нуля означает отрицательную начальную остойчивость (судно
    может опрокинуться/лечь на угол заката) — это КРИТИЧЕСКАЯ ситуация,
    решение остаётся исключительно за капитаном/старшим помощником.

Единицы: KM, KG, GM, расстояния — метры; водоизмещение, вес груза — тонны;
крен — градусы.
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
class StabilityResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def metacentric_height(km: float, kg: float) -> StabilityResult:
    """
    Начальная метацентрическая высота.

    km — возвышение поперечного метацентра над килем, м (из
         гидростатических таблиц судна на текущую осадку)
    kg — возвышение центра тяжести судна над килем, м (из расчёта
         загрузки/грузового плана)

    Формула: GM = KM - KG
    """
    gm = km - kg
    steps = [
        CalculationStep(
            description="Начальная метацентрическая высота",
            formula="GM = KM - KG",
            substitution=f"GM = {km:.3f} - {kg:.3f}",
            result=f"GM = {gm:.3f} м" + ("  (ВНИМАНИЕ: GM < 0 — отрицательная остойчивость)" if gm < 0 else ""),
        )
    ]
    return StabilityResult(value=gm, steps=steps)


def kg_after_load_discharge(
    displacement: float,
    kg: float,
    weight: float,
    weight_kg: float,
    operation: str,
) -> dict:
    """
    Новое КG после погрузки или выгрузки одного груза (момент веса
    относительно киля).

    displacement — водоизмещение ДО операции, т
    kg — текущее КG судна ДО операции, м
    weight — масса груза, т (положительное число)
    weight_kg — возвышение центра тяжести самого груза над килем, м
    operation — "load" (погрузка) или "discharge" (выгрузка)

    Формула (погрузка): KG_new = (Δ×KG + w×kg_w) / (Δ + w)
    Формула (выгрузка):  KG_new = (Δ×KG - w×kg_w) / (Δ - w)
    """
    if operation not in ("load", "discharge"):
        raise ValueError("err.stability.invalid_operation")

    moment_before = displacement * kg
    weight_moment = weight * weight_kg

    if operation == "load":
        new_displacement = displacement + weight
        new_moment = moment_before + weight_moment
        formula = "KGнов = (Δ×KG + w×kgw) / (Δ + w)"
    else:
        if weight >= displacement:
            raise ValueError("err.stability.discharge_exceeds_displacement")
        new_displacement = displacement - weight
        new_moment = moment_before - weight_moment
        formula = "KGнов = (Δ×KG - w×kgw) / (Δ - w)"

    new_kg = new_moment / new_displacement
    steps = [
        CalculationStep(
            description=f"Новое КG после {'погрузки' if operation == 'load' else 'выгрузки'} груза",
            formula=formula,
            substitution=f"KGнов = ({displacement:.1f}×{kg:.3f} {'+' if operation == 'load' else '-'} {weight:.1f}×{weight_kg:.3f}) / ({displacement:.1f} {'+' if operation == 'load' else '-'} {weight:.1f})",
            result=f"KGнов = {new_kg:.3f} м, Δнов = {new_displacement:.1f} т",
        )
    ]
    return {"new_kg": new_kg, "new_displacement": new_displacement, "steps": steps}


def kg_after_vertical_shift(displacement: float, kg: float, weight: float, vertical_distance: float) -> dict:
    """
    Новое КG после вертикального переноса груза внутри судна (масса
    судна не меняется, меняется только положение груза по высоте).

    vertical_distance — расстояние переноса по вертикали, м, со знаком
        ("+" — груз подняли, "-" — опустили)

    Формула: KG_new = KG + (w × d) / Δ
    """
    delta_kg = (weight * vertical_distance) / displacement
    new_kg = kg + delta_kg
    steps = [
        CalculationStep(
            description="Новое КG после вертикального переноса груза",
            formula="KGнов = KG + (w × d) / Δ",
            substitution=f"KGнов = {kg:.3f} + ({weight:.1f} × {vertical_distance:+.2f}) / {displacement:.1f}",
            result=f"KGнов = {new_kg:.3f} м",
        )
    ]
    return {"new_kg": new_kg, "steps": steps}


def list_angle_from_transverse_shift(displacement: float, gm: float, weight: float, transverse_distance: float) -> dict:
    """
    Угол крена от поперечного переноса (или несимметричной погрузки/
    выгрузки) груза — приближение для малых углов (см. предупреждение
    в докстринге модуля).

    transverse_distance — поперечное расстояние переноса момента веса
        от ДП судна, м (по модулю; направление крена определяется
        отдельно по тому, в какую сторону сместился груз)
    gm — метацентрическая высота ПОСЛЕ операции (если она изменилась
        из-за погрузки/выгрузки — сначала пересчитать через
        kg_after_load_discharge и metacentric_height)

    Формула: tg(крен) = (w × d) / (Δ × GM); крен = arctg(...)
    """
    if gm <= 0:
        raise ValueError("err.stability.gm_must_be_positive")

    tan_list = (weight * transverse_distance) / (displacement * gm)
    list_deg = math.degrees(math.atan(tan_list))
    steps = [
        CalculationStep(
            description="Угол крена от переносного момента (приближение малых углов)",
            formula="tg(крен) = (w × d) / (Δ × GM)",
            substitution=f"tg(крен) = ({weight:.1f} × {transverse_distance:.2f}) / ({displacement:.1f} × {gm:.3f})",
            result=f"крен = {list_deg:.2f}°",
        )
    ]
    return {"list_deg": list_deg, "tan_list": tan_list, "steps": steps}
