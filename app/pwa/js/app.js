/**
 * Логика первого экрана PWA-прототипа (доказательство архитектуры, не
 * полное приложение) — калькулятор поправки компаса, перенесённый с
 * Streamlit-версии (app/main.py::render_compass_tab). Сама расчётная
 * функция не переписана: вызывается напрямую в core/compass.py через
 * ShipHelperPy.callCore() (см. pyodide-bridge.js).
 *
 * Это ПЕРВЫЙ калькулятор в новой архитектуре — визуальный ориентир,
 * который нужно утвердить с пользователем, прежде чем переносить
 * остальные 12+ калькуляторов и тему теории в том же духе.
 */

const { t, preloadI18n, SUPPORTED_LANGUAGES } = window.ShipHelperI18n;
const { initPyodide, callCore } = window.ShipHelperPy;

const THEME_STORAGE_KEY = "shiphelper-theme";

let currentLang = "ru";
let currentDirection = "compass_to_true"; // | "true_to_compass"
let currentTheme = "dark"; // | "light"

function applyStrings() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, currentLang);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder, currentLang);
  });
  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
  document.documentElement.lang = currentLang;
  renderThemeToggleLabel();
}

function renderThemeToggleLabel() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  // Кнопка называет действие (в какую тему переключит), а не текущее
  // состояние — так понятнее, что произойдёт по клику.
  const icon = currentTheme === "dark" ? "☀️" : "🌙";
  const label = currentTheme === "dark"
    ? t("app.theme.switch_to_light", currentLang)
    : t("app.theme.switch_to_dark", currentLang);
  btn.innerHTML = `<span class="nav-icon">${icon}</span><span>${label}</span>`;
}

function setLoadingText(text) {
  const el = document.getElementById("loading-text");
  if (el) el.textContent = text;
  // В Android-сборке попадает в системный журнал (MainActivity.onConsoleMessage) — время этапов загрузки
  if (window.AzimuthNative) console.info(`[boot ${Math.round(performance.now())} ms] ${text}`);
}

function renderResult(result) {
  const box = document.getElementById("result-box");
  const valueEl = document.getElementById("result-value");
  const labelEl = document.getElementById("result-label");
  const stepsList = document.getElementById("steps-list");

  labelEl.textContent =
    currentDirection === "compass_to_true"
      ? t("calc.compass.true_heading_metric", currentLang)
      : t("calc.compass.compass_heading_metric", currentLang);
  { const c = ((Math.round(result.value * 10) / 10) % 360 + 360) % 360; valueEl.textContent = `${c.toFixed(1)}°`; }

  stepsList.innerHTML = "";
  stepsList.__rawSteps = result.steps;
  stepsList.classList.add("has-raw-steps");
  for (const raw of result.steps) {
    const step = currentLang === "en" && window.ShipHelperStepsEN ? window.ShipHelperStepsEN.translateStep(raw) : raw;
    const item = document.createElement("div");
    item.className = "step-item";
    item.innerHTML = `
      <div class="step-desc">${step.description}</div>
      <div class="step-formula">${step.formula} &nbsp;→&nbsp; ${step.substitution}</div>
      <div class="step-result">${step.result}</div>
    `;
    stepsList.appendChild(item);
  }

  box.classList.add("visible");
}

