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
    # расстояние Земля–Солнце, а. е. (Меус, гл. 25: R = 1.000001018·(1−e²)/(1 + e·cos v))
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    v = M + C
    dist = 1.000001018 * (1 - e * e) / (1 + e * math.cos(v * D2R))
    return {"jd": jd, "declination": dec, "ra": ra, "gha": gha, "distance_au": dist}


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


# ============================================================================
# Определение места по Солнцу (с 1.7.0): исправление высоты, широта по
# меридиональной высоте, линия положения методом Сент-Илера (высотная линия).
#
# Источники формул:
#   • Bowditch, «American Practical Navigator» (Pub. 9), гл. 16 «Instruments for
#     Celestial Navigation» (поправки высоты), гл. 20 «Sight Reduction» (метод
#     Сент-Илера: Hc, Zn, перенос a = Ho − Hc), гл. 20 «Latitude by Meridian
#     Altitude» (φ = δ ± z, z = 90° − Ho).
#   • Рефракция — формула Беннетта (G. G. Bennett, 1982), по ней составлены
#     таблицы рефракции Nautical Almanac:  R′ = ctg(Ha + 7.31/(Ha + 4.4)),
#     поправка на температуру/давление: × (P/1010)·283/(273 + T).
#   • Полудиаметр SD = 959.63″ / r и горизонтальный параллакс HP = 8.794″ / r
#     (r — расстояние Земля–Солнце в а. е., Меус гл. 25), PA = HP·cos Ha
#     (Nautical Almanac, «Explanation», поправки высоты Солнца).
#   • Наклонение горизонта — core/sextant.py (dip = 1.76′·√h).
# Это те же величины, из которых составлены таблицы поправок высоты Солнца в
# МАЕ/Nautical Almanac; расхождение с таблицами — порядка 0.1′.
# ============================================================================


@dataclass
class SunSightResult:
    observed_altitude: float          # Ho, °
    apparent_altitude: float          # Ha, °
    corrections: dict = field(default_factory=dict)   # угл. минуты
    steps: List[CalculationStep] = field(default_factory=list)


def _fmt_dm(deg: float, pos: str = "N", neg: str = "S") -> str:
    h = pos if deg >= 0 else neg
    a = abs(deg)
    d = int(a)
    m = (a - d) * 60.0
    if m >= 59.95:
        d, m = d + 1, 0.0
    return f"{d}°{m:04.1f}′ {h}"


def sun_sight_correction(dt_utc, sextant_altitude_deg: float, index_correction_min: float = 0.0,
                         height_of_eye_m: float = 0.0, limb: str = "lower",
                         temperature_c: float = 10.0, pressure_hpa: float = 1010.0) -> SunSightResult:
    """Истинная высота центра Солнца Ho по измеренной секстаном высоте Hs.

    sextant_altitude_deg — Hs, ° (край Солнца по limb: "lower" — нижний, "upper" — верхний);
    index_correction_min — инструментальная поправка IC, ′ (со своим знаком);
    height_of_eye_m — высота глаза над уровнем моря, м;
    temperature_c, pressure_hpa — для поправки рефракции на нестандартные условия.
    """
    hs = float(sextant_altitude_deg)
    if not (0.0 < hs < 90.0):
        raise ValueError("err.celestial.bad_altitude")
    if limb not in ("lower", "upper"):
        raise ValueError("err.celestial.bad_limb")
    if height_of_eye_m < 0:
        raise ValueError("err.celestial.bad_eye_height")
    ic = float(index_correction_min)
    dip = 1.76 * math.sqrt(float(height_of_eye_m))
    ha = hs + (ic - dip) / 60.0
    if ha <= 0.0:
        raise ValueError("err.celestial.bad_altitude")
    sp = sun_position(dt_utc)
    r_au = sp["distance_au"]
    refr = 1.0 / math.tan((ha + 7.31 / (ha + 4.4)) * D2R)
    refr *= (float(pressure_hpa) / 1010.0) * 283.0 / (273.0 + float(temperature_c))
    sd = 959.63 / r_au / 60.0
    pa = 8.794 / r_au / 60.0 * math.cos(ha * D2R)
    sd_signed = sd if limb == "lower" else -sd
    ho = ha + (-refr + pa + sd_signed) / 60.0
    steps = [
        CalculationStep("Видимая высота", "Ha = Hs + IC − dip,  dip = 1.76′·√e",
                        f"{hs:.3f}° {ic:+.1f}′ − {dip:.1f}′ (e = {float(height_of_eye_m):.1f} м)",
                        f"Ha = {ha:.3f}°"),
        CalculationStep("Рефракция (Беннетт)", "R = ctg(Ha + 7.31/(Ha + 4.4)) · (P/1010) · 283/(273 + T)",
                        f"Ha = {ha:.2f}°, T = {float(temperature_c):.0f} °C, P = {float(pressure_hpa):.0f} гПа",
                        f"R = {refr:.1f}′"),
        CalculationStep("Полудиаметр и параллакс", "SD = 959.63″/r,  PA = 8.794″/r · cos Ha",
                        f"r = {r_au:.5f} а. е.", f"SD = {sd:.1f}′, PA = {pa:.2f}′"),
        CalculationStep("Истинная высота центра Солнца",
                        "Ho = Ha − R + PA " + ("+ SD (нижний край)" if limb == "lower" else "− SD (верхний край)"),
                        f"{ha:.3f}° − {refr:.1f}′ + {pa:.2f}′ {sd_signed:+.1f}′", f"Ho = {ho:.3f}°"),
    ]
    return SunSightResult(ho, ha, {"dip": dip, "refraction": refr, "semidiameter": sd, "parallax": pa}, steps)


