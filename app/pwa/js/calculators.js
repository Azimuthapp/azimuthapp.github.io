/**
 * Логика калькуляторов группы "Судовождение", перенесённых со Streamlit
 * по той же схеме, что и компас (см. js/app.js, js/pyodide-bridge.js):
 * расчёт выполняется НЕПОСРЕДСТВЕННО в core/*.py через Pyodide, JS здесь
 * только собирает значения полей, вызывает callCore("core.<module>", ...)
 * и отображает результат/шаги — никакой логики расчёта на JS.
 *
 * Обёрнуто в IIFE по той же причине, что и остальные js/*.js файлы
 * (см. комментарий в i18n.js) — верхнеуровневые имена не должны
 * конфликтовать с app.js в общей глобальной области классических
 * <script>-тегов. Внутри IIFE безопасно объявлять локальные const с
 * теми же именами (t, callCore и т.д.), т.к. они не всплывают на
 * верхний уровень скрипта.
 *
 * Язык читается из document.documentElement.lang (а не из приватной
 * переменной currentLang в app.js) — так этот файл не зависит от
 * внутренних деталей app.js, а app.js уже поддерживает этот атрибут
 * в актуальном состоянии (applyStrings()).
 */
(function () {

const { t } = window.ShipHelperI18n;
const { callCore } = window.ShipHelperPy;

function lang() {
  return document.documentElement.lang || "ru";
}

/** Строит содержимое .steps-list из списка CalculationStep (dict'ов
 * с полями description/formula/substitution/result) — тот же формат,
 * что renderResult() в app.js использует для компаса. */
/** Единица измерения на языке интерфейса: u("м") → "m" в английской версии. */
function u(ruUnit) {
  return lang() === "en" && window.ShipHelperStepsEN ? window.ShipHelperStepsEN.translateText(ruUnit) : ruUnit;
}

/** Дробные часы → «2 ч 30 мин» / «2 h 30 min». */
function formatHoursHM(hours) {
  const total = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(total / 60), m = total % 60;
  return `${hours < 0 ? "−" : ""}${h} ${u("ч")} ${String(m).padStart(2, "0")} ${u("мин")}`;
}

/** Курс/пеленг 0…359.9: 359.96° не должен показываться как «360.0°». */
function fmtCourse(deg) {
  return ((Math.round(deg * 10) / 10) % 360 + 360) % 360 === 0 ? "0.0" : (((Math.round(deg * 10) / 10) % 360 + 360) % 360).toFixed(1);
}

function localStep(step) {
  return lang() === "en" && window.ShipHelperStepsEN ? window.ShipHelperStepsEN.translateStep(step) : step;
}

function renderSteps(container, steps) {
  container.innerHTML = "";
  container.__rawSteps = steps || [];
  container.classList.add("has-raw-steps");
  for (const raw of steps || []) {
    const step = localStep(raw);
    const item = document.createElement("div");
    item.className = "step-item";
    item.innerHTML = `
      <div class="step-desc">${step.description}</div>
      <div class="step-formula">${step.formula} &nbsp;→&nbsp; ${step.substitution}</div>
      <div class="step-result">${step.result}</div>
    `;
    container.appendChild(item);
  }
}

// Смена языка — перерисовать уже показанные шаги на новом языке
document.addEventListener("shiphelper:langchange", () => {
  document.querySelectorAll(".has-raw-steps").forEach((el) => renderSteps(el, el.__rawSteps));
});

/** Универсальный toggle "Показать/Скрыть, как считалось" для произвольной
 * пары (кнопка, список шагов), независимо от калькулятора. */
function wireStepsToggle(toggleId, listId) {
  const toggle = document.getElementById(toggleId);
  const list = document.getElementById(listId);
  if (!toggle || !list) return;
  toggle.addEventListener("click", () => {
    const open = toggle.classList.toggle("open");
    list.classList.toggle("visible", open);
    // Лёгкая fade-in анимация при раскрытии шагов (window.shPlayFadeIn —
    // тот же хелпер, что app.js использует при переключении калькуляторов/
    // групп, см. app.js::playFadeIn — вынесен в window, чтобы этот файл
    // мог его переиспользовать без дублирования кода).
    if (open && typeof window.shPlayFadeIn === "function") {
      window.shPlayFadeIn(list);
    }
    const label = toggle.querySelector(".toggle-label");
    if (label) {
      label.textContent = open
        ? t("calc.common.hide_steps", lang())
        : t("calc.common.show_steps", lang());
    }
  });
}

/**
 * Достаёт код ошибки вида "err.<module>.<reason>" из текста исключения
 * Pyodide (PythonError, чей .message — это полная Python-трассировка,
 * последняя строка которой обычно "ValueError: err.xxx.yyy") и
 * переводит через t(). Если код не найден/не похож на наш формат —
 * показывает общий app.calc_error, а не сырой Python-traceback.
 * Ни один из калькуляторов этого файла не поднимает параметризованные
 * ValueError (с доп. аргументом-словарём) — только простые
 * однострочные коды, так что регэкспа достаточно.
 */
function translateError(err) {
  const text = String(err && err.message ? err.message : err);
  const match = text.match(/ValueError:\s*(err\.[a-zA-Z0-9_.]+)/);
  if (match) {
    return t(match[1], lang());
  }
  console.error(err);
  return t("app.calc_error", lang());
}

function parseNum(id) {
  return parseFloat(document.getElementById(id).value);
}

function setBtnBusy(btn, busy) {
  btn.disabled = busy;
  if (busy) {
    btn.dataset.originalLabel = btn.textContent;
    btn.textContent = "…";
  } else if (btn.dataset.originalLabel) {
    btn.textContent = btn.dataset.originalLabel;
  }
}

/* ================================================================== */
/* V/T/S/ETA — core.speed_time_distance                                */
/* ================================================================== */

function setupStd() {
  const modeSwitch = document.getElementById("std-mode-switch");
  const btn = document.getElementById("std-calc-btn");
  const resultBox = document.getElementById("std-result-box");
  const resultLabel = document.getElementById("std-result-label");
  const resultValue = document.getElementById("std-result-value");
  if (!modeSwitch || !btn) return;

  const BTN_KEY = {
    distance: "calc.std.calc_distance_btn",
    time: "calc.std.calc_time_btn",
    speed: "calc.std.calc_speed_btn",
    eta: "calc.std.calc_eta_btn",
    required_speed: "calc.std.calc_required_speed_btn",
  };
  let mode = "distance";

  modeSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      modeSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll("[data-std-fields]").forEach((div) => {
        div.hidden = div.dataset.stdFields !== mode;
      });
      btn.textContent = t(BTN_KEY[mode], lang());
      resultBox.classList.remove("visible");
    });
  });

  wireStepsToggle("std-steps-toggle", "std-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      let result, label, valueText;
      if (mode === "distance") {
        const speed = parseNum("std-distance-speed");
        const time = parseNum("std-distance-time");
        result = await callCore("core.speed_time_distance", "distance_from_speed_time", [speed, time]);
        label = t("calc.std.distance_metric", lang());
        valueText = `${result.value.toFixed(2)} ${t("calc.std.unit_miles", lang())}`;
      } else if (mode === "time") {
        const distance = parseNum("std-time-distance");
        const speed = parseNum("std-time-speed");
        result = await callCore("core.speed_time_distance", "time_from_distance_speed", [distance, speed]);
        label = t("calc.std.time_metric", lang());
        valueText = formatHoursHM(result.value);
      } else if (mode === "speed") {
        const distance = parseNum("std-speed-distance");
        const time = parseNum("std-speed-time");
        result = await callCore("core.speed_time_distance", "speed_from_distance_time", [distance, time]);
        label = t("calc.std.speed_metric", lang());
        valueText = `${result.value.toFixed(2)} ${t("calc.std.unit_knots", lang())}`;
      } else if (mode === "eta") {
        const dateStr = document.getElementById("std-eta-date").value;
        const timeStr = document.getElementById("std-eta-time").value || "00:00";
        const distance = parseNum("std-eta-distance");
        const speed = parseNum("std-eta-speed");
        // core.speed_time_distance.eta() ожидает Python datetime, не
        // строку — передаём настоящий JS Date. ВАЖНО (уточнено
        // 2026-09-29): Pyodide САМ ПО СЕБЕ не конвертирует Date <->
        // datetime автоматически — конвертацию в обе стороны выполняет
        // вручную сам pyodide-bridge.js::callCore() (_wrapDatesForPy на
        // входе, .isoformat() на выходе), см. докстринг там же.
        const currentTime = new Date(`${dateStr}T${timeStr}:00`);
        result = await callCore("core.speed_time_distance", "eta", [currentTime, distance, speed]);
        label = "ETA";
        const etaDate = result.eta instanceof Date ? result.eta : new Date(result.eta);
        valueText = Number.isNaN(etaDate.getTime())
          ? String(result.eta)
          : etaDate.toLocaleString(lang() === "ru" ? "ru-RU" : "en-US");
      } else {
        const curDateStr = document.getElementById("std-reqspeed-current-date").value;
        const curTimeStr = document.getElementById("std-reqspeed-current-time").value || "00:00";
        const ddlDateStr = document.getElementById("std-reqspeed-deadline-date").value;
        const ddlTimeStr = document.getElementById("std-reqspeed-deadline-time").value || "00:00";
        const distance = parseNum("std-reqspeed-distance");
        const currentTime = new Date(`${curDateStr}T${curTimeStr}:00`);
        const deadline = new Date(`${ddlDateStr}T${ddlTimeStr}:00`);
        result = await callCore("core.speed_time_distance", "required_speed_for_deadline", [currentTime, deadline, distance]);
        label = t("calc.std.required_speed_metric", lang());
        valueText = `${result.value.toFixed(2)} ${t("calc.std.unit_knots", lang())}`;
      }
      resultLabel.textContent = label;
      resultValue.textContent = valueText;
      renderSteps(document.getElementById("std-steps-list"), result.steps);
      resultBox.classList.add("visible");
    } catch (err) {
      resultLabel.textContent = translateError(err);
      resultValue.textContent = "—";
      resultBox.classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Ортодромия / Локсодромия — core.sailing                             */
/* ================================================================== */

function setupSailing() {
  const btn = document.getElementById("sailing-calc-btn");
  if (!btn) return;
  wireStepsToggle("sailing-gc-steps-toggle", "sailing-gc-steps-list");
  wireStepsToggle("sailing-rl-steps-toggle", "sailing-rl-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const lat1 = parseNum("sailing-lat1");
      const lon1 = parseNum("sailing-lon1");
      const lat2 = parseNum("sailing-lat2");
      const lon2 = parseNum("sailing-lon2");

      const gc = await callCore("core.sailing", "great_circle", [lat1, lon1, lat2, lon2]);
      document.getElementById("sailing-gc-distance").textContent =
        `${gc.distance_nm.toFixed(1)} ${t("calc.std.unit_miles", lang())}`;
      document.getElementById("sailing-gc-course").textContent =
        `${t("calc.sailing.initial_course_metric", lang())}: ${fmtCourse(gc.course_deg)}°`;
      renderSteps(document.getElementById("sailing-gc-steps-list"), gc.steps);

      const rl = await callCore("core.sailing", "rhumb_line", [lat1, lon1, lat2, lon2]);
      document.getElementById("sailing-rl-distance").textContent =
        `${rl.distance_nm.toFixed(1)} ${t("calc.std.unit_miles", lang())}`;
      document.getElementById("sailing-rl-course").textContent =
        `${t("calc.sailing.constant_course_metric", lang())}: ${fmtCourse(rl.course_deg)}°`;
      renderSteps(document.getElementById("sailing-rl-steps-list"), rl.steps);

      document.getElementById("sailing-gc-result-box").classList.add("visible");
      document.getElementById("sailing-rl-result-box").classList.add("visible");
    } catch (err) {
      const msg = translateError(err);
      document.getElementById("sailing-gc-distance").textContent = msg;
      document.getElementById("sailing-rl-distance").textContent = "—";
      document.getElementById("sailing-gc-course").textContent = "";
      document.getElementById("sailing-rl-course").textContent = "";
      document.getElementById("sailing-gc-result-box").classList.add("visible");
      document.getElementById("sailing-rl-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Счисление по лагу — core.log_navigation + core.sailing              */
/* ================================================================== */

function setupLog() {
  const formatSwitch = document.getElementById("log-format-switch");
  if (!formatSwitch) return;
  let format = "kl"; // | "percent"
  let lastDistance = null;

  formatSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      format = b.dataset.format;
      formatSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll("[data-log-format-field]").forEach((div) => {
        div.hidden = div.dataset.logFormatField !== format;
      });
    });
  });

  wireStepsToggle("log-distance-steps-toggle", "log-distance-steps-list");
  wireStepsToggle("log-coefficient-steps-toggle", "log-coefficient-steps-list");
  wireStepsToggle("log-position-steps-toggle", "log-position-steps-list");

  // Sub-1: пройденное расстояние по лагу
  const distanceBtn = document.getElementById("log-distance-btn");
  const distanceBox = document.getElementById("log-distance-result-box");
  distanceBtn.addEventListener("click", async () => {
    setBtnBusy(distanceBtn, true);
    try {
      const ol1 = parseNum("log-ol1");
      const ol2 = parseNum("log-ol2");
      const rol = ol2 - ol1;
      let kl;
      if (format === "kl") {
        kl = parseNum("log-kl");
      } else {
        const percent = parseNum("log-percent");
        kl = await callCore("core.log_navigation", "percent_to_kl", [percent]);
      }
      const result = await callCore("core.log_navigation", "distance_by_log", [rol, kl]);
      lastDistance = result.value;
      document.getElementById("log-distance-value").textContent =
        `${result.value.toFixed(2)} ${t("calc.std.unit_miles", lang())}`;
      document.getElementById("log-dr-distance").value = result.value.toFixed(2);
      renderSteps(document.getElementById("log-distance-steps-list"), result.steps);
      distanceBox.classList.add("visible");
    } catch (err) {
      document.getElementById("log-distance-value").textContent = translateError(err);
      distanceBox.classList.add("visible");
    } finally {
      setBtnBusy(distanceBtn, false);
    }
  });

  // Sub-2: определение поправки лага
  const coefficientBtn = document.getElementById("log-coefficient-btn");
  const coefficientBox = document.getElementById("log-coefficient-result-box");
  coefficientBtn.addEventListener("click", async () => {
    setBtnBusy(coefficientBtn, true);
    try {
      const actualDistance = parseNum("log-actual-distance");
      const rolInput = parseNum("log-rol-input");
      const result = await callCore("core.log_navigation", "log_coefficient_from_distance", [actualDistance, rolInput]);
      if (format === "kl") {
        document.getElementById("log-coefficient-label").textContent = t("calc.log.kl_metric", lang());
        document.getElementById("log-coefficient-value").textContent = result.value.toFixed(4);
      } else {
        const percent = await callCore("core.log_navigation", "kl_to_percent", [result.value]);
        document.getElementById("log-coefficient-label").textContent = t("calc.log.percent_metric", lang());
        document.getElementById("log-coefficient-value").textContent = `${percent.toFixed(2)}%`;
      }
      renderSteps(document.getElementById("log-coefficient-steps-list"), result.steps);
      coefficientBox.classList.add("visible");
    } catch (err) {
      document.getElementById("log-coefficient-label").textContent = translateError(err);
      document.getElementById("log-coefficient-value").textContent = "—";
      coefficientBox.classList.add("visible");
    } finally {
      setBtnBusy(coefficientBtn, false);
    }
  });

  // Sub-3: место судна по счислению
  const positionBtn = document.getElementById("log-position-btn");
  positionBtn.addEventListener("click", async () => {
    setBtnBusy(positionBtn, true);
    try {
      const lat1 = parseNum("log-dr-lat1");
      const lon1 = parseNum("log-dr-lon1");
      const course = parseNum("log-dr-course");
      const distance = parseNum("log-dr-distance");
      const result = await callCore("core.sailing", "dead_reckoning_position", [lat1, lon1, course, distance]);
      document.getElementById("log-new-lat").textContent = `${result.lat.toFixed(4)}°`;
      document.getElementById("log-new-lon").textContent = `${result.lon.toFixed(4)}°`;
      renderSteps(document.getElementById("log-position-steps-list"), result.steps);
      document.getElementById("log-position-result-box").classList.add("visible");
      document.getElementById("log-position-result-box-2").classList.add("visible");
    } catch (err) {
      document.getElementById("log-new-lat").textContent = translateError(err);
      document.getElementById("log-new-lon").textContent = "—";
    } finally {
      setBtnBusy(positionBtn, false);
    }
  });

  void lastDistance; // используется только для читаемости намерения (значение уже подставляется в поле)
}

/* ================================================================== */
/* CPA/TCPA — core.cpa                                                 */
/* ================================================================== */

