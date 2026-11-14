"""
"Мёртвая зона" по носу (forward blind distance / blind sector) —
расстояние от форштевня вперёд по курсу, которое НЕ просматривается с
поста управления (мостика) из-за того, что бак/надстройка/груз
закрывает обзор линии горизонта у самого борта.

Требование к величине этой зоны нормировано (SOLAS Reg. V/22 — не
более 2 корпусов судна или 500 м, смотря что меньше, от форштевня;
Panama Canal Authority (ACP) задаёт свои, более строгие пороги по типу
судна и загрузке — см. https://officerofthewatch.com/2012/10/10/
panama-canal-bridge-visibility-requirements/, которая и даёт
определение: "the forward distance from the bow of the vessel to the
closest point on the water's surface which can be seen from all
conning positions"), но САМА ФОРМУЛА расчёта расстояния по геометрии
судна ни в SOLAS, ни в проверенных источниках явно не приводится — это
стандартная теорема подобных треугольников, выведенная здесь
самостоятельно (не процитирована из справочника, как большинство
формул проекта, а именно выведена — отмечено явно по правилу 3 CLAUDE.md).

Вывод: луч зрения из глаза наблюдателя на посту управления (высота H
над ватерлинией) идёт по прямой, касаясь верхней точки препятствия
(высота h над ватерлинией, расположенного на горизонтальном расстоянии
d от поста управления в сторону носа), и продолжается до пересечения
с поверхностью воды в точке на расстоянии D от поста управления.
Из подобия треугольников (прямая линия, убывающая от высоты H на
расстоянии 0 до высоты 0 на расстоянии D):

    (H − h) / d = H / D  =>  D = H × d / (H − h)

"Слепая зона" вперёд от самого препятствия (например, от форштевня,
если оно и есть препятствие):

    blind_distance = D − d = d × h / (H − h)

Требует H > h (иначе луч зрения вообще не достигает воды впереди
препятствия — обзора вперёд нет вообще, до какой угодно дистанции).
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class BlindDistanceResult:
    blind_distance: float
    steps: list[CalculationStep] = field(default_factory=list)


def blind_distance(
    eye_height_m: float,
    obstruction_height_m: float,
    distance_to_obstruction_m: float,
) -> BlindDistanceResult:
    """
    eye_height_m (H) — высота глаза наблюдателя на посту управления над
        ватерлинией, метры
    obstruction_height_m (h) — высота препятствия (бак, груз, леерное
        ограждение и т.п.) над ватерлинией в точке, ближайшей к носу,
        которая закрывает обзор, метры
    distance_to_obstruction_m (d) — горизонтальное расстояние от поста
        управления до этого препятствия, метры (если препятствие — сам
        форштевень, это расстояние от мостика до бака)
    """
    if eye_height_m <= obstruction_height_m:
        raise ValueError("err.blind_distance.eye_not_above_obstruction")
    if distance_to_obstruction_m < 0:
        raise ValueError("err.blind_distance.negative_distance")

    result = distance_to_obstruction_m * obstruction_height_m / (
        eye_height_m - obstruction_height_m
    )
    steps = [
        CalculationStep(
            description="Слепая зона вперёд от препятствия (по подобию треугольников)",
            formula="blind = d × h / (H − h)",
            substitution=(
                f"blind = {distance_to_obstruction_m:.1f} × {obstruction_height_m:.2f} / "
                f"({eye_height_m:.2f} − {obstruction_height_m:.2f})"
            ),
            result=f"blind = {result:.1f} м",
        )
    ]
    return BlindDistanceResult(blind_distance=result, steps=steps)
