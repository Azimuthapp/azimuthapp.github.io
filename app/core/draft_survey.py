"""
Расчёт драфт-сюрвея — полная методика, воспроизведённая из реального
рабочего файла драфт-сюрвея (предоставлен пользователем, судно
"Pola Varvara", съёмка от 13-15.06.2024, порт Yeisk, груз — пшеница
насыпью). Все формулы сверены построчно с этим файлом и дают идентичный
результат вплоть до груза 5064.877 т — см. tests/test_draft_survey.py,
где входные и ожидаемые значения взяты из этого реального расчёта.

В отличие от упрощённой версии, здесь учтены:
  - 3 схемы приведения осадки к перпендикулярам (в зависимости от того,
    где физически расположены марки углубления на конкретном судне):
    "direct" (прямой вариант), "4_6" и "6_8" (варианты деления пополам)
  - Средняя осадка методом "mean of means of means" с разным весом
    осадки на миделе (4x или 6x) в зависимости от схемы
  - Поправка на дифферент ПЕРВОГО порядка (через LCF и TPC)
  - Поправка на дифферент ВТОРОГО порядка ("Layer correction" /
    поправка Немото — через MCT+50см и MCT-50см из таблиц остойчивости)
  - Груз считается как РАЗНИЦА между начальной (INITIAL, до грузовых
    операций) и конечной (FINAL, после) съёмками — это гасит
    систематические ошибки прибора/методики, а не абсолютное вычитание
    lightship+запасов из одной съёмки
  - Диагностика перегиба корпуса (HOGGED/SAGGED) по сравнению осадки
    миделя с средней осадки носа/кормы

Источник: реальная рабочая методика драфт-сюрвея, применяемая на
практике (стандартный набор формул, используемый сюрвейерами и
старшими помощниками). Требует проверки перед реальным использованием
для спорных грузовых случаев — см. CLAUDE.md, правило 4/8.

Единицы: осадки, расстояния, LBP, LCF — метры; TPC — т/см;
MCT — т·м/см; водоизмещение, дедвейт, груз — тонны; плотность — т/м³.

Знаковые конвенции:
  - trim = d_корма - d_нос (положительный = дифферент на корму — обычный случай)
  - dist_fwd — от носовой марки до НОСОВОГО перпендикуляра ("−", если марка в корму от НП);
    dist_aft — от кормовой марки до КОРМОВОГО перпендикуляра ("+", если марка в нос от КП);
    dist_mid — от марки миделя до мидель-шпангоута ("+", если марка в нос)
    (с чертежа марок углубления судна; методика UNECE: Fc = Fd × trim / LBM)
  - lcf — отстояние центра тяжести ватерлинии от миделя, со знаком как
    указано в гидростатической таблице судна для данной осадки
"""

import math
from dataclasses import dataclass, field

STANDARD_SEAWATER_DENSITY = 1.025  # т/м³ — плотность, для которой обычно даны гидростатические таблицы

VALID_METHODS = ("direct", "4_6", "6_8")


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class DraftSurveyResult:
    value: float
    steps: list[CalculationStep] = field(default_factory=list)


def mean_of_readings(port: float, starboard: float) -> DraftSurveyResult:
    """Средняя осадка в точке замера (среднее левого и правого борта)."""
    mean = (port + starboard) / 2
    steps = [
        CalculationStep(
            description="Средняя осадка в точке замера (борт/борт)",
            formula="d = (d_лб + d_пб) / 2",
            substitution=f"d = ({port:.3f} + {starboard:.3f}) / 2",
            result=f"d = {mean:.3f} м",
        )
    ]
    return DraftSurveyResult(value=mean, steps=steps)


