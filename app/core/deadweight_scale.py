"""
Расчёт тоннажа по осадке через грузовую шкалу судна (Deadweight Scale /
Hydrostatic Table) — быстрая прикидка водоизмещения, TPC и MTC по текущей
средней осадке, без полного 6-точечного драфт-сюрвея (core/draft_survey.py).

Как и в core/ballast.py/core/bunker.py, этот модуль НЕ подменяет и не
хранит саму грузовую шкалу судна (гидростатическую таблицу) — она даётся
судостроителем в судовых документах (обычно "Hydrostatic Particulars"/
"Deadweight Scale") и своя для каждого корпуса. Пользователь вводит
несколько опорных строк (осадка → водоизмещение/TPC/MTC) из этой таблицы,
калькулятор линейно интерполирует между ними по текущей осадке — тот же
принцип, что уже используется в core/bunker.py::interpolate_table для
калибровочных таблиц танков.

Единицы: осадка — м, водоизмещение — т, TPC (tonnes per centimetre
immersion) — т/см, MTC (moment to change trim 1 cm) — т·м/см.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class DeadweightScaleResult:
    displacement_t: float
    tpc: float
    mtc: float
    steps: list[CalculationStep] = field(default_factory=list)


def _interp_column(table: list[tuple], col_index: int, draft_m: float) -> tuple[float, float, float, float]:
    """Линейная интерполяция одной колонки таблицы по осадке.

    Возвращает (значение, x0, y0, x1) для построения шага расчёта — y1
    браться из той же строки table, что и x1, отдельно в вызывающем коде.
    """
    for row0, row1 in zip(table, table[1:]):
        x0, x1 = row0[0], row1[0]
        if x0 <= draft_m <= x1:
            y0, y1 = row0[col_index], row1[col_index]
            if x1 == x0:
                value = y0
            else:
                value = y0 + (y1 - y0) * (draft_m - x0) / (x1 - x0)
            return value, x0, y0, x1
    raise ValueError("err.deadweight_scale.draft_out_of_range")


def deadweight_from_draft(table: list[tuple[float, float, float, float]], draft_m: float) -> DeadweightScaleResult:
    """Водоизмещение/TPC/MTC по текущей средней осадке через грузовую шкалу.

    table — грузовая шкала судна, список строк (осадка_м, водоизмещение_т,
        TPC_т/см, MTC_т·м/см), ОТСОРТИРОВАННЫЙ по возрастанию осадки — те
        же опорные точки, что судоводитель сам снимает с судовой
        гидростатической таблицы/грузовой шкалы.
    draft_m — текущая средняя осадка судна, м.

    Экстраполяция за пределы введённой таблицы не выполняется (та же
    осторожность, что и в core/bunker.py::interpolate_table) —
    err.deadweight_scale.draft_out_of_range.
    """
    table = sorted({tuple(float(v) for v in row) for row in table})  # строки могли быть введены не по порядку
    if len(table) < 2:
        raise ValueError("err.deadweight_scale.table_too_short")
    if draft_m < table[0][0] or draft_m > table[-1][0]:
        raise ValueError("err.deadweight_scale.draft_out_of_range")

    steps: list[CalculationStep] = []

    disp, x0, y0, x1 = _interp_column(table, 1, draft_m)
    y1 = next(r[1] for r in table if r[0] == x1)
    steps.append(
        CalculationStep(
            description="Водоизмещение по грузовой шкале",
            formula="Δ = Δ0 + (Δ1 − Δ0) × (d − d0) / (d1 − d0)",
            substitution=f"Δ = {y0:.2f} + ({y1:.2f} − {y0:.2f}) × ({draft_m:.3f} − {x0:.3f}) / ({x1:.3f} − {x0:.3f})",
            result=f"Δ = {disp:.2f} т",
        )
    )

    tpc, x0t, y0t, x1t = _interp_column(table, 2, draft_m)
    y1t = next(r[2] for r in table if r[0] == x1t)
    steps.append(
        CalculationStep(
            description="TPC (тонн на 1 см осадки) по грузовой шкале",
            formula="TPC = TPC0 + (TPC1 − TPC0) × (d − d0) / (d1 − d0)",
            substitution=f"TPC = {y0t:.3f} + ({y1t:.3f} − {y0t:.3f}) × ({draft_m:.3f} − {x0t:.3f}) / ({x1t:.3f} − {x0t:.3f})",
            result=f"TPC = {tpc:.3f} т/см",
        )
    )

    mtc, x0m, y0m, x1m = _interp_column(table, 3, draft_m)
    y1m = next(r[3] for r in table if r[0] == x1m)
    steps.append(
        CalculationStep(
            description="MTC (момент на изменение дифферента 1 см) по грузовой шкале",
            formula="MTC = MTC0 + (MTC1 − MTC0) × (d − d0) / (d1 − d0)",
            substitution=f"MTC = {y0m:.3f} + ({y1m:.3f} − {y0m:.3f}) × ({draft_m:.3f} − {x0m:.3f}) / ({x1m:.3f} − {x0m:.3f})",
            result=f"MTC = {mtc:.3f} т·м/см",
        )
    )

    return DeadweightScaleResult(
        displacement_t=round(disp, 2),
        tpc=round(tpc, 3),
        mtc=round(mtc, 3),
        steps=steps,
    )
