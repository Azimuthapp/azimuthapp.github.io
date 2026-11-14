"""
Расчёт количества наливного груза (нефтепродукты) по замерам в грузовом
танке: уровень (ullage/innage) → объём по калибровочной таблице танка →
приведение объёма к стандартной температуре 15°C (VCF) → масса груза.

Единицы — СИ: уровень в см, объём в м³, температура в °C, плотность в
кг/м³, масса в метрических тоннах.

## Методика (типовая практика на танкере)
1. **Объём по калибровочной таблице (calibration table).** Таблица танка
   даёт объём как функцию высоты столба жидкости — innage (замер от дна
   танка вверх до поверхности жидкости), это стандартная база большинства
   калибровочных таблиц. Если замер снят как ullage (от измерительной
   точки на крышке танка вниз до поверхности жидкости — так измеряют на
   практике чаще, особенно на танкерах с закрытым замером/UTI), innage
   получается вычитанием: `innage = tank_depth − ullage`. Между соседними
   строками таблицы — линейная интерполяция (тот же метод и та же
   переиспользуемая идея, что уже применена для калибровки топливного
   танка в `core/bunker.py::interpolate_table`, но реализована здесь
   отдельно — сигнатура другая: пары `(уровень, объём)`, а не raw-таблица
   с отдельными списками).
2. **Observed Volume → Gross Standard Volume (GSV).** Объём жидкости
   меняется с температурой (тепловое расширение) — чтобы сравнивать
   партии груза, замеренные при разной температуре, объём приводят к
   единой базе 15°C через коэффициент объёмной коррекции VCF:
   `GSV = Observed Volume × VCF`.
3. **Масса.** `Масса (т) = GSV (м³) × плотность при 15°C (кг/м³) / 1000`.

## Источник формулы VCF — ЧЕСТНОЕ ограничение
Формула и коэффициенты — процедура расчёта таблицы
официальных нефтяных измерительных таблиц ASTM D1250-80 / API MPMS
Chapter 11.1 (в метрической версии это Table 54B, "Generalized Products",
база 15°C):

    VCF = exp(-alpha × dT × (1 + 0.8 × alpha × dT)),   dT = T − 15°C

где alpha (коэффициент объёмного расширения) — функция плотности при
15°C, с разными константами K0/K1 по диапазону плотности:
  - 838.5 ≤ ρ15 ≤ 1075 кг/м³ (мазуты, судовые топлива):
        alpha = (186.9696 + 0.48618 × ρ15) / ρ15²
  - 787.5 ≤ ρ15 < 838.5 кг/м³ (керосин, реактивное топливо, газойль):
        alpha = 594.5418 / ρ15²
  - 770.5 ≤ ρ15 < 787.5 кг/м³ (переходная зона):
        alpha = −0.00336312 + 2680.3206 / ρ15²
  - 653 ≤ ρ15 < 770.5 кг/м³ (бензины):
        alpha = (346.4228 + 0.43884 × ρ15) / ρ15²
  (это и есть процедура таблицы 54B 1980 г.; константы — константы
  таблицы 6B в °F × 1.8; границы — 37.1 / 48 / 52 °API)

Вне диапазона таблицы 54B (ρ15 < 653 или > 1075 кг/м³) функция
поднимает ошибку `err.cargo_ullage.density_out_of_range`, а не выдаёт
неточное число.

**Важно, как и в других приближённых калькуляторах проекта (см.
`core/blind_distance.py`, `core/ukc.py::heel_draft_increase`,
`core/bunker.py` — без поправки на температуру): это ОЦЕНКА для
прикидки количества груза и обучения методике, а НЕ замена официальных
сертифицированных таблиц ASTM-IP-API/софта танкера, который коммерческий
груз оформляется по контракту. Точность формулы (и корректность
константы K0/K1 по каждому диапазону) не была независимо перепроверена
против самих официальных таблиц — при работе с реальным грузом
использовать официальные таблицы судна/терминала.
"""

import math
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


def interpolate_calibration(level_cm: float, table: List[Tuple[float, float]]) -> float:
    """Линейная интерполяция объёма (м³) по калибровочной таблице танка.

    table — список пар (innage_см, объём_м³), не обязательно
    отсортированный на входе (сортируется внутри). За пределами
    диапазона таблицы — линейная экстраполяция по крайнему отрезку
    (не ошибка), т.к. небольшой перелив/недолив относительно последней
    калиброванной точки — обычная практическая ситуация.
    """
    if len(table) < 2:
        raise ValueError("err.cargo_ullage.table_too_short")
    pts = sorted(table, key=lambda p: p[0])
    x = level_cm
    if x <= pts[0][0]:
        x0, y0 = pts[0]
        x1, y1 = pts[1]
    elif x >= pts[-1][0]:
        x0, y0 = pts[-2]
        x1, y1 = pts[-1]
    else:
        x0 = y0 = x1 = y1 = None
        for i in range(len(pts) - 1):
            if pts[i][0] <= x <= pts[i + 1][0]:
                x0, y0 = pts[i]
                x1, y1 = pts[i + 1]
                break
    if x1 == x0:
        return y0
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def volume_correction_factor(density15_kg_m3: float, temperature_c: float) -> float:
    """VCF по процедуре ASTM D1250-80 Table 54B (база 15°C, без округления по шагам стандарта).

    См. докстринг модуля — диапазоны/константы и честная оговорка о
    точности формулы.
    """
    # Диапазоны и константы — ASTM D1250-80 Table 54B (Generalized Products);
    # метрические K0/K1 = константы Table 6B (°F) × 1.8, переход 48–52 °API.
    rho = density15_kg_m3
    if rho < 653 or rho > 1075:
        raise ValueError("err.cargo_ullage.density_out_of_range")
    if rho >= 838.5:          # мазуты, топлива (fuel oils)
        alpha = (186.9696 + 0.48618 * rho) / rho ** 2
    elif rho >= 787.5:        # керосин/реактивное топливо, газойль (jet group)
        alpha = 594.5418 / rho ** 2
    elif rho >= 770.5:        # переходная зона
        alpha = -0.00336312 + 2680.3206 / rho ** 2
    else:                     # бензины (gasolines), 653–770.5
        alpha = (346.4228 + 0.43884 * rho) / rho ** 2
    d_t = temperature_c - 15.0
    return math.exp(-alpha * d_t * (1 + 0.8 * alpha * d_t))