async function handleCalculate() {
  const btn = document.getElementById("calc-btn");
  const heading = parseFloat(document.getElementById("input-heading").value);
  const deviation = parseFloat(document.getElementById("input-deviation").value);
  const variation = parseFloat(document.getElementById("input-variation").value);

  if ([heading, deviation, variation].some((v) => Number.isNaN(v))) {
    return;
  }

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "…";

  try {
    const funcName = currentDirection === "compass_to_true" ? "true_from_compass" : "compass_from_true";
    // ВАЖНО: имя модуля должно быть с префиксом пакета "core." — файлы
    // лежат в /core/*.py внутри виртуальной ФС Pyodide, и sys.path
    // настроен на импорт как "core.compass", а не голое "compass" (см.
    // докстринг pyodide-bridge.js). Раньше здесь было "compass" без
    // префикса — import падал с ModuleNotFoundError, ошибка тихо глоталась
    // в catch ниже, и кнопка "Рассчитать" визуально ничего не делала.
    const result = await callCore("core.compass", funcName, [heading, deviation, variation]);
    renderResult(result);
  } catch (err) {
    // Раньше ошибка здесь только уходила в console.error, и кнопка
    // молча "ничего не делала" — пользователь не мог понять, сломан ли
    // расчёт или он просто ждёт. Теперь видимое сообщение в блоке
    // результата (используем ту же область, что и обычный результат).
    const m = String(err && err.message ? err.message : err).match(/ValueError:\s*(err\.[a-zA-Z0-9_.]+)/);
    if (!m) console.error(err);
    const box = document.getElementById("result-box");
    document.getElementById("result-label").textContent = m ? t(m[1], currentLang) : t("app.calc_error", currentLang);
    document.getElementById("result-value").textContent = "—";
    document.getElementById("steps-list").innerHTML = "";
    box.classList.add("visible");
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

/**
 * Под-расчёт "привести склонение с карты к году плавания"
 * (core.compass.variation_for_year) — раньше существовал только в
 * Streamlit-версии (app/main.py::render_compass_tab, expander) и был
 * потерян при первом переносе калькулятора компаса в PWA (см.
 * CLAUDE.md). Результат подставляется прямо в поле "Склонение d"
 * основного расчёта, как и было в Streamlit-версии — сам <details>
 * при этом не закрывается автоматически, чтобы пользователь видел
 * результат приведения.
 */
function setupVariationExpander() {
  const btn = document.getElementById("variation-calc-btn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const chartVariation = parseFloat(document.getElementById("variation-chart-value").value);
    const chartYear = parseInt(document.getElementById("variation-chart-year").value, 10);
    const annualChange = parseFloat(document.getElementById("variation-annual-change").value);
    const targetYear = parseInt(document.getElementById("variation-target-year").value, 10);
    const resultEl = document.getElementById("variation-result");

    if ([chartVariation, chartYear, annualChange, targetYear].some((v) => Number.isNaN(v))) {
      return;
    }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "…";

    try {
      const result = await callCore("core.compass", "variation_for_year", [
        chartVariation,
        chartYear,
        annualChange,
        targetYear,
      ]);
      const formatted = result.value.toFixed(2);
      resultEl.textContent = t("calc.compass.variation_result", currentLang, {
        year: targetYear,
        value: formatted.startsWith("-") ? formatted : `+${formatted}`,
      });
      resultEl.hidden = false;
      // Подставляем результат прямо в поле склонения основного расчёта.
      document.getElementById("input-variation").value = formatted;
    } catch (err) {
      const m = String(err && err.message ? err.message : err).match(/ValueError:\s*(err\.[a-zA-Z0-9_.]+)/);
      if (!m) console.error(err);
      resultEl.textContent = m ? t(m[1], currentLang) : t("app.calc_error", currentLang);
      resultEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });
}

function setupDirectionSwitch() {
  const buttons = document.querySelectorAll("#direction-switch button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentDirection = btn.dataset.direction;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("result-box").classList.remove("visible");
    });
  });
}

function setupStepsToggle() {
  const toggle = document.getElementById("steps-toggle");
  const list = document.getElementById("steps-list");
  toggle.addEventListener("click", () => {
    const open = toggle.classList.toggle("open");
    list.classList.toggle("visible", open);
    toggle.querySelector(".toggle-label").textContent = open
      ? t("calc.common.hide_steps", currentLang)
      : t("calc.common.show_steps", currentLang);
  });
}

function setupLangSwitch() {
  document.querySelectorAll(".lang-switch button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentLang = btn.dataset.lang;
      applyStrings();
      // Отдельное DOM-событие (а не полагаться на document.documentElement.lang)
      // для калькуляторов, которым при смене языка нужно не просто
      // перевести статичные надписи через data-i18n, а ПЕРЕСТРОИТЬ часть
      // разметки (например, драфт-сюрвей — динамические таблицы статей
      // запасов/танков собираются JS-ом, applyStrings() их не видит).
      document.dispatchEvent(new Event("shiphelper:langchange"));
    });
  });
}

/**
 * Проигрывает лёгкую fade-in анимацию (sh-fade-in, см. theme.css) на
 * только что показанном элементе — по запросу пользователя ("более
 * плавные переходы, как будто мы работаем с Джарвисом"). Не заменяет
 * [hidden] (элемент всё ещё полностью убирается из потока — ничего в
 * существующей логике видимости не меняется), только добавляет класс
 * поверх уже видимого элемента и снимает его после того, как анимация
 * доиграла — иначе класс остаётся навсегда и повторный показ того же
 * элемента анимацию не переигрывает (CSS-анимация с уже применённым
 * классом не перезапускается сама по себе).
 */
