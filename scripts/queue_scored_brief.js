// scripts/queue_scored_brief.js — Generates Dynamic, Boilerplate-Free Scored Briefs Into news-queue.json
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com";
const FOOTBALL_REPO_RAW_BASE = "https://raw.githubusercontent.com/tennittes/diploman-football-tally/main";
const FOOTBALL_FALLBACK_BANNER =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiEjynaVCtt3sYwWSMmZt6p3IJG5W9t1DwrfmFCawdojeihYVuNN75wZymwVLZ_fx6Ampvi6r7j1xQ1IhAkOcdfl4BrGf6Bs6xi_hkvmR6nHQXbr7KQyHbooyUOXqNW_TrZZiAkz5iSFglPx0irzR23AoBeG0Ren9o1ZV9GlRTNSYJqRcvaBHom2hXhvTM/s1080/Diploman%20Football%20Stats%20Logo.png";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 600;

const SOCIAL_EXCERPT_CTA = {
  governancescore: "Read the full 37-jurisdiction brief:",
  policingintel: "Read the full 37-jurisdiction brief:",
  footballtally: "Read the full multi-league telemetry brief:"
};

function buildSocialExcerpt({ vertical, title, summary, url }) {
  const cleanTitle = String(title || "").trim();
  const cleanSummary = String(summary || "").trim();
  const targetUrl = String(url || DIPLOMAN_TIMES_URL).trim();
  const cta = SOCIAL_EXCERPT_CTA[vertical] || "Read the full brief:";
  return [cleanTitle, cleanSummary, `${cta} ${targetUrl}`].filter(Boolean).join("\n\n");
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function formatDelta(val) {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function formatNum(val, decimals = 1) {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

function formatList(items, formatter, conjunction = "and") {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return "";
  const formatted = list.map((item, idx) => formatter(item, idx));
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} ${conjunction} ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, ${conjunction} ${formatted[formatted.length - 1]}`;
}

function pickCardVariantIndex(dateStr, angleId) {
  const dayNum = Number(String(dateStr || "").replace(/-/g, ""));
  const angleNum = Number(angleId || 1);
  if (Number.isFinite(dayNum) && dayNum > 0) {
    return (dayNum + (Number.isFinite(angleNum) ? angleNum : 0)) % 5;
  }
  return (Number.isFinite(angleNum) ? angleNum : 0) % 5;
}

function normalizeUtcDate(dateStr, fallbackDate) {
  const raw = String(dateStr || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallbackDate;
}

function resolveScheduleFields(runDateUtc, nowIso = new Date().toISOString()) {
  const todayUtc = nowIso.slice(0, 10);
  const targetDate = normalizeUtcDate(runDateUtc, todayUtc);
  const isDue = targetDate <= todayUtc;

  return {
    run_date_utc: targetDate,
    status: isDue ? "queued" : "scheduled_future",
    queued_at_utc: isDue ? nowIso : null,
    publish_after_utc: `${targetDate}T00:00:00.000Z`,
    prepared_at_utc: nowIso
  };
}

function promoteDueScheduledItems(items, nowIso = new Date().toISOString()) {
  const todayUtc = nowIso.slice(0, 10);
  return items.map((item) => {
    if (!item || item.published === true) return item;
    const itemRunDate = normalizeUtcDate(item.run_date_utc, todayUtc);
    const isDue = itemRunDate <= todayUtc;
    if (isDue && (item.status === "scheduled_future" || !item.queued_at_utc)) {
      return {
        ...item,
        status: "queued",
        queued_at_utc: nowIso,
        publish_after_utc: item.publish_after_utc || `${itemRunDate}T00:00:00.000Z`
      };
    }
    return item;
  });
}

/* ===========================
   PURE NODE.JS 1200x600 PNG RENDERER (ZERO EXTERNAL DEPENDENCIES)
   =========================== */
const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeStr, dataBuf) {
  const typeBuf = Buffer.from(typeStr, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcInput = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function parseHexRgba(hex, alpha = 255) {
  const clean = String(hex || "#0F172A").replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
    Math.max(0, Math.min(255, alpha))
  ];
}

// 5x7 crisp glyph bitmap table
const GLYPHS_5X7 = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "\"": ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00100", "01000", "10110", "10011", "00000"],
  "&": ["01100", "10010", "01100", "10101", "10010", "01101", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "01100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00010", "00100", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  "D": ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "00100", "00010", "00001", "00000", "00000"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "`": ["01000", "00100", "00010", "00000", "00000", "00000", "00000"],
  "a": ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  "b": ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  "c": ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  "d": ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  "e": ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  "f": ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  "g": ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  "h": ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  "i": ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  "j": ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  "k": ["10000", "10000", "10010", "10100", "11100", "10010", "10001"],
  "l": ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  "m": ["00000", "00000", "11010", "10101", "10101", "10001", "10001"],
  "n": ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  "o": ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  "p": ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  "q": ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  "r": ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  "s": ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  "t": ["01000", "01000", "11110", "01000", "01000", "01001", "00110"],
  "u": ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  "v": ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  "w": ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  "x": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  "y": ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  "z": ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"]
};

function sanitizeAsciiText(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[•·]/g, "|")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ");
}

function createPixelCanvas(width, height) {
  const buf = Buffer.alloc(width * height * 4, 0);

  function setPixel(x, y, rgba) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
    const idx = (iy * width + ix) * 4;
    const [sr, sg, sb, sa] = rgba;
    if (sa >= 255) {
      buf[idx] = sr;
      buf[idx + 1] = sg;
      buf[idx + 2] = sb;
      buf[idx + 3] = 255;
      return;
    }
    const alpha = sa / 255;
    const inv = 1 - alpha;
    buf[idx] = Math.round(sr * alpha + buf[idx] * inv);
    buf[idx + 1] = Math.round(sg * alpha + buf[idx + 1] * inv);
    buf[idx + 2] = Math.round(sb * alpha + buf[idx + 2] * inv);
    buf[idx + 3] = Math.max(buf[idx + 3], Math.round(alpha * 255 + buf[idx + 3] * inv));
  }

  function fillGradientRect(x, y, w, h, topHex, bottomHex) {
    const c1 = parseHexRgba(topHex, 255);
    const c2 = parseHexRgba(bottomHex, 255);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      const t = h > 1 ? Math.max(0, Math.min(1, (py - y) / (h - 1))) : 0;
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      for (let px = x0; px < x1; px++) {
        const idx = (py * width + px) * 4;
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = 255;
      }
    }
  }

  function fillRect(x, y, w, h, hex, alpha = 255) {
    const rgba = parseHexRgba(hex, alpha);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        setPixel(px, py, rgba);
      }
    }
  }

  function fillRoundRect(x, y, w, h, radius, hex, alpha = 255) {
    const r = Math.max(0, Math.min(radius, Math.floor(w / 2), Math.floor(h / 2)));
    if (r === 0) {
      fillRect(x, y, w, h, hex, alpha);
      return;
    }
    const rgba = parseHexRgba(hex, alpha);
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    const r2 = r * r;
    const leftEdge = x + r;
    const rightEdge = x + w - r;
    const topEdge = y + r;
    const bottomEdge = y + h - r;

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        let dx = 0;
        let dy = 0;
        if (px < leftEdge) dx = leftEdge - px - 0.5;
        else if (px > rightEdge) dx = px - rightEdge - 0.5;
        if (py < topEdge) dy = topEdge - py - 0.5;
        else if (py > bottomEdge) dy = py - bottomEdge - 0.5;
        if (dx * dx + dy * dy <= r2) {
          setPixel(px, py, rgba);
        }
      }
    }
  }

  function strokeRoundRect(x, y, w, h, radius, strokeW, hex, alpha = 255) {
    const t = Math.max(1, strokeW);
    fillRoundRect(x, y, w, t, Math.min(radius, t), hex, alpha);
    fillRoundRect(x, y + h - t, w, t, Math.min(radius, t), hex, alpha);
    fillRoundRect(x, y, t, h, Math.min(radius, t), hex, alpha);
    fillRoundRect(x + w - t, y, t, h, Math.min(radius, t), hex, alpha);
  }

  function fillCircle(cx, cy, radius, hex, alpha = 255) {
    const rgba = parseHexRgba(hex, alpha);
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(width, Math.ceil(cx + radius));
    const y1 = Math.min(height, Math.ceil(cy + radius));
    const r2 = radius * radius;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          setPixel(px, py, rgba);
        }
      }
    }
  }

  function measureText(text, scale = 2, letterSpacing = 1) {
    const clean = sanitizeAsciiText(text);
    if (!clean.length) return 0;
    const charStep = (5 + letterSpacing) * scale;
    return clean.length * charStep - letterSpacing * scale;
  }

  function drawText(text, x, y, options = {}) {
    const scale = Math.max(1, Math.round(options.scale || 2));
    const spacing = options.letterSpacing ?? 1;
    const hex = options.color || "#FFFFFF";
    const alpha = options.alpha ?? 255;
    const align = options.align || "left";
    const maxWidth = options.maxWidth || 0;
    const rgba = parseHexRgba(hex, alpha);

    let str = sanitizeAsciiText(text);
    if (maxWidth > 0 && measureText(str, scale, spacing) > maxWidth) {
      while (str.length > 1 && measureText(`${str}...`, scale, spacing) > maxWidth) {
        str = str.slice(0, -1).trimEnd();
      }
      str = `${str}...`;
    }

    const totalW = measureText(str, scale, spacing);
    let cursorX = x;
    if (align === "center") cursorX = x - totalW / 2;
    else if (align === "right") cursorX = x - totalW;

    const charStep = (5 + spacing) * scale;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const glyph = GLYPHS_5X7[ch] || GLYPHS_5X7[ch.toUpperCase()] || GLYPHS_5X7[" "];
      const gx0 = cursorX + i * charStep;
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if (bits[col] === "1") {
            const px0 = gx0 + col * scale;
            const py0 = y + row * scale;
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                setPixel(px0 + sx, py0 + sy, rgba);
              }
            }
          }
        }
      }
    }
  }

  function encodePngBuffer() {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 4;
    const rawScanlines = Buffer.alloc((stride + 1) * height);
    for (let row = 0; row < height; row++) {
      const lineStart = row * (stride + 1);
      rawScanlines[lineStart] = 0; // filter type 0
      buf.copy(rawScanlines, lineStart + 1, row * stride, (row + 1) * stride);
    }

    const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
    return Buffer.concat([
      signature,
      makePngChunk("IHDR", ihdr),
      makePngChunk("IDAT", compressed),
      makePngChunk("IEND", Buffer.alloc(0))
    ]);
  }

  return {
    fillGradientRect,
    fillRect,
    fillRoundRect,
    strokeRoundRect,
    fillCircle,
    measureText,
    drawText,
    encodePngBuffer
  };
}

function drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor = "#2563EB" }) {
  c.fillGradientRect(0, 0, CARD_WIDTH, CARD_HEIGHT, "#0F172A", "#172554");
  c.fillRect(0, 0, CARD_WIDTH, 7, accentColor);

  c.fillRoundRect(56, 26, 268, 28, 4, accentColor);
  c.drawText("DIPLOMAN FOOTBALL STATS", 190, 36, {
    color: "#FFFFFF",
    scale: 2,
    align: "center"
  });

  c.fillRoundRect(338, 26, 270, 28, 4, "#1E293B");
  c.strokeRoundRect(338, 26, 270, 28, 4, 1, "#3B82F6");
  c.drawText(`${leagueName.toUpperCase()} (${leagueCode})`, 473, 36, {
    color: "#93C5FD",
    scale: 2,
    maxWidth: 254,
    align: "center"
  });

  c.drawText(`${dateStr} UTC`, 1144, 36, {
    color: "#94A3B8",
    scale: 2,
    align: "right"
  });

  c.drawText(focusTag.toUpperCase(), 56, 72, {
    color: "#60A5FA",
    scale: 2,
    maxWidth: 1088
  });

  c.drawText(headline, 56, 98, {
    color: "#FFFFFF",
    scale: 3,
    maxWidth: 1088
  });
}

function drawCardFooterPng(c) {
  c.fillRect(56, 548, 1088, 2, "#1E293B");
  c.drawText("PROPRIETARY TWO-HALF TELEMETRY  |  WWW.DIPLOMANTIMES.COM", 56, 566, {
    color: "#64748B",
    scale: 2,
    maxWidth: 1088
  });
}

function generateFootballTelemetryCardPng({
  dateStr,
  angleId,
  leagueName,
  leagueCode,
  focusTag,
  headline,
  rows,
  otherLeagues = []
}) {
  const c = createPixelCanvas(CARD_WIDTH, CARD_HEIGHT);
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, 5);
  const variant = pickCardVariantIndex(dateStr, angleId);

  if (variant === 0) {
    drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor: "#2563EB" });

    c.fillRect(56, 144, 14, 14, "#2563EB");
    c.drawText("DFT (Two-Half Pts)", 78, 146, { color: "#CBD5E1", scale: 2 });

    c.fillRect(285, 144, 14, 14, "#10B981");
    c.drawText("STD (Full-Time Pts)", 307, 146, { color: "#CBD5E1", scale: 2 });

    c.drawText("WP = STD MINUS DFT", 1144, 146, { color: "#94A3B8", scale: 2, align: "right" });

    const maxPts = Math.max(
      20,
      ...safeRows.map((r) => Math.max(Number(r.dft_pts || 0), Number(r.std_pts || 0)))
    );
    const barMaxWidth = 490;

    safeRows.forEach((r, i) => {
      const y = 172 + i * 72;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);
      const dftW = Math.max(12, Math.round((dft / maxPts) * barMaxWidth));
      const stdW = Math.max(12, Math.round((std / maxPts) * barMaxWidth));
      const rank = String(i + 1).padStart(2, "0");

      c.fillRoundRect(56, y, 1088, 60, 6, "#1E293B");
      c.strokeRoundRect(56, y, 1088, 60, 6, 1, "#334155");
      c.drawText(rank, 76, y + 22, { color: "#60A5FA", scale: 2 });
      c.drawText(r.club, 114, y + 20, { color: "#F8FAFC", scale: 3, maxWidth: 215 });

      c.fillRoundRect(342, y + 10, dftW, 15, 3, "#2563EB");
      c.drawText(`${dft} DFT`, 352 + dftW, y + 12, { color: "#93C5FD", scale: 2 });

      c.fillRoundRect(342, y + 34, stdW, 15, 3, "#10B981");
      c.drawText(`${std} STD`, 352 + stdW, y + 36, { color: "#6EE7B7", scale: 2 });

      c.fillRoundRect(1022, y + 13, 106, 34, 5, "#0F172A");
      c.strokeRoundRect(1022, y + 13, 106, 34, 5, 1, "#3B82F6");
      c.drawText(`${wp} WP`, 1075, y + 24, { color: "#F8FAFC", scale: 2, align: "center" });
    });

    drawCardFooterPng(c);
  } else if (variant === 1) {
    drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor: "#0EA5E9" });

    safeRows.slice(0, 4).forEach((r, i) => {
      const y = 148 + i * 96;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);

      c.fillRoundRect(56, y, 650, 84, 8, "#1E293B");
      c.strokeRoundRect(56, y, 650, 84, 8, 1, "#334155");
      c.fillCircle(94, y + 42, 18, "#2563EB");
      c.drawText(String(i + 1), 94, y + 36, { color: "#FFFFFF", scale: 2, align: "center" });
      c.drawText(r.club, 128, y + 18, { color: "#F8FAFC", scale: 3, maxWidth: 440 });
      c.drawText(`Two-Half: ${dft} pts | Full-Time: ${std} pts`, 128, y + 52, {
        color: "#94A3B8",
        scale: 2,
        maxWidth: 440
      });

      c.fillRoundRect(584, y + 24, 106, 36, 5, "#0F172A");
      c.strokeRoundRect(584, y + 24, 106, 36, 5, 1, "#60A5FA");
      c.drawText(`${wp} WP`, 637, y + 36, { color: "#93C5FD", scale: 2, align: "center" });
    });

    const topClub = safeRows[0] || { club: leagueName, dft_pts: 0, std_pts: 0, weak_points: 0 };
    c.fillRoundRect(726, 148, 418, 372, 8, "#1E293B");
    c.strokeRoundRect(726, 148, 418, 372, 8, 1, "#334155");
    c.drawText("BENCHMARK SNAPSHOT", 746, 170, { color: "#60A5FA", scale: 2 });
    c.drawText(`${topClub.club} (${Number(topClub.dft_pts || 0)} DFT)`, 746, 198, {
      color: "#FFFFFF",
      scale: 2,
      maxWidth: 380
    });

    safeRows.slice(0, 3).forEach((r, idx) => {
      const ny = 242 + idx * 84;
      const wp = formatDelta(r.weak_points ?? Number(r.std_pts || 0) - Number(r.dft_pts || 0));
      c.fillRoundRect(746, ny, 378, 70, 6, "#0F172A");
      c.strokeRoundRect(746, ny, 378, 70, 6, 1, "#1E293B");
      c.drawText(r.club, 762, ny + 14, { color: "#F8FAFC", scale: 2, maxWidth: 346 });
      c.drawText(`DFT ${Number(r.dft_pts || 0)} | STD ${Number(r.std_pts || 0)} | WP ${wp}`, 762, ny + 40, {
        color: "#6EE7B7",
        scale: 2,
        maxWidth: 346
      });
    });

    drawCardFooterPng(c);
  } else if (variant === 2) {
    drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor: "#10B981" });

    safeRows.forEach((r, i) => {
      const y = 148 + i * 76;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wpNum = Number(r.weak_points ?? std - dft);
      const wpText = formatDelta(wpNum);
      const badgeColor = wpNum > 0 ? "#10B981" : wpNum < 0 ? "#F59E0B" : "#60A5FA";

      c.fillRoundRect(56, y, 1088, 64, 6, "#1E293B");
      c.strokeRoundRect(56, y, 1088, 64, 6, 1, "#334155");
      c.fillRoundRect(72, y + 14, 42, 36, 4, "#0F172A");
      c.drawText(`#${i + 1}`, 93, y + 26, { color: "#93C5FD", scale: 2, align: "center" });
      c.drawText(r.club, 128, y + 20, { color: "#F8FAFC", scale: 3, maxWidth: 420 });
      c.drawText(`DFT: ${dft} pts`, 565, y + 26, { color: "#93C5FD", scale: 2 });
      c.drawText(`STD: ${std} pts`, 740, y + 26, { color: "#6EE7B7", scale: 2 });

      c.fillRoundRect(974, y + 13, 154, 38, 5, "#0F172A");
      c.strokeRoundRect(974, y + 13, 154, 38, 5, 2, badgeColor);
      c.drawText(`WP ${wpText}`, 1051, y + 26, { color: badgeColor, scale: 2, align: "center" });
    });

    drawCardFooterPng(c);
  } else if (variant === 3) {
    drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor: "#3B82F6" });

    safeRows.slice(0, 4).forEach((r, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 56 + col * 556;
      const y = 148 + row * 110;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);

      c.fillRoundRect(x, y, 532, 98, 8, "#1E293B");
      c.strokeRoundRect(x, y, 532, 98, 8, 1, "#334155");
      c.drawText(`RANK 0${i + 1}`, x + 18, y + 14, { color: "#60A5FA", scale: 2 });
      c.drawText(r.club, x + 18, y + 36, { color: "#F8FAFC", scale: 3, maxWidth: 380 });
      c.drawText(`Two-Half: ${dft} | Standard: ${std}`, x + 18, y + 70, {
        color: "#CBD5E1",
        scale: 2,
        maxWidth: 380
      });

      c.fillRoundRect(x + 412, y + 30, 102, 38, 5, "#0F172A");
      c.strokeRoundRect(x + 412, y + 30, 102, 38, 5, 1, "#3B82F6");
      c.drawText(`${wp} WP`, x + 463, y + 43, { color: "#FFFFFF", scale: 2, align: "center" });
    });

    const leagueStripText = (Array.isArray(otherLeagues) ? otherLeagues : [])
      .slice(0, 4)
      .map((l) => `${l.code || l.name}: ${l.dft_leader} (${l.dft_leader_pts} DFT)`)
      .join(" | ");

    c.fillRoundRect(56, 382, 1088, 146, 8, "#1E293B");
    c.strokeRoundRect(56, 382, 1088, 146, 8, 1, "#334155");
    c.drawText("MULTI-LEAGUE DFT LEADERS", 78, 404, { color: "#60A5FA", scale: 2 });
    c.drawText(leagueStripText || `${leagueName} (${leagueCode}) Two-Half Telemetry Active`, 78, 440, {
      color: "#F8FAFC",
      scale: 2,
      maxWidth: 1044
    });
    c.drawText("Tracked across two-half points (DFT), full-time points (STD), and Weak Points (WP).", 78, 480, {
      color: "#94A3B8",
      scale: 2,
      maxWidth: 1044
    });

    drawCardFooterPng(c);
  } else {
    drawCardHeaderPng(c, { dateStr, leagueName, leagueCode, focusTag, headline, accentColor: "#2563EB" });

    safeRows.slice(0, 3).forEach((r, i) => {
      const bx = 56 + i * 372;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);

      c.fillRoundRect(bx, 148, 344, 178, 8, "#1E293B");
      c.strokeRoundRect(bx, 148, 344, 178, 8, i === 0 ? 2 : 1, i === 0 ? "#60A5FA" : "#334155");
      c.drawText(`NO. 0${i + 1} IN ${leagueCode}`, bx + 18, 168, { color: "#93C5FD", scale: 2 });
      c.drawText(r.club, bx + 18, 194, { color: "#FFFFFF", scale: 3, maxWidth: 308 });
      c.drawText(`${dft} DFT`, bx + 18, 236, { color: "#60A5FA", scale: 3 });
      c.drawText(`${std} STD`, bx + 180, 240, { color: "#6EE7B7", scale: 2 });
      c.drawText(`WP Differential: ${wp}`, bx + 18, 286, { color: "#94A3B8", scale: 2, maxWidth: 308 });
    });

    safeRows.slice(3, 5).forEach((r, idx) => {
      const ly = 348 + idx * 86;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);

      c.fillRoundRect(56, ly, 1088, 72, 6, "#1E293B");
      c.strokeRoundRect(56, ly, 1088, 72, 6, 1, "#334155");
      c.drawText(`0${idx + 4}  ${r.club}`, 76, ly + 24, { color: "#F8FAFC", scale: 3, maxWidth: 460 });
      c.drawText(`${dft} DFT  /  ${std} STD`, 560, ly + 29, { color: "#93C5FD", scale: 2 });
      c.drawText(`${wp} WP`, 1124, ly + 29, { color: "#6EE7B7", scale: 2, align: "right" });
    });

    drawCardFooterPng(c);
  }

  return c.encodePngBuffer();
}

