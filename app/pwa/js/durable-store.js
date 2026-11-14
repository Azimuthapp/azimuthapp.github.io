/* Надёжное хранение данных в программах для Windows и Android.
 *
 * Всё, что приложение запоминает (журнал тревог, журнал корректуры, ключ,
 * введённые в калькуляторы значения, тема, язык), лежит в localStorage под
 * ключами "shiphelper-*". Встроенный браузер (WebView2 / Android WebView)
 * дописывает localStorage на диск с задержкой в несколько секунд — если
 * программу закрыть сразу после ввода, последние изменения могли пропасть
 * (так пропал журнал тревог у пользователя 2026-10-07).
 *
 * Поэтому в программах каждое изменение дублируется в файл:
 *   Windows — %LOCALAPPDATA%\AZIMUTH\store.json (через chrome.webview.postMessage("store:…"));
 *   Android — files/azimuth-store.json (window.AzimuthNative.storeSave/storeLoad).
 * При запуске, если файл новее (метка shiphelper-__store-ts), данные берутся из него.
 * В обычном браузере (PWA) этот файл ничего не делает.
 *
 * Подключается ПЕРВЫМ скриптом страницы — до того, как остальные прочитают localStorage.
 */
(function () {
  const PREFIX = "shiphelper-";
  const TS = "shiphelper-__store-ts";
  const wv = window.chrome && window.chrome.webview;
  const nat = window.AzimuthNative && typeof window.AzimuthNative.storeSave === "function" ? window.AzimuthNative : null;
  if (!wv && !nat) return;

  let ls;
  try { ls = window.localStorage; ls.getItem(TS); } catch (e) { return; }

  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  const origClear = Storage.prototype.clear;

  // ---- 1. восстановление из файла, если он новее ----
  let snap = null;
  try {
    if (nat) {
      const raw = nat.storeLoad();
      if (raw) snap = JSON.parse(raw);
    } else if (window.__azStoreSnapshot && typeof window.__azStoreSnapshot === "object") {
      snap = window.__azStoreSnapshot;
    }
  } catch (e) { snap = null; }

  if (snap) {
    const fileTs = Number(snap[TS]) || 0;
    const localTs = Number(ls.getItem(TS)) || 0;
    if (fileTs > localTs) {
      const old = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX)) old.push(k); }
      old.forEach((k) => origRemove.call(ls, k));
      Object.keys(snap).forEach((k) => {
        if (k.startsWith(PREFIX) && typeof snap[k] === "string") origSet.call(ls, k, snap[k]);
      });
    }
  }

  // ---- 2. каждое изменение — в файл ----
  function collect() {
    const o = {};
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) o[k] = ls.getItem(k);
    }
    return o;
  }

  let timer = null;
  function stamp() { origSet.call(ls, TS, String(Date.now())); }

  function flush() {
    clearTimeout(timer);
    timer = null;
    try {
      stamp();
      const json = JSON.stringify(collect());
      if (nat) nat.storeSave(json);
      else wv.postMessage("store:" + json);
    } catch (e) { /* без файла — останется обычное хранение */ }
  }
  function schedule() { if (!timer) timer = setTimeout(flush, 200); }

  const touches = (k) => typeof k === "string" ? k.startsWith(PREFIX) && k !== TS : true;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === ls && touches(String(k))) schedule();
  };
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (this === ls && touches(String(k))) schedule();
  };
  Storage.prototype.clear = function () {
    origClear.call(this);
    if (this === ls) schedule();
  };

  // Сохранение перед закрытием: программа для Windows вызывает AzimuthStoreDump()
  // из FormClosing и сама пишет файл; Android — AzimuthStoreFlush() из onPause.
  window.AzimuthStoreFlush = flushAll;
  window.AzimuthStoreDump = function () {
    if (typeof window.ShipHelperFlushCalcs === "function") { try { window.ShipHelperFlushCalcs(); } catch (e) { /* */ } }
    clearTimeout(timer);
    timer = null;
    stamp();
    const json = JSON.stringify(collect());
    return btoa(unescape(encodeURIComponent(json)));
  };
  function flushAll() {
    if (typeof window.ShipHelperFlushCalcs === "function") { try { window.ShipHelperFlushCalcs(); } catch (e) { /* */ } }
    flush();
  }
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });

  // Первый запуск новой версии: создать файл из того, что уже есть
  schedule();
})();
