/* Заставка при запуске AZIMUTH (разметка — #loading-screen в index.html, стили — theme.css «Splash»).
 *
 * Сюжет (~3,4 с): шкала-лимб с делениями доворачивается и встаёт на N по курсовой черте,
 * под ней крутится «радарный» луч; проявляется золотой секстант; буквы AZIMUTH поднимаются
 * по одной; раскрывается золотая линейка и подпись. Пока грузится расчётный модуль — тонкая
 * полоса прогресса; когда загружен — по слову проходит металлический блик и заставка уходит.
 * Все движения — только transform/opacity (не замирают, пока браузер занят загрузкой Python).
 *
 * app.js скрывает заставку только после window.AzimuthSplash.wait() — не раньше минимальной
 * длительности, чтобы анимация доигрывала, даже если всё загрузилось мгновенно (из кэша).
 * Под автоматическими тестами (navigator.webdriver) минимальная длительность 0 —
 * её можно задать явно: window.__AZ_SPLASH_MIN = мс (до загрузки этого файла).
 * При «уменьшении движения» в настройках ОС анимации отключены (CSS) и ждать незачем.
 */
(function () {
  const root = document.getElementById("loading-screen");
  if (!root) return;
  const t0 = performance.now();
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let minMs = 3400;
  if (navigator.webdriver) minMs = 0;
  if (reduce) minMs = 600;
  if (typeof window.__AZ_SPLASH_MIN === "number") minMs = window.__AZ_SPLASH_MIN;

  // Деления лимба: каждые 5°, длиннее через 10° и 30°, цифры через 30°
  const ns = "http://www.w3.org/2000/svg";
  const ticks = document.getElementById("splash-ticks");
  if (ticks) {
    const frag = document.createDocumentFragment();
    for (let a = 0; a < 360; a += 5) {
      const major = a % 30 === 0, mid = a % 10 === 0;
      const r1 = 170, r2 = major ? 150 : mid ? 158 : 163;
      const rad = (a - 90) * Math.PI / 180;
      const ln = document.createElementNS(ns, "line");
      ln.setAttribute("x1", (r1 * Math.cos(rad)).toFixed(2));
      ln.setAttribute("y1", (r1 * Math.sin(rad)).toFixed(2));
      ln.setAttribute("x2", (r2 * Math.cos(rad)).toFixed(2));
      ln.setAttribute("y2", (r2 * Math.sin(rad)).toFixed(2));
      ln.setAttribute("stroke", "url(#spg)");
      ln.setAttribute("stroke-width", major ? "2" : "1");
      ln.setAttribute("opacity", major ? "1" : mid ? ".75" : ".45");
      frag.appendChild(ln);
      if (major) {
        const tx = document.createElementNS(ns, "text");
        const label = a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a).padStart(3, "0");
        tx.textContent = label;
        tx.setAttribute("x", (128 * Math.cos(rad)).toFixed(2));
        tx.setAttribute("y", (128 * Math.sin(rad)).toFixed(2));
        tx.setAttribute("class", label.length === 1 ? "splash-cardinal" : "splash-deg");
        tx.setAttribute("transform", `rotate(${a} ${(128 * Math.cos(rad)).toFixed(2)} ${(128 * Math.sin(rad)).toFixed(2)})`);
        frag.appendChild(tx);
      }
    }
    ticks.appendChild(frag);
  }

  // После скрытия — убрать из отрисовки, чтобы бесконечные анимации не грузили GPU
  new MutationObserver(() => {
    if (root.classList.contains("hidden")) setTimeout(() => { root.style.display = "none"; }, 1000);
  }).observe(root, { attributes: true, attributeFilter: ["class"] });

  window.AzimuthSplash = {
    // Модуль загружен: проходит блик по слову (~1 с), затем — не раньше минимальной длительности
    wait() {
      root.classList.add("is-ready");
      const shine = minMs > 0 && !reduce ? 1150 : 0;
      const left = Math.max(minMs - (performance.now() - t0), shine);
      return new Promise((res) => setTimeout(res, left));
    },
  };
})();