function playFadeIn(el) {
  if (!el) return;
  el.classList.remove("sh-fade-in");
  // Форсируем reflow, чтобы браузер "забыл" о только что снятом классе
  // перед повторным добавлением — иначе анимация не запустится заново.
  void el.offsetWidth;
  el.classList.add("sh-fade-in");
  el.addEventListener("animationend", () => el.classList.remove("sh-fade-in"), { once: true });
}
// Выставлено в window, чтобы calculators.js (отдельный IIFE, без общей
// области видимости с app.js в классических <script>) мог переиспользовать
// эту же анимацию при раскрытии блока "Показать шаги" — вместо копипасты
// той же логики remove/reflow/add в другом файле.
window.shPlayFadeIn = playFadeIn;

/**
 * Иконка-триггер поповера (см. setupCalcPicker ниже) — компас-роза,
 * тот же геометрический мотив, что и в фоновом узоре (theme.css),
 * а не случайная типовая иконка "список"/"меню".
 */
const CALC_PICKER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/>' +
  '<path d="M12 12 L16 8 L13.2 13.2 L8 16 L10.8 10.8 Z" fill="currentColor" stroke="none"/></svg>';
const CALC_PICKER_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 9l6 6 6-6"/></svg>';
const CALC_PICKER_CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/**
 * Переключатель калькуляторов ВНУТРИ группы сайдбара — раунд 5
 * (2026-09-30). Раунд 4 (командная палитра с полем поиска) пользователь
 * раскритиковал не как паттерн целиком, а конкретно: "зачем поиск, их
 * всего 10 штук"; плюс шрифт списка и маркеры-точки перед пунктами
 * "не нравятся, выглядит некрасиво". Модальное окно по центру экрана
 * с затемнением — то, что понравилось/не вызвало прямых возражений —
 * оставлено; убрано ТОЛЬКО поле поиска (незачем для короткого списка,
 * который весь помещается на экране), вместо него — простой заголовок
 * с названием группы и кнопкой закрытия. Список: крупнее и спокойнее
 * шрифт (без uppercase, тот же стиль, что в остальном приложении),
 * маркер активного пункта — не кружок слева, а галочка справа (как в
 * нативных меню ОС), а не самодельный индикатор.
 * Разметка .calc-switcher/button[data-calc] в HTML и логика выбора
 * калькулятора не менялись.
 */
