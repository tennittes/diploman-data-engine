// scripts/extract_summary_from_master.js — Normalizes Live Diploman Schemas Into state/<vertical>/daily_metrics_summary.json
const fs = require("fs");
const path = require("path");
const { resolveContractPath } = require("./validate_inputs");

const CANONICAL_ENTITIES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi",
  "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

const ALIAS_MAP = {
  "federal capital territory": "FCT",
  "abuja-fct": "FCT",
  "abuja fct": "FCT",
  "abuja": "FCT",
  "fct abuja": "FCT",
  "akwa-ibom": "Akwa Ibom",
  "cross-river": "Cross River"
};

const ZONE_MAP = {
  Abia: "SE", Adamawa: "NE", "Akwa Ibom": "SS", Anambra: "SE", Bauchi: "NE",
  Bayelsa: "SS", Benue: "NC", Borno: "NE", "Cross River": "SS", Delta: "SS",
  Ebonyi: "SE", Edo: "SS", Ekiti: "SW", Enugu: "SE", FCT: "NC",
  "Federal Capital Territory": "NC", Gombe: "NE", Imo: "SE", Jigawa: "NW",
  Kaduna: "NW", Kano: "NW", Katsina: "NW", Kebbi: "NW", Kogi: "NC",
  Kwara: "NC", Lagos: "SW", Nasarawa: "NC", Niger: "NC", Ogun: "SW",
  Ondo: "SW", Osun: "SW", Oyo: "SW", Plateau: "NC", Rivers: "SS",
  Sokoto: "NW", Taraba: "NE", Yobe: "NE", Zamfara: "NW"
};

const LEAGUE_FILE_MAP = [
  { code: "BL1", name: "Bundesliga", file: "bl1-matches.json" },
  { code: "BSA", name: "Campeonato Brasileiro Serie A", file: "bsa-matches.json" },
  { code: "DED", name: "Eredivisie", file: "ded-matches.json" },
  { code: "FL1", name: "Ligue 1", file: "fl1-matches.json" },
  { code: "PD", name: "La Liga", file: "pd-matches.json" },
  { code: "PL", name: "Premier League", file: "pl-matches.json" },
  { code: "PPL", name: "Primeira Liga", file: "ppl-matches.json" },
  { code: "SA", name: "Serie A", file: "sa-matches.json" }
];

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function toNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function cleanEntityName(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/\s+State$/i, "")
    .replace(/\s+Command$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const lower = cleaned.toLowerCase();
  if (ALIAS_MAP[lower]) return ALIAS_MAP[lower];

  const exact = CANONICAL_ENTITIES.find((e) => e.toLowerCase() === lower);
  if (exact) return exact;

  const prefixMatch = CANONICAL_ENTITIES.find(
    (e) => e.length >= 4 && lower.startsWith(e.toLowerCase() + " ")
  );
  return prefixMatch || null;
}

