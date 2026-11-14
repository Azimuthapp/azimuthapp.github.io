/**
 * Service worker — кэш "оболочки" приложения + рантайма Pyodide для
 * офлайн-работы.
 *
 * Что кешируется:
 *   1. Оболочка приложения (HTML/CSS/JS/SVG), core/*.py и data/strings,
 *      data/theory/*.json — заранее, при установке (см. install ниже),
 *      список CACHE_NAME. Обновляется целиком при каждом бампе
 *      CACHE_NAME (новая версия приложения — новый набор файлов).
 *   2. Рантайм Pyodide (~10 МБ, cdn.jsdelivr.net) — ОТДЕЛЬНЫМ, СТАБИЛЬНЫМ
 *      кэшем PYODIDE_CACHE_NAME, который НЕ чистится при бампе
 *      CACHE_NAME (см. activate ниже). Кэшируется не заранее списком
 *      файлов (их точный набор — внутренняя деталь сборки Pyodide,
 *      незачем прибивать гвоздями и рисковать разъехаться с версией),
 *      а "на лету": первый раз каждый файл идёт в сеть и параллельно
 *      сохраняется в кэш, все следующие разы — сразу из кэша. Один раз
 *      успешно открыв приложение при наличии сети, дальше пользователь
 *      может работать полностью офлайн, включая сами расчёты (Pyodide
 *      — это и есть исполнитель core/*.py, а не просто библиотека для
 *      картинки). Раздельные кэши также означают, что визуальные
 *      правки (раунды редизайна, CACHE_NAME v17→v18→v19...) не заставляют
 *      пользователя перекачивать 10 МБ Pyodide заново на каждое такое
 *      обновление — он остаётся закэширован, пока сам номер версии
 *      Pyodide в pyodide-bridge.js не поменяется (тогда изменится и URL
 *      запросов, и они закэшируются заново под теми же PYODIDE_CACHE_NAME
 *      автоматически, без ручных действий).
 *
 * ЧЕСТНО про единственное оставшееся ограничение: САМЫЙ ПЕРВЫЙ запуск
 * приложения (когда ничего ещё не закэшировано вообще, ни оболочка, ни
 * Pyodide) всё равно требует сеть — это неизбежное свойство любого PWA,
 * включая нативную установку: нельзя закэшировать то, что ни разу не
 * было загружено. После первого успешного запуска — приложение и все
 * калькуляторы работают полностью офлайн.
 */

