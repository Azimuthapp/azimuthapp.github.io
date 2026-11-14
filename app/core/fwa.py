"""
Поправка на пресную/солоноватую воду при осадке в порту — Fresh Water
Allowance (FWA) и Dock Water Allowance (DWA). Стандартные формулы остойчивости/
грузовых расчётов (см., например, Barrass & Derrett, "Ship Stability for
Masters and Mates" — расчёт FWA/DWA по водоизмещению, TPC и плотности
воды в доке/порту).

FWA — на сколько мм судно "осядет" при переходе из морской воды
(1.025 т/м³) в пресную (1.000 т/м³) при неизменном водоизмещении:

    FWA (мм) = Δ / (4 × TPC)

где Δ — водоизмещение, т; TPC — тонн на 1 см осадки (т/см).

DWA — то же самое, но для промежуточной плотности воды дока/порта (не
полностью пресной и не полностью морской):

    DWA (мм) = FWA × (1.025 − ρ_дока) / 0.025

где ρ_дока — плотность воды в доке/порту, т/м³ (между 1.000 и 1.025 в
типичном случае; при ρ=1.025 DWA=0 — поправка не нужна, вода уже морская).

Применение на практике: при погрузке в пресной/солоноватой воде судно
осядет глубже, чем было бы в море на ту же массу груза — DWA вычитается
из допустимой по грузовой марке осадки, чтобы в море (где судно
"всплывёт" на DWA выше) осадка не превысила грузовую марку.

Единицы: водоизмещение — т, TPC — т/см, плотность — т/м³, FWA/DWA — мм.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class FwaDwaResult:
    fwa_mm: float
    dwa_mm: float
    steps: list[CalculationStep] = field(default_factory=list)


def fwa_dwa(displacement_t: float, tpc_t_per_cm: float, dock_water_density_t_m3: float) -> FwaDwaResult:
    """FWA и DWA по водоизмещению, TPC и плотности воды в доке/порту.

    displacement_t — водоизмещение судна на момент расчёта, т.
    tpc_t_per_cm — тонн на 1 см осадки при этом водоизмещении, т/см (та
        же величина, что уже умеет давать core/deadweight_scale.py по
        грузовой шкале судна).
    dock_water_density_t_m3 — плотность воды в доке/порту, т/м³.
    """
    if tpc_t_per_cm <= 0:
        raise ValueError("err.fwa.tpc_must_be_positive")
    if displacement_t <= 0:
        raise ValueError("err.fwa.displacement_must_be_positive")
    if dock_water_density_t_m3 <= 0:
        raise ValueError("err.fwa.density_must_be_positive")

    steps: list[CalculationStep] = []

    fwa = displacement_t / (4 * tpc_t_per_cm)
    steps.append(
        CalculationStep(
            description="Fresh Water Allowance (поправка на пресную воду)",
            formula="FWA = Δ / (4 × TPC)",
            substitution=f"FWA = {displacement_t:.2f} / (4 × {tpc_t_per_cm:.3f})",
            result=f"FWA = {fwa:.1f} мм",
        )
    )

    dwa = fwa * (1.025 - dock_water_density_t_m3) / 0.025
    steps.append(
        CalculationStep(
            description="Dock Water Allowance (поправка на воду дока/порта)",
            formula="DWA = FWA × (1.025 − ρ_дока) / 0.025",
            substitution=f"DWA = {fwa:.1f} × (1.025 − {dock_water_density_t_m3:.4f}) / 0.025",
            result=f"DWA = {dwa:.1f} мм",
        )
    )

    return FwaDwaResult(fwa_mm=round(fwa, 1), dwa_mm=round(dwa, 1), steps=steps)
