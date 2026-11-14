/*
 * colregs-scenes.js — интерактивные сцены к МППСС-72 (замена старых SVG/SMIL-анимаций).
 *
 * Что изменилось по сравнению с core/diagrams.py (отзыв пользователя: «анимации
 * устаревшие, как двадцать лет назад»):
 *   • вид сверху в масштабе, как на прокладке/ECDIS: корпус судна с надстройкой и
 *     люковыми крышками, кильватерный след, пеленг между судами;
 *   • режим «Ночь» — видны только навигационные огни, а по кнопке «Секторы» —
 *     сектора их видимости (именно это и проверяют на экзамене);
 *   • сцена идёт по шагам: подпись меняется вместе с действием, есть пауза,
 *     перемотка по шкале и повтор; звуковые сигналы показаны кольцами;
 *   • всё рисуется на <canvas> в реальном разрешении экрана (резко на телефоне).
 *
 * Логика манёвров (кто уступает, куда отворачивает) соответствует МППСС;
 * геометрия условная (для наглядности суда крупнее масштаба расстояний).
 *
 * API: window.ShipHelperScenes = { has(name), mount(container, name, lang) }
 * Тексты — через i18n (ключи scene.*), как и весь остальной интерфейс.
 */
(function () {
  "use strict";

  const T = (key, lang) => window.ShipHelperI18n.t(key, lang);
  const D2R = Math.PI / 180;
  const norm360 = (a) => ((a % 360) + 360) % 360;
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180; // кратчайший поворот a→b, градусы

  /* ----------------------------------------------------------------------- */
  /* Описание сцен. Координаты — условные метры, север вверх (−y), курс по   */
  /* часовой от севера. man: манёвры {t, to, rate} (поворот на курс to со    */
  /* скоростью rate °/с) и {t, speed} (смена скорости).                      */
  /* ----------------------------------------------------------------------- */
  const SCENES = {
    head_on: {
      rule: 14, duration: 13,
      ships: [
        { id: "A", x: -540, y: 0, hdg: 90, speed: 42, L: 92, B: 17, palette: "blue",
          man: [{ t: 3.0, to: 128, rate: 16 }, { t: 8.6, to: 90, rate: 10 }],
          labels: [{ from: 0, to: 2.9, key: "scene.lbl.risk", role: "warn" }, { from: 3.0, to: 13, key: "scene.lbl.alter_stbd", role: "give" }] },
        { id: "B", x: 540, y: -14, hdg: 270, speed: 42, L: 92, B: 17, palette: "amber",
          man: [{ t: 3.2, to: 308, rate: 16 }, { t: 8.8, to: 270, rate: 10 }],
          labels: [{ from: 3.2, to: 13, key: "scene.lbl.alter_stbd", role: "give" }] },
      ],
      signals: [{ ship: "A", t: 3.0, key: "scene.sig.one_short", n: 1 }, { ship: "B", t: 3.3, key: "scene.sig.one_short", n: 1 }],
      bearing: { from: "A", to: "B", until: 3.0 },
      steps: [
        { t: 0, key: "scene.head_on.s1" }, { t: 3.0, key: "scene.head_on.s2" },
        { t: 6.4, key: "scene.head_on.s3" }, { t: 9.2, key: "scene.head_on.s4" },
      ],
      view: { cx: 0, cy: 0, w: 1300 },
    },

    crossing: {
      rule: 15, duration: 14,
      ships: [
        { id: "A", x: 0, y: 470, hdg: 0, speed: 38, L: 92, B: 17, palette: "blue",
          man: [{ t: 2.6, to: 72, rate: 16 }, { t: 9.8, to: 0, rate: 9 }],
          labels: [{ from: 0, to: 2.5, key: "scene.lbl.risk", role: "warn" }, { from: 2.6, to: 14, key: "scene.lbl.give_way", role: "give" }] },
        { id: "B", x: 470, y: -6, hdg: 270, speed: 38, L: 92, B: 17, palette: "amber",
          man: [],
          labels: [{ from: 1.2, to: 14, key: "scene.lbl.stand_on", role: "stand" }] },
      ],
      signals: [{ ship: "A", t: 2.6, key: "scene.sig.one_short", n: 1 }],
      bearing: { from: "A", to: "B", until: 2.6 },
      steps: [
        { t: 0, key: "scene.crossing.s1" }, { t: 2.6, key: "scene.crossing.s2" },
        { t: 6.0, key: "scene.crossing.s3" }, { t: 9.6, key: "scene.crossing.s4" },
      ],
      view: { cx: 60, cy: 120, w: 1180 },
    },

    overtaking: {
      rule: 13, duration: 15,
      ships: [
        { id: "B", x: -230, y: 0, hdg: 90, speed: 13, L: 104, B: 19, palette: "amber", man: [],
          labels: [{ from: 1.5, to: 15, key: "scene.lbl.overtaken", role: "stand" }] },
        { id: "A", x: -500, y: 60, hdg: 90, speed: 46, L: 84, B: 15, palette: "blue",
          man: [{ t: 2.4, to: 116, rate: 9 }, { t: 5.6, to: 90, rate: 7 }],
          labels: [{ from: 0, to: 15, key: "scene.lbl.overtaking", role: "give" }] },
      ],
      sternSector: { ship: "B", from: 0, to: 4.5 },
      steps: [
        { t: 0, key: "scene.overtaking.s1" }, { t: 2.6, key: "scene.overtaking.s2" },
        { t: 6.5, key: "scene.overtaking.s3" }, { t: 10.0, key: "scene.overtaking.s4" },
      ],
      view: { cx: 20, cy: 40, w: 1250 },
    },

    narrow_channel: {
      rule: 9, duration: 15,
      channel: { y1: -150, y2: 150 },
      ships: [
        { id: "A", x: -560, y: 72, hdg: 90, speed: 34, L: 92, B: 17, palette: "blue", man: [],
          labels: [{ from: 0, to: 15, key: "scene.lbl.keep_stbd", role: "give" }] },
        { id: "B", x: 560, y: -72, hdg: 270, speed: 34, L: 92, B: 17, palette: "amber", man: [],
          labels: [{ from: 0, to: 15, key: "scene.lbl.keep_stbd", role: "give" }] },
        { id: "Y", x: 430, y: -215, hdg: 180, speed: 0, L: 30, B: 9, palette: "sail", kind: "sail",
          man: [{ t: 9.0, speed: 44 }],
          labels: [{ from: 0.8, to: 8.9, key: "scene.lbl.not_impede", role: "warn" }, { from: 9.0, to: 15, key: "scene.lbl.crosses_after", role: "stand" }] },
      ],
      steps: [
        { t: 0, key: "scene.narrow_channel.s1" }, { t: 4.5, key: "scene.narrow_channel.s2" },
        { t: 8.2, key: "scene.narrow_channel.s3" }, { t: 11.2, key: "scene.narrow_channel.s4" },
      ],
      view: { cx: 0, cy: -20, w: 1250 },
    },

    restricted_visibility: {
      rule: 19, duration: 15, fog: { ship: "A", radius: 150 },
      radar: { ship: "A" },
      ships: [
        { id: "A", x: 0, y: 250, hdg: 0, speed: 22, L: 92, B: 17, palette: "blue",
          man: [{ t: 4.6, to: 62, rate: 9 }, { t: 11.2, to: 15, rate: 7 }],
          labels: [{ from: 4.6, to: 15, key: "scene.lbl.alter_stbd", role: "give" }] },
        { id: "B", x: -120, y: -300, hdg: 170, speed: 26, L: 92, B: 17, palette: "amber", man: [], echo: true },
      ],
      signals: [{ ship: "A", t: 0.4, key: "scene.sig.prolonged", n: 1, long: true },
                { ship: "B", t: 1.6, key: "scene.sig.prolonged", n: 1, long: true }],
      steps: [
        { t: 0, key: "scene.restricted_visibility.s1" }, { t: 2.4, key: "scene.restricted_visibility.s2" },
        { t: 4.6, key: "scene.restricted_visibility.s3" }, { t: 9.6, key: "scene.restricted_visibility.s4" },
      ],
      view: { cx: 0, cy: 10, w: 1350 },
    },

    light_sectors: {
      rule: 21, duration: 16, sectorsAlways: true, observer: { ship: "S", radius: 330, start: -30, period: 16 },
      ships: [{ id: "S", x: 0, y: 0, hdg: 0, speed: 0, L: 120, B: 22, palette: "blue", man: [] }],
      steps: [
        { t: 0, key: "scene.light_sectors.s1" }, { t: 0.9, key: "scene.light_sectors.s2" },
        { t: 3.0, key: "scene.light_sectors.s3" }, { t: 6.3, key: "scene.light_sectors.s4" },
        { t: 12.3, key: "scene.light_sectors.s3" },
      ],
      view: { cx: 0, cy: 0, w: 900 },
    },
  };
  // Старое имя схемы из темы «Огни и знаки» — та же интерактивная сцена.
  const ALIASES = { arcs_of_visibility: "light_sectors" };

  const PALETTES = {
    blue: { hatch: "#4b78a8", hatch2: "#3b6390", funnel: "#2f5d8c" },
    amber: { hatch: "#b5653a", hatch2: "#94512c", funnel: "#c0392b" },
    sail: { hatch: "#d9cfb5", hatch2: "#bfb294", funnel: "#888" },
  };
  const ROLE_COLORS = { give: "#f5b041", stand: "#22d3ee", warn: "#ff6b6b", none: "#e6edf7" };

  /* ----------------------------- траектории ----------------------------- */
  const FPS = 60;
  // Суда рисуются крупнее масштаба расстояний — иначе на экране телефона
  // они превращаются в точки. Геометрия манёвра при этом не меняется.
  const SHIP_SCALE = 1.75;
  function simulate(ship, duration) {
    const n = Math.ceil(duration * FPS) + 1;
    const out = new Array(n);
    let x = ship.x, y = ship.y, hdg = ship.hdg, speed = ship.speed;
    let target = null, rate = 0;
    const man = (ship.man || []).slice().sort((a, b) => a.t - b.t);
    let mi = 0;
    for (let i = 0; i < n; i++) {
      const t = i / FPS;
      while (mi < man.length && man[mi].t <= t) {
        const m = man[mi++];
        if (m.to !== undefined) { target = m.to; rate = m.rate || 10; }
        if (m.speed !== undefined) speed = m.speed;
      }
      if (target !== null) {
        const d = angDiff(hdg, target);
        const step = rate / FPS;
        if (Math.abs(d) <= step) { hdg = target; target = null; } else hdg = norm360(hdg + Math.sign(d) * step);
      }
      out[i] = { x, y, hdg };
      x += Math.sin(hdg * D2R) * speed / FPS;
      y -= Math.cos(hdg * D2R) * speed / FPS;
    }
    return out;
  }
  function stateAt(traj, t) {
    const f = Math.max(0, Math.min(traj.length - 1, t * FPS));
    const i = Math.floor(f), j = Math.min(traj.length - 1, i + 1), k = f - i;
    const a = traj[i], b = traj[j];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, hdg: norm360(a.hdg + angDiff(a.hdg, b.hdg) * k) };
  }

  /* ------------------------------- рисование ------------------------------ */
  function hullPath(ctx, L, B) {
    const h = L / 2, b = B / 2;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.bezierCurveTo(b * 0.55, -h + L * 0.06, b, -h + L * 0.2, b, -h + L * 0.32);
    ctx.lineTo(b, h - L * 0.07);
    ctx.quadraticCurveTo(b, h, b * 0.7, h);
    ctx.lineTo(-b * 0.7, h);
    ctx.quadraticCurveTo(-b, h, -b, h - L * 0.07);
    ctx.lineTo(-b, -h + L * 0.32);
    ctx.bezierCurveTo(-b, -h + L * 0.2, -b * 0.55, -h + L * 0.06, 0, -h);
    ctx.closePath();
  }

  function drawShipBody(ctx, s, sh, night) {
    const { L, B } = sh;
    const pal = PALETTES[sh.palette] || PALETTES.blue;
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(s.hdg * D2R);
    ctx.scale(s.k, s.k);
    if (sh.kind === "sail") {
      // яхта: узкий корпус, мачта, парус
      ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      hullPath(ctx, L, B);
      ctx.fillStyle = night ? "#1a2432" : "#f4f1e8"; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = 1 / s.k; ctx.strokeStyle = night ? "#2c3a4e" : "#8a8270"; ctx.stroke();
      if (!night) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath(); ctx.moveTo(0, -L * 0.18); ctx.quadraticCurveTo(B * 0.9, L * 0.05, 0, L * 0.32); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#6b6252"; ctx.lineWidth = 1.2 / s.k; ctx.beginPath(); ctx.moveTo(0, -L * 0.18); ctx.lineTo(0, L * 0.32); ctx.stroke();
      }
      ctx.restore();
      return;
    }
    // тень
    ctx.shadowColor = night ? "transparent" : "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 10; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4;
    hullPath(ctx, L, B);
    if (night) {
      ctx.fillStyle = "#121b28";
    } else {
      const g = ctx.createLinearGradient(-B / 2, 0, B / 2, 0);
      g.addColorStop(0, "#c9d3df"); g.addColorStop(0.5, "#f4f7fb"); g.addColorStop(1, "#c3cdd9");
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1.1 / s.k;
    ctx.strokeStyle = night ? "#263446" : "#6c7d92";
    ctx.stroke();
    if (night) { ctx.restore(); return; }
    // палуба: фальшборт
    ctx.save();
    hullPath(ctx, L * 0.93, B * 0.8);
    ctx.fillStyle = "#e9edf2"; ctx.fill();
    ctx.restore();
    // люковые крышки
    const n = Math.max(3, Math.round(L / 22));
    const y0 = -L / 2 + L * 0.2, y1 = L / 2 - L * 0.34;
    const hl = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const yy = y0 + i * hl + hl * 0.12;
      ctx.fillStyle = i % 2 ? pal.hatch2 : pal.hatch;
      roundRect(ctx, -B * 0.32, yy, B * 0.64, hl * 0.76, 1.2);
      ctx.fill();
    }
    // надстройка (корма) и мостик
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, -B * 0.42, L / 2 - L * 0.3, B * 0.84, L * 0.17, 2); ctx.fill();
    ctx.strokeStyle = "#9aa8b8"; ctx.lineWidth = 0.8 / s.k; ctx.stroke();
    ctx.fillStyle = "#33465e";
    ctx.fillRect(-B * 0.5, L / 2 - L * 0.3, B, L * 0.03); // крылья мостика
    ctx.fillStyle = pal.funnel;
    roundRect(ctx, -B * 0.13, L / 2 - L * 0.2, B * 0.26, L * 0.06, 1.5); ctx.fill();
    // бак
    ctx.fillStyle = "#d8dee6";
    ctx.beginPath(); ctx.moveTo(0, -L / 2 + 2); ctx.lineTo(B * 0.3, -L / 2 + L * 0.13); ctx.lineTo(-B * 0.3, -L / 2 + L * 0.13); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Огни в системе координат судна (нос вверх): [x, y, цвет, тип]
  function shipLights(sh) {
    const { L, B } = sh;
    if (sh.kind === "sail") return [[-B / 2, -L * 0.1, "#ff3b3b", "port"], [B / 2, -L * 0.1, "#33ff88", "stbd"], [0, L / 2, "#ffffff", "stern"]];
    const lights = [[0, -L * 0.28, "#ffffff", "mast"], [-B / 2, L * 0.17, "#ff3b3b", "port"], [B / 2, L * 0.17, "#33ff88", "stbd"], [0, L / 2, "#ffffff", "stern"]];
    if (L >= 85) lights.push([0, L * 0.12, "#ffffff", "mast2"]);
    return lights;
  }
  // Сектор видимости огня по МППСС Правило 21 (от/до в градусах относительно носа)
  const SECTORS = { mast: [-112.5, 112.5], mast2: [-112.5, 112.5], stbd: [0, 112.5], port: [-112.5, 0], stern: [112.5, 247.5] };

  function drawLights(ctx, s, sh, glow) {
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(s.hdg * D2R);
    ctx.scale(s.k, s.k);
    for (const [x, y, c] of shipLights(sh)) {
      ctx.shadowColor = c; ctx.shadowBlur = glow ? 18 : 6;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y, (glow ? 3.4 : 2.4) / Math.sqrt(s.k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawSectors(ctx, s, sh, highlight) {
    const R = sh.L * 1.25 * s.k;
    const items = [["mast", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.45)"], ["stbd", "rgba(51,255,136,0.13)", "rgba(51,255,136,0.6)"],
      ["port", "rgba(255,59,59,0.13)", "rgba(255,59,59,0.6)"], ["stern", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.5)"]];
    ctx.save();
    ctx.translate(s.sx, s.sy);
    ctx.rotate(s.hdg * D2R);
    for (const [type, fill, edge] of items) {
      if (highlight && type !== highlight) continue;
      const [a, b] = SECTORS[type];
      const r = type === "mast" ? R * 1.15 : type === "stern" ? R * 0.95 : R;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (a - 90) * D2R, (b - 90) * D2R);
      ctx.closePath();
      ctx.fillStyle = highlight ? "rgba(255,255,255,0.16)" : fill; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawWake(ctx, traj, t, sh, view, night) {
    if (!sh.speed && !(sh.man || []).some((m) => m.speed)) return;
    const span = 4.2, stepT = 0.06;
    const pts = [];
    for (let tt = Math.max(0, t - span); tt <= t; tt += stepT) pts.push([tt, stateAt(traj, tt)]);
    if (pts.length < 2) return;
    ctx.save();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      pts.forEach(([tt, st], i) => {
        const age = t - tt;
        const back = sh.L / 2 * SHIP_SCALE;
        const sx = st.x - Math.sin(st.hdg * D2R) * back, sy = st.y + Math.cos(st.hdg * D2R) * back;
        const spread = (sh.B * 0.42 + age * 7) * SHIP_SCALE;
        const px = sx + Math.cos(st.hdg * D2R) * spread * side, py = sy + Math.sin(st.hdg * D2R) * spread * side;
        const p = view.toScreen(px, py);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      const grad = ctx.createLinearGradient(0, 0, 1, 1);
      ctx.strokeStyle = night ? "rgba(140,170,210,0.08)" : "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // турбулентный след по оси
    pts.forEach(([tt, st]) => {
      const age = t - tt;
      const back = (sh.L / 2 + 3) * SHIP_SCALE;
      const sx = st.x - Math.sin(st.hdg * D2R) * back, sy = st.y + Math.cos(st.hdg * D2R) * back;
      const p = view.toScreen(sx, sy);
      const a = Math.max(0, 0.16 - age * 0.04) * (night ? 0.35 : 1);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, (1.6 + age * 1.6) * view.k * SHIP_SCALE, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  function drawSea(ctx, w, h, t, night, view) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (night) { g.addColorStop(0, "#050b16"); g.addColorStop(1, "#08162a"); }
    else { g.addColorStop(0, "#114a6b"); g.addColorStop(1, "#0b3350"); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // мелкая рябь
    ctx.save();
    ctx.strokeStyle = night ? "rgba(120,160,220,0.05)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    const seed = 37;
    for (let i = 0; i < 70; i++) {
      const rx = ((i * 97 + seed) % 1000) / 1000, ry = ((i * 61 + seed * 3) % 1000) / 1000;
      const x = (rx * w + t * 6) % (w + 40) - 20, y = ry * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 9, y - 3, x + 18, y); ctx.stroke();
    }
    // координатная сетка, как на карте
    ctx.strokeStyle = night ? "rgba(120,160,220,0.05)" : "rgba(255,255,255,0.05)";
    const stepPx = 100 * view.k;
    const ox = view.toScreen(0, 0);
    for (let x = ox.x % stepPx; x < w; x += stepPx) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = ox.y % stepPx; y < h; y += stepPx) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();
  }

  function pill(ctx, x, y, text, color, font) {
    ctx.save();
    ctx.font = font;
    const pad = 7, h = 20;
    const w = ctx.measureText(text).width + pad * 2;
    const cw = ctx.canvas.clientWidth || 1e4;
    x = Math.max(w / 2 + 4, Math.min(cw - w / 2 - 4, x)); // не обрезать подпись у края
    // не залезать под верхнюю панель сцены (номер правила и переключатели)
    const bx = Math.round(x - w / 2), by = Math.round(Math.max(h + 44, y) - h);
    ctx.fillStyle = "rgba(6,12,24,0.78)";
    roundRect(ctx, bx, by, w, h, 10); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "center";
    ctx.fillText(text, x, by + h / 2 + 0.5);
    ctx.restore();
  }

  /* ------------------------------ компонент ------------------------------ */
  function mount(container, rawName, lang) {
    const name = ALIASES[rawName] || rawName;
    const sc = SCENES[name];
    if (!sc) return null;
    container.innerHTML = "";
    container.classList.add("scene");
    const root = document.createElement("div");
    root.className = "scene-root";
    root.innerHTML = `
      <div class="scene-stage">
        <canvas class="scene-canvas"></canvas>
        <div class="scene-top">
          <span class="scene-rule">${T("scene.rule_prefix", lang)} ${sc.rule}</span>
          <div class="scene-toggles">
            <button type="button" class="scene-tgl" data-tgl="night">${T("scene.night", lang)}</button>
            <button type="button" class="scene-tgl" data-tgl="sectors">${T("scene.sectors", lang)}</button>
          </div>
        </div>
      </div>
      <div class="scene-bar">
        <div class="scene-caption"><span class="scene-step"></span><span class="scene-text"></span></div>
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
    const stepEl = root.querySelector(".scene-step");
    const textEl = root.querySelector(".scene-text");
    const playBtn = root.querySelector(".scene-play");
    const range = root.querySelector(".scene-range");
    const ticks = root.querySelector(".scene-ticks");
    const toggles = { night: false, sectors: !!sc.sectorsAlways };
    if (sc.sectorsAlways) root.querySelector('[data-tgl="sectors"]').classList.add("on");

    sc.steps.forEach((s, i) => {
      const d = document.createElement("span");
      d.style.left = `${(s.t / sc.duration) * 100}%`;
      d.title = String(i + 1);
      ticks.appendChild(d);
    });

    const trajs = {};
    sc.ships.forEach((sh) => { trajs[sh.id] = simulate(sh, sc.duration); });

    let t = 0, playing = true, last = null, raf = null, currentStep = -1, visible = true;
    let W = 0, H = 0, dpr = 1;

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      W = Math.max(280, r.width); H = Math.max(220, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      draw();
    }

    function makeView() {
      const v = sc.view;
      // На узком экране — приближение, чтобы суда не превращались в точки.
      const zoom = W < 560 ? 0.7 : W < 800 ? 0.85 : 1;
      const k = W / (v.w * zoom);
      return {
        k,
        toScreen: (x, y) => ({ x: W / 2 + (x - v.cx) * k, y: H / 2 + (y - v.cy) * k }),
      };
    }

    function setStep(i) {
      if (i === currentStep) return;
      currentStep = i;
      stepEl.textContent = `${i + 1}/${sc.steps.length}`;
      textEl.classList.remove("in"); void textEl.offsetWidth;
      textEl.textContent = T(sc.steps[i].key, lang);
      textEl.classList.add("in");
    }

    function draw() {
      if (!W) return;
      const night = toggles.night;
      const view = makeView();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSea(ctx, W, H, t, night, view);
      const font = `600 ${Math.max(10.5, Math.min(13, W / 60))}px Inter, system-ui, sans-serif`;

      // фарватер
      if (sc.channel) {
        const a = view.toScreen(0, sc.channel.y1), b = view.toScreen(0, sc.channel.y2);
        ctx.save();
        ctx.fillStyle = night ? "rgba(70,110,170,0.06)" : "rgba(120,200,255,0.08)";
        ctx.fillRect(0, a.y, W, b.y - a.y);
        ctx.strokeStyle = night ? "rgba(150,180,220,0.25)" : "rgba(255,255,255,0.45)";
        ctx.setLineDash([10, 8]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(W, a.y); ctx.moveTo(0, b.y); ctx.lineTo(W, b.y); ctx.stroke();
        ctx.setLineDash([]);
        // латеральные знаки (МАМС, регион A, вход с запада): красные — к северу, зелёные — к югу
        for (let x = -600; x <= 600; x += 200) {
          for (const [yy, col, shape] of [[sc.channel.y1, "#e74c3c", "can"], [sc.channel.y2, "#27ae60", "cone"]]) {
            const p = view.toScreen(x, yy);
            ctx.fillStyle = col; ctx.shadowColor = night ? col : "transparent"; ctx.shadowBlur = night ? 10 : 0;
            if (shape === "can") ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
            else { ctx.beginPath(); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 5, p.y + 4); ctx.lineTo(p.x - 5, p.y + 4); ctx.closePath(); ctx.fill(); }
          }
        }
        ctx.restore();
      }

      // радарная развёртка для ограниченной видимости
      const states = {};
      sc.ships.forEach((sh) => {
        const st = stateAt(trajs[sh.id], t);
        const p = view.toScreen(st.x, st.y);
        states[sh.id] = { ...st, sx: p.x, sy: p.y, k: view.k * SHIP_SCALE };
      });

      if (sc.radar) {
        const o = states[sc.radar.ship];
        ctx.save();
        ctx.strokeStyle = "rgba(80,255,170,0.18)"; ctx.lineWidth = 1;
        for (let r = 150; r <= 750; r += 150) { ctx.beginPath(); ctx.arc(o.sx, o.sy, r * view.k, 0, Math.PI * 2); ctx.stroke(); }
        const sweep = (t * 90) % 360;
        const g = ctx.createConicGradient ? ctx.createConicGradient((sweep - 90 - 40) * D2R, o.sx, o.sy) : null;
        if (g) {
          g.addColorStop(0, "rgba(80,255,170,0)"); g.addColorStop(40 / 360, "rgba(80,255,170,0.16)"); g.addColorStop(40.5 / 360, "rgba(80,255,170,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.sx, o.sy, 760 * view.k, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // секторы огней
      const sternHL = sc.sternSector && t >= sc.sternSector.from && t <= sc.sternSector.to;
      sc.ships.forEach((sh) => {
        if (sh.echo) return;
        if (toggles.sectors && (night || sc.sectorsAlways)) drawSectors(ctx, states[sh.id], sh, null);
        else if (toggles.sectors) drawSectors(ctx, states[sh.id], sh, null);
      });
      if (sternHL) {
        const s = states[sc.sternSector.ship];
        const sh = sc.ships.find((x) => x.id === sc.sternSector.ship);
        drawSectors(ctx, s, sh, "stern");
        const p = view.toScreen(stateAt(trajs[sh.id], t).x - 250, stateAt(trajs[sh.id], t).y - 40);
        pill(ctx, p.x, p.y - 34, T("scene.lbl.stern_sector", lang), "#ffffff", font);
      }

      // следы и корпуса
      sc.ships.forEach((sh) => { if (!sh.echo) drawWake(ctx, trajs[sh.id], t, sh, view, night); });

      // пеленг
      if (sc.bearing && t <= sc.bearing.until + 0.6) {
        const a = states[sc.bearing.from], b = states[sc.bearing.to];
        const alpha = t <= sc.bearing.until ? 1 : Math.max(0, 1 - (t - sc.bearing.until) / 0.6);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255,107,107,0.85)"; ctx.setLineDash([7, 6]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.setLineDash([]);
        const brg = Math.round(norm360(Math.atan2(b.x - a.x, -(b.y - a.y)) / D2R));
        pill(ctx, (a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 6, `${T("scene.bearing", lang)} ${String(brg).padStart(3, "0")}° · ${T("scene.bearing_const", lang)}`, "#ff6b6b", font);
        ctx.restore();
      }

      sc.ships.forEach((sh) => {
        const s = states[sh.id];
        if (sh.echo) {
          // цель видна только на радаре: эхо-сигнал с послесвечением
          ctx.save();
          for (let i = 6; i >= 0; i--) {
            const st = stateAt(trajs[sh.id], Math.max(0, t - i * 0.6));
            const p = view.toScreen(st.x, st.y);
            ctx.fillStyle = `rgba(80,255,170,${0.85 - i * 0.12})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 4.5 - i * 0.4, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
          pill(ctx, s.sx, s.sy - 14, T("scene.lbl.radar_echo", lang), "#50ffaa", font);
          return;
        }
        drawShipBody(ctx, s, sh, night);
        drawLights(ctx, s, sh, night);
      });

      // туман
      if (sc.fog) {
        const o = states[sc.fog.ship];
        ctx.save();
        const g = ctx.createRadialGradient(o.sx, o.sy, sc.fog.radius * view.k * 0.4, o.sx, o.sy, sc.fog.radius * view.k * 1.6);
        g.addColorStop(0, "rgba(190,200,210,0)"); g.addColorStop(1, night ? "rgba(40,48,60,0.72)" : "rgba(170,182,195,0.66)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // эхо поверх тумана
        sc.ships.forEach((sh) => {
          if (!sh.echo) return;
          for (let i = 6; i >= 0; i--) {
            const st = stateAt(trajs[sh.id], Math.max(0, t - i * 0.6));
            const p = view.toScreen(st.x, st.y);
            ctx.fillStyle = `rgba(60,235,150,${0.9 - i * 0.12})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, 4.8 - i * 0.4, 0, Math.PI * 2); ctx.fill();
          }
          const s = states[sh.id];
          pill(ctx, s.sx, s.sy - 14, T("scene.lbl.radar_echo", lang), "#50ffaa", font);
        });
      }

      // звуковые сигналы
      (sc.signals || []).forEach((sg) => {
        const age = t - sg.t;
        if (age < 0 || age > 2.2) return;
        const s = states[sg.ship];
        ctx.save();
        for (let i = 0; i < (sg.long ? 3 : 2); i++) {
          const a = age - i * 0.25;
          if (a < 0) continue;
          ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.7 - a * 0.35)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(s.sx, s.sy, 14 + a * 46, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        pill(ctx, s.sx, s.sy + 44, T(sg.key, lang), "#ffffff", font);
      });

      // подписи ролей
      sc.ships.forEach((sh) => {
        const s = states[sh.id];
        (sh.labels || []).forEach((l) => {
          if (t >= l.from && t <= l.to) pill(ctx, s.sx, s.sy - sh.L * view.k * SHIP_SCALE * 0.55 - 8, T(l.key, lang), ROLE_COLORS[l.role] || ROLE_COLORS.none, font);
        });
      });

      // наблюдатель для секторов огней
      if (sc.observer) {
        const ob = sc.observer;
        const o = states[ob.ship];
        const sh = sc.ships.find((x) => x.id === ob.ship);
        const ang = norm360((t / ob.period) * 360 + (ob.start || 0));
        const ox = o.x + Math.sin(ang * D2R) * ob.radius, oy = o.y - Math.cos(ang * D2R) * ob.radius;
        const p = view.toScreen(ox, oy);
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.arc(o.sx, o.sy, ob.radius * view.k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(o.sx, o.sy); ctx.stroke();
        ctx.fillStyle = "#ffd166"; ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // что видит наблюдатель (вид со стороны наблюдателя)
        const rel = norm360(ang - o.hdg);
        const vis = (type) => { const [a, b] = SECTORS[type]; const r = rel > 180 && a < 0 ? rel - 360 : rel; return r >= a && r <= b; };
        const seen = shipLights(sh).filter(([, , , type]) => vis(type));
        const boxW = Math.min(230, W * 0.42), boxH = 92, bx = W - boxW - 12, by = H - boxH - 12;
        ctx.save();
        ctx.fillStyle = "rgba(4,9,18,0.82)"; roundRect(ctx, bx, by, boxW, boxH, 12); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.stroke();
        ctx.fillStyle = "#9fb0c8"; ctx.font = font; ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(`${T("scene.observer_sees", lang)} · ${Math.round(rel)}°`, bx + 12, by + 10);
        // силуэт и огни так, как их видит наблюдатель
        const cx = bx + boxW / 2, cy = by + 62;
        const order = seen.map(([x, y, c, type]) => {
          const r = rel * D2R;
          const sxp = x * Math.cos(r) - y * Math.sin(r);
          const h = type === "mast" ? -24 : type === "mast2" ? -32 : -8;
          return { x: cx + sxp * 0.9, y: cy + h, c };
        });
        ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(bx + 14, cy + 6); ctx.lineTo(bx + boxW - 14, cy + 6); ctx.stroke();
        order.forEach((l) => { ctx.fillStyle = l.c; ctx.shadowColor = l.c; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(l.x, l.y, 5, 0, Math.PI * 2); ctx.fill(); });
        ctx.restore();
      }

      // шаг
      let si = 0;
      sc.steps.forEach((s, i) => { if (t >= s.t) si = i; });
      setStep(si);
      range.value = String(Math.round((t / sc.duration) * 1000));
    }

    function frame(ts) {
      raf = null;
      if (!visible) { last = null; return; }
      if (last === null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (playing) {
        t += dt;
        if (t >= sc.duration) { t = sc.duration; playing = false; updatePlay(); }
      }
      draw();
      if (playing) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = null; raf = requestAnimationFrame(frame); } }
    function updatePlay() {
      playBtn.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }

    playBtn.addEventListener("click", () => {
      if (!playing && t >= sc.duration) t = 0;
      playing = !playing; updatePlay(); kick();
    });
    root.querySelector(".scene-restart").addEventListener("click", () => { t = 0; playing = true; updatePlay(); kick(); });
    range.addEventListener("input", () => { t = (Number(range.value) / 1000) * sc.duration; playing = false; updatePlay(); draw(); });
    root.querySelectorAll(".scene-tgl").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.tgl; toggles[k] = !toggles[k]; b.classList.toggle("on", toggles[k]);
      if (k === "night") root.classList.toggle("is-night", toggles[k]);
      draw();
    }));

    // Не крутить анимацию, когда сцена вне экрана (экономия батареи на телефоне).
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((ents) => {
        visible = ents.some((e) => e.isIntersecting);
        if (visible && playing) kick();
      }, { threshold: 0.05 });
      io.observe(root);
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    updatePlay();
    requestAnimationFrame(() => { resize(); kick(); });
    // для автотестов и скриншотов: перемотка на момент t
    root.__seek = (sec) => { t = sec; playing = false; updatePlay(); draw(); };
    return root;
  }

  window.ShipHelperScenes = {
    has: (n) => !!(SCENES[n] || SCENES[ALIASES[n]]),
    mount,
    // Общие примитивы рисования — для сцен других тем (js/theory-scenes.js)
    _lib: { drawShipBody, drawLights, roundRect, pill, drawSea, hullPath, SHIP_SCALE, D2R },
  };
})();