function parseDisplayDateToIso(displayDate, fallbackIso) {
  if (!displayDate || typeof displayDate !== "string") return fallbackIso;
  const parsed = new Date(`${displayDate} UTC`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return fallbackIso;
}

function extractRecordsArray(master, vertical) {
  if (Array.isArray(master)) return master;
  if (vertical === "governancescore") {
    return (
      master.globalCodeData_B1 ||
      (master.governance && (master.governance.jurisdictions || master.governance.states)) ||
      master.jurisdictions ||
      master.states ||
      []
    );
  }
  if (vertical === "policingintel") {
    return (
      master.globalCodeData_B4 ||
      (master.policing && (master.policing.jurisdictions || master.policing.commands)) ||
      master.jurisdictions ||
      master.commands ||
      []
    );
  }
  return master.leagues || master.standings || [];
}

function buildJurisdictionSummary(vertical, runDateUtc, master, contract) {
  const rawList = extractRecordsArray(master, vertical);
  const isPolicing = vertical === "policingintel";
  const primaryKey = isPolicing ? "SPS" : "PSI";
  const secondaryKey = isPolicing ? "JTI" : "SIS";
  const breakoutThresh =
    (contract.metrics && contract.metrics.primary && contract.metrics.primary.breakout_delta_threshold) || 1.5;
  const deficitThresh =
    (contract.metrics && contract.metrics.primary && contract.metrics.primary.deficit_delta_threshold) || -1.0;

  // Determine latest dayNumber present in rawList so we build a clean 37-jurisdiction snapshot
  const maxDayNum = rawList.reduce((acc, item) => Math.max(acc, toNum(item.dayNumber, 0)), 0);
  const latestRows = maxDayNum > 0 ? rawList.filter((item) => toNum(item.dayNumber, 0) === maxDayNum) : rawList;
  const priorRows = maxDayNum > 1 ? rawList.filter((item) => toNum(item.dayNumber, 0) === maxDayNum - 1) : [];

  const priorByEntity = new Map();
  for (const p of priorRows) {
    const pName = cleanEntityName(p.stateName || p.state || p.command || p.stateKey);
    if (!pName) continue;
    const pScore = isPolicing
      ? toNum(p.metrics && p.metrics.sps, 0)
      : toNum(p.psi ?? p.PSI, 0);
    const pSec = isPolicing
      ? toNum(p.metrics && p.metrics.jti, 0)
      : toNum(p.sis ?? p.SIS, 0);
    priorByEntity.set(pName, { primary: pScore, secondary: pSec });
  }

  // Deduplicate by canonical entity (keeping highest primary score if duplicate aliases appear)
  const dedupMap = new Map();
  for (const item of latestRows) {
    const rawCandidate = item.stateName || item.state || item.stateKey || item.command;
    const entity = cleanEntityName(rawCandidate);
    if (!entity) continue;

    const zone = item.zone || ZONE_MAP[entity] || ZONE_MAP[item.stateName] || "NC";
    const m = item.metrics || {};

    const PRI = toNum(m.pri ?? item.PRI, 5.8);
    const CDI = toNum(m.cdi ?? item.CDI, 5.8);
    const RPI = toNum(m.rpiScore ?? m.rpi ?? item.RPI, 5.8);
    const CCI = toNum(m.cciScore ?? m.cci ?? item.CCI, 5.8);

    const computedSps = round2(PRI * 0.35 + CDI * 0.40 + RPI * 0.25);
    const primaryScore = isPolicing
      ? toNum(m.sps ?? item.SPS, computedSps)
      : toNum(item.psi ?? item.PSI ?? item.score, 6.0);

    const prior = priorByEntity.get(entity);
    const primaryDelta =
      item[`${primaryKey}_delta`] !== undefined
        ? toNum(item[`${primaryKey}_delta`], 0)
        : prior
        ? round2(primaryScore - prior.primary)
        : 0;

    const secondaryScore = isPolicing
      ? toNum(m.jti ?? item.JTI, 3.2)
      : toNum(item.sis ?? item.SIS, 2.2);

    const secondaryDelta =
      item[`${secondaryKey}_delta`] !== undefined
        ? toNum(item[`${secondaryKey}_delta`], 0)
        : prior
        ? round2(secondaryScore - prior.secondary)
        : 0;

    const row = isPolicing
      ? {
          entity,
          zone,
          command: item.command || `${entity} State Police Command`,
          headline: item.headline || "",
          PRI,
          CDI,
          RPI,
          CCI,
          SPS: primaryScore,
          SPS_delta: primaryDelta,
          JTI: secondaryScore,
          JTI_delta: secondaryDelta
        }
      : {
          entity,
          zone,
          headline: item.headline || "",
          PSI: primaryScore,
          PSI_delta: primaryDelta,
          SIS: secondaryScore,
          SIS_delta: secondaryDelta
        };

    if (!dedupMap.has(entity) || row[primaryKey] > dedupMap.get(entity)[primaryKey]) {
      dedupMap.set(entity, row);
    }
  }

  // Ensure all 37 canonical jurisdictions from contract/master set are present
  const expectedEntities =
    (contract.coverage && Array.isArray(contract.coverage.entities) && contract.coverage.entities.length === 37)
      ? contract.coverage.entities
      : CANONICAL_ENTITIES;

  for (const rawEnt of expectedEntities) {
    const ent = cleanEntityName(rawEnt) || rawEnt;
    if (!dedupMap.has(ent)) {
      dedupMap.set(
        ent,
        isPolicing
          ? {
              entity: ent,
              zone: ZONE_MAP[ent] || "NC",
              command: `${ent} State Police Command`,
              headline: "",
              PRI: 5.8,
              CDI: 5.8,
              RPI: 5.8,
              CCI: 5.8,
              SPS: 5.8,
              SPS_delta: 0,
              JTI: 3.2,
              JTI_delta: 0
            }
          : {
              entity: ent,
              zone: ZONE_MAP[ent] || "NC",
              headline: "",
              PSI: 6.0,
              PSI_delta: 0,
              SIS: 2.2,
              SIS_delta: 0
            }
      );
    }
  }

  // Strictly retain only the 37 canonical entities
  const canonicalSet = new Set(expectedEntities.map((e) => cleanEntityName(e) || e));
  const normalized = Array.from(dedupMap.values()).filter((r) => canonicalSet.has(r.entity));

  const byPrimary = normalized.slice().sort((a, b) => b[primaryKey] - a[primaryKey]);
  const bySecondary = normalized.slice().sort((a, b) =>
    isPolicing ? b[secondaryKey] - a[secondaryKey] : a[secondaryKey] - b[secondaryKey]
  );

  const deltas = normalized.map((r) => r[`${primaryKey}_delta`]);
  const maxPositiveDelta = deltas.length ? Math.max(...deltas) : 0;
  const maxNegativeDelta = deltas.length ? Math.min(...deltas) : 0;

  const topPrimary = byPrimary[0] || { entity: "Lagos", [primaryKey]: 6.0 };
  const thirdPrimary = byPrimary[2] || topPrimary;
  const topMargin = round2(topPrimary[primaryKey] - thirdPrimary[primaryKey]);

  const zoneCounts = {};
  for (const r of normalized) {
    if (r[`${primaryKey}_delta`] >= 0.3) {
      zoneCounts[r.zone] = (zoneCounts[r.zone] || 0) + 1;
    }
  }
  const maxZoneClusterCount = Object.values(zoneCounts).length
    ? Math.max(...Object.values(zoneCounts))
    : 0;

  const topWatchSlice = bySecondary.slice(0, 3);
  const flatTopWatchCount = topWatchSlice.filter((r) => r[`${secondaryKey}_delta`] === 0).length;

  const top3PrimaryNames = new Set(byPrimary.slice(0, 3).map((r) => r.entity));
  const top3SecondaryNames = new Set(topWatchSlice.map((r) => r.entity));
  const hasDualTopTier = !isPolicing && Array.from(top3PrimaryNames).some((e) => top3SecondaryNames.has(e));

  const latestDisplayDate = latestRows[0] && latestRows[0].displayDate;
  const resolvedDate = master.run_date_utc || parseDisplayDateToIso(latestDisplayDate, runDateUtc);

  return {
    schema_version: "1.0.0",
    run_date_utc: resolvedDate,
    vertical,
    jurisdiction_count: normalized.length,
    top_primary_entity: topPrimary.entity,
    top_primary_score: topPrimary[primaryKey],
    maxPositiveDelta,
    maxNegativeDelta,
    flatTopWatchCount,
    hasPostSpikeReversion: false,
    creepStreakDays: maxDayNum > 0 ? Math.min(maxDayNum, 5) : 1,
    hasPrimarySecondarySplit: isPolicing
      ? topWatchSlice.some((w) => w[secondaryKey] >= 4.5) && maxPositiveDelta >= breakoutThresh
      : byPrimary.slice(0, 3).some((p) => p[secondaryKey] >= 2.8),
    hasInverseDivergence: false,
    hasThroughputGap: isPolicing,
    hasStabilityLead: !isPolicing && topWatchSlice.length > 0 && topWatchSlice[0][secondaryKey] <= 1.5,
    hasDualTopTier,
    maxZoneClusterCount,
    hasCorridorOrDerbyDriver: isPolicing,
    isTopMarginTight: byPrimary.length >= 3 && topMargin <= 0.3,
    hasBottomTierDrag:
      byPrimary.length >= 3 &&
      byPrimary[byPrimary.length - 1][primaryKey] <= (isPolicing ? 5.5 : 5.4),
    hasTierCrossover: maxPositiveDelta >= breakoutThresh,
    hasFiscalOrFundingTrigger: !isPolicing,
    hasLeadershipOrTacticalShift: false,
    hasAccountabilityOrDisciplineEvent: isPolicing,
    hasExecutionOrSweepMilestone: maxPositiveDelta >= breakoutThresh,
    hasFrictionOrLateShock: maxNegativeDelta <= deficitThresh,
    hasFiveDayCrossover: maxDayNum >= 5,
    hasMidweekShift: false,
    leaderStreakRuns: 1,
    leaders: {
      primary_top3: byPrimary.slice(0, 3).map((r) => ({
        entity: r.entity,
        zone: r.zone,
        score: r[primaryKey],
        delta: r[`${primaryKey}_delta`]
      })),
      [isPolicing ? "secondary_top_watch" : "secondary_top3"]: topWatchSlice.map((r) => ({
        entity: r.entity,
        zone: r.zone,
        score: r[secondaryKey],
        delta: r[`${secondaryKey}_delta`]
      }))
    },
    jurisdictions: byPrimary
  };
}

function computeLeagueStandingsFromMatches(matches) {
  const clubStats = new Map();

  const ensureClub = (club) => {
    if (!clubStats.has(club)) {
      clubStats.set(club, { club, code: club.slice(0, 3).toUpperCase(), dft_pts: 0, std_pts: 0 });
    }
    return clubStats.get(club);
  };

  for (const m of matches) {
    const home = m.home || "Home";
    const away = m.away || "Away";
    const hStat = ensureClub(home);
    const aStat = ensureClub(away);

    const hs = toNum(m.home_score, 0);
    const as = toNum(m.away_score, 0);
    const h1h = toNum(m.h1_home, 0);
    const h1a = toNum(m.h1_away, 0);
    const h2h = toNum(m.h2_home, 0);
    const h2a = toNum(m.h2_away, 0);

    // STD (3-1-0 full-time)
    if (hs > as) hStat.std_pts += 3;
    else if (as > hs) aStat.std_pts += 3;
    else {
      hStat.std_pts += 1;
      aStat.std_pts += 1;
    }

    // DFT (1 pt per half won + 1 bonus pt for winning both halves)
    let hWins = 0;
    let aWins = 0;
    if (h1h > h1a) { hStat.dft_pts += 1; hWins += 1; }
    else if (h1a > h1h) { aStat.dft_pts += 1; aWins += 1; }

    if (h2h > h2a) { hStat.dft_pts += 1; hWins += 1; }
    else if (h2a > h2h) { aStat.dft_pts += 1; aWins += 1; }

    if (hWins === 2) hStat.dft_pts += 1;
    if (aWins === 2) aStat.dft_pts += 1;
  }

  return Array.from(clubStats.values());
}

function buildFootballSummary(runDateUtc, dataDir) {
  const leagueSummaries = [];
  let latestMatchIso = runDateUtc;

  for (const lg of LEAGUE_FILE_MAP) {
    const matchFile = path.join(dataDir, lg.file);
    const matches = loadJson(matchFile, []);
    if (Array.isArray(matches) && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch && lastMatch.utcDate && lastMatch.utcDate.slice(0, 10) > latestMatchIso) {
        latestMatchIso = lastMatch.utcDate.slice(0, 10);
      }
    }

    const clubs = computeLeagueStandingsFromMatches(Array.isArray(matches) ? matches : []);
    const byDft = clubs.slice().sort((a, b) => b.dft_pts - a.dft_pts || b.std_pts - a.std_pts);
    const byStd = clubs.slice().sort((a, b) => b.std_pts - a.std_pts || b.dft_pts - a.dft_pts);

    const topDft = byDft[0] || { club: "Leader", dft_pts: 0 };
    const topStd = byStd[0] || { club: "Leader", std_pts: 0 };

    leagueSummaries.push({
      code: lg.code,
      name: lg.name,
      dft_leader: topDft.club,
      dft_leader_pts: topDft.dft_pts,
      std_leader: topStd.club,
      std_leader_pts: topStd.std_pts,
      dft_top3: byDft.slice(0, 3),
      dft_bottom3: byDft.slice(-3).reverse(),
      std_top3: byStd.slice(0, 3),
      std_bottom3: byStd.slice(-3).reverse()
    });
  }

  const active = leagueSummaries.find((l) => l.code === "PL") || leagueSummaries[0] || {
    code: "PL",
    name: "Premier League",
    dft_leader: "Leader",
    dft_leader_pts: 0,
    std_leader: "Leader",
    std_leader_pts: 0,
    dft_top3: [],
    dft_bottom3: [],
    std_top3: [],
    std_bottom3: []
  };

  return {
    schema_version: "1.0.0",
    run_date_utc: runDateUtc,
    latest_match_date_utc: latestMatchIso,
    vertical: "footballtally",
    tracked_league_count: leagueSummaries.length,
    active_league_code: active.code,
    active_league_name: active.name,
    top_primary_entity: active.dft_leader,
    top_primary_score: active.dft_leader_pts,
    maxPositiveDelta: 3,
    maxNegativeDelta: 0,
    flatTopWatchCount: 0,
    hasPostSpikeReversion: false,
    creepStreakDays: 2,
    hasPrimarySecondarySplit: active.dft_leader !== active.std_leader,
    hasInverseDivergence: active.dft_leader !== active.std_leader,
    hasThroughputGap: false,
    hasStabilityLead: false,
    hasDualTopTier: active.dft_leader === active.std_leader,
    maxZoneClusterCount: 3,
    hasCorridorOrDerbyDriver: false,
    isTopMarginTight:
      active.dft_top3.length >= 3 && active.dft_top3[0].dft_pts - active.dft_top3[2].dft_pts <= 2,
    hasBottomTierDrag: active.dft_bottom3.length > 0 && active.dft_bottom3[0].dft_pts <= 3,
    hasTierCrossover: true,
    hasFiscalOrFundingTrigger: false,
    hasLeadershipOrTacticalShift: false,
    hasAccountabilityOrDisciplineEvent: false,
    hasExecutionOrSweepMilestone: true,
    hasFrictionOrLateShock: false,
    hasFiveDayCrossover: false,
    hasMidweekShift: false,
    leaderStreakRuns: 1,
    active_league_standings: {
      dft_top3: active.dft_top3,
      dft_bottom3: active.dft_bottom3,
      std_top3: active.std_top3,
      std_bottom3: active.std_bottom3
    },
    leagues: leagueSummaries.map((l) => ({
      code: l.code,
      name: l.name,
      dft_leader: l.dft_leader,
      dft_leader_pts: l.dft_leader_pts,
      std_leader: l.std_leader,
      std_leader_pts: l.std_leader_pts
    }))
  };
}

