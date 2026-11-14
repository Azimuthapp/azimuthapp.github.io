"""
Squat — дополнительное проседание (просадка) судна на ходу из-за
уменьшения запаса воды под корпусом на мелководье/в канале.

Источник: упрощённая формула Барраса (Barrass squat formula,
"rule of thumb"), общепринятая в учебных курсах и руководствах по
безопасности мореплавания на мелководье (используется, например, в
материалах UK MCA и большинства курсов по squat/UKC). Два случая:
  - открытая вода (неограниченный фарватер): Smax = Cb × V² / 100
  - стеснённый фарватер (канал, узкость): Smax = Cb × V² / 50

Это ОЦЕНКА (rule of thumb), не точный гидродинамический расчёт — для
критических проходов (высокая загрузка канала, малый УКК) нужен более
точный метод с коэффициентом блокировки сечения (S = As/Ac) или данные
судна/лоцманской практики. Результат этого калькулятора стоит
использовать вместе с core/ukc.py (Under Keel Clearance) — вычесть
squat из имеющегося запаса воды под килем.

Единицы: скорость — узлы, коэффициент общей полноты Cb — безразмерный
(обычно 0.5-0.85), squat — метры.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class SquatResult:
    value: float
    steps: list = field(default_factory=list)


def _check(block_coefficient: float, speed_kn: float):
    """Cb — от 0 до 1, скорость (относительно воды) — не отрицательная."""
    if not (0 < block_coefficient <= 1) or speed_kn < 0:
        raise ValueError("err.ukc.bad_ship_data")


def squat_open_water(block_coefficient: float, speed_kn: float) -> SquatResult:
    """Максимальная просадка на открытой (неограниченной) воде, м."""
    _check(block_coefficient, speed_kn)
    squat = (block_coefficient * speed_kn ** 2) / 100
    steps = [
        CalculationStep(
            description="Просадка (squat) на открытой воде",
            formula="Smax = Cb × V² / 100",
            substitution=f"Smax = {block_coefficient:.3f} × {speed_kn:.2f}² / 100",
            result=f"Smax = {squat:.3f} м",
        )
    ]
    return SquatResult(value=squat, steps=steps)


def squat_confined_channel(block_coefficient: float, speed_kn: float) -> SquatResult:
    """Максимальная просадка в стеснённом фарватере (канал/узкость), м."""
    _check(block_coefficient, speed_kn)
    squat = (block_coefficient * speed_kn ** 2) / 50
    steps = [
        CalculationStep(
            description="Просадка (squat) в стеснённом фарватере (канал/узкость)",
            formula="Smax = Cb × V² / 50",
            substitution=f"Smax = {block_coefficient:.3f} × {speed_kn:.2f}² / 50",
            result=f"Smax = {squat:.3f} м",
        )
    ]
    return SquatResult(value=squat, steps=steps)
