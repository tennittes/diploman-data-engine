// scripts/queue_scored_brief.js — Generates Dynamic, Boilerplate-Free Scored Briefs Into news-queue.json
const fs = require("fs");
const path = require("path");

const DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com";
const FOOTBALL_REPO_RAW_BASE = "https://raw.githubusercontent.com/tennittes/diploman-football-tally/main";
const FOOTBALL_FALLBACK_BANNER =
  "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiEjynaVCtt3sYwWSMmZt6p3IJG5W9t1DwrfmFCawdojeihYVuNN75wZymwVLZ_fx6Ampvi6r7j1xQ1IhAkOcdfl4BrGf6Bs6xi_hkvmR6nHQXbr7KQyHbooyUOXqNW_TrZZiAkz5iSFglPx0irzR23AoBeG0Ren9o1ZV9GlRTNSYJqRcvaBHom2hXhvTM/s1080/Diploman%20Football%20Stats%20Logo.png";

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

function escapeXml(str) {
  const amp = String.fromCharCode(38);
  return String(str ?? "")
    .replace(/\x26/g, `${amp}amp;`)
    .replace(/\x3c/g, `${amp}lt;`)
    .replace(/\x3e/g, `${amp}gt;`)
    .replace(/\x22/g, `${amp}quot;`)
    .replace(/\x27/g, `${amp}apos;`);
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

/**
 * Generates a 100% original, copyright-free 1200x675 SVG Telemetry Card
 * plotting DFT (Two-Half) vs STD (Full-Time) points for featured clubs.
 */
function generateFootballTelemetryCardSvg({ dateStr, leagueName, leagueCode, focusTag, headline, rows }) {
  const safeRows = (Array.isArray(rows) ? rows : []).slice(0, 5);
  const maxPts = Math.max(
    20,
    ...safeRows.map((r) => Math.max(Number(r.dft_pts || 0), Number(r.std_pts || 0)))
  );

  const barMaxWidth = 540;
  const startY = 235;
  const rowGap = 76;

  const barsSvg = safeRows
    .map((r, i) => {
      const y = startY + i * rowGap;
      const dft = Number(r.dft_pts || 0);
      const std = Number(r.std_pts || 0);
      const wp = formatDelta(r.weak_points ?? std - dft);
      const dftW = Math.max(12, Math.round((dft / maxPts) * barMaxWidth));
      const stdW = Math.max(12, Math.round((std / maxPts) * barMaxWidth));
      const rank = String(i + 1).padStart(2, "0");

      return `
      <g transform="translate(64, ${y})">
        <rect x="0" y="0" width="1072" height="62" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1"/>
        <text x="20" y="37" fill="#60A5FA" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="900">${rank}</text>
        <text x="58" y="37" fill="#F8FAFC" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="19" font-weight="800">${escapeXml(r.club)}</text>

        <rect x="330" y="13" width="${dftW}" height="15" rx="3" fill="#2563EB"/>
        <text x="${330 + dftW + 10}" y="25" fill="#93C5FD" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="800">${dft} DFT</text>

        <rect x="330" y="34" width="${stdW}" height="15" rx="3" fill="#10B981"/>
        <text x="${330 + stdW + 10}" y="46" fill="#6EE7B7" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="800">${std} STD</text>

        <rect x="955" y="15" width="96" height="32" rx="4" fill="#0F172A" stroke="#3B82F6" stroke-width="1"/>
        <text x="1003" y="36" text-anchor="middle" fill="#F8FAFC" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="900">${escapeXml(wp)} WP</text>
      </g>`;
    })
    .join("\n");

  const shortHeadline =
    headline.length > 74 ? `${headline.slice(0, 71).replace(/\s+\S*$/, "")}...` : headline;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${escapeXml(headline)}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="675" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="1200" height="8" fill="#2563EB"/>

  <rect x="64" y="42" width="275" height="34" rx="4" fill="#2563EB"/>
  <text x="201" y="64" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="900" letter-spacing="1.2">DIPLOMAN FOOTBALL STATS</text>

  <rect x="352" y="42" width="230" height="34" rx="4" fill="#1E293B" stroke="#3B82F6" stroke-width="1"/>
  <text x="467" y="64" text-anchor="middle" fill="#93C5FD" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="0.8">${escapeXml(leagueName.toUpperCase())} (${escapeXml(leagueCode)})</text>

  <text x="1136" y="65" text-anchor="end" fill="#94A3B8" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="15" font-weight="800" letter-spacing="0.6">${escapeXml(dateStr)} UTC</text>

  <text x="64" y="122" fill="#60A5FA" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="14" font-weight="900" letter-spacing="1.4">${escapeXml(focusTag.toUpperCase())}</text>
  <text x="64" y="162" fill="#FFFFFF" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="27" font-weight="900">${escapeXml(shortHeadline)}</text>

  <rect x="64" y="190" width="14" height="14" rx="2" fill="#2563EB"/>
  <text x="86" y="202" fill="#CBD5E1" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700">DFT (Two-Half Points)</text>

  <rect x="275" y="190" width="14" height="14" rx="2" fill="#10B981"/>
  <text x="297" y="202" fill="#CBD5E1" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700">STD (Full-Time Points)</text>

  <text x="1136" y="202" text-anchor="end" fill="#94A3B8" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700">WP = STD MINUS DFT DIFFERENTIAL</text>

  ${barsSvg}

  <text x="64" y="644" fill="#64748B" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="13" font-weight="700">PROPRIETARY TWO-HALF TELEMETRY • WWW.DIPLOMANTIMES.COM</text>
</svg>`;
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
    const relCardPath = path.posix.join("assets", "cards", `ftb-${dateStr}.svg`);
    const absCardPath = path.join(repoRoot || ".", "assets", "cards", `ftb-${dateStr}.svg`);
    const svgMarkup = generateFootballTelemetryCardSvg({
      dateStr,
      leagueName,
      leagueCode,
      focusTag,
      headline: title,
      rows: chartRows
    });
    fs.mkdirSync(path.dirname(absCardPath), { recursive: true });
    fs.writeFileSync(absCardPath, svgMarkup, "utf8");
    imageSrc = `${FOOTBALL_REPO_RAW_BASE}/${relCardPath}`;
  } catch (err) {
    console.warn(`Warning: Could not write Football telemetry SVG card: ${err.message}`);
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

  // Compute top geopolitical zone by average primary score
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
  const repoRoot = path.dirname(path.resolve(queuePath));

  const prefixMap = {
    governancescore: "scored-gov",
    footballtally: "scored-ftb",
    policingintel: "scored-pol"
  };
  const prefix = prefixMap[vertical] || `scored-${vertical}`;
  const runDate = selection.run_date_utc || metrics.run_date_utc || new Date().toISOString().slice(0, 10);
  const angleId = selection.selected_angle_id || "01";
  const dailySlotId = `${prefix}-${runDate}`;

  const existingList = Array.isArray(existingQueue)
    ? existingQueue
    : Array.isArray(existingQueue.newsReports)
    ? existingQueue.newsReports
    : Array.isArray(existingQueue.items)
    ? existingQueue.items
    : [];

  const alreadyPublishedToday = existingList.find(
    (item) =>
      item &&
      String(item.vertical || "").toLowerCase() === vertical &&
      item.published === true &&
      (item.id === dailySlotId ||
        String(item.id || "").startsWith(`${dailySlotId}-`) ||
        item.run_date_utc === runDate ||
        item.published_utc_date === runDate)
  );

  if (alreadyPublishedToday) {
    return {
      status: "SKIPPED_ALREADY_PUBLISHED_TODAY",
      run_date_utc: runDate,
      vertical,
      existing_id: alreadyPublishedToday.id
    };
  }

  const draft = buildStoryDraft(vertical, selection, metrics, repoRoot);
  const socialExcerpt = buildSocialExcerpt({
    vertical,
    title: draft.title,
    summary: draft.summary,
    url: DIPLOMAN_TIMES_URL
  });

  const entry = {
    type: "scored_brief",
    id: dailySlotId,
    run_date_utc: runDate,
    published: false,
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
    story_body: draft.storyBody,
    queued_at_utc: new Date().toISOString()
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
    status: "QUEUED",
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

module.exports = { queueScoredBrief, buildSocialExcerpt };
