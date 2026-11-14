"""
Расчёт высоты прилива в промежуточный момент времени между полной и
малой водой — "правило двенадцатых" (Rule of Twelfths).

Источник: классическое штурманское правило, общепринятое в навигационных
учебниках. Предполагает, что промежуток между полной и малой водой равен
шести условным "часам" и что скорость изменения уровня в каждом из этих
часов меняется по стандартной пропорции: 1, 2, 3, 3, 2, 1 (в двенадцатых
долях полной величины прилива), то есть нарастающим итогом — 1, 3, 6, 9,
11, 12 двенадцатых. Это приближение (реальная кривая прилива — синусоида,
"двенадцатые" её хорошо аппроксимируют), не заменяет расчёт по таблицам
приливов конкретного порта/по гармоническим постоянным. Требует проверки
штурманом — см. CLAUDE.md, правило 8.

Работает в обе стороны — и для растущего прилива (малая вода -> полная
вода), и для падающего (полная вода -> малая вода): просто передаётся
высота и время начала и конца соответствующего полуцикла.
"""

from dataclasses import dataclass, field
from datetime import datetime

# Нарастающим итогом, в двенадцатых долях полной величины прилива,
# по часам от начала полуцикла (0-й час = начальная точка, 6-й = конечная)
CUMULATIVE_TWELFTHS = [0, 1, 3, 6, 9, 11, 12]


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class TideResult:
    height_m: float
    steps: list[CalculationStep] = field(default_factory=list)


def _fraction_of_range(hours_scaled: float) -> float:
    """Доля (0.0-1.0) полной величины прилива, пройденная к моменту
    hours_scaled условных часов (0-6) от начала полуцикла."""
    hours_scaled = max(0.0, min(6.0, hours_scaled))
    idx = int(hours_scaled)
    if idx >= 6:
        return 1.0
    frac_within_hour = hours_scaled - idx
    lower = CUMULATIVE_TWELFTHS[idx]
    upper = CUMULATIVE_TWELFTHS[idx + 1]
    return (lower + (upper - lower) * frac_within_hour) / 12.0


def tide_height_rule_of_twelfths(
    start_height: float,
    start_time: datetime,
    end_height: float,
    end_time: datetime,
    target_time: datetime,
) -> TideResult:
    """
    Высота прилива в момент target_time, интерполированная по правилу
    двенадцатых между началом (малая или полная вода) и концом
    (следующая полная или малая вода) полуцикла.

    start_height, start_time — высота и время начала полуцикла (м, datetime)
    end_height, end_time — высота и время конца полуцикла (м, datetime)
    target_time — момент, для которого нужна высота (должен быть между
        start_time и end_time)

    Формула: весь промежуток делится на 6 условных часов; в каждом часе
    проходит своя доля полной величины прилива (1,2,3,3,2,1 двенадцатых),
    нарастающим итогом 1,3,6,9,11,12 двенадцатых.
    """
    duration_hours = (end_time - start_time).total_seconds() / 3600.0
    if duration_hours <= 0:
        raise ValueError("err.tides.end_before_start")

    elapsed_hours = (target_time - start_time).total_seconds() / 3600.0
    if elapsed_hours < -1e-9 or elapsed_hours > duration_hours + 1e-9:
        # вне полуцикла правило двенадцатых неприменимо — не «обрезаем» молча
        raise ValueError("err.tides.target_outside_half_cycle")
    hours_scaled = elapsed_hours / duration_hours * 6.0
    fraction = _fraction_of_range(hours_scaled)

    tide_range = end_height - start_height
    height = start_height + tide_range * fraction

    steps = [
        CalculationStep(
            description="Продолжительность полуцикла (малая-полная или полная-малая вода)",
            formula="T = t_конец - t_начало",
            substitution=f"T = {end_time.strftime('%H:%M')} - {start_time.strftime('%H:%M')}",
            result=f"T = {duration_hours:.2f} ч",
        ),
        CalculationStep(
            description="Условный час по правилу двенадцатых (промежуток приведён к 6 часам)",
            formula="tусл = (t_цель - t_начало) / T × 6",
            substitution=f"tусл = ({target_time.strftime('%H:%M')} - {start_time.strftime('%H:%M')}) / {duration_hours:.2f} × 6",
            result=f"tусл = {hours_scaled:.2f} усл.ч",
        ),
        CalculationStep(
            description="Доля полной величины прилива, пройденная к этому моменту",
            formula="доля = накопленные_двенадцатые(tусл) / 12",
            substitution=f"на основе кумулятивной шкалы 1,3,6,9,11,12 двенадцатых",
            result=f"доля = {fraction:.3f}",
        ),
        CalculationStep(
            description="Высота прилива в заданный момент",
            formula="h = h_начало + (h_конец - h_начало) × доля",
            substitution=f"h = {start_height:.2f} + ({end_height:.2f} - {start_height:.2f}) × {fraction:.3f}",
            result=f"h = {height:.2f} м",
        ),
    ]
    return TideResult(height_m=height, steps=steps)
