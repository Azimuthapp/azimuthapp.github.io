"""
Конвертеры единиц измерения и координат — не судовождческая формула, а
чистая арифметика, которая постоянно нужна штурману под рукой: перевести
узлы в км/ч, метры в футы, десятичные градусы в градусы/минуты/секунды и
обратно. Добавлено по фидбеку пользователя: сравнили ShipHelper с похожим
конкурентным приложением (много reference-инструментов на Play Market) —
такие конвертеры конкурент тоже предлагает, и в отличие от "живых"
данных (погода, порты, GRIB) или больших справочников (IALA, COLREG) это
чистый расчёт без внешних данных — ложится в текущую архитектуру core/ +
Pyodide без изменений. См. CLAUDE.md, раздел про группу "Инструменты".

Единицы:
  Скорость: узлы (kn), км/ч (kmh), м/с (ms)
  Расстояние: морские мили (nm), км (km), метры (m), кабельтовы (cbl,
    1 кабельтов = 1/10 морской мили — стандарт в штурманской практике)
  Глубина/осадка: метры (m), футы (ft), морские сажени (fathom, 1 сажень
    = 6 футов — исторически используется на английских картах)
"""

from dataclasses import dataclass, field


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class ConverterResult:
    value: float
    unit: str
    steps: list[CalculationStep] = field(default_factory=list)


@dataclass
class DmsResult:
    degrees: int
    minutes: int
    seconds: float
    hemisphere: str
    formatted: str
    steps: list[CalculationStep] = field(default_factory=list)


# Коэффициенты перевода "в базовую единицу" (для скорости — м/с, для
# расстояния — метры). Каждая пара unit->base и base->unit получается
# делением/умножением на один и тот же коэффициент — меньше места для
# ошибки, чем таблица N×N комбинаций.
_SPEED_TO_MS = {
    "kn": 0.5144444444444445,  # 1 узел = 1 морская миля/час = 1852 м / 3600 с
    "kmh": 1.0 / 3.6,
    "ms": 1.0,
}
_SPEED_LABEL = {"kn": "уз", "kmh": "км/ч", "ms": "м/с"}

_DISTANCE_TO_M = {
    "nm": 1852.0,
    "km": 1000.0,
    "m": 1.0,
    "cbl": 185.2,  # 1 кабельтов = 1/10 морской мили = 185.2 м
}
_DISTANCE_LABEL = {"nm": "миль", "km": "км", "m": "м", "cbl": "каб"}

_DEPTH_TO_M = {
    "m": 1.0,
    "ft": 0.3048,
    "fathom": 1.8288,  # 1 морская сажень = 6 футов = 1.8288 м
}
_DEPTH_LABEL = {"m": "м", "ft": "фт", "fathom": "морск. саж."}

# Добавлено по прямому запросу пользователя — перевод кубических футов в
# кубометры и обратно нужен для подсчёта stowage factor груза (многие
# грузовые документы/коносаменты на генеральный груз дают объём в ft³,
# а судовые грузовые планы и калибровочные таблицы — в м³).
# 1 фут³ = 0.3048³ м³ = 0.028316846592 м³ (точное значение из определения
# международного фута, не округление).
_VOLUME_TO_M3 = {
    "m3": 1.0,
    "ft3": 0.028316846592,
    "l": 0.001,
}
_VOLUME_LABEL = {"m3": "м³", "ft3": "фут³", "l": "л"}


def _convert(
    value: float, from_unit: str, to_unit: str, table: dict, label: dict, category: str, base_label: str
) -> ConverterResult:
    if from_unit not in table or to_unit not in table:
        raise ValueError(f"err.converters.{category}.unknown_unit")

    base_value = value * table[from_unit]
    result_value = base_value / table[to_unit]

    steps = [
        CalculationStep(
            description=f"Перевод в базовую единицу ({base_label})",
            formula=f"base = value × k[{from_unit}]",
            substitution=f"base = {value:.4f} × {table[from_unit]:.6f}",
            result=f"base = {base_value:.6f}",
        ),
        CalculationStep(
            description=f"Перевод из базовой единицы в {label[to_unit]}",
            formula=f"result = base ÷ k[{to_unit}]",
            substitution=f"result = {base_value:.6f} ÷ {table[to_unit]:.6f}",
            result=f"result = {result_value:.4f} {label[to_unit]}",
        ),
    ]
    return ConverterResult(value=result_value, unit=label[to_unit], steps=steps)


def convert_speed(value: float, from_unit: str, to_unit: str) -> ConverterResult:
    """Перевод скорости между узлами (kn), км/ч (kmh) и м/с (ms)."""
    return _convert(value, from_unit, to_unit, _SPEED_TO_MS, _SPEED_LABEL, "speed", "м/с")


def convert_distance(value: float, from_unit: str, to_unit: str) -> ConverterResult:
    """Перевод расстояния между милями (nm), км (km), метрами (m), кабельтовыми (cbl)."""
    return _convert(value, from_unit, to_unit, _DISTANCE_TO_M, _DISTANCE_LABEL, "distance", "м")


