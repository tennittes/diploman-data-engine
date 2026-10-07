const fs = require('fs');
const path = require('path');

const OUTPUT_JSON_DIR = path.join(__dirname, 'dist/json');
const OUTPUT_HTML_DIR = path.join(__dirname, 'dist/html');

[OUTPUT_JSON_DIR, OUTPUT_HTML_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Automatically locate the most recently modified master-data.json
 * across all month directories (e.g., oct2026, nov2026, jan2027)
 */
function findLatestMasterDataFile() {
  const entries = fs.readdirSync(__dirname, { withFileTypes: true });
  let latestFile = null;
  let latestMtime = 0;

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
      const candidatePath = path.join(__dirname, entry.name, 'master-data.json');
      if (fs.existsSync(candidatePath)) {
        const stats = fs.statSync(candidatePath);
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latestFile = candidatePath;
        }
      }
    }
  }

  // Fallback to root master-data.json if no subdirectory match is found
  if (!latestFile) {
    const rootCandidate = path.join(__dirname, 'master-data.json');
    if (fs.existsSync(rootCandidate)) return rootCandidate;
    throw new Error('Could not locate any master-data.json in month folders or root.');
  }

  return latestFile;
}

function sanitizeRawString(rawText) {
  return rawText
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/;\s*$/, '')
    .trim();
}

function compileBloggerHTML(b1, b2, b3, dayKey) {
  const b2Data = b2[dayKey] || Object.values(b2)[0];
  if (!b2Data) throw new Error('Could not parse B2 data from master-data.json');

  const formattedDate = b2Data.formattedDate || b2Data.date;
  
  let html = `<!-- DIPLOMAN TIMES INTELLIGENCE BRIEF - ${formattedDate} -->\n`;
  html += `<article style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.6;">\n`;

  if (b2Data.reportTitles && b2Data.reportTitles.headlines) {
    html += `  <header style="background: #0f172a; color: #ffffff; padding: 24px; border-radius: 8px; margin-bottom: 24px;">\n`;
    html += `    <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #f8fafc;">${b2Data.reportTitles.headlines.title}</h1>\n`;
    html += `    <p style="margin: 0; font-size: 14px; color: #94a3b8;">${b2Data.reportTitles.headlines.subtitle}</p>\n`;
    html += `  </header>\n\n`;
  }

  if (Array.isArray(b1)) {
    html += `  <section style="margin-bottom: 32px;">\n`;
    html += `    <h2 style="font-size: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px;">State Executive Policy Signals</h2>\n`;
    b1.forEach((item) => {
      html += `    <div style="border: 1px solid #e2e8f0; border-left: 5px solid #2563eb; padding: 16px; margin-bottom: 16px; border-radius: 4px; background: #f8fafc;">\n`;
      html += `      <strong style="font-size: 16px; color: #1e3a8a;">${item.stateName || item.stateKey} (PSI ${item.psi})</strong>\n`;
      html += `      <h3 style="font-size: 16px; margin: 8px 0; color: #0f172a;">${item.headline}</h3>\n`;
      if (item.impactMatrix) {
        html += `      <p style="margin: 0; font-size: 14px; color: #334155;">${item.impactMatrix.whatHappened}</p>\n`;
      }
      html += `    </div>\n`;
    });
    html += `  </section>\n\n`;
  }

  if (Array.isArray(b3)) {
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
  }

  html += `</article>`;
  return html;
}

function runPipeline() {
  const masterFile = findLatestMasterDataFile();
  console.log(`Processing file: ${masterFile}`);

  const rawMaster = sanitizeRawString(fs.readFileSync(masterFile, 'utf8'));
  const masterData = JSON.parse(rawMaster);

  const b1 = masterData.b1 || masterData.B1;
  const b2 = masterData.b2 || masterData.B2;
  const b3 = masterData.b3 || masterData.B3;

  const dayKey = b2 ? Object.keys(b2)[0] : 'latest';

  if (b1) fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b1.json'), JSON.stringify(b1, null, 2));
  if (b2) fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b2.json'), JSON.stringify(b2, null, 2));
  if (b3) fs.writeFileSync(path.join(OUTPUT_JSON_DIR, 'b3.json'), JSON.stringify(b3, null, 2));

  const bloggerHtml = compileBloggerHTML(b1, b2, b3, dayKey);
  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, `blogger-report-day-${dayKey}.html`), bloggerHtml, 'utf8');

  console.log(`✅ Pipeline successfully compiled ${path.basename(path.dirname(masterFile))}/master-data.json for Day ${dayKey}!`);
}

runPipeline();
