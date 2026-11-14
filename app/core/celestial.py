"""
Поправка компаса по Солнцу: азимут (пеленг Солнца в любой момент) и амплитуда
(пеленг Солнца при восходе/заходе).

Координаты Солнца — по упрощённому алгоритму Ж. Меуса («Astronomical Algorithms»,
гл. 25 «Solar Coordinates», низкая точность), в той же редакции, что у солнечного
калькулятора NOAA (ESRL Global Monitoring Laboratory, Solar Calculation Details).
Точность склонения и часового угла — порядка 0,01°, что на порядок лучше точности
взятия пеленга (0,5–1°). Эфемериды не нужны — расчёт полностью офлайн.

Формулы штурманской астрономии (Bowditch, «American Practical Navigator», гл. 17;
«Мореходная астрономия»):
  азимут:   tg A = sin t / (cos t · sin φ − tg δ · cos φ)   — счёт от S к W,
            истинный пеленг Солнца ИП = A + 180°;
  высота:   sin h = sin φ · sin δ + cos φ · cos δ · cos t;
  амплитуда (центр Солнца на истинном горизонте):
            sin A = sin δ / cos φ,
            восход: ИП = 90° − A,  заход: ИП = 270° + A  (A со знаком склонения, N «+»).
  поправка компаса:   ΔК = ИП − КП,   девиация δк = ΔК − d (если задано склонение d).

Амплитуду наблюдают, когда центр Солнца на истинном горизонте — это примерно когда
нижний край Солнца поднят над видимым горизонтом на 2/3 диаметра (Bowditch).

Знаки: E — «+», W — «−»; широта N «+», долгота E «+».
"""

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

D2R = math.pi / 180.0


@dataclass
class CalculationStep:
    description: str
    formula: str
    substitution: str
    result: str


@dataclass
class SunAzimuthResult:
    true_azimuth: float          # истинный пеленг Солнца, °
    altitude: float              # высота центра Солнца (без рефракции), °
    declination: float           # склонение, ° (N +)
    lha: float                   # местный часовой угол, ° (0–360, к W)
    compass_error: Optional[float]   # ΔК = ИП − КП, °
    deviation: Optional[float]       # δк = ΔК − d, °
    warnings: List[str] = field(default_factory=list)
    steps: List[CalculationStep] = field(default_factory=list)


@dataclass
class SunAmplitudeResult:
    amplitude: float             # A, ° (знак склонения: N +)
    true_bearing: float          # истинный пеленг при восходе/заходе, °
    declination: float
    compass_error: Optional[float]
    deviation: Optional[float]
    warnings: List[str] = field(default_factory=list)
    steps: List[CalculationStep] = field(default_factory=list)


def _norm360(a: float) -> float:
    return a % 360.0


def _signed(a: float) -> float:
    """Угол в диапазон (−180, 180]."""
    a = (a + 180.0) % 360.0 - 180.0
    return 180.0 if a == -180.0 else a


def _parse_dt(value) -> datetime:
    """datetime (наивный — считается UTC) или ISO-строка «YYYY-MM-DDTHH:MM[:SS]»."""
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip().replace(" ", "T")
        if s.endswith("Z"):
            s = s[:-1]
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            raise ValueError("err.celestial.bad_datetime")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def julian_day(dt_utc: datetime) -> float:
    """Юлианская дата (Меус, гл. 7) для момента UTC."""
    y, m = dt_utc.year, dt_utc.month
    d = dt_utc.day + (dt_utc.hour + (dt_utc.minute + (dt_utc.second + dt_utc.microsecond / 1e6) / 60.0) / 60.0) / 24.0
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + a // 4
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + b - 1524.5


def sun_position(dt_utc) -> dict:
    """Склонение δ, прямое восхождение α и гринвичский часовой угол t_гр Солнца (°).

    Меус, гл. 25 (низкая точность) + среднее звёздное время по Меусу, формула 12.4.
    UT1 ≈ UTC (разница < 1 с, на пеленг не влияет).
    """
    dt = _parse_dt(dt_utc)
    jd = julian_day(dt)
    T = (jd - 2451545.0) / 36525.0
    L0 = _norm360(280.46646 + T * (36000.76983 + T * 0.0003032))
    M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
    C = (math.sin(M * D2R) * (1.914602 - T * (0.004817 + 0.000014 * T))
         + math.sin(2 * M * D2R) * (0.019993 - 0.000101 * T)
         + math.sin(3 * M * D2R) * 0.000289)
    true_long = L0 + C
    omega = 125.04 - 1934.136 * T
    lam = true_long - 0.00569 - 0.00478 * math.sin(omega * D2R)
    eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60.0) / 60.0
    eps = eps0 + 0.00256 * math.cos(omega * D2R)
    dec = math.asin(math.sin(eps * D2R) * math.sin(lam * D2R)) / D2R
    ra = _norm360(math.atan2(math.cos(eps * D2R) * math.sin(lam * D2R), math.cos(lam * D2R)) / D2R)
    gmst = _norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T ** 3 / 38710000.0)
    gha = _norm360(gmst - ra)
    return {"jd": jd, "declination": dec, "ra": ra, "gha": gha}


def _check_lat_lon(lat: float, lon: float):
    if not (-90.0 < lat < 90.0):
        raise ValueError("err.celestial.bad_latitude")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError("err.celestial.bad_longitude")