function setupCalcPicker() {
  document.querySelectorAll(".calc-switcher").forEach((switcher) => {
    const group = switcher.closest(".group-content") || document;
    const buttons = Array.from(switcher.querySelectorAll("button"));
    const pages = group.querySelectorAll(".calc-page");
    if (!buttons.length) return;

    // Заголовок группы (например "Судовождение") берём из активной
    // кнопки сайдбара — так заголовок диалога совпадает с тем, что
    // человек только что выбрал слева, а не дублирует название первого
    // калькулятора в списке.
    const groupTitleSource = document.querySelector(".sidebar-nav button.active");

    const picker = document.createElement("div");
    picker.className = "calc-picker";
    switcher.parentNode.insertBefore(picker, switcher);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "calc-picker-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML =
      `<span class="calc-picker-trigger-icon">${CALC_PICKER_ICON}</span>` +
      `<span class="calc-picker-trigger-label"></span>` +
      `<span class="calc-picker-trigger-count"></span>` +
      `<span class="calc-picker-trigger-chevron">${CALC_PICKER_CHEVRON}</span>`;
    picker.appendChild(trigger);

    const backdrop = document.createElement("div");
    backdrop.className = "calc-picker-backdrop";
    const modal = document.createElement("div");
    modal.className = "calc-picker-modal";
    modal.setAttribute("role", "dialog");

    const header = document.createElement("div");
    header.className = "calc-picker-modal-header";
    const titleEl = document.createElement("span");
    titleEl.className = "calc-picker-modal-title";
    titleEl.textContent = groupTitleSource ? groupTitleSource.textContent.trim() : "";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "calc-picker-modal-close";
    closeBtn.setAttribute("aria-label", "Закрыть");
    closeBtn.innerHTML = CALC_PICKER_CLOSE_ICON;
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    modal.appendChild(header);
    modal.appendChild(switcher);
    backdrop.appendChild(modal);
    picker.appendChild(backdrop);

    // Галочка справа у активного пункта нарисована в CSS псевдоэлементом
    // .calc-switcher button.active::after — НЕ добавляется сюда через JS.
    // Первая версия вставляла <svg> прямо в DOM кнопки, и он пропадал при
    // первой же перерисовке i18n-строк (applyStrings делает textContent =
    // на элементах с data-i18n, а data-i18n стоит прямо на <button> — это
    // стирает любые дочерние узлы). Подробности — в комментарии у
    // .calc-switcher button.active::after в theme.css.

    const labelEl = trigger.querySelector(".calc-picker-trigger-label");
    const countEl = trigger.querySelector(".calc-picker-trigger-count");

    function activeButton() {
      return switcher.querySelector("button.active") || buttons[0];
    }
    function syncTriggerLabel() {
      labelEl.textContent = activeButton().textContent.trim();
      countEl.textContent = `${buttons.indexOf(activeButton()) + 1}/${buttons.length}`;
    }
    function closePicker() {
      picker.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }
    // Заголовок модалки — название ИМЕННО этой группы. Раньше бралось
    // название активной в момент сборки кнопки сайдбара ("Судовождение")
    // и оставалось одинаковым у палитр всех групп — найдено на скриншоте
    // для RuStore: палитра "Грузовых операций" была озаглавлена
    // "СУДОВОЖДЕНИЕ".
    function syncTitle() {
      const groupId = picker.closest(".group-content")?.dataset.group;
      const src = groupId ? document.querySelector(`.sidebar-nav button[data-group="${groupId}"]`) : null;
      if (src) titleEl.textContent = src.textContent.trim();
    }
    syncTitle();
    function openPicker() {
      syncTitle();
      // Закрываем все остальные открытые палитры — иначе на странице с
      // несколькими группами могло бы одновременно висеть по две модалки.
      document.querySelectorAll(".calc-picker.open").forEach((p) => {
        if (p !== picker) p.classList.remove("open");
      });
      picker.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      openPicker();
    });
    closeBtn.addEventListener("click", closePicker);

    // Клик по затемнению (но не по самой карточке) — закрыть.
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closePicker();
    });

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.calc;
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        pages.forEach((p) => {
          const wasHidden = p.hidden;
          p.hidden = p.dataset.calc !== target;
          if (wasHidden && !p.hidden) playFadeIn(p);
        });
        syncTriggerLabel();
        closePicker();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && picker.classList.contains("open")) closePicker();
    });

    syncTriggerLabel();
  });

  // Смена языка перерисовывает текст кнопок через data-i18n (applyStrings),
  // но текст в уже собранном триггере (calc-picker-trigger-label) и в
  // заголовке модалки (calc-picker-modal-title — он один раз считан из
  // .sidebar-nav button.active при сборке, см. groupTitleSource выше)
  // сам собой не обновится — досылаем событие пересинхронизации. Найдено
  // при проверке EN-версии: после переключения RU→EN список калькуляторов
  // переводился, а заголовок диалога над ним оставался русским
  // ("СУДОВОЖДЕНИЕ" вместо "NAVIGATION").
  document.addEventListener("shiphelper:langchange", () => {
    document.querySelectorAll(".calc-picker").forEach((picker) => {
      const switcher = picker.querySelector(".calc-switcher");
      const trigger = picker.querySelector(".calc-picker-trigger");
      const titleEl = picker.querySelector(".calc-picker-modal-title");
      if (!switcher || !trigger) return;
      const active = switcher.querySelector("button.active") || switcher.querySelector("button");
      if (active) trigger.querySelector(".calc-picker-trigger-label").textContent = active.textContent.trim();
      if (titleEl) {
        const groupId = picker.closest(".group-content")?.dataset.group;
        const src = groupId ? document.querySelector(`.sidebar-nav button[data-group="${groupId}"]`) : null;
        if (src) titleEl.textContent = src.textContent.trim();
      }
    });
  });
}

/**
 * Переключатель ГРУППЫ в сайдбаре (сайдбар выбирает группу — пока
 * реально переключаются "Судовождение" и "Инструменты", остальные
 * кнопки [disabled]-заглушки без data-group). Каждая .group-content
 * с соответствующим data-group показывается, остальные получают
 * [hidden]. Внутреннее состояние калькулятора внутри группы (какая
 * вкладка была активна) не сбрасывается при уходе и возврате — это
 * осознанно: DOM групп не разрушается, просто скрывается.
 */
function setupSidebarNav() {
  const buttons = document.querySelectorAll(".sidebar-nav button[data-group]");
  const groups = document.querySelectorAll(".group-content");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.group;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      groups.forEach((g) => {
        const wasHidden = g.hidden;
        g.hidden = g.dataset.group !== target;
        if (wasHidden && !g.hidden) playFadeIn(g);
      });
      // Новый раздел — с начала страницы (раньше оставалась прокрутка прошлого раздела)
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  });
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = currentTheme;
  renderThemeToggleLabel();
}

