"""
Оценка метацентрической высоты (GM) по периоду собственных бортовых
колебаний судна (rolling period test) — практический способ прикинуть
остойчивость без полного расчёта, часто применяемый на борту (раскачать
судно и засечь период качки секундомером).

Источник формулы: эмпирическая "формула периода качки"
    T = f × B / √GM
где T — период полного цикла качки (сек), B — ширина судна (м),
f — эмпирический коэффициент. Формула и коэффициент независимо
подтверждены двумя источниками:
  - https://maritimecalc.com/rolling-period-calculator/ (f=0.797 для
    метрических единиц, f=0.44 для футов)
  - https://oic-nwreviewer.blogspot.com/2014/02/formula-for-rolling-period.html
    (тот же f=0.44 фут / f=0.797 метр)
Согласованность подтверждена и арифметически: 0.44×√(1 фут в метрах в
обратную сторону, т.е. коэффициент перевода футы->метры √3.281) ≈ 0.797.

ВАЖНО — точность и ограничения (обе явные оговорки источников выше):
  - Погрешность метода ±15-20% — это ОЦЕНКА, не замена расчёта по
    информации об остойчивости конкретного судна.
  - Формула предполагает малые углы качки (свободная качка на тихой
    воде, без давления волн/ветра, крен в пределах ~сотни-другой
    амплитуды, не путать с качкой на волнении).
  - Коэффициент f в реальности зависит от распределения масс по
    судну (радиус инерции), 0.797/0.44 — усреднённое, "универсальное"
    значение для торговых судов; для конкретного типа судна может
    отличаться.
"""

from dataclasses import dataclass, field

F_COEFFICIENT_METRIC = 0.797


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class RollPeriodResult:
    gm: float
    steps: list[CalculationStep] = field(default_factory=list)


def imo_roll_coefficient(beam_m: float, length_wl_m: float, mean_draft_m: float) -> float:
    """Коэффициент C из формулы периода качки ИМО:
    C = 0.373 + 0.023·(B/d) − 0.043·(Lwl/100)
    (IMO IS Code 2008, часть A, 2.3.4 — критерий погоды; T = 2·C·B/√GM)."""
    return 0.373 + 0.023 * (beam_m / mean_draft_m) - 0.043 * (length_wl_m / 100.0)


def gm_from_roll_period(
    roll_period_s: float,
    beam_m: float,
    length_wl_m: float | None = None,
    mean_draft_m: float | None = None,
) -> RollPeriodResult:
    """
    Оценка GM по периоду полного цикла бортовой качки.

    Если заданы длина по ватерлинии Lwl и средняя осадка d — по формуле ИМО
    (IS Code 2008, ч. A, 2.3.4):  T = 2·C·B/√GM  →  GM = (2·C·B / T)²,
        C = 0.373 + 0.023·(B/d) − 0.043·(Lwl/100).
    Иначе — упрощённо с постоянным f = 0.797 (= 2·C при C ≈ 0.4):
        GM = (f × B / T)². Такой f хорош для небольших судов (≤ 70 м), а для
        больших завышает GM на 15–50 % — поэтому для них задавайте Lwl и d.

    roll_period_s (T) — период ПОЛНОГО цикла качки (борт-борт-борт), секунды
    beam_m (B) — ширина судна, м; length_wl_m (Lwl) — длина по ватерлинии, м;
    mean_draft_m (d) — средняя осадка, м. GM — в метрах.
    """
    if roll_period_s <= 0:
        raise ValueError("err.roll_period.period_must_be_positive")
    if beam_m <= 0:
        raise ValueError("err.roll_period.beam_must_be_positive")
    use_imo = length_wl_m is not None and mean_draft_m is not None
    if use_imo:
        if length_wl_m <= 0 or mean_draft_m <= 0:
            raise ValueError("err.roll_period.ship_data_must_be_positive")
        c = imo_roll_coefficient(beam_m, length_wl_m, mean_draft_m)
        if c <= 0:
            raise ValueError("err.roll_period.ship_data_must_be_positive")
        gm = (2 * c * beam_m / roll_period_s) ** 2
        steps = [
            CalculationStep(
                description="Коэффициент C по формуле ИМО",
                formula="C = 0.373 + 0.023·(B/d) − 0.043·(Lwl/100)",
                substitution=f"C = 0.373 + 0.023·({beam_m:.2f}/{mean_draft_m:.2f}) − 0.043·({length_wl_m:.1f}/100)",
                result=f"C = {c:.4f}",
            ),
            CalculationStep(
                description="Оценка метацентрической высоты по периоду качки",
                formula="GM = (2·C·B / T)²",
                substitution=f"GM = (2 × {c:.4f} × {beam_m:.2f} / {roll_period_s:.2f})²",
                result=f"GM ≈ {gm:.3f} м",
            ),
        ]
    else:
        gm = (F_COEFFICIENT_METRIC * beam_m / roll_period_s) ** 2
        steps = [
            CalculationStep(
                description="Оценка метацентрической высоты по периоду качки",
                formula="GM = (f × B / T)², f = 0.797",
                substitution=f"GM = (0.797 × {beam_m:.2f} / {roll_period_s:.2f})²",
                result=f"GM ≈ {gm:.3f} м",
            )
        ]
    return RollPeriodResult(gm=gm, steps=steps)