function setupCpa() {
  const btn = document.getElementById("cpa-calc-btn");
  if (!btn) return;
  wireStepsToggle("cpa-steps-toggle", "cpa-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const ownCourse = parseNum("cpa-own-course");
      const ownSpeed = parseNum("cpa-own-speed");
      const targetBearing = parseNum("cpa-target-bearing");
      const targetRange = parseNum("cpa-target-range");
      const targetCourse = parseNum("cpa-target-course");
      const targetSpeed = parseNum("cpa-target-speed");
      const result = await callCore("core.cpa", "cpa_tcpa", [
        ownCourse, ownSpeed, targetBearing, targetRange, targetCourse, targetSpeed,
      ]);

      document.getElementById("cpa-cpa-value").textContent =
        `${result.cpa_nm.toFixed(2)} ${t("calc.std.unit_miles", lang())}`;
      document.getElementById("cpa-tcpa-value").textContent =
        result.tcpa_min === null || result.tcpa_min === undefined
          ? "—"
          : `${result.tcpa_min.toFixed(1)} ${t("calc.cpa.unit_minutes", lang())}`;

      const warning = document.getElementById("cpa-warning");
      const showWarning = result.tcpa_min !== null && result.tcpa_min !== undefined && !result.approaching;
      warning.hidden = !showWarning;

      renderSteps(document.getElementById("cpa-steps-list"), result.steps);
      document.getElementById("cpa-cpa-result-box").classList.add("visible");
      document.getElementById("cpa-tcpa-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("cpa-cpa-value").textContent = translateError(err);
      document.getElementById("cpa-tcpa-value").textContent = "—";
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Снос течением/ветром — core.navigation_triangle                     */
/* ================================================================== */

function setupDrift() {
  const modeSwitch = document.getElementById("drift-mode-switch");
  const btn = document.getElementById("drift-calc-btn");
  if (!modeSwitch || !btn) return;
  wireStepsToggle("drift-steps-toggle", "drift-steps-list");

  let mode = "resultant"; // | "course_to_steer"
  const BTN_KEY = {
    resultant: "calc.drift.calc_resultant_btn",
    course_to_steer: "calc.drift.calc_course_btn",
  };

  modeSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      modeSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll("[data-drift-fields]").forEach((div) => {
        div.hidden = div.dataset.driftFields !== mode;
      });
      btn.textContent = t(BTN_KEY[mode], lang());
      document.getElementById("drift-result-box-1").classList.remove("visible");
      document.getElementById("drift-result-box-2").classList.remove("visible");
    });
  });

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const set = parseNum("drift-set");
      const drift = parseNum("drift-drift");
      let result, label1, value1, label2, value2;

      if (mode === "resultant") {
        const course = parseNum("drift-course");
        const speed = parseNum("drift-speed-water-1");
        result = await callCore("core.navigation_triangle", "resultant_track", [course, speed, set, drift]);
        label1 = t("calc.drift.cog_metric", lang());
        value1 = `${fmtCourse(result.cog)}°`;
        label2 = t("calc.drift.sog_metric", lang());
        value2 = `${result.sog.toFixed(1)} ${t("calc.std.unit_knots", lang())}`;
      } else {
        const track = parseNum("drift-track");
        const speed = parseNum("drift-speed-water-2");
        result = await callCore("core.navigation_triangle", "course_to_steer", [track, speed, set, drift]);
        label1 = t("calc.drift.course_to_steer_metric", lang());
        value1 = `${fmtCourse(result.course_to_steer)}°`;
        label2 = t("calc.drift.expected_sog_metric", lang());
        value2 = `${result.sog.toFixed(1)} ${t("calc.std.unit_knots", lang())}`;
      }

      document.getElementById("drift-label-1").textContent = label1;
      document.getElementById("drift-value-1").textContent = value1;
      document.getElementById("drift-label-2").textContent = label2;
      document.getElementById("drift-value-2").textContent = value2;
      renderSteps(document.getElementById("drift-steps-list"), result.steps);
      document.getElementById("drift-result-box-1").classList.add("visible");
      document.getElementById("drift-result-box-2").classList.add("visible");
    } catch (err) {
      document.getElementById("drift-label-1").textContent = translateError(err);
      document.getElementById("drift-value-1").textContent = "—";
      document.getElementById("drift-result-box-1").classList.add("visible");
      document.getElementById("drift-result-box-2").classList.remove("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Конвертер единиц — core.converters (группа "Инструменты")           */
/* ================================================================== */

function setupUnitConverter() {
  const categorySwitch = document.getElementById("uc-category-switch");
  const fromSelect = document.getElementById("uc-from-unit");
  const toSelect = document.getElementById("uc-to-unit");
  const btn = document.getElementById("uc-calc-btn");
  const resultBox = document.getElementById("uc-result-box");
  const resultLabel = document.getElementById("uc-result-label");
  const resultValue = document.getElementById("uc-result-value");
  if (!categorySwitch || !btn) return;

  // category -> { core-функция, список единиц (значение + i18n-ключ) }.
  // Список единиц и их порядок должны совпадать с таблицами в
  // core/converters.py (_SPEED_TO_MS/_DISTANCE_TO_M/_DEPTH_TO_M).
  const CATEGORIES = {
    speed: {
      coreFunc: "convert_speed",
      units: [
        { value: "kn", key: "calc.unit_converter.unit_kn" },
        { value: "kmh", key: "calc.unit_converter.unit_kmh" },
        { value: "ms", key: "calc.unit_converter.unit_ms" },
      ],
      defaultFrom: "kn",
      defaultTo: "kmh",
    },
    distance: {
      coreFunc: "convert_distance",
      units: [
        { value: "nm", key: "calc.unit_converter.unit_nm" },
        { value: "km", key: "calc.unit_converter.unit_km" },
        { value: "m", key: "calc.unit_converter.unit_m" },
        { value: "cbl", key: "calc.unit_converter.unit_cbl" },
      ],
      defaultFrom: "nm",
      defaultTo: "km",
    },
    depth: {
      coreFunc: "convert_depth",
      units: [
        { value: "m", key: "calc.unit_converter.unit_m" },
        { value: "ft", key: "calc.unit_converter.unit_ft" },
        { value: "fathom", key: "calc.unit_converter.unit_fathom" },
      ],
      defaultFrom: "m",
      defaultTo: "ft",
    },
    volume: {
      coreFunc: "convert_volume",
      units: [
        { value: "m3", key: "calc.unit_converter.unit_m3" },
        { value: "ft3", key: "calc.unit_converter.unit_ft3" },
        { value: "l", key: "calc.unit_converter.unit_l" },
      ],
      defaultFrom: "ft3",
      defaultTo: "m3",
    },
  };

  let category = "speed";

  // <option> получает data-i18n — попадает под общий sweep
  // applyStrings() в app.js при смене языка, отдельная логика
  // пересборки текста опций при переключении RU/EN не нужна.
  function populateSelects() {
    const cfg = CATEGORIES[category];
    [fromSelect, toSelect].forEach((select) => {
      select.innerHTML = "";
      cfg.units.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.value;
        opt.dataset.i18n = u.key;
        opt.textContent = t(u.key, lang());
        select.appendChild(opt);
      });
    });
    fromSelect.value = cfg.defaultFrom;
    toSelect.value = cfg.defaultTo;
  }
  populateSelects();

  categorySwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      category = b.dataset.category;
      categorySwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      populateSelects();
      resultBox.classList.remove("visible");
    });
  });

  wireStepsToggle("uc-steps-toggle", "uc-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const value = parseNum("uc-value");
      const fromUnit = fromSelect.value;
      const toUnit = toSelect.value;
      const cfg = CATEGORIES[category];
      const result = await callCore("core.converters", cfg.coreFunc, [value, fromUnit, toUnit]);

      resultLabel.textContent = t("calc.unit_converter.value_label", lang());
      resultValue.textContent = `${result.value.toFixed(4)} ${u(result.unit)}`;
      renderSteps(document.getElementById("uc-steps-list"), result.steps);
      resultBox.classList.add("visible");
    } catch (err) {
      resultLabel.textContent = translateError(err);
      resultValue.textContent = "—";
      document.getElementById("uc-steps-list").innerHTML = "";
      resultBox.classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Конвертер координат — core.converters (группа "Инструменты")        */
/* ================================================================== */

function setupCoordsConverter() {
  const modeSwitch = document.getElementById("cc-mode-switch");
  const btn = document.getElementById("cc-calc-btn");
  const resultBox = document.getElementById("cc-result-box");
  const resultLabel = document.getElementById("cc-result-label");
  const resultValue = document.getElementById("cc-result-value");
  if (!modeSwitch || !btn) return;

  const BTN_KEY = {
    to_dms: "calc.coords_converter.calc_to_dms_btn",
    to_decimal: "calc.coords_converter.calc_to_decimal_btn",
  };
  let mode = "to_dms";

  modeSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      modeSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll("[data-cc-fields]").forEach((div) => {
        div.hidden = div.dataset.ccFields !== mode;
      });
      btn.textContent = t(BTN_KEY[mode], lang());
      resultBox.classList.remove("visible");
    });
  });

  wireStepsToggle("cc-steps-toggle", "cc-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      let result, valueText;
      if (mode === "to_dms") {
        const decimal = parseNum("cc-decimal");
        const isLatitude = document.getElementById("cc-is-latitude").value === "lat";
        result = await callCore("core.converters", "decimal_to_dms", [decimal, isLatitude]);
        valueText = result.formatted;
        renderSteps(document.getElementById("cc-steps-list"), result.steps);
      } else {
        const degrees = parseNum("cc-degrees");
        const minutes = parseNum("cc-minutes");
        const seconds = parseNum("cc-seconds");
        const hemisphere = document.getElementById("cc-hemisphere").value;
        result = await callCore("core.converters", "dms_to_decimal", [degrees, minutes, seconds, hemisphere]);
        valueText = `${result.value.toFixed(6)}°`;
        renderSteps(document.getElementById("cc-steps-list"), result.steps);
      }
      resultLabel.textContent = mode === "to_dms"
        ? t("calc.coords_converter.mode_to_dms", lang())
        : t("calc.coords_converter.mode_to_decimal", lang());
      resultValue.textContent = valueText;
      resultBox.classList.add("visible");
    } catch (err) {
      resultLabel.textContent = translateError(err);
      resultValue.textContent = "—";
      document.getElementById("cc-steps-list").innerHTML = "";
      resultBox.classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Журнал судовых тревог — core.drill_log (группа "Инструменты")       */
/* ================================================================== */

const DL_STORAGE_KEY = "shiphelper-drill-log";

const DL_PERIODICITY_OPTIONS = [
  { value: "weekly", labelKey: "calc.drill_log.periodicity_weekly" },
  { value: "monthly", labelKey: "calc.drill_log.periodicity_monthly" },
  { value: "quarterly", labelKey: "calc.drill_log.periodicity_quarterly" },
  { value: "semi_annual", labelKey: "calc.drill_log.periodicity_semi_annual" },
  { value: "annual", labelKey: "calc.drill_log.periodicity_annual" },
  { value: "crew_change", labelKey: "calc.drill_log.periodicity_crew_change" },
];

const DL_COLUMNS = [
  { field: "name", type: "text" },
  { field: "periodicity", type: "select", options: DL_PERIODICITY_OPTIONS },
  { field: "last_performed", type: "date" },
];

function dlDefaultDrills() {
  const today = todayIsoDate();
  return [
    { name: t("calc.drill_log.example_fire", lang()), periodicity: "monthly", last_performed: today },
    { name: t("calc.drill_log.example_abandon_ship", lang()), periodicity: "monthly", last_performed: today },
    { name: t("calc.drill_log.example_man_overboard", lang()), periodicity: "monthly", last_performed: today },
  ];
}

function dlLoadSaved() {
  try {
    const raw = localStorage.getItem(DL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch (e) {
    return null; // недоступен localStorage (приватный режим) или битый JSON
  }
}

function dlSave(container) {
  try {
    const rows = readDynTable(container, DL_COLUMNS);
    localStorage.setItem(DL_STORAGE_KEY, JSON.stringify(rows));
  } catch (e) {
    // тихо игнорируем — localStorage может быть недоступен
  }
}

function setupDrillLog() {
  const btn = document.getElementById("dl-calc-btn");
  const tableContainer = document.getElementById("dl-table");
  const statusList = document.getElementById("dl-status-list");
  if (!btn || !tableContainer) return;

  // Таблица строится ОДИН раз (из сохранённого журнала, если он есть,
  // иначе — из примеров) и никогда не пересобирается при смене языка —
  // в отличие от разовых калькуляторов (ullage/ballast-sounding), это
  // долгоживущий журнал пользователя: пересборка стёрла бы его записи.
  // Переподпись кнопки "+ Добавить строку" и <option> периодичности при
  // смене языка — через общий data-i18n sweep (applyStrings() в app.js),
  // отдельной логики здесь не нужно.
  window.ShipHelperI18n.preloadI18n().then(() => {
    const saved = dlLoadSaved();
    createDynTable(tableContainer, DL_COLUMNS, saved || dlDefaultDrills());
    // Автосохранение в localStorage при любом изменении строк (ввод,
    // добавление, удаление) — тот же dyntablechange, что уже
    // используют другие калькуляторы для отслеживания правок таблицы.
    tableContainer.addEventListener("dyntablechange", () => dlSave(tableContainer));
  });

  // Примерные названия тревог (если пользователь их не менял) — на язык интерфейса
  const DL_EXAMPLE_KEYS = ["calc.drill_log.example_fire", "calc.drill_log.example_abandon_ship", "calc.drill_log.example_man_overboard"];
  document.addEventListener("shiphelper:langchange", () => {
    const now = lang();
    tableContainer.querySelectorAll('[data-field="name"]').forEach((inp) => {
      const key = DL_EXAMPLE_KEYS.find((k) => ["ru", "en"].some((l) => t(k, l) === inp.value));
      if (key && inp.value !== t(key, now)) { inp.value = t(key, now); }
    });
    dlSave(tableContainer);
    statusList.querySelectorAll(".dl-status-name").forEach((el) => {
      const key = DL_EXAMPLE_KEYS.find((k) => ["ru", "en"].some((l) => t(k, l) === el.textContent));
      if (key) el.textContent = t(key, now);
    });
  });

  function statusLabel(status) {
    return t(`calc.drill_log.status_${status}`, lang());
  }

  function periodicityLabel(periodicity) {
    const opt = DL_PERIODICITY_OPTIONS.find((o) => o.value === periodicity);
    return opt ? t(opt.labelKey, lang()) : periodicity;
  }

  function renderStatuses(results) {
    statusList.innerHTML = "";
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "dl-status-row";

      const nameEl = document.createElement("div");
      nameEl.className = "dl-status-name";
      nameEl.textContent = r.name;
      row.appendChild(nameEl);

      const periodicityEl = document.createElement("div");
      periodicityEl.className = "dl-status-meta";
      periodicityEl.textContent = periodicityLabel(r.periodicity);
      row.appendChild(periodicityEl);

      const dueEl = document.createElement("div");
      dueEl.className = "dl-status-meta";
      if (r.due_date) {
        const daysText = r.days_remaining < 0
          ? t("calc.drill_log.days_overdue", lang(), { n: Math.abs(r.days_remaining) })
          : t("calc.drill_log.days_remaining", lang(), { n: r.days_remaining });
        dueEl.textContent = `${r.due_date} · ${daysText}`;
      } else {
        dueEl.textContent = t("calc.drill_log.manual_hint", lang());
      }
      row.appendChild(dueEl);

      const badge = document.createElement("span");
      badge.className = `dl-badge dl-badge-${r.status}`;
      badge.textContent = statusLabel(r.status);
      row.appendChild(badge);

      statusList.appendChild(row);
    });
  }

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const rows = readDynTable(tableContainer, DL_COLUMNS);
      const results = await callCore("core.drill_log", "drill_statuses", [rows, todayIsoDate()]);
      renderStatuses(results);
    } catch (err) {
      statusList.innerHTML = "";
      const errEl = document.createElement("div");
      errEl.className = "dl-status-row";
      errEl.textContent = translateError(err);
      statusList.appendChild(errEl);
    } finally {
      setBtnBusy(btn, false);
    }
  });
}


/* ================================================================== */
/* Under Keel Clearance — core.ukc (группа "Манёвры и стоянка")        */
/* ================================================================== */

