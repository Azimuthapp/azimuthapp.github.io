"""
«Моё судно» — постоянные данные своего судна и вычисления по ним, чтобы
калькуляторы не требовали вводить одни и те же цифры каждый раз.

Хранение профиля — на стороне интерфейса (pwa/js/ship-profile.js, localStorage);
здесь только расчёты, которые делаются по данным профиля:

  • interpolate_hydro(table, draft) — величины гидростатической таблицы судна
    (водоизмещение, TPC, MTC, LCF, KM) на любую осадку, линейной интерполяцией
    между строками таблицы (так же снимают значения с таблицы вручную);
  • survey_hydrostatics(...) — всё, что драфт-сюрвею нужно снять с таблицы
    для одной съёмки: истинная средняя осадка (те же формулы, что
    core/draft_survey.single_survey), водоизмещение на табличных осадках
    вокруг неё (шаг таблицы), LCF и TPC на истинной осадке, MTC на осадках
    +50 см и −50 см (вторая поправка на дифферент, Nemoto);
  • profile_derived(profile) — производные величины текущего состояния:
    средняя/наибольшая осадка, дифферент, высоты над ватерлинией (глаз,
    препятствие по носу, надводный габарит), водоизмещение/KM/GM по таблице,
    FWA = Δ/(4·TPC) (Barrass & Derrett, «Ship Stability for Masters and Mates»).

Единицы: метры, тонны, т/см (TPC), т·м/см (MTC). Высоты в профиле задаются
НАД КИЛЕМ (не меняются от загрузки), высота над водой = высота над килем − осадка
(допущение: используется средняя осадка; при большом дифференте точнее ввести
осадку в районе мостика/мачты вручную).
"""

from dataclasses import dataclass, field

from core.draft_survey import (
    corrected_draft,
    mean_of_means_of_means,
    mean_of_readings,
    perpendicular_corrections,
    table_bracket,
)

HYDRO_FIELDS = ("displacement", "tpc", "mtc", "lcf", "km")


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


def _clean_table(table):
    """Строки с осадкой > 0, по возрастанию осадки; осадки не должны повторяться."""
    rows = []
    for r in table or []:
        try:
            d = float(r.get("draft", 0) or 0)
        except (TypeError, ValueError):
            continue
        if d <= 0:
            continue
        rows.append({k: float(r.get(k, 0) or 0) for k in ("draft",) + HYDRO_FIELDS})
    rows.sort(key=lambda r: r["draft"])
    if len(rows) < 2:
        raise ValueError("err.ship.table_too_short")
    for a, b in zip(rows, rows[1:]):
        if abs(a["draft"] - b["draft"]) < 1e-9:
            raise ValueError("err.ship.table_duplicate_draft")
    return rows


def interpolate_hydro(table, draft: float) -> dict:
    """Гидростатика на осадку draft (м) — линейная интерполяция между строками.

    table — список {"draft", "displacement", "tpc", "mtc", "lcf", "km"};
    пустые колонки (0 во всех строках) возвращаются как None.
    Осадка вне диапазона таблицы — ошибка (экстраполяция по таблице судна недопустима).
    """
    rows = _clean_table(table)
    d = float(draft)
    if d < rows[0]["draft"] - 1e-9 or d > rows[-1]["draft"] + 1e-9:
        raise ValueError("err.ship.draft_out_of_table",
                         {"draft": f"{d:.3f}", "min": f"{rows[0]['draft']:.2f}", "max": f"{rows[-1]['draft']:.2f}"})
    lo, hi = rows[0], rows[1]
    for a, b in zip(rows, rows[1:]):
        if a["draft"] <= d <= b["draft"]:
            lo, hi = a, b
            break
    f = (d - lo["draft"]) / (hi["draft"] - lo["draft"])
    out = {"draft": d}
    for k in HYDRO_FIELDS:
        present = any(abs(r[k]) > 0 for r in rows)
        out[k] = lo[k] + f * (hi[k] - lo[k]) if present else None
    return out


