"""
Формирование печатного отчёта по проведённому драфт-сюрвею — Excel и
Word. Отдельно от расчётной логики (draft_survey.py), но всё ещё без
зависимости от Streamlit — просто использует openpyxl/python-docx,
чтобы этот код можно было переиспользовать и вне временного Streamlit-
интерфейса (например, если позже отчёт понадобится генерировать не
только по кнопке в браузере).

Входной формат — единый словарь `data`, собираемый интерфейсом из
результатов single_survey()/cargo_from_two_surveys():

data = {
    "vessel": str,              # название судна, может быть пустым
    "method": str,               # "direct" / "4_6" / "6_8"
    "lang": str,                 # "ru"/"en" — язык отчёта (опционально,
                                  # по умолчанию DEFAULT_LANGUAGE)
    "common": {"lbp", "dist_fwd", "dist_mid", "dist_aft", "table_step"},
    "lightship": float,
    "constant": float,           # ship_constant из cargo_from_two_surveys
    "cargo": float,
    "disclaimer": str,           # текст дисклеймера, опционально
    "surveys": [
        {
            "label": str,                       # "INITIAL — ..." / "FINAL — ..."
            "drafts_input": {"fwd_port", "fwd_stbd", "mid_port", "mid_stbd", "aft_port", "aft_stbd"},
            "table": {"displacement_low", "displacement_high"},
            "hydrostatics": {"lcf", "tpc", "mct_plus50", "mct_minus50", "actual_density"},
            "deductibles": {имя: вес, ...},      # включая "Балласт"
            "result": <словарь, возвращаемый single_survey()>,
        },
        ...  # INITIAL, затем FINAL
    ],
}

Языковая инфраструктура (i18n): подписи отчёта берутся через
core.i18n.t(key, lang) из неймспейса "report.draft.*" в
data/strings/{ru,en}.json — тот же механизм, что и в app/main.py.
survey["label"] (INITIAL/FINAL) и disclaimer уже приходят переведёнными
из интерфейса. Названия статей запасов (deductibles) и название судна —
пользовательские данные, не переводятся. Статус перегиба корпуса
(HOGGED/SAGGED/EVEN из core/draft_survey.py) — уже условный английский
термин, не зависящий от языка интерфейса.
"""

from datetime import datetime
from io import BytesIO

from core.i18n import DEFAULT_LANGUAGE, t


