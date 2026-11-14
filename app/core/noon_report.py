"""
Ноон-репорт (Noon Report) — суточная сводка перехода: средняя скорость
за отчётные сутки, суточный расход топлива, остаток топлива (ROB) и
прогноз оставшегося времени/автономности по текущему расходу.

Расстояние, пройденное за отчётный период (distance_run_nm), берётся
готовым числом (по GPS/счислению/лагу — как оно и заполняется в реальном
ноон-репорте судоводителем), а не пересчитывается заново по паре
координат — расчёт дистанции между двумя точками уже есть отдельным
инструментом (ортодромия/локсодромия, `core/sailing.py`), дублировать
его здесь смысла нет: на практике вахтенный уже знает пройденное
расстояние (с счислителя/GPS), а не вычисляет его вручную по noon-to-
noon координатам.

Все формулы здесь — простая, не требующая внешнего источника
арифметика (среднее = путь/время, суточный расход = факт.расход ×
24/факт.часы, автономность = остаток/суточный_расход) — не формулы из
учебника, а определения самих показателей.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class NoonReportResult:
    average_speed_kn: float
    daily_consumption_mt: float
    rob_after_mt: float
    time_to_go_hours: float | None
    endurance_days: float | None
    steps: list[CalculationStep] = field(default_factory=list)


def noon_report(
    distance_run_nm: float,
    elapsed_hours: float,
    fuel_consumed_mt: float,
    rob_before_mt: float,
    distance_to_go_nm: float | None = None,
) -> NoonReportResult:
    """
    distance_run_nm — расстояние, пройденное за отчётный период
        (обычно ~24ч), морские мили, по GPS/счислению/лагу
    elapsed_hours — фактически прошедшее время отчётного периода, часы
        (не обязательно ровно 24 — например, при переводе часов/если
        отчёт короче суток)
    fuel_consumed_mt — топливо, израсходованное за отчётный период,
        метрические тонны
    rob_before_mt (Remaining On Board) — остаток топлива на начало
        отчётного периода, метрические тонны
    distance_to_go_nm — оставшееся расстояние до следующей точки/порта,
        морские мили (опционально — если не задано, время в пути и
        автономность до цели не считаются)
    """
    if elapsed_hours <= 0:
        raise ValueError("err.noon_report.elapsed_hours_must_be_positive")
    if rob_before_mt < 0 or fuel_consumed_mt < 0 or distance_run_nm < 0:
        raise ValueError("err.noon_report.negative_fuel")
    if fuel_consumed_mt > rob_before_mt:
        raise ValueError("err.noon_report.consumed_exceeds_rob")
    if distance_to_go_nm is not None and distance_to_go_nm < 0:
        raise ValueError("err.noon_report.negative_fuel")

    average_speed = distance_run_nm / elapsed_hours
    daily_consumption = fuel_consumed_mt * (24.0 / elapsed_hours)
    rob_after = rob_before_mt - fuel_consumed_mt

    steps = [
        CalculationStep(
            description="Средняя скорость за отчётный период",
            formula="V_ср = S_пройдено / t_отчёта",
            substitution=f"V_ср = {distance_run_nm:.1f} / {elapsed_hours:.2f}",
            result=f"V_ср = {average_speed:.2f} уз",
        ),
        CalculationStep(
            description="Расход топлива, приведённый к суткам",
            formula="Расход/сутки = Расход_факт × (24 / t_отчёта)",
            substitution=f"Расход/сутки = {fuel_consumed_mt:.2f} × (24 / {elapsed_hours:.2f})",
            result=f"Расход/сутки = {daily_consumption:.2f} т/сут",
        ),
        CalculationStep(
            description="Остаток топлива на конец отчётного периода (ROB)",
            formula="ROB_после = ROB_до − Расход_факт",
            substitution=f"ROB_после = {rob_before_mt:.2f} − {fuel_consumed_mt:.2f}",
            result=f"ROB_после = {rob_after:.2f} т",
        ),
    ]

    time_to_go = None
    endurance_days = None
    if distance_to_go_nm is not None:
        if average_speed <= 0:
            raise ValueError("err.noon_report.zero_speed_no_eta")
        time_to_go = distance_to_go_nm / average_speed
        steps.append(
            CalculationStep(
                description="Время в пути до цели при сохранении средней скорости",
                formula="t_ост = S_ост / V_ср",
                substitution=f"t_ост = {distance_to_go_nm:.1f} / {average_speed:.2f}",
                result=f"t_ост = {time_to_go:.1f} ч ({time_to_go / 24.0:.2f} сут)",
            )
        )
    # Автономность от расстояния до цели не зависит — считаем всегда
    if daily_consumption > 0:
        endurance_days = rob_after / daily_consumption
        steps.append(
            CalculationStep(
                description="Автономность по остатку топлива при текущем расходе",
                formula="Автономность = ROB_после / Расход_сутки",
                substitution=f"Автономность = {rob_after:.2f} / {daily_consumption:.2f}",
                result=f"Автономность = {endurance_days:.1f} сут",
            )
        )

    return NoonReportResult(
        average_speed_kn=average_speed,
        daily_consumption_mt=daily_consumption,
        rob_after_mt=rob_after,
        time_to_go_hours=time_to_go,
        endurance_days=endurance_days,
        steps=steps,
    )