def survey_hydrostatics(table, method: str,
                        fwd_port: float, fwd_stbd: float,
                        mid_port: float, mid_stbd: float,
                        aft_port: float, aft_stbd: float,
                        dist_fwd: float, dist_mid: float, dist_aft: float,
                        lbp: float, table_step: float) -> dict:
    """Значения гидростатической таблицы для одной съёмки драфт-сюрвея.

    Истинная средняя осадка — теми же функциями, что core/draft_survey.single_survey
    (средние по бортам → приведение к перпендикулярам → mean of means of means),
    поэтому подставленные значения точно соответствуют тому, что потом считает сюрвей.
    """
    if table_step <= 0:
        raise ValueError("err.ship.bad_step")
    mf = mean_of_readings(fwd_port, fwd_stbd).value
    mm = mean_of_readings(mid_port, mid_stbd).value
    ma = mean_of_readings(aft_port, aft_stbd).value
    corr = perpendicular_corrections(method, dist_fwd, dist_mid, dist_aft, mf, mm, ma, lbp)
    df = corrected_draft(mf, corr["corr_fwd"])
    dm = corrected_draft(mm, corr["corr_mid"])
    da = corrected_draft(ma, corr["corr_aft"])
    tmd = mean_of_means_of_means(method, df, dm, da).value
    low, high = table_bracket(tmd, table_step)
    at_low = interpolate_hydro(table, low)
    at_high = interpolate_hydro(table, high)
    at_tmd = interpolate_hydro(table, tmd)
    plus = interpolate_hydro(table, tmd + 0.5)
    minus = interpolate_hydro(table, tmd - 0.5)
    for k, src in (("displacement", at_low), ("tpc", at_tmd), ("lcf", at_tmd), ("mtc", plus)):
        if src[k] is None:
            raise ValueError("err.ship.table_missing_column", {"column": k})
    steps = [
        CalculationStep("Истинная средняя осадка (как в драфт-сюрвее)",
                        "средние по бортам → приведение к перпендикулярам → mean of means of means",
                        f"dF = {df:.3f}, dM = {dm:.3f}, dA = {da:.3f} м", f"dист = {tmd:.3f} м"),
        CalculationStep("Табличные осадки вокруг dист", "шаг таблицы", f"шаг = {table_step:.2f} м",
                        f"{low:.2f} м и {high:.2f} м"),
        CalculationStep("Водоизмещение по таблице судна", "интерполяция между строками таблицы",
                        f"d = {low:.2f} / {high:.2f} м",
                        f"D = {at_low['displacement']:.1f} / {at_high['displacement']:.1f} т"),
        CalculationStep("LCF и TPC на истинной осадке", "интерполяция", f"d = {tmd:.3f} м",
                        f"LCF = {at_tmd['lcf']:+.3f} м, TPC = {at_tmd['tpc']:.3f} т/см"),
        CalculationStep("MTC на осадках dист ± 0.5 м (вторая поправка на дифферент)", "интерполяция",
                        f"d = {tmd + 0.5:.3f} / {tmd - 0.5:.3f} м",
                        f"MTC+50 = {plus['mtc']:.2f}, MTC−50 = {minus['mtc']:.2f} т·м/см"),
    ]
    return {
        "true_mean_draft": tmd, "draft_low": low, "draft_high": high,
        "displacement_low": at_low["displacement"], "displacement_high": at_high["displacement"],
        "lcf": at_tmd["lcf"], "tpc": at_tmd["tpc"],
        "mct_plus50": plus["mtc"], "mct_minus50": minus["mtc"],
        "steps": steps,
    }


def _num(p, k):
    try:
        v = float(p.get(k))
    except (TypeError, ValueError):
        return None
    return v if v == v else None   # NaN → None


def profile_derived(profile: dict) -> dict:
    """Производные величины по профилю судна. Отсутствующие данные → None.

    Ожидаемые ключи (все необязательны): lbp, breadth, summer_displacement, summer_tpc,
    draft_fwd, draft_aft, kg, eye_height_keel, bow_height_keel, mast_height_keel,
    hydro (таблица для interpolate_hydro).
    """
    p = profile or {}
    out = {k: None for k in ("mean_draft", "max_draft", "trim", "displacement", "tpc", "mtc", "lcf",
                             "km", "gm", "eye_above_wl", "bow_above_wl", "air_draft", "fwa")}
    warnings = []
    df, da = _num(p, "draft_fwd"), _num(p, "draft_aft")
    if df and da and df > 0 and da > 0:
        out["mean_draft"] = (df + da) / 2
        out["max_draft"] = max(df, da)
        out["trim"] = da - df
    md = out["mean_draft"]
    if md is not None and p.get("hydro"):
        try:
            h = interpolate_hydro(p["hydro"], md)
            for k in ("displacement", "tpc", "mtc", "lcf", "km"):
                out[k] = h[k]
        except ValueError as e:
            warnings.append(str(e.args[0]) if e.args else "err.ship.table")
    kg = _num(p, "kg")
    if out["km"] and kg and kg > 0:
        out["gm"] = out["km"] - kg
    if md is not None:
        for src, dst in (("eye_height_keel", "eye_above_wl"), ("bow_height_keel", "bow_above_wl"),
                         ("mast_height_keel", "air_draft")):
            v = _num(p, src)
            if v and v > 0:
                out[dst] = v - md
                if out[dst] <= 0:
                    warnings.append("err.ship.height_below_wl")
    sd, st = _num(p, "summer_displacement"), _num(p, "summer_tpc")
    if sd and st and sd > 0 and st > 0:
        out["fwa"] = sd / (4.0 * st) / 1000.0    # FWA = Δ/(4·TPC) в мм → м
    out["warnings"] = warnings
    return out