def build_excel_report(data: dict) -> bytes:
    """Собирает .xlsx отчёт (лист сводки + лист шагов расчёта на каждую съёмку)."""
    import openpyxl
    from openpyxl.styles import Font

    lang = data.get("lang", DEFAULT_LANGUAGE)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = t("report.draft.sheet_title", lang)
    bold = Font(bold=True)
    bold_lg = Font(bold=True, size=13)

    def row(*vals):
        ws.append(list(vals))
        return ws.max_row

    vessel = data.get("vessel") or t("report.draft.vessel_unspecified", lang)
    r = row(t("report.draft.title", lang, vessel=vessel))
    ws.cell(r, 1).font = Font(bold=True, size=15)
    row(t("report.draft.generated_at", lang, date=f"{datetime.now():%d.%m.%Y %H:%M}"))
    row(t("report.draft.method_line", lang, method=data["method"]))
    row()

    r = row(t("report.draft.vessel_params_header", lang))
    ws.cell(r, 1).font = bold_lg
    c = data["common"]
    row(t("report.draft.lbp_label", lang), c["lbp"])
    row(t("report.draft.dist_fwd_label", lang), c["dist_fwd"])
    row(t("report.draft.dist_mid_label", lang), c["dist_mid"])
    row(t("report.draft.dist_aft_label", lang), c["dist_aft"])
    row(t("report.draft.table_step_label", lang), c["table_step"])
    row(t("report.draft.lightship_label", lang), data["lightship"])
    row()

    for survey in data["surveys"]:
        r = row(survey["label"])
        ws.cell(r, 1).font = bold_lg
        d = survey["drafts_input"]
        row(t("report.draft.drafts_fwd_label", lang), d["fwd_port"], d["fwd_stbd"])
        row(t("report.draft.drafts_mid_label", lang), d["mid_port"], d["mid_stbd"])
        row(t("report.draft.drafts_aft_label", lang), d["aft_port"], d["aft_stbd"])
        tbl = survey["table"]
        row(t("report.draft.table_disp_label", lang), tbl["displacement_low"], tbl["displacement_high"])
        h = survey["hydrostatics"]
        row(t("report.draft.lcf_label", lang), h["lcf"])
        row(t("report.draft.tpc_label", lang), h["tpc"])
        row(t("report.draft.mct_plus_label", lang), h["mct_plus50"])
        row(t("report.draft.mct_minus_label", lang), h["mct_minus50"])
        row(t("report.draft.density_label", lang), h["actual_density"])
        r = row(t("report.draft.deductibles_header", lang))
        ws.cell(r, 1).font = bold
        for name, val in survey["deductibles"].items():
            row(name, val)

        res = survey["result"]
        row(t("report.draft.corrected_drafts_label", lang), res["draft_fwd"], res["draft_mid"], res["draft_aft"])
        row(t("report.draft.true_mean_draft_label", lang), res["true_mean_draft"])
        row(t("report.draft.hog_sag_label", lang), res["hog_sag"])
        row(t("report.draft.disp_table_label", lang), res["displacement_table"])
        row(t("report.draft.disp_trim_label", lang), res["displacement_trim_corrected"])
        row(t("report.draft.disp_density_label", lang), res["displacement_density_corrected"])
        row(t("report.draft.deductibles_total_label", lang), res["deductibles_total"])
        row(t("report.draft.net_displacement_label", lang), res["net_displacement"])
        row()

    r = row(t("report.draft.totals_header", lang))
    ws.cell(r, 1).font = bold_lg
    row(t("report.draft.constant_label", lang), data["constant"])
    row(t("report.draft.cargo_label", lang), data["cargo"])
    if data.get("disclaimer"):
        row()
        row(data["disclaimer"])

    ws.column_dimensions["A"].width = 42
    for col in "BCD":
        ws.column_dimensions[col].width = 16

    steps_prefix = t("report.draft.steps_sheet_prefix", lang)
    for survey in data["surveys"]:
        sheet_name = f"{steps_prefix} {survey['label'][:20]}"[:31]
        ws2 = wb.create_sheet(sheet_name)
        ws2.append([
            t("report.draft.steps_col_description", lang),
            t("report.draft.steps_col_formula", lang),
            t("report.draft.steps_col_substitution", lang),
            t("report.draft.steps_col_result", lang),
        ])
        for cell in ws2[1]:
            cell.font = bold
        for step in survey["result"]["steps"]:
            ws2.append([step.description, step.formula, step.substitution, step.result])
        widths = (42, 34, 42, 22)
        for col, width in zip("ABCD", widths):
            ws2.column_dimensions[col].width = width

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_word_report(data: dict) -> bytes:
    """Собирает .docx отчёт — сводка по каждой съёмке с шагами расчёта, для печати."""
    from docx import Document

    lang = data.get("lang", DEFAULT_LANGUAGE)

    doc = Document()
    vessel = data.get("vessel") or t("report.draft.vessel_unspecified", lang)
    doc.add_heading(t("report.draft.title", lang, vessel=vessel), level=1)
    doc.add_paragraph(t("report.draft.generated_at", lang, date=f"{datetime.now():%d.%m.%Y %H:%M}"))
    doc.add_paragraph(t("report.draft.method_line", lang, method=data["method"]))

    doc.add_heading(t("report.draft.vessel_params_header", lang), level=2)
    c = data["common"]
    table = doc.add_table(rows=0, cols=2, style="Table Grid")
    for label, val in (
        (t("report.draft.lbp_label", lang), c["lbp"]),
        (t("report.draft.dist_fwd_label", lang), c["dist_fwd"]),
        (t("report.draft.dist_mid_label", lang), c["dist_mid"]),
        (t("report.draft.dist_aft_label", lang), c["dist_aft"]),
        (t("report.draft.table_step_label", lang), c["table_step"]),
        (t("report.draft.lightship_label", lang), data["lightship"]),
    ):
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = f"{val}"

    point_fwd = t("report.draft.point_fwd", lang)
    point_mid = t("report.draft.point_mid", lang)
    point_aft = t("report.draft.point_aft", lang)

    for survey in data["surveys"]:
        doc.add_heading(survey["label"], level=2)
        d = survey["drafts_input"]
        t2 = doc.add_table(rows=1, cols=3, style="Table Grid")
        hdr = t2.rows[0].cells
        hdr[0].text, hdr[1].text, hdr[2].text = (
            t("report.draft.point_label", lang),
            t("report.draft.port_col", lang),
            t("report.draft.stbd_col", lang),
        )
        for point, pk, sk in (
            (point_fwd, "fwd_port", "fwd_stbd"),
            (point_mid, "mid_port", "mid_stbd"),
            (point_aft, "aft_port", "aft_stbd"),
        ):
            rc = t2.add_row().cells
            rc[0].text = point
            rc[1].text = f"{d[pk]:.3f}"
            rc[2].text = f"{d[sk]:.3f}"

        res = survey["result"]
        doc.add_paragraph(t("report.draft.true_mean_draft_line", lang, value=res["true_mean_draft"], hog_sag=res["hog_sag"]))
        doc.add_paragraph(t("report.draft.net_displacement_line", lang, value=res["net_displacement"]))

        doc.add_heading(t("report.draft.deductibles_header", lang), level=3)
        t3 = doc.add_table(rows=0, cols=2, style="Table Grid")
        for name, val in survey["deductibles"].items():
            rc = t3.add_row().cells
            rc[0].text = name
            rc[1].text = f"{val:.2f}"

        doc.add_heading(t("report.draft.calc_steps_header", lang), level=3)
        for step in res["steps"]:
            p = doc.add_paragraph()
            p.add_run(f"{step.description}: ").bold = True
            p.add_run(f"{step.formula} | {step.substitution} → {step.result}")

    doc.add_heading(t("report.draft.totals_header", lang), level=2)
    doc.add_paragraph(t("report.draft.constant_line", lang, value=data["constant"]))
    doc.add_paragraph(t("report.draft.cargo_line", lang, value=data["cargo"]))
    if data.get("disclaimer"):
        doc.add_paragraph(data["disclaimer"])

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()
