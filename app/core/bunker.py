"""
Расчёт запасов топлива по данным замера (соундинг/уровень в танке):
интерполяция по калибровочной таблице танка (Fuel/Tank Table
Interpolation) и вес топлива в танке по объёму и плотности (Bunker
Calculation).

Линейная интерполяция по калибровочной таблице — стандартный, общепринятый
способ (сама калибровочная таблица танка — судовой документ, не формула;
между её узлами интерполируют линейно, т.к. таблица уже достаточно
подробная, чтобы нелинейность геометрии танка между соседними строками
была пренебрежимо мала — обычный подход и в бумажной, и в электронной
практике замера танков).

ЧЕСТНО про объём (как и в остальных модулях, где это применимо — см.
`core/draft_survey.py`'s заметка про VCF для наливных судов): здесь
вес считается ПРЯМЫМ произведением объём × плотность, БЕЗ поправки на
температуру (VCF/ASTM Table 54B, приводящей объём при температуре
замера к объёму при стандартной температуре 15°C) — эта поправка
требует таблиц ASTM, не формулы, и является отдельной, более сложной
задачей. Плотность, вводимая в расчёт, должна уже быть плотностью ПРИ
ТЕМПЕРАТУРЕ ЗАМЕРА (как её и даёт денсиметр/ареометр при замере), а не
паспортной плотностью при 15°C — иначе результат будет систематически
неточным. Это те же плотностные ограничения, что уже отмечены для
`core/ballast.py` (там же обоснование, почему автоподстановка суммы по
танкам не форсируется на пользователя без подтверждения).
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class InterpolationResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def interpolate_table(table: list[tuple[float, float]], x: float) -> InterpolationResult:
    """
    Линейная интерполяция по калибровочной таблице (список пар
    (соундинг, объём), отсортированный по возрастанию соундинга).

    table — калибровочная таблица танка, [(sounding_1, volume_1),
        (sounding_2, volume_2), ...], по возрастанию sounding
    x — измеренный соундинг, для которого нужен объём

    Вне диапазона таблицы — ошибка (экстраполяция за пределы
    калибровочных данных ненадёжна и не выполняется).
    """
    # строки могли быть введены не по порядку — сортируем по соундингу
    table = sorted({(float(a), float(b)) for a, b in table})
    if len(table) < 2:
        raise ValueError("err.bunker.table_too_short")
    if x < table[0][0] or x > table[-1][0]:
        raise ValueError("err.bunker.sounding_out_of_range")

    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x0 <= x <= x1:
            if x1 == x0:
                value = y0
            else:
                value = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
            steps = [
                CalculationStep(
                    description="Линейная интерполяция по калибровочной таблице",
                    formula="y = y0 + (y1 − y0) × (x − x0) / (x1 − x0)",
                    substitution=(
                        f"y = {y0:.3f} + ({y1:.3f} − {y0:.3f}) × "
                        f"({x:.3f} − {x0:.3f}) / ({x1:.3f} − {x0:.3f})"
                    ),
                    result=f"y = {value:.3f}",
                )
            ]
            return InterpolationResult(value=value, steps=steps)

    # Не должно достигаться при отсортированной таблице и проверке диапазона выше.
    raise ValueError("err.bunker.sounding_out_of_range")


@dataclass
class BunkerResult:
    volume_m3: float
    weight_mt: float
    steps: list[CalculationStep] = field(default_factory=list)


def bunker_tank_weight(
    sounding: float,
    calibration_table: list[tuple[float, float]],
    density_mt_per_m3: float,
) -> BunkerResult:
    """
    Вес топлива в танке по замеру и калибровочной таблице.

    sounding — измеренный соундинг танка
    calibration_table — калибровочная таблица [(sounding, volume_m3), ...]
    density_mt_per_m3 — плотность топлива ПРИ ТЕМПЕРАТУРЕ ЗАМЕРА,
        метрические тонны на м³ (см. докстринг модуля — без поправки VCF)
    """
    if density_mt_per_m3 <= 0:
        raise ValueError("err.bunker.density_must_be_positive")

    interp = interpolate_table(calibration_table, sounding)
    weight = interp.value * density_mt_per_m3
    steps = list(interp.steps)
    steps.append(
        CalculationStep(
            description="Вес топлива в танке",
            formula="Вес = Объём × Плотность",
            substitution=f"Вес = {interp.value:.3f} × {density_mt_per_m3:.4f}",
            result=f"Вес = {weight:.3f} т",
        )
    )
    return BunkerResult(volume_m3=interp.value, weight_mt=weight, steps=steps)