def perpendicular_corrections(
    method: str,
    dist_fwd: float,
    dist_mid: float,
    dist_aft: float,
    mean_fwd: float,
    mean_mid: float,
    mean_aft: float,
    lbp: float,
) -> dict:
    """
    Поправки на приведение осадки к перпендикулярам — по одной из трёх
    схем (зависит от расположения марок углубления на конкретном судне):

      "direct" — прямой вариант, поправки fwd/aft считаются через полный
          дифферент (dA - dF) и полную длину LBP
      "4_6" / "6_8" — варианты деления пополам, поправки fwd/aft считаются
          через половину длины судна (LBP/2) и осадку миделя; отличаются
          друг от друга только весом миделя в mean_of_means_of_means

    Поправка на мидель считается всегда одинаково, независимо от схемы.

    dist_fwd/dist_mid/dist_aft — расстояние соответствующей марки от
        миделя, м ("-" в нос, "+" в корму)
    mean_fwd/mean_mid/mean_aft — средние осадки (борт/борт) в этих точках, м
    lbp — длина между перпендикулярами, м

    Возвращает {"corr_fwd", "corr_mid", "corr_aft", "steps"}
    """
    if method not in VALID_METHODS:
        raise ValueError("err.draft.unknown_method", {"method": method, "valid": ", ".join(VALID_METHODS)})

    half_lbp = lbp / 2

    if method == "direct":
        corr_fwd = (dist_fwd * (mean_aft - mean_fwd)) / ((lbp + dist_fwd) - dist_aft)
        corr_aft = (dist_aft * (mean_aft - mean_fwd)) / ((lbp - dist_aft) + dist_fwd)
        fwd_formula = "КоррFwd = distFwd×(dAft-dFwd) / ((LBP+distFwd)-distAft)"
        aft_formula = "КоррAft = distAft×(dAft-dFwd) / ((LBP-distAft)+distFwd)"
    else:
        # расстояние между носовой маркой и маркой миделя = LBP/2 + distFwd − distMid
        # (distMid «+» — марка миделя в нос; тот же знак, что в поправке на мидель и корму).
        # До 2026-10-05 здесь стояло «+ distMid» (как в рабочем файле судна) — геометрически
        # несогласовано с кормовой поправкой: на прямом корпусе давало неверную осадку на НП.
        corr_fwd = (dist_fwd * (mean_mid - mean_fwd)) / ((half_lbp + dist_fwd) - dist_mid)
        corr_aft = (dist_aft * (mean_aft - mean_mid)) / ((half_lbp + dist_mid) - dist_aft)
        fwd_formula = "КоррFwd = distFwd×(dMid-dFwd) / ((LBP/2+distFwd)-distMid)"
        aft_formula = "КоррAft = distAft×(dAft-dMid) / ((LBP/2+distMid)-distAft)"

    corr_mid = (dist_mid * (mean_aft - mean_fwd)) / ((lbp + dist_fwd) - dist_aft)

    steps = [
        CalculationStep(
            description=f"Поправка на нос (схема '{method}')",
            formula=fwd_formula,
            substitution=f"distFwd={dist_fwd:.2f}, dFwd={mean_fwd:.3f}, dMid={mean_mid:.3f}, dAft={mean_aft:.3f}, LBP={lbp:.2f}",
            result=f"КоррFwd = {corr_fwd:+.4f} м",
        ),
        CalculationStep(
            description="Поправка на мидель (формула не зависит от схемы)",
            formula="КоррMid = distMid×(dAft-dFwd) / ((LBP+distFwd)-distAft)",
            substitution=f"distMid={dist_mid:.2f}",
            result=f"КоррMid = {corr_mid:+.4f} м",
        ),
        CalculationStep(
            description=f"Поправка на корму (схема '{method}')",
            formula=aft_formula,
            substitution=f"distAft={dist_aft:.2f}",
            result=f"КоррAft = {corr_aft:+.4f} м",
        ),
    ]
    return {"corr_fwd": corr_fwd, "corr_mid": corr_mid, "corr_aft": corr_aft, "steps": steps}


def corrected_draft(mean_draft: float, correction: float) -> float:
    """Осадка, приведённая к перпендикуляру: округление среднего и
    поправки по отдельности (как в реальной практике), затем сумма."""
    return round(mean_draft, 3) + round(correction, 3)


