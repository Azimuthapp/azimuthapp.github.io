"""
Поправки к измеренной секстаном высоте светила (Hs) для получения
истинной высоты (Ho) — базовые поправки, не заменяющие полный расчёт
по Морскому Астрономическому Ежегоднику (МАЕ/Nautical Almanac).

ЧЕСТНО про объём: здесь считаются только ДВЕ поправки, которые
выражаются простой формулой и не требуют табличных данных ежегодника:
  1. Инструментальная поправка (индекс-поправка, IC) — задаётся
     пользователем напрямую (измеряется по секстану перед наблюдением).
  2. Наклонение видимого горизонта (Dip) — зависит только от высоты
     глаза наблюдателя над уровнем моря.
Поправка за рефракцию/параллакс/полудиаметр светила (третья и главная
по величине поправка, "Main Correction") ЗАВИСИТ ОТ КОНКРЕТНОГО
СВЕТИЛА, даты и самой высоты — берётся из таблиц МАЕ, здесь не
считается (это не формула, а табличные данные, публикуемые ежегодно;
для Солнца/звёзд/планет разные таблицы). Итоговая истинная высота
светила поэтому здесь НЕ считается — только промежуточная "кажущаяся
высота" (apparent altitude) Ha = Hs + IC − Dip, которая и подаётся на
вход табличной поправке МАЕ судоводителем самостоятельно.

Источник формулы наклонения горизонта (Dip): стандартная формула,
приводится (в т.ч. с указанием коэффициентов для футов/метров) на
https://pierdusud.com/en/corrections-to-sextant-sights/ и совпадает по
величине коэффициента с классической формулой Bowditch (American
Practical Navigator, Table 22 "Dip of the Sea Short of the Horizon" /
формула наклонения видимого горизонта):

    Dip (угл. мин) = 1.76 × √(высота_глаза, м)
    Dip (угл. мин) = 0.97 × √(высота_глаза, фут)

Поправка Dip ВСЕГДА вычитается (наблюдатель, поднятый над уровнем
моря, видит горизонт "ниже" истинного горизонта, что завышает
измеренную высоту светила).
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
class SextantResult:
    value: float  # угловые минуты (Dip) или градусы (Ha)
    steps: list[CalculationStep] = field(default_factory=list)


def dip_correction(height_of_eye_m: float) -> SextantResult:
    """
    Наклонение видимого горизонта, угловые минуты (всегда вычитается).

    height_of_eye_m — высота глаза наблюдателя над уровнем моря, метры
    """
    if height_of_eye_m < 0:
        raise ValueError("err.sextant.negative_height")
    dip = 1.76 * math.sqrt(height_of_eye_m)
    steps = [
        CalculationStep(
            description="Наклонение видимого горизонта",
            formula="Dip = 1.76 × √(высота глаза, м)",
            substitution=f"Dip = 1.76 × √{height_of_eye_m:.2f}",
            result=f"Dip = {dip:.2f}′ (вычитается)",
        )
    ]
    return SextantResult(value=dip, steps=steps)


def apparent_altitude(
    sextant_altitude_deg: float,
    index_correction_min: float,
    height_of_eye_m: float,
) -> SextantResult:
    """
    Кажущаяся высота светила Ha = Hs + IC − Dip (градусы).

    sextant_altitude_deg (Hs) — измеренная секстаном высота, градусы
        (десятичные, например 34.5 = 34°30′)
    index_correction_min (IC) — инструментальная поправка секстана,
        угловые минуты, знак "к небу" (on the arc) — ОТРИЦАТЕЛЬНЫЙ,
        "от неба" (off the arc) — ПОЛОЖИТЕЛЬНЫЙ (стандартное правило
        "if it's on, take off; if it's off, take on")
    height_of_eye_m — высота глаза наблюдателя, метры

    Возвращает Ha в градусах. Дальнейшая поправка за рефракцию/
    параллакс/полудиаметр (Main Correction) — по таблицам МАЕ, здесь
    не считается (см. докстринг модуля).
    """
    dip = dip_correction(height_of_eye_m)
    ha = sextant_altitude_deg + index_correction_min / 60.0 - dip.value / 60.0
    steps = list(dip.steps)
    steps.append(
        CalculationStep(
            description="Кажущаяся высота светила",
            formula="Ha = Hs + IC − Dip",
            substitution=(
                f"Ha = {sextant_altitude_deg:.3f}° + ({index_correction_min:+.1f}′) "
                f"− {dip.value:.2f}′"
            ),
            result=f"Ha = {ha:.3f}°",
        )
    )
    return SextantResult(value=ha, steps=steps)
