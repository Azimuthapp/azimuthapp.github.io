"""
Проход под мостом / ЛЭП: надводный габарит судна и запас по высоте.

  Надводный габарит (air draft) = H_к − d
      H_к — высота наивысшей точки судна над килем (мачта, антенна, стрела), м;
      d   — осадка в районе этой точки (берут наибольшую/кормовую, если не известна), м.

  Габарит под мостом над фактическим уровнем воды:
      C_факт = C_карта + (h_нуля − h_прилива)
      C_карта — высота пролёта по карте/лоции над уровнем, от которого она отсчитана;
      h_нуля  — высота этого уровня над нулём глубин (HAT, MHWS и т. п. по таблицам
                приливов; 0, если габарит дан от нуля глубин);
      h_прилива — высота прилива над нулём глубин в момент прохода.

  Запас = C_факт − air draft;  проход допустим, если запас ≥ требуемого.
  Предельная высота прилива для прохода:  h_пред = C_карта + h_нуля − air draft − запас_треб.

Источники: UKHO «Admiralty Guide to the Practical Use of ENCs» / NP 5011 (вертикальные
габариты на картах Адмиралтейства отсчитываются от HAT); IHO S-4 B-380 (vertical
clearances); практика планирования перехода (IMO Res. A.893(21)). Проседание на ходу
(squat) уменьшает air draft — в расчёте не учитывается, это идёт в запас.
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class AirDraftResult:
    air_draft: float
    clearance_actual: float
    margin: float
    passed: bool
    max_tide: float
    steps: list = field(default_factory=list)


def air_draft_clearance(mast_height_keel_m: float, draft_m: float, charted_clearance_m: float,
                        datum_height_m: float = 0.0, tide_height_m: float = 0.0,
                        required_margin_m: float = 0.0) -> AirDraftResult:
    h, d = float(mast_height_keel_m), float(draft_m)
    if h <= 0:
        raise ValueError("err.air_draft.bad_height")
    if d < 0:
        raise ValueError("err.air_draft.bad_draft")
    if d >= h:
        raise ValueError("err.air_draft.draft_exceeds_height")
    if charted_clearance_m <= 0:
        raise ValueError("err.air_draft.bad_clearance")
    if required_margin_m < 0:
        raise ValueError("err.air_draft.bad_margin")
    ad = h - d
    c = float(charted_clearance_m) + float(datum_height_m) - float(tide_height_m)
    margin = c - ad
    ok = margin >= float(required_margin_m) - 1e-9
    max_tide = float(charted_clearance_m) + float(datum_height_m) - ad - float(required_margin_m)
    steps = [
        CalculationStep("Надводный габарит судна", "AD = Hк − d", f"{h:.2f} − {d:.2f}", f"AD = {ad:.2f} м"),
        CalculationStep("Габарит под мостом над фактическим уровнем воды",
                        "Cфакт = Cкарта + (hнуля − hприлива)",
                        f"{float(charted_clearance_m):.2f} + ({float(datum_height_m):.2f} − {float(tide_height_m):.2f})",
                        f"Cфакт = {c:.2f} м"),
        CalculationStep("Запас по высоте", "Запас = Cфакт − AD", f"{c:.2f} − {ad:.2f}",
                        f"Запас = {margin:.2f} м (требуется ≥ {float(required_margin_m):.2f} м)"),
        CalculationStep("Предельная высота прилива для прохода", "hпред = Cкарта + hнуля − AD − запас",
                        f"{float(charted_clearance_m):.2f} + {float(datum_height_m):.2f} − {ad:.2f} − {float(required_margin_m):.2f}",
                        f"hпред = {max_tide:.2f} м над нулём глубин"),
    ]
    return AirDraftResult(ad, c, margin, ok, max_tide, steps)