function buildFootballDraft(selection, metrics, dateStr, repoRoot) {
  const angleId = String(selection.selected_angle_id || "01").padStart(2, "0");
  const topEntity = metrics.top_primary_entity || "Brighton Hove";
  const topScore = metrics.top_primary_score ?? 0;

  const leagueName = metrics.active_league_name || "Premier League";
  const leagueCode = metrics.active_league_code || "PL";
  const standings = metrics.active_league_standings || {};
  const dftTop3 = Array.isArray(standings.dft_top3) ? standings.dft_top3 : [];
  const dftBottom3 = Array.isArray(standings.dft_bottom3) ? standings.dft_bottom3 : [];
  const stdTop3 = Array.isArray(standings.std_top3) ? standings.std_top3 : [];
  const stdBottom3 = Array.isArray(standings.std_bottom3) ? standings.std_bottom3 : [];
  const wpTop3 = Array.isArray(standings.weak_points_top3) ? standings.weak_points_top3 : [];
  const wpBottom3 = Array.isArray(standings.weak_points_bottom3) ? standings.weak_points_bottom3 : [];

  const leaderObj = dftTop3[0] || { club: topEntity, dft_pts: topScore, std_pts: topScore, weak_points: 0 };
  const runnerUp = dftTop3[1] || { club: "nearest rival", dft_pts: topScore, std_pts: topScore, weak_points: 0 };
  const thirdClub = dftTop3[2] || runnerUp;
  const tailClub = dftBottom3[0] || { club: "the bottom club", dft_pts: 0, std_pts: 0, weak_points: 0 };
  const secondTailClub = dftBottom3[1] || tailClub;
  const stdLeader = stdTop3[0] || { club: topEntity, std_pts: topScore, dft_pts: topScore, weak_points: 0 };
  const stdRunnerUp = stdTop3[1] || null;

  const topWpClub =
    wpTop3[0] ||
    (metrics.top_weak_points_club
      ? { club: metrics.top_weak_points_club, weak_points: Number(metrics.maxWeakPoints ?? 0), std_pts: 0, dft_pts: 0 }
      : stdLeader);
  const lowestWpClub =
    wpBottom3[0] ||
    (metrics.lowest_weak_points_club
      ? { club: metrics.lowest_weak_points_club, weak_points: Number(metrics.minWeakPoints ?? 0), std_pts: 0, dft_pts: 0 }
      : leaderObj);

  const otherLeagues = (Array.isArray(metrics.leagues) ? metrics.leagues : []).filter(
    (l) => l.code !== leagueCode
  );
  const secondLeague = otherLeagues[0] || null;
  const gapTop2 = Math.max(0, Number(topScore) - Number(runnerUp.dft_pts ?? topScore));
  const gapTop3 = Math.max(0, Number(topScore) - Number(thirdClub.dft_pts ?? topScore));

  let title;
  let summary;
  let leadNarrative;
  let focusTag = "Two-Half Standings & Table Leaders";
  let chartRows = dftTop3.concat(dftBottom3.slice(0, 2));

  switch (angleId) {
    case "01": {
      focusTag = "Single-Day Breakout & Summit Surge";
      title = `${topEntity} Surges to ${topScore} Pts in ${leagueName} DFT Standings Ahead of ${runnerUp.club}`;
      summary = `${topEntity} sets the ${leagueName} two-half pace on ${topScore} points ahead of ${runnerUp.club} (${runnerUp.dft_pts} points).`;
      leadNarrative = `${topEntity} surges to the summit of the ${leagueName} (${leagueCode}) two-half standings with ${topScore} DFT points as of ${dateStr}, holding a ${gapTop2}-point edge over ${runnerUp.club} (${runnerUp.dft_pts} points). Meanwhile, ${stdLeader.club} leads the standard full-time table on ${stdLeader.std_pts} points.`;
      break;
    }
    case "02": {
      focusTag = "Baseline Deficit & Lower-Tier Regression";
      title = `${tailClub.club} Falls Behind Two-Half Pace in ${leagueName} on ${tailClub.dft_pts} DFT Points`;
      summary = `${tailClub.club} trails the ${leagueName} two-half table on ${tailClub.dft_pts} points as ${topEntity} leads on ${topScore} points.`;
      leadNarrative = `${tailClub.club} sits at the bottom of the ${leagueName} (${leagueCode}) two-half standings on ${tailClub.dft_pts} points as of ${dateStr}, trailing frontrunner ${topEntity} (${topScore} points) by ${Math.max(0, Number(topScore) - Number(tailClub.dft_pts ?? 0))} points. Across the wider split, ${stdLeader.club} paces the standard full-time table with ${stdLeader.std_pts} points.`;
      chartRows = dftBottom3.concat(dftTop3.slice(0, 2));
      break;
    }
    case "03": {
      focusTag = "Two-Half Stagnation & Deadlock Watch";
      title = `${tailClub.club} and ${secondTailClub.club} Stall in ${leagueName} Two-Half Table as ${topEntity} Holds ${topScore} Pts`;
      summary = `${tailClub.club} (${tailClub.dft_pts} pts) and ${secondTailClub.club} (${secondTailClub.dft_pts} pts) remain mired near the foot of the ${leagueName} DFT standings.`;
      leadNarrative = `Two-half point accumulation remains stalled at the foot of the ${leagueName} (${leagueCode}) table on ${dateStr}, with ${tailClub.club} (${tailClub.dft_pts} pts) and ${secondTailClub.club} (${secondTailClub.dft_pts} pts) unable to close the gap. At the top, ${topEntity} continues to pace the division on ${topScore} DFT points.`;
      chartRows = dftBottom3.concat(dftTop3.slice(0, 2));
      break;
    }
    case "04": {
      focusTag = "Pace Normalization & Half-Split Reversion";
      title = `${runnerUp.club} (${runnerUp.dft_pts} Pts) Tracks ${topEntity} (${topScore} Pts) as ${leagueName} Two-Half Pace Settles`;
      summary = `${runnerUp.club} sits on ${runnerUp.dft_pts} two-half points behind ${topEntity} (${topScore} points) in the ${leagueName} standings.`;
      leadNarrative = `Following recent matchday swings in the ${leagueName} (${leagueCode}), ${runnerUp.club} holds second place on ${runnerUp.dft_pts} DFT points as of ${dateStr}, trailing leader ${topEntity} (${topScore} points) by ${gapTop2} points. Standard full-time standings remain anchored by ${stdLeader.club} on ${stdLeader.std_pts} points.`;
      break;
    }
    case "05": {
      focusTag = "Cumulative Two-Half Consistency";
      title = `Quiet Two-Half Consistency Lifts ${thirdClub.club} (${thirdClub.dft_pts} Pts) Into ${leagueName} DFT Top Three`;
      summary = `${thirdClub.club} holds a ${leagueName} two-half podium spot on ${thirdClub.dft_pts} points alongside ${topEntity} and ${runnerUp.club}.`;
      leadNarrative = `Steady half-by-half accumulation keeps ${thirdClub.club} inside the ${leagueName} (${leagueCode}) two-half top three on ${thirdClub.dft_pts} points as of ${dateStr}, behind ${topEntity} (${topScore} pts) and ${runnerUp.club} (${runnerUp.dft_pts} pts). Across full-time results, ${stdLeader.club} leads on ${stdLeader.std_pts} STD points.`;
      break;
    }
    case "06": {
      focusTag = "Primary vs. Secondary Table Tension";
      title = `${topEntity} Ranks Top of ${leagueName} DFT (${topScore} Pts) Despite ${stdLeader.club}'s Full-Time Lead`;
      summary = `${topEntity} leads ${leagueName} two-half scoring on ${topScore} points while ${stdLeader.club} commands the standard full-time table (${stdLeader.std_pts} pts).`;
      leadNarrative = `${topEntity} claims first place in the ${leagueName} (${leagueCode}) two-half standings with ${topScore} DFT points on ${dateStr}, even as ${stdLeader.club} holds the conventional full-time lead on ${stdLeader.std_pts} points. The split underscores how two-half dominance differs from single-half or late-goal full-time wins.`;
      chartRows = dftTop3.slice(0, 3).concat(stdTop3.slice(0, 2));
      break;
    }
    case "07": {
      focusTag = "Inverse Divergence & Weak Points Gap";
      const wpVal = formatDelta(topWpClub.weak_points ?? 0);
      title = `Why ${topWpClub.club} Carries ${wpVal} Weak Points Gap in ${leagueName} Standings Split`;
      summary = `${topWpClub.club} posts a ${wpVal} Weak Points gap (${topWpClub.std_pts} STD vs. ${topWpClub.dft_pts} DFT) across ${leagueName} fixtures.`;
      leadNarrative = `A ${wpVal} Weak Points differential separates ${topWpClub.club}'s full-time total (${topWpClub.std_pts} STD pts) from its two-half tally (${topWpClub.dft_pts} DFT pts) in the ${leagueName} (${leagueCode}) as of ${dateStr}. Meanwhile, ${topEntity} tops the pure two-half table on ${topScore} points.`;
      chartRows = wpTop3.length ? wpTop3.concat(dftTop3.slice(0, 2)) : dftTop3;
      break;
    }
    case "08": {
      focusTag = "Half-Control Conversion Gap";
      const wpVal = formatDelta(topWpClub.weak_points ?? 0);
      title = `Single-Half Wins Separate ${stdLeader.club} (${stdLeader.std_pts} STD) From ${topEntity} (${topScore} DFT) in ${leagueName}`;
      summary = `${stdLeader.club} leads ${leagueName} full-time points (${stdLeader.std_pts}) while ${topEntity} sets the two-half standard (${topScore} DFT).`;
      leadNarrative = `Conversion between individual halves and full-time match outcomes divides the ${leagueName} (${leagueCode}) table on ${dateStr}: ${stdLeader.club} tops the standard table on ${stdLeader.std_pts} points while ${topEntity} leads two-half points on ${topScore}, with ${topWpClub.club} logging the widest Weak Points cushion at ${wpVal} WP.`;
      break;
    }
    case "09": {
      focusTag = "Two-Half Discipline & Containment";
      const lowWpVal = formatDelta(lowestWpClub.weak_points ?? 0);
      title = `Two-Half Discipline Powers ${topEntity} (${topScore} DFT Pts) at Summit of ${leagueName}`;
      summary = `${topEntity} leads ${leagueName} two-half control on ${topScore} points, while ${lowestWpClub.club} posts the tightest Weak Points margin (${lowWpVal} WP).`;
      leadNarrative = `Sustained two-half discipline keeps ${topEntity} atop the ${leagueName} (${leagueCode}) DFT standings with ${topScore} points as of ${dateStr}. On the Weak Points index, ${lowestWpClub.club} registers the lowest differential at ${lowWpVal} WP, reflecting tight alignment between half control and final results.`;
      break;
    }
    case "10": {
      focusTag = "Dual-Table Benchmark";
      title = `${topEntity} (${topScore} DFT) and ${stdLeader.club} (${stdLeader.std_pts} STD) Anchor ${leagueName} Pace`;
      summary = `${topEntity} leads ${leagueName} two-half points (${topScore}) alongside full-time table leader ${stdLeader.club} (${stdLeader.std_pts} pts).`;
      leadNarrative = `Top-tier performance across the ${leagueName} (${leagueCode}) on ${dateStr} centers on ${topEntity} in the two-half standings (${topScore} DFT pts) and ${stdLeader.club} in the conventional table (${stdLeader.std_pts} STD pts), setting the benchmark ahead of ${runnerUp.club} (${runnerUp.dft_pts} DFT pts).`;
      break;
    }
    case "11": {
      focusTag = "Cross-League European Sweep";
      title = secondLeague
        ? `${leagueName} (${topEntity}) and ${secondLeague.name} (${secondLeague.dft_leader}) Lead European DFT Standings`
        : `Two-Half Sweeps Reshape ${leagueName} DFT Table Behind ${topEntity} (${topScore} Pts)`;
      summary = `${topEntity} (${topScore} pts) paces ${leagueName} two-half standings alongside fellow European league leaders on ${dateStr}.`;
      leadNarrative = secondLeague
        ? `Across Europe's tracked top-flight divisions on ${dateStr}, ${topEntity} sets the ${leagueName} (${leagueCode}) two-half pace on ${topScore} DFT points while ${secondLeague.dft_leader} leads ${secondLeague.name} on ${secondLeague.dft_leader_pts} DFT points.`
        : `Two-half sweeps shape the ${leagueName} (${leagueCode}) standings on ${dateStr}, with ${topEntity} leading on ${topScore} DFT points ahead of ${runnerUp.club} (${runnerUp.dft_pts} pts).`;
      break;
    }
    case "12": {
      focusTag = "Top-Four Matchday Swing";
      title = `Top-Three Standings Swing Between ${topEntity}, ${runnerUp.club}, and ${thirdClub.club} in ${leagueName}`;
      summary = `${topEntity} (${topScore} pts), ${runnerUp.club} (${runnerUp.dft_pts} pts), and ${thirdClub.club} (${thirdClub.dft_pts} pts) headline ${leagueName} DFT race.`;
      leadNarrative = `Key standings swings in the ${leagueName} (${leagueCode}) leave ${topEntity} (${topScore} pts), ${runnerUp.club} (${runnerUp.dft_pts} pts), and ${thirdClub.club} (${thirdClub.dft_pts} pts) separated by ${gapTop3} points at the top of the two-half table as of ${dateStr}.`;
      break;
    }
    case "13": {
      focusTag = "Top-Tier Margin Compression";
      title = `${gapTop3}-Point Gap Separates Top Three in ${leagueName} DFT Standings Behind ${topEntity}`;
      summary = `Only ${gapTop3} points separate ${topEntity} (${topScore} pts), ${runnerUp.club} (${runnerUp.dft_pts} pts), and ${thirdClub.club} (${thirdClub.dft_pts} pts).`;
      leadNarrative = `A tight ${gapTop3}-point margin compresses the top three of the ${leagueName} (${leagueCode}) two-half standings on ${dateStr}, with ${topEntity} on ${topScore} points, ${runnerUp.club} on ${runnerUp.dft_pts}, and ${thirdClub.club} on ${thirdClub.dft_pts}.`;
      break;
    }
    case "14": {
      focusTag = "Bottom-Tier Drag Watch";
      title = `${tailClub.club} and ${secondTailClub.club} Anchor Bottom of ${leagueName} DFT Table on ${tailClub.dft_pts} Pts`;
      summary = `${tailClub.club} (${tailClub.dft_pts} pts) and ${secondTailClub.club} (${secondTailClub.dft_pts} pts) sit at the foot of the ${leagueName} two-half table.`;
      leadNarrative = `Persistent two-half deficits keep ${tailClub.club} (${tailClub.dft_pts} pts) and ${secondTailClub.club} (${secondTailClub.dft_pts} pts) anchored at the bottom of the ${leagueName} (${leagueCode}) DFT standings as of ${dateStr}, while ${topEntity} sets the pace on ${topScore} points.`;
      chartRows = dftBottom3.concat(dftTop3.slice(0, 2));
      break;
    }
    case "15": {
      focusTag = "Podium Tier Crossover";
      title = `${runnerUp.club} (${runnerUp.dft_pts} Pts) Pressures ${topEntity} (${topScore} Pts) in ${leagueName} DFT Top Tier`;
      summary = `${runnerUp.club} holds second in ${leagueName} two-half points (${runnerUp.dft_pts}), just ${gapTop2} points behind ${topEntity}.`;
      leadNarrative = `Strong two-half accumulation places ${runnerUp.club} on ${runnerUp.dft_pts} DFT points in the ${leagueName} (${leagueCode}) as of ${dateStr}, within ${gapTop2} points of frontrunner ${topEntity} (${topScore} points) and ahead of ${thirdClub.club} (${thirdClub.dft_pts} pts).`;
      break;
    }
    case "16": {
      focusTag = "Second-Half Depth & Resilience";
      title = `Two-Half Depth Keeps ${topEntity} (${topScore} Pts) Clear of ${leagueName} Chasing Pack`;
      summary = `${topEntity} maintains a ${gapTop2}-point two-half lead in ${leagueName} on ${topScore} points ahead of ${runnerUp.club}.`;
      leadNarrative = `Consistent execution across both halves keeps ${topEntity} clear at the top of the ${leagueName} (${leagueCode}) DFT standings with ${topScore} points on ${dateStr}, holding a ${gapTop2}-point buffer over ${runnerUp.club} (${runnerUp.dft_pts} points).`;
      break;
    }
    case "17": {
      focusTag = "Tactical Half-Split Shift";
      title = `Half-By-Half Efficiency Reshapes ${leagueName} Table Around ${topEntity} and ${stdLeader.club}`;
      summary = `${topEntity} (${topScore} DFT) and ${stdLeader.club} (${stdLeader.std_pts} STD) highlight tactical splits in ${leagueName}.`;
      leadNarrative = `Contrasting half-by-half profiles define the ${leagueName} (${leagueCode}) standings on ${dateStr}, where ${topEntity} leads two-half points on ${topScore} while ${stdLeader.club} tops full-time points on ${stdLeader.std_pts}.`;
      break;
    }
    case "18": {
      focusTag = "Structural Table Accountability";
      title = `Weak Points Audit Highlights ${topWpClub.club} (${formatDelta(topWpClub.weak_points)} WP) in ${leagueName}`;
      summary = `Weak Points tracking shows ${topWpClub.club} at ${formatDelta(topWpClub.weak_points)} WP in the ${leagueName} standings as of ${dateStr}.`;
      leadNarrative = `Auditing full-time points against two-half tallies in the ${leagueName} (${leagueCode}) on ${dateStr} spotlights ${topWpClub.club} at ${formatDelta(topWpClub.weak_points)} WP (${topWpClub.std_pts} STD vs. ${topWpClub.dft_pts} DFT), while ${topEntity} leads pure two-half scoring on ${topScore} points.`;
      chartRows = wpTop3.length ? wpTop3.concat(dftTop3.slice(0, 2)) : dftTop3;
      break;
    }
    case "19": {
      focusTag = "Two-Half Sweep Milestone";
      title = `${topEntity} Reaches ${topScore} DFT Points to Lead ${leagueName} Two-Half Standings`;
      summary = `${topEntity} hits ${topScore} two-half points to lead ${leagueName} ahead of ${runnerUp.club} (${runnerUp.dft_pts} pts).`;
      leadNarrative = `${topEntity} reaches ${topScore} DFT points in the ${leagueName} (${leagueCode}) two-half standings as of ${dateStr}, pacing the league ahead of ${runnerUp.club} (${runnerUp.dft_pts} points) and ${thirdClub.club} (${thirdClub.dft_pts} points).`;
      break;
    }
    case "20": {
      focusTag = "Late-Half Point Swing Watch";
      title = `Single-Half Volatility Separates ${stdLeader.club} and ${topEntity} in ${leagueName} Race`;
      summary = `Late-match and single-half swings keep ${stdLeader.club} (${stdLeader.std_pts} STD) ahead of ${topEntity} (${topScore} DFT) in ${leagueName}.`;
      leadNarrative = `Decisive single-half swings continue to separate ${leagueName} (${leagueCode}) contenders on ${dateStr}, leaving ${stdLeader.club} atop the standard table on ${stdLeader.std_pts} points while ${topEntity} leads two-half scoring on ${topScore} DFT points.`;
      break;
    }
    case "21": {
      focusTag = "Progressive Two-Half Trajectory";
      title = `${topEntity} Two-Half Trajectory Outpaces ${leagueName} Field at ${topScore} DFT Points`;
      summary = `${topEntity} sustains its ${leagueName} two-half trajectory on ${topScore} points ahead of ${runnerUp.club}.`;
      leadNarrative = `${topEntity}'s cumulative two-half trajectory outpaces the ${leagueName} (${leagueCode}) field at ${topScore} DFT points as of ${dateStr}, staying ${gapTop2} points clear of ${runnerUp.club} (${runnerUp.dft_pts} points).`;
      break;
    }
    case "22": {
      focusTag = "Midweek Standings Inflection";
      title = `Midweek Telemetry: ${topEntity} (${topScore} DFT) vs. ${stdLeader.club} (${stdLeader.std_pts} STD) in ${leagueName}`;
      summary = `Midweek standings check shows ${topEntity} leading ${leagueName} DFT (${topScore} pts) while ${stdLeader.club} leads STD (${stdLeader.std_pts} pts).`;
      leadNarrative = `Midweek standings telemetry across the ${leagueName} (${leagueCode}) on ${dateStr} places ${topEntity} first on two-half points (${topScore} DFT) ahead of ${runnerUp.club} (${runnerUp.dft_pts}), while ${stdLeader.club} anchors the full-time table on ${stdLeader.std_pts} STD points.`;
      break;
    }
    case "23": {
      focusTag = "Weekly Thursday Rollover Anchor";
      title = `Weekly Football Rollover: ${topEntity} (${topScore} DFT) and ${stdLeader.club} (${stdLeader.std_pts} STD) Lead ${leagueName}`;
      summary = `Weekly Thursday rollover confirms ${topEntity} atop ${leagueName} DFT (${topScore} pts) and ${stdLeader.club} atop STD (${stdLeader.std_pts} pts).`;
      leadNarrative = `Closing the weekly rollover window on ${dateStr}, ${topEntity} anchors the ${leagueName} (${leagueCode}) two-half standings on ${topScore} DFT points while ${stdLeader.club} leads the standard full-time table on ${stdLeader.std_pts} points.`;
      break;
    }
    case "24": {
      focusTag = "Summit Defense & Title Pace";
      title = `${topEntity} Defends ${leagueName} DFT Summit on ${topScore} Points Against ${runnerUp.club}`;
      summary = `${topEntity} defends first place in ${leagueName} two-half standings (${topScore} pts) ahead of ${runnerUp.club} (${runnerUp.dft_pts} pts).`;
      leadNarrative = `${topEntity} successfully defends top spot in the ${leagueName} (${leagueCode}) two-half standings on ${dateStr} with ${topScore} DFT points, keeping ${runnerUp.club} (${runnerUp.dft_pts} pts) and ${thirdClub.club} (${thirdClub.dft_pts} pts) in pursuit.`;
      break;
    }
    case "25":
    default: {
      focusTag = "Cumulative Two-Half Index";
      title = `Cumulative Two-Half Index: ${topEntity} Sets ${leagueName} Pace on ${topScore} DFT Points`;
      summary = `${topEntity} sets the cumulative ${leagueName} two-half pace on ${topScore} points ahead of ${runnerUp.club}.`;
      leadNarrative = `Cumulative two-half telemetry across the ${leagueName} (${leagueCode}) as of ${dateStr} shows ${topEntity} setting the pace on ${topScore} DFT points (${formatDelta(leaderObj.weak_points ?? 0)} WP), ahead of ${runnerUp.club} (${runnerUp.dft_pts} points).`;
      break;
    }
  }

  const dftPodiumText = dftTop3.length
    ? formatList(
        dftTop3,
        (c, idx) => `${idx + 1}. ${c.club} (${c.dft_pts} pts, ${formatDelta(c.weak_points ?? 0)} WP)`
      )
    : `${topEntity} (${topScore} pts)`;

  const p1 =
    `At the top of the ${leagueName} two-half standings, the leading trio sits at ${dftPodiumText}. ` +
    `${topEntity} holds a ${gapTop2}-point cushion over ${runnerUp.club}` +
    (thirdClub ? ` and leads third-placed ${thirdClub.club} by ${gapTop3} points.` : ".");

  const stdTopText = stdTop3.length
    ? formatList(stdTop3, (c) => `${c.club} (${c.std_pts} pts, ${formatDelta(c.weak_points ?? 0)} WP)`)
    : `${stdLeader.club} (${stdLeader.std_pts} pts)`;

  const wpTopText = wpTop3.length
    ? formatList(
        wpTop3,
        (c) => `${c.club} (${formatDelta(c.weak_points)} WP: ${c.std_pts} STD vs ${c.dft_pts} DFT)`
      )
    : "";

  const wpLowText =
    lowestWpClub && (!topWpClub || lowestWpClub.club !== topWpClub.club)
      ? ` while ${lowestWpClub.club} posts the lowest Weak Points tally at ${formatDelta(lowestWpClub.weak_points)} WP`
      : "";

  const p2 =
    `The standard full-time standings present a contrasting picture, led by ${stdTopText}. ` +
    (stdRunnerUp
      ? `${stdLeader.club} stays ${Math.max(0, Number(stdLeader.std_pts ?? 0) - Number(stdRunnerUp.std_pts ?? 0))} points clear of ${stdRunnerUp.club} in full-time points, `
      : "") +
    (wpTopText
      ? `and Weak Points (STD minus DFT) show the largest positive cushions on ${wpTopText}${wpLowText}, reflecting points collected from draws or single-half wins.`
      : `showing how clubs that close out full matches can hold higher standard totals even when half-by-half tallies distribute points differently.`);

  const tailText = dftBottom3.length
    ? formatList(dftBottom3, (c) => `${c.club} (${c.dft_pts} pts, ${formatDelta(c.weak_points ?? 0)} WP)`)
    : `${tailClub.club} (${tailClub.dft_pts} pts)`;

  const stdTailText = stdBottom3.length
    ? formatList(stdBottom3, (c) => `${c.club} (${c.std_pts} pts)`)
    : "";

  const p3 =
    `At the opposite end of the ${leagueName} two-half table, ${tailText} sit under sustained points pressure` +
    (stdTailText ? `, while ${stdTailText} occupy the lower full-time spots.` : ".");

  const crossLeagueText = otherLeagues.slice(0, 7).length
    ? formatList(
        otherLeagues.slice(0, 7),
        (l) => {
          const wpNote =
            l.top_weak_points_club && Number.isFinite(Number(l.top_weak_points))
              ? `; max WP: ${l.top_weak_points_club} ${formatDelta(l.top_weak_points)}`
              : "";
          return `${l.name} (${l.dft_leader} on ${l.dft_leader_pts} two-half pts; ${l.std_leader} on ${l.std_leader_pts} full-time pts${wpNote})`;
        }
      )
    : "";

  const p4 = crossLeagueText
    ? `Across other tracked top-flight competitions on ${dateStr}, table leaders include ${crossLeagueText}.`
    : `Match tallies across tracked domestic leagues continue to update alongside ${leagueName} as fixtures conclude.`;

  let imageSrc = FOOTBALL_FALLBACK_BANNER;
  try {
    const relCardPath = path.posix.join("assets", "cards", `ftb-${dateStr}.png`);
    const absCardPath = path.join(repoRoot || ".", "assets", "cards", `ftb-${dateStr}.png`);
    const pngBuffer = generateFootballTelemetryCardPng({
      dateStr,
      angleId,
      leagueName,
      leagueCode,
      focusTag,
      headline: title,
      rows: chartRows,
      otherLeagues
    });
    fs.mkdirSync(path.dirname(absCardPath), { recursive: true });
    fs.writeFileSync(absCardPath, pngBuffer);
    imageSrc = `${FOOTBALL_REPO_RAW_BASE}/${relCardPath}`;
  } catch (err) {
    console.warn(`Warning: Could not write Football telemetry PNG card: ${err.message}`);
  }

  return {
    title,
    summary,
    leadNarrative,
    storyBody: [p1, p2, p3, p4],
    labels: [
      "News Report",
      "Diploman Times",
      "Football Tally",
      leagueCode,
      `Angle ${angleId}`
    ],
    featuredImage: {
      src: imageSrc,
      alt: `${leagueName} Football Tally Telemetry — ${dateStr}`,
      target_url: DIPLOMAN_TIMES_URL
    }
  };
}

