/*
 * scroll-ui.js — «умная» прокрутка:
 *   • тонкая полоса прогресса чтения вверху экрана;
 *   • кнопка «наверх» с кольцом прогресса (появляется после первого экрана);
 *   • в теории — плашка с текущим правилом/записью: стрелки «предыдущее/
 *     следующее», нажатие на название открывает оглавление темы.
 * Чистый DOM, без зависимостей; при prefers-reduced-motion — без плавности.
 */
(function () {
  "use strict";
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reduce ? "auto" : "smooth";
  const T = (k) => window.ShipHelperI18n.t(k, document.documentElement.lang || "ru");

  const bar = document.createElement("div");
  bar.className = "read-progress";
  bar.innerHTML = "<span></span>";

  const R = 19, C = 2 * Math.PI * R;
  const top = document.createElement("button");
  top.type = "button";
  top.className = "to-top";
  top.innerHTML = `<svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
      <circle cx="22" cy="22" r="${R}" class="to-top-track"/>
      <circle cx="22" cy="22" r="${R}" class="to-top-ring" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/>
      <path d="M22 29 V15 M16 20.5 L22 14.5 L28 20.5" class="to-top-arrow"/>
    </svg>`;

  const chip = document.createElement("div");
  chip.className = "reading-chip";
  chip.innerHTML = `<button type="button" class="rc-nav" data-dir="-1" aria-label="prev">‹</button>
    <button type="button" class="rc-label"><span class="rc-num"></span><span class="rc-title"></span></button>
    <button type="button" class="rc-nav" data-dir="1" aria-label="next">›</button>`;

  function theoryVisible() {
    const g = document.querySelector('.group-content[data-group="theory"]');
    return g && !g.hidden && g.dataset.mode !== "trainer";
  }
  function entries() {
    return theoryVisible() ? Array.from(document.querySelectorAll("#theory-content .book-entry")) : [];
  }
  function currentIndex(list) {
    const line = window.innerHeight * 0.3;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].getBoundingClientRect().top <= line) idx = i; else break;
    }
    return idx;
  }

  let ticking = false;
  function update() {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const y = window.scrollY || doc.scrollTop;
    const p = max > 40 ? Math.min(1, Math.max(0, y / max)) : 0;
    bar.firstChild.style.transform = `scaleX(${p})`;
    bar.classList.toggle("on", max > 400);
    top.classList.toggle("on", y > window.innerHeight * 0.8);
    top.querySelector(".to-top-ring").style.strokeDashoffset = (C * (1 - p)).toFixed(2);
    top.title = T("scroll.to_top");
    top.setAttribute("aria-label", T("scroll.to_top"));

    const list = entries();
    const idx = currentIndex(list);
    if (idx >= 0) {
      const e = list[idx];
      chip.querySelector(".rc-num").textContent = (e.querySelector(".book-num") || {}).textContent || "";
      chip.querySelector(".rc-title").textContent = (e.querySelector(".book-title") || {}).textContent || "";
      chip.querySelector('[data-dir="-1"]').disabled = idx === 0;
      chip.querySelector('[data-dir="1"]').disabled = idx === list.length - 1;
      chip.dataset.idx = idx;
      chip.querySelector(".rc-label").title = T("scroll.contents");
    }
    chip.classList.toggle("on", idx >= 0);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  function scrollToEl(el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top: y, behavior });
  }

  top.addEventListener("click", () => window.scrollTo({ top: 0, behavior }));
  chip.addEventListener("click", (e) => {
    const nav = e.target.closest(".rc-nav");
    const list = entries();
    if (nav) {
      const i = Number(chip.dataset.idx || 0) + Number(nav.dataset.dir);
      if (list[i]) scrollToEl(list[i]);
      return;
    }
    if (e.target.closest(".rc-label")) {
      const toc = document.querySelector("#theory-content .book-toc");
      if (toc) { toc.open = true; scrollToEl(toc); }
    }
  });

  function start() {
    document.body.appendChild(bar);
    document.body.appendChild(chip);
    document.body.appendChild(top);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // смена раздела/темы меняет высоту страницы без прокрутки
    new MutationObserver(onScroll).observe(document.querySelector(".main") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-mode"] });
    document.addEventListener("shiphelper:langchange", onScroll);
    update();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