def cargo_quantity(
    level_cm: float,
    calibration_table: List[Tuple[float, float]],
    temperature_c: float,
    density15_kg_m3: float,
    is_ullage: bool = False,
    tank_depth_cm: float = None,
) -> dict:
    """Полный расчёт количества груза по одному танку.

    level_cm — замер уровня (innage, если is_ullage=False; ullage, если
    is_ullage=True — тогда обязателен tank_depth_cm для пересчёта в
    innage).
    calibration_table — калибровочная таблица танка, пары (innage_см,
    объём_м³).
    temperature_c — температура груза в танке на момент замера.
    density15_kg_m3 — плотность груза при 15°C (из сертификата качества/
    судового замера ареометром с пересчётом на 15°C).

    Возвращает dict: innage_cm, volume_observed_m3, vcf, gsv_m3,
    mass_tonnes, steps (список шагов расчёта для UI).
    """
    if density15_kg_m3 <= 0:
        raise ValueError("err.cargo_ullage.density_must_be_positive")
    if is_ullage:
        if tank_depth_cm is None:
            raise ValueError("err.cargo_ullage.tank_depth_required")
        innage_cm = tank_depth_cm - level_cm
        if innage_cm < 0:
            raise ValueError("err.cargo_ullage.ullage_exceeds_tank_depth")
    else:
        innage_cm = level_cm

    steps = []
    if is_ullage:
        steps.append(
            CalculationStep(
                description="Перевод замера из ullage в innage",
                formula="innage = глубина_танка − ullage",
                substitution=f"innage = {tank_depth_cm:.1f} − {level_cm:.1f}",
                result=f"innage = {innage_cm:.1f} см",
            )
        )

    volume_observed = interpolate_calibration(innage_cm, calibration_table)
    steps.append(
        CalculationStep(
            description="Объём по калибровочной таблице (интерполяция)",
            formula="V_набл = интерполяция(innage, таблица танка)",
            substitution=f"innage = {innage_cm:.1f} см",
            result=f"V_набл = {volume_observed:.2f} м³",
        )
    )

    vcf = volume_correction_factor(density15_kg_m3, temperature_c)
    steps.append(
        CalculationStep(
            description="Коэффициент объёмной коррекции (VCF, приведение к 15°C)",
            formula="VCF = exp(-α·dT·(1+0.8·α·dT)), dT = T − 15°C",
            substitution=f"ρ15 = {density15_kg_m3:.1f} кг/м³, T = {temperature_c:.1f}°C",
            result=f"VCF = {vcf:.5f}",
        )
    )

    gsv = volume_observed * vcf
    steps.append(
        CalculationStep(
            description="Объём, приведённый к 15°C (GSV)",
            formula="GSV = V_набл × VCF",
            substitution=f"GSV = {volume_observed:.2f} × {vcf:.5f}",
            result=f"GSV = {gsv:.2f} м³",
        )
    )

    mass_tonnes = gsv * density15_kg_m3 / 1000.0
    steps.append(
        CalculationStep(
            description="Масса груза",
            formula="Масса = GSV × ρ15 / 1000",
            substitution=f"Масса = {gsv:.2f} × {density15_kg_m3:.1f} / 1000",
            result=f"Масса = {mass_tonnes:.3f} т",
        )
    )

    # Вес в воздухе (коммерческое количество): WCF = ρ15 − 1.1 кг/м³
    # (ASTM D1250 / API MPMS 11.1, Table 56 — поправка на выталкивающую силу воздуха)
    weight_air_tonnes = gsv * (density15_kg_m3 - 1.1) / 1000.0
    steps.append(
        CalculationStep(
            description="Вес груза в воздухе (коммерческий, WCF = ρ15 − 1.1)",
            formula="Вес_возд = GSV × (ρ15 − 1.1) / 1000",
            substitution=f"Вес_возд = {gsv:.2f} × ({density15_kg_m3:.1f} − 1.1) / 1000",
            result=f"Вес_возд = {weight_air_tonnes:.3f} т",
        )
    )

    return {
        "weight_air_tonnes": weight_air_tonnes,
        "innage_cm": innage_cm,
        "volume_observed_m3": volume_observed,
        "vcf": vcf,
        "gsv_m3": gsv,
        "mass_tonnes": mass_tonnes,
        "steps": [s.__dict__ for s in steps],
    }


def total_cargo_mass(tank_masses_tonnes: List[float]) -> float:
    """Суммарная масса груза по нескольким танкам (простое сложение)."""
    if not tank_masses_tonnes:
        raise ValueError("err.cargo_ullage.no_tanks")
    return sum(tank_masses_tonnes)
