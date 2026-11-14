"""
Расчёт остатка балласта в танках с поправками на крен и дифферент — прямое
расширение core/ballast.py для случая, когда судовые балластные документы
дают не только основную калибровочную таблицу (объём для ровного киля),
но и ОТДЕЛЬНЫЕ таблицы поправок — "поправка на 1 м дифферента" и "поправка
на 1° крена" (свои для каждого танка, т.к. зависят от формы конкретного
танка/его положения по длине и ширине судна).

Как и в core/ballast.py, этот модуль НЕ подменяет и не хранит сами судовые
таблицы (ни основную калибровочную, ни таблицы поправок) — судоводитель
сам снимает с них:
  1) объём по основной калибровочной таблице на ровный киль (по факту
     замера/sounding) — тот же принцип, что уже в core/ballast.py
     (`tank_weight`): объём вводится уже готовым;
  2) ставку поправки на дифферент (объём на каждый метр дифферента, знак
     уже учитывает направление — на нос/на корму — как принято в
     конкретной судовой таблице этого танка);
  3) ставку поправки на крен (объём на каждый градус крена, знак — на
     левый/правый борт по той же логике).
Дифферент и крен (в отличие от ставок поправок) — ОДНО общее состояние
судна на момент замера, а не свойство отдельного танка, поэтому задаются
один раз на весь расчёт, а не по танкам.

Калькулятор прогоняет уже снятые пользователем значения через формулу:

    V_испр = V_набл + (ставка_дифферент × дифферент) + (ставка_крен × крен)
    Масса = V_испр × плотность

Единицы: объём — м³, дифферент — м, крен — градусы, плотность — т/м³,
масса — т.

ВАЖНО (честная оговорка, тот же принцип, что в core/ballast.py и
core/cargo_ullage.py): ставки поправок на дифферент/крен и сам V_набл —
НЕ общая формула и не калибровочная таблица "из воздуха", а конкретные
цифры из судовых балластных/калибровочных таблиц, которые пользователь
вводит сам. Это вспомогательный инструмент, ускоряющий арифметику по уже
имеющимся у судоводителя данным, а не замена самих судовых таблиц.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


def tank_remaining_ballast(
    name: str,
    volume_observed_m3: float,
    trim_correction_rate_m3_per_m: float,
    trim_m: float,
    list_correction_rate_m3_per_deg: float,
    list_deg: float,
    density_t_m3: float,
) -> dict:
    """Остаток балласта в ОДНОМ танке с поправками на дифферент и крен.

    volume_observed_m3 — объём, уже снятый судоводителем с основной
    калибровочной таблицы танка (ровный киль) по факту замера — тот же
    принцип, что и volume в core/ballast.py::tank_weight.
    trim_correction_rate_m3_per_m — поправка на 1 м дифферента (м³/м) из
    судовой таблицы этого танка, знак уже учитывает направление.
    trim_m — фактический дифферент судна на момент замера (та же система
    знаков, что и ставка выше) — общее состояние судна, не танка.
    list_correction_rate_m3_per_deg — поправка на 1° крена (м³/°) из
    судовой таблицы этого танка, знак аналогично по судовой таблице.
    list_deg — фактический крен судна на момент замера.
    density_t_m3 — плотность балластной/забортной воды, т/м³.

    Возвращает dict: name, volume_observed_m3, trim_correction_m3,
    list_correction_m3, corrected_volume_m3, mass_tonnes, steps.
    """
    if density_t_m3 <= 0:
        raise ValueError("err.ballast_sounding.density_must_be_positive")

    steps: list[CalculationStep] = []

    trim_correction = trim_correction_rate_m3_per_m * trim_m
    steps.append(
        CalculationStep(
            description=f"Поправка на дифферент, танк «{name}»",
            formula="ΔV_диф = ставка_диф × дифферент",
            substitution=f"ΔV_диф = {trim_correction_rate_m3_per_m:.3f} м³/м × {trim_m:.2f} м",
            result=f"ΔV_диф = {trim_correction:.2f} м³",
        )
    )

    list_correction = list_correction_rate_m3_per_deg * list_deg
    steps.append(
        CalculationStep(
            description="Поправка на крен",
            formula="ΔV_крен = ставка_крен × крен",
            substitution=f"ΔV_крен = {list_correction_rate_m3_per_deg:.3f} м³/° × {list_deg:.2f}°",
            result=f"ΔV_крен = {list_correction:.2f} м³",
        )
    )

    corrected_volume = volume_observed_m3 + trim_correction + list_correction
    if corrected_volume < 0:
        raise ValueError("err.ballast_sounding.corrected_volume_negative")
    steps.append(
        CalculationStep(
            description="Исправленный объём",
            formula="V_испр = V_набл + ΔV_диф + ΔV_крен",
            substitution=f"V_испр = {volume_observed_m3:.2f} + ({trim_correction:.2f}) + ({list_correction:.2f})",
            result=f"V_испр = {corrected_volume:.2f} м³",
        )
    )

    mass = corrected_volume * density_t_m3
    steps.append(
        CalculationStep(
            description=f"Масса балласта в танке «{name}»",
            formula="Масса = V_испр × плотность",
            substitution=f"Масса = {corrected_volume:.2f} м³ × {density_t_m3:.4f} т/м³",
            result=f"Масса = {mass:.3f} т",
        )
    )

    return {
        "name": name,
        "volume_observed_m3": volume_observed_m3,
        "trim_correction_m3": trim_correction,
        "list_correction_m3": list_correction,
        "corrected_volume_m3": corrected_volume,
        "mass_tonnes": round(mass, 3),
        "steps": [s.__dict__ for s in steps],
    }


def total_ballast_with_corrections(
    tanks: List[dict],
    trim_m: float,
    list_deg: float,
) -> dict:
    """Сумма исправленного остатка балласта по нескольким танкам.

    tanks — список словарей {"name", "volume_observed_m3",
    "trim_correction_rate_m3_per_m", "list_correction_rate_m3_per_deg",
    "density_t_m3"}. trim_m/list_deg — ОБЩЕЕ состояние судна на момент
    замера (одно на весь расчёт, не по танкам — см. докстринг модуля).
    Танки без названия или с нулевым объёмом пропускаются (тот же
    принцип, что в core/ballast.py — сухой/неиспользуемый танк не
    считается ошибкой).

    Возвращает {"total_mass_tonnes": т, "total_volume_m3": м³,
    "breakdown": [результат tank_remaining_ballast по каждому танку],
    "steps": [...]}.
    """
    breakdown: list[dict] = []
    all_steps: list[dict] = []
    total_mass = 0.0
    total_volume = 0.0
    for t in tanks:
        name = str(t.get("name") or "").strip()
        try:
            volume_observed = float(t.get("volume_observed_m3") or 0.0)
        except (TypeError, ValueError):
            volume_observed = 0.0
        if not name or volume_observed == 0.0:
            continue
        try:
            density = float(t.get("density_t_m3") or 0.0)
        except (TypeError, ValueError):
            density = 0.0
        result = tank_remaining_ballast(
            name=name,
            volume_observed_m3=volume_observed,
            trim_correction_rate_m3_per_m=float(t.get("trim_correction_rate_m3_per_m") or 0.0),
            trim_m=trim_m,
            list_correction_rate_m3_per_deg=float(t.get("list_correction_rate_m3_per_deg") or 0.0),
            list_deg=list_deg,
            density_t_m3=density,
        )
        breakdown.append(result)
        all_steps.extend(result["steps"])
        total_mass += result["mass_tonnes"]
        total_volume += result["corrected_volume_m3"]

    if not breakdown:
        raise ValueError("err.ballast_sounding.no_tanks")

    total_mass = round(total_mass, 3)
    total_volume = round(total_volume, 3)
    breakdown_str = " + ".join(f"{b['mass_tonnes']:.2f}" for b in breakdown)
    all_steps.append(
        CalculationStep(
            description="Общий остаток балласта по всем танкам (с поправками)",
            formula="Балласт_итого = Σ Масса_i",
            substitution=breakdown_str,
            result=f"Балласт_итого = {total_mass:.3f} т",
        ).__dict__
    )

    return {
        "total_mass_tonnes": total_mass,
        "total_volume_m3": total_volume,
        "breakdown": breakdown,
        "steps": all_steps,
    }
