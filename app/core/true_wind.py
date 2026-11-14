"""
Расчёт истинного ветра (скорость и направление) по видимому (кажущемуся)
ветру, замеренному на движущемся судне, и собственной скорости/курсу
судна.

Источник формулы: стандартное векторное соотношение
    Вектор_видимого_ветра = Вектор_истинного_ветра + Вектор_скорости_судна
(судно "создаёт" дополнительный кажущийся ветер своим движением,
складывающийся с истинным ветром) — общепринятая методика, используемая
во всех судовых/яхтенных вычислителях ветра (см. например разбор
векторного треугольника ветра на https://www.katamarans.com/wind-speed-
calculator-true-apparent/ и https://www.bwsailing.com/cc/2017/05/
calculating-the-true-wind-and-why-it-matters/). Отсюда обратное
соотношение: Вектор_истинного = Вектор_видимого - Вектор_скорости_судна.

Углы (курсовой угол ветра, КУВ) отсчитываются от носа судна (0°) по
часовой стрелке (борт правый — положительные значения до 180°), как
принято в судовой практике; это НАПРАВЛЕНИЕ, ОТКУДА дует ветер
относительно диаметральной плоскости судна (не куда дует).

В разложении на составляющие (x — вдоль ДП судна в нос, y — на правый
борт) компонента скорости судна учитывается только по оси x (судно
движется вперёд по своей ДП), что и даёт формулы ниже:

    TWx = AWS·cos(КУВ_ветра) − V_судна
    TWy = AWS·sin(КУВ_ветра)
    TWS = √(TWx² + TWy²)
    КУВ_истинного = atan2(TWy, TWx)   (нормализовано в 0..360°)

Истинное направление ветра (относительно норда) = ИК_судна + КУВ_истинного,
нормализовано в диапазон [0, 360).
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
class TrueWindResult:
    true_wind_speed: float
    true_wind_angle: float  # курсовой угол, 0-360, от носа судна
    true_wind_direction: float | None  # относительно норда, если дан ИК судна
    steps: list[CalculationStep] = field(default_factory=list)


def _normalize(angle: float) -> float:
    return angle % 360.0


def true_wind(
    apparent_wind_speed: float,
    apparent_wind_angle: float,
    ship_speed: float,
    ship_heading: float | None = None,
) -> TrueWindResult:
    """
    apparent_wind_speed (AWS) — видимая скорость ветра, узлы (или м/с —
        единица переносится в TWS без изменений, лишь бы совпадала с
        ship_speed)
    apparent_wind_angle (КУВ) — курсовой угол видимого ветра, градусы,
        0° = прямо по носу, отсчёт по часовой стрелке (0-360)
    ship_speed (V) — скорость судна, те же единицы, что и AWS
    ship_heading (ИК) — истинный курс судна, градусы 0-360; если задан,
        дополнительно считается истинное направление ветра относительно
        норда (иначе true_wind_direction = None, доступен только
        курсовой угол)
    """
    if apparent_wind_speed < 0 or ship_speed < 0:
        raise ValueError("err.true_wind.negative_speed")
    awa_rad = math.radians(apparent_wind_angle)
    twx = apparent_wind_speed * math.cos(awa_rad) - ship_speed
    twy = apparent_wind_speed * math.sin(awa_rad)
    tws = math.hypot(twx, twy)
    twa = _normalize(math.degrees(math.atan2(twy, twx)))

    steps = [
        CalculationStep(
            description="Продольная составляющая истинного ветра (вдоль ДП судна)",
            formula="TWx = AWS × cos(КУВ) − V_судна",
            substitution=f"TWx = {apparent_wind_speed:.2f} × cos({apparent_wind_angle:.1f}°) − {ship_speed:.2f}",
            result=f"TWx = {twx:.2f}",
        ),
        CalculationStep(
            description="Поперечная составляющая истинного ветра",
            formula="TWy = AWS × sin(КУВ)",
            substitution=f"TWy = {apparent_wind_speed:.2f} × sin({apparent_wind_angle:.1f}°)",
            result=f"TWy = {twy:.2f}",
        ),
        CalculationStep(
            description="Истинная скорость ветра",
            formula="TWS = √(TWx² + TWy²)",
            substitution=f"TWS = √({twx:.2f}² + {twy:.2f}²)",
            result=f"TWS = {tws:.2f}",
        ),
        CalculationStep(
            description="Курсовой угол истинного ветра (от носа судна)",
            formula="КУВ_ист = atan2(TWy, TWx)",
            substitution=f"КУВ_ист = atan2({twy:.2f}, {twx:.2f})",
            result=f"КУВ_ист = {twa:.1f}°",
        ),
    ]

    true_direction = None
    if ship_heading is not None:
        true_direction = _normalize(ship_heading + twa)
        steps.append(
            CalculationStep(
                description="Истинное направление ветра относительно норда",
                formula="Направление = ИК_судна + КУВ_ист",
                substitution=f"Направление = {ship_heading:.1f}° + {twa:.1f}°",
                result=f"Направление = {true_direction:.1f}°",
            )
        )

    return TrueWindResult(
        true_wind_speed=tws,
        true_wind_angle=twa,
        true_wind_direction=true_direction,
        steps=steps,
    )
