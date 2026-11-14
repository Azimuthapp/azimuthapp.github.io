/*
 * home.js — главная страница приложения (группа data-group="home"),
 * показывается при каждом открытии. Плитки разделов, быстрый доступ,
 * «Продолжить» (последний открытый расчёт), правило МППСС дня, сводка
 * журналов, часы UTC/судовое время.
 *
 * Переход в раздел/калькулятор делается обычными кликами по уже
 * существующим кнопкам сайдбара и палитры — вся логика переключения
 * остаётся в app.js, здесь ничего не дублируется.
 */
(function () {
  "use strict";
  const LAST_KEY = "shiphelper-last-calc";
  const GROUPS = ["navigation", "tools", "maneuvering", "cargo", "theory"];
  const QUICK = [
    ["navigation", "compass"], ["navigation", "cpa"], ["navigation", "std"], ["navigation", "sailing"],
    ["maneuvering", "ukc"], ["maneuvering", "squat"], ["cargo", "draft"], ["cargo", "stability"],
    ["tools", "unit-converter"], ["tools", "notices-log"],
  ];

  const lang = () => document.documentElement.lang || "ru";
  const T = (k, p) => window.ShipHelperI18n.t(k, lang(), p);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function calcButton(group, calc) {
    return document.querySelector(`.group-content[data-group="${group}"] .calc-switcher button[data-calc="${calc}"]`);
  }
  function openGroup(group) {
    const b = document.querySelector(`.sidebar-nav button[data-group="${group}"]`);
    if (b) b.click();
  }
  function openCalc(group, calc) {
    openGroup(group);
    const b = calcButton(group, calc);
    if (b) b.click();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  window.ShipHelperHome = { openGroup, openCalc };

  // Запоминаем последний открытый калькулятор — для кнопки «Продолжить»
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".calc-switcher button[data-calc]");
    if (!b) return;
    const g = b.closest(".group-content");
    if (!g || g.dataset.group === "home") return;
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ group: g.dataset.group, calc: b.dataset.calc })); } catch (err) { /* без памяти */ }
  }, true);
  function lastCalc() {
    try {
      const v = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
      if (v && calcButton(v.group, v.calc)) return v;
    } catch (err) { /* нет данных */ }
    return { group: "navigation", calc: "compass" };
  }

  /* ----------------------------- рисование ----------------------------- */
  function drawRoseTicks() {
    const g = $("home-rose-ticks");
    if (!g || g.childNodes.length) return;
    let html = "";
    for (let i = 0; i < 72; i++) {
      const a = (i * 5) * Math.PI / 180, long = i % 9 === 0, mid = i % 3 === 0;
      const r1 = 92, r2 = long ? 80 : mid ? 85 : 88;
      html += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * r2).toFixed(2)}" y2="${(-Math.cos(a) * r2).toFixed(2)}" stroke="currentColor" stroke-width="${long ? 1 : 0.5}" opacity=".6"/>`;
    }
    g.innerHTML = html;
  }

  function renderTiles() {
    const wrap = $("home-tiles");
    if (!wrap) return;
    wrap.innerHTML = GROUPS.map((g) => {
      const icon = document.querySelector(`.sidebar-nav button[data-group="${g}"] .nav-icon`);
      const n = g === "theory"
        ? document.querySelectorAll("#theory-topic-select option").length || 9
        : document.querySelectorAll(`.group-content[data-group="${g}"] .calc-switcher button`).length;
      const count = T(g === "theory" ? "home.count_topics" : "home.count_calcs", { n });
      return `<button type="button" class="home-tile" data-home-open="${g}">
        <span class="home-tile-icon">${icon ? icon.innerHTML : ""}</span>
        <span class="home-tile-title">${esc(T(`app.groups.${g}`))}</span>
        <span class="home-tile-desc">${esc(T(`home.desc.${g}`))}</span>
        <span class="home-tile-count">${esc(count)}</span>
      </button>`;
    }).join("");
  }

  function renderQuick() {
    const wrap = $("home-quick");
    if (!wrap) return;
    const trainer = window.ShipHelperTrainer ? `<button type="button" class="home-chip home-chip-accent" data-home-trainer="1">${esc(T("trainer.mode_trainer"))}</button>` : "";
    wrap.innerHTML = trainer + QUICK.filter(([g, c]) => calcButton(g, c)).map(([g, c]) =>
      `<button type="button" class="home-chip" data-home-calc="${g}/${c}">${esc(calcButton(g, c).textContent.trim())}</button>`).join("");
  }

  function renderContinue() {
    const v = lastCalc();
    const b = calcButton(v.group, v.calc);
    const el = $("home-continue-name");
    if (el) el.textContent = b ? b.textContent.trim() : "";
  }

  function renderLogs() {
    let drills = 0, notices = 0, year = String(new Date().getFullYear());
    try {
      const d = JSON.parse(localStorage.getItem("shiphelper-drill-log") || "null");
      if (Array.isArray(d)) drills = d.filter((r) => r && r.name).length;
    } catch (err) { /* нет данных */ }
    try {
      const n = JSON.parse(localStorage.getItem("shiphelper-notices-log") || "null");
      if (n && n.years) { year = n.current || year; notices = ((n.years[year] || {}).entries || []).length; }
    } catch (err) { /* нет данных */ }
    if ($("home-drill-meta")) $("home-drill-meta").textContent = drills ? T("home.drills_meta", { n: drills }) : T("home.log_empty");
    if ($("home-notices-meta")) $("home-notices-meta").textContent = notices ? T("home.notices_meta", { n: notices, year }) : T("home.log_empty");
  }

  // Правило МППСС дня — из официального текста темы (тот же JSON, что у теории)
  let rule = null;
  async function renderRule() {
    const titleEl = $("home-rule-title"), textEl = $("home-rule-text");
    if (!titleEl) return;
    try {
      const l = lang();
      const r = await fetch(`../data/theory/colregs.${l}.json`, { cache: "no-cache" });
      const data = await r.json();
      const entries = Array.isArray(data) ? data : data.entries;
      const rules = entries.map((e, i) => ({ e, i })).filter(({ e }) => /^(Правило|Rule)\s/.test(e.number) && e.official && e.official.length);
      const now = new Date();
      const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
      const pick = rules[day % rules.length];
      rule = { index: pick.i };
      titleEl.textContent = `${pick.e.number}. ${pick.e.title}`;
      let text = pick.e.official.map((p) => (p.label ? `${p.label} ` : "") + p.text).join(" ");
      if (text.length > 280) text = text.slice(0, 280).replace(/\s+\S*$/, "") + "…";
      textEl.textContent = text;
    } catch (err) {
      titleEl.textContent = "";
      textEl.textContent = "";
    }
  }
  function openRule() {
    if (!rule) return;
    openGroup("theory");
    const sel = $("theory-topic-select");
    if (sel && sel.value !== "colregs") { sel.value = "colregs"; sel.dispatchEvent(new Event("change")); }
    const id = `th-colregs-${rule.index}`;
    let tries = 0;
    (function wait() {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (++tries < 40) setTimeout(wait, 100);
    })();
  }

  function tickClock() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    if (!$("home-utc")) return;
    $("home-utc").textContent = `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`;
    $("home-local").textContent = `${p(now.getHours())}:${p(now.getMinutes())}`;
    const off = -now.getTimezoneOffset() / 60;
    const zone = `UTC${off >= 0 ? "+" : "−"}${Math.abs(off)}`;
    const ds = now.toLocaleDateString(lang() === "ru" ? "ru-RU" : "en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    $("home-date").textContent = `${ds.charAt(0).toUpperCase()}${ds.slice(1)} · ${zone}`;
  }

  function renderFoot() {
    const off = $("home-offline");
    if (off) {
      const ready = !!window.AzimuthNative || ("serviceWorker" in navigator && navigator.serviceWorker.controller);
      off.textContent = T(ready ? "home.offline_ready" : "home.offline_first");
      off.classList.toggle("ok", !!ready);
    }
    const v = $("home-version");
    if (v) v.textContent = window.ShipHelperAppVersion ? `Azimuth v${window.ShipHelperAppVersion}` : "";
  }

  function renderAll() {
    drawRoseTicks();
    renderTiles();
    renderQuick();
    renderContinue();
    renderLogs();
    renderRule();
    renderFoot();
    tickClock();
  }

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-home-open]");
    if (open) { openGroup(open.dataset.homeOpen); window.scrollTo({ top: 0, behavior: "instant" }); return; }
    const calc = e.target.closest("[data-home-calc]");
    if (calc) { const [g, c] = calc.dataset.homeCalc.split("/"); openCalc(g, c); return; }
    if (e.target.closest("#home-continue")) { const v = lastCalc(); openCalc(v.group, v.calc); return; }
    if (e.target.closest("#home-rule-open")) openRule();
    if (e.target.closest("[data-home-trainer]")) { openGroup("theory"); window.ShipHelperTrainer.open(); }
  });

  // Возврат на главную — обновить «Продолжить» и сводку журналов
  document.addEventListener("click", (e) => {
    const b = e.target.closest('.sidebar-nav button[data-group="home"]');
    if (b) setTimeout(() => { renderContinue(); renderLogs(); renderFoot(); }, 0);
  });

  function start() {
    window.ShipHelperI18n.preloadI18n().then(() => {
      // applyStrings() в app.js переводит кнопки палитры — ждём один кадр
      requestAnimationFrame(renderAll);
    });
    document.addEventListener("shiphelper:langchange", () => requestAnimationFrame(renderAll));
    setInterval(tickClock, 15000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", renderFoot);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else setTimeout(start, 0);
})();
