/**
 * Мост к core/ — вся расчётная логика ShipHelper остаётся чистым Python
 * в core/ и выполняется ПРЯМО В БРАУЗЕРЕ через Pyodide (CPython,
 * скомпилированный в WebAssembly). Никакого backend-сервера и никакого
 * дублирования формул на JS — то же самое решение, что и раньше
 * (core/ не зависит от интерфейса, см. CLAUDE.md), только теперь
 * "интерфейсом" выступает браузер напрямую, а не Streamlit-процесс на
 * Python-сервере.
 *
 * Почему это не ломает offline-режим: после первой загрузки Pyodide-
 * рантайм и файлы core/ кешируются service worker'ом (см. sw.js) —
 * последующие открытия работают без сети целиком.
 *
 * ВАЖНО: список PYTHON_MODULES ниже нужно пополнять вручную при
 * переносе очередного калькулятора с Streamlit на PWA — Pyodide не
 * "видит" файловую систему репозитория сама, каждый модуль явно
 * загружается через fetch() и пишется в виртуальную FS.
 *
 * Обёрнуто в IIFE по той же причине, что и i18n.js (см. комментарий
 * там): верхнеуровневые имена (initPyodide, callCore, _pyodideInstance
 * и т.д.) иначе конфликтуют с одноимённой деструктуризацией `const` в
 * app.js в общей глобальной области классических <script>-тегов.
 */
(function () {

const PYTHON_MODULES = [
  "__init__.py",
  "compass.py",
  "speed_time_distance.py",
  "sailing.py",
  "log_navigation.py",
  "cpa.py",
  "navigation_triangle.py",
  "converters.py",
  "ukc.py",
  "squat.py",
  "tides.py",
  "draft_survey.py",
  "ballast.py",
  "stability.py",
  "i18n.py",
  "theory.py",
  "diagrams.py",
  "buoy_diagrams.py",
  "gmdss_diagrams.py",
  "light_diagrams.py",
  "distress_signals_diagrams.py",
  "smcp_diagrams.py",
  "meteorology_diagrams.py",
  "isps_diagrams.py",
  "true_wind.py",
  "sextant.py",
  "roll_period.py",
  "blind_distance.py",
  "noon_report.py",
  "bunker.py",
  "dew_point.py",
  "compass_comparison.py",
  "cargo_ullage.py",
  "ballast_sounding.py",
  "drill_log.py",
  "notices_log.py", "celestial.py",
  "deadweight_scale.py",
  "fwa.py",
  "suspended_load.py",
  "license.py",
  // Добавлять сюда по мере переноса следующих калькуляторов.
];

// ВАЖНО (найдено по реальным жалобам пользователя "калькулятор не
// работает" на уже исправленный код — воспроизвести в песочнице
// нельзя, здесь нет живого Pyodide/сети): `fetch()` без явного режима
// кэша ниже кэшировался браузером ЭВРИСТИЧЕСКИ (`python -m http.server`
// не шлёт `Cache-Control`, но Chrome всё равно кэширует такие ответы по
// эвристике на основе `Last-Modified`) — после каждого обновления
// core/*.py на диске пользователя браузер продолжал молча отдавать
// СТАРУЮ версию файла из HTTP-кэша, даже при обычной перезагрузке
// страницы (не hard-reload). Live-проверкой через `fetch(url, {cache:
// "no-store"})` подтверждено: закэшированная версия
// `speed_time_distance.py` была на 3922 байта (без
// required_speed_for_deadline/multi_waypoint_eta), актуальная на диске
// — 7140 байт. Симптом был неотличим от настоящего бага в коде —
// заодно ломал функции, добавленные ДО текущего сеанса тоже. Исправлено
// параметром кэша `"no-cache"` (= всегда идти на сервер за
// подтверждением свежести через If-Modified-Since/ETag, а не слепо
// брать локальную копию) — не `"no-store"`, чтобы при реальном офлайне
// (через service worker, см. sw.js) кэш service worker'а всё ещё мог
// сработать как последняя линия защиты.
let _pyodideInstance = null;
let _readyPromise = null;

async function _fetchText(path) {
  const resp = await fetch(path, { cache: "no-cache" });
  if (!resp.ok) {
    throw new Error(`Не удалось загрузить ${path}: HTTP ${resp.status}`);
  }
  return resp.text();
}

async function initPyodide(onProgress) {
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    onProgress?.("Загружаю Python-рантайм (Pyodide)…");
    _pyodideInstance = await loadPyodide({
      // Локальная копия (pwa/vendor/pyodide) — работает без сети и в Android-сборке
      indexURL: new URL("vendor/pyodide/", document.baseURI).href,
    });

    onProgress?.("Загружаю расчётные модули (core/)…");
    _pyodideInstance.FS.mkdirTree("/core");
    for (const filename of PYTHON_MODULES) {
      const src = await _fetchText(`../core/${filename}`);
      if (window.AzimuthNative) console.info(`[boot ${Math.round(performance.now())} ms] core/${filename}`);
      _pyodideInstance.FS.writeFile(`/core/${filename}`, src);
    }

    _pyodideInstance.runPython(`
import sys
if "/" not in sys.path:
    sys.path.insert(0, "/")
`);

    onProgress?.("Готово");
    return _pyodideInstance;
  })();

  return _readyPromise;
}