// v7: добавлена группа "Манёвры и стоянка" (якорная цепь, UKC, squat,
// прилив — core/anchor.py, ukc.py, squat.py, tides.py) — новые файлы в
// APP_SHELL/CORE_FILES, бампнуто по тому же правилу.
// v8: добавлена группа "Грузовые операции" (драфт-сюрвей, балласт,
// остойчивость — core/draft_survey.py, ballast.py, stability.py).
// v9: добавлена группа "Теория и справочник" (core/theory.py, i18n.py
// и 8 модулей диаграмм, перенесённых из app/*_diagrams.py в core/) +
// data/theory/*.json (контент тем, оба языка).
// v10: расширение калькуляторов по сверке с конкурентом — 6 новых
// core/*.py (true_wind, sextant, roll_period, blind_distance,
// noon_report, bunker) + новые калькуляторы в уже существующих
// группах (Опасность/Opposite Draft и Trim/Density переиспользуют
// core/draft_survey.py, уже закэшированный).
// v14: добавлены 2 новых калькулятора закрытия пробелов с конкурентом —
// точка росы/вентиляция трюма (core/dew_point.py) и сличение компасов
// (core/compass_comparison.py). ВАЖНО — найдено при живой проверке:
// эти 2 файла были добавлены в PYTHON_MODULES (pyodide-bridge.js), но
// ЗАБЫТЫ в CORE_FILES ниже — из-за этого офлайн-кэш их не подхватывал
// (онлайн это маскировалось: пока сеть доступна, callCore всё равно
// фетчит файл с сервера напрямую, минуя кэш, поэтому баг незаметен
// в первую же живую проверку — проявился бы только в реальном офлайн-
// режиме). Урок на будущее: при добавлении файла в PYTHON_MODULES —
// СРАЗУ добавлять его и сюда, одним и тем же изменением, а не
// раздельными шагами.
// v15: фоновая SVG-подкладка (морской узор — компас/якорь/канат,
// pattern-dark.svg/pattern-light.svg) добавлена в APP_SHELL.
// v16: раунд 3 — прошлый узор пользователь на живом экране снова не
// увидел, заменён на 2 отдельных слоя: grid-*.svg (видимая координатная
// сетка) + motifs-*.svg (более детальные/реалистичные компас, якорь,
// канат, секстан). Старые pattern-dark.svg/pattern-light.svg удалены
// из проекта и из APP_SHELL.
// v17: раунд 4 — сетка+иконки названы непрофессиональными ("расчерченные
// линии... мультяшные картинки"), заменены ОДНИМ большим нетайловым
// SVG-рисунком в стиле портолана/навигационной карты (chart-*.svg) —
// grid-*.svg/motifs-*.svg удалены. Плюс переключатель калькуляторов
// (был выпадающий поповер) переделан в командную палитру — новых
// файлов для кэша это не добавляет (вся разметка строится в JS).
// v18: раунд 5 — правки CSS/JS без новых файлов в APP_SHELL (название
// приложения в сайдбаре, отступ под цифрой результата, палитра
// калькуляторов без поиска, галочка активного пункта через CSS вместо
// JS, перевод клонируемого <template> драфт-сюрвея). Версия кэша всё
// равно бампается — без этого офлайн-пользователи с уже установленным
// service worker'ом продолжали бы получать из кэша старые theme.css/
// app.js/calculators.js, пока кэш не протухнет как-то иначе.
// v19: раунд 5, продолжение — "Поправки секстана" перенесены из группы
// "Инструменты" в "Судовождение" (index.html). Новых файлов нет, но сам
// index.html закэширован в APP_SHELL — без бампа офлайн-пользователи
// продолжали бы видеть калькулятор в старой группе.
// v20: закрыт главный офлайн-пробел, задокументированный с самого
// начала PWA (см. докстринг выше) — добавлено runtime-кэширование
// самого рантайма Pyodide (PYODIDE_CACHE_NAME, отдельный от CACHE_NAME
// кэш, см. fetch-обработчик ниже). До этой версии приложение называло
// себя "офлайн-первым" в manifest.json, но ни один калькулятор не мог
// посчитать без сети при первом же офлайн-запуске — сам исполнитель
// core/*.py (Pyodide) не был закэширован никак.
// v21: новый калькулятор "Груз по замеру танка (наливной)" —
// core/cargo_ullage.py (группа "Грузовые операции"), новые i18n-ключи.
// v22: новая иконка приложения (icons/icon.svg + PNG 192/512, замена
// icon-placeholder.svg) и экран "О программе" (версия + changelog).
// v23: мобильная адаптивность/доступность — найден и исправлен реальный
// баг (фантомная горизонтальная прокрутка на мобильных из-за
// невидимых .info-tooltip, вылезающих за край viewport — overflow-x:
// hidden на html/body), увеличены тач-таргеты RU/EN переключателя.
// v24: новый калькулятор "Остаток балласта с поправками на крен и
// дифферент" — core/ballast_sounding.py (группа "Грузовые операции"),
// новые i18n-ключи.
// v31: механизм лицензионного ключа (core/license.py) — активация
// платной версии полностью офлайн, без сервера. Новые i18n-ключи,
// модалка активации, пэйволл на платных калькуляторах. Плюс фикс
// кнопки "Сбросить" в драфт-сюрвее (не чистила вложенные таблицы).
// v32: отчёт драфт-сюрвея в Word (js/docx-writer.js), теория МППСС с
// официальным текстом и интерактивными сценами (js/colregs-scenes.js),
// официальные рисунки USCG (img/colregs/*.webp), мобильные фиксы вёрстки.
// v39: заставка AZIMUTH (js/splash.js), шрифт Cinzel, чёрно-золотые иконки.
// v40: кнопки окна для версии Windows.
// v41: автосохранение всех калькуляторов, durable-store.js (копия данных в файл в программах).
// v42: лицензии v2 (подпись Ed25519, срок, 2 устройства), документы (data/legal), legal.js.
// v43: реквизиты продавца в документах (1.5.1).
// v44: исправлен адрес почты (1.5.2).
// v45: 1.6.0 — убран расчёт якорной цепи, тренажёр МППСС 40 ситуаций, правка текстов.
const CACHE_NAME = "shiphelper-v46";