// Номер версии приложения — билд-идентификатор, не переводимый UI-текст
// (та же логика, что у названия "ShipHelper" — правило 5 в CLAUDE.md про
// "никаких текстов интерфейса в коде" касается переводимого текста, не
// версии сборки). Синхронизируется вручную с CACHE_NAME в sw.js при
// каждом релизе — единой автоматической привязки пока нет, при
// расхождении ориентироваться на дату последнего релиза ниже.
const APP_VERSION = "1.6.1";
const APP_BUILD_DATE = "2026-11-14";
window.ShipHelperAppVersion = APP_VERSION;

/**
 * Экран "О программе" — по требованию Части D дорожной карты (доверие/
 * полировка: реальная иконка + версия видна пользователю). Модальное
 * окно по центру экрана — тот же визуальный паттерн, что палитра
 * калькуляторов (.calc-picker-backdrop/.calc-picker-modal), но
 * управляется напрямую атрибутом [hidden] через JS (см. комментарий в
 * theme.css у .about-modal-backdrop), а не собственным классом .open.
 * Краткий changelog собирается из массива ключей i18n
 * (app.about.changelog.N) — ключи переведены на оба языка, число
 * пунктов задаётся ABOUT_CHANGELOG_COUNT ниже.
 */
const ABOUT_CHANGELOG_COUNT = 5;

function renderAboutContent() {
  const l = currentLang;
  document.getElementById("about-version-value").textContent =
    `v${APP_VERSION} · ${APP_BUILD_DATE}`;
  const list = document.getElementById("about-changelog-list");
  list.innerHTML = "";
  for (let i = 1; i <= ABOUT_CHANGELOG_COUNT; i++) {
    const key = `app.about.changelog.${i}`;
    const text = t(key, l);
    if (text.startsWith("[[")) continue; // пункта с таким номером нет
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }
}

/**
 * Версия для Windows (WebView2): кнопки окна в боковом меню — «Во весь экран / Обычное окно»
 * (и клавиша F11), а в полноэкранном режиме ещё «Свернуть» и «Выход», потому что рамки окна
 * с кнопками нет. Команды уходят в программу через chrome.webview.postMessage, состояние
 * приходит обратно сообщением "fullscreen:1|0". В браузере и на Android ничего не делает.
 */
function setupDesktopWindow() {
  const wv = window.chrome && window.chrome.webview;
  if (!wv) return;
  const bottom = document.querySelector(".sidebar-bottom");
  if (!bottom) return;
  let full = false;
  const row = document.createElement("div");
  row.className = "desktop-win-row";
  row.innerHTML =
    '<button class="sidebar-link" id="win-fullscreen-btn"><span class="nav-icon">⛶</span><span class="win-fs-label"></span></button>' +
    '<button class="sidebar-link win-icon-btn" id="win-minimize-btn" hidden>—</button>' +
    '<button class="sidebar-link win-icon-btn win-close" id="win-close-btn" hidden>✕</button>';
  bottom.insertBefore(row, bottom.firstChild);
  const fsBtn = row.querySelector("#win-fullscreen-btn");
  const minBtn = row.querySelector("#win-minimize-btn");
  const closeBtn = row.querySelector("#win-close-btn");
  const render = () => {
    row.querySelector(".win-fs-label").textContent = t(full ? "app.desktop.windowed" : "app.desktop.fullscreen", currentLang);
    fsBtn.title = "F11";
    minBtn.title = t("app.desktop.minimize", currentLang);
    closeBtn.title = t("app.desktop.close", currentLang);
    minBtn.hidden = !full;
    closeBtn.hidden = !full;
  };
  fsBtn.addEventListener("click", () => wv.postMessage("fullscreen-toggle"));
  minBtn.addEventListener("click", () => wv.postMessage("app-minimize"));
  closeBtn.addEventListener("click", () => wv.postMessage("app-close"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "F11") { e.preventDefault(); wv.postMessage("fullscreen-toggle"); }
  });
  wv.addEventListener("message", (e) => {
    if (typeof e.data === "string" && e.data.startsWith("fullscreen:")) { full = e.data === "fullscreen:1"; render(); }
  });
  document.addEventListener("shiphelper:langchange", render);
  preloadI18n().then(render);
  render();
  wv.postMessage("fullscreen-state");
}

