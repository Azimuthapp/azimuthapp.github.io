"""
Расчёт длины якорной цепи (вытравливаемой на клюз) по правилу
соотношения "глубина : длина цепи" (scope ratio).

ВАЖНО: это практическое правило хорошей морской практики (seamanship
rule of thumb), а не формула из конвенции или регламентирующего
документа — единого "официального" стандарта на длину вытравливаемой
цепи не существует, решение всегда принимает капитан/судоводитель с
учётом СУБ (Системы управления безопасностью) компании, конкретного
грунта, прогноза погоды и характеристик якорного устройства судна.
Таблица соотношений ниже — ориентировочная, взята из общепринятой
штурманской практики (аналогичные диапазоны приводятся, например, в
Bridge Procedures Guide и штурманских справочниках). Обязательно
сверяться с СУБ компании и наставлениями судна — см. CLAUDE.md, правило 8.

Единицы: глубина и длина — метры, длина смычки — метры (Российский
стандарт — 25 или 27.5 м в зависимости от судна; уточняйте по
формуляру/сертификату якорного устройства).
"""

from dataclasses import dataclass, field

# Ориентировочное соотношение (вытравленная длина) / (глубина+возвышение
# клюза), по условиям погоды/стоянки. Практическое правило, не норматив.
SCOPE_RATIO_TABLE = {
    "хорошая_погода_кратковременная": 3.0,
    "обычная_стоянка": 4.0,
    "умеренный_ветер_волнение": 6.0,
    "штормовая_погода": 8.0,
}

DEFAULT_SHACKLE_LENGTH_M = 25.0  # стандартная длина смычки (уточнить по формуляру судна)


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class AnchorResult:
    scope_m: float
    shackles: float
    shackles_rounded_up: int
    steps: list[CalculationStep] = field(default_factory=list)


def anchor_chain_length(
    depth: float,
    hawse_height: float,
    scope_ratio: float,
    shackle_length: float = DEFAULT_SHACKLE_LENGTH_M,
) -> AnchorResult:
    """
    Длина цепи, которую нужно вытравить, и число смычек.

    depth — глубина места якорной стоянки, м
    hawse_height — возвышение клюза над водой, м
    scope_ratio — принятое соотношение (глубина+возвышение) : длина цепи
        (см. SCOPE_RATIO_TABLE — ориентир, окончательное решение за
        капитаном/СУБ компании)
    shackle_length — длина одной смычки цепи, м (уточнить по формуляру судна)

    Формула:
      Вытравливаемая длина = (глубина + возвышение клюза) × соотношение
      Число смычек = вытравливаемая длина / длина смычки
    """
    if depth < 0 or hawse_height < 0 or scope_ratio <= 0 or shackle_length <= 0:
        raise ValueError("err.anchor.bad_input")
    total_depth = depth + hawse_height
    scope = total_depth * scope_ratio
    shackles = scope / shackle_length
    shackles_rounded_up = int(shackles) + (1 if shackles % 1 > 1e-9 else 0)

    steps = [
        CalculationStep(
            description="Расчётная глубина с учётом возвышения клюза над водой",
            formula="Hрасч = H + h_клюза",
            substitution=f"Hрасч = {depth:.1f} + {hawse_height:.1f}",
            result=f"Hрасч = {total_depth:.1f} м",
        ),
        CalculationStep(
            description="Длина цепи к вытравливанию",
            formula="L = Hрасч × соотношение",
            substitution=f"L = {total_depth:.1f} × {scope_ratio:.1f}",
            result=f"L = {scope:.1f} м",
        ),
        CalculationStep(
            description="Число смычек (округление в большую сторону)",
            formula="N = L / длина_смычки",
            substitution=f"N = {scope:.1f} / {shackle_length:.1f}",
            result=f"N ≈ {shackles:.2f} смычки → вытравить {shackles_rounded_up} смычек",
        ),
    ]
    return AnchorResult(
        scope_m=scope,
        shackles=shackles,
        shackles_rounded_up=shackles_rounded_up,
        steps=steps,
    )