// Стабильное имя — НЕ зависит от CACHE_NAME и не чистится при его
// бампе (см. activate ниже). Версия в имени — на случай, если сама
// стратегия кэширования Pyodide в будущем поменяется настолько, что
// старый кэш с этим именем станет некорректно интерпретироваться;
// обычное обновление версии Pyodide в pyodide-bridge.js (indexURL)
// само по себе новых записей в кэше не требует — оно просто означает
// новые URL, которые закэшируются заново по факту первого обращения.
const PYODIDE_CACHE_NAME = "shiphelper-pyodide-v2";

// Всё, что запрашивается с этого префикса (pyodide.js, pyodide.asm.wasm,
// python_stdlib.zip, pyodide-lock.json и т.д.) — кэшируется "на лету"
// в fetch-обработчике, а не заранее списком: список файлов — деталь
// сборки конкретной версии Pyodide, пере закреплять его вручную здесь
// при каждом обновлении версии было бы лишним источником рассинхрона
// (тем же классом ошибки, что уже был найден и исправлен в v14 —
// см. соответствующий комментарий ниже).
const PYODIDE_URL_PREFIX = "https://cdn.jsdelivr.net/pyodide/";
// С версии 1.3 рантайм лежит в самом приложении (pwa/vendor/pyodide) и
// кладётся в стабильный PYODIDE_CACHE_NAME при установке — один раз,
// без повторной загрузки 14 МБ при каждом бампе CACHE_NAME.
const PYODIDE_FILES = [
  "./vendor/pyodide/pyodide.js",
  "./vendor/pyodide/pyodide.asm.js",
  "./vendor/pyodide/pyodide.asm.wasm",
  "./vendor/pyodide/python_stdlib.zip",
  "./vendor/pyodide/pyodide-lock.json",
];