def _errors(true_bearing: float, compass_bearing, variation, steps: List[CalculationStep]):
    if compass_bearing is None:
        return None, None
    err = _signed(true_bearing - float(compass_bearing))
    steps.append(CalculationStep(
        "Поправка компаса", "ΔК = ИП − КП",
        f"{true_bearing:.1f}° − {float(compass_bearing):.1f}°",
        f"{err:+.1f}° ({'E' if err >= 0 else 'W'})"))
    dev = None
    if variation is not None:
        dev = _signed(err - float(variation))
        steps.append(CalculationStep(
            "Девиация", "δк = ΔК − d",
            f"{err:+.1f}° − ({float(variation):+.1f}°)",
            f"{dev:+.1f}° ({'E' if dev >= 0 else 'W'})"))
    return err, dev


def sun_azimuth(dt_utc, latitude: float, longitude: float,
                compass_bearing: Optional[float] = None,
                variation: Optional[float] = None) -> SunAzimuthResult:
    """Истинный пеленг (азимут) Солнца на момент UTC в точке (φ, λ) и поправка компаса.

    dt_utc — момент взятия пеленга по UTC (datetime или ISO-строка);
    latitude, longitude — счислимые координаты, ° (N/E «+»);
    compass_bearing — компасный пеленг Солнца КП, ° (необязательно);
    variation — склонение d с карты, ° (E «+»), чтобы выделить девиацию (необязательно).
    """
    lat, lon = float(latitude), float(longitude)
    _check_lat_lon(lat, lon)
    if compass_bearing is not None and not (0.0 <= float(compass_bearing) < 360.0):
        raise ValueError("err.celestial.bad_bearing")
    sp = sun_position(dt_utc)
    dec, gha = sp["declination"], sp["gha"]
    lha = _norm360(gha + lon)
    steps = [
        CalculationStep("Склонение Солнца", "δ — по формулам Меуса (гл. 25)",
                        f"JD = {sp['jd']:.5f}", f"δ = {dec:+.2f}° ({'N' if dec >= 0 else 'S'})"),
        CalculationStep("Местный часовой угол", "t = t_гр + λ",
                        f"{gha:.2f}° + ({lon:+.2f}°)", f"t = {lha:.2f}°"),
    ]
    s_h = math.sin(lat * D2R) * math.sin(dec * D2R) + math.cos(lat * D2R) * math.cos(dec * D2R) * math.cos(lha * D2R)
    h = math.asin(max(-1.0, min(1.0, s_h))) / D2R
    steps.append(CalculationStep("Высота Солнца", "sin h = sin φ·sin δ + cos φ·cos δ·cos t",
                                 f"φ = {lat:+.2f}°, δ = {dec:+.2f}°, t = {lha:.2f}°", f"h = {h:.1f}°"))
    a = math.atan2(math.sin(lha * D2R),
                   math.cos(lha * D2R) * math.sin(lat * D2R) - math.tan(dec * D2R) * math.cos(lat * D2R)) / D2R
    zn = _norm360(a + 180.0)
    steps.append(CalculationStep("Истинный пеленг Солнца",
                                 "tg A = sin t / (cos t·sin φ − tg δ·cos φ);  ИП = A + 180°",
                                 f"A = {a:.2f}°", f"ИП = {zn:.1f}°"))
    warnings = []
    if h < -1.0:
        warnings.append("calc.sun.warn_below")
    elif h > 30.0:
        warnings.append("calc.sun.warn_high")
    err, dev = _errors(zn, compass_bearing, variation, steps)
    return SunAzimuthResult(zn, h, dec, lha, err, dev, warnings, steps)


def sun_amplitude(dt_utc, latitude: float, event: str = "rise",
                  compass_bearing: Optional[float] = None,
                  variation: Optional[float] = None) -> SunAmplitudeResult:
    """Истинная амплитуда и истинный пеленг Солнца при восходе (event="rise")
    или заходе ("set"). Нужна дата (время — приближённо, для склонения) и широта."""
    lat = float(latitude)
    _check_lat_lon(lat, 0.0)
    if event not in ("rise", "set"):
        raise ValueError("err.celestial.bad_event")
    if compass_bearing is not None and not (0.0 <= float(compass_bearing) < 360.0):
        raise ValueError("err.celestial.bad_bearing")
    dec = sun_position(dt_utc)["declination"]
    s = math.sin(dec * D2R) / math.cos(lat * D2R)
    if abs(s) >= 1.0:
        raise ValueError("err.celestial.no_rise_set")
    amp = math.asin(s) / D2R
    zn = _norm360(90.0 - amp) if event == "rise" else _norm360(270.0 + amp)
    side = "E" if event == "rise" else "W"
    ns = "N" if amp >= 0 else "S"
    steps = [
        CalculationStep("Склонение Солнца", "δ — по формулам Меуса (гл. 25)", "", f"δ = {dec:+.2f}°"),
        CalculationStep("Истинная амплитуда", "sin A = sin δ / cos φ",
                        f"sin({dec:+.2f}°) / cos({lat:+.2f}°)", f"A = {side} {abs(amp):.1f}° {ns}"),
        CalculationStep("Истинный пеленг", "восход: ИП = 90° − A;  заход: ИП = 270° + A",
                        f"A = {amp:+.2f}°", f"ИП = {zn:.1f}°"),
    ]
    warnings = ["calc.sun.warn_amplitude_limb"]
    if abs(lat) > 60.0:
        warnings.append("calc.sun.warn_high_lat")
    err, dev = _errors(zn, compass_bearing, variation, steps)
    return SunAmplitudeResult(amp, zn, dec, err, dev, warnings, steps)
