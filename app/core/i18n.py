"""
Минимальная инфраструктура многоязычности (i18n) для ShipHelper.

Дизайн-решение (зафиксировано в CLAUDE.md): приложение изначально
двуязычное (RU/EN), выбор языка — на старте (в финальном PWA) или
переключателем в интерфейсе (сейчас, во временной Streamlit-витрине).

Два независимых, но параллельных механизма перевода:
  1. Контент теории (data/theory/<topic_id>.<lang>.json) — большие
     тексты, каждый язык — отдельный файл. См. core/theory.py.
  2. Строки интерфейса (data/strings/<lang>.json) — короткие подписи,
     заголовки, кнопки. См. t() в этом модуле.

Оба механизма подчиняются одному правилу: если перевода на выбранный
язык нет — используется резервный язык DEFAULT_LANGUAGE ("ru"), а не
пустой экран, исключение или сообщение об ошибке. Это специально:
приложение для судоводителей должно продолжать работать, даже если
перевод конкретного куска ещё не готов.
"""

import json
from pathlib import Path

SUPPORTED_LANGUAGES: list[str] = ["ru", "en"]
LANGUAGE_NAMES: dict[str, str] = {"ru": "Русский", "en": "English"}
DEFAULT_LANGUAGE = "ru"

_STRINGS_DIR = Path(__file__).resolve().parent.parent / "data" / "strings"
_cache: dict[str, dict[str, str]] = {}


def normalize_language(lang: str | None) -> str:
    """Приводит произвольное значение языка к одному из поддерживаемых,
    иначе возвращает язык по умолчанию — не бросает исключение на плохой
    ввод (например, из старой сохранённой настройки пользователя)."""
    if lang in SUPPORTED_LANGUAGES:
        return lang
    return DEFAULT_LANGUAGE


def _load_strings(lang: str) -> dict[str, str]:
    if lang not in _cache:
        path = _STRINGS_DIR / f"{lang}.json"
        if path.exists():
            with open(path, encoding="utf-8") as f:
                _cache[lang] = json.load(f)
        else:
            _cache[lang] = {}
    return _cache[lang]


def t(key: str, lang: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """Возвращает строку интерфейса по ключу на нужном языке.

    Порядок разрешения: запрошенный язык -> DEFAULT_LANGUAGE -> сам ключ
    в квадратных скобках (заметно на глаз в интерфейсе, чтобы недостающий
    перевод было легко найти при тестировании, а не тихо потерять)."""
    lang = normalize_language(lang)
    value = _load_strings(lang).get(key)
    if value is None and lang != DEFAULT_LANGUAGE:
        value = _load_strings(DEFAULT_LANGUAGE).get(key)
    if value is None:
        return f"[[{key}]]"
    return value.format(**kwargs) if kwargs else value