function setupUkc() {
  const btn = document.getElementById("ukc-calc-btn");
  if (!btn) return;

  const confinedCheckbox = document.getElementById("ukc-confined-checkbox");
  const confinedFields = document.getElementById("ukc-confined-fields");
  confinedCheckbox.addEventListener("change", () => {
    confinedFields.hidden = !confinedCheckbox.checked;
  });

  wireStepsToggle("ukc-steps-toggle", "ukc-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const chartedDepth = parseNum("ukc-charted-depth");
      const tideHeight = parseNum("ukc-tide-height");
      const staticDraft = parseNum("ukc-static-draft");
      const beam = parseNum("ukc-beam");
      const heelDeg = parseNum("ukc-heel");
      const blockCoefficient = parseNum("ukc-block-coefficient");
      const speedKnots = parseNum("ukc-speed");
      const waveAllowance = parseNum("ukc-wave-allowance");
      const requiredMinimum = parseNum("ukc-required-minimum");
      // core.ukc.ukc_assessment принимает channel_area/ship_underwater_area
      // как Optional[float] = None на стороне Python — передаём JS null,
      // pyodide.toPy() конвертирует его в None автоматически.
      const channelArea = confinedCheckbox.checked ? parseNum("ukc-channel-area") : null;
      const shipUnderwaterArea = confinedCheckbox.checked ? parseNum("ukc-ship-underwater-area") : null;

      const result = await callCore("core.ukc", "ukc_assessment", [
        chartedDepth, tideHeight, staticDraft, beam, heelDeg,
        blockCoefficient, speedKnots, waveAllowance, requiredMinimum,
        channelArea, shipUnderwaterArea,
      ]);

      const labelEl = document.getElementById("ukc-result-label");
      const valueEl = document.getElementById("ukc-result-value");
      const key = result.passed ? "calc.ukc.result_ok" : "calc.ukc.result_fail";
      labelEl.textContent = result.passed ? t("app.status.ok", lang()) : t("app.status.fail", lang());
      valueEl.textContent = `${result.ukc.toFixed(2)} ${t("calc.unit_converter.unit_m", lang())}`;
      const hintEl = document.getElementById("ukc-result-hint");
      hintEl.textContent = t(key, lang(), {
        ukc: result.ukc.toFixed(2),
        margin: (result.margin >= 0 ? "+" : "") + result.margin.toFixed(2),
      });
      hintEl.classList.toggle("warning", !result.passed);
      renderSteps(document.getElementById("ukc-steps-list"), result.steps);
      document.getElementById("ukc-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("ukc-result-label").textContent = translateError(err);
      document.getElementById("ukc-result-value").textContent = "—";
      document.getElementById("ukc-result-hint").textContent = "";
      document.getElementById("ukc-steps-list").innerHTML = "";
      document.getElementById("ukc-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Squat — core.squat (группа "Манёвры и стоянка")                     */
/* ================================================================== */

function setupSquat() {
  const btn = document.getElementById("squat-calc-btn");
  if (!btn) return;

  wireStepsToggle("squat-open-steps-toggle", "squat-open-steps-list");
  wireStepsToggle("squat-confined-steps-toggle", "squat-confined-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const cb = parseNum("squat-cb");
      const speed = parseNum("squat-speed");
      const [openResult, confinedResult] = await Promise.all([
        callCore("core.squat", "squat_open_water", [cb, speed]),
        callCore("core.squat", "squat_confined_channel", [cb, speed]),
      ]);

      document.getElementById("squat-open-result-label").textContent = t("calc.squat.open_water_metric", lang());
      document.getElementById("squat-open-result-value").textContent = `${openResult.value.toFixed(3)} ${t("calc.unit_converter.unit_m", lang())}`;
      renderSteps(document.getElementById("squat-open-steps-list"), openResult.steps);
      document.getElementById("squat-open-result-box").classList.add("visible");

      document.getElementById("squat-confined-result-label").textContent = t("calc.squat.confined_metric", lang());
      document.getElementById("squat-confined-result-value").textContent = `${confinedResult.value.toFixed(3)} ${t("calc.unit_converter.unit_m", lang())}`;
      renderSteps(document.getElementById("squat-confined-steps-list"), confinedResult.steps);
      document.getElementById("squat-confined-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("squat-open-result-label").textContent = translateError(err);
      document.getElementById("squat-open-result-value").textContent = "—";
      document.getElementById("squat-open-result-box").classList.add("visible");
      document.getElementById("squat-confined-result-box").classList.remove("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Прилив — core.tides (группа "Манёвры и стоянка")                    */
/* ================================================================== */

/** Строит Date из <input type="time"> на сегодняшнюю дату (как Streamlit
 * combine(date.today(), time_input) в app/main.py::render_tides_tab). */
function timeInputToDate(id) {
  const value = document.getElementById(id).value; // "HH:MM"
  const [h, m] = value.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function setupTides() {
  const btn = document.getElementById("tides-calc-btn");
  if (!btn) return;

  wireStepsToggle("tides-steps-toggle", "tides-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const startHeight = parseNum("tides-start-height");
      const endHeight = parseNum("tides-end-height");
      let startDt = timeInputToDate("tides-start-time");
      let endDt = timeInputToDate("tides-end-time");
      let targetDt = timeInputToDate("tides-target-time");

      // Переход через полночь — та же логика, что в Streamlit-версии:
      // если конец полуцикла раньше/равен началу — считаем, что это уже
      // следующие сутки; так же для целевого момента раньше начала.
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (endDt <= startDt) endDt = new Date(endDt.getTime() + ONE_DAY_MS);
      if (targetDt < startDt) targetDt = new Date(targetDt.getTime() + ONE_DAY_MS);

      const result = await callCore("core.tides", "tide_height_rule_of_twelfths", [
        startHeight, startDt, endHeight, endDt, targetDt,
      ]);

      document.getElementById("tides-result-label").textContent = t("calc.tides.height_metric", lang());
      document.getElementById("tides-result-value").textContent = `${result.height_m.toFixed(2)} ${t("calc.unit_converter.unit_m", lang())}`;
      renderSteps(document.getElementById("tides-steps-list"), result.steps);
      document.getElementById("tides-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("tides-result-label").textContent = translateError(err);
      document.getElementById("tides-result-value").textContent = "—";
      document.getElementById("tides-steps-list").innerHTML = "";
      document.getElementById("tides-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Драфт-сюрвей — core.draft_survey + core.ballast (группа            */
/* "Грузовые операции")                                                */
/* ================================================================== */

/** Сегодняшняя дата в ISO "YYYY-MM-DD" по ЛОКАЛЬНОМУ времени браузера
 * (не toISOString(), который переводит в UTC и может сдвинуть дату на
 * соседние сутки у пользователя с восточным/западным смещением) — та же
 * ручная сборка строки, что уже использует setupDefaultDateTimeFields()
 * в app.js для полей <input type="date">. */
function todayIsoDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Универсальная динамическая таблица строк (статьи запасов /
 * балластные танки / тревоги журнала) — единственное место в проекте,
 * где строки добавляются/удаляются пользователем произвольно (аналог
 * st.data_editor(num_rows="dynamic") в Streamlit-версии). columns —
 * [{field, type: "text"|"number"|"date"|"select", options?}, ...] —
 * "select" требует options: [{value, labelKey}] (переведённые подписи
 * через t(), переподписываются при смене языка так же, как остальной
 * статический data-i18n — см. вызовы populate ниже). */
function createDynTable(container, columns, rows) {
  container.innerHTML = "";
  const rowsWrap = document.createElement("div");
  container.appendChild(rowsWrap);
  const labelsRow = container.previousElementSibling;
  const cellLabelKeys = columns.length >= 3 && labelsRow && labelsRow.classList.contains("dyn-table-col-labels")
    ? [...labelsRow.querySelectorAll("span")].map((sp) => sp.dataset.i18n || "")
    : null;

  function addRow(data) {
    data = data || {};
    const row = document.createElement("div");
    row.className = "dyn-table-row" + (columns.length === 3 ? " dyn-table-row-3" : "") +
      (columns.length === 4 ? " dyn-table-row-4" : "") +
      (columns.length === 5 ? " dyn-table-row-5" : "");
    columns.forEach((col, ci) => {
      let input;
      if (col.type === "select") {
        input = document.createElement("select");
        (col.options || []).forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.dataset.i18n = opt.labelKey;
          o.textContent = t(opt.labelKey, lang());
          input.appendChild(o);
        });
      } else {
        input = document.createElement("input");
        input.type = col.type;
        if (col.type === "number") input.step = col.step || "0.01";
      }
      input.dataset.field = col.field;
      if (data[col.field] !== undefined) input.value = data[col.field];
      const labelKey = cellLabelKeys && cellLabelKeys[ci];
      if (labelKey) {
        // На телефоне широкие таблицы (4–5 колонок) перестраиваются в
        // 2 колонки и строка заголовков скрывается — подпись остаётся
        // у каждого поля (на ПК скрыта, там работает строка заголовков).
        const cell = document.createElement("label");
        cell.className = "dyn-cell";
        const cap = document.createElement("span");
        cap.className = "dyn-cell-label";
        cap.dataset.i18n = labelKey;
        cap.textContent = t(labelKey, lang());
        cell.appendChild(cap);
        cell.appendChild(input);
        row.appendChild(cell);
      } else {
        row.appendChild(input);
      }
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "dyn-table-remove";
    removeBtn.textContent = "×";
    removeBtn.title = t("calc.draft.remove_row_btn", lang());
    removeBtn.addEventListener("click", () => {
      row.remove();
      container.dispatchEvent(new Event("dyntablechange"));
    });
    row.appendChild(removeBtn);
    row.addEventListener("input", () => container.dispatchEvent(new Event("dyntablechange")));
    rowsWrap.appendChild(row);
  }

  (rows || []).forEach(addRow);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-secondary dyn-table-add";
  addBtn.textContent = t("calc.draft.add_row_btn", lang());
  // data-i18n — та же общая переподписка applyStrings() при смене
  // языка, что уже применяется к <option> этой же таблицы (см. выше):
  // кнопка не требует отдельного shiphelper:langchange-слушателя и,
  // главное, не требует полной пересборки таблицы (которая стёрла бы
  // уже введённые пользователем строки — критично для «долгоживущих»
  // таблиц вроде журнала тревог, в отличие от разового расчёта).
  addBtn.dataset.i18n = "calc.draft.add_row_btn";
  addBtn.addEventListener("click", () => {
    const blank = {};
    columns.forEach((c) => {
      if (c.type === "number") blank[c.field] = 0;
      else if (c.type === "select") blank[c.field] = (c.options && c.options[0] && c.options[0].value) || "";
      else if (c.type === "date") blank[c.field] = todayIsoDate();
      else blank[c.field] = "";
    });
    addRow(blank);
    // addRow() сама не шлёт dyntablechange (это делают только
    // слушатели конкретной строки — input/remove, см. выше), поэтому
    // без явной отправки здесь добавление строки кнопкой "+" не
    // попадало в автосохранение (нашлось на журнале тревог: только
    // что добавленная пустая строка пропадала после перезагрузки
    // страницы, т.к. dlSave() ни разу не вызывался на это действие).
    container.dispatchEvent(new Event("dyntablechange"));
  });
  container.appendChild(addBtn);
}

/** Для калибровочных таблиц: убрать пустые строки, добавленные кнопкой «+»
 * (все числа = 0), кроме первой строки — таблица может честно начинаться с 0. */
function dropBlankRows(rows) {
  return rows.filter((r, i) => i === 0 || Object.values(r).some((v) => typeof v === "number" && v !== 0));
}

function readDynTable(container, columns) {
  const rows = [];
  container.querySelectorAll(".dyn-table-row").forEach((row) => {
    const item = {};
    columns.forEach((col) => {
      const input = row.querySelector(`[data-field="${col.field}"]`);
      const raw = input ? input.value : "";
      item[col.field] = col.type === "number" ? (parseFloat(raw) || 0) : raw;
    });
    rows.push(item);
  });
  return rows;
}

const DS_DEDUCTIBLE_COLUMNS = [
  { field: "name", type: "text" },
  { field: "weight", type: "number", step: "0.1" },
];
const DS_TANK_COLUMNS = [
  { field: "name", type: "text" },
  { field: "volume", type: "number", step: "0.01" },
  { field: "density", type: "number", step: "0.001" },
];

function dsDefaultTanks() {
  return [
    { name: t("calc.draft.tank_forepeak_port", lang()), volume: 0, density: 1.025 },
    { name: t("calc.draft.tank_forepeak_stbd", lang()), volume: 0, density: 1.025 },
    { name: t("calc.draft.tank_afterpeak", lang()), volume: 0, density: 1.025 },
    { name: t("calc.draft.tank_db1_port", lang()), volume: 0, density: 1.025 },
    { name: t("calc.draft.tank_db1_stbd", lang()), volume: 0, density: 1.025 },
  ];
}

function dsDefaultDeductibles(which) {
  const w = which === "initial"
    ? { hfo: 86.5, do_: 20.2, lo: 3.5, fw: 57.2, other: 4.65 }
    : { hfo: 85.2, do_: 17.1, lo: 3.5, fw: 31.5, other: 9.1 };
  return [
    { name: t("calc.draft.item_hfo", lang()), weight: w.hfo },
    { name: t("calc.draft.item_do", lang()), weight: w.do_ },
    { name: t("calc.draft.item_lo", lang()), weight: w.lo },
    { name: t("calc.draft.item_fw", lang()), weight: w.fw },
    { name: t("calc.draft.item_other", lang()), weight: w.other },
  ];
}

const DS_SURVEY_DEFAULTS = {
  initial: {
    fwd_port: 1.02, fwd_stbd: 0.97, mid_port: 1.34, mid_stbd: 1.29, aft_port: 1.78, aft_stbd: 1.69,
    displacement_low: 2952.2, displacement_high: 2974.7,
    lcf: 0.64, tpc: 22.56, mct_plus50: 244.58, mct_minus50: 220.3,
    actual_density: 1.0, ballast: 21.3,
  },
  final: {
    fwd_port: 3.59, fwd_stbd: 3.58, mid_port: 3.57, mid_stbd: 3.56, aft_port: 3.6, aft_stbd: 3.59,
    displacement_low: 8116.4, displacement_high: 8140.1,
    lcf: -3.13, tpc: 23.74, mct_plus50: 271.53, mct_minus50: 269.32,
    actual_density: 1.0, ballast: 21.3,
  },
};

/** Строит один блок съёмки (INITIAL/FINAL) из <template id="ds-survey-
 * template"> внутрь containerId, заполняет значения по умолчанию и обе
 * динамические таблицы (статьи запасов / танки). Возвращает DOM-узел
 * блока — его же querySelector('[data-field=...]') читают calcSurvey(). */
function dsBuildSurvey(containerId, titleKey, which) {
  const container = document.getElementById(containerId);
  const tpl = document.getElementById("ds-survey-template");
  const node = tpl.content.cloneNode(true);
  const wrap = document.createElement("div");
  wrap.appendChild(node);

  wrap.querySelector(".ds-survey-title").textContent = t(titleKey, lang());

  // Блок клонируется из <template> — его data-i18n-узлы ("Нос (F)",
  // "Осадки, м...", "Лб, м" и т.п.) ещё несут сырой русский текст
  // прямо из разметки шаблона. Обычный applyStrings() (app.js) их не
  // подхватывает: он проходит по document.querySelectorAll один раз при
  // старте/смене языка, а в тот момент этого узла в DOM ещё не было —
  // container.appendChild(wrap) происходит НИЖЕ по функции. Без этой
  // прогонки блок всегда показывал бы русский текст независимо от
  // выбранного языка, включая уже опубликованную английскую версию —
  // найдено при проверке EN на этом самом калькуляторе (Draft Survey).
  wrap.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, lang());
  });
  wrap.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder, lang());
  });

  const defaults = DS_SURVEY_DEFAULTS[which];
  wrap.querySelectorAll(".ds-in").forEach((input) => {
    const field = input.dataset.field;
    if (field in defaults) input.value = defaults[field];
  });

  const deductiblesEl = wrap.querySelector(".ds-deductibles");
  createDynTable(deductiblesEl, DS_DEDUCTIBLE_COLUMNS, dsDefaultDeductibles(which));

  const tanksEl = wrap.querySelector(".ds-tanks");
  const tanksSumEl = wrap.querySelector(".ds-tanks-sum");
  createDynTable(tanksEl, DS_TANK_COLUMNS, dsDefaultTanks());
  const updateTanksSum = async () => {
    const tanks = readDynTable(tanksEl, DS_TANK_COLUMNS);
    try {
      const result = await callCore("core.ballast", "ballast_total", [tanks]);
      tanksSumEl.textContent = t("calc.draft.tanks_sum_live_caption", lang(), { total: result.total.toFixed(3) });
      tanksSumEl.hidden = false;
    } catch (err) {
      console.error(err);
    }
  };
  tanksEl.addEventListener("dyntablechange", updateTanksSum);

  container.innerHTML = "";
  container.appendChild(wrap);
  return wrap;
}

function dsReadSurveyInputs(wrap) {
  const get = (field) => {
    const input = wrap.querySelector(`.ds-in[data-field="${field}"]`);
    return parseFloat(input.value);
  };
  return {
    fwd_port: get("fwd_port"), fwd_stbd: get("fwd_stbd"),
    mid_port: get("mid_port"), mid_stbd: get("mid_stbd"),
    aft_port: get("aft_port"), aft_stbd: get("aft_stbd"),
    displacement_low: get("displacement_low"), displacement_high: get("displacement_high"),
    lcf: get("lcf"), tpc: get("tpc"), mct_plus50: get("mct_plus50"), mct_minus50: get("mct_minus50"),
    actual_density: get("actual_density"), ballast: get("ballast"),
    deductibles_list: readDynTable(wrap.querySelector(".ds-deductibles"), DS_DEDUCTIBLE_COLUMNS),
  };
}

function dsCommonParams() {
  return {
    method: document.getElementById("ds-method").value,
    lbp: parseNum("ds-lbp"),
    dist_mid: parseNum("ds-dist-mid"),
    table_step: parseNum("ds-table-step"),
    dist_fwd: parseNum("ds-dist-fwd"),
    dist_aft: parseNum("ds-dist-aft"),
    lightship: parseNum("ds-lightship"),
  };
}

async function dsCalcSurvey(wrap) {
  const common = dsCommonParams();
  const inputs = dsReadSurveyInputs(wrap);
  const deductibles = await callCore("core.draft_survey", "deductible_items_to_dict", [inputs.deductibles_list]);
  deductibles[t("calc.draft.ballast_item_key", lang())] = inputs.ballast;
  const result = await callCore("core.draft_survey", "single_survey", [
    common.method,
    inputs.fwd_port, inputs.fwd_stbd, inputs.mid_port, inputs.mid_stbd, inputs.aft_port, inputs.aft_stbd,
    common.dist_fwd, common.dist_mid, common.dist_aft, common.lbp, common.table_step,
    inputs.displacement_low, inputs.displacement_high,
    inputs.lcf, inputs.tpc, inputs.mct_plus50, inputs.mct_minus50,
    inputs.actual_density, deductibles,
  ]);
  // Исходные данные съёмки сохраняются вместе с результатом — нужны для
  // отчёта в Word (замеры осадок, гидростатика, статьи запасов), которые
  // иначе к моменту формирования отчёта уже могли быть изменены в форме.
  result._inputs = inputs;
  result._deductibles = deductibles;
  return result;
}

/* Отчёт драфт-сюрвея в Word (.docx) — формируется полностью в браузере,
   офлайн (js/docx-writer.js), из уже посчитанных INITIAL/FINAL съёмок. */
function dsBuildWordReport(state) {
  const L = lang();
  const f3 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "—");
  const f2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "—");
  const f1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "—");
  const vessel = state.vesselName || t("report.draft.vessel_unspecified", L);
  const now = new Date();
  const dateStr = now.toLocaleString(L === "en" ? "en-GB" : "ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const methodName = t(`calc.draft.method.${state.method}`, L);
  const surveys = [
    { label: t("calc.draft.initial_label", L), r: state.initial },
    { label: t("calc.draft.final_label", L), r: state.final },
  ];

  const doc = window.ShipHelperDocx.create({
    title: t("report.draft.title", L, { vessel }),
    footer: `${t("calc.draft.title", L)} · ${vessel} · Azimuth`,
  });

  doc.title(t("report.draft.title", L, { vessel }), t("report.draft.generated_at", L, { date: dateStr }));

  // Итог — первым, как в реальных отчётах сюрвейеров: главное число сразу.
  doc.heading(t("report.draft.totals_header", L));
  doc.table([
    [t("report.draft.cargo_label", L), { text: f3(state.cargo), bold: true }],
    [t("report.draft.constant_label", L), f3(state.constant)],
    [t("report.draft.net_displacement_label", L) + " — INITIAL", f3(state.initial.net_displacement)],
    [t("report.draft.net_displacement_label", L) + " — FINAL", f3(state.final.net_displacement)],
  ], { widths: [6638, 3000] });

  doc.heading(t("report.draft.vessel_params_header", L));
  const c = state.common;
  doc.table([
    [t("calc.draft.method_label", L), methodName],
    [t("report.draft.lbp_label", L), f2(c.lbp)],
    [t("report.draft.dist_fwd_label", L), f2(c.dist_fwd)],
    [t("report.draft.dist_mid_label", L), f2(c.dist_mid)],
    [t("report.draft.dist_aft_label", L), f2(c.dist_aft)],
    [t("report.draft.table_step_label", L), String(c.table_step)],
    [t("report.draft.lightship_label", L), f1(c.lightship)],
  ], { widths: [6638, 3000] });

  // Сравнительная таблица двух съёмок — INITIAL и FINAL в соседних колонках.
  doc.heading(t("report.draft.comparison_header", L));
  const hdr = ["", "INITIAL", "FINAL"];
  const row = (label, fn) => [label, ...surveys.map((s) => fn(s.r))];
  const pair = (a, b) => `${f3(a)} / ${f3(b)}`;
  doc.table([
    hdr,
    row(t("report.draft.drafts_fwd_label", L), (r) => pair(r._inputs.fwd_port, r._inputs.fwd_stbd)),
    row(t("report.draft.drafts_mid_label", L), (r) => pair(r._inputs.mid_port, r._inputs.mid_stbd)),
    row(t("report.draft.drafts_aft_label", L), (r) => pair(r._inputs.aft_port, r._inputs.aft_stbd)),
    row(t("report.draft.corrected_drafts_label", L), (r) => `${f3(r.draft_fwd)} / ${f3(r.draft_mid)} / ${f3(r.draft_aft)}`),
    row(t("report.draft.true_mean_draft_label", L), (r) => f3(r.true_mean_draft)),
    row(t("report.draft.hog_sag_label", L), (r) => dsHogSagLabel(r.hog_sag)),
    row(t("report.draft.table_disp_label", L), (r) => `${f1(r._inputs.displacement_low)} / ${f1(r._inputs.displacement_high)}`),
    row(t("report.draft.lcf_label", L), (r) => f2(r._inputs.lcf)),
    row(t("report.draft.tpc_label", L), (r) => f2(r._inputs.tpc)),
    row(t("report.draft.mct_plus_label", L), (r) => f2(r._inputs.mct_plus50)),
    row(t("report.draft.mct_minus_label", L), (r) => f2(r._inputs.mct_minus50)),
    row(t("report.draft.density_label", L), (r) => f3(r._inputs.actual_density)),
    row(t("report.draft.disp_table_label", L), (r) => f3(r.displacement_table)),
    row(t("report.draft.disp_trim_label", L), (r) => f3(r.displacement_trim_corrected)),
    row(t("report.draft.disp_density_label", L), (r) => f3(r.displacement_density_corrected)),
    row(t("report.draft.deductibles_total_label", L), (r) => f3(r.deductibles_total)),
    row(t("report.draft.net_displacement_label", L), (r) => ({ text: f3(r.net_displacement), bold: true })),
  ], { header: true, zebra: true, widths: [4838, 2400, 2400] });

  // Статьи запасов — объединённый список названий из обеих съёмок.
  doc.heading(t("report.draft.deductibles_header", L));
  const names = [];
  surveys.forEach((s) => Object.keys(s.r._deductibles || {}).forEach((n) => { if (!names.includes(n)) names.push(n); }));
  doc.table([
    hdr,
    ...names.map((n) => [n, ...surveys.map((s) => f3((s.r._deductibles || {})[n] ?? 0))]),
    [{ text: t("report.draft.deductibles_total_label", L), bold: true }, ...surveys.map((s) => ({ text: f3(s.r.deductibles_total), bold: true }))],
  ], { header: true, zebra: true, widths: [4838, 2400, 2400] });

  // Подписи — как в бумажном отчёте драфт-сюрвея.
  doc.heading(t("report.draft.signatures_header", L));
  doc.table([
    [t("report.draft.sign_chief_officer", L), "\n"],
    [t("report.draft.sign_master", L), "\n"],
    [t("report.draft.sign_surveyor", L), "\n"],
  ], { widths: [3638, 6000], size: 11 });

  // Приложение: полный ход расчёта по каждой съёмке.
  surveys.forEach((s) => {
    doc.heading(`${t("report.draft.calc_steps_header", L)} — ${s.label}`);
    doc.table([
      [t("report.draft.steps_col_description", L), t("report.draft.steps_col_formula", L), t("report.draft.steps_col_result", L)],
      ...(s.r.steps || []).map((raw) => (L === "en" && window.ShipHelperStepsEN ? window.ShipHelperStepsEN.translateStep(raw) : raw)).map((st) => [
        st.description,
        `${st.formula}\n${st.substitution}`,
        st.result,
      ]),
    ], { header: true, zebra: true, widths: [3200, 3838, 2600], numAlign: "left", size: 8.5 });
  });
  if (state.cargoSteps && state.cargoSteps.length) {
    doc.table([
      [t("report.draft.steps_col_description", L), t("report.draft.steps_col_formula", L), t("report.draft.steps_col_result", L)],
      ...state.cargoSteps.map((raw) => localStep(raw)).map((st) => [st.description, `${st.formula}\n${st.substitution}`, st.result]),
    ], { header: true, zebra: true, widths: [3200, 3838, 2600], numAlign: "left", size: 8.5 });
  }

  doc.paragraph(t("calc.common.disclaimer", L), { size: 8, italic: true, color: "7A869A", spaceBefore: 200 });

  const safe = (state.vesselName || "report").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60);
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  window.ShipHelperDocx.download(doc.toBlob(), `Draft_Survey_${safe}_${stamp}.docx`);
}

function dsHogSagLabel(status) {
  const key = { HOGGED: "calc.draft.hogsag.hogged", SAGGED: "calc.draft.hogsag.sagged", EVEN: "calc.draft.hogsag.even" }[status];
  return key ? t(key, lang()) : status;
}

function dsBuildPrintReport(state) {
  const area = document.getElementById("ds-print-report");
  const fmt = (v, d) => Number(v).toFixed(d !== undefined ? d : 3);
  const survRow = (label, s) => `
    <h4>${label}</h4>
    <table>
      <tr><td>${t("calc.draft.true_draft_initial_metric", lang()).replace("INITIAL", "").trim()}</td><td>${fmt(s.true_mean_draft)} ${u("м")}</td></tr>
      <tr><td>${t("calc.draft.hog_sag_caption", lang(), { value: "" })}</td><td>${dsHogSagLabel(s.hog_sag)}</td></tr>
      <tr><td>${u("Dнетто")}</td><td>${fmt(s.net_displacement)} ${u("т")}</td></tr>
    </table>`;
  area.innerHTML = `
    <h4>${state.vesselName || "Azimuth"} — ${t("calc.draft.title", lang())}</h4>
    <p>${t("calc.draft.method_label", lang())}: ${state.method}</p>
    ${survRow(t("calc.draft.initial_label", lang()), state.initial)}
    ${survRow(t("calc.draft.final_label", lang()), state.final)}
    <table>
      <tr><td>${t("calc.draft.constant_metric", lang())}</td><td>${fmt(state.constant)} ${u("т")}</td></tr>
      <tr><td>${t("calc.draft.cargo_metric", lang())}</td><td>${fmt(state.cargo, 1)} ${u("т")}</td></tr>
    </table>
    <p>${t("calc.common.disclaimer", lang())}</p>
  `;
}

function setupDraftSurvey() {
  const initBtn = document.getElementById("ds-calc-initial-btn");
  const finalBtn = document.getElementById("ds-calc-final-btn");
  if (!initBtn || !finalBtn) return;

  wireStepsToggle("ds-initial-steps-toggle", "ds-initial-steps-list");
  wireStepsToggle("ds-final-steps-toggle", "ds-final-steps-list");
  wireStepsToggle("ds-cargo-steps-toggle", "ds-cargo-steps-list");

  // ВАЖНО: этот файл выполняется синхронно сразу после подключения
  // <script>, а строки переводов (data/strings/*.json) грузятся
  // асинхронно через window.ShipHelperI18n.preloadI18n() — тот же
  // preloadI18n(), что app.js уже вызвал в своём boot() (кэш общий,
  // повторный вызов просто ждёт готовые/догружающиеся данные, а не
  // дублирует их). Если строить блоки съёмок ПРЯМО СЕЙЧАС (как было в
  // первой версии), t() здесь вызывается до того, как строки готовы, и
  // вместо текста показываются сырые плейсхолдеры "[[key]]" — поймано
  // Playwright-скриншотом. Пока #loading-screen перекрывает страницу
  // (снимается в app.js только после await preloadI18n()), пользователь
  // этого не видит — но строить DOM нужно ПОСЛЕ преload, а не до.
  let initialWrap = null;
  let finalWrap = null;
  let dsInitialResult = null;
  let dsInitialConstant = null;
  let dsLastReport = null;

  // НАЙДЕННЫЙ РЕАЛЬНЫЙ БАГ (отзыв пользователя: "Сбросить" чистит только
  // верхние поля, остальное — как было): dsRebuildSurveys() всегда
  // корректно пересобирала DOM обеих съёмок (включая их вложенные
  // таблицы танков/статей запасов — это проверено), но НЕ трогала
  // внутреннее состояние поверх DOM — dsInitialResult/dsInitialConstant
  // (результат расчёта Шага 1, нужный для Шага 2) и disabled-статус
  // finalBtn. Из-за этого после "Сбросить" (и так же, менее заметно,
  // после смены языка — dsRebuildSurveys вызывается оттуда же) кнопка
  // "Рассчитать конечный драфт" могла остаться АКТИВНОЙ, а клик по ней —
  // посчитать груз по СТАРОМУ, уже недействительному результату Шага 1,
  // хотя поля на экране выглядели пустыми/сброшенными к дефолту. Теперь
  // dsRebuildSurveys() явно обнуляет это состояние и визуально
  // возвращает блок во "состояние до Шага 1" (кнопка Шага 2 снова
  // заблокирована, предупреждение "сначала посчитайте Шаг 1" снова
  // показано, отчёт для печати скрыт) — одинаково что при явном
  // "Сбросить", что при смене языка.
  function dsRebuildSurveys() {
    initialWrap = dsBuildSurvey("ds-initial-survey", "calc.draft.initial_label", "initial");
    finalWrap = dsBuildSurvey("ds-final-survey", "calc.draft.final_label", "final");
    dsInitialResult = null;
    dsInitialConstant = null;
    dsLastReport = null;
    finalBtn.disabled = true;
    const missingWarning = document.getElementById("ds-initial-missing-warning");
    if (missingWarning) missingWarning.hidden = false;
    const reportSection = document.getElementById("ds-report-section");
    if (reportSection) reportSection.hidden = true;
    const reportArea = document.getElementById("ds-report-area");
    if (reportArea) reportArea.hidden = true;
    ["ds-initial-result-box", "ds-initial-constant-box", "ds-final-result-box", "ds-cargo-result-box"].forEach((id) => {
      document.getElementById(id)?.classList.remove("visible");
    });
  }
  window.ShipHelperI18n.preloadI18n().then(dsRebuildSurveys);

  // Регистрация в общем реестре "сбросить к дефолту" (см.
  // setupCalcPersistence() ниже) — у драфт-сюрвея сложная, нестандартная
  // структура полей (две съёмки INITIAL/FINAL, каждая со своими
  // динамическими таблицами статей запасов/танков, собранными из
  // <template>, без единого набора плоских id верхнего уровня), поэтому
  // он не покрывается общей логикой сброса для простых калькуляторов —
  // вместо этого переиспользует уже существующую dsRebuildSurveys()
  // (ту же функцию, что вызывается при смене языка чуть ниже), которая
  // и так умеет полностью пересобрать обе съёмки к значениям по
  // умолчанию, включая их динамические таблицы.
  window.ShipHelperCalcReset = window.ShipHelperCalcReset || {};
  window.ShipHelperCalcReset.draft = dsRebuildSurveys;

  // Язык может смениться уже после построения блоков — пересобрать их
  // заново (со свежими значениями по умолчанию/подписями), сохранив
  // введённые числа нецелесообразно здесь усложнять: язык меняется
  // редко и посреди заполнения формы такого объёма — маловероятный
  // сценарий, повторный ввод переживаем сознательно как компромисс.
  document.addEventListener("shiphelper:langchange", dsRebuildSurveys);

  initBtn.addEventListener("click", async () => {
    if (!initialWrap) return; // строки/блоки ещё не готовы — практически недостижимо, см. комментарий выше
    setBtnBusy(initBtn, true);
    try {
      const result = await dsCalcSurvey(initialWrap);
      dsInitialResult = result;
      dsInitialConstant = result.net_displacement - parseNum("ds-lightship");

      document.getElementById("ds-initial-draft-label").textContent = t("calc.draft.true_draft_initial_metric", lang());
      document.getElementById("ds-initial-draft-value").textContent = `${result.true_mean_draft.toFixed(3)} ${u("м")}`;
      document.getElementById("ds-initial-hogsag-caption").textContent = t("calc.draft.hog_sag_caption", lang(), { value: dsHogSagLabel(result.hog_sag) });
      renderSteps(document.getElementById("ds-initial-steps-list"), result.steps);
      document.getElementById("ds-initial-result-box").classList.add("visible");

      document.getElementById("ds-initial-constant-label").textContent = t("calc.draft.constant_metric", lang());
      document.getElementById("ds-initial-constant-value").textContent = `${dsInitialConstant.toFixed(3)} ${u("т")}`;
      document.getElementById("ds-initial-constant-box").classList.add("visible");

      finalBtn.disabled = false;
      document.getElementById("ds-initial-missing-warning").hidden = true;
    } catch (err) {
      document.getElementById("ds-initial-draft-label").textContent = translateError(err);
      document.getElementById("ds-initial-draft-value").textContent = "—";
      document.getElementById("ds-initial-result-box").classList.add("visible");
    } finally {
      setBtnBusy(initBtn, false);
    }
  });

  finalBtn.addEventListener("click", async () => {
    if (!dsInitialResult) return;
    setBtnBusy(finalBtn, true);
    try {
      const result = await dsCalcSurvey(finalWrap);
      const lightship = parseNum("ds-lightship");
      const cargoResult = await callCore("core.draft_survey", "cargo_from_two_surveys", [
        dsInitialResult.net_displacement, result.net_displacement, lightship,
      ]);

      document.getElementById("ds-final-draft-label").textContent = t("calc.draft.true_draft_final_metric", lang());
      document.getElementById("ds-final-draft-value").textContent = `${result.true_mean_draft.toFixed(3)} ${u("м")}`;
      document.getElementById("ds-final-hogsag-caption").textContent = t("calc.draft.hog_sag_caption", lang(), { value: dsHogSagLabel(result.hog_sag) });
      renderSteps(document.getElementById("ds-final-steps-list"), result.steps);
      document.getElementById("ds-final-result-box").classList.add("visible");

      document.getElementById("ds-cargo-label").textContent = t("calc.draft.cargo_metric", lang());
      document.getElementById("ds-cargo-value").textContent = `${cargoResult.cargo.toFixed(1)} ${u("т")}`;
      renderSteps(document.getElementById("ds-cargo-steps-list"), cargoResult.steps);
      document.getElementById("ds-cargo-result-box").classList.add("visible");

      document.getElementById("ds-report-section").hidden = false;
      document.getElementById("ds-report-area").hidden = false;
      dsLastReport = {
        vesselName: document.getElementById("ds-vessel-name").value.trim(),
        method: document.getElementById("ds-method").value,
        common: dsCommonParams(),
        initial: dsInitialResult,
        final: result,
        constant: dsInitialConstant,
        cargo: cargoResult.cargo,
        cargoSteps: cargoResult.steps,
      };
      dsBuildPrintReport(dsLastReport);
    } catch (err) {
      document.getElementById("ds-final-draft-label").textContent = translateError(err);
      document.getElementById("ds-final-draft-value").textContent = "—";
      document.getElementById("ds-final-result-box").classList.add("visible");
    } finally {
      setBtnBusy(finalBtn, false);
    }
  });

  const printBtn = document.getElementById("ds-print-btn");
  if (printBtn) printBtn.addEventListener("click", () => {
    // В Android-сборке window.print() у WebView не работает — печать/PDF через PrintManager
    if (window.AzimuthNative && typeof window.AzimuthNative.print === "function") window.AzimuthNative.print();
    else window.print();
  });

  const wordBtn = document.getElementById("ds-word-btn");
  if (wordBtn) wordBtn.addEventListener("click", () => {
    if (!dsLastReport || !window.ShipHelperDocx) return;
    try {
      dsBuildWordReport(dsLastReport);
    } catch (err) {
      console.error(err);
      const prev = wordBtn.textContent;
      wordBtn.textContent = t("app.calc_error", lang());
      setTimeout(() => { wordBtn.textContent = prev; }, 2500);
    }
  });
}

/* ================================================================== */
/* Остойчивость — core.stability (группа "Грузовые операции")          */
/* ================================================================== */

function setupStability() {
  const gmBtn = document.getElementById("st-calc-gm-btn");
  if (!gmBtn) return;
  wireStepsToggle("st-gm-steps-toggle", "st-gm-steps-list");
  wireStepsToggle("st-list-steps-toggle", "st-list-steps-list");

  // Δ и KG всегда читаются из полей в момент нажатия; результат операции с
  // грузом записывается обратно в поля Δ/KG — дальше «Посчитать GM» и крен
  // считаются уже от нового состояния судна.
  const flash = (id) => { const el = document.getElementById(id); el.classList.remove("sh-fade-in"); void el.offsetWidth; el.classList.add("sh-fade-in"); };

  gmBtn.addEventListener("click", async () => {
    setBtnBusy(gmBtn, true);
    try {
      const result = await callCore("core.stability", "metacentric_height", [parseNum("st-km"), parseNum("st-kg")]);
      document.getElementById("st-gm-value").textContent = `${result.value.toFixed(3)} ${u("м")}`;
      document.getElementById("st-gm-negative-warning").hidden = result.value >= 0;
      renderSteps(document.getElementById("st-gm-steps-list"), result.steps);
      document.getElementById("st-gm-result-box").classList.add("visible");
      document.getElementById("st-list-gm").value = result.value.toFixed(3);
    } catch (err) {
      document.getElementById("st-gm-value").textContent = translateError(err);
    } finally {
      setBtnBusy(gmBtn, false);
    }
  });

  // Переключатель операции с грузом: показывает/скрывает нужный блок
  // полей, ничего не считает сам по себе.
  const opSwitch = document.getElementById("st-op-switch");
  opSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      opSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      document.getElementById("st-op-load-discharge").hidden = b.dataset.mode !== "load_discharge";
      document.getElementById("st-op-vertical-shift").hidden = b.dataset.mode !== "vertical_shift";
    });
  });

  const ldOpSwitch = document.getElementById("st-ld-op-switch");
  let ldOperation = "load";
  ldOpSwitch.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      ldOperation = b.dataset.mode;
      ldOpSwitch.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    });
  });

  document.getElementById("st-calc-ld-btn").addEventListener("click", async () => {
    try {
      const result = await callCore("core.stability", "kg_after_load_discharge", [
        parseNum("st-displacement"), parseNum("st-kg"), parseNum("st-ld-weight"), parseNum("st-ld-weight-kg"), ldOperation,
      ]);
      document.getElementById("st-kg").value = result.new_kg.toFixed(3);
      document.getElementById("st-displacement").value = result.new_displacement.toFixed(1);
      flash("st-kg"); flash("st-displacement");
      document.getElementById("st-ld-value").textContent = `${result.new_kg.toFixed(3)} ${u("м")}`;
      renderSteps(document.getElementById("st-ld-steps-list"), result.steps);
      document.getElementById("st-ld-result-box").classList.add("visible");
      document.getElementById("st-list-gm").value = "";
    } catch (err) {
      document.getElementById("st-ld-value").textContent = translateError(err);
    }
  });

  document.getElementById("st-calc-vs-btn").addEventListener("click", async () => {
    try {
      const result = await callCore("core.stability", "kg_after_vertical_shift", [
        parseNum("st-displacement"), parseNum("st-kg"), parseNum("st-vs-weight"), parseNum("st-vs-distance"),
      ]);
      document.getElementById("st-kg").value = result.new_kg.toFixed(3);
      flash("st-kg");
      document.getElementById("st-vs-value").textContent = `${result.new_kg.toFixed(3)} ${u("м")}`;
      renderSteps(document.getElementById("st-vs-steps-list"), result.steps);
      document.getElementById("st-list-gm").value = "";
    } catch (err) {
      document.getElementById("st-vs-value").textContent = translateError(err);
    }
    document.getElementById("st-vs-result-box").classList.add("visible");
  });

  const listBtn = document.getElementById("st-calc-list-btn");
  listBtn.addEventListener("click", async () => {
    setBtnBusy(listBtn, true);
    try {
      const result = await callCore("core.stability", "list_angle_from_transverse_shift", [
        parseNum("st-displacement"), parseNum("st-list-gm"), parseNum("st-list-weight"), parseNum("st-list-distance"),
      ]);
      document.getElementById("st-list-value").textContent = `${result.list_deg.toFixed(2)}°`;
      document.getElementById("st-list-over10").hidden = Math.abs(result.list_deg) <= 10;
      renderSteps(document.getElementById("st-list-steps-list"), result.steps);
      document.getElementById("st-list-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("st-list-value").textContent = translateError(err);
      document.getElementById("st-list-result-box").classList.add("visible");
    } finally {
      setBtnBusy(listBtn, false);
    }
  });
}