def convert_depth(value: float, from_unit: str, to_unit: str) -> ConverterResult:
    """Перевод глубины/осадки между метрами (m), футами (ft), саженями (fathom)."""
    return _convert(value, from_unit, to_unit, _DEPTH_TO_M, _DEPTH_LABEL, "depth", "м")


def convert_volume(value: float, from_unit: str, to_unit: str) -> ConverterResult:
    """Перевод объёма между кубометрами (m3), кубическими футами (ft3) и
    литрами (l) — в частности, для подсчёта stowage factor груза."""
    return _convert(value, from_unit, to_unit, _VOLUME_TO_M3, _VOLUME_LABEL, "volume", "м³")


def decimal_to_dms(decimal_degrees: float, is_latitude: bool) -> DmsResult:
    """
    Перевод координаты из десятичных градусов в градусы/минуты/секунды.

    decimal_degrees — координата, положительная = N/E, отрицательная = S/W
    is_latitude — True для широты (N/S), False для долготы (E/W)
    """
    if abs(decimal_degrees) > (90.0 if is_latitude else 180.0):
        raise ValueError("err.converters.coords.out_of_range")
    hemisphere_positive = "N" if is_latitude else "E"
    hemisphere_negative = "S" if is_latitude else "W"
    hemisphere = hemisphere_positive if decimal_degrees >= 0 else hemisphere_negative

    abs_value = abs(decimal_degrees)
    degrees = int(abs_value)
    minutes_float = (abs_value - degrees) * 60.0
    minutes = int(minutes_float)
    seconds = (minutes_float - minutes) * 60.0

    # Перенос при округлении: секунды округляются до 1 знака для отображения
    # (formatted и seconds ниже), и если это округление доводит их до 60.0,
    # нужно перенести 1 в минуты (а если и минуты дойдут до 60 — перенести
    # 1 в градусы), иначе получится невалидная запись вида 45°30'60.0"
    # (баг, найденный при глобальной проверке 2026-09-30 — см. CLAUDE.md).
    seconds = round(seconds, 1)
    if seconds >= 60.0:
        seconds -= 60.0
        minutes += 1
    if minutes >= 60:
        minutes -= 60
        degrees += 1

    formatted = f"{degrees}°{minutes:02d}'{seconds:04.1f}\"{hemisphere}"

    steps = [
        CalculationStep(
            description="Целые градусы",
            formula="degrees = floor(|value|)",
            substitution=f"degrees = floor({abs_value:.6f})",
            result=f"degrees = {degrees}°",
        ),
        CalculationStep(
            description="Минуты из дробной части градусов",
            formula="minutes = (|value| - degrees) × 60",
            substitution=f"minutes = ({abs_value:.6f} - {degrees}) × 60",
            result=f"minutes = {minutes_float:.4f}' → {minutes}'",
        ),
        CalculationStep(
            description="Секунды из дробной части минут",
            formula="seconds = (minutes_float - minutes) × 60",
            substitution=f"seconds = ({minutes_float:.4f} - {minutes}) × 60",
            result=f"seconds = {seconds:.1f}\"",
        ),
    ]
    return DmsResult(
        degrees=degrees,
        minutes=minutes,
        seconds=seconds,
        hemisphere=hemisphere,
        formatted=formatted,
        steps=steps,
    )


def dms_to_decimal(degrees: float, minutes: float, seconds: float, hemisphere: str) -> ConverterResult:
    """
    Перевод координаты из градусов/минут/секунд в десятичные градусы.

    hemisphere — одна из "N", "S", "E", "W"
    """
    hemisphere = hemisphere.upper().strip()
    if hemisphere not in ("N", "S", "E", "W"):
        raise ValueError("err.converters.coords.bad_hemisphere")
    if degrees < 0 or minutes < 0 or seconds < 0:
        raise ValueError("err.converters.coords.negative_component")
    if minutes >= 60 or seconds >= 60:
        raise ValueError("err.converters.coords.minutes_out_of_range")

    decimal_value = degrees + minutes / 60.0 + seconds / 3600.0
    if decimal_value > (90.0 if hemisphere in ("N", "S") else 180.0):
        raise ValueError("err.converters.coords.out_of_range")
    sign = -1.0 if hemisphere in ("S", "W") else 1.0
    result_value = decimal_value * sign

    steps = [
        CalculationStep(
            description="Сумма градусов, минут и секунд в десятичных градусах",
            formula="decimal = degrees + minutes/60 + seconds/3600",
            substitution=f"decimal = {degrees:.0f} + {minutes:.0f}/60 + {seconds:.2f}/3600",
            result=f"decimal = {decimal_value:.6f}°",
        ),
        CalculationStep(
            description="Знак по полушарию",
            formula="value = decimal × (−1, если S или W, иначе +1)",
            substitution=f"value = {decimal_value:.6f} × ({sign:+.0f}) [{hemisphere}]",
            result=f"value = {result_value:+.6f}°",
        ),
    ]
    return ConverterResult(value=result_value, unit="°", steps=steps)
