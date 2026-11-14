/*
 * theory-scenes.js — интерактивные сцены для остальных тем теории (в том же стиле,
 * что и сцены МППСС в colregs-scenes.js — пользователю они понравились):
 *
 *   iala_lateral      — латеральные знаки МАМС, регион A/Б, вход с моря, ночные огни;
 *   iala_cardinal     — кардинальные знаки вокруг опасности, топовые фигуры, ритмы огней;
 *   light_characters  — характеристики огней в реальном ритме (Fl, LFl, Oc, Iso, Q, VQ, Mo, Al);
 *   gmdss_sea_areas   — морские районы A1–A4 и оборудование ГМССБ по мере выхода судна;
 *   dsc_distress      — подача сигнала бедствия ЦИВ → подтверждение → MAYDAY → RCC;
 *   beaufort_sea      — шкала Бофорта: волнение, небо, судно на волне, ползунок силы ветра.
 *
 * Регистрируются в том же window.ShipHelperScenes, поэтому теория вызывает их так же,
 * как сцены МППСС (по полю entry.diagram). Тексты — i18n-ключи scene.*, bft.*.
 */
(function () {
  "use strict";
  const base = window.ShipHelperScenes;
  if (!base) return;
  const L = base._lib;
  const T = (key, lang, p) => window.ShipHelperI18n.t(key, lang, p);
  const D2R = Math.PI / 180;

  /* ------------------------------ ритмы огней ------------------------------ */
  // seq — длительности [свет, темнота, свет, ...] в секундах; colors — цвета вспышек по порядку
  const RHYTHMS = {
    F: { seq: [1] },
    Fl: { seq: [0.5, 3.5] },
    "Fl(2)": { seq: [0.5, 1, 0.5, 4] },
    LFl: { seq: [2, 8] },
    Oc: { seq: [4.5, 1.5] },
    Iso: { seq: [2, 2] },
    Q: { seq: [0.3, 0.7] },
    VQ: { seq: [0.2, 0.3] },
    "Q(3)": { seq: [0.3, 0.7, 0.3, 0.7, 0.3, 7.7] },
    "Q(6)+LFl": { seq: [0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 2, 7] },
    "Q(9)": { seq: [0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 0.7, 0.3, 6.7] },
    "Mo(A)": { seq: [0.5, 0.5, 1.5, 5.5] },
    "Al.WR": { seq: [2, 0, 2, 0], colors: ["#ffffff", "#ff4d4d"] },
    "Fl(2+1)": { seq: [0.5, 0.7, 0.5, 1.5, 0.5, 6.3] },
  };
  function rhythmState(name, t) {
    const r = RHYTHMS[name];
    const period = r.seq.reduce((a, b) => a + b, 0);
    let x = ((t % period) + period) % period;
    let flash = 0;
    for (let i = 0; i < r.seq.length; i++) {
      if (x < r.seq[i]) {
        const on = i % 2 === 0;
        return { on, color: r.colors ? r.colors[flash % r.colors.length] : null, period };
      }
      x -= r.seq[i];
      if (i % 2 === 0) flash++;
    }
    return { on: false, period };
  }

  /* ------------------------------- рисование ------------------------------- */
  function glow(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(0.25, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  const COL = { red: "#d93a2b", green: "#1f9d55", yellow: "#f2c230", black: "#1b1d22", white: "#f4f6f8" };

  // Буй, вид сбоку, «стоящий» на воде в точке (x, y). s — масштаб (высота ~ 60*s px).
  function drawBuoy(ctx, x, y, s, spec, night, light) {
    ctx.save();
    ctx.translate(x, y);
    // тень и отражение на воде
    ctx.fillStyle = night ? "rgba(0,0,0,0.35)" : "rgba(0,20,40,0.28)";
    ctx.beginPath(); ctx.ellipse(0, 2 * s, 16 * s, 4.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    const dim = night ? 0.28 : 1;
    const shade = (c) => c;
    ctx.globalAlpha = dim;
    const bands = spec.bands;
    // корпус
    ctx.beginPath();
    if (spec.shape === "can") {
      ctx.rect(-9 * s, -26 * s, 18 * s, 26 * s);
    } else if (spec.shape === "cone") {
      ctx.moveTo(-11 * s, 0); ctx.lineTo(11 * s, 0); ctx.lineTo(0, -30 * s); ctx.closePath();
    } else { // pillar
      ctx.moveTo(-13 * s, 0); ctx.lineTo(13 * s, 0); ctx.lineTo(6 * s, -36 * s); ctx.lineTo(-6 * s, -36 * s); ctx.closePath();
    }
    ctx.save(); ctx.clip();
    const top = spec.shape === "can" ? -26 * s : spec.shape === "cone" ? -30 * s : -36 * s;
    const bh = -top / bands.length;
    bands.forEach((c, i) => { ctx.fillStyle = COL[c] || c; ctx.fillRect(-14 * s, top + i * bh, 28 * s, bh + 0.5); });
    // объём
    const g = ctx.createLinearGradient(-13 * s, 0, 13 * s, 0);
    g.addColorStop(0, "rgba(255,255,255,0.28)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = g; ctx.fillRect(-14 * s, top, 28 * s, -top);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 0.8; ctx.stroke();
    // поплавок/ватерлиния
    ctx.fillStyle = "#2a2f38"; ctx.fillRect(-14 * s, -1.5 * s, 28 * s, 3 * s);
    // мачта и топовая фигура
    let my = top;
    if (spec.topmark) {
      ctx.strokeStyle = "#2a2f38"; ctx.lineWidth = 1.6 * s;
      ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(0, my - 14 * s); ctx.stroke();
      my -= 14 * s;
      drawTopmark(ctx, 0, my, s, spec.topmark, COL[spec.topColor] || spec.topColor || COL.black);
      my -= topmarkHeight(spec.topmark) * s;
    }
    ctx.globalAlpha = 1;
    // огонь
    const ly = my - 5 * s;
    ctx.fillStyle = night ? "#3a4252" : "#c9d1db";
    ctx.beginPath(); ctx.arc(0, ly, 2.6 * s, 0, Math.PI * 2); ctx.fill();
    if (light) {
      glow(ctx, 0, ly, (night ? 26 : 12) * s, light, night ? 0.95 : 0.7);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, ly, 2.2 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return { lightY: y + ly };
  }
  function topmarkHeight(tm) {
    return { can: 11, cone_up: 12, cones_up: 24, cones_down: 24, cones_out: 24, cones_in: 24, balls2: 20, ball: 11, x: 12 }[tm] || 12;
  }
  function drawTopmark(ctx, x, y, s, tm, color) {
    ctx.fillStyle = color;
    const cone = (cy, up) => {
      ctx.beginPath();
      if (up) { ctx.moveTo(x - 6 * s, cy); ctx.lineTo(x + 6 * s, cy); ctx.lineTo(x, cy - 10 * s); }
      else { ctx.moveTo(x - 6 * s, cy - 10 * s); ctx.lineTo(x + 6 * s, cy - 10 * s); ctx.lineTo(x, cy); }
      ctx.closePath(); ctx.fill();
    };
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 0.9;
    const _fill = ctx.fill.bind(ctx);
    ctx.fill = () => { _fill(); ctx.stroke(); };
    if (tm === "can") { ctx.beginPath(); ctx.rect(x - 5 * s, y - 10 * s, 10 * s, 10 * s); ctx.fill(); }
    else if (tm === "cone_up") cone(y, true);
    else if (tm === "cones_up") { cone(y, true); cone(y - 12 * s, true); }
    else if (tm === "cones_down") { cone(y, false); cone(y - 12 * s, false); }
    else if (tm === "cones_out") { cone(y, false); cone(y - 12 * s, true); }   // E: основаниями вместе
    else if (tm === "cones_in") { cone(y, true); cone(y - 12 * s, false); }    // W: вершинами вместе
    else if (tm === "balls2") { [0, 1].forEach((i) => { ctx.beginPath(); ctx.arc(x, y - 5 * s - i * 10 * s, 4.6 * s, 0, Math.PI * 2); ctx.fill(); }); }
    else if (tm === "ball") { ctx.beginPath(); ctx.arc(x, y - 5 * s, 5 * s, 0, Math.PI * 2); ctx.fill(); }
    else if (tm === "x") {
      delete ctx.fill;
      ctx.strokeStyle = color; ctx.lineWidth = 2.2 * s;
      ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 10 * s); ctx.lineTo(x + 5 * s, y); ctx.moveTo(x + 5 * s, y - 10 * s); ctx.lineTo(x - 5 * s, y); ctx.stroke();
    }
    delete ctx.fill;
  }

  function seaBg(ctx, W, H, t, night) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (night) { g.addColorStop(0, "#050b16"); g.addColorStop(1, "#08162a"); }
    else { g.addColorStop(0, "#14567a"); g.addColorStop(1, "#0b3350"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = night ? "rgba(120,160,220,0.05)" : "rgba(255,255,255,0.07)";
    for (let i = 0; i < 80; i++) {
      const rx = ((i * 97 + 37) % 1000) / 1000, ry = ((i * 61 + 111) % 1000) / 1000;
      const x = (rx * W + t * 7) % (W + 40) - 20, y = ry * H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 3, x + 16, y); ctx.stroke();
    }
    ctx.restore();
  }

  function land(ctx, pts, night) {
    ctx.save();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = night ? "#0d1420" : "#cdbf98";
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = night ? "rgba(140,170,210,0.18)" : "rgba(255,255,255,0.55)"; ctx.stroke();
    ctx.restore();
  }

  function ship(ctx, x, y, hdg, k, night, palette) {
    const sh = { L: 92, B: 17, palette: palette || "blue" };
    const st = { sx: x, sy: y, hdg, k };
    L.drawShipBody(ctx, st, sh, night);
    L.drawLights(ctx, st, sh, night);
  }

  function arrow(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 10 * Math.cos(a - 0.4), y2 - 10 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 10 * Math.cos(a + 0.4), y2 - 10 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function panel(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(4,9,18,0.82)"; L.roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function fontPx(W, base) { return Math.max(10.5, Math.min(base, W / 62)); }

  /* -------------------------------- сцены --------------------------------- */
  const CUSTOM = {};

  // 1. Латеральные знаки — регион A / Б
  CUSTOM.iala_lateral = {
    badge: "scene.iala.badge", duration: 15,
    toggles: [{ id: "regionB", key: "scene.iala.region_b" }, { id: "night", key: "scene.night" }],
    steps: [
      { t: 0, key: "scene.iala_lateral.s1" },
      { t: 3.5, key: (o) => (o.regionB ? "scene.iala_lateral.s2b" : "scene.iala_lateral.s2a") },
      { t: 7.5, key: "scene.iala_lateral.s3" },
      { t: 11, key: "scene.iala_lateral.s4" },
    ],
    draw(ctx, S) {
      const { W, H, t, opt, lang } = S;
      const night = opt.night;
      seaBg(ctx, W, H, t, night);
      const font = `600 ${fontPx(W, 12.5)}px Inter, system-ui, sans-serif`;
      // берег и гавань справа
      land(ctx, [[W * 0.74, 0], [W, 0], [W, H * 0.4], [W * 0.86, H * 0.37], [W * 0.8, H * 0.33], [W * 0.75, H * 0.24]], night);
      land(ctx, [[W * 0.74, H], [W, H], [W, H * 0.6], [W * 0.86, H * 0.63], [W * 0.8, H * 0.68], [W * 0.75, H * 0.78]], night);
      // фарватер
      const yTop = H * 0.34, yBot = H * 0.66;
      ctx.save();
      ctx.fillStyle = night ? "rgba(70,110,170,0.05)" : "rgba(120,200,255,0.07)";
      ctx.fillRect(0, yTop, W * 0.8, yBot - yTop);
      ctx.restore();
      // знаки: левая сторона (сверху, если входить с моря на восток) — цилиндр; правая — конус
      const portCol = opt.regionB ? "green" : "red";
      const stbdCol = opt.regionB ? "red" : "green";
      const portLight = opt.regionB ? "#3dff8a" : "#ff4d4d";
      const stbdLight = opt.regionB ? "#ff4d4d" : "#3dff8a";
      const s = Math.max(0.55, Math.min(1, W / 900));
      const xs = [0.14, 0.32, 0.5, 0.66];
      xs.forEach((fx, i) => {
        const r1 = rhythmState(i % 2 ? "Fl(2)" : "Fl", t + i * 0.7);
        const r2 = rhythmState(i % 2 ? "Fl" : "Fl(2)", t + i * 0.9);
        drawBuoy(ctx, W * fx, yTop, s, { shape: "can", bands: [portCol], topmark: "can", topColor: portCol }, night, r1.on ? portLight : null);
        drawBuoy(ctx, W * fx, yBot + 26 * s, s, { shape: "cone", bands: [stbdCol], topmark: "cone_up", topColor: stbdCol }, night, r2.on ? stbdLight : null);
      });
      // огни на молах
      const ph = rhythmState("Fl", t), sb = rhythmState("Fl", t + 2);
      glow(ctx, W * 0.8, H * 0.33, ph.on ? 18 : 4, portLight, night ? 0.9 : 0.5);
      glow(ctx, W * 0.8, H * 0.68, sb.on ? 18 : 4, stbdLight, night ? 0.9 : 0.5);
      // направление ограждения
      arrow(ctx, W * 0.03, H * 0.93, W * 0.2, H * 0.93, "rgba(255,255,255,0.8)");
      ctx.save(); ctx.font = font; ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(T(W < 520 ? "scene.iala.direction_short" : "scene.iala.direction", lang), W * 0.215, H * 0.93); ctx.restore();
      // судно идёт в порт
      const k = W / 1300 * L.SHIP_SCALE;
      const x = -W * 0.08 + (W * 0.86) * Math.min(1, t / (this.duration - 1.5));
      ship(ctx, x, H * 0.5, 90, k, night);
      // подписи сторон
      const portLbl = T(opt.regionB ? "scene.iala.port_b" : "scene.iala.port_a", lang);
      const stbdLbl = T(opt.regionB ? "scene.iala.stbd_b" : "scene.iala.stbd_a", lang);
      L.pill(ctx, W * 0.41, yTop - 60 * s, portLbl, opt.regionB ? "#3dff8a" : "#ff6b6b", font);
      L.pill(ctx, W * 0.41, yBot + 58 * s, stbdLbl, opt.regionB ? "#ff6b6b" : "#3dff8a", font);
      L.pill(ctx, W * 0.9, H * 0.53, T("scene.iala.port_harbour", lang), "#e6edf7", font);
    },
  };

  // 2. Кардинальные знаки
  const CARD = [
    { id: "N", ang: 0, bands: ["black", "yellow"], tm: "cones_up", rh: "Q", rhLbl: "Q" },
    { id: "E", ang: 90, bands: ["black", "yellow", "black"], tm: "cones_out", rh: "Q(3)", rhLbl: "Q(3) 10s" },
    { id: "S", ang: 180, bands: ["yellow", "black"], tm: "cones_down", rh: "Q(6)+LFl", rhLbl: "Q(6)+LFl 15s" },
    { id: "W", ang: 270, bands: ["yellow", "black", "yellow"], tm: "cones_in", rh: "Q(9)", rhLbl: "Q(9) 15s" },
  ];
  CUSTOM.iala_cardinal = {
    badge: "scene.iala.badge", duration: 18, tall: true,
    toggles: [{ id: "night", key: "scene.night" }],
    steps: [
      { t: 0, key: "scene.iala_cardinal.s1" }, { t: 4, key: "scene.iala_cardinal.s2" },
      { t: 8.5, key: "scene.iala_cardinal.s3" }, { t: 13, key: "scene.iala_cardinal.s4" },
    ],
    draw(ctx, S) {
      const { W, H, t, opt, lang } = S;
      const night = opt.night;
      seaBg(ctx, W, H, t, night);
      const font = `600 ${fontPx(W, 12)}px Inter, system-ui, sans-serif`;
      const cx = W * 0.5, cy = H * 0.52, R = Math.min(W * 0.2, H * 0.26);
      // опасность: камни и прибой
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = ((t * 0.6 + i / 3) % 1);
        ctx.strokeStyle = `rgba(255,255,255,${(night ? 0.12 : 0.4) * (1 - a)})`;
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, R * (0.3 + a * 0.25), R * (0.18 + a * 0.15), 0.3, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = night ? "#1a222e" : "#6b6253";
      [[-0.1, 0.02, 0.12], [0.06, -0.04, 0.09], [0.1, 0.06, 0.07], [-0.02, 0.08, 0.06]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.ellipse(cx + dx * R * 2, cy + dy * R * 2, r * R * 2, r * R * 1.4, 0.4, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
      const narrow = W < 520;
      L.pill(ctx, cx, narrow ? cy + R * 0.6 : cy - R * 0.32, T("scene.iala.danger", lang), "#ff6b6b", font);
      // компасная роза-циферблат
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      const s = Math.max(0.85, Math.min(1.5, W / 560));
      CARD.forEach((c, i) => {
        const Rx = narrow ? W * 0.31 : R * 1.12, Rv = narrow ? H * 0.2 : R * 0.86;
        const bx = cx + Math.sin(c.ang * D2R) * Rx, by = cy - Math.cos(c.ang * D2R) * Rv + 30 * s;
        const st = rhythmState(c.rh, t + i * 0.37);
        drawBuoy(ctx, bx, by, s, { shape: "pillar", bands: c.bands, topmark: c.tm, topColor: "black" }, night, st.on ? "#ffffff" : null);
        // подпись сбоку от знака (у W — слева), чтобы не уходила за край
        ctx.save(); ctx.font = font;
        const lbl = narrow ? c.id : `${c.id} · ${c.rhLbl}`, lw = ctx.measureText(lbl).width + 14;
        ctx.restore();
        const lx = c.id === "W" ? bx - 20 * s - lw / 2 : bx + 20 * s + lw / 2;
        L.pill(ctx, lx, by - 18 * s, lbl, "#ffd166", font);
      });
      // судно обходит опасность по часовой стрелке вне круга знаков, всегда «на безопасной стороне»
      const ang = (t / this.duration) * 360 - 30;
      const rx = Math.min(R * 2.1, W * 0.44), ry = narrow ? cy - 70 : Math.min(R * 1.75, cy - 84, H - cy - 30);
      const sx = cx + Math.sin(ang * D2R) * rx, sy = cy - Math.cos(ang * D2R) * ry;
      const k = W / 1500 * L.SHIP_SCALE;
      // курс — по касательной к эллипсу
      const dxa = Math.cos(ang * D2R) * rx, dya = Math.sin(ang * D2R) * ry;
      ship(ctx, sx, sy, Math.atan2(dxa, -dya) / D2R, k, night);
      // подсказка о стороне безопасной воды для ближайшего знака
      const near = CARD.reduce((best, c) => {
        const d = Math.abs(((ang - c.ang + 540) % 360) - 180);
        return d < best.d ? { c, d } : best;
      }, { c: CARD[0], d: 999 }).c;
      if (narrow) L.pill(ctx, cx, H - 12, T(`scene.iala.safe_${near.id}`, lang), "#22d3ee", font);
      else L.pill(ctx, sx, sy < cy ? sy + 52 : sy - 30, T(`scene.iala.safe_${near.id}`, lang), "#22d3ee", font);
    },
  };

  // 3. Характеристики огней
  const CHAR_LIST = ["F", "Fl", "Fl(2)", "LFl", "Oc", "Iso", "Q", "VQ", "Mo(A)", "Al.WR"];
  CUSTOM.light_characters = {
    badge: "scene.lights.badge", duration: 24, loop: true, tall: true, toggles: [],
    steps: [{ t: 0, key: "scene.light_characters.s1" }, { t: 8, key: "scene.light_characters.s2" }, { t: 16, key: "scene.light_characters.s3" }],
    draw(ctx, S) {
      const { W, H, t, lang } = S;
      ctx.fillStyle = "#050b16"; ctx.fillRect(0, 0, W, H);
      const top = 48, rowH = (H - top - 10) / CHAR_LIST.length;
      const font = `700 ${fontPx(W, 13)}px "JetBrains Mono", ui-monospace, monospace`;
      const font2 = `500 ${fontPx(W, 12)}px Inter, system-ui, sans-serif`;
      const narrow = W < 520;
      const barX = narrow ? W * 0.5 : Math.max(170, W * 0.38), barW = W - barX - 18;
      CHAR_LIST.forEach((name, i) => {
        const y = top + i * rowH + rowH / 2;
        const st = rhythmState(name, t);
        const color = st.color || (name === "F" ? "#ffe9a8" : "#fff4cc");
        // фонарь
        ctx.fillStyle = "#151d2b"; ctx.beginPath(); ctx.arc(26, y, 9, 0, Math.PI * 2); ctx.fill();
        if (st.on) { glow(ctx, 26, y, Math.min(26, rowH * 0.7), color, 0.95); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(26, y, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "#ffd166"; ctx.font = font; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillText(name, 48, y - 7);
        ctx.fillStyle = "#9fb0c8"; ctx.font = font2;
        ctx.fillText(T(`scene.lights.${name}`, lang), 48, y + 9, barX - 56);
        // временная диаграмма одного периода
        const r = RHYTHMS[name], period = r.seq.reduce((a, b) => a + b, 0);
        let x = barX, fl = 0;
        ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(barX, y - 6, barW, 12);
        r.seq.forEach((d, j) => {
          const w = (d / period) * barW;
          if (j % 2 === 0) { ctx.fillStyle = r.colors ? r.colors[fl++ % r.colors.length] : "#ffd98a"; ctx.fillRect(x, y - 6, Math.max(1.5, w), 12); }
          x += w;
        });
        const ph = ((t % period) / period) * barW;
        ctx.fillStyle = "#22d3ee"; ctx.fillRect(barX + ph - 1, y - 10, 2, 20);
        ctx.fillStyle = "#5c6790"; ctx.font = `500 ${fontPx(W, 10.5)}px Inter, sans-serif`; ctx.textAlign = "right";
        if (name !== "F") ctx.fillText(`${period % 1 ? period.toFixed(1) : period} s`, W - 18, y - 14);
        ctx.textAlign = "left";
      });
    },
  };

  // 4. Морские районы ГМССБ
  const AREA_EQUIP = {
    A1: ["scene.gmdss.eq_vhf", "scene.gmdss.eq_navtex", "scene.gmdss.eq_epirb", "scene.gmdss.eq_sart"],
    A2: ["scene.gmdss.eq_mf"],
    A3: ["scene.gmdss.eq_inm"],
    A4: ["scene.gmdss.eq_hf"],
  };
  CUSTOM.gmdss_sea_areas = {
    badge: "scene.gmdss.badge", duration: 16, toggles: [],
    steps: [
      { t: 0, key: "scene.gmdss_sea_areas.s1" }, { t: 4.2, key: "scene.gmdss_sea_areas.s2" },
      { t: 8.2, key: "scene.gmdss_sea_areas.s3" }, { t: 12.2, key: "scene.gmdss_sea_areas.s4" },
    ],
    draw(ctx, S) {
      const { W, H, t, lang } = S;
      seaBg(ctx, W, H, t, false);
      const font = `600 ${fontPx(W, 12)}px Inter, system-ui, sans-serif`;
      const st = { x: W * 0.08, y: H * 0.72 };
      // зоны
      const rA1 = W * 0.17, rA2 = W * 0.47;
      ctx.save();
      ctx.fillStyle = "rgba(34,211,238,0.10)"; ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(st.x, st.y, rA2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(34,211,238,0.18)";
      ctx.beginPath(); ctx.arc(st.x, st.y, rA1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      // A4 — полярный район (выше 70°)
      const polarY = H * 0.16;
      const pg = ctx.createLinearGradient(0, 0, 0, polarY);
      pg.addColorStop(0, "rgba(230,240,255,0.55)"); pg.addColorStop(1, "rgba(230,240,255,0.18)");
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, polarY);
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(0, polarY); ctx.lineTo(W, polarY); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = "rgba(255,255,255,0.65)"; const x = (i * 131 + 40) % W; ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 22, 12); ctx.lineTo(x + 8, 22); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      const narrow = W < 520;
      if (narrow) {
        // на телефоне — только обозначения районов, расшифровка в подписи шага
        L.pill(ctx, W * 0.5, polarY - 4, "A4", "#ffffff", font);
        L.pill(ctx, st.x + rA1 * 0.5, st.y - rA1 * 0.62, "A1", "#22d3ee", font);
        L.pill(ctx, st.x + rA2 * 0.62, st.y - rA2 * 0.62, "A2", "#7cc4ff", font);
        L.pill(ctx, W * 0.9, H * 0.42, "A3", "#ffd166", font);
      } else {
        L.pill(ctx, W * 0.3, polarY - 6, T("scene.gmdss.a4", lang), "#ffffff", font);
        L.pill(ctx, st.x + rA1 * 0.72, st.y - rA1 * 0.72, "A1 · " + T("scene.gmdss.a1", lang), "#22d3ee", font);
        L.pill(ctx, st.x + rA2 * 0.8, st.y - rA2 * 0.45, "A2 · " + T("scene.gmdss.a2", lang), "#7cc4ff", font);
        L.pill(ctx, W * 0.83, H * 0.42, "A3 · " + T("scene.gmdss.a3", lang), "#ffd166", font);
      }
      // берег и станция
      land(ctx, [[0, H * 0.45], [W * 0.05, H * 0.5], [W * 0.075, H * 0.62], [W * 0.06, H * 0.8], [W * 0.09, H], [0, H]], false);
      ctx.save();
      ctx.strokeStyle = "#e6edf7"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(st.x - 8, st.y + 10); ctx.lineTo(st.x, st.y - 22); ctx.lineTo(st.x + 8, st.y + 10); ctx.stroke();
      const pulse = (t * 0.9) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pulse)})`;
      ctx.beginPath(); ctx.arc(st.x, st.y - 22, 6 + pulse * 26, -Math.PI * 0.9, -Math.PI * 0.1); ctx.stroke();
      ctx.restore();
      // спутник
      const satX = W * 0.88, satY = H * 0.28;
      ctx.save(); ctx.translate(satX, satY);
      ctx.fillStyle = "#ffd166"; ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = "#3b82f6"; ctx.fillRect(-30, -4, 20, 8); ctx.fillRect(10, -4, 20, 8);
      ctx.restore();
      // путь судна: из порта на восток, затем на север в полярный район
      const pathPts = [[W * 0.1, H * 0.66], [W * 0.3, H * 0.6], [W * 0.55, H * 0.5], [W * 0.63, H * 0.28], [W * 0.56, H * 0.06]];
      const u = Math.min(1, t / (this.duration - 1));
      const seg = u * (pathPts.length - 1), i0 = Math.min(pathPts.length - 2, Math.floor(seg)), f = seg - i0;
      const a = pathPts[i0], b = pathPts[i0 + 1];
      const px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f;
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.setLineDash([2, 6]);
      ctx.beginPath(); pathPts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
      const hdg = Math.atan2(b[0] - a[0], -(b[1] - a[1])) / D2R;
      // текущий район и канал связи: УКВ/ПВ — с берегом, A3 — через спутник, A4 — КВ
      const dist = Math.hypot(px - st.x, py - st.y);
      const area = py < polarY ? "A4" : dist < rA1 ? "A1" : dist < rA2 ? "A2" : "A3";
      ctx.save();
      ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 30; ctx.lineWidth = 1.6;
      if (area === "A1" || area === "A2") {
        ctx.strokeStyle = area === "A1" ? "rgba(34,211,238,0.85)" : "rgba(124,196,255,0.85)";
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(st.x, st.y - 22); ctx.stroke();
      } else if (area === "A3") {
        ctx.strokeStyle = "rgba(255,209,102,0.9)";
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(satX, satY); ctx.stroke();
      } else {
        ctx.setLineDash([]); ctx.strokeStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 3; i++) {
          const a2 = ((t * 0.8 + i / 3) % 1);
          ctx.globalAlpha = 1 - a2;
          ctx.beginPath(); ctx.arc(px, py, 14 + a2 * 60, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke();
        }
      }
      ctx.restore();
      ship(ctx, px, py, hdg, W / 1600 * L.SHIP_SCALE, false);
      const order = ["A1", "A2", "A3", "A4"];
      let list = order.slice(0, order.indexOf(area) + 1).flatMap((ar) => AREA_EQUIP[ar].map((k) => [k, ar === area && ar !== "A1"]));
      if (narrow && area !== "A1") {
        // компактно: «всё для предыдущих районов» + что добавилось
        const prev = order[order.indexOf(area) - 1];
        list = [[T("scene.gmdss.all_of", lang, { area: prev === "A1" ? "A1" : `A1–${prev}` }), false, true]].concat(AREA_EQUIP[area].map((k) => [k, true]));
      }
      const lh = narrow ? 15 : 18;
      const pw = narrow ? Math.min(210, W * 0.6) : Math.min(250, W * 0.42), ph = 32 + list.length * lh;
      const bx = W - pw - 12, by = H - ph - 12;
      panel(ctx, bx, by, pw, ph);
      ctx.fillStyle = "#ffd166"; ctx.font = `700 ${fontPx(W, 13)}px Inter, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(`${T("scene.gmdss.area", lang)} ${area}`, bx + 12, by + 10);
      ctx.font = `500 ${fontPx(W, 11.5)}px Inter, sans-serif`;
      list.forEach(([k, isNew, raw], j) => {
        ctx.fillStyle = isNew ? "#22d3ee" : "#c9d6e8";
        ctx.fillText(`${isNew ? "+ " : "✓ "}${raw ? k : T(k, lang)}`, bx + 12, by + 30 + j * lh, pw - 20);
      });
      return order.indexOf(area);   // подпись шага — по фактическому району, а не по времени
    },
  };

  // 5. Сигнал бедствия ЦИВ
  CUSTOM.dsc_distress = {
    badge: "scene.dsc.badge", duration: 17, toggles: [],
    steps: [
      { t: 0, key: "scene.dsc_distress.s1" }, { t: 2.6, key: "scene.dsc_distress.s2" },
      { t: 5.4, key: "scene.dsc_distress.s3" }, { t: 7.6, key: "scene.dsc_distress.s4" },
      { t: 12.6, key: "scene.dsc_distress.s5" },
    ],
    draw(ctx, S) {
      const { W, H, t, lang } = S;
      seaBg(ctx, W, H, t, false);
      const font = `600 ${fontPx(W, 12)}px Inter, system-ui, sans-serif`;
      land(ctx, [[W * 0.78, 0], [W, 0], [W, H], [W * 0.86, H], [W * 0.82, H * 0.6], [W * 0.8, H * 0.3]], false);
      const ds = W < 520 ? { x: W * 0.26, y: H * 0.36 } : { x: W * 0.3, y: H * 0.46 };
      const cs = { x: W * 0.86, y: H * 0.26 }, rcc = { x: W * 0.9, y: H * 0.5 };
      const k = W / 1500 * L.SHIP_SCALE;
      // судно в бедствии: дым
      for (let i = 0; i < 14; i++) {
        const a = ((t * 0.5 + i / 14) % 1);
        ctx.fillStyle = `rgba(60,60,64,${0.35 * (1 - a)})`;
        ctx.beginPath(); ctx.arc(ds.x + 10 + a * 70, ds.y - 10 - a * 60 + Math.sin(i) * 6, 6 + a * 18, 0, Math.PI * 2); ctx.fill();
      }
      ship(ctx, ds.x, ds.y, 70, k, false, "amber");
      // другие суда
      const narrow = W < 520;
      const o1 = narrow ? { x: W * 0.46, y: H * 0.22 } : { x: W * 0.5, y: H * 0.2 };
      const o2 = narrow ? { x: W * 0.66, y: H * 0.42 } : { x: W * 0.64, y: H * 0.76 };
      const toward = Math.max(0, Math.min(1, (t - 12.6) / 4));
      const p1 = { x: o1.x + (ds.x + 60 - o1.x) * toward * 0.4, y: o1.y + (ds.y - 40 - o1.y) * toward * 0.4 };
      const p2 = { x: o2.x + (ds.x + 60 - o2.x) * toward * 0.4, y: o2.y + (ds.y + 40 - o2.y) * toward * 0.4 };
      const h1 = toward > 0 ? Math.atan2(ds.x - o1.x, -(ds.y - o1.y)) / D2R : 100;
      const h2 = toward > 0 ? Math.atan2(ds.x - o2.x, -(ds.y - o2.y)) / D2R : 80;
      ship(ctx, p1.x, p1.y, h1, k * 0.85, false);
      ship(ctx, p2.x, p2.y, h2, k * 0.85, false);
      // береговая станция и RCC
      ctx.save(); ctx.strokeStyle = "#1f2937"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cs.x - 9, cs.y + 12); ctx.lineTo(cs.x, cs.y - 24); ctx.lineTo(cs.x + 9, cs.y + 12); ctx.stroke();
      ctx.fillStyle = "#f4f6f8"; L.roundRect(ctx, rcc.x - 24, rcc.y - 13, 48, 26, 4); ctx.fill();
      ctx.strokeStyle = "#8a96a6"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#c0392b"; ctx.fillRect(rcc.x - 24, rcc.y - 13, 48, 5);
      ctx.fillStyle = "#1b2433"; ctx.font = `800 ${fontPx(W, 11)}px Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("RCC", rcc.x, rcc.y + 3);
      ctx.restore();
      L.pill(ctx, cs.x, cs.y - 30, T("scene.dsc.coast", lang), "#e6edf7", font);
      // 1) кнопка DISTRESS
      if (t < 2.6) {
        const pw = 170, bx = 14, by = H - 70;
        panel(ctx, bx, by, pw, 56);
        const prog = Math.min(1, t / 2.4);
        ctx.save();
        ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(bx + 30, by + 28, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx + 30, by + 28, 19, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = `700 ${fontPx(W, 12)}px Inter, sans-serif`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillText("DISTRESS", bx + 56, by + 20);
        ctx.fillStyle = "#9fb0c8"; ctx.font = `500 ${fontPx(W, 11)}px Inter, sans-serif`;
        ctx.fillText(`${T("scene.dsc.hold", lang)} ${Math.min(5, Math.floor(prog * 5) + 1)} / 5 s`, bx + 56, by + 38);
        ctx.restore();
      }
      // 2) ЦИВ-вызов на 70 канале — волны от судна
      const ring = (cx, cy, t0, color, max) => {
        if (t < t0) return;
        for (let i = 0; i < 3; i++) {
          const raw = (t - t0) * 0.6 - i * 0.33;
          if (raw < 0) continue;
          const a = raw % 1;
          ctx.strokeStyle = color.replace("A", String(0.75 * (1 - a)));
          ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, a * max, 0, Math.PI * 2); ctx.stroke();
        }
      };
      if (t >= 2.6 && t < 7.5) { ring(ds.x, ds.y, 2.6, "rgba(80,255,170,A)", W * 0.7); L.pill(ctx, ds.x, ds.y + 46, T("scene.dsc.alert", lang), "#50ffaa", font); }
      if (t >= 5.4 && t < 9) { ring(cs.x, cs.y, 5.4, "rgba(120,180,255,A)", W * 0.7); L.pill(ctx, cs.x - 60, cs.y + 40, T("scene.dsc.ack", lang), "#7cc4ff", font); }
      // 3) MAYDAY голосом на 16 канале
      if (t >= 7.6) {
        const lines = T("scene.dsc.mayday", lang).split("|");
        const shown = Math.min(lines.length, Math.floor((t - 7.6) / 0.75) + 1);
        const lh = narrow ? 14 : 17;
        const pw = narrow ? W - 24 : Math.min(340, W * 0.52), ph = 28 + shown * lh;
        const bx = 12, by = H - ph - 12;
        panel(ctx, bx, by, pw, ph);
        ctx.fillStyle = "#ff6b6b"; ctx.font = `700 ${fontPx(W, 11)}px Inter, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("VHF CH 16", bx + 12, by + 8);
        ctx.fillStyle = "#e6edf7"; ctx.font = `600 ${narrow ? 10 : fontPx(W, 11.5)}px "JetBrains Mono", monospace`;
        lines.slice(0, shown).forEach((ln, j) => ctx.fillText(ln, bx + 12, by + 23 + j * lh, pw - 22));
      }
      // 4) RCC координирует
      if (t >= 12.6) {
        ctx.save(); ctx.strokeStyle = "rgba(255,209,102,0.8)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(rcc.x - 22, rcc.y); ctx.lineTo(ds.x + 40, ds.y); ctx.stroke(); ctx.restore();
        L.pill(ctx, (rcc.x + ds.x) / 2, (rcc.y + ds.y) / 2 - 8, T("scene.dsc.sar", lang), "#ffd166", font);
      }
    },
  };

  // 6. Шкала Бофорта — волнение и небо по силе ветра
  const BFT = [ // [узлы, вероятная высота волны м, максимальная м]
    ["0–1", 0, 0], ["1–3", 0.1, 0.1], ["4–6", 0.2, 0.3], ["7–10", 0.6, 1], ["11–16", 1, 1.5], ["17–21", 2, 2.5],
    ["22–27", 3, 4], ["28–33", 4, 5.5], ["34–40", 5.5, 7.5], ["41–47", 7, 10], ["48–55", 9, 12.5], ["56–63", 11.5, 16], ["≥ 64", 14, 14],
  ];
  CUSTOM.beaufort_sea = {
    badge: "scene.bft.badge", duration: 39, slider: { min: 0, max: 12, step: 1, key: "scene.bft.force" }, toggles: [],
    dynamicCaption: true,
    caption(S) { const f = S.force; return `${T(`bft.name.${f}`, S.lang)} — ${T(`bft.sea.${f}`, S.lang)}`; },
    forceAt(t) { return Math.min(12, Math.floor(t / 3)); },
    draw(ctx, S) {
      const { W, H, t, lang } = S;
      const f = S.force, fr = f / 12;
      const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * (k === undefined ? fr : k)));
      const rgb = (c, a) => (a === undefined ? `rgb(${c})` : `rgba(${c},${a})`);
      const hash = (i, j) => { const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
      const horizon = H * 0.42;
      // небо
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, rgb(mix([96, 158, 214], [34, 39, 48]))); sky.addColorStop(1, rgb(mix([196, 222, 240], [92, 99, 110])));
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
      // облака: от редких кучевых до сплошной низкой облачности
      const nCl = 3 + Math.round(fr * 12);
      for (let i = 0; i < nCl; i++) {
        const sp = 4 + f * 5;
        const x = ((hash(i, 1) * (W + 400) + t * sp) % (W + 400)) - 200;
        const y = horizon * (0.12 + hash(i, 2) * 0.55 * (1 - fr * 0.4));
        const sc = (0.6 + hash(i, 3)) * (1 + fr * 0.8);
        ctx.fillStyle = rgb(mix([255, 255, 255], [64, 70, 80]), 0.5 + fr * 0.4);
        [[0, 0, 60, 16], [34, -10, 42, 15], [-30, -4, 36, 12], [70, 2, 40, 11]].forEach(([dx, dy, rx, ry]) => {
          ctx.beginPath(); ctx.ellipse(x + dx * sc, y + dy * sc, rx * sc, ry * sc, 0, 0, Math.PI * 2); ctx.fill();
        });
      }
      // ряды волн в перспективе: от горизонта (мелкие, сжатые) к переднему плану
      const ROWS = 18;
      const mPx = H * 0.011;                         // пикселей на метр высоты волны (масштаб условный)
      const hWave = BFT[f][1];
      const lam0 = W * (0.035 + fr * 0.75);          // длина волны на переднем плане, px
      const omega = 1.2 + fr * 0.9;
      const deep = mix([24, 92, 132], [44, 58, 64]), near = mix([10, 52, 82], [28, 38, 44]);
      const foamProb = [0, 0, 0, 0.06, 0.25, 0.45, 0.62, 0.75, 0.84, 0.9, 0.95, 1, 1][f];
      const rows = [];
      for (let r = 0; r < ROWS; r++) {
        const u = (r + 1) / ROWS, p = 0.12 + 0.88 * Math.pow(u, 1.5);
        rows.push({ r, p, base: horizon + (H - horizon) * Math.pow(u, 1.55) * 0.98, A: Math.max(0.4, hWave * mPx * p * 0.5), k: (2 * Math.PI) / (lam0 * p), ph: hash(r, 9) * 6.28 });
      }
      const yAt = (row, x) => row.base - row.A * (Math.sin(row.k * x - omega * t + row.ph) * 0.8 + Math.sin(row.k * 2.1 * x - omega * 1.45 * t + row.ph * 2) * 0.2);
      const drawRow = (row) => {
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + 4; x += 4) ctx.lineTo(x, yAt(row, x));
        ctx.lineTo(W, H); ctx.closePath();
        const c = mix(deep, near, row.r / ROWS);
        const g = ctx.createLinearGradient(0, row.base - row.A * 1.1, 0, row.base + row.A + 14 * row.p);
        const hi = Math.min(0.3, 0.02 + hWave * 0.05);   // блик гребня — только когда есть волна
        g.addColorStop(0, rgb(mix(c, [210, 225, 232], hi))); g.addColorStop(0.45, rgb(c)); g.addColorStop(1, rgb(c));
        ctx.fillStyle = g; ctx.fill();
        // барашки на гребнях — стабильные, «едут» вместе с волной
        if (foamProb > 0) {
          const lam = (2 * Math.PI) / row.k;
          const n0 = Math.floor(((omega * t - row.ph) / (2 * Math.PI)) - 2), n1 = n0 + Math.ceil(W / lam) + 4;
          for (let n = n0; n <= n1; n++) {
            if (hash(row.r, n) > foamProb) continue;
            const xc = (Math.PI / 2 + 2 * Math.PI * n + omega * t - row.ph) / row.k;
            if (xc < -lam || xc > W + lam) continue;
            const w = lam * (0.12 + fr * 0.3) * (0.6 + hash(n, row.r) * 0.8);
            ctx.fillStyle = `rgba(245,250,252,${0.55 + fr * 0.35})`;
            ctx.beginPath(); ctx.moveTo(xc - w, yAt(row, xc - w) + 1);
            for (let x = xc - w; x <= xc + w; x += 3) ctx.lineTo(x, yAt(row, x) - 0.6);
            for (let x = xc + w; x >= xc - w * 0.4; x -= 3) ctx.lineTo(x, yAt(row, x) + (2 + 4 * fr) * row.p * (1 - Math.abs(x - xc) / w));
            ctx.closePath(); ctx.fill();
            // срыв гребней и брызги (7+)
            if (f >= 8) {
              for (let j = 0; j < 4 + (f - 8) * 3; j++) {
                const age = ((t * 1.4 + hash(n, j)) % 1);
                const sx = xc + age * 60 * row.p * (1 + fr) + j * 2, sy = yAt(row, xc) - age * (10 + 18 * fr) * row.p + age * age * 14 * row.p;
                ctx.fillStyle = `rgba(240,246,250,${0.6 * (1 - age)})`;
                ctx.fillRect(sx, sy, 1.6 * row.p + 0.6, 1.2 * row.p + 0.6);
              }
            }
          }
        }
        // полосы пены по ветру (7+)
        if (f >= 7) {
          ctx.strokeStyle = `rgba(240,246,250,${0.1 + (f - 7) * 0.06})`; ctx.lineWidth = 0.8 + row.p;
          for (let j = 0; j < 2 + (f - 7) * 2; j++) {
            const x = ((hash(row.r, j + 50) * (W + 200) + t * 40 * row.p) % (W + 200)) - 100;
            const len = (40 + hash(j, row.r) * 80) * row.p * (1 + fr);
            ctx.beginPath();
            for (let xx = x; xx < x + len; xx += 6) ctx.lineTo(xx, yAt(row, xx) + 3 * row.p);
            ctx.stroke();
          }
        }
      };
      // горизонт
      ctx.fillStyle = rgb(deep); ctx.fillRect(0, horizon, W, H - horizon);
      // судно — на ряду ближе к переднему плану, встаёт и проваливается на волне
      const shipRow = rows[Math.round(ROWS * 0.58)];
      const sL = Math.min(W * 0.4, 420), sx = W * 0.57;
      const yb = yAt(shipRow, sx - sL * 0.42), ys = yAt(shipRow, sx + sL * 0.42), ym = yAt(shipRow, sx);
      const pitch = Math.atan2(ys - yb, sL * 0.84) * 0.85;
      const shipY = (yb + ys + ym * 2) / 4;
      rows.forEach((row) => {
        drawRow(row);
        if (row === shipRow) {
          drawFreighter(ctx, sx, shipY, sL, pitch);
          // вода перед корпусом (та же волна) — корпус «сидит» в воде
          ctx.beginPath(); ctx.moveTo(sx - sL * 0.6, H);
          for (let x = sx - sL * 0.6; x <= sx + sL * 0.6; x += 4) ctx.lineTo(x, yAt(row, x) + 3);
          ctx.lineTo(sx + sL * 0.6, H); ctx.closePath();
          ctx.fillStyle = rgb(mix(deep, near, row.r / ROWS)); ctx.fill();
          // бурун у форштевня
          if (f >= 3) {
            const bx = sx - sL * 0.5 * Math.cos(pitch), by = yAt(row, bx);
            ctx.fillStyle = `rgba(245,250,252,${0.35 + fr * 0.5})`;
            ctx.beginPath(); ctx.ellipse(bx, by, 14 + fr * 30, 3 + fr * 7, 0, Math.PI, 0); ctx.fill();
          }
        }
      });
      // при шторме море «белеет», видимость падает
      if (f >= 9) {
        ctx.fillStyle = `rgba(225,232,238,${(f - 8) * 0.05})`; ctx.fillRect(0, horizon - 10, W, H - horizon + 10);
      }
      // ветер и летящие брызги
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + fr * 0.22})`; ctx.lineWidth = 1;
      for (let i = 0; i < 3 + f * 4; i++) {
        const x = ((hash(i, 70) * (W + 160) + t * (60 + f * 55)) % (W + 160)) - 80, y = H * 0.08 + hash(i, 71) * H * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + f * 5, y + f * 0.4); ctx.stroke();
      }
      if (f >= 10) {
        const haze = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 40);
        haze.addColorStop(0, "rgba(160,168,178,0)"); haze.addColorStop(0.5, `rgba(170,178,188,${0.25 + (f - 10) * 0.15})`); haze.addColorStop(1, "rgba(160,168,178,0)");
        ctx.fillStyle = haze; ctx.fillRect(0, horizon - 40, W, 80);
      }
      // карточка
      const pw = Math.min(250, W * 0.46), ph = 84;
      const px0 = 12, py0 = 48;
      panel(ctx, px0, py0, pw, ph);
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "#ffd166"; ctx.font = `800 ${Math.round(fontPx(W, 30) * 2)}px Inter, sans-serif`; ctx.fillText(String(f), px0 + 12, py0 + 10);
      const tx = px0 + 14 + ctx.measureText(String(f)).width + 12;
      ctx.fillStyle = "#ffffff"; ctx.font = `700 ${fontPx(W, 14)}px Inter, sans-serif`; ctx.fillText(T(`bft.name.${f}`, lang), tx, py0 + 12);
      ctx.fillStyle = "#c9d6e8"; ctx.font = `500 ${fontPx(W, 12)}px Inter, sans-serif`;
      ctx.fillText(`${BFT[f][0]} ${T("scene.bft.kn", lang)}`, tx, py0 + 34);
      const dec = (v) => String(v).replace(".", lang === "ru" ? "," : ".");
      ctx.fillText(f === 0 ? T("scene.bft.no_waves", lang) : T("scene.bft.waves", lang, { h: dec(BFT[f][1]), m: dec(BFT[f][2]) }), px0 + 12, py0 + 60);
    },
  };

  // Сухогруз, вид сбоку, нос влево (идёт против волны). (x, y) — середина ватерлинии.
  function drawFreighter(ctx, x, y, Lp, ang) {
    const D = Lp * 0.075, Tq = Lp * 0.05;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // корпус
    ctx.beginPath();
    ctx.moveTo(-Lp * 0.53, -D * 1.25);
    ctx.lineTo(Lp * 0.49, -D);
    ctx.lineTo(Lp * 0.5, Tq * 0.2);
    ctx.quadraticCurveTo(Lp * 0.48, Tq, Lp * 0.42, Tq);
    ctx.lineTo(-Lp * 0.4, Tq);
    ctx.quadraticCurveTo(-Lp * 0.47, Tq, -Lp * 0.48, 0);
    ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = "#1d2735"; ctx.fillRect(-Lp, -D * 2, Lp * 2, D * 2);
    ctx.fillStyle = "#9b2f24"; ctx.fillRect(-Lp, -Lp * 0.008, Lp * 2, Tq * 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(-Lp, -D * 1.3, Lp * 2, D * 0.25);
    ctx.restore();
    // марки и название — тонкая линия палубы
    ctx.strokeStyle = "#e8edf3"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-Lp * 0.5, -D * 1.22); ctx.lineTo(Lp * 0.49, -D * 0.98); ctx.stroke();
    // контейнеры / люки
    const cols = ["#2f6db0", "#c0392b", "#2f8f6a", "#d9a441", "#4b78a8", "#8e44ad"];
    for (let i = 0; i < 9; i++) {
      const bx = -Lp * 0.4 + i * Lp * 0.072;
      const deck = -D * 1.22 + (D * 0.24) * ((bx + Lp * 0.5) / Lp);
      const hgt = Lp * (0.03 + ((i * 37) % 3) * 0.008);
      ctx.fillStyle = cols[(i * 5) % cols.length];
      ctx.fillRect(bx, deck - hgt, Lp * 0.066, hgt);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(bx + Lp * 0.033, deck - hgt, 1, hgt);
    }
    // надстройка у кормы
    const sx0 = Lp * 0.3, deckS = -D * 1.03;
    ctx.fillStyle = "#eef2f6"; ctx.fillRect(sx0, deckS - Lp * 0.13, Lp * 0.13, Lp * 0.13);
    ctx.fillStyle = "#dfe5ec"; ctx.fillRect(sx0 - Lp * 0.012, deckS - Lp * 0.145, Lp * 0.155, Lp * 0.02);
    ctx.fillStyle = "#2a3b52";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) ctx.fillRect(sx0 + Lp * 0.012 + c * Lp * 0.023, deckS - Lp * 0.115 + r * Lp * 0.035, Lp * 0.013, Lp * 0.012);
    ctx.fillStyle = "#c0392b"; ctx.fillRect(sx0 + Lp * 0.06, deckS - Lp * 0.2, Lp * 0.05, Lp * 0.06);
    ctx.fillStyle = "#1b1d22"; ctx.fillRect(sx0 + Lp * 0.06, deckS - Lp * 0.205, Lp * 0.05, Lp * 0.012);
    // мачты
    ctx.strokeStyle = "#cfd6de"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-Lp * 0.44, -D * 1.24); ctx.lineTo(-Lp * 0.44, -D * 1.24 - Lp * 0.09); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx0 + Lp * 0.04, deckS - Lp * 0.145); ctx.lineTo(sx0 + Lp * 0.04, deckS - Lp * 0.22); ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------- плеер ---------------------------------- */
  function mountCustom(container, name, lang) {
    const sc = CUSTOM[name];
    container.innerHTML = "";
    container.classList.add("scene");
    const root = document.createElement("div");
    root.className = "scene-root";
    const tg = (sc.toggles || []).map((x) => `<button type="button" class="scene-tgl" data-tgl="${x.id}">${T(x.key, lang)}</button>`).join("");
    const slider = sc.slider ? `<div class="scene-slider"><span>${T(sc.slider.key, lang)}</span><input type="range" class="scene-force" min="${sc.slider.min}" max="${sc.slider.max}" step="${sc.slider.step}" value="0"><b class="scene-force-val">0</b></div>` : "";
    root.innerHTML = `
      <div class="scene-stage">
        <canvas class="scene-canvas${sc.tall ? " tall" : ""}"></canvas>
        <div class="scene-top">
          <span class="scene-rule">${T(sc.badge, lang)}</span>
          <div class="scene-toggles">${tg}</div>
        </div>
      </div>
      <div class="scene-bar">
        <div class="scene-caption"><span class="scene-step"></span><span class="scene-text"></span></div>
        ${slider}
        <div class="scene-controls">
          <button type="button" class="scene-btn scene-play" aria-label="Play/Pause"></button>
          <button type="button" class="scene-btn scene-restart" aria-label="Restart">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          </button>
          <div class="scene-track"><div class="scene-ticks"></div><input type="range" class="scene-range" min="0" max="1000" value="0"></div>
        </div>
      </div>`;
    container.appendChild(root);
    const canvas = root.querySelector(".scene-canvas");
    const ctx = canvas.getContext("2d");
    const stepEl = root.querySelector(".scene-step"), textEl = root.querySelector(".scene-text");
    const playBtn = root.querySelector(".scene-play"), range = root.querySelector(".scene-range");
    const forceIn = root.querySelector(".scene-force"), forceVal = root.querySelector(".scene-force-val");
    const opt = {};
    (sc.toggles || []).forEach((x) => { opt[x.id] = !!x.default; });
    (sc.steps || []).forEach((s, i) => {
      const d = document.createElement("span"); d.style.left = `${(s.t / sc.duration) * 100}%`; d.title = String(i + 1);
      root.querySelector(".scene-ticks").appendChild(d);
    });
    let t = 0, playing = true, last = null, raf = null, visible = true, W = 0, H = 0, dpr = 1, lastText = "";
    let manualForce = null;

    function setText(step, text) {
      stepEl.textContent = step;
      if (text === lastText) return;
      lastText = text;
      textEl.classList.remove("in"); void textEl.offsetWidth; textEl.textContent = text; textEl.classList.add("in");
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      W = Math.max(280, r.width); H = Math.max(200, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      draw();
    }
    function draw() {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const force = sc.slider ? (manualForce !== null ? manualForce : sc.forceAt(t)) : 0;
      const S = { W, H, t, opt, lang, force };
      const forcedStep = sc.draw(ctx, S);
      if (sc.dynamicCaption) {
        setText("", sc.caption(S));
        if (forceIn && document.activeElement !== forceIn) { forceIn.value = String(force); }
        if (forceVal) forceVal.textContent = String(force);
      } else {
        let si = 0; (sc.steps || []).forEach((s, i) => { if (t >= s.t) si = i; });
        if (typeof forcedStep === "number" && sc.steps[forcedStep]) si = forcedStep;
        const st = sc.steps[si];
        const key = typeof st.key === "function" ? st.key(opt) : st.key;
        setText(`${si + 1}/${sc.steps.length}`, T(key, lang));
      }
      range.value = String(Math.round((t / sc.duration) * 1000));
    }
    function frame(ts) {
      raf = null;
      if (!visible) { last = null; return; }
      if (last === null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (playing) {
        t += dt;
        if (t >= sc.duration) { if (sc.loop) t = 0; else { t = sc.duration; playing = false; updatePlay(); } }
      }
      draw();
      // волны и огни продолжают жить и на паузе в сцене Бофорта (ручной режим)
      if (playing || manualForce !== null) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = null; raf = requestAnimationFrame(frame); } }
    function updatePlay() {
      playBtn.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
    playBtn.addEventListener("click", () => {
      if (!playing && t >= sc.duration) t = 0;
      manualForce = null; playing = !playing; updatePlay(); kick();
    });
    root.querySelector(".scene-restart").addEventListener("click", () => { t = 0; manualForce = null; playing = true; updatePlay(); kick(); });
    range.addEventListener("input", () => { t = (Number(range.value) / 1000) * sc.duration; manualForce = null; playing = false; updatePlay(); draw(); });
    if (forceIn) forceIn.addEventListener("input", () => { manualForce = Number(forceIn.value); playing = false; updatePlay(); kick(); });
    root.querySelectorAll(".scene-tgl").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.tgl; opt[k] = !opt[k]; b.classList.toggle("on", opt[k]);
      if (k === "night") root.classList.toggle("is-night", opt[k]);
      lastText = ""; draw();
    }));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((ents) => { visible = ents.some((e) => e.isIntersecting); if (visible && (playing || manualForce !== null)) kick(); }, { threshold: 0.05 }).observe(root);
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    updatePlay();
    requestAnimationFrame(() => { resize(); kick(); });
    root.__seek = (sec, force) => { t = sec; playing = false; manualForce = force === undefined ? null : force; updatePlay(); draw(); };
    return root;
  }

  window.ShipHelperScenes = {
    has: (n) => !!CUSTOM[n] || base.has(n),
    mount: (c, n, lang) => (CUSTOM[n] ? mountCustom(c, n, lang) : base.mount(c, n, lang)),
    _lib: base._lib,
  };
})();
