"""
Временная потеря остойчивости при подъёме груза крановой стрелой
(судовым краном/грузовой стрелой) — "Effect of a Suspended Weight",
стандартная тема курса остойчивости (Barrass & Derrett, "Ship Stability
for Masters and Mates").

Пока груз висит в воздухе на тросе (оторван от палубы/пирса, но ещё не
опущен на место), его вес считается ПРИЛОЖЕННЫМ НЕ к своему фактическому
положению, а к точке подвеса (нок/вершина грузовой стрелы или крюк
крана) — именно в этой точке груз эффективно "крепится" к судну через
трос, независимо от того, насколько глубоко он провис. Это мгновенно
поднимает эффективный центр тяжести судна G, снижая метацентрическую
высоту GM ровно на момент подъёма — даже если ни вес груза, ни его
изначальное/конечное положение (твиндек/трюм/причал) по отдельности не
меняют остойчивость судна в статике до и после самой операции подъёма.

Формула (подобие статического момента, та же логика, что и в
core/stability.py::heel_from_transverse_shift):

    GG1 = (w × d) / Δ

где:
  w — масса поднимаемого груза, т;
  d — вертикальное расстояние от исходного положения центра тяжести
      груза (на палубе/в трюме/на причале) до точки подвеса (нок стрелы/
      крюк крана), м;
  Δ — водоизмещение судна (включая сам груз), т.

GM после подъёма = GM до подъёма − GG1.

ЧЕСТНАЯ ОГОВОРКА (тот же принцип, что в core/stability.py): это
стандартная, но УПРОЩЁННАЯ учебная модель — реальная остойчивость при
грузовых операциях с тяжеловесами регулируется "Информацией об
остойчивости для капитана" конкретного судна и судовым планом подъёма
(crane/lifting plan), а не одной этой формулой.

Единицы: водоизмещение — т, GM — м, масса груза — т, расстояние — м.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class SuspendedLoadResult:
    gg1_m: float
    gm_after_m: float
    is_negative: bool
    steps: list[CalculationStep] = field(default_factory=list)


def suspended_load_gm_loss(
    displacement_t: float,
    gm_before_m: float,
    weight_t: float,
    suspension_height_m: float,
) -> SuspendedLoadResult:
    """Снижение GM при подъёме груза крановой стрелой/краном.

    displacement_t — водоизмещение судна (с учётом поднимаемого груза), т.
    gm_before_m — метацентрическая высота ДО начала подъёма, м.
    weight_t — масса поднимаемого груза, т.
    suspension_height_m — вертикальное расстояние от исходного положения
        центра тяжести груза до точки подвеса (нок стрелы/крюк крана), м
        (всегда положительное — точка подвеса выше груза).
    """
    if displacement_t <= 0:
        raise ValueError("err.suspended_load.displacement_must_be_positive")
    if weight_t < 0:
        raise ValueError("err.suspended_load.negative_weight")
    if suspension_height_m < 0:
        raise ValueError("err.suspended_load.negative_height")

    steps: list[CalculationStep] = []

    gg1 = (weight_t * suspension_height_m) / displacement_t
    steps.append(
        CalculationStep(
            description="Виртуальный подъём центра тяжести судна (GG1)",
            formula="GG1 = (w × d) / Δ",
            substitution=f"GG1 = ({weight_t:.2f} × {suspension_height_m:.2f}) / {displacement_t:.2f}",
            result=f"GG1 = {gg1:.3f} м",
        )
    )

    gm_after = gm_before_m - gg1
    steps.append(
        CalculationStep(
            description="Метацентрическая высота во время подъёма груза",
            formula="GM' = GM − GG1",
            substitution=f"GM' = {gm_before_m:.3f} − {gg1:.3f}",
            result=f"GM' = {gm_after:.3f} м",
        )
    )

    return SuspendedLoadResult(
        gg1_m=round(gg1, 3),
        gm_after_m=round(gm_after, 3),
        is_negative=gm_after < 0,
        steps=steps,
    )