/**
 * Вызывает функцию core.<module>.<func>(*args) и возвращает результат
 * как обычный JS-объект (dataclass -> dict через vars(), рекурсивно
 * для вложенных списков/dataclass'ов вроде CalculationStep внутри
 * CompassResult.steps).
 *
 * ВАЖНО (найдено на реальном запуске у пользователя, не в песочнице —
 * здесь Pyodide вообще не грузится из-за заблокированного CDN): здесь
 * ниже НЕ вызывается `_sh_args.to_py()` внутри Python-кода, хотя это
 * стандартный паттерн Pyodide для конвертации значений, пришедших из
 * JS. Причина: `pyodide.toPy(args)` уже конвертирует JS-массив в самый
 * обычный Python `list` ДО того, как передать его в Python через
 * globals.set() — а не оборачивает его в JsProxy. Обычный `list` не
 * имеет метода `.to_py()` (это метод JsProxy) — вызов `_sh_args.to_py()`
 * падал с `AttributeError: 'list' object has no attribute 'to_py'`.
 * Правильно — использовать `_sh_args` напрямую, он уже питоновский список.
 *
 * ВТОРОЙ ВАЖНЫЙ НЮАНС (найден на реальном Pyodide 0.26.4, тоже не
 * воспроизводим в песочнице — CDN заблокирован): вопреки тому, что
 * предполагали более ранние комментарии в этом файле и в CLAUDE.md,
 * JS `Date` НЕ конвертируется в Python `datetime.datetime`
 * АВТОМАТИЧЕСКИ — ни через `pyodide.toPy()`, ни через прямой вызов
 * питоновской функции с сырым JS Date в качестве аргумента, ни в
 * обратную сторону (`datetime.datetime` -> `toJs()` НЕ даёт JS `Date`).
 * Проверено вживую на машине пользователя (см. сессию с багом
 * "tides/eta не работают" — `TypeError: unsupported operand type(s)
 * for -: 'pyodide.ffi.JsProxy' and 'pyodide.ffi.JsProxy'"). Раньше это
 * считалось работающим "само собой" — предположение никогда не было
 * проверено на реальном Pyodide (CDN недоступен в песочнице), поэтому
 * баг молча жил в ETA/Required Speed/Multi-WP ETA/Tides до этого
 * момента. Поэтому здесь ниже — явная ручная конвертация в обе
 * стороны:
 *   - `_wrapDatesForPy()` (JS) проходит по args ДО pyodide.toPy() и
 *     заменяет каждый `Date` на простой JS-объект-маркер
 *     `{__py_datetime__: true, y, mo, d, h, mi, s}` (компоненты
 *     локального времени, как их отдаёт сам Date — без пересчёта в UTC,
 *     чтобы то, что ввёл пользователь на часах, дошло до Python один в
 *     один);
 *   - `_from_plain()` (Python, генерируется ниже) проходит по _sh_args
 *     ПОСЛЕ toPy() и собирает такие маркеры обратно в настоящий
 *     `datetime.datetime` — обычные словари/списки без маркера остаются
 *     как есть;
 *   - `_to_plain()` (Python) в обратную сторону превращает любой
 *     `datetime.datetime`/`datetime.date` в результате в ISO-строку
 *     (`.isoformat()`) — JS-код калькуляторов уже ожидает такую форму
 *     (`new Date(result.eta)` — везде, где эти поля читаются, уже есть
 *     фолбэк на строку, он был написан заранее на этот случай).
 * Если в будущем понадобится передать/получить дату в новом
 * калькуляторе — ничего в JS-коде калькулятора менять не нужно, эта
 * конвертация работает для ЛЮБОГО Date-аргумента/результата автоматически.
 */
