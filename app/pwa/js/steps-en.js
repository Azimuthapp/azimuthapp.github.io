/*
 * Английский текст для пошаговых решений.
 *
 * Расчётные модули core/*.py пишут шаги («описание / формула / подстановка /
 * результат») по-русски — так они проверены тестами на реальных примерах, и
 * менять сами формулы ради перевода нельзя. Поэтому при английском языке
 * интерфейс переводит текст шага здесь, на стороне JS:
 *   1) описание шага — по точному совпадению (DESC) или шаблону (PATTERNS);
 *   2) целые фразы в формулах/результатах (PHRASES);
 *   3) оставшиеся русские «слова» внутри обозначений и единиц (TOKENS):
 *      заменяется каждая непрерывная группа кириллических букв, поэтому
 *      «Hрасч» → «Hcalc», «ΔК» → «ΔC», «т/м³» → «t/m³».
 * Пропущенная фраза останется по-русски (видно при проверке), а не сломает шаг.
 */
(function () {
  const DESC = {
    "Расчётная глубина с учётом возвышения клюза над водой": "Design depth including hawse-pipe height above water",
    "Длина цепи к вытравливанию": "Length of cable to veer",
    "Число смычек (округление в большую сторону)": "Number of shackles (rounded up)",
    "Общий балласт по всем танкам": "Total ballast, all tanks",
    "Поправка на крен": "List correction",
    "Исправленный объём": "Corrected volume",
    "Общий остаток балласта по всем танкам (с поправками)": "Total ballast remaining, all tanks (corrected)",
    "Слепая зона вперёд от препятствия (по подобию треугольников)": "Blind sector ahead of the obstruction (similar triangles)",
    "Вес топлива в танке": "Fuel weight in tank",
    "Линейная интерполяция по калибровочной таблице": "Linear interpolation in the calibration table",
    "Объём по калибровочной таблице (интерполяция)": "Volume from calibration table (interpolated)",
    "Коэффициент объёмной коррекции (VCF, приведение к 15°C)": "Volume correction factor (VCF, to 15 °C)",
    "Объём, приведённый к 15°C (GSV)": "Volume at 15 °C (GSV)",
    "Масса груза": "Cargo mass (in vacuo)",
    "Вес груза в воздухе (коммерческий, WCF = ρ15 − 1.1)": "Cargo weight in air (commercial, WCF = ρ15 − 1.1)",
    "Перевод замера из ullage в innage": "Ullage converted to innage",
    "Поправка компаса": "Compass error",
    "Склонение Солнца": "Sun's declination",
    "Местный часовой угол": "Local hour angle",
    "Высота Солнца": "Sun's altitude",
    "Истинный пеленг Солнца": "Sun's true bearing",
    "Истинная амплитуда": "True amplitude",
    "Истинный пеленг": "True bearing",
    "Девиация": "Deviation",
    "Число лет с года издания карты до года плавания": "Years from chart year to year of passage",
    "Склонение, приведённое к году плавания": "Variation corrected to year of passage",
    "Общая поправка компаса — сумма девиации и склонения": "Total compass error = deviation + variation",
    "Истинный курс — компасный курс плюс общая поправка": "True course = compass course + compass error",
    "Компасный курс — истинный курс минус общая поправка": "Compass course = true course − compass error",
    "Разница показаний, приведённая к кратчайшему расхождению": "Difference of readings, reduced to the smallest angle",
    "Целые градусы": "Whole degrees",
    "Минуты из дробной части градусов": "Minutes from the decimal part of degrees",
    "Секунды из дробной части минут": "Seconds from the decimal part of minutes",
    "Сумма градусов, минут и секунд в десятичных градусах": "Degrees, minutes and seconds as decimal degrees",
    "Знак по полушарию": "Sign by hemisphere",
    "Относительное положение цели (Восток, Север)": "Relative position of target (East, North)",
    "Относительная скорость (скорость цели минус скорость своего судна)": "Relative velocity (target velocity − own velocity)",
    "Время до кратчайшего сближения (TCPA)": "Time to closest point of approach (TCPA)",
    "Кратчайшее расстояние расхождения (CPA)": "Closest point of approach (CPA)",
    "Относительная скорость близка к нулю": "Relative speed is close to zero",
    "Водоизмещение по грузовой шкале": "Displacement from the deadweight scale",
    "TPC (тонн на 1 см осадки) по грузовой шкале": "TPC (tonnes per 1 cm immersion) from the scale",
    "MTC (момент на изменение дифферента 1 см) по грузовой шкале": "MTC (moment to change trim 1 cm) from the scale",
    "Промежуточный коэффициент γ": "Intermediate coefficient γ",
    "Точка росы": "Dew point",
    "Правило точки росы: сравнение точек росы наружного воздуха и трюма": "Dew point rule: outside air vs hold air dew point",
    "Правило трёх градусов: наружный воздух минимум на 3°C холоднее груза": "Three-degree rule: outside air at least 3 °C cooler than cargo",
    "Средняя осадка в точке замера (борт/борт)": "Mean draft at the marks (port/starboard)",
    "Поправка на мидель (формула не зависит от схемы)": "Midship correction (same for all schemes)",
    "Диагностика перегиба корпуса": "Hull deflection (hog/sag)",
    "Доля интервала между табличными значениями осадки": "Fraction of the interval between table drafts",
    "Водоизмещение по таблице (линейная интерполяция, до поправки на дифферент)": "Displacement from table (interpolated, before trim correction)",
    "Поправка на дифферент, первого порядка (через LCF)": "First trim correction (LCF)",
    "Поправка на дифферент, второго порядка (Layer correction)": "Second trim correction (Nemoto)",
    "Водоизмещение с поправкой на фактическую плотность воды": "Displacement corrected for actual water density",
    "Сумма вычитаемых статей запасов": "Total deductibles",
    "Чистое водоизмещение (без запасов)": "Net displacement (less deductibles)",
    "Масса груза (разница чистых водоизмещений между съёмками)": "Cargo (difference of net displacements)",
    "Константа судна (остаток/неучтённый вес при начальной съёмке)": "Ship's constant (unaccounted weight at initial survey)",
    "Водоизмещение с поправкой на дифферент": "Displacement corrected for trim",
    "Дней до срока (на сегодня)": "Days to due date (from today)",
    "Fresh Water Allowance (поправка на пресную воду)": "Fresh Water Allowance",
    "Dock Water Allowance (поправка на воду дока/порта)": "Dock Water Allowance",
    "Пройденное расстояние по лагу": "Distance run by log",
    "Коэффициент лага": "Log factor",
    "Вектор судна относительно воды (Восток, Север)": "Ship's vector through the water (East, North)",
    "Вектор течения/сноса (Восток, Север)": "Current/drift vector (East, North)",
    "Путь по грунту (COG/SOG) — сумма векторов": "Course and speed over ground (COG/SOG) — vector sum",
    "Скорость по грунту (SOG) на заданном пути — корень квадратного уравнения": "Speed over ground (SOG) on the intended track — quadratic root",
    "Курс относительно воды (курс к рулю)": "Course to steer (through the water)",
    "Средняя скорость за отчётный период": "Average speed for the period",
    "Расход топлива, приведённый к суткам": "Fuel consumption per day",
    "Остаток топлива на конец отчётного периода (ROB)": "Fuel remaining on board at end of period (ROB)",
    "Время в пути до цели при сохранении средней скорости": "Time to go at the average speed",
    "Автономность по остатку топлива при текущем расходе": "Endurance on remaining fuel at current consumption",
    "Оценка метацентрической высоты по периоду качки": "GM estimate from rolling period",
    "Коэффициент C по формуле ИМО": "Coefficient C (IMO formula)",
    "Центральный угол между точками (haversine)": "Central angle between the points (haversine)",
    "Дистанция по дуге большого круга": "Great-circle distance",
    "Начальный истинный курс ортодромии": "Initial great-circle course",
    "Разность меридиональных частей (изометрическая широта)": "Difference of meridional parts",
    "Постоянный курс локсодромии": "Rhumb-line course",
    "Дистанция по локсодромии": "Rhumb-line distance",
    "Приращение широты": "Difference of latitude",
    "Приращение долготы": "Difference of longitude",
    "Наклонение видимого горизонта": "Dip of the horizon",
    "Кажущаяся высота светила": "Apparent altitude",
    "Пройденное расстояние": "Distance run",
    "Время в пути": "Time on passage",
    "Скорость": "Speed",
    "Время, оставшееся до требуемого прибытия": "Time remaining to the required arrival",
    "Расчётное время прибытия (ETA)": "Estimated time of arrival (ETA)",
    "Просадка (squat) на открытой воде": "Squat in open water",
    "Просадка (squat) в стеснённом фарватере (канал/узкость)": "Squat in a confined channel",
    "Начальная метацентрическая высота": "Initial metacentric height",
    "Новое КG после вертикального переноса груза": "New KG after vertical shift of weight",
    "Угол крена от переносного момента (приближение малых углов)": "Angle of list from the listing moment (small-angle)",
    "Виртуальный подъём центра тяжести судна (GG1)": "Virtual rise of the ship's G (GG1)",
    "Метацентрическая высота во время подъёма груза": "GM while the weight is suspended",
    "Продолжительность полуцикла (малая-полная или полная-малая вода)": "Duration of the half-cycle (LW–HW or HW–LW)",
    "Условный час по правилу двенадцатых (промежуток приведён к 6 часам)": "Tidal hour by the rule of twelfths (interval scaled to 6 h)",
    "Доля полной величины прилива, пройденная к этому моменту": "Fraction of the range reached at that time",
    "Высота прилива в заданный момент": "Height of tide at the given time",
    "Продольная составляющая истинного ветра (вдоль ДП судна)": "True wind, fore-and-aft component",
    "Поперечная составляющая истинного ветра": "True wind, athwartships component",
    "Истинная скорость ветра": "True wind speed",
    "Курсовой угол истинного ветра (от носа судна)": "True wind angle (relative to the bow)",
    "Истинное направление ветра относительно норда": "True wind direction",
    "Увеличение осадки от края корпуса при крене": "Draft increase at the bilge due to heel",
    "Просадка на ходу в открытой воде (формула Барраса)": "Squat in open water (Barrass)",
    "Коэффициент блокировки сечения канала": "Blockage factor",
    "Просадка на ходу в стеснённом фарватере (формула Барраса)": "Squat in a confined channel (Barrass)",
    "Доступная глубина в точке с учётом прилива": "Available depth including tide",
    "Суммарная эффективная осадка судна": "Total effective draft",
    "Чистый запас глубины под килем": "Net under-keel clearance",
    "Сравнение с минимально допустимым запасом": "Comparison with the required minimum",
  };

  // Описания с подставленными значениями (имя танка, схема и т.п.)
  const PATTERNS = [
    [/^Вес балласта в танке «(.*)»$/, "Ballast weight in tank «$1»"],
    [/^Поправка на дифферент, танк «(.*)»$/, "Trim correction, tank «$1»"],
    [/^Масса балласта в танке «(.*)»$/, "Ballast mass in tank «$1»"],
    [/^Перевод в базовую единицу \((.*)\)$/, "Conversion to the base unit ($1)"],
    [/^Перевод из базовой единицы в (.*)$/, "Conversion from the base unit to $1"],
    [/^Поправка на нос \(схема '(.*)'\)$/, "Forward correction (scheme '$1')"],
    [/^Поправка на корму \(схема '(.*)'\)$/, "Aft correction (scheme '$1')"],
    [/^Истинная средняя осадка \('mean of means of means', схема '(.*)'\)$/, "True mean draft (mean of means of means, scheme '$1')"],
    [/^Следующая плановая дата — «(.*)»$/, "Next due date — «$1»"],
    [/^Новое КG после погрузки груза$/, "New KG after loading"],
    [/^Новое КG после выгрузки груза$/, "New KG after discharging"],
  ];

  // Целые фразы внутри формул/результатов (длинные — раньше коротких)
  const PHRASES = [
    ["разница 0 — на грани, решение капитана", "difference 0 — borderline, Master's decision"],
    ["(в прошлом — цель удаляется)", "(in the past — target is opening)"],
    ["цель и своё судно движутся практически одинаково", "target and own ship move almost identically"],
    ["TCPA не определён, дистанция не меняется", "TCPA undefined, range is constant"],
    ["периодичность «при смене экипажа» — дата заранее не известна", "interval «on crew change» — date not known in advance"],
    ["следующая дата не вычисляется (по событию)", "next date is not calculated (event-based)"],
    ["на основе кумулятивной шкалы 1,3,6,9,11,12 двенадцатых", "cumulative twelfths 1, 3, 6, 9, 11, 12"],
    ["(ВНИМАНИЕ: GM < 0 — отрицательная остойчивость)", "(WARNING: GM < 0 — negative stability)"],
    ["δ — по формулам Меуса (гл. 25)", "δ — Meeus, ch. 25"],
    ["восход: ИП = 90° − A;  заход: ИП = 270° + A", "sunrise: TB = 90° − A;  sunset: TB = 270° + A"],
    ["дата_следующей = дата_последней + периодичность (календарная)", "next_date = last_date + interval (calendar)"],
    ["дней_до_срока = дата_следующей − сегодня", "days_left = next_date − today"],
    ["value = decimal × (−1, если S или W, иначе +1)", "value = decimal × (−1 if S or W, otherwise +1)"],
    ["приведено к ±180°", "reduced to ±180°"],
    ["Vr = Vцели - Vсвоего (векторно)", "Vr = Vtarget − Vown (vector)"],
    ["Вентилировать, если", "Ventilate if"],
    ["НЕ вентилировать", "DO NOT ventilate"],
    ["ВЕНТИЛИРОВАТЬ", "VENTILATE"],
    ["НЕДОСТАТОЧНО", "INSUFFICIENT"],
    ["Достаточно", "Sufficient"],
    ["последнее проведение", "last performed"],
    ["Курс к рулю", "Course to steer"],
    ["сумма всех статей", "sum of all items"],
    ["высота глаза, м", "height of eye, m"],
    ["(вычитается)", "(subtracted)"],
    ["смычки → вытравить", "shackles → veer"],
    ["интерполяция(innage, таблица танка)", "interpolation(innage, tank table)"],
    ["глубина_танка", "tank_depth"],
    ["год_плавания", "year_of_passage"],
    ["год_карты", "chart_year"],
    ["годовое_изменение", "annual_change"],
    ["длина_смычки", "shackle_length"],
    ["накопленные_двенадцатые", "cumulative_twelfths"],
    ["запас_волна", "wave_allowance"],
    ["ставка_диф", "rate_trim"],
    ["ставка_крен", "rate_list"],
    ["Запас_разница", "Margin"],
    ["ΔЛ%", "ΔL%"],
    ["усл.ч", "tidal h"],
    ["морск. саж.", "fathoms"],
    ["знак по курсу (Ost/Vest)", "sign by course (E/W)"],
  ];

  // Отдельные русские «слова» в обозначениях, единицах и подписях
  const TOKENS = {
    "м": "m", "т": "t", "см": "cm", "мм": "mm", "кг": "kg", "км": "km", "фт": "ft",
    "уз": "kn", "миль": "NM", "каб": "cbl", "фут": "ft", "л": "L", "с": "s", "мили": "NM", "миля": "NM", "ч": "h", "мин": "min",
    "сут": "d", "сутки": "day", "рад": "rad", "лет": "years", "смычек": "shackles", "смычки": "shackles",
    "крен": "heel", "диф": "trim", "дифферент": "trim", "испр": "corr", "набл": "obs",
    "вост": "E", "сев": "N", "факт": "act", "нов": "new", "расч": "calc", "ср": "avg",
    "ост": "togo", "начало": "start", "конец": "end", "усл": "t", "дост": "avail", "эфф": "eff",
    "табл": "table", "нар": "out", "трюм": "hold", "нетто": "net", "лб": "P", "пб": "S",
    "ист": "true", "гр": "G", "тек": "now", "прибытия": "arrival", "дока": "dock",
    "клюза": "hawse", "соотношение": "ratio", "итого": "total", "доля": "fraction",
    "цель": "target", "цели": "target", "своего": "own", "после": "after", "до": "before",
    "пройдено": "run", "отчёта": "period", "Вес": "Weight", "Масса": "Mass", "Объём": "Volume",
    "Плотность": "Density", "плотность": "density", "Балласт": "Ballast", "Груз": "Cargo",
    "Константа": "Constant", "Запасы": "Deductibles", "Расход": "Cons", "Автономность": "Endurance",
    "Направление": "Direction", "возд": "air", "груза": "cargo", "курс": "course", "Курс": "Course", "Дистанция": "Distance", "Корр": "Corr", "Корр1": "Corr1", "Корр2": "Corr2",
    "ИП": "TB", "КП": "CB", "К": "C", "к": "c", "ИК": "TC", "КК": "CC", "ПУ": "Co", "Пел": "Brg",
    "РОЛ": "LD", "Кл": "LF", "КУВ": "AWA", "судна": "ship", "Т": "T", "Л": "L",
  };

  const CYR_RUN = /[А-Яа-яЁё]+/g;
  const phrasesSorted = PHRASES.slice().sort((a, b) => b[0].length - a[0].length);

  function translateText(text) {
    if (typeof text !== "string" || !/[А-Яа-яЁё]/.test(text)) return text;
    let s = text;
    for (const [ru, en] of phrasesSorted) if (s.includes(ru)) s = s.split(ru).join(en);
    return s.replace(CYR_RUN, (w) => (Object.prototype.hasOwnProperty.call(TOKENS, w) ? TOKENS[w] : w));
  }

  function translateDescription(text) {
    if (typeof text !== "string") return text;
    if (Object.prototype.hasOwnProperty.call(DESC, text)) return DESC[text];
    for (const [re, rep] of PATTERNS) if (re.test(text)) return translateText(text.replace(re, rep));
    return translateText(text);
  }

  /** Возвращает копию шага с английским текстом (для lang === "en"). */
  function translateStep(step) {
    if (!step || typeof step !== "object") return step;
    return {
      ...step,
      description: translateDescription(step.description),
      formula: translateText(step.formula),
      substitution: translateText(step.substitution),
      result: translateText(step.result),
    };
  }

  window.ShipHelperStepsEN = { translateStep, translateText, _DESC: DESC };
})();