def meridian_passage_utc(date, longitude: float) -> datetime:
    """Момент верхней кульминации Солнца (LHA = 0) по UTC в заданную дату для долготы λ (E «+»)."""
    lon = float(longitude)
    if not (-180.0 <= lon <= 180.0):
        raise ValueError("err.celestial.bad_longitude")
    if isinstance(date, datetime):
        d0 = date.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        d0 = _parse_dt(str(date)[:10] + "T00:00")
    from datetime import timedelta
    t = d0 + timedelta(hours=12.0 - lon / 15.0)
    for _ in range(4):
        lha = _signed(sun_position(t)["gha"] + lon)
        t = t - timedelta(hours=lha / 15.041)   # Солнце смещается по часовому углу ≈ 15.04°/ч
    return t.replace(microsecond=0)


@dataclass
class NoonLatitudeResult:
    latitude: float
    declination: float
    observed_altitude: float
    zenith_distance: float
    meridian_passage_utc: str
    sun_bears: str                    # "S" или "N"
    warnings: List[str] = field(default_factory=list)
    steps: List[CalculationStep] = field(default_factory=list)


def noon_latitude(date, longitude: float, dr_latitude: float, sextant_altitude_deg: float,
                  index_correction_min: float = 0.0, height_of_eye_m: float = 0.0,
                  limb: str = "lower") -> NoonLatitudeResult:
    """Широта по меридиональной высоте Солнца (полуденная широта).

    date — дата наблюдения (UTC), longitude — счислимая долгота (для момента кульминации
    и склонения), dr_latitude — счислимая широта (нужна только чтобы понять, к N или к S
    от наблюдателя Солнце в полдень), Hs — наибольшая высота Солнца в полдень.
    """
    lat0 = float(dr_latitude)
    _check_lat_lon(lat0, float(longitude))
    t_mp = meridian_passage_utc(date, longitude)
    sight = sun_sight_correction(t_mp, sextant_altitude_deg, index_correction_min, height_of_eye_m, limb)
    dec = sun_position(t_mp)["declination"]
    ho = sight.observed_altitude
    z = 90.0 - ho
    # Солнце к S от наблюдателя, если счислимая широта севернее склонения
    bears = "S" if lat0 >= dec else "N"
    lat = dec + z if bears == "S" else dec - z
    steps = [
        CalculationStep("Момент кульминации Солнца", "t_гр + λ = 0 (LHA = 0)",
                        f"λ = {float(longitude):+.2f}°", f"T = {t_mp.strftime('%H:%M:%S')} UTC"),
        CalculationStep("Склонение Солнца в момент кульминации", "δ — по формулам Меуса (гл. 25)",
                        f"JD = {sun_position(t_mp)['jd']:.5f}", f"δ = {_fmt_dm(dec)}"),
    ] + sight.steps + [
        CalculationStep("Зенитное расстояние", "z = 90° − Ho", f"90° − {ho:.3f}°", f"z = {z:.3f}°"),
        CalculationStep("Широта места",
                        "φ = δ + z (Солнце к S),  φ = δ − z (Солнце к N)",
                        f"Солнце в полдень к {bears}: {dec:+.3f}° {'+' if bears == 'S' else '−'} {z:.3f}°",
                        f"φ = {_fmt_dm(lat)}"),
    ]
    warnings = []
    if abs(lat - lat0) > 1.0:
        warnings.append("calc.astro.warn_far_from_dr")
    if not (-90.0 < lat < 90.0):
        raise ValueError("err.celestial.bad_altitude")
    return NoonLatitudeResult(lat, dec, ho, z, t_mp.strftime("%Y-%m-%dT%H:%M:%S"), bears, warnings, steps)


