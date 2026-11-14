/**
 * Веб-версия для iPhone и iPad (устанавливается из Safari на экран «Домой», без App Store).
 *
 * Важные особенности iOS, из-за которых нужен этот файл:
 *  - у приложения с иконки на экране «Домой» СВОЁ хранилище, отдельное от вкладки Safari:
 *    свой код устройства, своя активация и свой офлайн-кэш. Поэтому ключ вводится только
 *    в установленном приложении, а во вкладке Safari показывается экран «Как установить»;
 *  - данные сайтов во вкладке Safari iOS может стереть через 7 дней без посещений;
 *    на приложение с экрана «Домой» это не распространяется (плюс просим storage.persist());
 *  - ссылка с атрибутом download в приложении с экрана «Домой» ненадёжна — файлы (Word, CSV)
 *    отдаются через системное окно «Поделиться» → «Сохранить в Файлы» (см. docx-writer.js).
 */
(function () {
  const L = window.ShipHelperLicense;
  const isIOS = !!(L && L.isIOS);
  const standalone = navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  const root = document.documentElement;
  if (standalone) root.classList.add("is-standalone");
  // постоянное хранилище — для любой веб-версии (в программах Windows/Android не нужно)
  if (!window.AzimuthNative && !(window.chrome && window.chrome.webview) && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  window.AzimuthIOS = { isIOS, standalone, showInstall: () => {} };
  if (!isIOS) return;
  root.classList.add("is-ios");
  if (standalone) return;

  const SHARE = '<svg class="ios-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const PLUS = '<svg class="ios-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  const back = document.createElement("div");
  back.className = "about-modal-backdrop ios-install-backdrop";
  back.id = "ios-install-backdrop";
  back.hidden = true;
  back.innerHTML = `
    <div class="about-modal ios-install" role="dialog" aria-modal="true">
      <img class="ios-install-icon" src="icons/icon-192.png" alt="">
      <h2 data-i18n="app.ios.install_title">Установите AZIMUTH на экран «Домой»</h2>
      <p class="ios-install-lead" data-i18n="app.ios.install_lead">Приложение откроется на весь экран и будет работать без интернета.</p>
      <ol class="ios-steps">
        <li><span class="ios-step-ico">${SHARE}</span><span data-i18n="app.ios.step1">Нажмите «Поделиться» в Safari.</span></li>
        <li><span class="ios-step-ico">${PLUS}</span><span data-i18n="app.ios.step2">Выберите «На экран „Домой“» и нажмите «Добавить».</span></li>
        <li><span class="ios-step-ico ios-step-num">3</span><span data-i18n="app.ios.step3">Откройте AZIMUTH с новой иконки и дождитесь загрузки.</span></li>
        <li><span class="ios-step-ico ios-step-num">4</span><span data-i18n="app.ios.step4">Ключ вводите уже там.</span></li>
      </ol>
      <p class="field-hint ios-install-note" data-i18n="app.ios.not_safari">Нет кнопки «Поделиться»? Откройте эту страницу в Safari.</p>
      <button class="btn-secondary ios-install-continue" id="ios-install-continue" data-i18n="app.ios.continue_btn">Посмотреть демо в браузере</button>
    </div>`;
  function mount() {
    document.body.appendChild(back);
    back.querySelector("#ios-install-continue").addEventListener("click", () => {
      back.hidden = true;
      try { sessionStorage.setItem("az-ios-install-seen", "1"); } catch (e) {}
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-ios-install]")) { e.preventDefault(); show(); }
    });
  }
  function show() {
    const lic = document.getElementById("license-backdrop");
    if (lic) lic.hidden = true;
    back.hidden = false;
  }
  window.AzimuthIOS.showInstall = show;
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  function auto() {
    let seen = null;
    try { seen = sessionStorage.getItem("az-ios-install-seen"); } catch (e) {}
    if (!seen) show();
  }
  if (window.__azReady) auto(); else document.addEventListener("shiphelper:ready", auto);
})();
