"""
Расчёт поправки магнитного компаса (ΔК) и перевод курсов/пеленгов
между компасным (КК), магнитным (МК) и истинным (ИК) значением.

Источник формул: стандартная методика МППСС/навигации (штурманская практика,
формулы перевода румбов). Требует проверки штурманом перед использованием
в реальной работе — см. CLAUDE.md, правило 4.

Все углы — в градусах, диапазон 0.0–360.0, знак поправок:
  восточная (E) поправка — со знаком "+"
  западная (W) поправка — со знаком "-"
"""

from dataclasses import dataclass, field


def _normalize(angle: float) -> float:
    """Приводит угол к диапазону [0, 360)."""
    return angle % 360.0


@dataclass
class CalculationStep:
    """Один шаг расчёта для показа пользователю."""
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class CompassResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def variation_for_year(
    chart_variation: float,
    chart_year: int,
    annual_change: float,
    target_year: int,
) -> CompassResult:
    """
    Приведение магнитного склонения, указанного на карте, к текущему году
    плавания (склонение на карте всегда дано на конкретный год и меняется
    со временем).

    chart_variation (d0) — склонение, указанное на карте, градусы, E(+)/W(-)
    chart_year — год, на который дано склонение на карте (печать карты)
    annual_change — ежегодное изменение склонения, градусы/год, E(+)/W(-)
        (на карте обычно подписано словами "increasing" / "decreasing" —
        увеличение к E даём знаком "+", увеличение к W — знаком "-")
    target_year — год, на который нужно привести склонение (год плавания)

    Формула: d = d0 + annual_change × (target_year - chart_year)
    """
    years_elapsed = target_year - chart_year
    updated_variation = chart_variation + annual_change * years_elapsed

    steps = [
        CalculationStep(
            description="Число лет с года издания карты до года плавания",
            formula="n = год_плавания - год_карты",
            substitution=f"n = {target_year} - {chart_year}",
            result=f"n = {years_elapsed} лет",
        ),
        CalculationStep(
            description="Склонение, приведённое к году плавания",
            formula="d = d0 + (годовое_изменение × n)",
            substitution=(
                f"d = {chart_variation:+.1f} + ({annual_change:+.2f} × {years_elapsed})"
            ),
            result=f"d = {updated_variation:+.2f}°",
        ),
    ]
    return CompassResult(value=updated_variation, steps=steps)


def total_correction(deviation: float, variation: float) -> CompassResult:
    """
    Общая поправка компаса: ΔК = δ + d

    deviation (δ) — девиация компаса на данном курсе, градусы, E(+)/W(-)
    variation (d) — магнитное склонение в районе плавания, градусы, E(+)/W(-)

    Формула: ΔК = δ + d
    """
    total = deviation + variation
    steps = [
        CalculationStep(
            description="Общая поправка компаса — сумма девиации и склонения",
            formula="ΔК = δ + d",
            substitution=f"ΔК = ({deviation:+.1f}) + ({variation:+.1f})",
            result=f"ΔК = {total:+.1f}°",
        )
    ]
    return CompassResult(value=total, steps=steps)


def true_from_compass(
    compass_heading: float, deviation: float, variation: float
) -> CompassResult:
    """
    Перевод компасного курса в истинный: ИК = КК + ΔК, где ΔК = δ + d.

    compass_heading (КК) — курс по компасу, градусы, 0-360
    deviation (δ) — девиация на данном курсе, градусы, E(+)/W(-)
    variation (d) — магнитное склонение, градусы, E(+)/W(-)
    """
    correction = total_correction(deviation, variation)
    true_heading = _normalize(compass_heading + correction.value)
    steps = list(correction.steps)
    steps.append(
        CalculationStep(
            description="Истинный курс — компасный курс плюс общая поправка",
            formula="ИК = КК + ΔК",
            substitution=f"ИК = {compass_heading:.1f} + ({correction.value:+.1f})",
            result=f"ИК = {true_heading:.1f}°",
        )
    )
    return CompassResult(value=true_heading, steps=steps)


def compass_from_true(
    true_heading: float, deviation: float, variation: float
) -> CompassResult:
    """
    Перевод истинного курса в компасный: КК = ИК - ΔК, где ΔК = δ + d.

    true_heading (ИК) — истинный курс, градусы, 0-360
    deviation (δ) — девиация на курсе, близком к искомому компасному, E(+)/W(-)
    variation (d) — магнитное склонение, градусы, E(+)/W(-)
    """
    correction = total_correction(deviation, variation)
    compass_heading = _normalize(true_heading - correction.value)
    steps = list(correction.steps)
    steps.append(
        CalculationStep(
            description="Компасный курс — истинный курс минус общая поправка",
            formula="КК = ИК - ΔК",
            substitution=f"КК = {true_heading:.1f} - ({correction.value:+.1f})",
            result=f"КК = {compass_heading:.1f}°",
        )
    )
    return CompassResult(value=compass_heading, steps=steps)
