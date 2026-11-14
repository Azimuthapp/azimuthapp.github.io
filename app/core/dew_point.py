"""
Точка росы и решение о вентиляции грузового трюма ("потеть" или нет).

Два независимых практических правила, которыми реально пользуются на
судах для решения "вентилировать трюм или нет" (оба взяты из отраслевой
практики P&I-клубов, см. источники ниже — конкретных официальных
конвенций/кодексов ИМО с этой формулой нет, это устоявшаяся торговая
практика перевозки насыпных/гигроскопичных грузов):

  1. Правило точки росы (Dew Point Rule) — сравнивает точку росы
     наружного воздуха и точку росы воздуха в подпалубном пространстве
     трюма (headspace). Вентилировать МОЖНО, только если точка росы
     наружного воздуха НИЖЕ точки росы воздуха в трюме (тогда наружный
     воздух суше и снижает влажность в трюме, а не наоборот).
  2. Правило трёх градусов (Three Degree Rule) — более грубое и
     практичное: сравнивает температуру наружного воздуха (сухой
     термометр) со средней температурой груза при погрузке.
     Вентилировать МОЖНО, только если наружный воздух минимум на 3°C
     ХОЛОДНЕЕ температуры груза.

Оба правила существуют independently друг от друга — не обязательно
использовать оба сразу, но если они дают противоречивый результат,
следует руководствоваться более осторожным (не вентилировать) и
судовым/компанейским СУБ.

Точка росы считается по формуле Магнуса-Тетенса (коэффициенты
Alduchov & Eskridge, 1996 — уточнённая версия классической формулы
Магнуса, точность ±0.35°C в диапазоне -40..+50°C):

    γ(T, RH) = ln(RH/100) + a×T / (b+T)
    Td = b×γ / (a−γ)

    a = 17.625, b = 243.04 °C, T — температура (°C), RH — отн.
    влажность (%), Td — точка росы (°C)

Источники:
  - Britannia P&I Club, "Cargo Ventilation Logs — 3 Degree Rule",
    https://britanniapandi.com/2023/04/cargo-ventilation-logs/ —
    точные формулировки обоих правил (dew point rule, three degree rule)
  - Omnicalculator "Dew Point Calculator" (со ссылкой на Lawrence M.G.,
    2005, "The Relationship between Relative Humidity and the Dewpoint
    Temperature in Moist Air", BAMS) — формула Магнуса-Тетенса с
    коэффициентами Alduchov & Eskridge (a=17.625, b=243.04)

Единицы: температура — °C, относительная влажность — %, точка росы —
°C. Требует проверки перед реальным использованием для спорных грузовых
случаев — см. CLAUDE.md, правило 4.
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
class DewPointResult:
    dew_point_c: float
    steps: list[CalculationStep] = field(default_factory=list)


MAGNUS_A = 17.625
MAGNUS_B = 243.04  # °C


def dew_point(temperature_c: float, relative_humidity_pct: float) -> DewPointResult:
    """
    Точка росы по формуле Магнуса-Тетенса (Alduchov & Eskridge, 1996).

    temperature_c — температура воздуха (сухой термометр), °C
    relative_humidity_pct — относительная влажность, % (0 < RH <= 100)
    """
    if not (0 < relative_humidity_pct <= 100):
        raise ValueError("err.dew_point.humidity_out_of_range")

    gamma = math.log(relative_humidity_pct / 100.0) + (MAGNUS_A * temperature_c) / (MAGNUS_B + temperature_c)
    td = (MAGNUS_B * gamma) / (MAGNUS_A - gamma)

    steps = [
        CalculationStep(
            description="Промежуточный коэффициент γ",
            formula="γ = ln(RH/100) + a×T / (b+T), a=17.625, b=243.04",
            substitution=f"γ = ln({relative_humidity_pct:.1f}/100) + 17.625×{temperature_c:.1f} / (243.04+{temperature_c:.1f})",
            result=f"γ = {gamma:.4f}",
        ),
        CalculationStep(
            description="Точка росы",
            formula="Td = b×γ / (a−γ)",
            substitution=f"Td = 243.04×{gamma:.4f} / (17.625−{gamma:.4f})",
            result=f"Td = {td:.1f} °C",
        ),
    ]
    return DewPointResult(dew_point_c=td, steps=steps)


@dataclass
class VentilationDecision:
    should_ventilate: bool | None  # None — правило неприменимо/неопределённо (равенство)
    reason: str
    steps: list[CalculationStep] = field(default_factory=list)


def dew_point_rule(outside_dew_point_c: float, hold_dew_point_c: float) -> VentilationDecision:
    """
    Правило точки росы: вентилировать МОЖНО, только если точка росы
    наружного воздуха НИЖЕ точки росы воздуха в трюме (наружный воздух
    суше — снижает влажность в трюме вместо того чтобы её повышать).

    outside_dew_point_c — точка росы наружного воздуха, °C
    hold_dew_point_c — точка росы воздуха в подпалубном пространстве
        трюма (headspace), °C
    """
    diff = round(hold_dew_point_c - outside_dew_point_c, 6)
    should = diff > 0
    reason = "ventilate" if should else ("no_ventilate" if diff < 0 else "equal")

    steps = [
        CalculationStep(
            description="Правило точки росы: сравнение точек росы наружного воздуха и трюма",
            formula="Вентилировать, если Td_нар < Td_трюм",
            substitution=f"Td_нар = {outside_dew_point_c:.1f} °C, Td_трюм = {hold_dew_point_c:.1f} °C",
            result=("ВЕНТИЛИРОВАТЬ" if should else ("НЕ вентилировать" if diff < 0 else "разница 0 — на грани, решение капитана")),
        )
    ]
    return VentilationDecision(should_ventilate=(should if diff != 0 else None), reason=reason, steps=steps)


def three_degree_rule(outside_temp_c: float, mean_cargo_temp_c: float) -> VentilationDecision:
    """
    Правило трёх градусов: вентилировать МОЖНО, только если наружный
    воздух минимум на 3°C холоднее средней температуры груза при
    погрузке.

    outside_temp_c — температура наружного воздуха (сухой термометр), °C
    mean_cargo_temp_c — средняя температура груза при погрузке, °C
    """
    diff = round(mean_cargo_temp_c - outside_temp_c, 6)  # округление — иначе 17.9 − 14.9 = 2.9999999…
    should = diff >= 3.0

    steps = [
        CalculationStep(
            description="Правило трёх градусов: наружный воздух минимум на 3°C холоднее груза",
            formula="Вентилировать, если T_груза − T_нар >= 3°C",
            substitution=f"{mean_cargo_temp_c:.1f} − {outside_temp_c:.1f} = {diff:+.1f}°C",
            result=("ВЕНТИЛИРОВАТЬ" if should else "НЕ вентилировать"),
        )
    ]
    return VentilationDecision(should_ventilate=should, reason=("ventilate" if should else "no_ventilate"), steps=steps)