const APP_SHELL = [
  "./vendor/fonts/fonts.css",
  "./vendor/fonts/Inter-Regular.woff2",
  "./vendor/fonts/Inter-Medium.woff2",
  "./vendor/fonts/Inter-SemiBold.woff2",
  "./vendor/fonts/Inter-Bold.woff2",
  "./vendor/fonts/Inter-ExtraBold.woff2",
  "./vendor/fonts/JetBrainsMono-Medium.woff2",
  "./vendor/fonts/JetBrainsMono-SemiBold.woff2",
  "./vendor/fonts/Cinzel.woff",
  "./index.html",
  "./manifest.json",
  "./css/theme.css",
  "./js/splash.js",
  "./js/durable-store.js",
  "./js/i18n.js",
  "./js/pyodide-bridge.js",
  "./js/docx-writer.js",
  "./js/colregs-scenes.js",
  "./js/theory-scenes.js",
  "./js/colregs-trainer.js",
  "./js/home.js",
  "./js/scroll-ui.js",
  "./img/colregs/NRHB_23_Intl_dii.webp",
  "./img/colregs/NRHB_23_a.webp",
  "./img/colregs/NRHB_23_aii.webp",
  "./img/colregs/NRHB_23_b.webp",
  "./img/colregs/NRHB_23_di.webp",
  "./img/colregs/NRHB_23_e.webp",
  "./img/colregs/NRHB_24_a.webp",
  "./img/colregs/NRHB_24_av.webp",
  "./img/colregs/NRHB_24_d.webp",
  "./img/colregs/NRHB_24_e.webp",
  "./img/colregs/NRHB_24_eiii.webp",
  "./img/colregs/NRHB_24_f.webp",
  "./img/colregs/NRHB_24_j.webp",
  "./img/colregs/NRHB_25_a.webp",
  "./img/colregs/NRHB_25_b.webp",
  "./img/colregs/NRHB_25_c.webp",
  "./img/colregs/NRHB_25_d.webp",
  "./img/colregs/NRHB_25_dii.webp",
  "./img/colregs/NRHB_25_e.webp",
  "./img/colregs/NRHB_26_b.webp",
  "./img/colregs/NRHB_26_biii.webp",
  "./img/colregs/NRHB_26_ciii.webp",
  "./img/colregs/NRHB_27_a.webp",
  "./img/colregs/NRHB_27_aiii.webp",
  "./img/colregs/NRHB_27_biii.webp",
  "./img/colregs/NRHB_27_biv.webp",
  "./img/colregs/NRHB_27_c.webp",
  "./img/colregs/NRHB_27_d.webp",
  "./img/colregs/NRHB_27_diii.webp",
  "./img/colregs/NRHB_27_ei.webp",
  "./img/colregs/NRHB_27_eii.webp",
  "./img/colregs/NRHB_27_f.webp",
  "./img/colregs/NRHB_28.webp",
  "./img/colregs/NRHB_29_a.webp",
  "./img/colregs/NRHB_29_aiii.webp",
  "./img/colregs/NRHB_30_a.webp",
  "./img/colregs/NRHB_30_d.webp",
  "./img/colregs/NRHB_30_dii.webp",
  "./js/license.js",
  "./js/ios.js",
  "./js/legal.js",
  "./vendor/tweetnacl/nacl-fast.min.js",
  "./js/app.js",
  "./js/steps-en.js",
  "./js/calculators.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./img/chart-dark.svg",
  "./img/chart-light.svg",
];

const CORE_FILES = [
  "../core/__init__.py",
  "../core/compass.py",
  "../core/speed_time_distance.py",
  "../core/sailing.py",
  "../core/log_navigation.py",
  "../core/cpa.py",
  "../core/navigation_triangle.py",
  "../core/converters.py",
  "../core/ukc.py",
  "../core/squat.py",
  "../core/tides.py",
  "../core/draft_survey.py",
  "../core/ballast.py",
  "../core/stability.py",
  "../core/i18n.py",
  "../core/theory.py",
  "../core/diagrams.py",
  "../core/buoy_diagrams.py",
  "../core/gmdss_diagrams.py",
  "../core/light_diagrams.py",
  "../core/distress_signals_diagrams.py",
  "../core/smcp_diagrams.py",
  "../core/meteorology_diagrams.py",
  "../core/isps_diagrams.py",
  "../core/true_wind.py",
  "../core/sextant.py",
  "../core/roll_period.py",
  "../core/blind_distance.py",
  "../core/noon_report.py",
  "../core/bunker.py",
  "../core/dew_point.py",
  "../core/compass_comparison.py",
  "../core/cargo_ullage.py",
  "../core/ballast_sounding.py",
  "../core/drill_log.py",
  "../core/notices_log.py",
  "../core/celestial.py",
  "../core/deadweight_scale.py",
  "../core/fwa.py",
  "../core/suspended_load.py",
  "../core/license.py",
];

const DATA_FILES = [
  "../data/legal/requisites.json",
  "../data/legal/offer.ru.html",
  "../data/legal/privacy.ru.html",
  "../data/legal/consent.ru.html",
  "../data/legal/guide.ru.html",
  "../data/strings/ru.json",
  "../data/strings/en.json",
  "../data/theory/colregs.ru.json",
  "../data/theory/colregs.en.json",
  "../data/theory/gmdss.ru.json",
  "../data/theory/gmdss.en.json",
  "../data/theory/iala.ru.json",
  "../data/theory/iala.en.json",
  "../data/theory/distress_signals.ru.json",
  "../data/theory/distress_signals.en.json",
  "../data/theory/light_shapes.ru.json",
  "../data/theory/light_shapes.en.json",
  "../data/theory/smcp.ru.json",
  "../data/theory/smcp.en.json",
  "../data/theory/meteorology.ru.json",
  "../data/theory/meteorology.en.json",
  "../data/theory/isps.ru.json",
  "../data/theory/isps.en.json",
  "../data/theory/reference_tables.ru.json",
  "../data/theory/reference_tables.en.json",
];

