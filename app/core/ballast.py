"""
Расчёт балласта по танкам — сумма веса балласта в отдельных танках на
основе объёма, снятого с калибровочной таблицы конкретного танка по
факту промера (sounding). Калибровочная таблица танка — своя для
каждого корпуса/танка, её даёт судостроитель (обычно отдельная книга
или программа загрузки), поэтому в этом модуле объём вводится уже
готовым (после того как судоводитель сам снял его со своей таблицы по
своему промеру) — задача этого модуля не подменяет калибровочную
таблицу судна, а только считает вес и суммирует по всем танкам.

Источник: лист "Ballast" реального рабочего файла драфт-сюрвея (тот же
источник, что и core/draft_survey.py) — там расчёт по ~28 позициям
танков, каждая: объём (м³) × плотность балластной воды (т/м³) = вес
танка (т); сумма всех танков = общий балласт.

ВАЖНО (реальная находка при сверке файла): в исходном файле лист
"Ballast" и лист "DS report" НЕ были связаны формулой — сумма по
танкам начальной съёмки (3596.42094 т) и вручную вписанная в отчёт
цифра статьи "Балласт" (21.3 т) заметно расходились. Формулы этого
модуля проверены и дают именно 3596.42094 т (начальная) и 23.57688 т
(конечная) — см. tests/test_ballast.py. Автоматическая подстановка
итога этого расчёта в статью "Балласт" итогового net_displacement
(вместо переписывания цифры вручную) убирает риск такой рассинхронизации.

Единицы: объём — м³, плотность — т/м³, вес — т.
"""

from dataclasses import dataclass

from core.draft_survey import CalculationStep


@dataclass
class BallastTankResult:
    name: str
    volume: float
    density: float
    weight: float


def tank_weight(name: str, volume: float, density: float) -> BallastTankResult:
    """Вес балласта в одном танке = Объём × Плотность."""
    weight = round(volume * density, 3)
    return BallastTankResult(name=name, volume=volume, density=density, weight=weight)


def ballast_total(tanks: list[dict]) -> dict:
    """
    tanks — список словарей {"name": str, "volume": float, "density": float}.
    volume — объём в танке, м³ (уже снятый с калибровочной таблицы танка
    по факту промера); density — плотность балластной/забортной воды в
    этом танке, т/м³. Танки с нулевым/пустым объёмом пропускаются
    (сухой танк не участвует в сумме, но не считается ошибкой).

    Возвращает {"total": т, "breakdown": [BallastTankResult...], "steps": [...]}
    """
    breakdown: list[BallastTankResult] = []
    steps: list[CalculationStep] = []
    total = 0.0
    for t in tanks:
        name = str(t.get("name") or "").strip()
        try:
            volume = float(t.get("volume") or 0.0)
        except (TypeError, ValueError):
            volume = 0.0
        try:
            density = float(t.get("density") or 0.0)
        except (TypeError, ValueError):
            density = 0.0
        if not name or volume == 0.0:
            continue
        tank = tank_weight(name, volume, density)
        breakdown.append(tank)
        total += tank.weight
        steps.append(
            CalculationStep(
                description=f"Вес балласта в танке «{name}»",
                formula="Вес = Объём × Плотность",
                substitution=f"Вес = {volume:.2f} м³ × {density:.4f} т/м³",
                result=f"Вес = {tank.weight:.3f} т",
            )
        )

    total = round(total, 3)
    breakdown_str = " + ".join(f"{b.weight:.2f}" for b in breakdown) or "0"
    steps.append(
        CalculationStep(
            description="Общий балласт по всем танкам",
            formula="Балласт_итого = Σ(Объём_i × Плотность_i)",
            substitution=breakdown_str,
            result=f"Балласт_итого = {total:.3f} т",
        )
    )
    return {"total": total, "breakdown": breakdown, "steps": steps}