def mean_of_means_of_means(method: str, draft_fwd: float, draft_mid: float, draft_aft: float) -> DraftSurveyResult:
    """
    Истинная средняя осадка методом "mean of means of means" — с разным
    весом осадки миделя в зависимости от схемы:
      "4_6": (4×dMid + dFwd + dAft) / 6
      "direct" и "6_8": (6×dMid + dFwd + dAft) / 8

    draft_fwd/draft_mid/draft_aft — осадки, уже приведённые к перпендикулярам, м
    """
    if method not in VALID_METHODS:
        raise ValueError("err.draft.unknown_method", {"method": method, "valid": ", ".join(VALID_METHODS)})

    if method == "4_6":
        value = (4 * draft_mid + draft_fwd + draft_aft) / 6
        formula = "dист = (4×dMid + dFwd + dAft) / 6"
    else:
        value = (6 * draft_mid + draft_fwd + draft_aft) / 8
        formula = "dист = (6×dMid + dFwd + dAft) / 8"

    value = round(value, 3)
    steps = [
        CalculationStep(
            description=f"Истинная средняя осадка ('mean of means of means', схема '{method}')",
            formula=formula,
            substitution=f"dFwd={draft_fwd:.3f}, dMid={draft_mid:.3f}, dAft={draft_aft:.3f}",
            result=f"dист = {value:.3f} м",
        )
    ]
    return DraftSurveyResult(value=value, steps=steps)


def hog_sag_diagnostic(draft_mid_corrected: float, mean_fwd_aft: float) -> dict:
    """
    Диагностика перегиба корпуса: если приведённая осадка миделя меньше
    средней осадки носа/кормы — судно ПЕРЕГНУТО (HOGGED, середина
    "приподнята"); если больше — судно ПРОГНУТО (SAGGED).

    Возвращает {"deflection": м, "status": "HOGGED"/"SAGGED"/"EVEN", "steps"}
    """
    deflection = draft_mid_corrected - mean_fwd_aft
    if abs(deflection) < 1e-9:
        status = "EVEN"
    elif deflection < 0:
        status = "HOGGED"
    else:
        status = "SAGGED"

    steps = [
        CalculationStep(
            description="Диагностика перегиба корпуса",
            formula="Δ = dMid_испр - (dFwd_испр+dAft_испр)/2",
            substitution=f"Δ = {draft_mid_corrected:.3f} - {mean_fwd_aft:.4f}",
            result=f"Δ = {deflection:+.4f} м -> {status}",
        )
    ]
    return {"deflection": deflection, "status": status, "steps": steps}


def table_bracket(value: float, step: float) -> tuple[float, float]:
    """
    Ближайшие табличные значения осадки (кратные шагу таблицы) снизу и
    сверху от заданного значения — для ручного поиска в гидростатической
    таблице судна. Если значение точно попадает на шаг таблицы, верхняя
    граница сдвигается на один шаг вперёд, чтобы интерполяция оставалась
    корректной.
    """
    q = round(value / step, 9)  # 2.30/0.1 = 22.999999… — без округления граница уехала бы на шаг вниз
    low = math.floor(q) * step
    high = math.ceil(q) * step
    if math.isclose(low, high):
        high = low + step
    return round(low, 6), round(high, 6)


def displacement_from_hydrostatic_table(
    true_draft: float,
    draft_low: float,
    displacement_low: float,
    draft_high: float,
    displacement_high: float,
) -> DraftSurveyResult:
    """
    Водоизмещение по гидростатической таблице судна (при её стандартной
    плотности, обычно 1.025) — линейная интерполяция между двумя
    ближайшими табличными значениями осадки (см. table_bracket).

    Формула: D = D_low + (d - d_low)/(d_high - d_low) × (D_high - D_low)
    """
    if draft_high == draft_low:
        raise ValueError("err.draft.draft_high_equals_low")
    fraction = (true_draft - draft_low) / (draft_high - draft_low)
    displacement = displacement_low + fraction * (displacement_high - displacement_low)

    steps = [
        CalculationStep(
            description="Доля интервала между табличными значениями осадки",
            formula="f = (d - d_low) / (d_high - d_low)",
            substitution=f"f = ({true_draft:.3f} - {draft_low:.3f}) / ({draft_high:.3f} - {draft_low:.3f})",
            result=f"f = {fraction:.4f}",
        ),
        CalculationStep(
            description="Водоизмещение по таблице (линейная интерполяция, до поправки на дифферент)",
            formula="D = D_low + f × (D_high - D_low)",
            substitution=f"D = {displacement_low:.1f} + {fraction:.4f} × ({displacement_high:.1f} - {displacement_low:.1f})",
            result=f"D = {displacement:.3f} т",
        ),
    ]
    return DraftSurveyResult(value=displacement, steps=steps)


