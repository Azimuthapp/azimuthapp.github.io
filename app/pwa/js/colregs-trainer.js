/*
 * colregs-trainer.js — тренажёр МППСС «Кто уступает дорогу?».
 *
 * Ситуация рисуется на canvas (вид сверху, своё судно — внизу, нос вверх),
 * теми же функциями корпуса/моря, что сцены МППСС (ShipHelperScenes._lib).
 * Ночью видны только огни цели, которые реально видно с нашего мостика
 * (секторы Правила 21). После ответа — анимация правильного манёвра и
 * объяснение со ссылкой на правило (кнопка открывает правило в теории).
 *
 * Тексты — ключи trainer.* в data/strings/<lang>.json.
 * Лучший результат — localStorage "shiphelper-trainer-best".
 */
(function () {
  "use strict";
  const BEST_KEY = "shiphelper-trainer-best";
  const D2R = Math.PI / 180;
  const FPS = 60, ANIM = 9;
  const norm360 = (a) => ((a % 360) + 360) % 360;
  const angDiff = (a, b) => { let d = norm360(b - a); if (d > 180) d -= 360; return d; };
  const lang = () => document.documentElement.lang || "ru";
  const T = (k, p) => window.ShipHelperI18n.t(k, lang(), p);

  const WHO = ["me", "him", "both"];
  // Судно по умолчанию — сухогруз; sail — парусное
  const POWER = { kind: "power", L: 110, B: 20, palette: "blue" };
  const SAIL = { kind: "sail", L: 46, B: 14, palette: "sail" };

  /*
   * Сценарии. Координаты — условные единицы (север вверх, y вниз), своё судно в (0,0) курсом 0°.
   * q: "who" — варианты me/him/both, иначе свои варианты opts (ключи trainer.opt.*).
   * seen — что видно с мостика (огни/знаки), рисуется во врезке.
   * anim — манёвры после ответа: [{t, to, rate, speed}], sound — звуковой сигнал.
   */
  const SCENARIOS = [
    { id: "head_on", rules: [14], q: "who", ok: "both",
      own: { speed: 55 }, tgt: { x: 40, y: -1100, hdg: 180, speed: 55, palette: "amber" },
      anim: { own: [{ t: 0.4, to: 32, rate: 12 }], tgt: [{ t: 0.4, to: 212, rate: 12 }] } },
    { id: "cross_stbd", rules: [15, 16], q: "who", ok: "me",
      own: { speed: 55 }, tgt: { x: 700, y: -700, hdg: 270, speed: 55, palette: "amber" },
      anim: { own: [{ t: 0.3, to: 62, rate: 14 }] } },
    { id: "cross_port", rules: [15, 17], q: "who", ok: "him",
      own: { speed: 55 }, tgt: { x: -700, y: -700, hdg: 90, speed: 55, palette: "amber" },
      anim: { tgt: [{ t: 0.3, to: 150, rate: 14 }] } },
    { id: "overtaking", rules: [13], q: "who", ok: "me",
      own: { speed: 70 }, tgt: { x: 0, y: -450, hdg: 0, speed: 22, palette: "amber" },
      anim: { own: [{ t: 0.3, to: 34, rate: 12 }, { t: 5.2, to: 0, rate: 10 }] } },
    { id: "overtaken", rules: [13, 17], q: "who", ok: "him",
      own: { speed: 32 }, tgt: { x: 230, y: 650, hdg: 0, speed: 85, palette: "amber" },
      anim: { tgt: [{ t: 0.3, to: 9, rate: 6 }, { t: 4.2, to: 0, rate: 6 }] } },
    { id: "night_head_on", rules: [14, 23], q: "who", ok: "both", night: true,
      own: { speed: 55 }, tgt: { x: 30, y: -1100, hdg: 180, speed: 55, L: 120 },
      seen: [["w", -0.05, -0.55], ["w", 0.05, -0.1], ["g", -0.35, 0.45], ["r", 0.35, 0.45]],
      anim: { own: [{ t: 0.4, to: 32, rate: 12 }], tgt: [{ t: 0.4, to: 212, rate: 12 }] } },
    { id: "night_green", rules: [15, 17, 21], q: "who", ok: "him", night: true,
      own: { speed: 55 }, tgt: { x: -700, y: -700, hdg: 90, speed: 55, L: 120 },
      seen: [["w", -0.4, -0.55], ["w", 0.35, -0.15], ["g", 0.1, 0.45]],
      anim: { tgt: [{ t: 0.3, to: 150, rate: 14 }] } },
    { id: "night_red", rules: [15, 16, 21], q: "who", ok: "me", night: true,
      own: { speed: 55 }, tgt: { x: 700, y: -700, hdg: 270, speed: 55, L: 120 },
      seen: [["w", 0.4, -0.55], ["w", -0.35, -0.15], ["r", -0.1, 0.45]],
      anim: { own: [{ t: 0.3, to: 62, rate: 14 }] } },
    { id: "night_stern", rules: [13, 21], q: "who", ok: "me", night: true,
      own: { speed: 70 }, tgt: { x: 0, y: -450, hdg: 0, speed: 22 },
      seen: [["w", 0, 0.2]],
      anim: { own: [{ t: 0.3, to: 34, rate: 12 }, { t: 5.2, to: 0, rate: 10 }] } },
    { id: "sail_port", rules: [18], q: "who", ok: "me",
      own: { speed: 50 }, tgt: { ...SAIL, x: -650, y: -650, hdg: 90, speed: 72 },
      anim: { own: [{ t: 0.3, speed: 18 }] } },
    { id: "fishing", rules: [18, 26], q: "who", ok: "me",
      own: { speed: 55 }, tgt: { x: -560, y: -760, hdg: 60, speed: 18, L: 70, B: 16, palette: "amber", tag: "fishing" },
      seen: [["cone_up", 0, 0.28], ["cone_down", 0, -0.28]],
      anim: { own: [{ t: 0.3, to: 40, rate: 12 }, { t: 5.2, to: 10, rate: 8 }] } },
    { id: "nuc_night", rules: [18, 27], q: "who", ok: "me", night: true,
      own: { speed: 55 }, tgt: { x: -70, y: -950, hdg: 250, speed: 0, L: 120, nuc: true },
      seen: [["r", 0, -0.35], ["r", 0, 0.25]],
      anim: { own: [{ t: 0.3, to: 40, rate: 10 }, { t: 5.5, to: 5, rate: 8 }] } },
    { id: "ram", rules: [18, 27], q: "who", ok: "me",
      own: { speed: 55 }, tgt: { x: -500, y: -820, hdg: 80, speed: 14, L: 90, B: 22, palette: "amber", tag: "ram" },
      seen: [["ball", 0, -0.5], ["diamond", 0, 0], ["ball", 0, 0.5]],
      anim: { own: [{ t: 0.3, to: 38, rate: 12 }, { t: 5.4, to: 8, rate: 8 }] } },
    { id: "cbd", rules: [18, 28], q: "who", ok: "me",
      own: { speed: 55 }, tgt: { x: -90, y: -1150, hdg: 176, speed: 45, L: 175, B: 30, palette: "amber", tag: "cbd" },
      seen: [["cyl", 0, 0]],
      anim: { own: [{ t: 0.3, to: 42, rate: 12 }] } },
    { id: "sail_tacks", rules: [12], q: "who", ok: "me", wind: 270,
      own: { ...SAIL, speed: 45 }, tgt: { ...SAIL, x: 202, y: -756, hdg: 210, speed: 45 },
      anim: { own: [{ t: 0.3, to: 48, rate: 12 }] } },
    { id: "sail_windward", rules: [12], q: "who", ok: "me", wind: 270,
      own: { ...SAIL, hdg: 20, speed: 45 }, tgt: { ...SAIL, x: 380, y: -35, hdg: 330, speed: 45 },
      anim: { own: [{ t: 0.3, speed: 12 }] } },
    { id: "sail_overtaking", rules: [13, 18], q: "who", ok: "me",
      own: { ...SAIL, speed: 72 }, tgt: { x: 40, y: -440, hdg: 0, speed: 20, palette: "amber" },
      anim: { own: [{ t: 0.3, to: 335, rate: 10 }, { t: 4.6, to: 0, rate: 10 }] } },
    { id: "overtaken_by_sail", rules: [13, 18], q: "who", ok: "him",
      own: { speed: 30 }, tgt: { ...SAIL, x: -230, y: 620, hdg: 0, speed: 82 },
      anim: { tgt: [{ t: 0.3, to: 351, rate: 6 }, { t: 4, to: 0, rate: 6 }] } },
    { id: "narrow_channel", rules: [9], q: "who", ok: "him", channel: true,
      own: { speed: 50, L: 150, B: 26 }, tgt: { ...SAIL, x: -420, y: -650, hdg: 90, speed: 45 },
      anim: { tgt: [{ t: 0.3, to: 200, rate: 14 }] } },
    { id: "fog_bow", rules: [19], q: ["starboard", "port", "stand_on"], ok: "starboard", fog: true,
      own: { speed: 40 }, tgt: { x: 560, y: -820, hdg: 250, speed: 45 },
      anim: { own: [{ t: 0.3, to: 75, rate: 12 }] } },
    { id: "fog_quarter", rules: [19], q: ["starboard", "port", "stand_on"], ok: "port", fog: true,
      own: { speed: 40 }, tgt: { x: 480, y: 470, hdg: 330, speed: 75 },
      anim: { own: [{ t: 0.3, to: 300, rate: 12 }] } },
    { id: "stand_on_act", rules: [17, 34], q: ["sound5", "port_towards", "keep_to_end"], ok: "sound5",
      own: { speed: 45 }, tgt: { x: -430, y: -430, hdg: 90, speed: 55, palette: "amber" },
      anim: { own: [{ t: 1.2, speed: 0 }], sound: { who: "own", n: 5, at: 0.2 } } },
    { id: "sound_starboard", rules: [34], q: ["one_short", "two_short", "five_short", "one_long"], ok: "one_short",
      own: { speed: 55 }, tgt: { x: 700, y: -700, hdg: 270, speed: 55, palette: "amber" },
      anim: { own: [{ t: 0.6, to: 62, rate: 14 }], sound: { who: "own", n: 1, at: 0.2 } } },
    // --- особые суда, якорь и мель, огни ночью ---
    { id: "anchored_day", rules: [30, 8], q: ["pass_clear", "keep_anchored", "sound5_anchor"], ok: "pass_clear",
      own: { speed: 55 }, tgt: { x: 20, y: -900, hdg: 140, speed: 0, palette: "amber", tag: "anchored" },
      seen: [["ball", 0, -0.3]],
      anim: { own: [{ t: 0.3, to: 30, rate: 10 }, { t: 4.6, to: 0, rate: 8 }] } },
    { id: "anchored_night", rules: [30], q: ["what_anchored", "what_towing", "what_stern"], ok: "what_anchored", night: true,
      own: { speed: 50 }, tgt: { x: 60, y: -950, hdg: 100, speed: 0, L: 140, tag: "anchored", noNav: true, allround: [["w", -0.42], ["w", 0.45]] },
      seen: [["w", -0.55, -0.45], ["w", 0.55, 0.05]],
      anim: { own: [{ t: 0.3, to: 32, rate: 10 }, { t: 4.8, to: 0, rate: 8 }] } },
    { id: "aground_day", rules: [30], q: ["what_aground", "what_anchored", "what_nuc"], ok: "what_aground",
      own: { speed: 50 }, tgt: { x: -40, y: -950, hdg: 60, speed: 0, palette: "amber", tag: "aground" },
      seen: [["ball", 0, -0.62], ["ball", 0, -0.05], ["ball", 0, 0.52]],
      anim: { own: [{ t: 0.3, to: 35, rate: 10 }, { t: 4.8, to: 0, rate: 8 }] } },
    { id: "nuc_day", rules: [27, 18], q: "who", ok: "me",
      own: { speed: 55 }, tgt: { x: -80, y: -950, hdg: 230, speed: 0, palette: "amber", tag: "nuc" },
      seen: [["ball", 0, -0.3], ["ball", 0, 0.3]],
      anim: { own: [{ t: 0.3, to: 38, rate: 10 }, { t: 5.2, to: 5, rate: 8 }] } },
    { id: "towing_day", rules: [24, 15], q: "who", ok: "me",
      own: { speed: 50 }, tgt: { x: 720, y: -680, hdg: 270, speed: 40, L: 60, B: 18, palette: "amber", tag: "towing" },
      seen: [["diamond", 0, 0]],
      anim: { own: [{ t: 0.3, to: 70, rate: 14 }] } },
    { id: "towing_night", rules: [24, 15], q: "who", ok: "me", night: true,
      own: { speed: 50 }, tgt: { x: 720, y: -680, hdg: 270, speed: 40, L: 60, B: 18, noMast: true, allround: [["w", -0.3], ["w", -0.3], ["w", -0.3]] },
      seen: [["w", 0.1, -0.7], ["w", 0.1, -0.35], ["w", 0.1, 0], ["r", -0.2, 0.5]],
      anim: { own: [{ t: 0.3, to: 70, rate: 14 }] } },
    { id: "pilot_night", rules: [29, 15], q: "who", ok: "him", night: true,
      own: { speed: 55 }, tgt: { x: -700, y: -700, hdg: 90, speed: 50, L: 40, B: 12, tag: "pilot", noMast: true, allround: [["w", -0.1], ["r", -0.1]] },
      seen: [["w", 0, -0.55], ["r", 0, -0.15], ["g", 0.15, 0.45]],
      anim: { tgt: [{ t: 0.3, to: 150, rate: 14 }] } },
    { id: "trawler_night", rules: [26, 18], q: "who", ok: "me", night: true,
      own: { speed: 55 }, tgt: { x: -600, y: -720, hdg: 75, speed: 20, L: 70, B: 16, noMast: true, tag: "fishing", allround: [["g", -0.1], ["w", -0.1]] },
      seen: [["g", 0, -0.55], ["w", 0, -0.15], ["g", 0.15, 0.45]],
      anim: { own: [{ t: 0.3, to: 42, rate: 12 }, { t: 5.2, to: 10, rate: 8 }] } },
    { id: "fishing_other_night", rules: [26], q: ["what_fishing_other", "what_pilot", "what_nuc"], ok: "what_fishing_other", night: true,
      own: { speed: 50 }, tgt: { x: -380, y: -880, hdg: 120, speed: 6, L: 50, B: 14, noMast: true, tag: "fishing_other", allround: [["r", -0.1], ["w", -0.1]] },
      seen: [["r", 0, -0.55], ["w", 0, -0.15]],
      anim: { own: [{ t: 0.3, to: 35, rate: 10 }, { t: 5, to: 5, rate: 8 }] } },
    { id: "cbd_night", rules: [28, 18], q: "who", ok: "me", night: true,
      own: { speed: 55 }, tgt: { x: -90, y: -1150, hdg: 176, speed: 45, L: 175, B: 30, tag: "cbd", allround: [["r", 0.05], ["r", 0.05], ["r", 0.05]] },
      seen: [["r", 0, -0.75], ["r", 0, -0.45], ["r", 0, -0.15], ["w", 0, 0.12], ["g", -0.35, 0.5], ["r", 0.35, 0.5]],
      anim: { own: [{ t: 0.3, to: 42, rate: 12 }] } },
    { id: "ram_night", rules: [27, 18], q: "who", ok: "me", night: true,
      own: { speed: 55 }, tgt: { x: -620, y: -760, hdg: 80, speed: 14, L: 90, B: 22, tag: "ram", allround: [["r", 0.05], ["w", 0.05], ["r", 0.05]] },
      seen: [["r", 0, -0.7], ["w", 0, -0.4], ["r", 0, -0.1], ["w", -0.3, 0.1], ["g", 0.2, 0.5]],
      anim: { own: [{ t: 0.3, to: 38, rate: 12 }, { t: 5.4, to: 8, rate: 8 }] } },
    { id: "sail_night", rules: [25, 18], q: "who", ok: "me", night: true,
      own: { speed: 50 }, tgt: { ...SAIL, x: -650, y: -650, hdg: 90, speed: 50 },
      seen: [["g", 0, 0.2]],
      anim: { own: [{ t: 0.3, speed: 18 }] } },
    { id: "motorsailer", rules: [25, 15], q: "who", ok: "him",
      own: { speed: 55 }, tgt: { ...SAIL, x: -700, y: -700, hdg: 90, speed: 55, tag: "motorsail" },
      seen: [["cone_down", 0, 0]],
      anim: { tgt: [{ t: 0.3, to: 150, rate: 14 }] } },
    { id: "fishing_vs_sail", rules: [18, 26], q: "who", ok: "me",
      own: { ...SAIL, speed: 45 }, tgt: { x: 560, y: -760, hdg: 300, speed: 18, L: 70, B: 16, palette: "amber", tag: "fishing" },
      seen: [["cone_up", 0, 0.28], ["cone_down", 0, -0.28]],
      anim: { own: [{ t: 0.3, to: 320, rate: 12 }, { t: 5.2, to: 350, rate: 8 }] } },
    { id: "sound_port", rules: [34], q: ["one_short", "two_short", "three_short", "one_long"], ok: "two_short",
      own: { speed: 50 }, tgt: { x: 60, y: -900, hdg: 100, speed: 0, palette: "amber", tag: "anchored" },
      anim: { own: [{ t: 0.6, to: 330, rate: 12 }, { t: 4.8, to: 0, rate: 8 }], sound: { who: "own", n: 2, at: 0.2 } } },
    { id: "sound_astern", rules: [34], q: ["one_short", "two_short", "three_short", "five_short"], ok: "three_short",
      own: { speed: 45 }, tgt: { x: 0, y: -620, hdg: 90, speed: 0, palette: "amber", tag: "nuc" },
      anim: { own: [{ t: 0.4, speed: 0 }], sound: { who: "own", n: 3, at: 0.2 } } },
    { id: "fog_signal", rules: [35], q: ["fog_one_long", "fog_two_long", "fog_long_two_short"], ok: "fog_one_long", fog: true,
      own: { speed: 40 }, tgt: { x: -500, y: -900, hdg: 120, speed: 30 },
      anim: { own: [{ t: 0.4, speed: 22 }], sound: { who: "own", n: 1, at: 0.2 } } },
  ];

  /* ------------------------------ кинематика ------------------------------ */
  function simulate(sh, man, duration) {
    const n = Math.ceil(duration * FPS) + 1, out = new Array(n);
    let x = sh.x, y = sh.y, hdg = sh.hdg, speed = sh.speed, target = null, rate = 0, mi = 0;
    const list = (man || []).slice().sort((a, b) => a.t - b.t);
    for (let i = 0; i < n; i++) {
      const t = i / FPS;
      while (mi < list.length && list[mi].t <= t) {
        const m = list[mi++];
        if (m.to !== undefined) { target = m.to; rate = m.rate || 10; }
        if (m.speed !== undefined) speed = m.speed;
      }
      if (target !== null) {
        const d = angDiff(hdg, target), step = rate / FPS;
        if (Math.abs(d) <= step) { hdg = target; target = null; } else hdg = norm360(hdg + Math.sign(d) * step);
      }
      out[i] = { x, y, hdg };
      x += Math.sin(hdg * D2R) * speed / FPS;
      y -= Math.cos(hdg * D2R) * speed / FPS;
    }
    return out;
  }
  const at = (traj, t) => traj[Math.max(0, Math.min(traj.length - 1, Math.round(t * FPS)))];

  /* --------------------------- огни (Правило 21) --------------------------- */
  const SECTORS = { mast: [-112.5, 112.5], stbd: [0, 112.5], port: [-112.5, 0], stern: [112.5, 247.5] };
  function visible(type, rel) {
    if (type === "all") return true;
    if (type === "stern") return rel >= 112.5 && rel <= 247.5;
    const [a, b] = SECTORS[type];
    const r = rel > 180 ? rel - 360 : rel;
    return r >= a && r <= b;
  }
  const LIGHT_COL = { w: "#ffffff", r: "#ff3b3b", g: "#33ff88", y: "#ffd23f" };
  function lightsOf(sh) {
    const { L, B } = sh;
    if (sh.nuc) return [[0, -L * 0.05, "#ff3b3b", "all"], [0, -L * 0.05 + 0.001, "#ff3b3b", "all"]];
    if (sh.kind === "sail") return [[-B / 2, -L * 0.1, "#ff3b3b", "port"], [B / 2, -L * 0.1, "#33ff88", "stbd"], [0, L / 2, "#ffffff", "stern"]];
    let l = sh.noNav ? [] : [[0, -L * 0.28, "#ffffff", "mast"], [-B / 2, L * 0.17, "#ff3b3b", "port"], [B / 2, L * 0.17, "#33ff88", "stbd"], [0, L / 2, "#ffffff", "stern"]];
    if (L >= 85 && !sh.noNav) l.push([0, L * 0.12, "#ffffff", "mast"]);
    if (sh.noMast) l = l.filter((x) => x[3] !== "mast");
    // круговые огни особых судов (Правила 24–30): на виде сверху стоящие один над другим огни
    // разнесены поперёк корпуса, чтобы были видны все цвета
    if (sh.allround) {
      const same = {};
      sh.allround.forEach(([c, yf]) => { same[yf] = (same[yf] || 0) + 1; });
      const idx = {};
      sh.allround.forEach(([c, yf]) => {
        const n = same[yf], i = (idx[yf] = (idx[yf] || 0) + 1) - 1;
        l.push([(i - (n - 1) / 2) * Math.max(5, B * 0.32), L * yf, LIGHT_COL[c], "all"]);
      });
    }
    return l;
  }

  /* ------------------------------- рисование ------------------------------- */
  function makeView(W, H, trajs) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const tr of trajs) for (let i = 0; i < tr.length; i += 10) {
      const p = tr[i]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const pad = 230;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const spanX = Math.max(900, x1 - x0), spanY = Math.max(700, y1 - y0);
    const k = Math.min(W / spanX, (H - 20) / spanY);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { k, toScreen: (x, y) => ({ x: W / 2 + (x - cx) * k, y: H / 2 + 10 + (y - cy) * k }) };
  }

  function drawShape(ctx, kind, x, y, s) {
    ctx.fillStyle = "#0b0f16"; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath();
    if (kind === "ball") ctx.arc(x, y, s, 0, Math.PI * 2);
    else if (kind === "diamond") { ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 1.3); ctx.lineTo(x - s, y); ctx.closePath(); }
    else if (kind === "cone_up") { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); ctx.closePath(); }
    else if (kind === "cone_down") { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y - s * 0.8); ctx.lineTo(x - s, y - s * 0.8); ctx.closePath(); }
    else if (kind === "cyl") ctx.rect(x - s * 0.75, y - s * 1.5, s * 1.5, s * 3);
    ctx.fill(); ctx.stroke();
  }

  function drawSeenPanel(ctx, W, sc, night) {
    const w = 132, h = 112, x = W - w - 10, y = 10;
    const lib = window.ShipHelperScenes._lib;
    ctx.save();
    ctx.fillStyle = night ? "rgba(2,6,14,0.88)" : "rgba(170,205,235,0.9)";
    lib.roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = "rgba(227,192,127,0.6)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = night ? "#cbd5e1" : "#0b1a2c"; ctx.font = "600 10px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(T("trainer.seen"), x + w / 2, y + 15);
    const cx = x + w / 2, cy = y + 64;
    // горизонт
    ctx.strokeStyle = night ? "rgba(120,160,220,0.25)" : "rgba(11,26,44,0.35)";
    ctx.beginPath(); ctx.moveTo(x + 8, cy + 34); ctx.lineTo(x + w - 8, cy + 34); ctx.stroke();
    for (const [c, px, py] of sc.seen) {
      const X = cx + px * 48, Y = cy + py * 36;
      if (c.length === 1) {
        const col = LIGHT_COL[c];
        ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(X, Y, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      } else drawShape(ctx, c, X, Y, 9);
    }
    ctx.restore();
  }

  function drawWind(ctx, from) {
    const x = 46, y = 62, r = 26;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#e3c07f"; ctx.fillStyle = "#e3c07f"; ctx.lineWidth = 2.2;
    const a = (from + 180) * D2R; // куда дует
    const dx = Math.sin(a), dy = -Math.cos(a);
    ctx.beginPath(); ctx.moveTo(-dx * r, -dy * r); ctx.lineTo(dx * r, dy * r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(dx * (r + 6), dy * (r + 6));
    ctx.lineTo(dx * r - dy * 6, dy * r + dx * 6); ctx.lineTo(dx * r + dy * 6, dy * r - dx * 6); ctx.closePath(); ctx.fill();
    ctx.font = "600 10px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(T("trainer.wind"), 0, r + 22);
    ctx.restore();
  }

  function render(state, t) {
    const { canvas, sc } = state;
    const lib = window.ShipHelperScenes._lib;
    const ctx = canvas.getContext("2d");
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const night = !!sc.night;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    const view = state.view;
    lib.drawSea(ctx, W, H, t, night, view);

    // узкость: кромки фарватера и буи
    if (sc.channel) {
      for (const side of [-1, 1]) {
        const x = side * 240;
        ctx.save(); ctx.setLineDash([6, 8]); ctx.strokeStyle = "rgba(255,255,255,0.28)";
        const a = view.toScreen(x, 600), b = view.toScreen(x, -2600);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
        for (let yy = 400; yy > -2400; yy -= 420) {
          const p = view.toScreen(x, yy);
          ctx.fillStyle = side < 0 ? "#e74c3c" : "#27ae60";
          ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    const own = at(state.ownTraj, t), tgt = at(state.tgtTraj, t);
    const ks = view.k * lib.SHIP_SCALE * 1.35;
    const sOwn = { sx: view.toScreen(own.x, own.y).x, sy: view.toScreen(own.x, own.y).y, hdg: own.hdg, k: ks };
    const sTgt = { sx: view.toScreen(tgt.x, tgt.y).x, sy: view.toScreen(tgt.x, tgt.y).y, hdg: tgt.hdg, k: ks };

    // курсовые линии (до ответа) / пройденный путь (после)
    for (const [tr, col, sh] of [[state.ownTraj, "rgba(34,211,238,0.55)", state.ownSh], [state.tgtTraj, "rgba(245,176,65,0.55)", state.tgtSh]]) {
      if (!state.answered && !sh.speed) continue;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      if (!state.answered) {
        ctx.setLineDash([5, 7]);
        const p0 = tr[0], p1 = view.toScreen(p0.x + Math.sin(p0.hdg * D2R) * 9e2, p0.y - Math.cos(p0.hdg * D2R) * 9e2), s0 = view.toScreen(p0.x, p0.y);
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      } else {
        ctx.beginPath();
        const n = Math.round(t * FPS);
        for (let i = 0; i <= n && i < tr.length; i += 4) { const s = view.toScreen(tr[i].x, tr[i].y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // своё судно
    lib.drawShipBody(ctx, sOwn, state.ownSh, night);
    if (night) lib.drawLights(ctx, sOwn, state.ownSh, false);

    // цель
    if (sc.fog) {
      ctx.save();
      ctx.fillStyle = "rgba(200,210,220,0.42)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffb347"; ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(sTgt.sx, sTgt.sy, 9, 6, tgt.hdg * D2R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      lib.drawShipBody(ctx, sOwn, state.ownSh, false);
    } else if (night) {
      // видны только огни, сектор которых обращён к нам
      const brg = norm360(Math.atan2(own.x - tgt.x, -(own.y - tgt.y)) / D2R);
      const rel = norm360(brg - tgt.hdg);
      ctx.save(); ctx.translate(sTgt.sx, sTgt.sy); ctx.rotate(tgt.hdg * D2R); ctx.scale(ks, ks);
      const ls = lightsOf(state.tgtSh);
      ls.forEach(([x, y, c, type], i) => {
        if (!visible(type, rel)) return;
        const yy = state.tgtSh.nuc ? (i ? 6 : -6) : y;
        ctx.shadowColor = c; ctx.shadowBlur = 22; ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x, yy, 3.6 / Math.sqrt(ks), 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    } else {
      lib.drawShipBody(ctx, sTgt, state.tgtSh, false);
    }

    // звуковой сигнал — расходящиеся кольца
    const snd = sc.anim && sc.anim.sound;
    if (state.answered && snd) {
      for (let i = 0; i < snd.n; i++) {
        const t0 = snd.at + i * 0.55, age = t - t0;
        if (age < 0 || age > 1.6) continue;
        ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - age / 1.6)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sOwn.sx, sOwn.sy, 14 + age * 70, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }

    const font = "600 11px Inter, system-ui, sans-serif";
    lib.pill(ctx, sOwn.sx, sOwn.sy + state.ownSh.L * ks * 0.5 + 30, T("trainer.you"), "#22d3ee", font);
    if (state.answered || !night) {
      const tag = sc.fog ? T("trainer.radar_echo") : T(`trainer.tag.${state.tgtSh.tag || (state.tgtSh.kind === "sail" ? "sail" : "power")}`);
      lib.pill(ctx, sTgt.sx, sTgt.sy - state.tgtSh.L * ks * 0.55 - 10, tag, "#f5b041", font);
    }
    if (sc.wind !== undefined) drawWind(ctx, sc.wind);
    if (sc.seen) drawSeenPanel(ctx, W, sc, night);
  }

  /* --------------------------------- UI --------------------------------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || "null"); } catch (e) { return null; } }
  function saveBest(v) { try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch (e) { /* без памяти */ } }

  const S = { order: [], i: 0, score: 0, wrong: [], state: null, raf: 0 };

  function optionsOf(sc) { return sc.q === "who" ? WHO : sc.q; }
  const optKey = (sc, o) => (sc.q === "who" ? `trainer.who.${o}` : `trainer.opt.${o}`);

  function prepare(sc) {
    const canvas = $("trainer-canvas");
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const base = sc.own.kind === "sail" ? SAIL : POWER;
    const ownSh = { ...base, x: 0, y: 0, hdg: 0, ...sc.own };
    const tbase = sc.tgt.kind === "sail" ? SAIL : POWER;
    const tgtSh = { ...tbase, ...sc.tgt };
    const plain = [simulate(ownSh, [], ANIM), simulate(tgtSh, [], ANIM)];
    const ownTraj = simulate(ownSh, (sc.anim || {}).own, ANIM), tgtTraj = simulate(tgtSh, (sc.anim || {}).tgt, ANIM);
    const view = makeView(W, H, [ownTraj, tgtTraj, plain[0].slice(0, FPS * 6), plain[1].slice(0, FPS * 6)]);
    return { canvas, sc, dpr, ownSh, tgtSh, ownTraj, tgtTraj, plainOwn: plain[0], plainTgt: plain[1], view, answered: false };
  }

  function loop(start) {
    cancelAnimationFrame(S.raf);
    const st = S.state;
    const step = (now) => {
      if (!S.state || S.state !== st) return;
      let t = 0;
      if (st.answered) {
        t = Math.min(ANIM, (now - start) / 1000);
      } else {
        // до ответа — суда стоят на исходных позициях, рябь чуть движется
        t = 0;
      }
      render(st, st.answered ? t : 0);
      if (st.answered && t < ANIM) S.raf = requestAnimationFrame(step);
    };
    S.raf = requestAnimationFrame(step);
  }

  function showQuestion() {
    const sc = S.order[S.i];
    $("trainer-progress").textContent = T("trainer.progress", { i: S.i + 1, n: S.order.length, s: S.score });
    $("trainer-bar").style.width = `${(S.i / S.order.length) * 100}%`;
    $("trainer-situation").textContent = T(`trainer.q.${sc.id}`);
    $("trainer-question").textContent = sc.q === "who" ? T("trainer.ask_who") : T(`trainer.ask.${sc.id}`);
    const opts = optionsOf(sc).slice();
    if (sc.q !== "who") shuffle(opts);
    $("trainer-options").innerHTML = opts.map((o) => `<button type="button" class="trainer-option" data-opt="${o}">${esc(T(optKey(sc, o)))}</button>`).join("");
    $("trainer-feedback").hidden = true;
    $("trainer-quiz").hidden = false;
    $("trainer-summary").hidden = true;
    S.state = prepare(sc);
    loop(0);
  }

  function answer(opt) {
    const sc = S.order[S.i];
    if (!S.state || S.state.answered) return;
    const ok = opt === sc.ok;
    if (ok) S.score++; else S.wrong.push(sc.id);
    document.querySelectorAll("#trainer-options .trainer-option").forEach((b) => {
      b.disabled = true;
      if (b.dataset.opt === sc.ok) b.classList.add("correct");
      else if (b.dataset.opt === opt) b.classList.add("wrong");
    });
    const fb = $("trainer-feedback");
    fb.hidden = false;
    fb.classList.toggle("ok", ok);
    $("trainer-verdict").textContent = ok ? T("trainer.right") : T("trainer.wrong_answer", { a: T(optKey(sc, sc.ok)) });
    $("trainer-explain").textContent = T(`trainer.e.${sc.id}`);
    $("trainer-rule-btn").textContent = T("trainer.open_rule", { n: sc.rules[0] });
    $("trainer-rule-btn").dataset.rule = sc.rules[0];
    $("trainer-rules").textContent = T("trainer.rules", { r: sc.rules.join(", ") });
    $("trainer-next").textContent = S.i + 1 < S.order.length ? T("trainer.next") : T("trainer.finish");
    $("trainer-progress").textContent = T("trainer.progress", { i: S.i + 1, n: S.order.length, s: S.score });
    S.state.answered = true;
    loop(performance.now());
  }

  function finish() {
    cancelAnimationFrame(S.raf);
    S.state = null;
    $("trainer-quiz").hidden = true;
    const sm = $("trainer-summary");
    sm.hidden = false;
    $("trainer-bar").style.width = "100%";
    const n = S.order.length, pct = Math.round((S.score / n) * 100);
    const best = loadBest();
    if (n === SCENARIOS.length && (!best || S.score > best.score)) saveBest({ score: S.score, n, date: new Date().toISOString().slice(0, 10) });
    $("trainer-score").textContent = `${S.score} / ${n}`;
    $("trainer-score-text").textContent = T(pct >= 90 ? "trainer.grade_a" : pct >= 70 ? "trainer.grade_b" : "trainer.grade_c");
    $("trainer-retry-wrong").hidden = S.wrong.length === 0;
    renderBest();
  }

  function renderBest() {
    const b = loadBest(), el = $("trainer-best");
    if (el) el.textContent = b ? T("trainer.best", { s: b.score, n: b.n, d: b.date }) : "";
  }

  function start(ids) {
    const pool = ids ? SCENARIOS.filter((s) => ids.includes(s.id)) : SCENARIOS.slice();
    S.order = shuffle(pool.slice());
    S.i = 0; S.score = 0; S.wrong = [];
    $("trainer-intro").hidden = true;
    showQuestion();
  }

  async function openRule(n) {
    const sel = $("theory-topic-select");
    const sw = document.querySelector('#theory-mode-switch button[data-mode="book"]');
    if (sw) sw.click();
    if (sel && sel.value !== "colregs") { sel.value = "colregs"; sel.dispatchEvent(new Event("change")); }
    try {
      const r = await fetch(`../data/theory/colregs.${lang()}.json`, { cache: "no-cache" });
      const data = await r.json();
      const entries = Array.isArray(data) ? data : data.entries;
      const idx = entries.findIndex((e) => new RegExp(`^(Правило|Rule)\\s+${n}\\b`).test(e.number));
      if (idx < 0) return;
      let tries = 0;
      (function wait() {
        const el = document.getElementById(`th-colregs-${idx}`);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
        if (++tries < 40) setTimeout(wait, 100);
      })();
    } catch (e) { /* без перехода */ }
  }

  function setMode(mode) {
    const grp = document.querySelector('.group-content[data-group="theory"]');
    if (!grp) return;
    grp.dataset.mode = mode;
    document.querySelectorAll("#theory-mode-switch button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    if (mode === "trainer") {
      renderBest();
      if (S.state) { S.state = prepare(S.order[S.i]); if (S.state && S.order[S.i]) { const a = $("trainer-feedback").hidden === false; S.state.answered = a; render(S.state, a ? ANIM : 0); } }
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setup() {
    const sw = $("theory-mode-switch");
    if (!sw) return;
    sw.addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });
    $("trainer-start").addEventListener("click", () => start());
    $("trainer-restart").addEventListener("click", () => start());
    $("trainer-retry-wrong").addEventListener("click", () => start(S.wrong.slice()));
    $("trainer-options").addEventListener("click", (e) => { const b = e.target.closest(".trainer-option"); if (b) answer(b.dataset.opt); });
    $("trainer-next").addEventListener("click", () => { if (S.i + 1 < S.order.length) { S.i++; showQuestion(); } else finish(); });
    $("trainer-replay").addEventListener("click", () => { if (S.state && S.state.answered) loop(performance.now()); });
    $("trainer-rule-btn").addEventListener("click", (e) => openRule(e.currentTarget.dataset.rule));
    $("trainer-count").textContent = SCENARIOS.length;
    window.addEventListener("resize", () => {
      if (!S.state || $("trainer-quiz").hidden) return;
      const a = S.state.answered;
      S.state = prepare(S.order[S.i]); S.state.answered = a; render(S.state, a ? ANIM : 0);
    });
    document.addEventListener("shiphelper:langchange", () => {
      renderBest();
      if (!S.state || $("trainer-quiz").hidden) return;
      const sc = S.order[S.i];
      $("trainer-situation").textContent = T(`trainer.q.${sc.id}`);
      $("trainer-question").textContent = sc.q === "who" ? T("trainer.ask_who") : T(`trainer.ask.${sc.id}`);
      document.querySelectorAll("#trainer-options .trainer-option").forEach((b) => { b.textContent = T(optKey(sc, b.dataset.opt)); });
      if (!$("trainer-feedback").hidden) {
        const ok = $("trainer-feedback").classList.contains("ok");
        $("trainer-verdict").textContent = ok ? T("trainer.right") : T("trainer.wrong_answer", { a: T(optKey(sc, sc.ok)) });
        $("trainer-explain").textContent = T(`trainer.e.${sc.id}`);
        $("trainer-rule-btn").textContent = T("trainer.open_rule", { n: sc.rules[0] });
        $("trainer-rules").textContent = T("trainer.rules", { r: sc.rules.join(", ") });
      }
      $("trainer-progress").textContent = T("trainer.progress", { i: S.i + 1, n: S.order.length, s: S.score });
      render(S.state, S.state.answered ? ANIM : 0);
    });
    window.ShipHelperI18n.preloadI18n().then(renderBest);
  }

  window.ShipHelperTrainer = { SCENARIOS, _simulate: simulate, _start: start, open: () => setMode("trainer"), setMode };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