function setupAboutModal() {
  const btn = document.getElementById("about-btn");
  const backdrop = document.getElementById("about-backdrop");
  const closeBtn = document.getElementById("about-close");
  if (!btn || !backdrop) return;
  closeBtn.innerHTML = CALC_PICKER_CLOSE_ICON;

  function open() {
    renderAboutContent();
    backdrop.hidden = false;
  }
  function close() {
    backdrop.hidden = true;
  }

  btn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) close();
  });

  // Перерисовать текст changelog/версии при смене языка, если модалка
  // уже открыта в этот момент (тот же приём, что и для заголовка палитры
  // калькуляторов — см. shiphelper:langchange выше).
  document.addEventListener("shiphelper:langchange", () => {
    if (!backdrop.hidden) renderAboutContent();
  });
}

// Та же маленькая утилита, что уже есть (отдельно) в calculators.js —
// не вынесена в общий модуль, т.к. calculators.js оборачивает её в IIFE
// и не делает глобальной; дублирование здесь дешевле нового общего файла
// ради одной 6-строчной функции.
function setBtnBusy(btn, busy) {
  btn.disabled = busy;
  if (busy) {
    btn.dataset.originalLabel = btn.textContent;
    btn.textContent = "…";
  } else if (btn.dataset.originalLabel) {
    btn.textContent = btn.dataset.originalLabel;
  }
}

/**
 * Модалка активации полной версии — тот же визуальный паттерн, что
 * экран "О программе" (.about-modal-backdrop переиспользован, другой
 * id), логика активации/проверки ключа — в license.js
 * (window.ShipHelperLicense), эта функция только UI-обвязка вокруг неё.
 */