def first_trim_correction(trim: float, lcf: float, tpc: float, lbp: float) -> DraftSurveyResult:
    """
    Поправка на дифферент первого порядка (через смещение LCF от миделя).

    trim — дифферент = dAft - dFwd (м, "+" на корму)
    lcf — отстояние LCF от миделя, м (знак — как в таблице остойчивости судна)
    tpc — тонн на 1 см осадки при данной осадке, т/см
    lbp — длина между перпендикулярами, м

    Формула: Корр1 = -(trim × LCF × TPC × 100) / LBP
    """
    correction = -(trim * lcf * tpc * 100) / lbp
    steps = [
        CalculationStep(
            description="Поправка на дифферент, первого порядка (через LCF)",
            formula="Корр1 = -(trim × LCF × TPC × 100) / LBP",
            substitution=f"Корр1 = -({trim:+.3f} × {lcf:.2f} × {tpc:.2f} × 100) / {lbp:.2f}",
            result=f"Корр1 = {correction:+.3f} т",
        )
    ]
    return DraftSurveyResult(value=correction, steps=steps)


def second_trim_correction(trim: float, mct_plus50: float, mct_minus50: float, lbp: float) -> DraftSurveyResult:
    """
    Поправка на дифферент второго порядка ("Layer correction" / поправка
    Немото) — учитывает изменение MCT1см при значительном дифференте.

    trim — дифферент = dAft - dFwd, м
    mct_plus50 — момент дифферента на 1см (MCT1cm) при осадке +50см
        относительно текущей, т·м/см
    mct_minus50 — то же при -50см
    lbp — длина между перпендикулярами, м

    Формула: Корр2 = trim² × (MCT+50 - MCT-50) × 50 / LBP
    """
    correction = (trim ** 2) * (mct_plus50 - mct_minus50) * 50 / lbp
    steps = [
        CalculationStep(
            description="Поправка на дифферент, второго порядка (Layer correction)",
            formula="Корр2 = trim² × (MCT+50 - MCT-50) × 50 / LBP",
            substitution=f"Корр2 = {trim:+.3f}² × ({mct_plus50:.2f} - {mct_minus50:.2f}) × 50 / {lbp:.2f}",
            result=f"Корр2 = {correction:+.3f} т",
        )
    ]
    return DraftSurveyResult(value=correction, steps=steps)


def density_correction(
    displacement_table: float,
    actual_density: float,
    table_density: float = STANDARD_SEAWATER_DENSITY,
) -> DraftSurveyResult:
    """
    Поправка водоизмещения на фактическую плотность забортной воды.

    Формула: D_факт = D_табл × (ρ_факт / ρ_табл)
    """
    displacement_actual = displacement_table * (actual_density / table_density)
    steps = [
        CalculationStep(
            description="Водоизмещение с поправкой на фактическую плотность воды",
            formula="Dфакт = Dтабл × (ρфакт / ρтабл)",
            substitution=f"Dфакт = {displacement_table:.3f} × ({actual_density:.4f} / {table_density:.3f})",
            result=f"Dфакт = {displacement_actual:.3f} т",
        )
    ]
    return DraftSurveyResult(value=displacement_actual, steps=steps)