function buildJurisdictionDraft(vertical, selection, metrics, dateStr) {
  const isPolicing = vertical === "policingintel";
  const primaryKey = isPolicing ? "SPS" : "PSI";
  const secondaryKey = isPolicing ? "JTI" : "SIS";
  const metricLabel = isPolicing ? "Security Performance Score" : "Policy Signal Index";
  const secLabel = isPolicing ? "Jurisdiction Threat Index" : "State Instability Score";
  const verticalTag = isPolicing ? "Policing Intel" : "Governance Score";

  const angleId = String(selection.selected_angle_id || "01").padStart(2, "0");
  const topEntity = metrics.top_primary_entity || "Lagos";
  const topScore = metrics.top_primary_score ?? 0;
  const maxPos = formatDelta(metrics.maxPositiveDelta);
  const maxNeg = formatDelta(metrics.maxNegativeDelta);

  const leaders = metrics.leaders || {};
  const primaryTop3 = Array.isArray(leaders.primary_top3) ? leaders.primary_top3 : [];
  const secondaryTop = Array.isArray(
    isPolicing ? leaders.secondary_top_watch : leaders.secondary_top3
  )
    ? isPolicing
      ? leaders.secondary_top_watch
      : leaders.secondary_top3
    : [];

  const jurisdictions = Array.isArray(metrics.jurisdictions) ? metrics.jurisdictions : [];
  const trailing = jurisdictions.slice(-3).reverse();

  const sortedByPosDelta = jurisdictions
    .slice()
    .sort((a, b) => Number(b[`${primaryKey}_delta`] ?? 0) - Number(a[`${primaryKey}_delta`] ?? 0));
  const sortedByNegDelta = jurisdictions
    .slice()
    .sort((a, b) => Number(a[`${primaryKey}_delta`] ?? 0) - Number(b[`${primaryKey}_delta`] ?? 0));
  const sortedBySecondary = jurisdictions
    .slice()
    .sort((a, b) => Number(b[secondaryKey] ?? 0) - Number(a[secondaryKey] ?? 0));
  const sortedByLowestSecondary = jurisdictions
    .slice()
    .sort((a, b) => Number(a[secondaryKey] ?? 0) - Number(b[secondaryKey] ?? 0));

  const runnerUp = primaryTop3[1] || sortedByPosDelta[1] || { entity: "Abuja", score: topScore, delta: 0 };
  const thirdPlace = primaryTop3[2] || sortedByPosDelta[2] || runnerUp;
  const leadMover = sortedByPosDelta[0] || {
    entity: topEntity,
    [primaryKey]: topScore,
    [`${primaryKey}_delta`]: maxPos
  };
  const secondMover = sortedByPosDelta[1] || runnerUp;
  const dropper = sortedByNegDelta[0] || {
    entity: trailing[0] ? trailing[0].entity : topEntity,
    [primaryKey]: topScore,
    [`${primaryKey}_delta`]: maxNeg
  };
  const flatStates = jurisdictions.filter((j) => Number(j[`${primaryKey}_delta`] ?? 0) === 0);
  const secWatchLeader = secondaryTop[0] || sortedBySecondary[0] || {
    entity: topEntity,
    score: 0,
    [secondaryKey]: 0,
    delta: 0
  };
  const secWatchSecond = secondaryTop[1] || sortedBySecondary[1] || secWatchLeader;
  const lowSecEntity = sortedByLowestSecondary[0] || {
    entity: topEntity,
    [secondaryKey]: 0,
    [primaryKey]: topScore
  };
  const tailOne = trailing[0] || { entity: "Yobe", [primaryKey]: 0, [`${primaryKey}_delta`]: 0 };
  const tailTwo = trailing[1] || tailOne;
  const tailThree = trailing[2] || tailTwo;

  const zoneStats = {};
  for (const r of jurisdictions) {
    const z = r.zone || "NC";
    if (!zoneStats[z]) zoneStats[z] = { zone: z, sum: 0, count: 0, leader: r };
    zoneStats[z].sum += Number(r[primaryKey] ?? 0);
    zoneStats[z].count += 1;
    if (Number(r[primaryKey] ?? 0) > Number(zoneStats[z].leader[primaryKey] ?? -999)) {
      zoneStats[z].leader = r;
    }
  }
  const topZoneObj = Object.values(zoneStats).sort(
    (a, b) => b.sum / Math.max(1, b.count) - a.sum / Math.max(1, a.count)
  )[0] || { zone: "SW", sum: topScore, count: 1, leader: { entity: topEntity } };

  const moverDelta = formatDelta(leadMover[`${primaryKey}_delta`]);
  const moverScore = leadMover[primaryKey] ?? topScore;
  const dropDelta = formatDelta(dropper[`${primaryKey}_delta`]);
  const dropScore = dropper[primaryKey] ?? topScore;
  const secScore = secWatchLeader.score ?? secWatchLeader[secondaryKey] ?? 0;
  const lowSecScore = lowSecEntity[secondaryKey] ?? 0;

  const topScoreFmt = formatNum(topScore, 1);
  const runnerUpScoreFmt = formatNum(runnerUp.score ?? topScore, 1);
  const thirdPlaceScoreFmt = formatNum(thirdPlace.score ?? topScore, 1);
  const moverScoreFmt = formatNum(moverScore, 1);
  const dropScoreFmt = formatNum(dropScore, 1);
  const secScoreFmt = formatNum(secScore, 1);
  const lowSecScoreFmt = formatNum(lowSecScore, 1);
  const tailOneScoreFmt = formatNum(tailOne[primaryKey] ?? 0, 1);
  const tailTwoScoreFmt = formatNum(tailTwo[primaryKey] ?? 0, 1);
  const tailThreeScoreFmt = formatNum(tailThree[primaryKey] ?? 0, 1);
  const topZoneLeaderScoreFmt = formatNum(
    topZoneObj.leader && topZoneObj.leader[primaryKey] != null ? topZoneObj.leader[primaryKey] : topScore,
    1
  );

  const top3Margin = formatNum(Math.max(0, Number(topScore) - Number(thirdPlace.score ?? topScore)), 1);
  const runnerUpMargin = formatNum(Math.max(0, Number(topScore) - Number(runnerUp.score ?? topScore)), 1);

  const featuredState = ["01", "12", "17", "19", "25"].includes(angleId)
    ? leadMover.entity
    : ["02"].includes(angleId)
    ? dropper.entity
    : ["03", "06", "08", "18", "20"].includes(angleId)
    ? secWatchLeader.entity
    : ["07", "09"].includes(angleId)
    ? lowSecEntity.entity
    : ["04", "15"].includes(angleId)
    ? runnerUp.entity
    : ["05"].includes(angleId)
    ? thirdPlace.entity
    : ["14"].includes(angleId)
    ? isPolicing
      ? secWatchLeader.entity
      : tailOne.entity
    : topEntity;

  let title;
  let summary;
  let leadNarrative;

  switch (angleId) {
    case "01": {
      title = isPolicing
        ? `${leadMover.entity} Command Climbs ${moverDelta} to ${moverScoreFmt} SPS as ${topEntity} Leads Federation`
        : `${leadMover.entity} Posts ${moverDelta} Policy Surge to ${moverScoreFmt} PSI as ${topEntity} Holds Overall Lead`;
      summary = `${leadMover.entity} posted the sharpest ${primaryKey} gain (${moverDelta}) while ${topEntity} held first place at ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `${leadMover.entity} logged the sharpest single-day ${primaryKey} surge at ${moverDelta} to reach ${moverScoreFmt} ${primaryKey} on ${dateStr}, while ${topEntity} maintained the overall ${metricLabel} lead at ${topScoreFmt} ${primaryKey}. Daily movements across the 37 jurisdictions spanned ${maxNeg} to ${maxPos}.`;
      break;
    }
    case "02": {
      title = isPolicing
        ? `${dropper.entity} Drops ${dropDelta} to ${dropScoreFmt} SPS as Operational Tempo Tests Baseline`
        : `${dropper.entity} Slips ${dropDelta} to ${dropScoreFmt} PSI Below Policy Baseline`;
      summary = `${dropper.entity} recorded a ${dropDelta} ${primaryKey} pullback while ${topEntity} retained first place on ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `${dropper.entity} recorded the steepest ${primaryKey} contraction at ${dropDelta} to sit at ${dropScoreFmt} ${primaryKey} on ${dateStr}, contrasting with frontrunner ${topEntity} at ${topScoreFmt} ${primaryKey}. Federation-wide daily shifts ranged between ${maxNeg} and ${maxPos}.`;
      break;
    }
    case "03": {
      const f1 = flatStates[0] ? flatStates[0].entity : tailOne.entity;
      const f2 = flatStates[1] ? flatStates[1].entity : tailTwo.entity;
      const f3 = flatStates[2] ? flatStates[2].entity : tailThree.entity;
      title = isPolicing
        ? `Threat Baselines Hold Unchanged at ${secScoreFmt} JTI in ${secWatchLeader.entity} and ${secWatchSecond.entity}`
        : `Policy Output Holds Flat at +0.0 Across ${f1}, ${f2}, and ${f3}`;
      summary = `Zero-delta persistence marked key jurisdictions on ${dateStr} even as ${leadMover.entity} moved ${moverDelta} ${primaryKey}.`;
      leadNarrative = isPolicing
        ? `Elevated threat baselines held steady at ${secScoreFmt} ${secondaryKey} in ${secWatchLeader.entity} alongside ${secWatchSecond.entity} on ${dateStr}, while active enforcement movement lifted ${leadMover.entity} by ${moverDelta} ${primaryKey}.`
        : `Policy readings held unchanged at +0.0 ${primaryKey} across ${f1}, ${f2}, and ${f3} on ${dateStr}, contrasting with active upward movement in ${leadMover.entity} (${moverDelta} ${primaryKey}) behind leader ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      break;
    }
    case "04": {
      title = isPolicing
        ? `${runnerUp.entity} Normalizes at ${runnerUpScoreFmt} SPS Behind Frontrunner ${topEntity} (${topScoreFmt} SPS)`
        : `${runnerUp.entity} Moderates to ${runnerUpScoreFmt} PSI Behind Pace-Setter ${topEntity} (${topScoreFmt} PSI)`;
      summary = `${runnerUp.entity} holds second place at ${runnerUpScoreFmt} ${primaryKey} behind ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      leadNarrative = `${runnerUp.entity} settled at ${runnerUpScoreFmt} ${primaryKey} in second place across the 37 jurisdictions on ${dateStr}, trailing leader ${topEntity} (${topScoreFmt} ${primaryKey}) as federation-wide daily deltas ranged from ${maxNeg} to ${maxPos}.`;
      break;
    }
    case "05": {
      title = isPolicing
        ? `Steady Tactical Output Pushes ${thirdPlace.entity} to ${thirdPlaceScoreFmt} SPS in Top-Three Tier`
        : `Incremental Gains Lift ${thirdPlace.entity} to ${thirdPlaceScoreFmt} PSI in Subnational Top Three`;
      summary = `${thirdPlace.entity} anchors the ${primaryKey} podium at ${thirdPlaceScoreFmt} alongside ${topEntity} and ${runnerUp.entity}.`;
      leadNarrative = `Sustained session-over-session consistency keeps ${thirdPlace.entity} inside the national ${metricLabel} top three at ${thirdPlaceScoreFmt} ${primaryKey} on ${dateStr}, behind ${topEntity} (${topScoreFmt} ${primaryKey}) and ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}).`;
      break;
    }
    case "06": {
      title = isPolicing
        ? `${secWatchLeader.entity} Registers ${secScoreFmt} JTI Threat Watch as ${topEntity} Leads on ${topScoreFmt} SPS`
        : `${topEntity} Pairs ${topScoreFmt} PSI Lead With Elevated ${secScoreFmt} SIS Friction in ${secWatchLeader.entity}`;
      summary = `${topEntity} leads ${primaryKey} (${topScoreFmt}) while ${secWatchLeader.entity} tops ${secondaryKey} watch readings (${secScoreFmt}).`;
      leadNarrative = `Divergence between primary execution and secondary pressure defines the 37-jurisdiction board on ${dateStr}: ${topEntity} leads ${metricLabel} at ${topScoreFmt} ${primaryKey}, while ${secWatchLeader.entity} registers the highest ${secLabel} reading at ${secScoreFmt} ${secondaryKey}.`;
      break;
    }
    case "07": {
      title = isPolicing
        ? `Quiet Threat Reading (${lowSecScoreFmt} JTI) Contrasts With ${primaryKey} Gap in ${lowSecEntity.entity}`
        : `Low Instability (${lowSecScoreFmt} SIS) Contrasts With Sub-Baseline Policy Execution in ${lowSecEntity.entity}`;
      summary = `${lowSecEntity.entity} records a low ${secondaryKey} reading (${lowSecScoreFmt}) despite trailing ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      leadNarrative = `A low ${secLabel} reading of ${lowSecScoreFmt} ${secondaryKey} in ${lowSecEntity.entity} contrasts with its primary ${primaryKey} standing on ${dateStr}, illustrating how low surface friction can coexist with moderate ${metricLabel} output behind ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      break;
    }
    case "08": {
      title = isPolicing
        ? `Enforcement Tempo Lifts ${leadMover.entity} (${moverDelta} SPS) While ${secWatchLeader.entity} Leads JTI Watch`
        : `Executive Policy Output Lifts ${leadMover.entity} (${moverDelta} PSI) Against ${secWatchLeader.entity} SIS Watch`;
      summary = `${leadMover.entity} gained ${moverDelta} ${primaryKey} while ${secWatchLeader.entity} led ${secondaryKey} watch readings (${secScoreFmt}).`;
      leadNarrative = `Primary ${metricLabel} gains in ${leadMover.entity} (${moverDelta} to ${moverScoreFmt} ${primaryKey}) run alongside elevated ${secLabel} readings in ${secWatchLeader.entity} (${secScoreFmt} ${secondaryKey}) on ${dateStr}, highlighting uneven conversion between immediate output and structural stability.`;
      break;
    }
    case "09": {
      title = isPolicing
        ? `Containment Discipline Keeps ${lowSecEntity.entity} at ${lowSecScoreFmt} JTI Baseline Across Federation`
        : `Low Friction Anchors ${lowSecEntity.entity} at ${lowSecScoreFmt} SIS as Institutional Stability Holds`;
      summary = `${lowSecEntity.entity} holds the lowest ${secondaryKey} reading (${lowSecScoreFmt}) while ${topEntity} leads ${primaryKey} (${topScoreFmt}).`;
      leadNarrative = `Tight containment discipline keeps ${lowSecEntity.entity} at a federation-low ${lowSecScoreFmt} ${secondaryKey} on ${dateStr}, anchoring institutional stability while ${topEntity} paces the primary ${metricLabel} table at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
    case "10": {
      title = isPolicing
        ? `${topEntity} Commands Top Tier on Both Enforcement (${topScoreFmt} SPS) and Containment`
        : `${topEntity} Sweeps Top Tier on Both Policy Output (${topScoreFmt} PSI) and Stability`;
      summary = `${topEntity} holds the federation-wide ${primaryKey} lead at ${topScoreFmt} ahead of ${runnerUp.entity} (${runnerUpScoreFmt}).`;
      leadNarrative = `${topEntity} commands the top tier across the 37 jurisdictions at ${topScoreFmt} ${primaryKey} on ${dateStr}, outpacing runner-up ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}) and third-placed ${thirdPlace.entity} (${thirdPlaceScoreFmt} ${primaryKey}).`;
      break;
    }
    case "11": {
      title = isPolicing
        ? `${topZoneObj.zone} Commands Lead Regional Telemetry Behind ${topZoneObj.leader.entity} (${topZoneLeaderScoreFmt} SPS Top)`
        : `${topZoneObj.zone} States Drive Subnational Policy Gains Behind ${topZoneObj.leader.entity}`;
      summary = `${topZoneObj.zone} leads geopolitical zone averages while ${topEntity} holds first place at ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `Geopolitical zone aggregation on ${dateStr} puts ${topZoneObj.zone} at the forefront of subnational ${metricLabel} telemetry, anchored by ${topZoneObj.leader.entity} alongside national frontrunner ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      break;
    }
    case "12": {
      title = isPolicing
        ? `Joint Regional Gains Lift ${leadMover.entity} (${moverDelta}) and ${secondMover.entity} SPS Baselines`
        : `Subnational Momentum Lifts ${leadMover.entity} (${moverDelta}) and ${secondMover.entity} Policy Scores`;
      summary = `${leadMover.entity} (${moverDelta}) and ${secondMover.entity} led upward ${primaryKey} movement on ${dateStr}.`;
      leadNarrative = `Coordinated upward movement across tracked jurisdictions lifted ${leadMover.entity} (${moverDelta} to ${moverScoreFmt} ${primaryKey}) and ${secondMover.entity} on ${dateStr}, reinforcing the upper tier behind ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      break;
    }
    case "13": {
      title = isPolicing
        ? `Three Commands Cluster Within ${top3Margin} SPS Points Behind ${topEntity} (${topScoreFmt} SPS)`
        : `Top-Three Policy Margin Narrows to ${top3Margin} Points Behind ${topEntity} at ${topScoreFmt} PSI`;
      summary = `Only ${top3Margin} ${primaryKey} points separate ${topEntity}, ${runnerUp.entity}, and ${thirdPlace.entity} at the summit.`;
      leadNarrative = `A ${top3Margin}-point spread separates the top three jurisdictions on the ${metricLabel} board as of ${dateStr}, with ${topEntity} (${topScoreFmt} ${primaryKey}) narrowly ahead of ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}) and ${thirdPlace.entity} (${thirdPlaceScoreFmt} ${primaryKey}).`;
      break;
    }
    case "14": {
      title = isPolicing
        ? `Persistent Threat Readings Keep ${secWatchLeader.entity} (${secScoreFmt} JTI) on High Watch`
        : `${tailOne.entity}, ${tailTwo.entity}, and ${tailThree.entity} Trail Subnational Policy Median on PSI Board`;
      summary = `${tailOne.entity} (${tailOneScoreFmt} ${primaryKey}) leads the trailing tier while ${topEntity} holds ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `Trailing jurisdictions ${tailOne.entity} (${tailOneScoreFmt} ${primaryKey}), ${tailTwo.entity} (${tailTwoScoreFmt} ${primaryKey}), and ${tailThree.entity} (${tailThreeScoreFmt} ${primaryKey}) sit at the foot of the 37-jurisdiction board on ${dateStr}, contrasting with leader ${topEntity} at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
    case "15": {
      title = isPolicing
        ? `${runnerUp.entity} (${runnerUpScoreFmt} SPS) Consolidates Top-Three Enforcement Tier Behind ${topEntity}`
        : `${runnerUp.entity} Consolidates Subnational Top Tier at ${runnerUpScoreFmt} PSI Behind ${topEntity}`;
      summary = `${runnerUp.entity} holds second place at ${runnerUpScoreFmt} ${primaryKey} behind ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      leadNarrative = `Sustained performance keeps ${runnerUp.entity} firmly inside the top tier at ${runnerUpScoreFmt} ${primaryKey} on ${dateStr}, trailing frontrunner ${topEntity} (${topScoreFmt} ${primaryKey}) by ${runnerUpMargin} points.`;
      break;
    }
    case "16": {
      title = isPolicing
        ? `Operational Readiness Reinforces ${topEntity} Lead at ${topScoreFmt} SPS Across 37 Jurisdictions`
        : `${topEntity} Anchors Subnational Capital & Policy Execution at ${topScoreFmt} PSI`;
      summary = `${topEntity} maintains its ${primaryKey} lead at ${topScoreFmt} while ${leadMover.entity} gains ${moverDelta}.`;
      leadNarrative = `Resource and operational execution keep ${topEntity} at the summit of the ${metricLabel} standings on ${topScoreFmt} ${primaryKey} as of ${dateStr}, while ${leadMover.entity} posts the day's strongest upward gain at ${moverDelta} ${primaryKey}.`;
      break;
    }
    case "17": {
      title = isPolicing
        ? `Command Tempo Coincides With ${moverDelta} SPS Shift in ${leadMover.entity} Division`
        : `Executive Policy Shift Moves ${leadMover.entity} by ${moverDelta} to ${moverScoreFmt} PSI`;
      summary = `${leadMover.entity} shifted ${moverDelta} ${primaryKey} to ${moverScoreFmt} as ${topEntity} held ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `Tactical and administrative adjustments coincided with a ${moverDelta} ${primaryKey} shift in ${leadMover.entity} (now ${moverScoreFmt} ${primaryKey}) on ${dateStr}, while ${topEntity} retained first place nationwide at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
    case "18": {
      title = isPolicing
        ? `Accountability & Throughput Metrics Track ${secWatchLeader.entity} (${secScoreFmt} JTI) and ${topEntity}`
        : `Governance Compliance & Audit Benchmarks Keep ${topEntity} Ahead at ${topScoreFmt} PSI`;
      summary = `${topEntity} (${topScoreFmt} ${primaryKey}) and ${secWatchLeader.entity} (${secScoreFmt} ${secondaryKey}) anchor compliance telemetry on ${dateStr}.`;
      leadNarrative = `Institutional accountability and throughput benchmarks across the 37 jurisdictions on ${dateStr} place ${topEntity} first on ${topScoreFmt} ${primaryKey}, while ${secWatchLeader.entity} registers ${secScoreFmt} ${secondaryKey} on the secondary watch index.`;
      break;
    }
    case "19": {
      title = isPolicing
        ? `Tactical Highs Lift ${leadMover.entity} (${moverDelta}) as ${topEntity} Holds ${topScoreFmt} SPS`
        : `Execution Milestones Lift ${leadMover.entity} by ${moverDelta} to ${moverScoreFmt} PSI`;
      summary = `${leadMover.entity} gained ${moverDelta} ${primaryKey} on concrete execution milestones behind leader ${topEntity} (${topScoreFmt}).`;
      leadNarrative = `Concrete field and administrative execution lifted ${leadMover.entity} by ${moverDelta} to ${moverScoreFmt} ${primaryKey} on ${dateStr}, while ${topEntity} remained atop the federation table at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
    case "20": {
      title = isPolicing
        ? `Security Friction Tests ${secWatchLeader.entity} (${secScoreFmt} JTI) While ${topEntity} Leads on ${topScoreFmt} SPS`
        : `Institutional Friction Pushes ${secWatchLeader.entity} to ${secScoreFmt} SIS as ${topEntity} Leads PSI`;
      summary = `${secWatchLeader.entity} leads ${secondaryKey} friction readings (${secScoreFmt}) while ${topEntity} tops ${primaryKey} (${topScoreFmt}).`;
      leadNarrative = `Localized friction pushes ${secWatchLeader.entity} to the top of the ${secLabel} watch list at ${secScoreFmt} ${secondaryKey} on ${dateStr}, even as ${topEntity} maintains the overall ${metricLabel} lead at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
    case "21": {
      title = isPolicing
        ? `${topEntity} Rolling Enforcement Trajectory Holds ${topScoreFmt} SPS Ahead of Weekly Rollover`
        : `${topEntity} Rolling Policy Trajectory Holds ${topScoreFmt} PSI Ahead of Weekly Rollover`;
      summary = `${topEntity} sustains its rolling ${primaryKey} lead at ${topScoreFmt} ahead of ${runnerUp.entity} (${runnerUpScoreFmt}).`;
      leadNarrative = `Progressive rolling telemetry across the 37 jurisdictions on ${dateStr} keeps ${topEntity} ahead at ${topScoreFmt} ${primaryKey}, maintaining momentum over ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}).`;
      break;
    }
    case "22": {
      title = isPolicing
        ? `Midweek Tactical Operations Shift Command Baselines Across ${topZoneObj.zone} Jurisdictions`
        : `Midweek Policy Filings Reshape Subnational Rankings Ahead of Thursday Rollover`;
      summary = `Midweek ${primaryKey} shifts span ${maxNeg} to ${maxPos} behind leader ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      leadNarrative = `Midweek telemetry across all 37 jurisdictions on ${dateStr} records ${primaryKey} deltas ranging from ${maxNeg} to ${maxPos}, with ${leadMover.entity} (${moverDelta}) posting the sharpest gain behind ${topEntity} (${topScoreFmt} ${primaryKey}).`;
      break;
    }
    case "23": {
      title = isPolicing
        ? `Weekly Policing Rollover: ${topEntity} Tops 7-Day Enforcement at ${topScoreFmt} SPS`
        : `Weekly Governance Rollover: ${topEntity} Closes Window at ${topScoreFmt} PSI as ${lowSecEntity.entity} Leads Stability`;
      summary = `Thursday weekly rollover confirms ${topEntity} at ${topScoreFmt} ${primaryKey} across the 37 jurisdictions.`;
      leadNarrative = `Closing the Thursday weekly rollover window on ${dateStr}, ${topEntity} finishes atop the 37-jurisdiction ${metricLabel} standings at ${topScoreFmt} ${primaryKey}, while ${lowSecEntity.entity} anchors stability at ${lowSecScoreFmt} ${secondaryKey}.`;
      break;
    }
    case "24": {
      title = isPolicing
        ? `${topEntity} Holds Top Enforcement Ranking at ${topScoreFmt} SPS Against ${runnerUp.entity}`
        : `${topEntity} Extends Subnational Policy Lead at ${topScoreFmt} PSI Over ${runnerUp.entity}`;
      summary = `${topEntity} defends first place on ${topScoreFmt} ${primaryKey} ahead of ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}).`;
      leadNarrative = `${topEntity} extends its hold on first place across the 37 jurisdictions at ${topScoreFmt} ${primaryKey} on ${dateStr}, keeping runner-up ${runnerUp.entity} (${runnerUpScoreFmt} ${primaryKey}) and ${thirdPlace.entity} (${thirdPlaceScoreFmt} ${primaryKey}) behind.`;
      break;
    }
    case "25":
    default: {
      title = isPolicing
        ? `Cumulative Command Telemetry: ${leadMover.entity} Leads ${moverDelta} SPS Gains Behind ${topEntity}`
        : `Cumulative Subnational Telemetry: ${leadMover.entity} Leads ${moverDelta} PSI Gains Behind ${topEntity}`;
      summary = `${leadMover.entity} leads ${moverDelta} ${primaryKey} gains while ${topEntity} holds ${topScoreFmt} ${primaryKey}.`;
      leadNarrative = `Cumulative subnational telemetry across the 37 jurisdictions as of ${dateStr} highlights ${leadMover.entity} (${moverDelta} ${primaryKey}) for net upward movement while ${topEntity} anchors the overall ${metricLabel} table at ${topScoreFmt} ${primaryKey}.`;
      break;
    }
  }

  const top3Text = primaryTop3.length
    ? formatList(
        primaryTop3,
        (r, idx) => `${idx + 1}. ${r.entity} (${formatNum(r.score, 1)} ${primaryKey}, ${formatDelta(r.delta)})`
      )
    : `${topEntity} (${topScoreFmt} ${primaryKey})`;

  const p1 =
    `Leading ${metricLabel} positions across the 37 jurisdictions on ${dateStr} stand at ${top3Text}. ` +
    (runnerUp
      ? `${topEntity} holds a ${runnerUpMargin}-point margin over ${runnerUp.entity} in the primary ranking.`
      : `Daily ${primaryKey} readings reflect comparative performance across state commands and administrations.`);

  const secText = secondaryTop.length
    ? formatList(
        secondaryTop,
        (r) => `${r.entity} (${formatNum(r.score, 1)} ${secondaryKey}, ${formatDelta(r.delta)})`
      )
    : "";

  const p2 = secText
    ? `On the ${secLabel} side, notable readings include ${secText}, ` +
      `highlighting jurisdictions where secondary risk or instability indicators behave differently from top ${primaryKey} totals.`
    : `Secondary ${secondaryKey} readings across the 37 jurisdictions continue to be tracked alongside ${primaryKey} movement.`;

  const trailingText = trailing.length
    ? formatList(
        trailing,
        (r) => `${r.entity} (${formatNum(r[primaryKey], 1)} ${primaryKey}, ${formatDelta(r[`${primaryKey}_delta`])})`
      )
    : "";

  const p3 = trailingText
    ? `Lower-ranked jurisdictions on the ${primaryKey} board include ${trailingText}, ` +
      `illustrating the spread between frontrunners and trailing states as of ${dateStr}.`
    : `Rankings across all 37 jurisdictions remain updated for ${dateStr}.`;

  const activeZones = jurisdictions.reduce((acc, r) => {
    const z = r.zone || "NC";
    acc[z] = (acc[z] || 0) + 1;
    return acc;
  }, {});

  const zoneSummary = Object.entries(activeZones)
    .map(([z, count]) => `${z} (${count})`)
    .join(", ");

  const p4 = zoneSummary
    ? `Regional distribution across geopolitical zones spans ${zoneSummary}, capturing broad subnational comparisons without relying on single-location snapshots.`
    : `Subnational comparisons span all 37 jurisdictions nationwide.`;

  return {
    state: featuredState,
    title,
    summary,
    leadNarrative,
    storyBody: [p1, p2, p3, p4],
    labels: [
      "News Report",
      "Diploman Times",
      verticalTag,
      featuredState,
      `Angle ${angleId}`
    ],
    featuredImage: {
      src: "",
      alt: `${featuredState} ${verticalTag} Telemetry`,
      target_url: DIPLOMAN_TIMES_URL
    }
  };
}

function buildStoryDraft(vertical, selection, metrics, repoRoot) {
  const dateStr = selection.run_date_utc || metrics.run_date_utc || new Date().toISOString().slice(0, 10);
  if (vertical === "footballtally") {
    return buildFootballDraft(selection, metrics, dateStr, repoRoot);
  }
  return buildJurisdictionDraft(vertical, selection, metrics, dateStr);
}

function queueScoredBrief({ vertical, selectionPath, metricsPath, queuePath }) {
  const selection = loadJson(selectionPath, null);
  if (!selection) {
    throw new Error(`Missing angle selection file at: ${selectionPath}`);
  }
  const metrics = loadJson(metricsPath, {});
  const existingQueue = loadJson(queuePath, { newsReports: [] });
  const resolvedQueueDir = path.dirname(path.resolve(queuePath));
  const repoRoot = /^[a-z]{3}\d{4}$/i.test(path.basename(resolvedQueueDir))
    ? path.dirname(resolvedQueueDir)
    : resolvedQueueDir;

  const nowIso = new Date().toISOString();
  const todayUtc = nowIso.slice(0, 10);

  const prefixMap = {
    governancescore: "scored-gov",
    footballtally: "scored-ftb",
    policingintel: "scored-pol"
  };
  const prefix = prefixMap[vertical] || `scored-${vertical}`;
  const runDate = normalizeUtcDate(selection.run_date_utc || metrics.run_date_utc, todayUtc);
  const angleId = selection.selected_angle_id || "01";
  const dailySlotId = `${prefix}-${runDate}`;

  const rawList = Array.isArray(existingQueue)
    ? existingQueue
    : Array.isArray(existingQueue.newsReports)
    ? existingQueue.newsReports
    : Array.isArray(existingQueue.items)
    ? existingQueue.items
    : [];

  // Promote any earlier scheduled_future entries whose run_date_utc has now arrived
  const existingList = promoteDueScheduledItems(rawList, nowIso);

  const alreadyPublishedForDate = existingList.find(
    (item) =>
      item &&
      String(item.vertical || "").toLowerCase() === vertical &&
      item.published === true &&
      (item.id === dailySlotId ||
        String(item.id || "").startsWith(`${dailySlotId}-`) ||
        item.run_date_utc === runDate ||
        item.published_utc_date === runDate)
  );

  if (alreadyPublishedForDate) {
    saveJson(queuePath, { newsReports: existingList });
    return {
      status: "SKIPPED_ALREADY_PUBLISHED_FOR_DATE",
      run_date_utc: runDate,
      vertical,
      existing_id: alreadyPublishedForDate.id
    };
  }

  const draft = buildStoryDraft(vertical, { ...selection, run_date_utc: runDate }, metrics, repoRoot);
  const socialExcerpt = buildSocialExcerpt({
    vertical,
    title: draft.title,
    summary: draft.summary,
    url: DIPLOMAN_TIMES_URL
  });

  const scheduleMeta = resolveScheduleFields(runDate, nowIso);

  const entry = {
    type: "scored_brief",
    id: dailySlotId,
    run_date_utc: scheduleMeta.run_date_utc,
    status: scheduleMeta.status,
    published: false,
    publish_after_utc: scheduleMeta.publish_after_utc,
    prepared_at_utc: scheduleMeta.prepared_at_utc,
    queued_at_utc: scheduleMeta.queued_at_utc,
    target_url: DIPLOMAN_TIMES_URL,
    vertical,
    ...(draft.state ? { state: draft.state } : {}),
    source_domain: selection.domain || DIPLOMAN_TIMES_URL,
    angle_id: angleId,
    angle_name: selection.angle_name || "",
    angle_family: selection.family || "general",
    opening_class: selection.opening_class || "entity_first",
    headline_skeleton: selection.headline_skeleton || "",
    lede_rule: selection.lede_rule || "",
    ...(vertical === "footballtally" && selection.weak_points_context
      ? { weak_points_context: selection.weak_points_context }
      : {}),
    title: draft.title,
    summary: draft.summary,
    social_excerpt: socialExcerpt,
    labels: draft.labels,
    featured_image: draft.featuredImage,
    lead_narrative: draft.leadNarrative,
    story_body: draft.storyBody
  };

  const filteredList = existingList.filter((item) => {
    if (!item) return false;
    const sameVertical = String(item.vertical || "").toLowerCase() === vertical;
    const sameDate =
      item.id === dailySlotId ||
      String(item.id || "").startsWith(`${dailySlotId}-`) ||
      item.run_date_utc === runDate;
    return !(sameVertical && sameDate && !item.published);
  });

  const updatedReports = [entry, ...filteredList];
  saveJson(queuePath, { newsReports: updatedReports });

  return {
    status: scheduleMeta.status === "queued" ? "QUEUED" : "SCHEDULED_FOR_RUN_DATE",
    target_url: DIPLOMAN_TIMES_URL,
    entry
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def = "") => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  try {
    const vertical = getArg("--vertical", "footballtally");
    const selectionPath = getArg("--selection", path.join("state", vertical, "latest_selection.json"));
    const metricsPath = getArg("--metrics", path.join("state", vertical, "daily_metrics_summary.json"));
    const queuePath = getArg("--queue", "news-queue.json");

    const result = queueScoredBrief({ vertical, selectionPath, metricsPath, queuePath });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { queueScoredBrief, buildSocialExcerpt, resolveScheduleFields, promoteDueScheduledItems };