/* ================================================================== */
/* Теория и справочник — data/theory/*.json (контент, читается напрямую */
/* через fetch(), как i18n.js читает data/strings/*.json — та же       */
/* логика отката requested-lang -> ru, дублировать её через Pyodide    */
/* ради простого JSON-файла нет смысла) + SVG-диаграммы (core/         */
/* diagrams.py и 7 родственных модулей — вот это уже настоящая         */
/* Python-логика построения SVG, вызывается через callCore(), как и    */
/* остальные калькуляторы).                                            */
/* ================================================================== */

// Реестр тем — зеркалит core/theory.py::TOPICS (см. комментарий в
// i18n.js о том, почему такое зеркалирование тривиальных данных
// приемлемо, в отличие от дублирования формул). Список короткий и
// меняется редко (появление новой темы — редкое событие, требующее
// правки core/theory.py в любом случае).
const THEORY_TOPICS = [
  "colregs", "gmdss", "iala", "distress_signals", "light_shapes",
  "smcp", "meteorology", "isps", "reference_tables",
].map((id) => ({ id, status: "ready" }));

const _theoryContentCache = {};

/** Грузит содержимое темы на нужном языке, с тем же откатом lang->ru,
 * что и core/theory.py::load_topic_content() — но напрямую через
 * fetch(), а не через Pyodide (контент — статичные данные, а не
 * логика, см. заголовок раздела). usedFallback=true означает "перевода
 * на запрошенный язык нет физически, показан русский текст" — отдельно
 * от случая requestedLang === "ru" (тогда фолбэка по определению нет). */
async function loadTheoryContent(topicId, requestedLang) {
  async function fetchLang(l) {
    try {
      // cache: "no-cache" — см. комментарий у _fetchText() в
      // pyodide-bridge.js: без этого браузер эвристически кэширует
      // ответы python http.server и молча отдаёт старые версии файлов.
      const resp = await fetch(`../data/theory/${topicId}.${l}.json`, { cache: "no-cache" });
      if (resp.ok) return await resp.json();
    } catch (e) { /* сеть недоступна/файла нет — обрабатываем как отсутствие */ }
    return null;
  }
  const cacheKey = `${topicId}.${requestedLang}`;
  if (cacheKey in _theoryContentCache) return _theoryContentCache[cacheKey];

  let data = await fetchLang(requestedLang);
  let usedFallback = false;
  if (!data && requestedLang !== "ru") {
    data = await fetchLang("ru");
    usedFallback = true;
  }
  // Новый формат темы (МППСС с официальным текстом): {meta, entries}; старый — массив.
  const entries = Array.isArray(data) ? data : (data && data.entries) || [];
  const meta = data && !Array.isArray(data) ? data.meta || null : null;
  const result = { content: entries, meta, usedFallback };
  _theoryContentCache[cacheKey] = result;
  return result;
}

// Порядок поиска диаграммы по имени — зеркалит _DIAGRAM_SOURCES в
// app/main.py: первый модуль, у которого найдётся диаграмма с таким
// именем в его DIAGRAMS, и используется. В отличие от контента, ЭТО —
// настоящий Python-код (построение SVG-разметки), поэтому вызывается
// через callCore(), а не переписывается на JS.
const THEORY_DIAGRAM_LOOKUPS = [
  ["core.diagrams", "get_diagram_html"],
  ["core.buoy_diagrams", "get_buoy_diagram_html"],
  ["core.gmdss_diagrams", "get_gmdss_diagram_html"],
  ["core.light_diagrams", "get_light_diagram_html"],
  ["core.distress_signals_diagrams", "get_distress_signals_diagram_html"],
  ["core.smcp_diagrams", "get_smcp_diagram_html"],
  ["core.meteorology_diagrams", "get_meteorology_diagram_html"],
  ["core.isps_diagrams", "get_isps_diagram_html"],
];

async function lookupDiagramHtml(name, langCode) {
  for (const [module, func] of THEORY_DIAGRAM_LOOKUPS) {
    try {
      const html = await callCore(module, func, [name, langCode]);
      if (html) return html;
    } catch (err) {
      console.error(err);
    }
  }
  return null;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function theoryShortNumber(number) {
  // «Правило 14» → «14», «Приложение IV» → «IV»: подписи в оглавлении
  return String(number).replace(/^(Правило|Rule|Приложение|Annex)\s+/i, "");
}

function renderOfficialParagraphs(paras) {
  return paras.map((p) => {
    const label = p.label ? `<span class="bp-label">${escapeHtml(p.label)}</span>` : "";
    const lines = escapeHtml(p.text).replace(/\n/g, "<br>");
    return `<p class="bp l${p.level || 0}${p.label ? "" : " nolabel"}">${label}<span class="bp-text">${lines}</span></p>`;
  }).join("");
}

/* Флаги Международного свода сигналов (МСС) — рисунок по официальному описанию
   (рисунок флага не охраняется — это часть МСС). viewBox 30×20, древко слева. */
function icsFlagSvg(letter) {
  const Y = "#f6c90e", B = "#1d4fa8", R = "#d7263d", W = "#ffffff", K = "#151515";
  const rect = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
  const poly = (pts, c) => `<polygon points="${pts}" fill="${c}"/>`;
  let body = "";
  switch (String(letter).trim().toUpperCase()) {
    case "A": body = rect(0, 0, 13, 20, W) + poly("13,0 30,0 22,10 30,20 13,20", B); return wrapFlag(body, true);
    case "B": body = poly("0,0 30,0 22,10 30,20 0,20", R); return wrapFlag(body, true);
    case "C": body = [B, W, R, W, B].map((c, i) => rect(0, i * 4, 30, 4, c)).join(""); break;
    case "D": body = rect(0, 0, 30, 20, Y) + rect(0, 5, 30, 10, B); break;
    case "E": body = rect(0, 0, 30, 10, B) + rect(0, 10, 30, 10, R); break;
    case "F": body = rect(0, 0, 30, 20, W) + poly("15,1 29,10 15,19 1,10", R); break;
    case "G": body = [Y, B, Y, B, Y, B].map((c, i) => rect(i * 5, 0, 5, 20, c)).join(""); break;
    case "H": body = rect(0, 0, 15, 20, W) + rect(15, 0, 15, 20, R); break;
    case "I": body = rect(0, 0, 30, 20, Y) + `<circle cx="15" cy="10" r="5.5" fill="${K}"/>`; break;
    case "J": body = rect(0, 0, 30, 20, B) + rect(0, 6.67, 30, 6.67, W); break;
    case "K": body = rect(0, 0, 15, 20, Y) + rect(15, 0, 15, 20, B); break;
    case "L": body = rect(0, 0, 15, 10, Y) + rect(15, 0, 15, 10, K) + rect(0, 10, 15, 10, K) + rect(15, 10, 15, 10, Y); break;
    case "M": body = rect(0, 0, 30, 20, B) + `<path d="M0 0L30 20M30 0L0 20" stroke="${W}" stroke-width="4"/>`; break;
    case "N": for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) body += rect(c * 7.5, r * 5, 7.5, 5, (r + c) % 2 ? W : B); break;
    case "O": body = poly("0,0 30,0 30,20", R) + poly("0,0 0,20 30,20", Y); break;
    case "P": body = rect(0, 0, 30, 20, B) + rect(10, 6.5, 10, 7, W); break;
    case "Q": body = rect(0, 0, 30, 20, Y); break;
    case "R": body = rect(0, 0, 30, 20, R) + rect(12.5, 0, 5, 20, Y) + rect(0, 7.5, 30, 5, Y); break;
    case "S": body = rect(0, 0, 30, 20, W) + rect(10, 6.5, 10, 7, B); break;
    case "T": body = rect(0, 0, 10, 20, R) + rect(10, 0, 10, 20, W) + rect(20, 0, 10, 20, B); break;
    case "U": body = rect(0, 0, 15, 10, R) + rect(15, 0, 15, 10, W) + rect(0, 10, 15, 10, W) + rect(15, 10, 15, 10, R); break;
    case "V": body = rect(0, 0, 30, 20, W) + `<path d="M0 0L30 20M30 0L0 20" stroke="${R}" stroke-width="4"/>`; break;
    case "W": body = rect(0, 0, 30, 20, B) + rect(4, 4, 22, 12, W) + rect(9, 7.5, 12, 5, R); break;
    case "X": body = rect(0, 0, 30, 20, W) + rect(12.5, 0, 5, 20, B) + rect(0, 7.5, 30, 5, B); break;
    case "Y": body = `<defs><pattern id="icsY" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="${Y}"/><rect x="3" width="3" height="6" fill="${R}"/></pattern></defs>` + rect(0, 0, 30, 20, "url(#icsY)"); break;
    case "Z": body = poly("0,0 30,0 15,10", Y) + poly("30,0 30,20 15,10", B) + poly("0,20 30,20 15,10", R) + poly("0,0 0,20 15,10", K); break;
    default: return "";
  }
  return wrapFlag(body, false);
}
function wrapFlag(body, swallow) {
  const outline = swallow ? `<polygon points="0,0 30,0 22,10 30,20 0,20" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>` : `<rect x=".3" y=".3" width="29.4" height="19.4" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`;
  return `<svg class="ics-flag" viewBox="0 0 30 20" width="36" height="24" aria-hidden="true">${body}${outline}</svg>`;
}

