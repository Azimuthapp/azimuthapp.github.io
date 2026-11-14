"""
Журнал корректуры: учёт полученных Извещений мореплавателям (ИМ) и
навигационных предупреждений NAVAREA — для самоконтроля штурмана.

Что делает модуль (чистые функции, без хранения данных):
  * parse_numbers("125, 127-131") — разбор номеров в том виде, как их
    удобно вписывать по выпуску: отдельные номера, диапазоны «127-131»,
    разделители — запятая, точка с запятой, пробел;
  * compress_numbers([1, 2, 3, 7]) — обратное: «1–3, 7»;
  * summarize_log(entries, ...) — сводка за год: сколько выпусков/ИМ/
    NAVAREA отмечено, диапазон номеров, ПРОПУЩЕННЫЕ номера (дыры в
    нумерации), повторы и выпуски, где корректура ещё не отмечена.

Почему пропуски — главное: ИМ, выпуски ИМ и предупреждения NAVAREA
нумеруются сквозной нумерацией с начала года, поэтому разрыв в номерах —
верный признак того, что что-то не получено или не внесено. Сам модуль
ничего не знает о реальных номерах конкретного года — только сверяет
нумерацию того, что ввёл штурман. Это помощник для самоконтроля, а не
замена Журнала учёта корректуры карт и пособий и требований СУБ.

Начало отсчёта: если задано (например, судно приняло корректуру с ИМ
№ 1 этого года), пропуски считаются от него; если нет — от наименьшего
введённого номера (типично для судна, начавшего вести учёт в середине
года).

Хранение журнала — в браузере (localStorage), см. pwa/js/calculators.js
::setupNoticesLog.
"""

import re
from typing import Dict, Iterable, List, Optional

# Защита от опечатки вида «1-100000»: столько номеров за год не бывает.
MAX_RANGE = 5000


def parse_numbers(text) -> List[int]:
    """Разбирает строку номеров: «125, 127-131; 133» → [125, 127, ..., 131, 133].

    Допускаются: пробелы, запятые, точки с запятой, знак «№», тире
    (-, –, —) в диапазонах. Возвращает отсортированный список без повторов.
    Пустая строка/None → [].

    Ошибки (ValueError с кодом для перевода):
      err.notices.bad_number  — фрагмент не является номером/диапазоном;
      err.notices.bad_range   — диапазон «от» больше «до» или слишком длинный.
    """
    if text is None:
        return []
    if isinstance(text, (int, float)):
        n = int(text)
        return [n] if n > 0 else []
    s = str(text).replace("№", " ").replace("–", "-").replace("—", "-")
    s = re.sub(r"\s*-\s*", "-", s.strip())
    result = set()
    for token in re.split(r"[,;\s]+", s):
        if not token:
            continue
        m = re.fullmatch(r"(\d+)(?:-(\d+))?", token)
        if not m:
            raise ValueError("err.notices.bad_number", {"token": token})
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        if b < a or b - a > MAX_RANGE:
            raise ValueError("err.notices.bad_range", {"token": token})
        if a < 1:
            raise ValueError("err.notices.bad_number", {"token": token})
        result.update(range(a, b + 1))
    return sorted(result)


def compress_numbers(numbers: Iterable[int]) -> str:
    """[1, 2, 3, 7, 9, 10] → «1–3, 7, 9–10». Пустой список → «»."""
    nums = sorted(set(int(n) for n in numbers))
    if not nums:
        return ""
    parts = []
    start = prev = nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
            continue
        parts.append(f"{start}–{prev}" if prev > start else f"{start}")
        start = prev = n
    parts.append(f"{start}–{prev}" if prev > start else f"{start}")
    return ", ".join(parts)


def _series_summary(lists: List[List[int]], start: Optional[int]) -> Dict:
    """Сводка по одной сквозной нумерации (выпуски, ИМ или NAVAREA)."""
    seen: Dict[int, int] = {}
    for nums in lists:
        for n in nums:
            seen[n] = seen.get(n, 0) + 1
    numbers = sorted(seen)
    if not numbers:
        return {"count": 0, "first": None, "last": None, "missing": [], "missing_text": "",
                "duplicates": [], "duplicates_text": "", "received_text": ""}
    first = int(start) if start else numbers[0]
    last = numbers[-1]
    if last - first > MAX_RANGE:
        # слишком большой разрыв — скорее всего опечатка в номере; не пишем «пропусков нет»
        raise ValueError("err.notices.range_too_large")
    missing = [n for n in range(first, last + 1) if n not in seen]
    duplicates = [n for n in numbers if seen[n] > 1]
    return {
        "count": len(numbers),
        "first": first,
        "last": last,
        "missing": missing,
        "missing_text": compress_numbers(missing),
        "duplicates": duplicates,
        "duplicates_text": compress_numbers(duplicates),
        "received_text": compress_numbers(numbers),
    }


def summarize_log(entries: List[Dict], start_issue=None, start_notice=None, start_navarea=None) -> Dict:
    """Сводка журнала корректуры за год.

    entries — список записей {"issue": "14", "notices": "125-131",
    "navarea": "045, 046", "done": True/False}. Поля можно оставлять
    пустыми (например, запись только с предупреждением NAVAREA).

    Возвращает {"issues": {...}, "notices": {...}, "navarea": {...},
    "pending_issues"/"pending_notices": номера выпусков и ИМ из записей
    без отметки «откорректировано» (+ *_text), "entries": число записей}. Каждая из трёх
    частей — см. _series_summary: count, first, last, missing,
    missing_text, duplicates, duplicates_text, received_text.
    """
    issues, notices, navarea, p_iss, p_nts = [], [], [], [], []
    for e in entries or []:
        iss = parse_numbers(e.get("issue"))
        nts = parse_numbers(e.get("notices"))
        nav = parse_numbers(e.get("navarea"))
        if not (iss or nts or nav):
            continue
        issues.append(iss)
        notices.append(nts)
        navarea.append(nav)
        if not e.get("done"):
            p_iss.extend(iss)
            p_nts.extend(nts)
    return {
        "issues": _series_summary(issues, start_issue),
        "notices": _series_summary(notices, start_notice),
        "navarea": _series_summary(navarea, start_navarea),
        "pending_issues": sorted(set(p_iss)),
        "pending_issues_text": compress_numbers(p_iss),
        "pending_notices": sorted(set(p_nts)),
        "pending_notices_text": compress_numbers(p_nts),
        "entries": len(issues),
    }
