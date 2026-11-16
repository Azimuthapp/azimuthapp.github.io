/*
 * «Моё судно» (с 1.7.0) — данные своего судна, которые калькуляторы
 * подставляют одной кнопкой «Из «Моё судно»».
 *
 * Хранение: localStorage "shiphelper-ship-profiles" = {v:1, active, ships:[...]}
 * (durable-store.js дублирует ключи shiphelper-* в файл в программах для
 * Windows/Android). Расчёты по профилю — core/ship_profile.py через Pyodide:
 * profile_derived (средняя осадка, Δ/KM/GM по таблице, высоты над водой, FWA),
 * survey_hydrostatics (гидростатика для драфт-сюрвея).
 *
 * Высоты в профиле — НАД КИЛЕМ (не зависят от загрузки), над водой —
 * пересчитываются по текущей осадке.
 */
(function () {
  const KEY = "shiphelper-ship-profiles";
  const { t } = window.ShipHelperI18n;
  const { callCore } = window.ShipHelperPy;
  const lang = () => document.documentElement.lang || "ru";
  const T = (k, p) => t(k, lang(), p);
  const $ = (id) => document.getElementById(id);

  const SECTIONS = [
    { key: "general", fields: [["name", "text"], ["imo", "text"], ["ship_type", "text"]] },
    { key: "dims", fields: [["loa", 0.01], ["lbp", 0.01], ["lwl", 0.01], ["breadth", 0.01], ["cb", 0.001], ["summer_draft", 0.01]] },
    { key: "weights", fields: [["lightship", 1], ["summer_displacement", 1], ["summer_tpc", 0.01]] },
    { key: "marks", fields: [["mark_method", "method"], ["dist_fwd", 0.01], ["dist_mid", 0.01], ["dist_aft", 0.01], ["table_step", 0.01]] },
    { key: "heights", fields: [["eye_height_keel", 0.01], ["bow_height_keel", 0.01], ["bridge_to_bow", 0.1], ["mast_height_keel", 0.01]] },
    { key: "maneuver", fields: [["service_speed", 0.1], ["turn_radius_nm", 0.01], ["reaction_time_s", 1]] },
    { key: "current", fields: [["draft_fwd", 0.01], ["draft_aft", 0.01], ["kg", 0.01], ["density", 0.001]] },
  ];

  const HYDRO_COLS = [
    { field: "draft", type: "number", step: "0.01" }, { field: "displacement", type: "number", step: "1" },
    { field: "tpc", type: "number", step: "0.01" }, { field: "mtc", type: "number", step: "0.1" },
    { field: "lcf", type: "number", step: "0.01" }, { field: "km", type: "number", step: "0.01" },
  ];
  const BALLAST_COLS = [
    { field: "name", type: "text" },
    { field: "trim_correction_rate_m3_per_m", type: "number", step: "0.01" },
    { field: "list_correction_rate_m3_per_deg", type: "number", step: "0.01" },
    { field: "density_t_m3", type: "number", step: "0.001" },
  ];
  const TANK_COLS = [{ field: "level", type: "number", step: "0.1" }, { field: "volume", type: "number", step: "0.01" }];

  // Учебный пример (порядок величин — небольшой сухогруз ~140 м)
  const EXAMPLE = {
    name: "Учебное судно", imo: "", ship_type: "General cargo",
    loa: 140.0, lbp: 137.08, lwl: 138.5, breadth: 16.6, cb: 0.82, summer_draft: 4.6,
    lightship: 2649, summer_displacement: 10770, summer_tpc: 24.2,
    mark_method: "6_8", dist_fwd: -2.5, dist_mid: 1.66, dist_aft: 3.2, table_step: 0.01,
    eye_height_keel: 19.5, bow_height_keel: 9.8, bridge_to_bow: 118, mast_height_keel: 30.2,
    service_speed: 10.5, turn_radius_nm: 0.25, reaction_time_s: 20,
    draft_fwd: 3.4, draft_aft: 3.8, kg: 6.9, density: 1.025,
    hydro: [
      { draft: 0.5, displacement: 1290, tpc: 21.6, mtc: 208, lcf: 1.6, km: 22.0 },
      { draft: 1.0, displacement: 2400, tpc: 22.0, mtc: 215, lcf: 1.2, km: 14.9 },
      { draft: 2.0, displacement: 4630, tpc: 22.8, mtc: 232, lcf: 0.4, km: 10.6 },
      { draft: 3.0, displacement: 6960, tpc: 23.4, mtc: 252, lcf: -1.6, km: 8.9 },
      { draft: 4.0, displacement: 9330, tpc: 23.9, mtc: 278, lcf: -3.5, km: 8.2 },
      { draft: 5.0, displacement: 11760, tpc: 24.4, mtc: 300, lcf: -4.6, km: 8.1 },
    ],
    ballast_tanks: [
      { name: "FPT", trim_correction_rate_m3_per_m: -1.2, list_correction_rate_m3_per_deg: 0, density_t_m3: 1.025 },
      { name: "DB 1 P", trim_correction_rate_m3_per_m: -0.6, list_correction_rate_m3_per_deg: 0.4, density_t_m3: 1.025 },
      { name: "DB 1 S", trim_correction_rate_m3_per_m: -0.6, list_correction_rate_m3_per_deg: -0.4, density_t_m3: 1.025 },
      { name: "APT", trim_correction_rate_m3_per_m: 0.9, list_correction_rate_m3_per_deg: 0, density_t_m3: 1.025 },
    ],
    tanks: [
      { name: "HFO 1 P", depth: 0, rows: [{ level: 0, volume: 0 }, { level: 50, volume: 10 }, { level: 100, volume: 25 }, { level: 150, volume: 42 }] },
    ],
  };

  /* ---------------- хранение ---------------- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && Array.isArray(d.ships)) return d;
    } catch (e) { /* пусто */ }
    return { v: 1, active: null, ships: [] };
  }
  let store = load();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* приватный режим */ }
      if (window.AzimuthStore && typeof window.AzimuthStore.flush === "function") window.AzimuthStore.flush();
    }, 200);
  }
  const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function active() {
    return store.ships.find((s) => s.id === store.active) || store.ships[0] || null;
  }
  function ensureShip() {
    let s = active();
    if (!s) {
      s = { id: newId(), name: "", mark_method: "6_8", table_step: 0.01, density: 1.025, hydro: [], ballast_tanks: [], tanks: [] };
      store.ships.push(s);
      store.active = s.id;
    }
    return s;
  }
  function shipName(s) { return (s && s.name && s.name.trim()) || T("ship.unnamed"); }

  /* ---------------- форма ---------------- */
  let currentTank = 0;
  let derived = null;

  function fieldHtml(sec, [f, kind]) {
    const label = `<label data-i18n="ship.f.${f}">${T(`ship.f.${f}`)}</label>`;
    if (kind === "method") {
      return `<div class="field">${label}<select data-ship="${f}">
        <option value="direct" data-i18n="calc.draft.method.direct">${T("calc.draft.method.direct")}</option>
        <option value="4_6" data-i18n="calc.draft.method.4_6">${T("calc.draft.method.4_6")}</option>
        <option value="6_8" data-i18n="calc.draft.method.6_8">${T("calc.draft.method.6_8")}</option></select></div>`;
    }
    if (kind === "text") return `<div class="field">${label}<input type="text" data-ship="${f}"></div>`;
    return `<div class="field">${label}<input type="number" step="${kind}" data-ship="${f}"></div>`;
  }

  function colLabels(keys) {
    return `<div class="dyn-table-row dyn-table-col-labels dyn-table-row-${keys.length}">` +
      keys.map((k) => `<span data-i18n="${k}">${T(k)}</span>`).join("") + "<span></span></div>";
  }

  function buildForm() {
    const form = $("ship-form");
    if (!form) return;
    let html = "";
    for (const sec of SECTIONS) {
      html += `<details class="ship-section" ${sec.key === "general" || sec.key === "current" ? "open" : ""}>
        <summary data-i18n="ship.sec.${sec.key}">${T(`ship.sec.${sec.key}`)}</summary>
        <p class="section-caption" data-i18n="ship.sec.${sec.key}_hint">${T(`ship.sec.${sec.key}_hint`)}</p>
        <div class="field-grid">${sec.fields.map((f) => fieldHtml(sec, f)).join("")}</div></details>`;
    }
    html += `<details class="ship-section"><summary data-i18n="ship.sec.hydro">${T("ship.sec.hydro")}</summary>
      <p class="section-caption" data-i18n="ship.sec.hydro_hint">${T("ship.sec.hydro_hint")}</p>
      ${colLabels(["ship.col.draft", "ship.col.displacement", "ship.col.tpc", "ship.col.mtc", "ship.col.lcf", "ship.col.km"])}
      <div class="dyn-table" id="ship-hydro"></div></details>`;
    html += `<details class="ship-section"><summary data-i18n="ship.sec.ballast">${T("ship.sec.ballast")}</summary>
      <p class="section-caption" data-i18n="ship.sec.ballast_hint">${T("ship.sec.ballast_hint")}</p>
      ${colLabels(["ship.col.tank", "ship.col.trim_rate", "ship.col.list_rate", "ship.col.density"])}
      <div class="dyn-table" id="ship-ballast"></div></details>`;
    html += `<details class="ship-section"><summary data-i18n="ship.sec.tanks">${T("ship.sec.tanks")}</summary>
      <p class="section-caption" data-i18n="ship.sec.tanks_hint">${T("ship.sec.tanks_hint")}</p>
      <div class="ship-toolbar"><select id="ship-tank-select"></select>
        <button type="button" class="btn-secondary" id="ship-tank-add" data-i18n="ship.tank_add">+ Танк</button>
        <button type="button" class="btn-secondary ship-delete" id="ship-tank-del" data-i18n="ship.tank_del">Удалить танк</button></div>
      <div class="field-grid" id="ship-tank-fields">
        <div class="field"><label data-i18n="ship.f.tank_name">${T("ship.f.tank_name")}</label><input type="text" id="ship-tank-name"></div>
        <div class="field"><label data-i18n="ship.f.tank_depth">${T("ship.f.tank_depth")}</label><input type="number" step="0.1" id="ship-tank-depth"></div>
      </div>
      <div class="dyn-table-row dyn-table-col-labels" id="ship-tank-labels"><span data-i18n="ship.col.level">${T("ship.col.level")}</span><span data-i18n="ship.col.volume">${T("ship.col.volume")}</span><span></span></div>
      <div class="dyn-table" id="ship-tank-table"></div></details>`;
    form.innerHTML = html;

    form.addEventListener("input", onFormInput);
    form.addEventListener("change", onFormInput);
    ["ship-hydro", "ship-ballast", "ship-tank-table"].forEach((id) => $(id).addEventListener("dyntablechange", onFormInput));
    $("ship-tank-select").addEventListener("change", (e) => { currentTank = +e.target.value; renderTank(); });
    $("ship-tank-add").addEventListener("click", () => {
      const s = ensureShip();
      s.tanks = s.tanks || [];
      s.tanks.push({ name: `${T("ship.tank_default")} ${s.tanks.length + 1}`, depth: 0, rows: [{ level: 0, volume: 0 }, { level: 0, volume: 0 }] });
      currentTank = s.tanks.length - 1;
      save(); renderTank();
    });
    armDouble($("ship-tank-del"), () => {
      const s = active();
      if (!s || !s.tanks || !s.tanks.length) return;
      s.tanks.splice(currentTank, 1);
      currentTank = Math.max(0, currentTank - 1);
      save(); renderTank();
    });
  }

  /** Кнопка удаления: первое нажатие — «Точно? Нажмите ещё раз», второе — действие. */
  function armDouble(btn, action) {
    btn.addEventListener("click", () => {
      if (!btn.dataset.sure) {
        btn.dataset.sure = "1";
        btn.dataset.label = btn.textContent;
        btn.textContent = T("ship.sure");
        setTimeout(() => { if (btn.dataset.sure) { delete btn.dataset.sure; btn.textContent = btn.dataset.label; } }, 3500);
        return;
      }
      delete btn.dataset.sure;
      btn.textContent = btn.dataset.label;
      action();
    });
  }

  let filling = false;
  function fillForm() {
    const s = active();
    filling = true;
    document.querySelectorAll("#ship-form [data-ship]").forEach((el) => {
      const v = s ? s[el.dataset.ship] : undefined;
      el.value = v === undefined || v === null ? (el.tagName === "SELECT" ? "6_8" : "") : v;
    });
    const D = window.ShipHelperDyn;
    D.create($("ship-hydro"), HYDRO_COLS, s && s.hydro && s.hydro.length ? s.hydro : [{}, {}]);
    D.create($("ship-ballast"), BALLAST_COLS, s && s.ballast_tanks && s.ballast_tanks.length ? s.ballast_tanks : [{ density_t_m3: 1.025 }]);
    currentTank = 0;
    renderTank();
    filling = false;
    renderSelect();
    refreshDerived();
  }

  function renderTank() {
    const s = active();
    const tanks = (s && s.tanks) || [];
    const sel = $("ship-tank-select");
    sel.innerHTML = tanks.length
      ? tanks.map((tk, i) => `<option value="${i}" ${i === currentTank ? "selected" : ""}>${escapeHtml(tk.name || "—")}</option>`).join("")
      : `<option value="-1">${escapeHtml(T("ship.no_tanks"))}</option>`;
    const has = tanks.length > 0;
    $("ship-tank-fields").hidden = !has;
    $("ship-tank-table").hidden = !has;
    $("ship-tank-labels").hidden = !has;
    $("ship-tank-del").hidden = !has;
    if (has) {
      const tk = tanks[currentTank];
      filling = true;
      $("ship-tank-name").value = tk.name || "";
      $("ship-tank-depth").value = tk.depth || "";
      window.ShipHelperDyn.create($("ship-tank-table"), TANK_COLS, tk.rows && tk.rows.length ? tk.rows : [{}, {}]);
      filling = false;
    }
  }

  function onFormInput(e) {
    if (filling) return;
    const s = ensureShip();
    document.querySelectorAll("#ship-form [data-ship]").forEach((el) => {
      const f = el.dataset.ship;
      if (el.type === "number") s[f] = el.value === "" ? null : parseFloat(el.value);
      else s[f] = el.value;
    });
    const D = window.ShipHelperDyn;
    s.hydro = D.read($("ship-hydro"), HYDRO_COLS).filter((r) => r.draft > 0);
    s.ballast_tanks = D.read($("ship-ballast"), BALLAST_COLS).filter((r) => (r.name || "").trim());
    if (s.tanks && s.tanks.length && !$("ship-tank-table").hidden) {
      const tk = s.tanks[currentTank];
      tk.name = $("ship-tank-name").value;
      tk.depth = parseFloat($("ship-tank-depth").value) || 0;
      tk.rows = D.read($("ship-tank-table"), TANK_COLS);
      if (e && e.target && e.target.id === "ship-tank-name") {
        const opt = $("ship-tank-select").options[currentTank];
        if (opt) opt.textContent = tk.name || "—";
      }
    }
    save();
    if (e && e.target && e.target.dataset && e.target.dataset.ship === "name") renderSelect();
    clearTimeout(onFormInput._d);
    onFormInput._d = setTimeout(refreshDerived, 350);
  }

  function renderSelect() {
    const sel = $("ship-select");
    if (!sel) return;
    const cur = active();
    sel.innerHTML = store.ships.length
      ? store.ships.map((s) => `<option value="${s.id}" ${cur && s.id === cur.id ? "selected" : ""}>${escapeHtml(shipName(s))}</option>`).join("")
      : `<option value="">${escapeHtml(T("ship.unnamed"))}</option>`;
    $("ship-delete-btn").hidden = store.ships.length === 0;
  }

  function escapeHtml(x) {
    return String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ---------------- производные величины ---------------- */
  const fmt = (v, d) => (v === null || v === undefined || !isFinite(v) ? null : Number(v).toFixed(d));

  async function computeDerived(s) {
    if (!s) return null;
    try {
      return await callCore("core.ship_profile", "profile_derived", [s]);
    } catch (e) {
      return null;
    }
  }

  async function refreshDerived() {
    const box = $("ship-summary");
    if (!box) return;
    derived = await computeDerived(active());
    const d = derived || {};
    const items = [
      ["mean_draft", fmt(d.mean_draft, 2), "м"], ["trim", fmt(d.trim, 2), "м"],
      ["displacement", fmt(d.displacement, 0), "т"], ["km", fmt(d.km, 2), "м"], ["gm", fmt(d.gm, 2), "м"],
      ["eye_above_wl", fmt(d.eye_above_wl, 1), "м"], ["air_draft", fmt(d.air_draft, 2), "м"],
      ["fwa", d.fwa ? (d.fwa * 1000).toFixed(0) : null, "мм"],
    ].filter((x) => x[1] !== null);
    const uu = (x) => (lang() === "en" && window.ShipHelperStepsEN ? window.ShipHelperStepsEN.translateText(x) : x);
    box.innerHTML = items.length
      ? `<div class="ship-summary-title" data-i18n="ship.summary_title">${T("ship.summary_title")}</div><div class="ship-chips">` +
        items.map(([k, v, un]) => `<div class="ship-chip"><span>${escapeHtml(T(`ship.d.${k}`))}</span><b>${v} ${uu(un)}</b></div>`).join("") + "</div>" +
        ((d.warnings || []).length ? `<p class="section-caption warning-text">${d.warnings.map((w) => escapeHtml(T(w))).join(" ")}</p>` : "")
      : `<p class="section-caption">${escapeHtml(T("ship.summary_empty"))}</p>`;
  }

  /* ---------------- кнопки страницы ---------------- */
  function setupPage() {
    if (!$("ship-page")) return;
    buildForm();
    $("ship-select").addEventListener("change", (e) => {
      store.active = e.target.value;
      save(); fillForm(); refreshBars();
    });
    $("ship-new-btn").addEventListener("click", () => {
      const s = { id: newId(), name: "", mark_method: "6_8", table_step: 0.01, density: 1.025, hydro: [], ballast_tanks: [], tanks: [] };
      store.ships.push(s);
      store.active = s.id;
      save(); fillForm(); refreshBars();
      const nameInput = document.querySelector('#ship-form [data-ship="name"]');
      if (nameInput) nameInput.focus();
    });
    armDouble($("ship-delete-btn"), () => {
      const cur = active();
      if (!cur) return;
      store.ships = store.ships.filter((s) => s.id !== cur.id);
      store.active = store.ships[0] ? store.ships[0].id : null;
      save(); fillForm(); refreshBars();
    });
    $("ship-export-btn").addEventListener("click", () => {
      const s = active();
      if (!s) return status(T("ship.nothing_to_export"));
      const data = { app: "AZIMUTH", kind: "ship-profile", v: 1, saved: new Date().toISOString(), ship: { ...s, id: undefined } };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const safe = shipName(s).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "ship";
      window.ShipHelperDocx.download(blob, `AZIMUTH-${safe}.json`);
      status(T("ship.exported"));
    });
    $("ship-import-btn").addEventListener("click", () => $("ship-import-file").click());
    $("ship-import-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const ship = data && data.kind === "ship-profile" ? data.ship : null;
          if (!ship || typeof ship !== "object") throw new Error("bad");
          ship.id = newId();
          store.ships.push(ship);
          store.active = ship.id;
          save(); fillForm(); refreshBars();
          status(T("ship.imported", { name: shipName(ship) }));
        } catch (err) {
          status(T("ship.import_error"), true);
        }
      };
      reader.readAsText(f);
    });
    const ex = document.createElement("button");
    ex.type = "button";
    ex.className = "btn-secondary";
    ex.id = "ship-example-btn";
    ex.dataset.i18n = "ship.example_btn";
    ex.textContent = T("ship.example_btn");
    $("ship-import-btn").after(ex);
    ex.addEventListener("click", () => {
      const s = JSON.parse(JSON.stringify(EXAMPLE));
      s.id = newId();
      if (lang() === "en") s.name = "Training ship";
      store.ships.push(s);
      store.active = s.id;
      save(); fillForm(); refreshBars();
      status(T("ship.example_added"));
    });
    fillForm();
    document.addEventListener("shiphelper:langchange", () => { renderSelect(); refreshDerived(); renderTank(); });
    document.addEventListener("shiphelper:ready", refreshDerived);
  }

  function status(msg, bad) {
    const el = $("ship-status");
    el.textContent = msg;
    el.classList.toggle("warning-text", !!bad);
    clearTimeout(status._t);
    status._t = setTimeout(() => { el.textContent = T("ship.autosave"); el.classList.remove("warning-text"); }, 4000);
  }

  /* ---------------- подстановка в калькуляторы ---------------- */
  const r3 = (v) => (v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 1000) / 1000);

  // calcId → (ship, derived) → { полеId: значение, "@table": {id: rows}, "@tank": true }
  const MAP = {
    ukc: (s, d) => ({ "ukc-static-draft": d.max_draft, "ukc-beam": s.breadth, "ukc-block-coefficient": s.cb, "ukc-speed": s.service_speed }),
    squat: (s) => ({ "squat-cb": s.cb, "squat-speed": s.service_speed }),
    "roll-gm": (s, d) => ({ "rg-beam": s.breadth, "rg-length": s.lwl || s.lbp, "rg-draft": d.mean_draft }),
    "blind-distance": (s, d) => ({ "bd-eye-height": d.eye_above_wl, "bd-obstruction-height": d.bow_above_wl, "bd-distance": s.bridge_to_bow }),
    sextant: (s, d) => ({ "sx-height": d.eye_above_wl }),
    astro: (s, d) => ({ "astro-eye": d.eye_above_wl }),
    draft: (s) => ({ "ds-vessel-name": s.name, "ds-method": s.mark_method, "ds-lbp": s.lbp, "ds-dist-fwd": s.dist_fwd,
      "ds-dist-mid": s.dist_mid, "ds-dist-aft": s.dist_aft, "ds-lightship": s.lightship, "ds-table-step": s.table_step }),
    "opposite-draft": (s) => ({ "od-method": s.mark_method, "od-lbp": s.lbp, "od-dist-fwd": s.dist_fwd, "od-dist-mid": s.dist_mid, "od-dist-aft": s.dist_aft }),
    "trim-density": (s, d) => ({ "td-lbp": s.lbp, "td-displacement": d.displacement, "td-trim": d.trim, "td-lcf": d.lcf, "td-tpc": d.tpc, "td-density": s.density }),
    stability: (s, d) => ({ "st-displacement": d.displacement, "st-km": d.km, "st-kg": s.kg }),
    fwa: (s) => ({ "fwa-displacement": s.summer_displacement, "fwa-tpc": s.summer_tpc }),
    "suspended-load": (s, d) => ({ "sl-displacement": d.displacement, "sl-gm": d.gm }),
    "deadweight-scale": (s, d) => ({ "dws-draft": d.mean_draft,
      "@table": { "dws-table": (s.hydro || []).map((r) => ({ draft: r.draft, displacement: r.displacement, tpc: r.tpc, mtc: r.mtc })) } }),
    "ballast-sounding": (s, d) => ({ "bs-trim": d.trim,
      "@table": { "bs-table": (s.ballast_tanks || []).map((r) => ({ ...r, volume_observed_m3: "" })) } }),
    bunker: () => ({ "@tank": "bunker-table" }),
    ullage: () => ({ "@tank": "ullage-table" }),
    "wheel-over": (s) => ({ "wo-speed": s.service_speed, "wo-radius": s.turn_radius_nm, "wo-reaction": s.reaction_time_s,
      ...(s.turn_radius_nm ? { "wo-mode": "radius" } : {}) }),
    "air-draft": (s, d) => ({ "ad-mast-height": s.mast_height_keel, "ad-draft": d.max_draft }),
  };

  function setField(id, v) {
    const el = $(id);
    if (!el || v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v))) return false;
    el.value = typeof v === "number" ? r3(v) : v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function buildBar(page) {
    const card = page.querySelector(".card");
    if (!card || card.querySelector(".ship-fill-bar")) return;
    const bar = document.createElement("div");
    bar.className = "ship-fill-bar";
    bar.innerHTML = `<button type="button" class="ship-fill-btn"><span class="ship-fill-ico">⚓</span><span class="ship-fill-label"></span></button>
      <select class="ship-fill-tank" hidden></select><span class="ship-fill-msg"></span>`;
    const anchor = card.querySelector(".card-subtitle") || card.querySelector(".card-title");
    anchor.after(bar);
    bar.querySelector(".ship-fill-btn").addEventListener("click", () => fillCalc(page.dataset.calc, bar));
  }

  function refreshBars() {
    const s = active();
    document.querySelectorAll(".ship-fill-bar").forEach((bar) => {
      const page = bar.closest(".calc-page");
      bar.querySelector(".ship-fill-label").textContent = s ? T("ship.fill_btn_named", { name: shipName(s) }) : T("ship.fill_btn");
      const sel = bar.querySelector(".ship-fill-tank");
      const isTank = MAP[page.dataset.calc] && MAP[page.dataset.calc]({}, {})["@tank"];
      const tanks = (s && s.tanks) || [];
      sel.hidden = !(isTank && tanks.length > 1);
      sel.innerHTML = tanks.map((tk, i) => `<option value="${i}">${escapeHtml(tk.name || "—")}</option>`).join("");
      bar.querySelector(".ship-fill-msg").textContent = "";
    });
  }

  async function fillCalc(calcId, bar) {
    const msg = bar.querySelector(".ship-fill-msg");
    const s = active();
    const hasData = s && Object.keys(s).some((k) => !["id", "mark_method", "table_step", "density", "hydro", "ballast_tanks", "tanks"].includes(k) && s[k] !== null && s[k] !== "");
    if (!s || (!hasData && !(s.hydro || []).length)) {
      msg.innerHTML = `${escapeHtml(T("ship.fill_none"))} <a href="#" class="ship-open-link">${escapeHtml(T("ship.open_link"))}</a>`;
      msg.querySelector(".ship-open-link").addEventListener("click", (e) => { e.preventDefault(); openShipPage(); });
      return;
    }
    const d = (await computeDerived(s)) || {};
    const plan = MAP[calcId](s, d);
    let n = 0;
    for (const [id, v] of Object.entries(plan)) {
      if (id === "@table") {
        for (const [tid, rows] of Object.entries(v)) {
          if (rows.length && window.ShipHelperDyn.fill(tid, rows)) n++;
        }
      } else if (id === "@tank") {
        const tanks = s.tanks || [];
        const tk = tanks[+bar.querySelector(".ship-fill-tank").value || 0];
        if (tk && tk.rows && tk.rows.length) {
          const rows = tk.rows.map((r) => (v === "bunker-table" ? { sounding: r.level, volume: r.volume } : { innage: r.level, volume: r.volume }));
          if (window.ShipHelperDyn.fill(v, rows)) n++;
          if (v === "ullage-table" && tk.depth) setField("ullage-tank-depth", tk.depth) && n++;
        }
      } else if (setField(id, v)) n++;
    }
    msg.textContent = n ? T("ship.filled", { n, name: shipName(s) }) : T("ship.fill_nothing");
    msg.classList.toggle("ok", n > 0);
  }

  function openShipPage() {
    const b = document.querySelector('.sidebar-nav button[data-group="ship"]');
    if (b) b.click();
  }

  /* ---------------- драфт-сюрвей: гидростатика из таблицы ---------------- */
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".ds-hydro-from-ship");
    if (!btn) return;
    const wrap = btn.parentElement;
    const msg = wrap.querySelector(".ds-hydro-msg");
    const s = active();
    msg.hidden = false;
    if (!s || !(s.hydro || []).length) {
      msg.innerHTML = `${escapeHtml(T("ship.no_hydro"))} <a href="#" class="ship-open-link">${escapeHtml(T("ship.open_link"))}</a>`;
      msg.querySelector(".ship-open-link").addEventListener("click", (ev) => { ev.preventDefault(); openShipPage(); });
      return;
    }
    const get = (f) => parseFloat(wrap.querySelector(`.ds-in[data-field="${f}"]`).value);
    const num = (id) => parseFloat($(id).value);
    try {
      const h = await callCore("core.ship_profile", "survey_hydrostatics", [s.hydro, $("ds-method").value,
        get("fwd_port"), get("fwd_stbd"), get("mid_port"), get("mid_stbd"), get("aft_port"), get("aft_stbd"),
        num("ds-dist-fwd"), num("ds-dist-mid"), num("ds-dist-aft"), num("ds-lbp"), num("ds-table-step")]);
      const put = (f, v, dgt) => {
        const el = wrap.querySelector(`.ds-in[data-field="${f}"]`);
        el.value = Number(v).toFixed(dgt);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      put("displacement_low", h.displacement_low, 1);
      put("displacement_high", h.displacement_high, 1);
      put("lcf", h.lcf, 3);
      put("tpc", h.tpc, 3);
      put("mct_plus50", h.mct_plus50, 2);
      put("mct_minus50", h.mct_minus50, 2);
      msg.textContent = T("ship.hydro_filled", { d: h.true_mean_draft.toFixed(3), lo: h.draft_low.toFixed(2), hi: h.draft_high.toFixed(2) });
    } catch (err) {
      const m = String(err && err.message ? err.message : err).match(/(err\.[a-zA-Z0-9_.]+)/);
      const params = {};
      for (const p of String(err && err.message).matchAll(/'([a-z_]+)':\s*'([^']*)'/g)) params[p[1]] = p[2];
      msg.textContent = m ? T(m[1], params) : T("app.calc_error");
    }
  });

  function setupBars() {
    Object.keys(MAP).forEach((calc) => {
      const page = document.querySelector(`.calc-page[data-calc="${calc}"]`);
      if (page) buildBar(page);
    });
    refreshBars();
    document.addEventListener("shiphelper:langchange", refreshBars);
  }

  // Подписи строятся через t() — ждём загрузки строк (как драфт-сюрвей в calculators.js)
  const pre = window.ShipHelperI18n.preloadI18n ? window.ShipHelperI18n.preloadI18n() : Promise.resolve();
  pre.then(() => { setupPage(); setupBars(); });
  window.ShipHelperShip = { active, open: openShipPage, refresh: refreshDerived };
})();