self.addEventListener("install", (event) => {
  // ВАЖНО (найдено 2026-10-02, после повторных жалоб "кнопка не
  // работает" уже ПОСЛЕ ручной чистки кэша через DevTools): обычный
  // cache.addAll(urls) внутри делает fetch() в режиме "default" — а это
  // значит, что сама установка нового Service Worker'а могла молча
  // получить файл НЕ из сети, а из обычного HTTP-кэша браузера (если
  // он уже когда-то запрашивал "./js/calculators.js" без query-строки
  // и браузер эвристически закэшировал ответ — сервер разработки не
  // шлёт Cache-Control, поэтому Chrome вправе кэшировать по своему
  // усмотрению). Версионный "?v=N" в <script src> эту проблему не
  // решает, потому что сам install-шаг обращается к файлам по "голому"
  // пути без query. Итог — даже полностью новый, только что
  // установленный Service Worker мог закэшировать СТАРОЕ содержимое
  // файла сам того не "зная". Фикс — явный fetch(url, {cache:
  // "reload"}) на каждый файл: этот режим целенаправленно игнорирует
  // HTTP-кэш и идёт в сеть напрямую, минуя эвристическое кэширование
  // браузера. Теперь install гарантированно кладёт в Cache Storage
  // по-настоящему свежий файл, а не то, что случайно лежало в HTTP-кэше.
  const pyodideReady = caches.open(PYODIDE_CACHE_NAME).then((cache) =>
    Promise.all(PYODIDE_FILES.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`SW install: не удалось загрузить ${url} (${response.status})`);
      await cache.put(url, response);
    }))
  );
  event.waitUntil(Promise.all([pyodideReady,
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        [...APP_SHELL, ...CORE_FILES, ...DATA_FILES].map((url) =>
          fetch(url, { cache: "reload" }).then((response) => {
            if (!response.ok) {
              throw new Error(`SW install: не удалось загрузить ${url} (${response.status})`);
            }
            return cache.put(url, response);
          })
        )
      )
    )
  ]));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // PYODIDE_CACHE_NAME умышленно НЕ трогается здесь — иначе
          // каждый бамп CACHE_NAME (визуальная правка, новый калькулятор)
          // стирал бы уже закэшированный 10-мегабайтный рантайм и
          // заставлял скачивать его заново при следующем подключении к
          // сети, хотя сам Pyodide не менялся.
          .filter((k) => k !== CACHE_NAME && k !== PYODIDE_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Рантайм Pyodide — кэш "по факту обращения": есть в кэше → сразу из
  // кэша (работает офлайн); нет → идём в сеть и параллельно сохраняем
  // успешный ответ на будущее. Ошибку/редирект НЕ кэшируем намеренно —
  // временный сетевой сбой не должен "запечься" в кэш как рабочий файл.
  if (url.startsWith(PYODIDE_URL_PREFIX)) {
    event.respondWith(
      caches.open(PYODIDE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // Свои же файлы — как раньше, кэш-первым с фолбэком в сеть.
  // { ignoreSearch: true } — важно из-за версионного ?v=N у <script>/
  // <link> в index.html (см. комментарий там): APP_SHELL хранит пути
  // БЕЗ query-строки, а реальный запрос браузера идёт С ?v=N — без
  // ignoreSearch это было бы постоянным промахом кэша (запрос и ключ
  // кэша — формально разные URL), и офлайн-режим для этих файлов
  // переставал бы работать молча.
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
    );
  }
});