async function renderTheoryTopic(topicId) {
  const container = document.getElementById("theory-content");
  const missingNote = document.getElementById("theory-missing-translation");
  const sourcesExpander = document.getElementById("theory-sources-expander");
  const sourcesList = document.getElementById("theory-sources-list");
  const currentLang = lang();

  const { content, meta, usedFallback } = await loadTheoryContent(topicId, currentLang);
  missingNote.hidden = !usedFallback;

  if (!content.length) {
    container.innerHTML = `<div class="card"><p>${t("theory.planned_warning", currentLang, { title: t(`topic.${topicId}.title`, currentLang) })}</p></div>`;
    sourcesExpander.hidden = true;
    return;
  }

  container.innerHTML = "";
  container.classList.add("book");
  // Дисклеймер темы: у тем с официальным текстом — другая формулировка
  // (data-i18n у элемента меняем, чтобы смена языка подхватила верный ключ).
  const discl = document.getElementById("theory-disclaimer-text");
  if (discl) {
    const key = meta && meta.official_source ? "theory.content_disclaimer_official" : "theory.content_disclaimer";
    discl.dataset.i18n = key;
    discl.textContent = t(key, currentLang);
  }
  const hasOfficial = content.some((e) => e.official && e.official.length);

  if (meta && meta.official_source) {
    const src = document.createElement("div");
    src.className = "book-source";
    src.innerHTML = `<span class="book-source-badge">${escapeHtml(t("theory.official_text", currentLang))}</span><p>${escapeHtml(meta.official_source)}</p>`;
    container.appendChild(src);
  }

  // Оглавление — как в книге: части и номера правил, переход по нажатию.
  const anchors = content.map((_, i) => `th-${topicId}-${i}`);
  const toc = document.createElement("details");
  toc.className = "book-toc";
  let tocHtml = `<summary>${escapeHtml(t("theory.contents", currentLang))}</summary><div class="book-toc-body">`;
  let tocPart = null;
  content.forEach((e, i) => {
    if (e.part !== tocPart) {
      if (tocPart !== null) tocHtml += "</div>";
      tocPart = e.part;
      tocHtml += `<p class="toc-part">${escapeHtml(e.part || "")}</p><div class="toc-chips">`;
    }
    tocHtml += `<button type="button" class="toc-chip" data-target="${anchors[i]}" title="${escapeHtml(e.title)}">${escapeHtml(theoryShortNumber(e.number))}</button>`;
  });
  tocHtml += "</div></div>";
  toc.innerHTML = tocHtml;
  toc.addEventListener("click", (ev) => {
    const b = ev.target.closest(".toc-chip");
    if (!b) return;
    document.getElementById(b.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  container.appendChild(toc);

  let currentPart = null;
  content.forEach((entry, idx) => {
    if (entry.part && entry.part !== currentPart) {
      currentPart = entry.part;
      const partHeader = document.createElement("div");
      partHeader.className = "book-part";
      partHeader.innerHTML = `<span class="book-part-rule"></span><h3 class="theory-part-header">${escapeHtml(currentPart)}</h3><span class="book-part-rule"></span>`;
      container.appendChild(partHeader);
    }

    const card = document.createElement("article");
    card.className = "card theory-entry book-entry";
    card.id = anchors[idx];
    const isRuleLike = /^(Правило|Rule|Приложение|Annex)\s/i.test(entry.number);
    let html = `<header class="book-head">
        <span class="book-num">${escapeHtml(isRuleLike ? entry.number : `№ ${entry.number}`)}</span>
        <h4 class="book-title theory-entry-title">${escapeHtml(entry.title)}</h4>
      </header>`;
    if (entry.verify) {
      html += `<span class="verify-badge"><span class="dot"></span>${escapeHtml(t("theory.verify_caption", currentLang))}</span>`;
    }
    const points = entry.commentary || entry.points || [];
    if (entry.official && entry.official.length) {
      if (entry.official_ref) html += `<p class="book-ref">${escapeHtml(entry.official_ref)}</p>`;
      html += `<div class="book-text">${renderOfficialParagraphs(entry.official)}</div>`;
    } else if (hasOfficial && points.length && topicId === "colregs") {
      html += `<p class="book-note">${escapeHtml(t(/^(Приложение|Annex)/.test(entry.number) ? "theory.no_official_annex" : "theory.no_official_en", currentLang))}</p>`;
    }
    card.innerHTML = html;

    // Сцена (интерактивная) или прежняя SVG-схема
    // entry.scene — сцена поверх прежней SVG-схемы (та остаётся в данных для старой
    // витрины), у МППСС имя сцены лежит прямо в entry.diagram.
    const SC = window.ShipHelperScenes;
    const sceneName = (entry.scene && SC && SC.has(entry.scene)) ? entry.scene
      : (entry.diagram && SC && SC.has(entry.diagram)) ? entry.diagram : null;
    if (sceneName) {
      const sceneWrap = document.createElement("div");
      sceneWrap.className = "book-scene";
      card.appendChild(sceneWrap);
      SC.mount(sceneWrap, sceneName, currentLang);
    }

    // Официальные рисунки (USCG) — как иллюстрации в учебнике
    if (entry.figures && entry.figures.length) {
      const figs = document.createElement("div");
      figs.className = "book-figures";
      const no = theoryShortNumber(entry.number);
      figs.innerHTML = entry.figures.map((f, i) => `
        <figure class="book-figure">
          <img src="${escapeHtml(f.src)}" alt="${escapeHtml(f.caption)}" loading="lazy" decoding="async">
          <figcaption><b>${escapeHtml(t("theory.figure", currentLang))} ${escapeHtml(no)}-${i + 1}.</b> ${escapeHtml(f.caption)}</figcaption>
        </figure>`).join("");
      card.appendChild(figs);
    }

    // Справочные таблицы (тема «Справочные таблицы» и др.) — как таблицы в книге
    if (entry.tables && entry.tables.length) {
      entry.tables.forEach((tb) => {
        const wrap = document.createElement("div");
        wrap.className = "book-table-wrap";
        const head = `<thead><tr>${tb.head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
        const body = tb.rows.map((r) => `<tr>${r.map((c, ci) => {
          if (ci === 0 && tb.flags) {
            return `<td class="flag-cell">${icsFlagSvg(c)}<b>${escapeHtml(c)}</b></td>`;
          }
          return `<td>${escapeHtml(c)}</td>`;
        }).join("")}</tr>`).join("");
        wrap.innerHTML = `<table class="book-table${tb.flags ? " flags" : ""}">${head}<tbody>${body}</tbody></table>`;
        card.appendChild(wrap);
      });
    }

    // Комментарий практика: при официальном тексте — отдельным блоком под ним,
    // без него — основной текст записи.
    if (points.length || (entry.example && entry.example !== "—")) {
      const wrapTag = entry.official && entry.official.length ? "details" : "div";
      const block = document.createElement(wrapTag);
      block.className = entry.official && entry.official.length ? "book-comment" : "book-plain";
      if (wrapTag === "details") block.open = true;
      let inner = wrapTag === "details" ? `<summary>${escapeHtml(t("theory.commentary", currentLang))}</summary>` : "";
      if (points.length) inner += `<ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`;
      if (entry.example && entry.example !== "—") {
        inner += `<p class="theory-example"><b>${escapeHtml(t("theory.in_practice", currentLang))}.</b> ${escapeHtml(entry.example)}</p>`;
      }
      block.innerHTML = inner;
      card.appendChild(block);
    }

    // Прежняя SVG-схема — там, где нет интерактивной сцены. В «Огнях и знаках»
    // она остаётся компактной шпаргалкой под официальным рисунком.
    if (entry.diagram && !sceneName) {
      const diagWrap = document.createElement("div");
      diagWrap.className = "theory-diagram";
      card.appendChild(diagWrap);
      lookupDiagramHtml(entry.diagram, currentLang).then((diagHtml) => {
        if (diagHtml) diagWrap.innerHTML = diagHtml;
      });
    }

    container.appendChild(card);
  });

  try {
    const sources = await callCore("core.theory", "get_topic_sources", [topicId]);
    let html = (sources || []).map((s) => `<p>• ${escapeHtml(s)}</p>`).join("");
    if (meta && meta.corrections && meta.corrections.length) {
      html += `<p class="book-corr-title">${escapeHtml(t("theory.corrections_title", currentLang))}</p>`;
      html += meta.corrections.map((c) => `<p>• ${escapeHtml(c)}</p>`).join("");
    }
    sourcesList.innerHTML = html;
    sourcesExpander.hidden = !html;
  } catch (err) {
    console.error(err);
    sourcesExpander.hidden = true;
  }
}

function setupTheory() {
  const select = document.getElementById("theory-topic-select");
  if (!select) return;

  function populateSelect() {
    const currentValue = select.value;
    select.innerHTML = "";
    THEORY_TOPICS.forEach((topic) => {
      const opt = document.createElement("option");
      opt.value = topic.id;
      opt.textContent = t(`topic.${topic.id}.title`, lang());
      select.appendChild(opt);
    });
    let wanted = currentValue;
    if (!wanted) { try { wanted = localStorage.getItem("shiphelper-theory-topic"); } catch (e) { /* нет хранилища */ } }
    if (wanted && THEORY_TOPICS.some((tp) => tp.id === wanted)) select.value = wanted;
  }

  function refresh() {
    populateSelect();
    renderTheoryTopic(select.value);
  }

  window.ShipHelperI18n.preloadI18n().then(refresh);
  document.addEventListener("shiphelper:langchange", refresh);
  select.addEventListener("change", () => {
    try { localStorage.setItem("shiphelper-theory-topic", select.value); } catch (e) { /* нет хранилища */ }
    renderTheoryTopic(select.value);
  });
}

/* ================================================================== */
/* Журнал корректуры: ИМ и NAVAREA — core.notices_log                  */
/* Данные — localStorage (как журнал тревог), расчёт пропусков — Python */
/* ================================================================== */

const NL_STORAGE_KEY = "shiphelper-notices-log";

function nlLoad() {
  try {
    const raw = localStorage.getItem(NL_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && data.years) return data;
  } catch (e) { /* приватный режим и т.п. — работаем без сохранения */ }
  return { current: String(new Date().getFullYear()), years: {} };
}
function nlSave(data) {
  try { localStorage.setItem(NL_STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* без сохранения */ }
}

// ValueError("err.notices.bad_number", {"token": "abc"}) → переведённый текст с подстановкой
function nlTranslateError(err) {
  const text = String(err && err.message ? err.message : err);
  const code = (text.match(/ValueError:\s*\(?'?(err\.notices\.[a-z_]+)/) || [])[1];
  if (!code) return translateError(err);
  const token = (text.match(/'token':\s*'([^']*)'/) || [])[1] || "";
  return t(code, lang(), { token });
}

function setupNoticesLog() {
  const yearSel = document.getElementById("nl-year");
  if (!yearSel) return;
  const areaIn = document.getElementById("nl-area");
  const startIn = { issue: document.getElementById("nl-start-issue"), notice: document.getElementById("nl-start-notice"), navarea: document.getElementById("nl-start-navarea") };
  const f = { issue: document.getElementById("nl-issue"), notices: document.getElementById("nl-notices"), navarea: document.getElementById("nl-navarea"), date: document.getElementById("nl-date"), done: document.getElementById("nl-done") };
  const addBtn = document.getElementById("nl-add-btn");
  const errEl = document.getElementById("nl-error");
  const summaryEl = document.getElementById("nl-summary");
  const listEl = document.getElementById("nl-list");
  const data = nlLoad();

  function yearData(y) {
    y = y || data.current;
    if (!data.years[y]) data.years[y] = { area: "", start: {}, entries: [] };
    return data.years[y];
  }
  yearData();

  function fillYears() {
    const years = Object.keys(data.years).sort((a, b) => b - a);
    yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    yearSel.value = data.current;
  }
  function fillYearFields() {
    const yd = yearData();
    areaIn.value = yd.area || "";
    startIn.issue.value = yd.start.issue || "";
    startIn.notice.value = yd.start.notice || "";
    startIn.navarea.value = yd.start.navarea || "";
    if (!f.date.value) f.date.value = todayIsoDate();
  }
  function showError(msg) {
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
  }

  function stat(labelKey, sm, extraClass) {
    const missing = sm.missing && sm.missing.length;
    let html = `<div class="nl-stat ${extraClass || ""}${missing ? " has-gaps" : ""}">
      <div class="nl-stat-label">${escapeHtml(t(labelKey, lang()))}</div>`;
    if (!sm.count) {
      html += `<div class="nl-stat-main nl-muted">—</div><div class="nl-stat-line nl-muted">${escapeHtml(t("calc.notices.nothing_yet", lang()))}</div></div>`;
      return html;
    }
    html += `<div class="nl-stat-main">${sm.first === sm.last ? sm.last : `${sm.first}–${sm.last}`}</div>
      <div class="nl-stat-line">${escapeHtml(t("calc.notices.count", lang(), { n: sm.count }))}</div>`;
    html += missing
      ? `<div class="nl-stat-line nl-gap"><b>${escapeHtml(t("calc.notices.missing", lang()))}:</b> ${escapeHtml(sm.missing_text)}</div>`
      : `<div class="nl-stat-line nl-ok">✓ ${escapeHtml(t("calc.notices.no_gaps", lang()))}</div>`;
    if (sm.duplicates && sm.duplicates.length) {
      html += `<div class="nl-stat-line nl-dup"><b>${escapeHtml(t("calc.notices.duplicates", lang()))}:</b> ${escapeHtml(sm.duplicates_text)}</div>`;
    }
    return html + "</div>";
  }

  let renderToken = 0;
  async function renderSummary() {
    const yd = yearData();
    const my = ++renderToken;
    if (!yd.entries.length) { summaryEl.innerHTML = ""; return; }
    try {
      const st = yd.start || {};
      const sm = await callCore("core.notices_log", "summarize_log", [
        yd.entries.map((e) => ({ issue: e.issue, notices: e.notices, navarea: e.navarea, done: !!e.done })),
        st.issue || null, st.notice || null, st.navarea || null,
      ]);
      if (my !== renderToken) return;
      const area = yd.area ? ` ${yd.area}` : "";
      let html = `<div class="nl-stats">${stat("calc.notices.issues_label", sm.issues)}${stat("calc.notices.notices_label", sm.notices)}${stat("calc.notices.navarea_label", sm.navarea).replace(escapeHtml(t("calc.notices.navarea_label", lang())), escapeHtml(t("calc.notices.navarea_label", lang()) + area))}</div>`;
      const pend = [];
      if (sm.pending_issues_text) pend.push(t("calc.notices.pending_issues", lang(), { list: sm.pending_issues_text }));
      if (sm.pending_notices_text) pend.push(t("calc.notices.pending_notices", lang(), { list: sm.pending_notices_text }));
      html += pend.length
        ? `<div class="nl-pending"><span class="nl-pending-title">${escapeHtml(t("calc.notices.pending_title", lang()))}</span> ${pend.map(escapeHtml).join(" · ")}</div>`
        : `<div class="nl-pending nl-all-done">✓ ${escapeHtml(t("calc.notices.all_done", lang()))}</div>`;
      summaryEl.innerHTML = html;
    } catch (err) {
      summaryEl.innerHTML = `<p class="field-hint warning">${escapeHtml(nlTranslateError(err))}</p>`;
    }
  }

  function chip(cls, label, value) {
    return value ? `<span class="nl-chip ${cls}"><i>${escapeHtml(label)}</i>${escapeHtml(value)}</span>` : "";
  }
  function renderList() {
    const yd = yearData();
    if (!yd.entries.length) {
      listEl.innerHTML = `<p class="nl-empty">${escapeHtml(t("calc.notices.empty", lang(), { year: data.current }))}</p>`;
      return;
    }
    const sorted = yd.entries.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id);
    listEl.innerHTML = sorted.map((e) => `
      <div class="nl-row${e.done ? " done" : ""}" data-id="${e.id}">
        <div class="nl-row-main">
          ${chip("issue", t("calc.notices.issue_short", lang()), e.issue)}
          ${chip("nm", t("calc.notices.notices_short", lang()), e.notices)}
          ${chip("nav", "NAVAREA", e.navarea)}
        </div>
        <span class="nl-date">${escapeHtml(e.date || "")}</span>
        <button type="button" class="nl-toggle" data-act="toggle">${escapeHtml(t(e.done ? "calc.notices.done" : "calc.notices.not_done", lang()))}</button>
        <button type="button" class="nl-del" data-act="del" title="${escapeHtml(t("calc.notices.delete", lang()))}">×</button>
      </div>`).join("");
  }
  function refresh() { renderList(); renderSummary(); }

  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = Number(btn.closest(".nl-row").dataset.id);
    const yd = yearData();
    const entry = yd.entries.find((e) => e.id === id);
    if (!entry) return;
    if (btn.dataset.act === "toggle") {
      entry.done = !entry.done;
    } else if (btn.dataset.act === "del") {
      // Без системного confirm(): первое нажатие — «Удалить?», второе в течение 3 с — удаление
      if (!btn.classList.contains("armed")) {
        btn.classList.add("armed");
        btn.textContent = t("calc.notices.delete_confirm", lang());
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "×"; } }, 3000);
        return;
      }
      yd.entries = yd.entries.filter((e) => e.id !== id);
    }
    nlSave(data);
    refresh();
  });

  addBtn.addEventListener("click", async () => {
    showError("");
    const vals = { issue: f.issue.value.trim(), notices: f.notices.value.trim(), navarea: f.navarea.value.trim() };
    if (!vals.issue && !vals.notices && !vals.navarea) { showError(t("calc.notices.need_number", lang())); return; }
    setBtnBusy(addBtn, true);
    try {
      // проверка формата номеров — тем же разбором, что и в сводке
      for (const k of ["issue", "notices", "navarea"]) {
        if (vals[k]) await callCore("core.notices_log", "parse_numbers", [vals[k]]);
      }
      const yd = yearData();
      yd.entries.push({ id: Date.now(), ...vals, date: f.date.value || todayIsoDate(), done: f.done.checked });
      nlSave(data);
      // следующий выпуск обычно идёт по порядку — подставим его номер
      const n = parseInt(vals.issue, 10);
      f.issue.value = Number.isFinite(n) && /^\d+$/.test(vals.issue) ? String(n + 1) : "";
      f.notices.value = ""; f.navarea.value = ""; f.done.checked = false;
      refresh();
    } catch (err) {
      showError(nlTranslateError(err));
    } finally {
      setBtnBusy(addBtn, false);
    }
  });

  [f.issue, f.notices, f.navarea].forEach((el) => el.addEventListener("input", () => showError("")));
  yearSel.addEventListener("change", () => { data.current = yearSel.value; yearData(); nlSave(data); fillYearFields(); refresh(); });
  document.getElementById("nl-new-year").addEventListener("click", () => {
    const years = Object.keys(data.years).map(Number);
    const next = String(Math.max(new Date().getFullYear(), ...(years.length ? years : [0])) + (data.years[String(new Date().getFullYear())] ? 1 : 0));
    data.current = next; yearData(next); nlSave(data); fillYears(); fillYearFields(); refresh();
  });
  areaIn.addEventListener("input", () => { yearData().area = areaIn.value.trim(); nlSave(data); renderSummary(); });
  Object.entries(startIn).forEach(([k, el]) => el.addEventListener("input", () => {
    const v = parseInt(el.value, 10);
    yearData().start[k] = Number.isFinite(v) && v > 0 ? v : null;
    nlSave(data); renderSummary();
  }));

  document.getElementById("nl-export").addEventListener("click", () => {
    const yd = yearData();
    const L = (k) => t(k, lang());
    const head = [L("calc.notices.year"), L("calc.notices.area"), L("calc.notices.issue"), L("calc.notices.notices"), L("calc.notices.navarea"), L("calc.notices.date"), L("calc.notices.done")];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = yd.entries.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((e) =>
      [data.current, yd.area, e.issue, e.notices, e.navarea, e.date, e.done ? "✓" : ""].map(q).join(";"));
    const csv = "﻿" + [head.map(q).join(";")].concat(rows).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    window.ShipHelperDocx.download(blob, `notices_${data.current}.csv`);
  });

  window.ShipHelperI18n.preloadI18n().then(() => { fillYears(); fillYearFields(); renderList(); });
  // Сводка считается в Python — после загрузки Pyodide (первый вызов callCore дождётся его)
  renderSummary();
  document.addEventListener("shiphelper:langchange", refresh);
}

/* ================================================================== */
/* Истинный ветер — core.true_wind                                     */
/* ================================================================== */

function setupTrueWind() {
  const btn = document.getElementById("tw-calc-btn");
  if (!btn) return;
  wireStepsToggle("tw-steps-toggle", "tw-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const aws = parseNum("tw-aws");
      const awa = parseNum("tw-awa");
      const speed = parseNum("tw-speed");
      const headingRaw = document.getElementById("tw-heading").value;
      const heading = headingRaw === "" ? null : parseFloat(headingRaw);
      const result = await callCore("core.true_wind", "true_wind", [aws, awa, speed, heading]);
      document.getElementById("tw-value-speed").textContent = `${result.true_wind_speed.toFixed(2)} ${t("calc.std.unit_knots", lang())}`;
      const angleLabel = document.getElementById("tw-label-angle");
      if (result.true_wind_direction !== null && result.true_wind_direction !== undefined) {
        angleLabel.textContent = t("calc.true_wind.true_direction_metric", lang());
        document.getElementById("tw-value-angle").textContent = `${fmtCourse(result.true_wind_direction)}°`;
      } else {
        angleLabel.textContent = t("calc.true_wind.twa_metric", lang());
        document.getElementById("tw-value-angle").textContent = `${result.true_wind_angle.toFixed(1)}°`;
      }
      renderSteps(document.getElementById("tw-steps-list"), result.steps);
      document.getElementById("tw-result-box-speed").classList.add("visible");
      document.getElementById("tw-result-box-angle").classList.add("visible");
    } catch (err) {
      document.getElementById("tw-value-speed").textContent = translateError(err);
      document.getElementById("tw-value-angle").textContent = "—";
      document.getElementById("tw-result-box-speed").classList.add("visible");
      document.getElementById("tw-result-box-angle").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* ETA по маршруту (Multi-WP) — core.speed_time_distance               */
/* ================================================================== */

const META_DT_FMT = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
const META_LEG_COLUMNS = [
  { field: "name", type: "text" },
  { field: "distance", type: "number", step: "0.1" },
  { field: "speed", type: "number", step: "0.1" },
];

function metaDefaultLegs() {
  return [
    { name: t("calc.multi_eta.wp_default", lang(), { n: 1 }), distance: 60, speed: 12 },
    { name: t("calc.multi_eta.wp_default", lang(), { n: 2 }), distance: 24, speed: 8 },
  ];
}

function setupMultiEta() {
  const btn = document.getElementById("meta-calc-btn");
  const legsContainer = document.getElementById("meta-legs");
  if (!btn || !legsContainer) return;

  function rebuild() {
    createDynTable(legsContainer, META_LEG_COLUMNS, metaDefaultLegs());
  }
  window.ShipHelperI18n.preloadI18n().then(rebuild);
  document.addEventListener("shiphelper:langchange", rebuild);

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const dateStr = document.getElementById("meta-departure-date").value;
      const timeStr = document.getElementById("meta-departure-time").value || "00:00";
      const departure = new Date(`${dateStr}T${timeStr}:00`);
      const rows = readDynTable(legsContainer, META_LEG_COLUMNS);
      const legs = rows
        .filter((r) => r.name !== "")
        .map((r) => [r.name, r.distance, r.speed]);
      const result = await callCore("core.speed_time_distance", "multi_waypoint_eta", [departure, legs]);
      const finalEta = result.final_eta instanceof Date ? result.final_eta : new Date(result.final_eta);
      document.getElementById("meta-result-value").textContent = Number.isNaN(finalEta.getTime())
        ? String(result.final_eta)
        : finalEta.toLocaleString(lang() === "ru" ? "ru-RU" : "en-GB", META_DT_FMT);

      const table = document.getElementById("meta-legs-table");
      table.innerHTML = "";
      result.legs.forEach((leg) => {
        const legEta = leg.eta instanceof Date ? leg.eta : new Date(leg.eta);
        const row = document.createElement("p");
        row.className = "field-hint";
        const etaText = Number.isNaN(legEta.getTime())
          ? String(leg.eta)
          : legEta.toLocaleString(lang() === "ru" ? "ru-RU" : "en-GB", META_DT_FMT);
        row.textContent = `${leg.name}: ${leg.distance_nm.toFixed(1)} ${t("calc.std.unit_miles", lang())}, ${leg.speed_knots.toFixed(1)} ${t("calc.std.unit_knots", lang())} → ${etaText}`;
        table.appendChild(row);
      });
      document.getElementById("meta-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("meta-result-value").textContent = translateError(err);
      document.getElementById("meta-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Ноон-репорт — core.noon_report                                      */
/* ================================================================== */

function setupNoonReport() {
  const btn = document.getElementById("noon-calc-btn");
  if (!btn) return;
  wireStepsToggle("noon-steps-toggle", "noon-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const distanceRun = parseNum("noon-distance-run");
      const elapsedHours = parseNum("noon-elapsed-hours");
      const fuelConsumed = parseNum("noon-fuel-consumed");
      const robBefore = parseNum("noon-rob-before");
      const distanceToGoRaw = document.getElementById("noon-distance-to-go").value;
      const distanceToGo = distanceToGoRaw === "" ? null : parseFloat(distanceToGoRaw);

      const result = await callCore("core.noon_report", "noon_report", [
        distanceRun, elapsedHours, fuelConsumed, robBefore, distanceToGo,
      ]);
      document.getElementById("noon-value-speed").textContent = `${result.average_speed_kn.toFixed(2)} ${t("calc.std.unit_knots", lang())}`;
      document.getElementById("noon-value-consumption").textContent = `${result.daily_consumption_mt.toFixed(2)} ${t("calc.noon_report.unit_mt_per_day", lang())}`;
      document.getElementById("noon-value-rob").textContent = `${result.rob_after_mt.toFixed(2)} ${t("calc.noon_report.unit_mt", lang())}`;
      document.getElementById("noon-result-box-speed").classList.add("visible");
      document.getElementById("noon-result-box-consumption").classList.add("visible");
      document.getElementById("noon-result-box-rob").classList.add("visible");

      const enduranceBox = document.getElementById("noon-result-box-endurance");
      if (result.endurance_days !== null && result.endurance_days !== undefined) {
        document.getElementById("noon-value-endurance").textContent = `${result.endurance_days.toFixed(1)} ${t("calc.noon_report.unit_days", lang())}`;
        enduranceBox.hidden = false;
        enduranceBox.classList.add("visible");
      } else {
        enduranceBox.hidden = true;
      }
      renderSteps(document.getElementById("noon-steps-list"), result.steps);
    } catch (err) {
      document.getElementById("noon-value-speed").textContent = translateError(err);
      document.getElementById("noon-value-consumption").textContent = "—";
      document.getElementById("noon-value-rob").textContent = "—";
      document.getElementById("noon-result-box-speed").classList.add("visible");
      document.getElementById("noon-result-box-consumption").classList.add("visible");
      document.getElementById("noon-result-box-rob").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Поправки секстана — core.sextant                                    */
/* ================================================================== */

function setupSextant() {
  const btn = document.getElementById("sx-calc-btn");
  if (!btn) return;
  wireStepsToggle("sx-steps-toggle", "sx-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const hs = parseNum("sx-hs");
      const ic = parseNum("sx-ic");
      const height = parseNum("sx-height");
      const dip = await callCore("core.sextant", "dip_correction", [height]);
      const result = await callCore("core.sextant", "apparent_altitude", [hs, ic, height]);
      document.getElementById("sx-value-dip").textContent = `${dip.value.toFixed(2)}′`;
      document.getElementById("sx-value-ha").textContent = `${result.value.toFixed(3)}°`;
      renderSteps(document.getElementById("sx-steps-list"), result.steps);
      document.getElementById("sx-result-box-dip").classList.add("visible");
      document.getElementById("sx-result-box-ha").classList.add("visible");
    } catch (err) {
      document.getElementById("sx-value-dip").textContent = translateError(err);
      document.getElementById("sx-value-ha").textContent = "—";
      document.getElementById("sx-result-box-dip").classList.add("visible");
      document.getElementById("sx-result-box-ha").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Поправка компаса по Солнцу — core.celestial                         */
/* ================================================================== */

function setupSunCompass() {
  const btn = document.getElementById("sun-calc-btn");
  const sw = document.getElementById("sun-mode-switch");
  if (!btn || !sw) return;
  wireStepsToggle("sun-steps-toggle", "sun-steps-list");
  let mode = "azimuth";
  const pad = (n) => String(n).padStart(2, "0");
  function setNowUtc() {
    const n = new Date();
    document.getElementById("sun-date").value = `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
    document.getElementById("sun-time").value = `${pad(n.getUTCHours())}:${pad(n.getUTCMinutes())}:${pad(n.getUTCSeconds())}`;
  }
  // app.js уже заполнил поля даты/времени МЕСТНЫМ временем — здесь нужно UTC
  setNowUtc();
  document.getElementById("sun-now-btn").addEventListener("click", setNowUtc);

  const page = btn.closest(".calc-page");
  function applyMode() {
    sw.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    page.querySelectorAll("[data-sun-only]").forEach((el) => { el.hidden = el.dataset.sunOnly !== mode; });
  }
  sw.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    mode = b.dataset.mode;
    applyMode();
  });
  applyMode();

  function coord(degId, minId, hemId, neg) {
    const d = parseNum(degId), m = parseNum(minId) || 0;
    if (!isFinite(d) || d < 0 || m < 0 || m >= 60) return NaN;
    const v = d + m / 60;
    return document.getElementById(hemId).value === neg ? -v : v;
  }
  const fmtDec = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
  const fmtSigned = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}° ${v >= 0 ? "E" : "W"}`;

  btn.addEventListener("click", async () => {
    const lang = document.documentElement.lang || "ru";
    const T = (k, p) => window.ShipHelperI18n.t(k, lang, p);
    const boxes = ["sun-result-box-zn", "sun-result-box-err"].map((id) => document.getElementById(id));
    const warnEl = document.getElementById("sun-warnings");
    const extraEl = document.getElementById("sun-value-extra");
    const devEl = document.getElementById("sun-value-dev");
    setBtnBusy(btn, true);
    try {
      const date = document.getElementById("sun-date").value;
      let time = document.getElementById("sun-time").value || "00:00";
      if (time.length === 5) time += ":00";
      if (!date) throw new Error("ValueError: err.celestial.bad_datetime");
      const iso = `${date}T${time}`;
      const lat = coord("sun-lat-deg", "sun-lat-min", "sun-lat-hem", "S");
      if (!isFinite(lat)) throw new Error("ValueError: err.celestial.bad_latitude");
      const cbRaw = document.getElementById("sun-cb").value.trim();
      const varRaw = document.getElementById("sun-var").value.trim();
      const cb = cbRaw === "" ? null : parseFloat(cbRaw);
      const variation = varRaw === "" ? null : parseFloat(varRaw);
      let r;
      if (mode === "azimuth") {
        const lon = coord("sun-lon-deg", "sun-lon-min", "sun-lon-hem", "W");
        if (!isFinite(lon)) throw new Error("ValueError: err.celestial.bad_longitude");
        r = await callCore("core.celestial", "sun_azimuth", [iso, lat, lon, cb, variation]);
        extraEl.textContent = T("calc.sun.alt_dec", { h: r.altitude.toFixed(1), d: fmtDec(r.declination) });
        document.getElementById("sun-value-zn").textContent = `${fmtCourse(r.true_azimuth)}°`;
      } else {
        const ev = document.getElementById("sun-event").value;
        r = await callCore("core.celestial", "sun_amplitude", [iso, lat, ev, cb, variation]);
        const a = r.amplitude;
        extraEl.textContent = T("calc.sun.amp_dec", {
          a: `${ev === "rise" ? "E" : "W"} ${Math.abs(a).toFixed(1)}° ${a >= 0 ? "N" : "S"}`,
          d: fmtDec(r.declination),
        });
        document.getElementById("sun-value-zn").textContent = `${fmtCourse(r.true_bearing)}°`;
      }
      document.getElementById("sun-value-err").textContent = r.compass_error == null ? "—" : fmtSigned(r.compass_error);
      devEl.textContent = r.compass_error == null ? T("calc.sun.no_compass_bearing")
        : r.deviation == null ? T("calc.sun.no_variation") : T("calc.sun.deviation_line", { v: fmtSigned(r.deviation) });
      const warns = (r.warnings || []).map((k) => T(k));
      warnEl.textContent = warns.join(" ");
      warnEl.hidden = warns.length === 0;
      renderSteps(document.getElementById("sun-steps-list"), r.steps);
    } catch (err) {
      document.getElementById("sun-value-zn").textContent = "—";
      document.getElementById("sun-value-err").textContent = "—";
      document.getElementById("sun-steps-list").innerHTML = "";
      extraEl.textContent = translateError(err);
      devEl.textContent = "";
      warnEl.hidden = true;
    } finally {
      boxes.forEach((b) => b.classList.add("visible"));
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Период качки → GM — core.roll_period                                */
/* ================================================================== */

function setupRollGm() {
  const btn = document.getElementById("rg-calc-btn");
  if (!btn) return;
  wireStepsToggle("rg-steps-toggle", "rg-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const period = parseNum("rg-period");
      const beam = parseNum("rg-beam");
      const optNum = (id) => { const v = document.getElementById(id).value.trim(); return v === "" ? null : parseFloat(v); };
      const lengthWl = optNum("rg-length");
      const meanDraft = optNum("rg-draft");
      const result = await callCore("core.roll_period", "gm_from_roll_period", [period, beam, lengthWl, meanDraft]);
      document.getElementById("rg-result-value").textContent = `≈ ${result.gm.toFixed(3)} ${u("м")}`;
      renderSteps(document.getElementById("rg-steps-list"), result.steps);
      document.getElementById("rg-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("rg-result-value").textContent = translateError(err);
      document.getElementById("rg-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Слепая зона по носу — core.blind_distance                           */
/* ================================================================== */

function setupBlindDistance() {
  const btn = document.getElementById("bd-calc-btn");
  if (!btn) return;
  wireStepsToggle("bd-steps-toggle", "bd-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const eyeHeight = parseNum("bd-eye-height");
      const obstructionHeight = parseNum("bd-obstruction-height");
      const distance = parseNum("bd-distance");
      const result = await callCore("core.blind_distance", "blind_distance", [eyeHeight, obstructionHeight, distance]);
      document.getElementById("bd-result-value").textContent = `${result.blind_distance.toFixed(1)} ${u("м")}`;
      renderSteps(document.getElementById("bd-steps-list"), result.steps);
      document.getElementById("bd-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("bd-result-value").textContent = translateError(err);
      document.getElementById("bd-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Осадка на перпендикуляре (Opposite Draft) — core.draft_survey        */
/* ================================================================== */

function setupOppositeDraft() {
  const btn = document.getElementById("od-calc-btn");
  if (!btn) return;
  wireStepsToggle("od-steps-toggle", "od-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const method = document.getElementById("od-method").value;
      const lbp = parseNum("od-lbp");
      const distFwd = parseNum("od-dist-fwd");
      const distMid = parseNum("od-dist-mid");
      const distAft = parseNum("od-dist-aft");
      const meanFwd = parseNum("od-mean-fwd");
      const meanMid = parseNum("od-mean-mid");
      const meanAft = parseNum("od-mean-aft");

      const corr = await callCore("core.draft_survey", "perpendicular_corrections", [
        method, distFwd, distMid, distAft, meanFwd, meanMid, meanAft, lbp,
      ]);
      const draftFwd = await callCore("core.draft_survey", "corrected_draft", [meanFwd, corr.corr_fwd]);
      const draftMid = await callCore("core.draft_survey", "corrected_draft", [meanMid, corr.corr_mid]);
      const draftAft = await callCore("core.draft_survey", "corrected_draft", [meanAft, corr.corr_aft]);

      document.getElementById("od-value-fwd").textContent = `${draftFwd.toFixed(3)} ${u("м")}`;
      document.getElementById("od-value-mid").textContent = `${draftMid.toFixed(3)} ${u("м")}`;
      document.getElementById("od-value-aft").textContent = `${draftAft.toFixed(3)} ${u("м")}`;
      renderSteps(document.getElementById("od-steps-list"), corr.steps);
      document.getElementById("od-result-box-fwd").classList.add("visible");
      document.getElementById("od-result-box-mid").classList.add("visible");
      document.getElementById("od-result-box-aft").classList.add("visible");
    } catch (err) {
      document.getElementById("od-value-fwd").textContent = translateError(err);
      document.getElementById("od-value-mid").textContent = "—";
      document.getElementById("od-value-aft").textContent = "—";
      document.getElementById("od-result-box-fwd").classList.add("visible");
      document.getElementById("od-result-box-mid").classList.add("visible");
      document.getElementById("od-result-box-aft").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Поправка на дифферент/плотность — core.draft_survey                 */
/* ================================================================== */

function setupTrimDensity() {
  const btn = document.getElementById("td-calc-btn");
  if (!btn) return;
  wireStepsToggle("td-steps-toggle", "td-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const displacement = parseNum("td-displacement");
      const trim = parseNum("td-trim");
      const lcf = parseNum("td-lcf");
      const tpc = parseNum("td-tpc");
      const lbp = parseNum("td-lbp");
      const density = parseNum("td-density");

      const trimCorr = await callCore("core.draft_survey", "first_trim_correction", [trim, lcf, tpc, lbp]);
      const displacementTrimCorrected = displacement + trimCorr.value;
      const densityCorr = await callCore("core.draft_survey", "density_correction", [displacementTrimCorrected, density]);

      document.getElementById("td-result-value").textContent = `${densityCorr.value.toFixed(3)} ${u("т")}`;
      const steps = [...trimCorr.steps, ...densityCorr.steps];
      renderSteps(document.getElementById("td-steps-list"), steps);
      document.getElementById("td-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("td-result-value").textContent = translateError(err);
      document.getElementById("td-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Бункер — замер танка — core.bunker                                  */
/* ================================================================== */

const BUNKER_TABLE_COLUMNS = [
  { field: "sounding", type: "number", step: "0.1" },
  { field: "volume", type: "number", step: "0.01" },
];

function bunkerDefaultTable() {
  return [
    { sounding: 0, volume: 0 },
    { sounding: 50, volume: 10 },
    { sounding: 100, volume: 25 },
    { sounding: 150, volume: 42 },
  ];
}

const ULLAGE_TABLE_COLUMNS = [
  { field: "innage", type: "number", step: "0.1" },
  { field: "volume", type: "number", step: "0.01" },
];

function ullageDefaultTable() {
  return [
    { innage: 0, volume: 0 },
    { innage: 50, volume: 120 },
    { innage: 100, volume: 260 },
    { innage: 150, volume: 410 },
    { innage: 200, volume: 560 },
  ];
}

function setupUllage() {
  const btn = document.getElementById("ullage-calc-btn");
  const tableContainer = document.getElementById("ullage-table");
  if (!btn || !tableContainer) return;

  function rebuild() {
    createDynTable(tableContainer, ULLAGE_TABLE_COLUMNS, ullageDefaultTable());
  }
  window.ShipHelperI18n.preloadI18n().then(rebuild);
  // "+ Добавить строку" у createDynTable подписывается текстом один раз
  // при постройке — без переподписки при смене языка кнопка оставалась
  // бы на исходном языке (тот же паттерн фикса, что уже есть у
  // setupMultiEta/setupDraftSurvey для своих динамических таблиц).
  document.addEventListener("shiphelper:langchange", rebuild);
  wireStepsToggle("ullage-steps-toggle", "ullage-steps-list");

  const modeSelect = document.getElementById("ullage-mode");
  const depthField = document.getElementById("ullage-tank-depth-field");
  function syncDepthVisibility() {
    depthField.hidden = modeSelect.value !== "ullage";
  }
  modeSelect.addEventListener("change", syncDepthVisibility);
  syncDepthVisibility();

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const level = parseNum("ullage-level");
      const temperature = parseNum("ullage-temperature");
      const density = parseNum("ullage-density");
      const isUllage = modeSelect.value === "ullage";
      const tankDepth = isUllage ? parseNum("ullage-tank-depth") : null;
      const rows = dropBlankRows(readDynTable(tableContainer, ULLAGE_TABLE_COLUMNS));
      const table = rows.map((r) => [r.innage, r.volume]);
      const result = await callCore("core.cargo_ullage", "cargo_quantity", [
        level, table, temperature, density, isUllage, tankDepth,
      ]);
      document.getElementById("ullage-value-vcf").textContent = result.vcf.toFixed(5);
      document.getElementById("ullage-value-gsv").textContent = `${result.gsv_m3.toFixed(2)} ${u("м³")}`;
      document.getElementById("ullage-value-mass").textContent = `${result.mass_tonnes.toFixed(3)} ${u("т")}`;
      document.getElementById("ullage-value-air").textContent = t("calc.ullage.weight_air_line", lang(), { v: `${result.weight_air_tonnes.toFixed(3)} ${u("т")}` });
      renderSteps(document.getElementById("ullage-steps-list"), result.steps);
      document.getElementById("ullage-result-box-vcf").classList.add("visible");
      document.getElementById("ullage-result-box-gsv").classList.add("visible");
      document.getElementById("ullage-result-box-mass").classList.add("visible");
    } catch (err) {
      document.getElementById("ullage-value-vcf").textContent = translateError(err);
      document.getElementById("ullage-value-gsv").textContent = "—";
      document.getElementById("ullage-value-mass").textContent = "—";
      document.getElementById("ullage-value-air").textContent = "";
      document.getElementById("ullage-result-box-vcf").classList.add("visible");
      document.getElementById("ullage-result-box-gsv").classList.add("visible");
      document.getElementById("ullage-result-box-mass").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Остаток балласта с поправками на крен/дифферент —                  */
/* core.ballast_sounding (группа "Грузовые операции")                 */
/* ================================================================== */

const BS_TANK_COLUMNS = [
  { field: "name", type: "text" },
  { field: "volume_observed_m3", type: "number", step: "0.01" },
  { field: "trim_correction_rate_m3_per_m", type: "number", step: "0.01" },
  { field: "list_correction_rate_m3_per_deg", type: "number", step: "0.01" },
  { field: "density_t_m3", type: "number", step: "0.001" },
];

function bsDefaultTanks() {
  return [
    {
      name: t("calc.ballast_sounding.tank_1", lang()),
      volume_observed_m3: 85.4, trim_correction_rate_m3_per_m: -2.1,
      list_correction_rate_m3_per_deg: 0.6, density_t_m3: 1.025,
    },
    {
      name: t("calc.ballast_sounding.tank_2", lang()),
      volume_observed_m3: 62, trim_correction_rate_m3_per_m: -1.4,
      list_correction_rate_m3_per_deg: -0.5, density_t_m3: 1.025,
    },
    {
      name: t("calc.ballast_sounding.tank_3", lang()),
      volume_observed_m3: 40.2, trim_correction_rate_m3_per_m: 0.8,
      list_correction_rate_m3_per_deg: 0, density_t_m3: 1.025,
    },
  ];
}

function setupBallastSounding() {
  const btn = document.getElementById("bs-calc-btn");
  const tableContainer = document.getElementById("bs-table");
  if (!btn || !tableContainer) return;

  function rebuild() {
    createDynTable(tableContainer, BS_TANK_COLUMNS, bsDefaultTanks());
  }
  window.ShipHelperI18n.preloadI18n().then(rebuild);
  // Тот же паттерн, что у setupMultiEta/setupDraftSurvey: без переподписки
  // по shiphelper:langchange и названия танков по умолчанию, и подпись
  // кнопки "+ Добавить строку" остаются на языке первой постройки таблицы.
  document.addEventListener("shiphelper:langchange", rebuild);
  wireStepsToggle("bs-steps-toggle", "bs-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const trim = parseNum("bs-trim");
      const list = parseNum("bs-list");
      const tanks = readDynTable(tableContainer, BS_TANK_COLUMNS);
      const result = await callCore("core.ballast_sounding", "total_ballast_with_corrections", [
        tanks, trim, list,
      ]);
      document.getElementById("bs-value-mass").textContent = `${result.total_mass_tonnes.toFixed(3)} ${u("т")}`;
      document.getElementById("bs-value-volume").textContent = `${result.total_volume_m3.toFixed(2)} ${u("м³")}`;
      renderSteps(document.getElementById("bs-steps-list"), result.steps);
      document.getElementById("bs-result-box-mass").classList.add("visible");
      document.getElementById("bs-result-box-volume").classList.add("visible");
    } catch (err) {
      document.getElementById("bs-value-mass").textContent = translateError(err);
      document.getElementById("bs-value-volume").textContent = "—";
      document.getElementById("bs-result-box-mass").classList.add("visible");
      document.getElementById("bs-result-box-volume").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Тоннаж по осадке (грузовая шкала) — core.deadweight_scale            */
/* ================================================================== */

const DWS_TABLE_COLUMNS = [
  { field: "draft", type: "number", step: "0.1" },
  { field: "displacement", type: "number", step: "1" },
  { field: "tpc", type: "number", step: "0.01" },
  { field: "mtc", type: "number", step: "0.1" },
];

function dwsDefaultTable() {
  return [
    { draft: 5.0, displacement: 3000, tpc: 20.0, mtc: 150.0 },
    { draft: 6.0, displacement: 3400, tpc: 21.0, mtc: 155.0 },
    { draft: 7.0, displacement: 3820, tpc: 22.0, mtc: 160.0 },
  ];
}

function setupDeadweightScale() {
  const btn = document.getElementById("dws-calc-btn");
  const tableContainer = document.getElementById("dws-table");
  if (!btn || !tableContainer) return;

  function rebuild() {
    createDynTable(tableContainer, DWS_TABLE_COLUMNS, dwsDefaultTable());
  }
  window.ShipHelperI18n.preloadI18n().then(rebuild);
  // Кнопка "+ Добавить строку" переподписывается через общий data-i18n
  // в createDynTable() — отдельный shiphelper:langchange здесь не нужен
  // (см. комментарий в createDynTable про ненавязчивый фикс перевода).
  wireStepsToggle("dws-steps-toggle", "dws-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const draft = parseNum("dws-draft");
      const rows = dropBlankRows(readDynTable(tableContainer, DWS_TABLE_COLUMNS));
      const table = rows.map((r) => [r.draft, r.displacement, r.tpc, r.mtc]);
      const result = await callCore("core.deadweight_scale", "deadweight_from_draft", [table, draft]);
      document.getElementById("dws-value-displacement").textContent = `${result.displacement_t.toFixed(2)} ${u("т")}`;
      document.getElementById("dws-value-tpc").textContent = `${result.tpc.toFixed(3)} ${u("т/см")}`;
      document.getElementById("dws-value-mtc").textContent = `${result.mtc.toFixed(3)} ${u("т·м/см")}`;
      renderSteps(document.getElementById("dws-steps-list"), result.steps);
      document.getElementById("dws-result-box-displacement").classList.add("visible");
      document.getElementById("dws-result-box-tpc").classList.add("visible");
      document.getElementById("dws-result-box-mtc").classList.add("visible");
    } catch (err) {
      document.getElementById("dws-value-displacement").textContent = translateError(err);
      document.getElementById("dws-value-tpc").textContent = "—";
      document.getElementById("dws-value-mtc").textContent = "—";
      document.getElementById("dws-result-box-displacement").classList.add("visible");
      document.getElementById("dws-result-box-tpc").classList.add("visible");
      document.getElementById("dws-result-box-mtc").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* FWA / DWA — core.fwa                                                 */
/* ================================================================== */

function setupFwa() {
  const btn = document.getElementById("fwa-calc-btn");
  if (!btn) return;
  wireStepsToggle("fwa-steps-toggle", "fwa-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const displacement = parseNum("fwa-displacement");
      const tpc = parseNum("fwa-tpc");
      const density = parseNum("fwa-density");
      const result = await callCore("core.fwa", "fwa_dwa", [displacement, tpc, density]);
      document.getElementById("fwa-value-fwa").textContent = `${result.fwa_mm.toFixed(1)} ${u("мм")}`;
      document.getElementById("fwa-value-dwa").textContent = `${result.dwa_mm.toFixed(1)} ${u("мм")}`;
      renderSteps(document.getElementById("fwa-steps-list"), result.steps);
      document.getElementById("fwa-result-box-fwa").classList.add("visible");
      document.getElementById("fwa-result-box-dwa").classList.add("visible");
    } catch (err) {
      document.getElementById("fwa-value-fwa").textContent = translateError(err);
      document.getElementById("fwa-value-dwa").textContent = "—";
      document.getElementById("fwa-result-box-fwa").classList.add("visible");
      document.getElementById("fwa-result-box-dwa").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Груз на крановой стреле — core.suspended_load                        */
/* ================================================================== */

function setupSuspendedLoad() {
  const btn = document.getElementById("sl-calc-btn");
  if (!btn) return;
  wireStepsToggle("sl-steps-toggle", "sl-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const displacement = parseNum("sl-displacement");
      const gm = parseNum("sl-gm");
      const weight = parseNum("sl-weight");
      const height = parseNum("sl-height");
      const result = await callCore("core.suspended_load", "suspended_load_gm_loss", [displacement, gm, weight, height]);
      document.getElementById("sl-value-gg1").textContent = `${result.gg1_m.toFixed(3)} ${u("м")}`;
      const gmAfterEl = document.getElementById("sl-value-gm-after");
      gmAfterEl.textContent = `${result.gm_after_m.toFixed(3)} ${u("м")}`;
      const warningEl = document.getElementById("sl-warning");
      if (warningEl) warningEl.hidden = !result.is_negative;
      renderSteps(document.getElementById("sl-steps-list"), result.steps);
      document.getElementById("sl-result-box-gg1").classList.add("visible");
      document.getElementById("sl-result-box-gm-after").classList.add("visible");
    } catch (err) {
      document.getElementById("sl-value-gg1").textContent = translateError(err);
      document.getElementById("sl-value-gm-after").textContent = "—";
      document.getElementById("sl-result-box-gg1").classList.add("visible");
      document.getElementById("sl-result-box-gm-after").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

function setupBunker() {
  const btn = document.getElementById("bunker-calc-btn");
  const tableContainer = document.getElementById("bunker-table");
  if (!btn || !tableContainer) return;

  function rebuild() {
    createDynTable(tableContainer, BUNKER_TABLE_COLUMNS, bunkerDefaultTable());
  }
  window.ShipHelperI18n.preloadI18n().then(rebuild);
  wireStepsToggle("bunker-steps-toggle", "bunker-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const sounding = parseNum("bunker-sounding");
      const density = parseNum("bunker-density");
      const rows = dropBlankRows(readDynTable(tableContainer, BUNKER_TABLE_COLUMNS));
      const table = rows.map((r) => [r.sounding, r.volume]);
      const result = await callCore("core.bunker", "bunker_tank_weight", [sounding, table, density]);
      document.getElementById("bunker-value-volume").textContent = `${result.volume_m3.toFixed(3)} ${u("м³")}`;
      document.getElementById("bunker-value-weight").textContent = `${result.weight_mt.toFixed(3)} ${u("т")}`;
      renderSteps(document.getElementById("bunker-steps-list"), result.steps);
      document.getElementById("bunker-result-box-volume").classList.add("visible");
      document.getElementById("bunker-result-box-weight").classList.add("visible");
    } catch (err) {
      document.getElementById("bunker-value-volume").textContent = translateError(err);
      document.getElementById("bunker-value-weight").textContent = "—";
      document.getElementById("bunker-result-box-volume").classList.add("visible");
      document.getElementById("bunker-result-box-weight").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */
/* Точка росы / вентиляция трюма — core.dew_point                      */
/* ================================================================== */

function setupDewPoint() {
  const dpBtn = document.getElementById("dp-calc-btn");
  if (!dpBtn) return;
  wireStepsToggle("dp-steps-toggle", "dp-steps-list");
  dpBtn.addEventListener("click", async () => {
    setBtnBusy(dpBtn, true);
    try {
      const temperature = parseNum("dp-temperature");
      const humidity = parseNum("dp-humidity");
      const result = await callCore("core.dew_point", "dew_point", [temperature, humidity]);
      document.getElementById("dp-result-value").textContent = `${result.dew_point_c.toFixed(1)} °C`;
      renderSteps(document.getElementById("dp-steps-list"), result.steps);
      document.getElementById("dp-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("dp-result-value").textContent = translateError(err);
      document.getElementById("dp-result-box").classList.add("visible");
    } finally {
      setBtnBusy(dpBtn, false);
    }
  });

  const dprBtn = document.getElementById("dpr-calc-btn");
  wireStepsToggle("dpr-steps-toggle", "dpr-steps-list");
  dprBtn.addEventListener("click", async () => {
    setBtnBusy(dprBtn, true);
    try {
      const outside = parseNum("dpr-outside");
      const hold = parseNum("dpr-hold");
      const result = await callCore("core.dew_point", "dew_point_rule", [outside, hold]);
      const valueEl = document.getElementById("dpr-result-value");
      if (result.should_ventilate === true) {
        valueEl.textContent = t("calc.dew_point.result_ventilate", lang());
      } else if (result.should_ventilate === false) {
        valueEl.textContent = t("calc.dew_point.result_no_ventilate", lang());
      } else {
        valueEl.textContent = t("calc.dew_point.result_borderline", lang());
      }
      renderSteps(document.getElementById("dpr-steps-list"), result.steps);
      document.getElementById("dpr-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("dpr-result-value").textContent = translateError(err);
      document.getElementById("dpr-result-box").classList.add("visible");
    } finally {
      setBtnBusy(dprBtn, false);
    }
  });

  const tdrBtn = document.getElementById("tdr-calc-btn");
  wireStepsToggle("tdr-steps-toggle", "tdr-steps-list");
  tdrBtn.addEventListener("click", async () => {
    setBtnBusy(tdrBtn, true);
    try {
      const outsideTemp = parseNum("tdr-outside-temp");
      const cargoTemp = parseNum("tdr-cargo-temp");
      const result = await callCore("core.dew_point", "three_degree_rule", [outsideTemp, cargoTemp]);
      const valueEl = document.getElementById("tdr-result-value");
      valueEl.textContent = result.should_ventilate
        ? t("calc.dew_point.result_ventilate", lang())
        : t("calc.dew_point.result_no_ventilate", lang());
      renderSteps(document.getElementById("tdr-steps-list"), result.steps);
      document.getElementById("tdr-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("tdr-result-value").textContent = translateError(err);
      document.getElementById("tdr-result-box").classList.add("visible");
    } finally {
      setBtnBusy(tdrBtn, false);
    }
  });
}

/* ================================================================== */
/* Сличение компасов — core.compass_comparison                         */
/* ================================================================== */

function setupCompassComparison() {
  const btn = document.getElementById("cmp-calc-btn");
  if (!btn) return;
  wireStepsToggle("cmp-steps-toggle", "cmp-steps-list");

  btn.addEventListener("click", async () => {
    setBtnBusy(btn, true);
    try {
      const headingA = parseNum("cmp-heading-a");
      const headingB = parseNum("cmp-heading-b");
      const result = await callCore("core.compass_comparison", "compass_comparison", [headingA, headingB]);
      document.getElementById("cmp-result-value").textContent = `${result.difference >= 0 ? "+" : ""}${result.difference.toFixed(1)}°`;
      renderSteps(document.getElementById("cmp-steps-list"), result.steps);
      document.getElementById("cmp-result-box").classList.add("visible");
    } catch (err) {
      document.getElementById("cmp-result-value").textContent = translateError(err);
      document.getElementById("cmp-result-box").classList.add("visible");
    } finally {
      setBtnBusy(btn, false);
    }
  });
}

/* ================================================================== */

setupStd();
setupSailing();
setupLog();
setupCpa();
setupDrift();
setupUnitConverter();
setupCoordsConverter();
setupDrillLog();
setupNoticesLog();
setupUkc();
setupSquat();
setupTides();
setupDraftSurvey();
setupStability();
setupTheory();
setupTrueWind();
setupMultiEta();
setupNoonReport();
setupSextant();
setupSunCompass();
setupRollGm();
setupBlindDistance();
setupOppositeDraft();
setupTrimDensity();
/* ================================================================== */
/* Значки-подсказки "i" у полей — по запросу пользователя: наводишь    */
/* на значок и выплывает окно "что это такое и где это взять".        */
/* Централизованный список id полей + строки tooltip.<id> в           */
/* data/strings/{ru,en}.json — значок появляется автоматически у       */
/* ЛЮБОГО поля из списка ниже, независимо от калькулятора/группы, без */
/* правок разметки в index.html для каждого поля по отдельности.       */
/* ================================================================== */

const FIELD_TOOLTIP_IDS = [
  "sun-date", "sun-time", "sun-event", "sun-lat-deg", "sun-lon-deg", "sun-cb", "sun-var",
  "nl-issue", "nl-notices", "nl-navarea", "nl-area",
  "bd-distance",
  "bd-eye-height", "bd-obstruction-height", "bunker-density", "bunker-sounding", "cc-decimal", "cc-degrees",
  "cc-hemisphere", "cc-is-latitude", "cc-minutes", "cc-seconds", "cmp-heading-a", "cmp-heading-b",
  "dp-temperature", "dp-humidity", "dpr-outside", "dpr-hold", "tdr-outside-temp", "tdr-cargo-temp",
  "dws-draft", "fwa-displacement", "fwa-tpc", "fwa-density", "sl-displacement", "sl-gm", "sl-weight", "sl-height",
  "cpa-own-course", "cpa-own-speed",
  "cpa-target-bearing", "cpa-target-course", "cpa-target-range", "cpa-target-speed", "drift-course", "drift-drift",
  "drift-set", "drift-speed-water-1", "drift-speed-water-2", "drift-track", "ds-dist-aft", "ds-dist-fwd",
  "ds-dist-mid", "ds-lbp", "ds-lightship", "ds-method", "ds-table-step", "ds-vessel-name",
  "input-deviation", "input-heading", "input-variation", "log-actual-distance", "log-dr-course", "log-dr-distance",
  "log-dr-lat1", "log-dr-lon1", "log-ol1", "log-ol2", "log-rol-input", "meta-departure-date",
  "meta-departure-time", "noon-distance-run", "noon-distance-to-go", "noon-elapsed-hours", "noon-fuel-consumed", "noon-rob-before",
  "od-dist-aft", "od-dist-fwd", "od-dist-mid", "od-lbp", "od-mean-aft", "od-mean-fwd",
  "od-mean-mid", "od-method", "rg-beam", "rg-period", "rg-length", "rg-draft", "sailing-lat1", "sailing-lat2",
  "sailing-lon1", "sailing-lon2", "squat-cb", "squat-speed", "st-displacement", "st-kg",
  "st-km", "st-ld-weight", "st-ld-weight-kg", "st-list-distance", "st-list-gm", "st-list-weight",
  "st-vs-distance", "st-vs-weight", "std-distance-speed", "std-distance-time", "std-eta-date", "std-eta-distance",
  "std-eta-speed", "std-eta-time", "std-reqspeed-current-date", "std-reqspeed-current-time", "std-reqspeed-deadline-date", "std-reqspeed-deadline-time",
  "std-reqspeed-distance", "std-speed-distance", "std-speed-time", "std-time-distance", "std-time-speed", "sx-height",
  "sx-hs", "sx-ic", "td-density", "td-displacement", "td-lbp", "td-lcf",
  "td-tpc", "td-trim", "theory-topic-select", "tides-end-height", "tides-end-time", "tides-start-height",
  "tides-start-time", "tides-target-time", "tw-awa", "tw-aws", "tw-heading", "tw-speed",
  "uc-from-unit", "uc-to-unit", "uc-value", "ukc-beam", "ukc-block-coefficient", "ukc-channel-area",
  "ukc-charted-depth", "ukc-heel", "ukc-required-minimum", "ukc-ship-underwater-area", "ukc-speed", "ukc-static-draft",
  "ukc-tide-height", "ukc-wave-allowance", "variation-annual-change", "variation-chart-value", "variation-chart-year", "variation-target-year",
];

function setupFieldTooltips() {
  function attachOne(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const field = input.closest(".field");
    const label = field ? field.querySelector("label") : null;
    if (!label) return;

    let icon = label.querySelector(".info-icon");
    let tip;
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "info-icon";
      icon.tabIndex = 0;
      icon.setAttribute("role", "note");
      icon.textContent = "i";
      tip = document.createElement("span");
      tip.className = "info-tooltip";
      icon.appendChild(tip);
      label.appendChild(icon);
      // Не дать открытой подсказке вылезти за край экрана (на телефоне
      // значок "i" у правой колонки полей стоит почти у края).
      const clamp = () => {
        tip.style.setProperty("--tip-shift", "0px");
        requestAnimationFrame(() => {
          const r = tip.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          let shift = 0;
          if (r.right > vw - 12) shift = vw - 12 - r.right;
          if (r.left + shift < 12) shift = 12 - r.left;
          tip.style.setProperty("--tip-shift", `${Math.round(shift)}px`);
        });
      };
      icon.addEventListener("mouseenter", clamp);
      icon.addEventListener("focus", clamp);
    } else {
      tip = icon.querySelector(".info-tooltip");
    }
    tip.textContent = t(`tooltip.${fieldId}`, lang());
  }

  function attachAll() {
    FIELD_TOOLTIP_IDS.forEach(attachOne);
  }

  window.ShipHelperI18n.preloadI18n().then(attachAll);
  // Динамические секции (драфт-сюрвей, теория) строят часть своих полей
  // позже/повторно — переприменяем после смены языка (заодно обновляет
  // текст самих подсказок на новый язык) и, на всякий случай, коротким
  // отложенным проходом после первичной отрисовки калькуляторов.
  document.addEventListener("shiphelper:langchange", attachAll);
  setTimeout(attachAll, 300);
}

/* ================================================================== */
/* "Сбросить"/"Сохранить" у каждого калькулятора (по прямому запросу    */
/* пользователя: "человек может либо сбросить данные, либо сохранить,  */
/* чтобы после входа в приложение данные остались, либо обнулились").  */
/* ================================================================== */

// Контейнеры динамических таблиц "обычных" (не template-based)
// калькуляторов — "Сбросить" для них означает заново вызвать
// createDynTable() с теми же колонками/дефолтными строками, что уже
// использует сам калькулятор при первой загрузке (те же top-level
// константы/функции, что видны чуть выше по этому же файлу). Ни одна
// из них не хранит вне своего calc-page внешних ссылок на построенный
// DOM (в отличие от драфт-сюрвея, см. ниже) — просто перестроить
// контейнер заново безопасно, без риска "осиротевших" замыканий.
const RESET_DYN_TABLES = {
  "bunker-table": () => createDynTable(document.getElementById("bunker-table"), BUNKER_TABLE_COLUMNS, bunkerDefaultTable()),
  "ullage-table": () => createDynTable(document.getElementById("ullage-table"), ULLAGE_TABLE_COLUMNS, ullageDefaultTable()),
  "bs-table": () => createDynTable(document.getElementById("bs-table"), BS_TANK_COLUMNS, bsDefaultTanks()),
  "dws-table": () => createDynTable(document.getElementById("dws-table"), DWS_TABLE_COLUMNS, dwsDefaultTable()),
  "meta-legs": () => createDynTable(document.getElementById("meta-legs"), META_LEG_COLUMNS, metaDefaultLegs()),
};

// Калькуляторы со сложной структурой (как драфт-сюрвей — см.
// setupDraftSurvey() выше) регистрируют здесь свою собственную функцию
// полного сброса, когда общей (по id полей) логики недостаточно.
window.ShipHelperCalcReset = window.ShipHelperCalcReset || {};

// Журнал тревог и журнал корректуры — постоянные журналы со своим
// хранением (см. setupDrillLog()/notices-log выше), а не разовые расчёты:
// кнопка «Сбросить» там означала бы риск стереть накопленную историю одним
// нажатием, поэтому общий блок ниже их поля не трогает (только повторяет
// расчёт статусов журнала тревог при следующем входе).
const CALC_PERSISTENCE_EXCLUDE = new Set(["drill-log", "notices-log"]);

// Кнопки, которые НЕ повторяются автоматически при следующем входе:
// документы/добавление записей и операция с грузом в остойчивости (она
// записывает новые Δ и KG обратно в поля — повтор применил бы груз дважды).
const AUTORUN_SKIP = new Set(["ds-word-btn", "nl-add-btn", "st-calc-gm-btn"]);

/* Автосохранение «на том этапе, где вышли» (запрос пользователя 2026-10-07:
 * журнал тревог после выхода из программы вернулся к начальным значениям).
 * Для КАЖДОГО калькулятора при любом изменении сохраняется снимок:
 *   fields   — поля с id (числа, даты, селекты, чекбоксы);
 *   anon     — поля без id вне таблиц (замеры съёмок драфт-сюрвея) по порядку;
 *   tables   — все динамические таблицы (танки, участки маршрута, калибровки);
 *   switches — выбранные режимы сегментных переключателей;
 *   ran      — какие кнопки расчёта нажимались: при следующем входе расчёт
 *              повторяется, и результат снова на экране.
 * Ключ — shiphelper-calc-<id> (тот же, что у прежней кнопки «Сохранить»;
 * старый формат {id: значение} читается как fields). */
function setupCalcPersistence() {
  const pages = Array.from(document.querySelectorAll(".calc-page[data-calc]"));
  const pageApi = [];

  pages.forEach((page) => {
    const calcId = page.dataset.calc;
    const excluded = CALC_PERSISTENCE_EXCLUDE.has(calcId);
    const storageKey = `shiphelper-calc-${calcId}`;
    let restoring = false;
    let ran = [];
    let saveTimer = null;
    let dirty = false;           // пишем только то, что пользователь трогал

    const isDataControl = (el) =>
      !(el.type === "button" || el.type === "submit" || el.type === "file" || el.closest(".paywall-overlay"));

    function snapshot() {
      const s = { v: 2, fields: {}, anon: [], tables: [], switches: {}, ran: ran.slice(), results: {} };
      // Видимые результаты (число + предупреждения) — для расчётов, которые не повторяются
      // автоматически (операция с грузом в остойчивости); повторяемые перезапишут их сами.
      page.querySelectorAll(".result.visible[id]").forEach((box) => {
        const r = { vals: {}, hints: {} };
        box.querySelectorAll(".result-value[id]").forEach((el) => { r.vals[el.id] = el.textContent; });
        box.querySelectorAll(".field-hint[id]").forEach((el) => { r.hints[el.id] = el.hidden; });
        s.results[box.id] = r;
      });
      if (!excluded) {
        page.querySelectorAll("input, select, textarea").forEach((el) => {
          if (!isDataControl(el) || el.closest(".dyn-table")) return;
          const val = el.type === "checkbox" ? el.checked : el.value;
          if (el.id) s.fields[el.id] = val;
          else s.anon.push(val);
        });
        page.querySelectorAll(".dyn-table").forEach((tbl) => {
          const rows = [];
          tbl.querySelectorAll(".dyn-table-row").forEach((row) => {
            const r = {};
            row.querySelectorAll("[data-field]").forEach((inp) => { r[inp.dataset.field] = inp.value; });
            rows.push(r);
          });
          s.tables.push(rows);
        });
        page.querySelectorAll(".segmented[id]").forEach((sw) => {
          const btns = Array.from(sw.querySelectorAll("button"));
          const i = btns.findIndex((b) => b.classList.contains("active"));
          if (i >= 0) s.switches[sw.id] = i;
        });
      }
      return s;
    }

    function load() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data && data.v === 2) return data;
        return { v: 2, fields: data || {}, anon: [], tables: [], switches: {}, ran: [] };
      } catch (e) { return null; }
    }

    function saveNow() {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (restoring || !dirty) return;
      dirty = false;
      try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); } catch (e) { /* приватный режим */ }
    }
    function saveSoon(ms) {
      if (restoring) return;
      dirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, ms || 250);
    }

    function setValue(el, val) {
      if (el.type === "checkbox") el.checked = !!val;
      else if (val !== undefined && val !== null) el.value = val;
    }

    function fitTable(tbl, n) {
      let rows = tbl.querySelectorAll(".dyn-table-row");
      const add = tbl.querySelector(".dyn-table-add");
      let guard = 500;
      while (rows.length < n && add && guard--) { add.click(); rows = tbl.querySelectorAll(".dyn-table-row"); }
      while (rows.length > n && guard--) {
        const rm = rows[rows.length - 1].querySelector(".dyn-table-remove");
        if (!rm) break;
        rm.click();
        rows = tbl.querySelectorAll(".dyn-table-row");
      }
    }

    function restore(s) {
      if (!s || excluded) { if (s) ran = s.ran || []; return; }
      restoring = true;
      try {
        // 1) режимы — первыми: они показывают/прячут группы полей
        Object.entries(s.switches || {}).forEach(([id, idx]) => {
          const btn = document.getElementById(id)?.querySelectorAll("button")[idx];
          if (btn && !btn.classList.contains("active")) btn.click();
        });
        // 2) поля; change у селектов/чекбоксов — чтобы показались зависимые поля,
        //    затем значения ставятся ещё раз (обработчик мог подставить своё по умолчанию)
        const applyFields = () => {
          Object.entries(s.fields || {}).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && page.contains(el)) setValue(el, val);
          });
          const anon = Array.from(page.querySelectorAll("input, select, textarea"))
            .filter((el) => isDataControl(el) && !el.id && !el.closest(".dyn-table"));
          (s.anon || []).forEach((val, i) => { if (anon[i]) setValue(anon[i], val); });
        };
        applyFields();
        page.querySelectorAll("select[id], input[type=checkbox][id]").forEach((el) => {
          if (!el.closest(".dyn-table")) el.dispatchEvent(new Event("change", { bubbles: true }));
        });
        applyFields();
        // 3) таблицы: столько же строк, те же значения
        const tables = page.querySelectorAll(".dyn-table");
        (s.tables || []).forEach((rows, i) => {
          const tbl = tables[i];
          if (!tbl || !Array.isArray(rows)) return;
          fitTable(tbl, rows.length);
          tbl.querySelectorAll(".dyn-table-row").forEach((row, j) => {
            const r = rows[j] || {};
            row.querySelectorAll("[data-field]").forEach((inp) => {
              if (r[inp.dataset.field] !== undefined) inp.value = r[inp.dataset.field];
            });
          });
          tbl.dispatchEvent(new Event("dyntablechange"));
        });
        // 4) показанные результаты
        Object.entries(s.results || {}).forEach(([boxId, r]) => {
          const box = document.getElementById(boxId);
          if (!box || !page.contains(box)) return;
          Object.entries(r.vals || {}).forEach(([id, txt]) => { const el = document.getElementById(id); if (el) el.textContent = txt; });
          Object.entries(r.hints || {}).forEach(([id, hid]) => { const el = document.getElementById(id); if (el) el.hidden = hid; });
          box.classList.add("visible");
        });
        ran = Array.isArray(s.ran) ? s.ran.slice() : [];
      } catch (e) {
        console.error("restore", calcId, e);
      } finally {
        restoring = false;
      }
    }

    // Повтор расчётов, сделанных в прошлый раз, — по очереди, дожидаясь каждой кнопки
    async function rerun() {
      for (const id of ran) {
        if (AUTORUN_SKIP.has(id)) continue;
        const btn = document.getElementById(id);
        if (!btn || !page.contains(btn)) continue;
        if (!(await waitEnabled(btn, 4000))) continue;
        restoring = true;            // клики повтора не должны перезаписывать снимок
        btn.click();
        await new Promise((r) => setTimeout(r, 40));
        await waitEnabled(btn, 8000);
        restoring = false;
      }
    }

    // ---- элементы управления в карточке: «Сбросить» + отметка автосохранения ----
    const card = page.querySelector(".card");
    let resetBtn = null;
    if (card && !excluded) {
      const controls = document.createElement("div");
      controls.className = "calc-controls";
      const auto = document.createElement("span");
      auto.className = "calc-autosave";
      auto.dataset.i18n = "calc.common.autosave_note";
      auto.textContent = t("calc.common.autosave_note", lang());
      resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "calc-reset-btn";
      resetBtn.dataset.i18n = "calc.common.reset_btn";
      resetBtn.textContent = t("calc.common.reset_btn", lang());
      controls.appendChild(auto);
      controls.appendChild(resetBtn);
      const anchor = card.querySelector(".card-subtitle") || card.querySelector(".card-title");
      if (anchor) anchor.insertAdjacentElement("afterend", controls);
      else card.insertBefore(controls, card.firstChild);
    }

    function clearResults() {
      page.querySelectorAll(".result.visible").forEach((box) => {
        box.classList.remove("visible");
        const val = box.querySelector(".result-value");
        if (val) val.textContent = "—";
      });
      page.querySelectorAll(".steps-list").forEach((list) => {
        list.innerHTML = "";
        list.classList.remove("visible");
      });
      page.querySelectorAll(".steps-toggle.open").forEach((btn) => {
        btn.classList.remove("open");
        const label = btn.querySelector(".toggle-label");
        if (label) label.textContent = t("calc.common.show_steps", lang());
      });
      // Предупреждения расчёта скрываются; #ds-initial-missing-warning — постоянная
      // подсказка драфт-сюрвея «сначала Шаг 1», её видимостью управляет сам калькулятор.
      page.querySelectorAll(".field-hint.warning:not(#ds-initial-missing-warning)").forEach((w) => { w.hidden = true; });
    }

    // «Сбросить» ОЧИЩАЕТ поля (а не возвращает к примеру из разметки — реальная
    // жалоба пользователя: «не сбрасывает до 0»): числа/текст/даты пустые,
    // чекбокс снят, select — первый вариант.
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        restoring = true;
        try {
          page.querySelectorAll("input[id], select[id]").forEach((el) => {
            if (el.closest(".dyn-table") || !isDataControl(el)) return;
            if (el.type === "checkbox") el.checked = false;
            else if (el.tagName === "SELECT") el.value = el.options.length ? el.options[0].value : "";
            else el.value = "";
          });
          page.querySelectorAll(".dyn-table[id]").forEach((el) => {
            const fn = RESET_DYN_TABLES[el.id];
            if (fn) fn();
          });
          if (window.ShipHelperCalcReset[calcId]) window.ShipHelperCalcReset[calcId]();
          clearResults();
          ran = [];
          dirty = false;
          clearTimeout(saveTimer);
        } finally {
          restoring = false;
        }
        try { localStorage.removeItem(storageKey); } catch (e) { /* приватный режим */ }
      });
    }

    // ---- отслеживание изменений ----
    page.addEventListener("input", () => saveSoon(), true);
    page.addEventListener("change", () => saveSoon(), true);
    page.addEventListener("dyntablechange", () => saveSoon(), true);
    page.addEventListener("click", (e) => {
      if (restoring) return;
      const btn = e.target.closest("button");
      if (!btn || btn === resetBtn) return;
      if (btn.id && btn.classList.contains("btn-primary") && !AUTORUN_SKIP.has(btn.id) && !ran.includes(btn.id)) {
        ran.push(btn.id);
      }
      // расчёт может записать значения в поля программно (без события input) —
      // сохраняем и сразу, и после того как он закончится
      saveSoon(300);
      setTimeout(() => saveSoon(50), 1500);
    }, true);

    pageApi.push({ page, load, restore, rerun, saveNow, hasRan: () => ran.length > 0 });
  });

  function waitEnabled(btn, timeout) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function poll() {
        if (!btn.disabled) return resolve(true);
        if (Date.now() - t0 > timeout) return resolve(false);
        setTimeout(poll, 50);
      })();
    });
  }

  // Восстановление — когда калькуляторы достроили свои таблицы и съёмки
  // (они делают это в preloadI18n().then — наш then зарегистрирован позже).
  window.ShipHelperI18n.preloadI18n().then(() => setTimeout(() => {
    pageApi.forEach((p) => p.restore(p.load()));
    const runAll = async () => { for (const p of pageApi) if (p.hasRan()) await p.rerun(); };
    if (window.__azReady) runAll();
    else document.addEventListener("shiphelper:ready", runAll, { once: true });
  }, 60));

  // Смена языка пересобирает часть таблиц/съёмок — возвращаем введённое
  // (снимок в хранилище актуален: он пишется при каждом изменении)
  document.addEventListener("shiphelper:langchange", () => {
    setTimeout(() => {
      pageApi.forEach((p) => {
        const s = p.load();
        if (s) { p.restore(s); if (window.__azReady && p.hasRan()) p.rerun(); }
      });
    }, 30);
  });

  // Перед закрытием/сворачиванием — дописать то, что ещё ждёт таймера
  const flushAll = () => pageApi.forEach((p) => p.saveNow());
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  window.ShipHelperFlushCalcs = flushAll;
}

/* ================================================================== */
/* Пэйволл — какие калькуляторы/разделы доступны бесплатно (демо),     */
/* остальное открывается после активации лицензионного ключа           */
/* (window.ShipHelperLicense, см. license.js + app.js::setupLicenseModal) */
/* ================================================================== */

// Решение по составу бесплатного демо (v1, принято самостоятельно —
// см. CLAUDE.md, раздел про механизм ключа, 2026-10-02): по одному
// простому/часто используемому калькулятору из каждой из 4 групп с
// калькуляторами (компас, V/T/S/ETA, оба конвертера, UKC, прилив,
// журнал тревог) — демонстрируют качество приложения и остаются
// полезными сами по себе, не требуя покупки. Всё остальное (более
// "продвинутые"/специализированные расчёты и ВЕСЬ раздел теории —
// самый объёмный и ценный блок контента) — платное. Список легко
// расширить/сузить правкой этого массива, без изменений остальной
// логики.
const PAID_CALCS = new Set([
  "compass-comparison", "sailing", "log", "cpa", "drift", "true-wind",
  "multi-eta", "noon-report", "sextant", "sun-compass",
  "drill-log",
  "squat", "roll-gm", "blind-distance",
  "draft", "stability", "opposite-draft", "trim-density", "bunker",
  "dew-point", "ullage", "ballast-sounding", "deadweight-scale", "fwa",
  "suspended-load",
]);
// Бесплатно: compass, std, unit-converter, coords-converter, ukc, tides
// (не входят в PAID_CALCS выше).

// Группы, закрытые ЦЕЛИКОМ (не по отдельным калькуляторам внутри) —
// сейчас только "Теория и справочник": там один общий блок
// выбора темы + область контента, а не набор .calc-page с data-calc,
// как у остальных групп.
const PAID_GROUPS = new Set(["theory"]);

function buildPaywallOverlay(onUnlock) {
  const overlay = document.createElement("div");
  overlay.className = "paywall-overlay";
  overlay.innerHTML = `
    <div class="paywall-icon">🔒</div>
    <p class="paywall-text" data-i18n="app.license.paywall_text">Этот раздел открывается в полной версии</p>
    <button type="button" class="btn-primary paywall-unlock-btn" data-i18n="app.license.paywall_btn">Активировать ключ</button>
  `;
  overlay.querySelector(".paywall-unlock-btn").addEventListener("click", onUnlock);
  return overlay;
}

function setupPaywall() {
  if (!window.ShipHelperLicense) return;

  function lockedTargets() {
    const targets = [];
    document.querySelectorAll(".calc-page[data-calc]").forEach((page) => {
      if (!PAID_CALCS.has(page.dataset.calc)) return;
      const card = page.querySelector(".card");
      if (card) targets.push(card);
    });
    PAID_GROUPS.forEach((groupId) => {
      const group = document.querySelector(`.group-content[data-group="${groupId}"]`);
      if (group) targets.push(group);
    });
    return targets;
  }

  function openLicenseModal() {
    document.getElementById("license-btn")?.click();
  }

  function applyLockState() {
    const unlocked = window.ShipHelperLicense.isActivated();
    lockedTargets().forEach((el) => {
      el.classList.add("paywall-host");
      let overlay = el.querySelector(":scope > .paywall-overlay");
      if (unlocked) {
        if (overlay) overlay.remove();
        el.classList.remove("paywall-locked");
      } else {
        el.classList.add("paywall-locked");
        if (!overlay) {
          overlay = buildPaywallOverlay(openLicenseModal);
          el.appendChild(overlay);
        }
        // истёкший ключ — «продлите», иначе — «откройте полную версию»
        const expired = window.ShipHelperLicense.status().state === "expired";
        const txt = overlay.querySelector(".paywall-text"), btn = overlay.querySelector(".paywall-unlock-btn");
        txt.dataset.i18n = expired ? "app.license.paywall_expired" : "app.license.paywall_text";
        btn.dataset.i18n = expired ? "app.license.paywall_renew" : "app.license.paywall_btn";
        const lang = document.documentElement.lang || "ru";
        txt.textContent = window.ShipHelperI18n.t(txt.dataset.i18n, lang);
        btn.textContent = window.ShipHelperI18n.t(btn.dataset.i18n, lang);
        // Перевод текста оверлея на случай смены языка ПОСЛЕ его
        // создания — applyStrings() (app.js) и так проходит по всем
        // [data-i18n] в документе при смене языка, этот оверлей не
        // исключение, отдельной обработки не требуется.
      }
    });
  }

  document.addEventListener("shiphelper:licensechange", applyLockState);
  // Теория строит часть разметки (.group-content[data-group="theory"]
  // уже существует статически в index.html, в отличие от калькуляторов,
  // которые тоже статические — applyLockState можно звать сразу).
  applyLockState();
}

setupBunker();
setupDewPoint();
setupCompassComparison();
setupUllage();
setupBallastSounding();
setupDeadweightScale();
setupFwa();
setupSuspendedLoad();
setupCalcPersistence();
setupFieldTooltips();
setupPaywall();
setupResultTextFit();

/* Если в крупное поле результата попал текст ошибки (длинная фраза, а не
   число), показываем его обычным размером шрифта — иначе фраза на телефоне
   занимает пол-экрана. Один наблюдатель на весь документ вместо правки
   каждого обработчика ошибок. */
function setupResultTextFit() {
  const fit = (el) => {
    const txt = (el.textContent || "").trim();
    const msg = txt.length > 22 && /[A-Za-zА-Яа-яЁё]{4,}\s+[A-Za-zА-Яа-яЁё]/.test(txt);
    el.classList.toggle("is-message", msg);
    // Длинное число с единицей («157.500 т·м/см») на телефоне переносилось
    // посреди единицы — такие значения рисуем чуть мельче.
    el.classList.toggle("is-long", !msg && txt.length > 12);
  };
  document.querySelectorAll(".result-value").forEach(fit);
  new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target.nodeType === 1 ? m.target.closest(".result-value") : m.target.parentElement && m.target.parentElement.closest(".result-value");
      if (el) fit(el);
    }
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
}

})();