function _wrapDatesForPy(value) {
  if (value instanceof Date) {
    return {
      __py_datetime__: true,
      y: value.getFullYear(),
      mo: value.getMonth() + 1,
      d: value.getDate(),
      h: value.getHours(),
      mi: value.getMinutes(),
      s: value.getSeconds(),
    };
  }
  if (Array.isArray(value)) return value.map(_wrapDatesForPy);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = _wrapDatesForPy(value[key]);
    return out;
  }
  return value;
}

/* Пустое или нечисловое поле даёт в JS NaN (parseFloat("") / Invalid Date).
   Не пускаем его в расчёт: вместо «NaN» на экране — понятное сообщение
   «заполните все поля» (код err.common.empty_field, переводится как
   любая другая ошибка расчёта). */
function _hasEmptyValue(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.some(_hasEmptyValue);
  if (value && typeof value === "object") return Object.values(value).some(_hasEmptyValue);
  return false;
}

async function callCore(moduleName, funcName, args) {
  if (_hasEmptyValue(args)) {
    throw new Error("ValueError: err.common.empty_field");
  }
  const pyodide = await initPyodide();
  pyodide.globals.set("_sh_args", pyodide.toPy(args.map(_wrapDatesForPy)));
  const result = pyodide.runPython(`
import importlib
import dataclasses
import datetime

def _from_plain(obj):
    if isinstance(obj, dict):
        if obj.get("__py_datetime__"):
            return datetime.datetime(
                int(obj["y"]), int(obj["mo"]), int(obj["d"]),
                int(obj["h"]), int(obj["mi"]), int(obj["s"]),
            )
        return {k: _from_plain(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_plain(x) for x in obj]
    return obj

def _to_plain(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if dataclasses.is_dataclass(obj):
        return {f.name: _to_plain(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, (list, tuple)):
        return [_to_plain(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _to_plain(v) for k, v in obj.items()}
    return obj

_module = importlib.import_module("${moduleName}")
_func = getattr(_module, "${funcName}")
_sh_args = _from_plain(_sh_args)
_result = _func(*_sh_args)
_to_plain(_result)
`);
  // Python-функция может вернуть None (например, get_*_diagram_html для
  // чужого имени схемы) — runPython отдаёт тогда undefined, и обращение
  // к result.toJs раньше падало TypeError в консоль на каждый перебор
  // модулей схем в теории. Возвращаем null.
  if (result === undefined || result === null) return null;
  return result.toJs ? result.toJs({ dict_converter: Object.fromEntries }) : result;
}

window.ShipHelperPy = { initPyodide, callCore };

})();
