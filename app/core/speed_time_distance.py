"""
Расчёт "скорость-время-расстояние" (Speed / Time / Distance) и времени
прибытия (ETA) — базовая штурманская задача счисления пути.

Источник формул: классическое уравнение равномерного движения,
адаптированное под морские единицы (расстояние в морских милях,
скорость в узлах = морских милях в час). Стандартная штурманская
практика, не требует ссылки на конкретный документ.

Единицы: расстояние — морские мили (nm), скорость — узлы (уз, nm/ч),
время — часы (может быть дробным, например 2.5 ч = 2ч 30мин).
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class StdResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def hours_to_hm(hours: float) -> str:
    """Форматирует дробные часы как 'Ч ч ММ мин' для читаемости."""
    total_minutes = round(hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h} ч {m:02d} мин"


def distance_from_speed_time(speed_knots: float, time_hours: float) -> StdResult:
    """
    Пройденное расстояние: S = V × t

    speed_knots (V) — скорость, узлы
    time_hours (t) — время в пути, часы
    """
    distance = speed_knots * time_hours
    steps = [
        CalculationStep(
            description="Пройденное расстояние",
            formula="S = V × t",
            substitution=f"S = {speed_knots:.2f} × {time_hours:.3f}",
            result=f"S = {distance:.2f} миль",
        )
    ]
    return StdResult(value=distance, steps=steps)


def time_from_distance_speed(distance_nm: float, speed_knots: float) -> StdResult:
    """
    Время в пути: t = S / V

    distance_nm (S) — расстояние, морские мили
    speed_knots (V) — скорость, узлы
    """
    if speed_knots == 0:
        raise ValueError("err.std.speed_zero")
    time_hours = distance_nm / speed_knots
    steps = [
        CalculationStep(
            description="Время в пути",
            formula="t = S / V",
            substitution=f"t = {distance_nm:.2f} / {speed_knots:.2f}",
            result=f"t = {time_hours:.3f} ч ({hours_to_hm(time_hours)})",
        )
    ]
    return StdResult(value=time_hours, steps=steps)


def speed_from_distance_time(distance_nm: float, time_hours: float) -> StdResult:
    """
    Скорость: V = S / t

    distance_nm (S) — расстояние, морские мили
    time_hours (t) — время в пути, часы
    """
    if time_hours == 0:
        raise ValueError("err.std.time_zero")
    speed = distance_nm / time_hours
    steps = [
        CalculationStep(
            description="Скорость",
            formula="V = S / t",
            substitution=f"V = {distance_nm:.2f} / {time_hours:.3f}",
            result=f"V = {speed:.2f} уз",
        )
    ]
    return StdResult(value=speed, steps=steps)


def required_speed_for_deadline(
    current_time: datetime, deadline: datetime, distance_nm: float
) -> StdResult:
    """
    Требуемая скорость (Required Speed), чтобы пройти distance_nm и
    прибыть точно к deadline — тот же V = S/t, где t берётся не вводом
    напрямую, а как разность (deadline − текущее время). Отдельная
    функция (не просто speed_from_distance_time), т.к. в реальной
    практике время в пути на такой вопрос не считают в уме заранее —
    его тоже нужно посчитать первым шагом расчёта.

    current_time — текущее время
    deadline — требуемое время прибытия
    distance_nm (S) — оставшееся расстояние, морские мили
    """
    delta = deadline - current_time
    time_hours = delta.total_seconds() / 3600.0
    if time_hours <= 0:
        raise ValueError("err.std.deadline_not_in_future")

    speed_result = speed_from_distance_time(distance_nm, time_hours)
    steps = [
        CalculationStep(
            description="Время, оставшееся до требуемого прибытия",
            formula="t = T_прибытия − T_тек",
            substitution=(
                f"t = {deadline.strftime('%d.%m %H:%M')} − {current_time.strftime('%d.%m %H:%M')}"
            ),
            result=f"t = {time_hours:.3f} ч ({hours_to_hm(time_hours)})",
        )
    ]
    steps.extend(speed_result.steps)
    return StdResult(value=speed_result.value, steps=steps)


@dataclass
class WaypointLeg:
    """Один участок многоточечного маршрута — результат для одной точки."""
    name: str
    distance_nm: float
    speed_knots: float
    leg_time_hours: float
    eta: datetime


def multi_waypoint_eta(
    departure_time: datetime, legs: list[tuple[str, float, float]]
) -> dict:
    """
    ETA по маршруту из нескольких точек (waypoints), на каждом участке
    может быть своя скорость (например, снижение хода на подходе к
    узкости/порту). Просто накопление t=S/V по участкам с накоплением
    времени прибытия — тот же принцип, что и обычный ETA, примененный
    последовательно.

    departure_time — время отхода/начала счёта от первой точки
    legs — список кортежей (название_точки, расстояние_до_неё_nm,
        скорость_на_этом_участке_узлы), в порядке следования маршрута

    Возвращает {"legs": [WaypointLeg, ...], "total_distance": float,
        "total_time_hours": float, "final_eta": datetime}
    """
    if not legs:
        raise ValueError("err.std.no_waypoints")

    current_time = departure_time
    total_distance = 0.0
    total_time = 0.0
    results: list[WaypointLeg] = []
    for name, distance_nm, speed_knots in legs:
        time_result = time_from_distance_speed(distance_nm, speed_knots)
        current_time = current_time + timedelta(hours=time_result.value)
        total_distance += distance_nm
        total_time += time_result.value
        results.append(
            WaypointLeg(
                name=name,
                distance_nm=distance_nm,
                speed_knots=speed_knots,
                leg_time_hours=time_result.value,
                eta=current_time,
            )
        )

    return {
        "legs": results,
        "total_distance": total_distance,
        "total_time_hours": total_time,
        "final_eta": current_time,
    }


def eta(current_time: datetime, distance_nm: float, speed_knots: float) -> dict:
    """
    Расчётное время прибытия (ETA) по текущему времени, оставшемуся
    расстоянию и скорости.

    current_time — текущее время (datetime, с учётом того часового пояса,
        в котором ведётся счисление на судне)
    distance_nm — оставшееся расстояние до точки, морские мили
    speed_knots — скорость судна, узлы

    Возвращает словарь {"eta": datetime, "steps": [...]}
    """
    time_result = time_from_distance_speed(distance_nm, speed_knots)
    arrival = current_time + timedelta(hours=time_result.value)
    steps = list(time_result.steps)
    steps.append(
        CalculationStep(
            description="Расчётное время прибытия (ETA)",
            formula="ETA = Т_тек + t",
            substitution=(
                f"ETA = {current_time.strftime('%d.%m %H:%M')} + "
                f"{hours_to_hm(time_result.value)}"
            ),
            result=f"ETA = {arrival.strftime('%d.%m.%Y %H:%M')}",
        )
    )
    return {"eta": arrival, "steps": steps}
