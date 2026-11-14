/**
 * Минимальный i18n-модуль для PWA — намеренно зеркалит логику
 * core/i18n.py (t(), normalize_language(), фолбэк requested → ru →
 * "[[key]]"), но реализован на чистом JS, а не через Pyodide: это
 * простая работа с данными (JSON), гонять её через Python-интерпретатор
 * в WASM было бы медленнее и сложнее без всякой пользы. Источник
 * данных общий с Streamlit-версией — data/strings/<lang>.json,
 * никакого дублирования текстов не создаётся.
 *
 * Обёрнуто в IIFE намеренно: index.html подключает этот файл и app.js
 * как обычные <script> (не type="module"), а значит верхнеуровневые
 * `const`/`function` из разных файлов делят ОДНУ глобальную область
 * видимости. Без IIFE здесь `function t(...)` и `const { t } = ...`
 * в app.js конфликтуют — браузер бросает `SyntaxError: Identifier 't'
 * has already been declared` ДО выполнения app.js, и всё приложение
 * молча не запускается (обнаружено Playwright-проверкой, не видно
 * было бы без реального выполнения в браузере). IIFE прячет все
 * внутренние имена, наружу выходит только window.ShipHelperI18n.
 */
(function () {

const SUPPORTED_LANGUAGES = ["ru", "en"];
const LANGUAGE_NAMES = { ru: "Русский", en: "English" };
const DEFAULT_LANGUAGE = "ru";

const _cache = {};

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

async function _loadStrings(lang) {
  if (!(lang in _cache)) {
    try {
      // cache: "no-cache" — см. подробный комментарий у _fetchText() в
      // pyodide-bridge.js: без этого браузер эвристически кэширует
      // ответ python http.server и молча отдаёт старую версию файла
      // после каждого обновления на диске, даже при обычной
      // перезагрузке страницы.
      const resp = await fetch(`../data/strings/${lang}.json`, { cache: "no-cache" });
      _cache[lang] = resp.ok ? await resp.json() : {};
    } catch (e) {
      _cache[lang] = {};
    }
  }
  return _cache[lang];
}

/** Предзагружает оба языка сразу, чтобы t() ниже мог быть синхронным
 * после старта приложения (UI не должен мигать пустыми подписями). */
async function preloadI18n() {
  await Promise.all(SUPPORTED_LANGUAGES.map(_loadStrings));
}

function t(key, lang, params) {
  lang = normalizeLanguage(lang);
  let value = (_cache[lang] || {})[key];
  if (value === undefined && lang !== DEFAULT_LANGUAGE) {
    value = (_cache[DEFAULT_LANGUAGE] || {})[key];
  }
  if (value === undefined) {
    return `[[${key}]]`;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replaceAll(`{${k}}`, v);
    }
  }
  return value;
}

window.ShipHelperI18n = { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, DEFAULT_LANGUAGE, normalizeLanguage, preloadI18n, t };

})();