function fmtDate(d) {
  return d ? d.toLocaleDateString(currentLang === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
}

function renderLicenseSidebarBadge() {
  const badge = document.getElementById("license-status-badge");
  if (!badge) return;
  const st = window.ShipHelperLicense.status();
  let text, cls = "";
  if (st.state === "active") {
    if (st.perpetual) text = t("app.license.badge_full", currentLang);
    else if (st.daysLeft <= 7) { text = t("app.license.badge_days", currentLang, { n: Math.max(0, st.daysLeft) }); cls = "warn"; }
    else text = t("app.license.badge_until", currentLang, { date: fmtDate(st.expiry) });
  } else if (st.state === "demo") {
    text = t("app.license.badge_demo", currentLang);
  } else {
    text = t(st.state === "expired" ? "app.license.badge_expired" : "app.license.badge_problem", currentLang); cls = "bad";
  }
  badge.textContent = text;
  badge.classList.toggle("full", st.state === "active");
  badge.classList.toggle("warn", cls === "warn");
  badge.classList.toggle("bad", cls === "bad");
}

function licenseDevicesText(st) {
  const L = window.ShipHelperLicense, mine = L.isPhone() ? "an" : "pc";
  return ["pc", "an"].map((k) => {
    const name = t(k === "pc" ? "app.license.device_pc" : "app.license.device_an", currentLang);
    const v = st.devices && st.devices[k];
    return `${name}: ${v ? v : t("app.license.device_none", currentLang)}${v && k === mine ? " " + t("app.license.this_device", currentLang) : ""}`;
  }).join("\n");
}

function renderLicenseModalContent() {
  const L = window.ShipHelperLicense;
  const st = L.status();
  const $ = (id) => document.getElementById(id);
  $("license-device-code").textContent = L.deviceCode();
  const block = $("license-status-block");
  block.hidden = false;
  block.dataset.state = st.state;
  const known = st.state !== "demo" && st.state !== "invalid" && st.state !== "legacy";
  $("license-status-title").textContent = t("app.license.state." + st.state, currentLang);
  block.querySelector(".lic-facts").hidden = !known;
  if (known) {
    $("license-plan-value").textContent = t("app.license.plan." + st.plan, currentLang);
    $("license-until-value").textContent = st.perpetual ? t("app.license.perpetual", currentLang)
      : st.state === "active" ? t("app.license.until_days", currentLang, { date: fmtDate(st.expiry), n: st.daysLeft })
      : fmtDate(st.expiry);
    $("license-devices-value").textContent = licenseDevicesText(st);
  }
  const note = $("license-status-note");
  const noteKey = { demo: "app.license.note.demo", expired: "app.license.note.expired", wrong_device: "app.license.note.wrong_device",
    clock: "app.license.note.clock", legacy: "app.license.note.legacy", invalid: "app.license.note.invalid" }[st.state];
  const soon = st.state === "active" && !st.perpetual && st.daysLeft <= 7;
  note.hidden = !noteKey && !soon;
  if (noteKey) note.textContent = t(noteKey, currentLang);
  else if (soon) note.textContent = t("app.license.note.soon", currentLang, { n: st.daysLeft });
  const active = st.state === "active";
  $("license-state-active").hidden = !active;
  $("license-entry").hidden = active && !renderLicenseModalContent.changing;
  // контакты продавца
  const req = window.AzimuthLegal ? window.AzimuthLegal.requisites() : {};
  const items = [];
  if (req.telegram) items.push(`Telegram: <b>${escHtml(req.telegram)}</b>`);
  if (req.email) items.push(`E-mail: <b>${escHtml(req.email)}</b>`);
  if (req.telegram_channel) items.push(`${escHtml(t("app.license.channel", currentLang))}: <b>${escHtml(req.telegram_channel)}</b>`);
  $("license-contacts-list").innerHTML = items.length ? items.map((x) => `<div>${x}</div>`).join("") : `<div class="field-hint">${escHtml(t("app.license.purchase_note", currentLang))}</div>`;
  renderLicenseSidebarBadge();
}
function escHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function setupLicenseModal() {
  const btn = document.getElementById("license-btn");
  const backdrop = document.getElementById("license-backdrop");
  const closeBtn = document.getElementById("license-close");
  if (!btn || !backdrop) return;
  closeBtn.innerHTML = CALC_PICKER_CLOSE_ICON;
  const input = document.getElementById("license-key-input");
  const errorEl = document.getElementById("license-error");
  const accept = document.getElementById("license-accept");

  function open() {
    renderLicenseModalContent.changing = false;
    renderLicenseModalContent();
    errorEl.hidden = true;
    input.value = "";
    backdrop.hidden = false;
  }
  function close() { backdrop.hidden = true; }

  btn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) close(); });

  document.getElementById("license-copy-code").addEventListener("click", async (e) => {
    const code = window.ShipHelperLicense.deviceCode();
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (err) {
      const ta = document.createElement("textarea"); ta.value = code; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) {} ta.remove();
    }
    const b = e.currentTarget, prev = b.textContent;
    b.textContent = ok ? t("app.license.copied", currentLang) : code;
    setTimeout(() => { b.textContent = t("app.license.copy_btn", currentLang); }, 1800);
  });

  const activateBtn = document.getElementById("license-activate-btn");
  async function tryActivate() {
    const raw = input.value.trim();
    errorEl.hidden = true;
    if (!raw) return;
    if (!accept.checked) { errorEl.textContent = t("app.license.err.accept", currentLang); errorEl.hidden = false; return; }
    setBtnBusy(activateBtn, true);
    try {
      const res = await window.ShipHelperLicense.activate(raw);
      if (res.ok) {
        renderLicenseModalContent.changing = false;
        input.value = "";
        renderLicenseModalContent();
      } else {
        errorEl.textContent = t("app.license.err." + res.state, currentLang, {
          code: window.ShipHelperLicense.deviceCode(), date: fmtDate(res.expiry), devices: licenseDevicesText(res).replace(/\n/g, "; "),
        });
        errorEl.hidden = false;
      }
    } catch (err) {
      console.error(err);
      errorEl.textContent = t("app.license.err.invalid", currentLang);
      errorEl.hidden = false;
    } finally {
      setBtnBusy(activateBtn, false);
    }
  }
  activateBtn.addEventListener("click", tryActivate);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tryActivate(); } });

  document.getElementById("license-change-btn").addEventListener("click", () => {
    renderLicenseModalContent.changing = true;
    renderLicenseModalContent();
    input.focus();
  });
  document.getElementById("license-deactivate-btn").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (!b.classList.contains("armed")) {
      b.classList.add("armed"); b.textContent = t("app.license.deactivate_confirm", currentLang);
      setTimeout(() => { b.classList.remove("armed"); b.textContent = t("app.license.deactivate_btn", currentLang); }, 4000);
      return;
    }
    b.classList.remove("armed"); b.textContent = t("app.license.deactivate_btn", currentLang);
    window.ShipHelperLicense.deactivate();
    renderLicenseModalContent();
  });

  document.addEventListener("shiphelper:langchange", () => {
    renderLicenseSidebarBadge();
    if (!backdrop.hidden) renderLicenseModalContent();
  });
  document.addEventListener("shiphelper:licensechange", () => {
    renderLicenseSidebarBadge();
    if (!backdrop.hidden) renderLicenseModalContent();
  });
  renderLicenseSidebarBadge();
}

