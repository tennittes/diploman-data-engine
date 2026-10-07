const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, 'raw');
const OUTPUT_JSON_DIR = path.join(__dirname, 'dist/json');
const OUTPUT_HTML_DIR = path.join(__dirname, 'dist/html');

[OUTPUT_JSON_DIR, OUTPUT_HTML_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function sanitizeRawString(rawText) {
  return rawText
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/;\s*$/, '')
    .trim();
}

function validateB1(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('B1 must be a non-empty array.');
  }
  return true;
}

function validateB2(data) {
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('B2 root must be an Object.');
  }
  const keys = Object.keys(data);
  if (keys.length === 0) throw new Error('B2 object is empty.');
  return keys[0];
}

function validateB3(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('B3 must be a non-empty array.');
  }
  return true;
}

function compileBloggerHTML(b1, b2, b3, dayKey) {
  const b2Data = b2[dayKey];
  const formattedDate = b2Data.formattedDate || b2Data.date;
  
  let html = `<!-- DIPLOMAN TIMES INTELLIGENCE BRIEF - ${formattedDate} -->\n`;
  html += `<article style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.6;">\n`;

  html += `  <header style="background: #0f172a; color: #ffffff; padding: 24px; border-radius: 8px; margin-bottom: 24px;">\n`;
  html += `    <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #f8fafc;">${b2Data.reportTitles.headlines.title}</h1>\n`;
  html += `    <p style="margin: 0; font-size: 14px; color: #94a3b8;">${b2Data.reportTitles.headlines.subtitle}</p>\n`;
  html += `  </header>\n\n`;

  html += `  <section style="margin-bottom: 32px;">\n`;
  html += `    <h2 style="font-size: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px;">State Executive Policy Signals</h2>\n`;
  b1.forEach((item) => {
    html += `    <div style="border: 1px solid #e2e8f0; border-left: 5px solid #2563eb; padding: 16px; margin-bottom: 16px; border-radius: 4px; background: #f8fafc;">\n`;
    html += `      <strong style="font-size: 16px; color: #1e3a8a;">${item.stateName} (PSI ${item.psi})</strong>\n`;
    html += `      <h3 style="font-size: 16px; margin: 8px 0; color: #0f172a;">${item.headline}</h3>\n`;
    html += `      <p style="margin: 0; font-size: 14px; color: #334155;">${item.impactMatrix.whatHappened}</p>\n`;
    html += `    </div>\n`;
  });
  html += `  </section>\n\n`;

  html += `  <section style="margin-bottom: 32px;">\n`;
  html += `    <h2 style="font-size: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px;">Subnational Risk & Advisory Matrix</h2>\n`;
  html += `    <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">\n`;
  html += `      <thead>\n`;
  html += `        <tr style="background: #0f172a; color: #ffffff;">\n`;
  html += `          <th style="padding: 8px;">State</th><th style="padding: 8px;">PSI</th><th style="padding: 8px;">SIS</th><th style="padding: 8px;">Focus Area</th>\n`;
  html += `        </tr>\n`;
  html += `      </thead>\n`;
  html += `      <tbody>\n`;
  b3.forEach((row, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    html += `        <tr style="background: ${bg};">\n`;
    html += `          <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.stateName}</td>\n`;
    html += `          <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.psi}</td>\n`;
    html += `          <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.sis}</td>\n`;
    html += `          <td style="padding: 8px; border: 1px solid #e2e8f0;">${row.focus}</td>\n`;
    html += `        </tr>\n`;
  });
  html += `      </tbody>\n`;
  html += `    </table>\n`;
  html += `  </section>\n`;

  html += `</article>`;
  return html;
}

function runPipeline() {
  const b1Path = path.join(INPUT_DIR, 'b1.json');
  const b2Path = path.join(INPUT_DIR, 'b2.json');
  const b3Path = path.join(INPUT_DIR, 'b3.json');

  const rawB1 = sanitizeRawString(fs.readFileSync(b1Path, 'utf8'));
  const rawB2 = sanitizeRawString(fs.readFileSync(b2Path, 'utf8'));
  const rawB3 = sanitizeRawString(fs.readFileSync(b3Path, 'utf8'));

  const parsedB1 = JSON.parse(rawB1);
  const parsedB2 = JSON.parse(rawB2);
  const parsedB3 = JSON.parse(rawB3);

  validateB1(parsedB1);
  const dayKey = validateB2(parsedB2);
  validateB3(parsedB3);

  fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b1.json'), JSON.stringify(parsedB1, null, 2));
  fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b2.json'), JSON.stringify(parsedB2, null, 2));
  fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b3.json'), JSON.stringify(parsedB3, null, 2));

  const bloggerHtml = compileBloggerHTML(parsedB1, parsedB2, parsedB3, dayKey);
  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, `blogger-report-day-${dayKey}.html`), bloggerHtml, 'utf8');
}

runPipeline();
