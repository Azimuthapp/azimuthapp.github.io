"""
Расчёт запаса глубины под килем (Under Keel Clearance, UKC).

Источники формул (требуют проверки штурманом — см. CLAUDE.md, правило 4):
  - Squat (просадка судна на ходу) — упрощённая формула Барраса (Barrass),
    широко используется в штурманской практике и учебниках (Bridge
    Procedures Guide и аналогичные). Есть два варианта: для открытой воды
    и для стеснённого фарватера (с поправкой на блокировку сечения).
  - Поправка на крен — геометрическая (доп. осадка кромки корпуса при крене).
  - Схема расчёта запаса — стандартная последовательность:
    доступная глубина -> вычесть осадку, просадку, крен, волнение ->
    сравнить с минимально допустимым запасом.

Все длины — в метрах, скорость — в узлах, углы — в градусах.
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
class UkcResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def heel_draft_increase(beam: float, heel_deg: float) -> UkcResult:
    """
    Увеличение осадки из-за крена (геометрическая поправка по краю корпуса).

    beam — ширина судна, м
    heel_deg — угол крена, градусы (в любую сторону, знак не важен)

    Формула: ΔTheel = (B / 2) * sin(крен)
    """
    heel_rad = math.radians(abs(heel_deg))
    increase = (beam / 2) * math.sin(heel_rad)
    steps = [
        CalculationStep(
            description="Увеличение осадки от края корпуса при крене",
            formula="ΔT_крен = (B / 2) × sin(крен)",
            substitution=f"ΔT_крен = ({beam:.2f} / 2) × sin({heel_deg:.1f}°)",
            result=f"ΔT_крен = {increase:.3f} м",
        )
    ]
    return UkcResult(value=increase, steps=steps)


def squat_open_water(block_coefficient: float, speed_knots: float) -> UkcResult:
    """
    Просадка (squat) на ходу в открытой (неограниченной) воде.
    Упрощённая формула Барраса.

    block_coefficient (Cb) — коэффициент полноты корпуса судна, 0.0-1.0
    speed_knots (Vs) — скорость судна, узлы

    Формула: Squat_max = Cb × Vs² / 100  (результат в метрах)
    """
    if speed_knots < 0 or not (0 < block_coefficient <= 1):
        raise ValueError("err.ukc.bad_ship_data")
    squat = block_coefficient * (speed_knots ** 2) / 100
    steps = [
        CalculationStep(
            description="Просадка на ходу в открытой воде (формула Барраса)",
            formula="Squat = Cb × Vs² / 100",
            substitution=f"Squat = {block_coefficient:.3f} × {speed_knots:.1f}² / 100",
            result=f"Squat = {squat:.3f} м",
        )
    ]
    return UkcResult(value=squat, steps=steps)


def squat_confined_channel(
    block_coefficient: float,
    speed_knots: float,
    channel_area: float,
    ship_underwater_area: float,
) -> UkcResult:
    """
    Просадка (squat) на ходу в стеснённом фарватере (канал/мелководье).
    Формула Барраса с поправкой на блокировку сечения канала.

    block_coefficient (Cb) — коэффициент полноты корпуса
    speed_knots (Vs) — скорость судна, узлы
    channel_area (Ac) — площадь поперечного сечения канала, м²
    ship_underwater_area (Am) — площадь подводной части мидель-шпангоута, м²

    Коэффициент блокировки: S = Am / Ac
    Формула: Squat = Cb × S^0.81 × Vs^2.08 / 20  (результат в метрах)
    """
    if channel_area <= 0 or ship_underwater_area <= 0:
        raise ValueError("err.ukc.bad_channel_area")
    if ship_underwater_area >= channel_area:
        raise ValueError("err.ukc.blockage_too_high")
    if speed_knots < 0 or not (0 < block_coefficient <= 1):
        raise ValueError("err.ukc.bad_ship_data")
    blockage = ship_underwater_area / channel_area
    squat = block_coefficient * (blockage ** 0.81) * (speed_knots ** 2.08) / 20
    steps = [
        CalculationStep(
            description="Коэффициент блокировки сечения канала",
            formula="S = Am / Ac",
            substitution=f"S = {ship_underwater_area:.1f} / {channel_area:.1f}",
            result=f"S = {blockage:.4f}",
        ),
        CalculationStep(
            description="Просадка на ходу в стеснённом фарватере (формула Барраса)",
            formula="Squat = Cb × S^0.81 × Vs^2.08 / 20",
            substitution=(
                f"Squat = {block_coefficient:.3f} × {blockage:.4f}^0.81 × "
                f"{speed_knots:.1f}^2.08 / 20"
            ),
            result=f"Squat = {squat:.3f} м",
        ),
    ]
    return UkcResult(value=squat, steps=steps)


def net_ukc(
    charted_depth: float,
    tide_height: float,
    static_draft: float,
    squat: float,
    heel_increase: float,
    wave_allowance: float,
) -> UkcResult:
    """
    Итоговый чистый запас глубины под килем.

    charted_depth (Hc) — глубина по карте в данной точке, м
    tide_height (h) — высота прилива на момент прохода, м (может быть 0)
    static_draft (T) — статическая осадка судна, м
    squat — расчётная просадка на ходу, м
    heel_increase — увеличение осадки от крена, м
    wave_allowance — запас на волнение/качку (задаётся судоводителем), м

    Формула:
      Доступная глубина = Hc + h
      Чистый запас = Доступная глубина - (T + Squat + ΔT_крен + запас на волну)
    """
    available_depth = charted_depth + tide_height
    total_draft = static_draft + squat + heel_increase + wave_allowance
    ukc = available_depth - total_draft

    steps = [
        CalculationStep(
            description="Доступная глубина в точке с учётом прилива",
            formula="Hдост = Hc + h",
            substitution=f"Hдост = {charted_depth:.2f} + {tide_height:.2f}",
            result=f"Hдост = {available_depth:.2f} м",
        ),
        CalculationStep(
            description="Суммарная эффективная осадка судна",
            formula="Tэфф = T + Squat + ΔT_крен + запас_волна",
            substitution=(
                f"Tэфф = {static_draft:.2f} + {squat:.2f} + "
                f"{heel_increase:.2f} + {wave_allowance:.2f}"
            ),
            result=f"Tэфф = {total_draft:.2f} м",
        ),
        CalculationStep(
            description="Чистый запас глубины под килем",
            formula="UKC = Hдост - Tэфф",
            substitution=f"UKC = {available_depth:.2f} - {total_draft:.2f}",
            result=f"UKC = {ukc:.2f} м",
        ),
    ]
    return UkcResult(value=ukc, steps=steps)


def ukc_assessment(
    charted_depth: float,
    tide_height: float,
    static_draft: float,
    beam: float,
    heel_deg: float,
    block_coefficient: float,
    speed_knots: float,
    wave_allowance: float,
    required_minimum_ukc: float,
    channel_area: float | None = None,
    ship_underwater_area: float | None = None,
) -> dict:
    """
    Полная оценка UKC: считает крен, просадку (в открытой воде или в канале —
    в зависимости от того, переданы ли channel_area и ship_underwater_area),
    итоговый запас и сравнивает его с минимально допустимым (задаётся
    судовладельцем/портом и вводится судоводителем).

    Возвращает словарь: {"ukc": UkcResult, "passed": bool, "margin": float}
    "margin" — насколько фактический запас больше (или меньше) требуемого.
    """
    heel_result = heel_draft_increase(beam, heel_deg)

    if channel_area is not None and ship_underwater_area is not None:
        squat_result = squat_confined_channel(
            block_coefficient, speed_knots, channel_area, ship_underwater_area
        )
    else:
        squat_result = squat_open_water(block_coefficient, speed_knots)

    ukc_result = net_ukc(
        charted_depth=charted_depth,
        tide_height=tide_height,
        static_draft=static_draft,
        squat=squat_result.value,
        heel_increase=heel_result.value,
        wave_allowance=wave_allowance,
    )

    all_steps = heel_result.steps + squat_result.steps + ukc_result.steps
    margin = round(ukc_result.value - required_minimum_ukc, 6)
    passed = margin >= 0  # округление: при UKC ровно равном минимуму — «достаточно»

    all_steps.append(
        CalculationStep(
            description="Сравнение с минимально допустимым запасом",
            formula="Запас_разница = UKC - UKC_мин",
            substitution=f"Запас_разница = {ukc_result.value:.2f} - {required_minimum_ukc:.2f}",
            result=f"{'Достаточно' if passed else 'НЕДОСТАТОЧНО'} ({margin:+.2f} м)",
        )
    )

    return {
        "ukc": ukc_result.value,
        "passed": passed,
        "margin": margin,
        "steps": all_steps,
    }
