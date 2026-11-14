/**
 * Лицензии AZIMUTH v2 — проверка полностью офлайн, без сервера.
 *
 * Ключ подписан Ed25519 (закрытый ключ есть только у продавца в генераторе ключей), внутри:
 * срок (1/6/12 месяцев или бессрочно), дата окончания, коды двух устройств — одного компьютера
 * (PC-XXXX-XXXX) и одного телефона или планшета: Android (AN-XXXX-XXXX) либо iPhone/iPad
 * (IP-XXXX-XXXX). Телефонный слот в ключе один — тип телефона ключ не хранит, код устройства
 * считается с учётом платформы, поэтому код iPhone не подойдёт к Android и наоборот.
 * Формат — tools/license/lic2.py.
 *
 * Ключ проверяется ЗАНОВО при каждом запуске и каждые несколько минут (подпись, устройство,
 * срок), а не только при вводе. Защита от перевода часов назад: запоминается самое позднее
 * виденное время; если часы устройства ушли назад больше чем на 36 ч — полная версия
 * блокируется до исправления даты.
 *
 * Честный предел: подделать ключ без закрытого ключа нельзя, но программа работает
 * на устройстве покупателя, и опытный человек может изменить сам код программы.
 * От этого офлайн-защита не спасает полностью — она делает обход трудным, а не невозможным.
 */