function setupThemeToggle() {
  // Тёмная тема — по умолчанию (обоснование — ночное зрение на
  // мостике, см. theme.css), но пользователь явно попросил светлую
  // тему для дневного времени. Выбор запоминается на этом устройстве
  // через localStorage — если недоступен (приватный режим и т.п.),
  // просто не переживает перезагрузку страницы, без ошибки.
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (e) {
    // тихо игнорируем — localStorage может быть недоступен
  }
  applyTheme(saved === "light" ? "light" : "dark");

  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {
      // тихо игнорируем
    }
  });
}

/**
 * Заполняет ПУСТЫЕ поля <input type="date"/"time"> текущей датой/временем
 * при загрузке страницы. Без этого пользователь при первом обращении к
 * любому калькулятору с датой (ETA, требуемая скорость, ETA по маршруту
 * из нескольких точек) видел пустое поле, а нажатие "Рассчитать" без
 * заполнения даты приводило к нечитаемой общей ошибке "Ошибка расчёта.
 * Попробуйте ещё раз" (пустая строка даты -> Invalid Date -> исключение
 * в Python) — баг найден при глобальной проверке 2026-09-30 (см.
 * CLAUDE.md), воспроизводился одинаково в V/T/S/ETA (режим ETA и
 * "Требуемая скорость") и в "ETA по маршруту". Не трогает поля, где
 * пользователь уже что-то ввёл/оставил свою дату.
 */
function setupDefaultDateTimeFields() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  document.querySelectorAll('input[type="date"]').forEach((el) => {
    if (!el.value) el.value = todayStr;
  });
  document.querySelectorAll('input[type="time"]').forEach((el) => {
    if (!el.value) el.value = timeStr;
  });
}

function registerServiceWorker() {
  // В Android-сборке все файлы и так лежат внутри APK — service worker не нужен
  if (window.AzimuthNative) return;
  // В версии для Windows (WebView2) файлы тоже лежат рядом с программой
  if (window.AzimuthDesktop || (window.chrome && window.chrome.webview)) return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      // Не критично для работы приложения при первой загрузке — просто
      // не будет офлайн-кеша в этой сессии браузера.
      console.warn("Service worker не зарегистрирован:", err);
    });
  }
}

async function boot() {
  setupDirectionSwitch();
  setupVariationExpander();
  setupStepsToggle();
  setupLangSwitch();
  setupThemeToggle();
  setupCalcPicker();
  setupSidebarNav();
  setupAboutModal();
  setupDesktopWindow();
  setupLicenseModal();
  setupDefaultDateTimeFields();
  document.getElementById("calc-btn").addEventListener("click", handleCalculate);
  registerServiceWorker();

  await preloadI18n();
  applyStrings();
  // Бейдж статуса лицензии (#license-status-badge) заполняется через
  // textContent напрямую в renderLicenseSidebarBadge(), а не через
  // data-i18n — applyStrings() его не трогает. Первый вызов этой функции
  // (в setupLicenseModal() выше) происходит ДО того, как preloadI18n()
  // успевает загрузить строки, поэтому показывает "[[key]]" до этого
  // момента — тот же класс бага, что уже ловился на драфт-сюрвее
  // (t() вызван раньше, чем готовы строки). Перерисовываем здесь же,
  // сразу после того как строки точно готовы.
  renderLicenseSidebarBadge();

  try {
    await initPyodide(setLoadingText);
    // Заставка (js/splash.js) доигрывает до минимальной длительности, потом плавно уходит
    if (window.AzimuthSplash) await window.AzimuthSplash.wait();
    document.getElementById("loading-screen").classList.add("hidden");
    // Расчётный модуль готов — калькуляторы повторяют расчёты прошлого сеанса
    window.__azReady = true;
    document.dispatchEvent(new Event("shiphelper:ready"));
  } catch (err) {
    // Без этого блока сбой загрузки Pyodide (нет сети, недоступен CDN)
    // оставлял загрузочный экран навсегда — он перехватывает клики
    // (pointer-events), так что приложение выглядело "зависшим" без
    // единого объяснения. Найдено при проверке в песочнице, где CDN
    // jsdelivr.net заблокирован политикой сети — на ПК пользователя
    // сеть обычно есть, но обрыв связи или блокировка провайдером тоже
    // должны показывать понятную ошибку, а не тишину.
    console.error("Не удалось инициализировать Pyodide:", err);
    setLoadingText(t("app.load_error", currentLang));
    document.getElementById("loading-screen").classList.add("is-error");
  }
}

boot();
