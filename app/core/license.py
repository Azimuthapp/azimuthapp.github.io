"""
Офлайн-проверка лицензионного ключа для разблокировки платной версии
приложения "Азимут".

Контекст и архитектурное решение (зафиксировано в CLAUDE.md): приложение
полностью офлайн-first (PWA, без своего сервера) — у него физически нет
бэкенда, который мог бы проверить ключ онлайн или привязать его к
конкретному покупателю. Поэтому проверка ключа идёт полностью ЛОКАЛЬНО,
в браузере пользователя (через тот же Pyodide-мост, что и все
калькуляторы) — тем же способом, что deadweight_scale/fwa/прочие
core-модули: одна реализация, используется и фронтендом, и мной при
генерации партий ключей для покупателей.

ЧЕСТНАЯ ОГОВОРКА (как и для всех "неидеальных по определению" модулей
проекта — см. core/blind_distance.py, core/ukc.py::heel_draft_increase):
это НЕ криптографическая защита и не полноценная DRM-система. Проверка —
контрольная сумма по секретной "соли" (SALT), зашитой в код приложения.
Любой, кто прочитает исходный код (а это открытый клиентский JS/Python,
по-другому в офлайн-PWA без сервера не бывает), сможет найти SALT и
сгенерировать свои собственные "валидные" ключи. Цель этого модуля —
не сделать пиратство невозможным (это недостижимо без сервера
активации, который противоречил бы офлайн-принципу приложения), а дать
практичный, самодостаточный способ отличить ключ, который реально был
куплен и сгенерирован продавцом, от случайного набора символов/опечатки
— достаточно для текущего масштаба продаж одного разработчика.

Формат ключа: AZMT-XXXX-XXXX-XXXX-CCCC
  AZMT — неизменный префикс (бренд "Азимут")
  XXXX-XXXX-XXXX — 12 случайных символов полезной нагрузки (payload)
  CCCC — 4-значная контрольная сумма (первые 4 символа hex-digest
         sha256(payload + SALT)), проверяется пересчётом при валидации

Алфавит payload намеренно исключает визуально похожие символы
(0/O, 1/I/L), чтобы ключ было легко продиктовать/напечатать без ошибок.
"""

import hashlib
import secrets

# Разделитель символов, которые легко перепутать на глаз/при наборе,
# из алфавита payload намеренно исключены: 0, O, 1, I, L.
_PAYLOAD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_PREFIX = "AZMT"
_PAYLOAD_LEN = 12
_PAYLOAD_GROUP = 4
_CHECKSUM_LEN = 4

# Секретная "соль" для контрольной суммы. См. честную оговорку в
# докстринге модуля — это НЕ секрет в криптографическом смысле (лежит в
# открытом клиентском коде), а защита от случайных/угаданных строк.
_SALT = "Азимут-2026-shiphelper-license-v1"


def _checksum(payload: str) -> str:
    digest = hashlib.sha256((payload + _SALT).encode("utf-8")).hexdigest()
    return digest[:_CHECKSUM_LEN].upper()


def _format_key(payload: str, checksum: str) -> str:
    groups = [
        payload[i : i + _PAYLOAD_GROUP] for i in range(0, len(payload), _PAYLOAD_GROUP)
    ]
    return "-".join([_PREFIX, *groups, checksum])


def generate_key() -> str:
    """Генерирует один новый валидный лицензионный ключ.

    Используется ПРОДАВЦОМ (не приложением) — партиями, заранее или по
    факту оплаты, для рассылки покупателям. Полностью детерминированно
    проверяется функцией validate_key() без какого-либо сервера."""
    payload = "".join(secrets.choice(_PAYLOAD_ALPHABET) for _ in range(_PAYLOAD_LEN))
    checksum = _checksum(payload)
    return _format_key(payload, checksum)


def validate_key(raw_key: str) -> bool:
    """Проверяет, похож ли ключ на настоящий, сгенерированный generate_key().

    Терпима к пользовательскому вводу: пробелы/регистр/отсутствующие
    дефисы не мешают (покупатель мог скопировать ключ из письма криво
    или ввести его вручную с телефона)."""
    if not raw_key:
        return False
    cleaned = raw_key.strip().upper().replace(" ", "").replace("-", "")
    expected_len = len(_PREFIX) + _PAYLOAD_LEN + _CHECKSUM_LEN
    if len(cleaned) != expected_len:
        return False
    if not cleaned.startswith(_PREFIX):
        return False
    payload = cleaned[len(_PREFIX) : len(_PREFIX) + _PAYLOAD_LEN]
    checksum = cleaned[len(_PREFIX) + _PAYLOAD_LEN :]
    if any(ch not in _PAYLOAD_ALPHABET for ch in payload):
        return False
    return _checksum(payload) == checksum