(function () {

const STORAGE_KEY = "shiphelper-license";
const SEEN_KEY = "shiphelper-license-seen";
const DEVICE_KEY = "shiphelper-device-id";
const PUBLIC_KEY_B64 = "Z2VTyzNAdy/A+6V2WgPkXDt0ZPOaiQc7a2/nJWsBsi8=";
const DOMAIN = "AZIMUTH-LIC-v2";
const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const EPOCH_UTC = Date.UTC(2026, 0, 1);
const PERPETUAL = 0xffff;
const CLOCK_SLACK_MS = 36 * 3600 * 1000;

const nacl = window.nacl;
const PUB = Uint8Array.from(atob(PUBLIC_KEY_B64), (c) => c.charCodeAt(0));
const utf8 = (s) => new TextEncoder().encode(s);

function b32enc(bytes) {
  let n = 0, bits = 0, out = "";
  for (const x of bytes) {
    n = ((n << 8) | x) & 0xffff; bits += 8;
    while (bits >= 5) { bits -= 5; out += ALPH[(n >> bits) & 31]; }
  }
  if (bits) out += ALPH[(n << (5 - bits)) & 31];
  return out;
}
function b32dec(s) {
  s = s.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  let n = 0, bits = 0; const out = [];
  for (const ch of s) {
    const v = ALPH.indexOf(ch); if (v < 0) return null;
    n = ((n << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((n >> bits) & 255); }
  }
  return new Uint8Array(out);
}

// ---------- код устройства ----------
const UA = navigator.userAgent || "";
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** "PC" — компьютер, "AN" — Android, "IP" — iPhone/iPad (веб-версия с экрана «Домой»). */
function platform() {
  if (window.AzimuthNative) return "AN";
  if (window.AzimuthDesktop || (window.chrome && window.chrome.webview)) return "PC";
  if (IS_IOS) return "IP";
  if (/Android/i.test(UA)) return "AN";
  return "PC";
}
const isPhone = () => platform() !== "PC";
function rawDeviceId() {
  try {
    if (window.AzimuthNative && window.AzimuthNative.deviceId) { const v = window.AzimuthNative.deviceId(); if (v) return String(v); }
  } catch (e) { /* старая сборка без метода */ }
  if (window.AzimuthDesktop && window.AzimuthDesktop.deviceId) return String(window.AzimuthDesktop.deviceId);
  // веб-версия (iPhone/iPad с экрана «Домой», браузер): случайный id, хранится в данных приложения
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const r = new Uint8Array(16); crypto.getRandomValues(r);
      id = "web-" + Array.from(r, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) { return "web-unknown"; }
}
let _dev = null;
function deviceCodeBytes() {
  if (!_dev) _dev = nacl.hash(utf8(`AZIMUTH-DEV-v1|${platform()}|${rawDeviceId()}`)).slice(0, 5);
  return _dev;
}
function formatCode(plat, bytes) { const s = b32enc(bytes); return `${plat}-${s.slice(0, 4)}-${s.slice(4, 8)}`; }
function deviceCode() { return formatCode(platform(), deviceCodeBytes()); }

// ---------- разбор ключа ----------
function parseKey(text) {
  const t = String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (/^AZMT/.test(t)) return { error: "legacy" };
  if (!t.startsWith("AZ2")) return { error: "invalid" };
  const b = b32dec(t.slice(3));
  if (!b || b.length !== 83) return { error: "invalid" };
  const payload = b.slice(0, 19), sig = b.slice(19);
  const msg = new Uint8Array(DOMAIN.length + 19); msg.set(utf8(DOMAIN)); msg.set(payload, DOMAIN.length);
  if (!nacl.sign.detached.verify(msg, sig, PUB)) return { error: "invalid" };
  if (payload[0] !== 2 || ![0, 1, 6, 12].includes(payload[1])) return { error: "invalid" };
  const u16 = (i) => (payload[i] << 8) | payload[i + 1];
  const slot = (i) => (payload.slice(i, i + 5).some((x) => x) ? payload.slice(i, i + 5) : null);
  return {
    plan: payload[1],
    serial: (payload[2] << 16) | (payload[3] << 8) | payload[4],
    issueDay: u16(5), expiryDay: u16(7),
    pc: slot(9), an: slot(14),
  };
}
const sameBytes = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
function todayDay(now) { return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH_UTC) / 86400000); }
function dayToDate(n) { const d = new Date(EPOCH_UTC + n * 86400000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

function readStored() {
  try { const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); return p && p.key ? p : null; } catch (e) { return null; }
}

/** Полная проверка ключа на этом устройстве в момент now. */
function evaluate(keyText, now = new Date(), touchClock = true) {
  const info = parseKey(keyText);
  if (info.error) return { state: info.error };
  const mine = isPhone() ? info.an : info.pc;
  const res = {
    plan: info.plan, serial: info.serial, perpetual: info.expiryDay === PERPETUAL,
    issue: dayToDate(info.issueDay), expiry: info.expiryDay === PERPETUAL ? null : dayToDate(info.expiryDay),
    devices: { pc: info.pc ? formatCode("PC", info.pc) : null, // тип телефона ключ не хранит: приставку AN-/IP- показываем, только если это наше устройство
    an: info.an ? (isPhone() && sameBytes(info.an, deviceCodeBytes()) ? formatCode(platform(), info.an) : formatCode("", info.an).slice(1)) : null },
  };
  if (!sameBytes(mine, deviceCodeBytes())) return { ...res, state: "wrong_device" };
  // часы
  let seen = 0;
  try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (e) {}
  const today = todayDay(now);
  if (now.getTime() < seen - CLOCK_SLACK_MS || today < info.issueDay - 1) return { ...res, state: "clock" };
  if (touchClock && now.getTime() > seen) { try { localStorage.setItem(SEEN_KEY, String(now.getTime())); } catch (e) {} }
  if (!res.perpetual) {
    res.daysLeft = info.expiryDay - today;
    if (today > info.expiryDay) return { ...res, state: "expired" };
  }
  return { ...res, state: "active" };
}

let _cache = null;
function status() {
  const st = readStored();
  if (!st) return { state: "demo" };
  const now = Date.now();
  if (_cache && _cache.key === st.key && now - _cache.at < 30000) return _cache.res;
  const res = { ...evaluate(st.key), key: st.key };
  _cache = { key: st.key, at: now, res };
  return res;
}
function isActivated() { return status().state === "active"; }
function getKey() { const st = readStored(); return st ? st.key : null; }

/** Ввод ключа. Возвращает {ok, state, ...}. Сохраняется только ключ, подходящий этому устройству. */
async function activate(rawKey) {
  const text = String(rawKey || "").trim();
  const res = evaluate(text);
  if (res.state !== "active") return { ok: false, ...res };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, key: text.toUpperCase().replace(/\s+/g, ""), activatedAt: new Date().toISOString() }));
  } catch (e) { /* приватный режим — действует до закрытия */ }
  _cache = null;
  document.dispatchEvent(new Event("shiphelper:licensechange"));
  return { ok: true, ...res };
}
function deactivate() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  _cache = null;
  document.dispatchEvent(new Event("shiphelper:licensechange"));
}

// повторная проверка во время работы (окончание срока, смена даты)
let _last = null;
setInterval(() => {
  _cache = null;
  const s = status().state;
  if (_last !== null && s !== _last) document.dispatchEvent(new Event("shiphelper:licensechange"));
  _last = s;
}, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  _cache = null; const s = status().state;
  if (_last !== null && s !== _last) document.dispatchEvent(new Event("shiphelper:licensechange"));
  _last = s;
});

window.ShipHelperLicense = { isActivated, getKey, activate, deactivate, status, deviceCode, platform, isPhone, isIOS: IS_IOS, _evaluate: evaluate, _parseKey: parseKey };

})();
