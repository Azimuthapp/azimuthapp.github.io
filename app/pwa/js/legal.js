/**
 * Юридические документы в программе: оферта, политика ПДн, согласие, инструкция покупателя.
 * Тексты — data/legal/<doc>.ru.html, реквизиты продавца — data/legal/requisites.json
 * (подставляются вместо {{поле}}; пустое поле видно как «[не указано]»).
 * Окно просмотра открывается по клику на любой элемент с data-doc="offer|privacy|consent|guide".
 * При первом запуске — окно согласия с условиями (демоверсия).
 */
(function () {

const DOCS = {
  offer: "app.legal.offer_title",
  privacy: "app.legal.privacy_title",
  consent: "app.legal.consent_title",
  guide: "app.legal.guide_title",
};
const TERMS_KEY = "shiphelper-terms-accepted";
let REQ = {};
const cache = {};
const T = (k, p) => window.ShipHelperI18n.t(k, document.documentElement.lang || "ru", p);

const ready = fetch("../data/legal/requisites.json", { cache: "no-cache" })
  .then((r) => r.json()).then((j) => { REQ = j || {}; }).catch(() => { REQ = {}; });

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fill(html) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = (REQ[k] || "").trim();
    return v ? esc(v) : `<span class="doc-missing">[не указано]</span>`;
  });
}

async function openDoc(id) {
  if (!DOCS[id]) return;
  await ready;
  const back = document.getElementById("doc-backdrop");
  const body = document.getElementById("doc-body");
  document.getElementById("doc-title").textContent = T(DOCS[id]);
  if (!cache[id]) {
    try { cache[id] = await (await fetch(`../data/legal/${id}.ru.html`, { cache: "no-cache" })).text(); }
    catch (e) { cache[id] = "<p>—</p>"; }
  }
  const lang = document.documentElement.lang || "ru";
  body.innerHTML = (lang !== "ru" ? `<p class="doc-lang-note">${esc(T("app.legal.ru_only"))}</p>` : "") + fill(cache[id]);
  body.scrollTop = 0;
  back.hidden = false;
}

function setup() {
  const back = document.getElementById("doc-backdrop");
  const close = document.getElementById("doc-close");
  if (!back) return;
  close.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  close.addEventListener("click", () => { back.hidden = true; });
  back.addEventListener("click", (e) => { if (e.target === back) back.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !back.hidden) { back.hidden = true; e.stopImmediatePropagation(); } }, true);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-doc]");
    if (!a) return;
    e.preventDefault();
    openDoc(a.dataset.doc);
  });

  // первый запуск: согласие с условиями демоверсии
  const terms = document.getElementById("terms-backdrop");
  const automated = navigator.webdriver || window.__azErrors;
  const show = () => {
    let accepted = null;
    try { accepted = localStorage.getItem(TERMS_KEY); } catch (e) {}
    if (!accepted && !automated && terms) terms.hidden = false;
  };
  if (window.__azReady) show(); else document.addEventListener("shiphelper:ready", show, { once: true });
  document.getElementById("terms-accept-btn")?.addEventListener("click", () => {
    try { localStorage.setItem(TERMS_KEY, REQ.edition_date || "1"); } catch (e) {}
    terms.hidden = true;
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup); else setup();

window.AzimuthLegal = { open: openDoc, requisites: () => REQ, ready };

})();
