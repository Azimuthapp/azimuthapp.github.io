/*
 * docx-writer.js — минимальный генератор настоящих .docx (Office Open XML)
 * прямо в браузере, без внешних библиотек и без сети.
 *
 * Зачем свой, а не библиотека: приложение работает офлайн, а python-docx
 * в Pyodide тянет lxml (тяжёлый C-пакет, отдельная загрузка). Формат .docx —
 * это ZIP-архив с несколькими XML-файлами; для отчёта драфт-сюрвея нужно
 * всего три вещи — абзацы, жирный/крупный текст и таблицы. ZIP пишется
 * без сжатия (метод "store") — Word открывает такие файлы штатно, а код
 * остаётся маленьким и проверяемым.
 *
 * API (window.ShipHelperDocx):
 *   const doc = ShipHelperDocx.create();
 *   doc.title("Текст");                 // крупный заголовок документа
 *   doc.heading("Текст");               // заголовок раздела
 *   doc.paragraph("Текст", {bold, italic, size, color, align});
 *   doc.table(rows, {header: true, widths: [..twips..]});
 *   doc.spacer();
 *   const blob = doc.toBlob();          // application/vnd...wordprocessingml
 *   ShipHelperDocx.download(blob, "report.docx");
 */
(function () {
  "use strict";

  /* ---------------- XML-экранирование ---------------- */
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Управляющие символы недопустимы в XML 1.0 — Word отказался бы открыть файл.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }

  /* ---------------- Абзацы и таблицы ---------------- */
  function run(text, opts) {
    const o = opts || {};
    let rPr = "";
    if (o.bold) rPr += "<w:b/>";
    if (o.italic) rPr += "<w:i/>";
    if (o.color) rPr += `<w:color w:val="${o.color}"/>`;
    if (o.size) rPr += `<w:sz w:val="${o.size * 2}"/><w:szCs w:val="${o.size * 2}"/>`;
    // Перенос строк внутри одного абзаца — через <w:br/>.
    const parts = String(text === undefined || text === null ? "" : text).split("\n");
    const body = parts
      .map((p, i) => (i > 0 ? "<w:br/>" : "") + `<w:t xml:space="preserve">${esc(p)}</w:t>`)
      .join("");
    return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}${body}</w:r>`;
  }

  function para(text, opts) {
    const o = opts || {};
    let pPr = "";
    if (o.align) pPr += `<w:jc w:val="${o.align}"/>`;
    const before = o.spaceBefore !== undefined ? o.spaceBefore : 0;
    const after = o.spaceAfter !== undefined ? o.spaceAfter : 80;
    pPr += `<w:spacing w:before="${before}" w:after="${after}"/>`;
    if (o.keepNext) pPr += "<w:keepNext/>";
    if (o.borderBottom) {
      pPr += `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${o.borderBottom}"/></w:pBdr>`;
    }
    return `<w:p><w:pPr>${pPr}</w:pPr>${run(text, o)}</w:p>`;
  }

  function cell(content, opts) {
    const o = opts || {};
    let tcPr = "";
    if (o.width) tcPr += `<w:tcW w:w="${o.width}" w:type="dxa"/>`;
    if (o.shade) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`;
    if (o.span && o.span > 1) tcPr += `<w:gridSpan w:val="${o.span}"/>`;
    tcPr += '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/></w:tcMar>';
    const p = para(content, {
      bold: o.bold,
      size: o.size || 9.5,
      align: o.align,
      spaceAfter: 0,
      color: o.color,
    });
    return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${p}</w:tc>`;
  }

  function table(rows, opts) {
    const o = opts || {};
    const cols = Math.max(...rows.map((r) => r.reduce((n, c) => n + ((c && c.span) || 1), 0)));
    const total = 9638; // ширина текста A4 при полях 2 см, в twips
    const widths = o.widths || Array(cols).fill(Math.floor(total / cols));
    const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
    const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="B8C2D3"/>`;
    const tblPr =
      `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>` +
      `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
      `<w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
    const body = rows
      .map((r, ri) => {
        const isHeader = o.header && ri === 0;
        let colIdx = 0;
        const cells = r
          .map((c) => {
            const spec = c !== null && typeof c === "object" ? c : { text: c };
            const span = spec.span || 1;
            const w = widths.slice(colIdx, colIdx + span).reduce((a, b) => a + b, 0);
            const firstCol = colIdx === 0;
            colIdx += span;
            return cell(spec.text, {
              width: w,
              span,
              bold: isHeader || spec.bold,
              shade: isHeader ? "1F3355" : spec.shade || (o.zebra && ri % 2 === 0 ? "F2F5FA" : null),
              color: isHeader ? "FFFFFF" : spec.color,
              align: spec.align || (firstCol ? "left" : o.numAlign || "right"),
              size: o.size,
            });
          })
          .join("");
        // <w:tblHeader/> (повтор шапки на каждой странице) НЕ используется:
        // LibreOffice при переносе такой таблицы на новую страницу терял
        // строки (проверено конвертацией отчёта в PDF — пропадала часть
        // статей запасов). Без повтора шапки таблица переносится корректно
        // и в Word, и в LibreOffice.
        const trPr = "<w:trPr><w:cantSplit/></w:trPr>";
        return `<w:tr>${trPr}${cells}</w:tr>`;
      })
      .join("");
    // Пустой абзац после таблицы — иначе две таблицы подряд Word склеивает в одну.
    return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>` + para("", { spaceAfter: 60 });
  }

  /* ---------------- Обязательные части пакета .docx ---------------- */
  const CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>";

  const ROOT_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>";

  const DOC_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    "</Relationships>";

  const STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>' +
    '<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ru-RU"/>' +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
    '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    "</w:styles>";

  function footerXml(text) {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
      run(text + "   ·   ", { size: 8, color: "7A869A" }) +
      '<w:r><w:rPr><w:color w:val="7A869A"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:rPr><w:color w:val="7A869A"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:rPr><w:color w:val="7A869A"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:rPr><w:color w:val="7A869A"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r>' +
      '<w:r><w:rPr><w:color w:val="7A869A"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>' +
      "</w:p></w:ftr>"
    );
  }

  function coreXml(title) {
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(title)}</dc:title><dc:creator>Azimuth</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      "</cp:coreProperties>"
    );
  }

  /* ---------------- ZIP (метод store, без сжатия) ---------------- */
  const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  function zip(files) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach(({ name, content }) => {
      const nameBytes = enc.encode(name);
      const data = typeof content === "string" ? enc.encode(content) : content;
      const crc = crc32(data);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 имена файлов
      local.setUint16(8, 0, true); // store
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), nameBytes, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint16(30, 0, true);
      cen.setUint16(32, 0, true);
      cen.setUint16(34, 0, true);
      cen.setUint16(36, 0, true);
      cen.setUint32(38, 0, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), nameBytes);

      offset += 30 + nameBytes.length + data.length;
    });

    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  /* ---------------- Построитель документа ---------------- */
  function create(meta) {
    const m = meta || {};
    const body = [];
    const api = {
      title(text, sub) {
        body.push(para(text, { bold: true, size: 17, color: "1F3355", spaceAfter: 40 }));
        if (sub) body.push(para(sub, { size: 9.5, color: "5B6B82", spaceAfter: 160, borderBottom: "C9A35A" }));
        return api;
      },
      heading(text) {
        body.push(para(text, { bold: true, size: 12, color: "1F3355", spaceBefore: 200, spaceAfter: 80, keepNext: true }));
        return api;
      },
      paragraph(text, opts) {
        body.push(para(text, opts));
        return api;
      },
      table(rows, opts) {
        body.push(table(rows, opts));
        return api;
      },
      spacer() {
        body.push(para("", { spaceAfter: 120 }));
        return api;
      },
      toBlob() {
        const sect =
          '<w:sectPr><w:footerReference w:type="default" r:id="rId2"/>' +
          '<w:pgSz w:w="11906" w:h="16838"/>' +
          '<w:pgMar w:top="1021" w:right="1134" w:bottom="1021" w:left="1134" w:header="567" w:footer="454" w:gutter="0"/>' +
          "</w:sectPr>";
        const documentXml =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<w:body>${body.join("")}${sect}</w:body></w:document>`;
        return zip([
          { name: "[Content_Types].xml", content: CONTENT_TYPES },
          { name: "_rels/.rels", content: ROOT_RELS },
          { name: "docProps/core.xml", content: coreXml(m.title || "") },
          { name: "word/document.xml", content: documentXml },
          { name: "word/styles.xml", content: STYLES },
          { name: "word/footer1.xml", content: footerXml(m.footer || "") },
          { name: "word/_rels/document.xml.rels", content: DOC_RELS },
        ]);
      },
    };
    return api;
  }

  function download(blob, filename) {
    // Android-сборка (WebView): ссылки на blob: там не скачиваются —
    // передаём файл в нативный код, он сохраняет его в «Загрузки».
    const nat = window.AzimuthNative;
    if (nat && typeof nat.saveFile === "function") {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = String(reader.result).split(",")[1] || "";
        nat.saveFile(filename, blob.type || "application/octet-stream", b64);
      };
      reader.readAsDataURL(blob);
      return;
    }
    // iPhone/iPad: в приложении с экрана «Домой» ссылка download ненадёжна — отдаём файл
    // через системное окно «Поделиться» (там есть «Сохранить в Файлы», почта, мессенджеры).
    const ios = window.AzimuthIOS && window.AzimuthIOS.isIOS;
    if (ios && navigator.canShare && typeof File === "function") {
      try {
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] }).catch((err) => {
            if (err && err.name !== "AbortError") anchorDownload(blob, filename);
          });
          return;
        }
      } catch (e) { /* ниже — обычная ссылка */ }
    }
    anchorDownload(blob, filename);
  }

  function anchorDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.ShipHelperDocx = { create, download };
})();