def net_displacement(displacement_actual: float, deductibles: dict[str, float]) -> dict:
    """
    Чистое водоизмещение = фактическое водоизмещение минус сумма всех
    вычитаемых статей запасов (топливо, вода, балласт и т.д. — БЕЗ
    lightship, он вычитается отдельно при необходимости).

    Возвращает {"net": ..., "deductibles_total": ..., "steps": [...]}
    """
    deductibles_total = sum(deductibles.values())
    net = round(displacement_actual, 3) - deductibles_total

    items_str = ", ".join(f"{name}={value:.1f}" for name, value in deductibles.items()) or "нет статей"
    steps = [
        CalculationStep(
            description="Сумма вычитаемых статей запасов",
            formula="ΣЗапасы = сумма всех статей",
            substitution=items_str,
            result=f"ΣЗапасы = {deductibles_total:.1f} т",
        ),
        CalculationStep(
            description="Чистое водоизмещение (без запасов)",
            formula="Dнетто = Dфакт - ΣЗапасы",
            substitution=f"Dнетто = {displacement_actual:.3f} - {deductibles_total:.1f}",
            result=f"Dнетто = {net:.3f} т",
        ),
    ]
    return {"net": net, "deductibles_total": deductibles_total, "steps": steps}


def deductible_items_to_dict(items: list[dict]) -> dict[str, float]:
    """
    Преобразует список произвольных именованных статей запасов
    (например, из редактируемой таблицы интерфейса: тяжёлое топливо,
    дизельное топливо, смазочное масло, пресная вода, сточные воды и
    т.д. — набор категорий не фиксирован и зависит от судна) в словарь
    {имя: вес} для net_displacement()/single_survey(). Пустые имена и
    нулевые/пустые веса пропускаются, повторяющиеся имена суммируются.

    items — список словарей {"name": str, "weight": float}
    """
    result: dict[str, float] = {}
    for item in items:
        name = str(item.get("name") or "").strip()
        try:
            weight = float(item.get("weight") or 0.0)
        except (TypeError, ValueError):
            weight = 0.0
        if not name or weight == 0.0:
            continue
        result[name] = result.get(name, 0.0) + weight
    return result


