// scripts/extract_summary_from_master.js — Normalizes master-data.json Into state/<vertical>/daily_metrics_summary.json
const fs = require("fs");
const path = require("path");
const { resolveContractPath } = require("./validate_inputs");

const ZONE_MAP = {
  Abia: "SE", Adamawa: "NE", "Akwa Ibom": "SS", Anambra: "SE", Bauchi: "NE",
  Bayelsa: "SS", Benue: "NC", Borno: "NE", "Cross River": "SS", Delta: "SS",
  Ebonyi: "SE", Edo: "SS", Ekiti: "SW", Enugu: "SE", FCT: "NC",
  Gombe: "NE", Imo: "SE", Jigawa: "NW", Kaduna: "NW", Kano: "NW",
  Katsina: "NW", Kebbi: "NW", Kogi: "NC", Kwara: "NC", Lagos: "SW",
  Nasarawa: "NC", Niger: "NC", Ogun: "SW", Ondo: "SW", Osun: "SW",
  Oyo: "SW", Plateau: "NC", Rivers: "SS", Sokoto: "NW", Taraba: "NE",
  Yobe: "NE", Zamfara: "NW"
};

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

function extractRecordsArray(master, vertical) {
  if (Array.isArray(master)) return master;
  if (vertical === "governancescore") {
    return (
      (master.governance && (master.governance.jurisdictions || master.governance.states)) ||
      master.jurisdictions ||
      master.states ||
      master.rows ||
      []
    );
  }
  if (vertical === "policingintel") {
    return (
      (master.policing && (master.policing.jurisdictions || master.policing.commands)) ||
      master.jurisdictions ||
      master.commands ||
      master.rows ||
      []
    );
  }
  return (
    (master.football && (master.football.leagues || master.football.standings)) ||
    master.leagues ||
    master.standings ||
    master.rows ||
    []
  );
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

  const normalized = rawList.map((item) => {
    const entity = item.entity || item.state || item.command || item.jurisdiction || item.name || "Unknown";
    const zone = item.zone || ZONE_MAP[entity] || "NC";

    const PRI = toNum(item.PRI ?? item.pri, 5.8);
    const CDI = toNum(item.CDI ?? item.cdi, 5.8);
    const RPI = toNum(item.RPI ?? item.rpi, 5.8);
    const CCI = toNum(item.CCI ?? item.cci, 5.8);

    const computedSps = round2(PRI * 0.35 + CDI * 0.40 + RPI * 0.25);
    const primaryScore = toNum(item[primaryKey] ?? item[primaryKey.toLowerCase()] ?? item.score, isPolicing ? computedSps : 6.0);
    const primaryDelta = toNum(
      item[`${primaryKey}_delta`] ?? item[`${primaryKey.toLowerCase()}_delta`] ?? item.delta,
      0
    );

    const secondaryScore = toNum(item[secondaryKey] ?? item[secondaryKey.toLowerCase()], isPolicing ? 3.2 : 2.2);
    const secondaryDelta = toNum(
      item[`${secondaryKey}_delta`] ?? item[`${secondaryKey.toLowerCase()}_delta`],
      0
    );

    const baseRow = {
      entity,
      zone,
      [primaryKey]: primaryScore,
      [`${primaryKey}_delta`]: primaryDelta,
      [secondaryKey]: secondaryScore,
      [`${secondaryKey}_delta`]: secondaryDelta
    };

    if (isPolicing) {
      return { entity, zone, PRI, CDI, RPI, CCI, ...baseRow };
    }
    return baseRow;
  });

  // Sort descending by primary score (SPS or PSI)
  const byPrimary = normalized.slice().sort((a, b) => b[primaryKey] - a[primaryKey]);

  // For secondary metric: policing watches highest JTI threat; governance ranks lowest SIS friction
  const bySecondary = normalized.slice().sort((a, b) =>
    isPolicing ? b[secondaryKey] - a[secondaryKey] : a[secondaryKey] - b[secondaryKey]
  );

  const deltas = normalized.map((r) => r[`${primaryKey}_delta`]);
  const maxPositiveDelta = deltas.length ? Math.max(...deltas) : 0;
  const maxNegativeDelta = deltas.length ? Math.min(...deltas) : 0;

  const topPrimary = byPrimary[0] || { entity: "Lagos", [primaryKey]: 6.0 };
  const thirdPrimary = byPrimary[2] || topPrimary;
  const topMargin = round2(topPrimary[primaryKey] - thirdPrimary[primaryKey]);

  // Zonal surge clustering (states with positive delta >= 0.3 grouped by geopolitical zone)
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

  const metaFlags = master.flags || {};

  return {
    schema_version: "1.0.0",
    run_date_utc: runDateUtc,
    vertical,
    jurisdiction_count: normalized.length,
    top_primary_entity: topPrimary.entity,
    top_primary_score: topPrimary[primaryKey],
    maxPositiveDelta,
    maxNegativeDelta,
    flatTopWatchCount,
    hasPostSpikeReversion: Boolean(metaFlags.hasPostSpikeReversion),
    creepStreakDays: toNum(metaFlags.creepStreakDays, 1),
    hasPrimarySecondarySplit: isPolicing
      ? topWatchSlice.some((w) => w[secondaryKey] >= 4.5) && maxPositiveDelta >= breakoutThresh
      : byPrimary.slice(0, 3).some((p) => p[secondaryKey] >= 2.8),
    hasInverseDivergence: Boolean(metaFlags.hasInverseDivergence),
    hasThroughputGap: Boolean(metaFlags.hasThroughputGap ?? isPolicing),
    hasStabilityLead: !isPolicing && topWatchSlice.length > 0 && topWatchSlice[0][secondaryKey] <= 1.5,
    hasDualTopTier,
    maxZoneClusterCount,
    hasCorridorOrDerbyDriver: Boolean(metaFlags.hasCorridorOrDerbyDriver),
    isTopMarginTight: byPrimary.length >= 3 && topMargin <= 0.3,
    hasBottomTierDrag:
      byPrimary.length >= 3 &&
      byPrimary[byPrimary.length - 1][primaryKey] <= (isPolicing ? 5.5 : 5.4),
    hasTierCrossover: maxPositiveDelta >= breakoutThresh,
    hasFiscalOrFundingTrigger: Boolean(metaFlags.hasFiscalOrFundingTrigger),
    hasLeadershipOrTacticalShift: Boolean(metaFlags.hasLeadershipOrTacticalShift),
    hasAccountabilityOrDisciplineEvent: Boolean(metaFlags.hasAccountabilityOrDisciplineEvent),
    hasExecutionOrSweepMilestone: maxPositiveDelta >= breakoutThresh || Boolean(metaFlags.hasExecutionOrSweepMilestone),
    hasFrictionOrLateShock: maxNegativeDelta <= deficitThresh || Boolean(metaFlags.hasFrictionOrLateShock),
    hasFiveDayCrossover: Boolean(metaFlags.hasFiveDayCrossover),
    hasMidweekShift: Boolean(metaFlags.hasMidweekShift),
    leaderStreakRuns: toNum(metaFlags.leaderStreakRuns, 1),
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

function buildFootballSummary(runDateUtc, master, contract) {
  const leaguesRaw = extractRecordsArray(master, "footballtally");
  const activeCode =
    master.active_league_code ||
    (leaguesRaw[0] && (leaguesRaw[0].code || leaguesRaw[0].league_code)) ||
    "PL";

  const activeLeagueObj =
    leaguesRaw.find((l) => (l.code || l.league_code) === activeCode) || leaguesRaw[0] || {};
  const standings = Array.isArray(activeLeagueObj.table || activeLeagueObj.standings || master.standings)
    ? activeLeagueObj.table || activeLeagueObj.standings || master.standings
    : [];

  const normClubs = standings.map((c) => ({
    code: c.code || String(c.club || c.team || "CLB").slice(0, 3).toUpperCase(),
    club: c.club || c.team || c.entity || "Unknown Club",
    dft_pts: toNum(c.dft_pts ?? c.DFT ?? c.dft, 0),
    std_pts: toNum(c.std_pts ?? c.STD ?? c.std, 0),
    dft_delta: toNum(c.dft_delta ?? c.delta, 0)
  }));

  const byDft = normClubs.slice().sort((a, b) => b.dft_pts - a.dft_pts || b.std_pts - a.std_pts);
  const byStd = normClubs.slice().sort((a, b) => b.std_pts - a.std_pts || b.dft_pts - a.dft_pts);

  const dftTop3 = byDft.slice(0, 3);
  const dftBottom3 = byDft.slice(-3).reverse();
  const stdTop3 = byStd.slice(0, 3);
  const stdBottom3 = byStd.slice(-3).reverse();

  const topDftClub = dftTop3[0] || {
    club: activeLeagueObj.dft_leader || "Brighton Hove",
    dft_pts: toNum(activeLeagueObj.dft_leader_pts, 15)
  };
  const topStdClub = stdTop3[0] || {
    club: activeLeagueObj.std_leader || "Arsenal",
    std_pts: toNum(activeLeagueObj.std_leader_pts, 27)
  };

  const deltas = normClubs.map((c) => c.dft_delta);
  const metaFlags = master.flags || {};

  return {
    schema_version: "1.0.0",
    run_date_utc: runDateUtc,
    vertical: "footballtally",
    tracked_league_count: leaguesRaw.length || 8,
    active_league_code: activeCode,
    active_league_name: activeLeagueObj.name || activeLeagueObj.league_name || "Premier League",
    top_primary_entity: topDftClub.club,
    top_primary_score: topDftClub.dft_pts,
    maxPositiveDelta: deltas.length ? Math.max(...deltas) : 3,
    maxNegativeDelta: deltas.length ? Math.min(...deltas) : 0,
    flatTopWatchCount: normClubs.filter((c) => c.dft_delta === 0).length,
    hasPostSpikeReversion: Boolean(metaFlags.hasPostSpikeReversion),
    creepStreakDays: toNum(metaFlags.creepStreakDays, 2),
    hasPrimarySecondarySplit: topDftClub.club !== topStdClub.club,
    hasInverseDivergence: topDftClub.club !== topStdClub.club,
    hasThroughputGap: Boolean(metaFlags.hasThroughputGap),
    hasStabilityLead: Boolean(metaFlags.hasStabilityLead),
    hasDualTopTier: topDftClub.club === topStdClub.club,
    maxZoneClusterCount: toNum(metaFlags.maxZoneClusterCount, 3),
    hasCorridorOrDerbyDriver: Boolean(metaFlags.hasCorridorOrDerbyDriver),
    isTopMarginTight: dftTop3.length >= 3 && dftTop3[0].dft_pts - dftTop3[2].dft_pts <= 2,
    hasBottomTierDrag: dftBottom3.length > 0 && dftBottom3[0].dft_pts <= 3,
    hasTierCrossover: Boolean(metaFlags.hasTierCrossover ?? true),
    hasFiscalOrFundingTrigger: false,
    hasLeadershipOrTacticalShift: Boolean(metaFlags.hasLeadershipOrTacticalShift),
    hasAccountabilityOrDisciplineEvent: Boolean(metaFlags.hasAccountabilityOrDisciplineEvent),
    hasExecutionOrSweepMilestone: (deltas.length ? Math.max(...deltas) : 3) >= 3,
    hasFrictionOrLateShock: Boolean(metaFlags.hasFrictionOrLateShock),
    hasFiveDayCrossover: Boolean(metaFlags.hasFiveDayCrossover),
    hasMidweekShift: Boolean(metaFlags.hasMidweekShift),
    leaderStreakRuns: toNum(metaFlags.leaderStreakRuns, 1),
    active_league_standings: {
      dft_top3: dftTop3,
      dft_bottom3: dftBottom3,
      std_top3: stdTop3,
      std_bottom3: stdBottom3
    },
    leagues: leaguesRaw.map((l) => ({
      code: l.code || l.league_code,
      name: l.name || l.league_name,
      dft_leader: l.dft_leader || topDftClub.club,
      dft_leader_pts: toNum(l.dft_leader_pts, topDftClub.dft_pts),
      std_leader: l.std_leader || topStdClub.club,
      std_leader_pts: toNum(l.std_leader_pts, topStdClub.std_pts)
    }))
  };
}

function extractSummaryFromMaster({ vertical, runDateUtc, masterPath, contractPath, outputPath }) {
  const master = loadJson(masterPath, null);
  if (!master) {
    throw new Error(`Missing master data file at: ${masterPath}`);
  }
  const contract = loadJson(contractPath, {});
  const resolvedDate = master.run_date_utc || runDateUtc;

  const summary =
    vertical === "footballtally"
      ? buildFootballSummary(resolvedDate, master, contract)
      : buildJurisdictionSummary(vertical, resolvedDate, master, contract);

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
    const masterPath = getArg("--master", "master-data.json");
    const contractPath = resolveContractPath(vertical, getArg("--contract", ""));
    const outputPath = getArg("--out", path.join("state", vertical, "daily_metrics_summary.json"));

    const summary = extractSummaryFromMaster({
      vertical,
      runDateUtc,
      masterPath,
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
