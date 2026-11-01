const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const DATA_DIR = path.join(__dirname, '../data');

const LEAGUES = {
  PL: 2021,  // Premier League
  PD: 2014,  // La Liga
  BL1: 2002, // Bundesliga
  SA: 2019,  // Serie A
  FL1: 2015, // Ligue 1
  DED: 2003, // Eredivisie
  PPL: 2017, // Primeira Liga
  BSA: 2013  // Brasileirão
};

// Delay helper to prevent Football-Data.org rate limits (10 requests/min max on free tier)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAndCalculateDFS(leagueCode, competitionId) {
  try {
    const response = await axios.get(`https://api.football-data.org/v4/competitions/${competitionId}/matches`, {
      headers: { 'a79fe1103d1346e9954ca7369cbbaf79': API_KEY }
    });

    const matches = response.data.matches.filter(m => m.status === 'FINISHED');
    const dfsStats = {};
    const plStats = {};

    matches.forEach(match => {
      const home = match.homeTeam.name;
      const away = match.awayTeam.name;

      // Extract raw goals
      const h1H = match.score.halfTime.home || 0;
      const a1H = match.score.halfTime.away || 0;
      const hFT = match.score.fullTime.home || 0;
      const aFT = match.score.fullTime.away || 0;

      // Calculate 2nd half goals
      const h2H = hFT - h1H;
      const a2H = aFT - a1H;

      // Initialize team stats if not present
      [home, away].forEach(team => {
        if (!dfsStats[team]) {
          dfsStats[team] = { team, matches: 0, hw: 0, hd: 0, hl: 0, gs: 0, ga: 0, pts: 0 };
          plStats[team] = { team, mp: 0, mw: 0, md: 0, ml: 0, gs: 0, ga: 0, pts: 0 };
        }
      });

      // Update match counts & goal totals
      dfsStats[home].matches += 1; dfsStats[away].matches += 1;
      dfsStats[home].gs += hFT; dfsStats[home].ga += aFT;
      dfsStats[away].gs += aFT; dfsStats[away].ga += hFT;

      plStats[home].mp += 1; plStats[away].mp += 1;
      plStats[home].gs += hFT; plStats[home].ga += aFT;
      plStats[away].gs += aFT; plStats[away].ga += hFT;

      // --- 1. DFS CARDINAL RULES ---
      const home1HWin = h1H > a1H, away1HWin = a1H > h1H;
      const home2HWin = h2H > a2H, away2HWin = a2H > h2H;

      // First Half
      if (home1HWin) { dfsStats[home].hw++; dfsStats[away].hl++; dfsStats[home].pts += 1; }
      else if (away1HWin) { dfsStats[away].hw++; dfsStats[home].hl++; dfsStats[away].pts += 1; }
      else { dfsStats[home].hd++; dfsStats[away].hd++; } // Draw = 0 pts

      // Second Half
      if (home2HWin) { dfsStats[home].hw++; dfsStats[away].hl++; dfsStats[home].pts += 1; }
      else if (away2HWin) { dfsStats[away].hw++; dfsStats[home].hl++; dfsStats[away].pts += 1; }
      else { dfsStats[home].hd++; dfsStats[away].hd++; } // Draw = 0 pts

      // Sweep Bonus Rule (Won both halves)
      if (home1HWin && home2HWin) dfsStats[home].pts += 1;
      if (away1HWin && away2HWin) dfsStats[away].pts += 1;

      // --- 2. CONVENTIONAL TABLE RULES ---
      if (hFT > aFT) { plStats[home].mw++; plStats[away].ml++; plStats[home].pts += 3; }
      else if (aFT > hFT) { plStats[away].mw++; plStats[home].ml++; plStats[away].pts += 3; }
      else { plStats[home].md++; plStats[away].md++; plStats[home].pts += 1; plStats[away].pts += 1; }
    });

    // Format & Sort DFS Table
    const dfsTable = Object.values(dfsStats).map(t => ({
      ...t,
      gg: t.gs - t.ga
    })).sort((a, b) => b.pts - a.pts || b.gg - a.gg || b.gs - a.gs);

    // Format & Sort PL Table
    const plTable = Object.values(plStats).map(t => ({
      ...t,
      gg: t.gs - t.ga
    })).sort((a, b) => b.pts - a.pts || b.gg - a.gg || b.gs - a.gs);

    // Ensure output directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Write JSON outputs
    const code = leagueCode.toLowerCase();
    fs.writeFileSync(path.join(DATA_DIR, `${code}-dfs.json`), JSON.stringify(dfsTable, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, `${code}-pl.json`), JSON.stringify(plTable, null, 2));

    console.log(`[SUCCESS] Output generated for ${leagueCode}`);
  } catch (err) {
    console.error(`[ERROR] Failed processing ${leagueCode}:`, err.response ? err.response.data.message : err.message);
  }
}

// Sequential Execution Loop
async function run() {
  if (!API_KEY) {
    console.error('[CRITICAL] FOOTBALL_DATA_API_KEY environment variable is not set!');
    process.exit(1);
  }

  const entries = Object.entries(LEAGUES);
  for (let i = 0; i < entries.length; i++) {
    const [code, id] = entries[i];
    console.log(`Processing (${i + 1}/${entries.length}): ${code}...`);
    await fetchAndCalculateDFS(code, id);
    
    // Pause for 6 seconds between requests to remain safely within API quotas
    if (i < entries.length - 1) {
      await sleep(6000);
    }
  }
  console.log('[COMPLETE] All league tables updated successfully.');
}

run();