def single_survey(
    method: str,
    fwd_port: float, fwd_stbd: float,
    mid_port: float, mid_stbd: float,
    aft_port: float, aft_stbd: float,
    dist_fwd: float, dist_mid: float, dist_aft: float,
    lbp: float,
    table_step: float,
    displacement_low: float,
    displacement_high: float,
    lcf: float,
    tpc: float,
    mct_plus50: float,
    mct_minus50: float,
    actual_density: float,
    deductibles: dict[str, float],
    table_density: float = STANDARD_SEAWATER_DENSITY,
) -> dict:
    """
    Полный расчёт одной съёмки (INITIAL или FINAL) целиком — от осадок
    борт/борт до чистого водоизмещения. displacement_low/displacement_high
    — водоизмещения по гидростатической таблице судна для границ
    table_bracket(истинная_осадка, table_step) (их нужно посмотреть в
    таблице судна ПОСЛЕ первого прогона за истинную осадку, либо оценить
    заранее и при необходимости уточнить).

    Возвращает словарь со всеми промежуточными и итоговыми значениями и
    полным списком шагов ("steps") для пошагового отображения.
    """
    mean_fwd = mean_of_readings(fwd_port, fwd_stbd).value
    mean_mid = mean_of_readings(mid_port, mid_stbd).value
    mean_aft = mean_of_readings(aft_port, aft_stbd).value

    corr = perpendicular_corrections(method, dist_fwd, dist_mid, dist_aft, mean_fwd, mean_mid, mean_aft, lbp)

    draft_fwd = corrected_draft(mean_fwd, corr["corr_fwd"])
    draft_mid = corrected_draft(mean_mid, corr["corr_mid"])
    draft_aft = corrected_draft(mean_aft, corr["corr_aft"])

    mean_fwd_aft = (draft_fwd + draft_aft) / 2
    hog_sag = hog_sag_diagnostic(draft_mid, mean_fwd_aft)

    tmdm = mean_of_means_of_means(method, draft_fwd, draft_mid, draft_aft)
    draft_low, draft_high = table_bracket(tmdm.value, table_step)

    disp_table = displacement_from_hydrostatic_table(tmdm.value, draft_low, displacement_low, draft_high, displacement_high)

    trim = draft_aft - draft_fwd
    corr1 = first_trim_correction(trim, lcf, tpc, lbp)
    corr2 = second_trim_correction(trim, mct_plus50, mct_minus50, lbp)
    total_trim_corr = round(corr1.value, 3) + round(corr2.value, 3)
    disp_trim_corrected = disp_table.value + total_trim_corr

    disp_density = density_correction(disp_trim_corrected, actual_density, table_density)
    net = net_displacement(disp_density.value, deductibles)

    all_steps = (
        [mean_of_readings(fwd_port, fwd_stbd).steps[0],
         mean_of_readings(mid_port, mid_stbd).steps[0],
         mean_of_readings(aft_port, aft_stbd).steps[0]]
        + corr["steps"]
        + hog_sag["steps"]
        + tmdm.steps
        + disp_table.steps
        + corr1.steps
        + corr2.steps
        + [CalculationStep(
            description="Водоизмещение с поправкой на дифферент",
            formula="Dдиф = Dтабл + Корр1 + Корр2",
            substitution=f"Dдиф = {disp_table.value:.3f} + {corr1.value:+.3f} + {corr2.value:+.3f}",
            result=f"Dдиф = {disp_trim_corrected:.3f} т",
        )]
        + disp_density.steps
        + net["steps"]
    )

    return {
        "draft_fwd": draft_fwd, "draft_mid": draft_mid, "draft_aft": draft_aft,
        "true_mean_draft": tmdm.value,
        "hog_sag": hog_sag["status"], "deflection": hog_sag["deflection"],
        "displacement_table": disp_table.value,
        "displacement_trim_corrected": disp_trim_corrected,
        "displacement_density_corrected": disp_density.value,
        "net_displacement": net["net"],
        "deductibles_total": net["deductibles_total"],
        "steps": all_steps,
    }


def cargo_from_two_surveys(net_displacement_initial: float, net_displacement_final: float, lightship: float | None = None) -> dict:
    """
    Масса груза, погруженного/выгруженного между двумя съёмками:
    Груз = |Dнетто_final - Dнетто_initial|

    Если передан lightship, дополнительно считается "груз на борту при
    начальной съёмке" (диагностика: остаточный груз/балласт до начала
    операций) = Dнетто_initial - lightship.
    """
    cargo = abs(net_displacement_final - net_displacement_initial)
    steps = [
        CalculationStep(
            description="Масса груза (разница чистых водоизмещений между съёмками)",
            formula="Груз = |Dнетто_final - Dнетто_initial|",
            substitution=f"Груз = |{net_displacement_final:.3f} - {net_displacement_initial:.3f}|",
            result=f"Груз = {cargo:.3f} т",
        )
    ]
    result = {"cargo": cargo, "steps": steps}

    if lightship is not None:
        # "Константа судна" — стандартный морской термин: то, что осталось
        # неучтённым между расчётным Dнетто начальной съёмки и паспортным
        # lightship (обычно накопившаяся грязь/ржавчина/неучтённые запасы,
        # но может указывать и на остаточный груз/балласт до начала
        # операций, если константа заметно больше типичной для судна).
        on_board_initial = net_displacement_initial - lightship
        result["cargo_on_board_at_initial"] = on_board_initial  # оставлено для обратной совместимости
        result["ship_constant"] = on_board_initial
        steps.append(
            CalculationStep(
                description="Константа судна (остаток/неучтённый вес при начальной съёмке)",
                formula="Константа = Dнетто_initial - Lightship",
                substitution=f"Константа = {net_displacement_initial:.3f} - {lightship:.1f}",
                result=f"Константа = {on_board_initial:.3f} т",
            )
        )
    return result