@dataclass
class SunLopResult:
    intercept_nm: float               # перенос a, мили: «+» — к светилу, «−» — от светила
    azimuth: float                    # Zn, °
    computed_altitude: float          # Hc, °
    observed_altitude: float          # Ho, °
    lop_direction: float              # направление линии положения (Zn + 90°), °
    point_latitude: float             # определяющая точка (основание перпендикуляра на ЛП)
    point_longitude: float
    warnings: List[str] = field(default_factory=list)
    steps: List[CalculationStep] = field(default_factory=list)


def sun_line_of_position(dt_utc, dr_latitude: float, dr_longitude: float, sextant_altitude_deg: float,
                         index_correction_min: float = 0.0, height_of_eye_m: float = 0.0,
                         limb: str = "lower") -> SunLopResult:
    """Высотная линия положения по Солнцу (метод Сент-Илера) от счислимого места."""
    lat, lon = float(dr_latitude), float(dr_longitude)
    _check_lat_lon(lat, lon)
    sight = sun_sight_correction(dt_utc, sextant_altitude_deg, index_correction_min, height_of_eye_m, limb)
    sp = sun_position(dt_utc)
    dec, gha = sp["declination"], sp["gha"]
    lha = _norm360(gha + lon)
    s_h = math.sin(lat * D2R) * math.sin(dec * D2R) + math.cos(lat * D2R) * math.cos(dec * D2R) * math.cos(lha * D2R)
    hc = math.asin(max(-1.0, min(1.0, s_h))) / D2R
    a = math.atan2(math.sin(lha * D2R),
                   math.cos(lha * D2R) * math.sin(lat * D2R) - math.tan(dec * D2R) * math.cos(lat * D2R)) / D2R
    zn = _norm360(a + 180.0)
    ho = sight.observed_altitude
    p = (ho - hc) * 60.0
    plat = lat + p * math.cos(zn * D2R) / 60.0
    plon = lon + p * math.sin(zn * D2R) / (60.0 * math.cos(((lat + plat) / 2) * D2R))
    plon = _signed(plon)
    steps = [
        CalculationStep("Склонение и часовой угол Солнца", "δ, t_гр — по формулам Меуса (гл. 25);  t = t_гр + λ",
                        f"t_гр = {gha:.2f}°, λ = {lon:+.2f}°", f"δ = {_fmt_dm(dec)}, t = {lha:.2f}°"),
    ] + sight.steps + [
        CalculationStep("Счислимая высота", "sin Hc = sin φ·sin δ + cos φ·cos δ·cos t",
                        f"φ = {lat:+.3f}°, δ = {dec:+.3f}°, t = {lha:.3f}°", f"Hc = {hc:.3f}°"),
        CalculationStep("Азимут Солнца", "tg A = sin t / (cos t·sin φ − tg δ·cos φ);  Zn = A + 180°",
                        f"A = {a:.2f}°", f"Zn = {zn:.1f}°"),
        CalculationStep("Перенос (Сент-Илер)", "a = (Ho − Hc) × 60",
                        f"({ho:.3f}° − {hc:.3f}°) × 60",
                        f"a = {abs(p):.1f} мили {'к Солнцу' if p >= 0 else 'от Солнца'}"),
        CalculationStep("Определяющая точка линии положения",
                        "φт = φс + a·cos Zn / 60;  λт = λс + a·sin Zn / (60·cos φср)",
                        f"a = {p:+.1f}′, Zn = {zn:.1f}°",
                        f"{_fmt_dm(plat)}, {_fmt_dm(plon, 'E', 'W')}; ЛП по {(zn + 90) % 360:.0f}°–{(zn + 270) % 360:.0f}°"),
    ]
    warnings = []
    if hc < 5.0 or ho < 5.0:
        warnings.append("calc.astro.warn_low_altitude")
    if abs(p) > 30.0:
        warnings.append("calc.astro.warn_big_intercept")
    return SunLopResult(p, zn, hc, ho, (zn + 90.0) % 360.0, plat, plon, warnings, steps)
