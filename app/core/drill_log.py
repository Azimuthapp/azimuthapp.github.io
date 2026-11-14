"""
Журнал учёта судовых тревог/учений — отслеживание периодичности
проведения (противопожарная тревога, оставление судна, человек за
бортом, тревога по входу в закрытые помещения и т.п.) и расчёт даты
следующего планового проведения по выбранной периодичности.

ЧЕСТНО про охват: периодичность многих реальных тревог по SOLAS/МКУБ
(ISM Code) задаётся КАЛЕНДАРНЫМ месяцем/кварталом (например "не реже
одного раза в календарный месяц"), а не фиксированным числом дней — это
не одно и то же (в месяце бывает от 28 до 31 дня). Поэтому для
периодичностей "раз в месяц"/"ежеквартально"/"раз в полгода"/"раз в год"
здесь используется КАЛЕНДАРНАЯ арифметика месяцев (прибавление месяцев
к дате, с переносом дня при более коротком месяце — 31 января + 1 месяц
= 28/29 февраля), а не умножение на условное число дней. Периодичность
"при смене экипажа" — НЕ календарная: следующая дата заранее не
известна (зависит от фактической смены экипажа), поэтому следующая дата
для нее не считается — это честно показано в интерфейсе (статус
"по событию"), а не придумывается несуществующая дата.

Это НЕ замена судового Журнала учебных тревог и требований конкретной
СУБ (Системы управления безопасностью компании) по минимальной
периодичности каждого вида тревоги — периодичность для каждой тревоги
выбирает сам пользователь (здесь нет жёстко заданных нормативных
требований по конкретным типам тревог, т.к. они определяются СУБ
компании и могут отличаться по типу судна/рейса).

Хранение самого журнала (список тревог и дат) — НЕ в этом модуле: это
чистая функция расчёта дат/статуса, данные хранятся в браузере
(localStorage) на стороне PWA, см. pwa/js/calculators.js::setupDrillLog.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


PERIODICITY_CHOICES = ("weekly", "monthly", "quarterly", "semi_annual", "annual", "crew_change")

_MONTHS_BY_PERIODICITY = {
    "monthly": 1,
    "quarterly": 3,
    "semi_annual": 6,
    "annual": 12,
}


def add_months(d: date, months: int) -> date:
    """Прибавляет календарные месяцы к дате, с переносом дня при более
    коротком месяце (31 января + 1 месяц = 28/29 февраля, не 3 марта)."""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def next_due_date(last_performed: date, periodicity: str) -> Optional[date]:
    """Дата следующего планового проведения. None для periodicity=
    "crew_change" — заранее не известна, это не календарная периодичность."""
    if periodicity == "weekly":
        return last_performed + timedelta(days=7)
    if periodicity in _MONTHS_BY_PERIODICITY:
        return add_months(last_performed, _MONTHS_BY_PERIODICITY[periodicity])
    if periodicity == "crew_change":
        return None
    raise ValueError("err.drill_log.unknown_periodicity")


def drill_status(
    name: str,
    periodicity: str,
    last_performed_iso: str,
    today_iso: str,
    due_soon_days: int = 7,
) -> dict:
    """
    Статус одной тревоги на дату today_iso.

    last_performed_iso/today_iso — даты в формате ISO "YYYY-MM-DD".
    due_soon_days — за сколько дней до срока статус переходит в
    "приближается" (практический выбор интерфейса для подсветки, не
    норматив СУБ).

    Возвращает dict: name, periodicity, last_performed (ISO),
    due_date (ISO или None), days_remaining (int или None),
    status ("overdue"/"due_soon"/"ok"/"manual"), steps.
    """
    try:
        last_performed = date.fromisoformat(str(last_performed_iso))
        today = date.fromisoformat(str(today_iso))
    except ValueError:
        raise ValueError("err.drill.bad_date")

    due = next_due_date(last_performed, periodicity)

    if due is None:
        steps = [
            CalculationStep(
                description=f"Следующая плановая дата — «{name}»",
                formula="периодичность «при смене экипажа» — дата заранее не известна",
                substitution=f"последнее проведение {last_performed.isoformat()}",
                result="следующая дата не вычисляется (по событию)",
            )
        ]
        return {
            "name": name,
            "periodicity": periodicity,
            "last_performed": last_performed.isoformat(),
            "due_date": None,
            "days_remaining": None,
            "status": "manual",
            "steps": [s.__dict__ for s in steps],
        }

    days_remaining = (due - today).days
    if days_remaining < 0:
        status = "overdue"
    elif days_remaining <= due_soon_days:
        status = "due_soon"
    else:
        status = "ok"

    steps = [
        CalculationStep(
            description=f"Следующая плановая дата — «{name}»",
            formula="дата_следующей = дата_последней + периодичность (календарная)",
            substitution=f"{last_performed.isoformat()} + {periodicity}",
            result=f"дата_следующей = {due.isoformat()}",
        ),
        CalculationStep(
            description="Дней до срока (на сегодня)",
            formula="дней_до_срока = дата_следующей − сегодня",
            substitution=f"{due.isoformat()} − {today.isoformat()}",
            result=f"дней_до_срока = {days_remaining}",
        ),
    ]
    return {
        "name": name,
        "periodicity": periodicity,
        "last_performed": last_performed.isoformat(),
        "due_date": due.isoformat(),
        "days_remaining": days_remaining,
        "status": status,
        "steps": [s.__dict__ for s in steps],
    }


def drill_statuses(drills: List[dict], today_iso: str, due_soon_days: int = 7) -> List[dict]:
    """Статус по списку тревог, отсортированный по срочности.

    drills — список словарей {name, periodicity, last_performed (ISO)}.
    Возвращает список результатов drill_status (просроченные → скоро →
    в порядке → по событию, внутри группы — по возрастанию дней)."""
    # пустые строки (добавлены «+», ничего не введено) пропускаем
    drills = [d for d in drills if str(d.get("name", "")).strip() or str(d.get("last_performed", "")).strip()]
    results = [
        drill_status(d["name"], d["periodicity"], d["last_performed"], today_iso, due_soon_days)
        for d in drills
    ]

    order = {"overdue": 0, "due_soon": 1, "ok": 2, "manual": 3}

    def sort_key(r):
        dr = r["days_remaining"]
        return (order[r["status"]], dr if dr is not None else 0)

    results.sort(key=sort_key)
    return results