function extractSummaryFromMaster({ vertical, runDateUtc, masterPath, dataDir, contractPath, outputPath }) {
  const contract = loadJson(contractPath, {});
  let summary;

  if (vertical === "footballtally") {
    summary = buildFootballSummary(runDateUtc, dataDir || "data");
  } else {
    const master = loadJson(masterPath, null);
    if (!master) {
      throw new Error(`Missing master data file at: ${masterPath}`);
    }
    summary = buildJurisdictionSummary(vertical, runDateUtc, master, contract);
  }

  saveJson(outputPath, summary);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  try {
    const vertical = getArg("--vertical", "governancescore");
    const runDateUtc = getArg("--date", new Date().toISOString().slice(0, 10));
    const defaultMaster =
      vertical === "policingintel"
        ? path.join("nov2026", "master-data.json")
        : path.join("nov2026", "master-data.json");
    const masterPath = getArg("--master", defaultMaster);
    const dataDir = getArg("--data-dir", "data");
    const contractPath = resolveContractPath(vertical, getArg("--contract", ""));
    const outputPath = getArg("--out", path.join("state", vertical, "daily_metrics_summary.json"));

    const summary = extractSummaryFromMaster({
      vertical,
      runDateUtc,
      masterPath,
      dataDir,
      contractPath,
      outputPath
    });

    console.log(
      JSON.stringify(
        {
          status: "EXTRACTED",
          vertical: summary.vertical,
          run_date_utc: summary.run_date_utc,
          top_primary_entity: summary.top_primary_entity,
          top_primary_score: summary.top_primary_score
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { extractSummaryFromMaster };
