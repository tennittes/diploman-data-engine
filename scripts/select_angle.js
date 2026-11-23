// scripts/select_angle.js — Deterministic 25-Angle Selector with Contract Integration & Anti-Repetition Guards
const fs = require("fs");
const path = require("path");
const { validateInputs, resolveContractPath } = require("./validate_inputs");

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getDefaultPaths(vertical) {
  const folderMap = {
    governancescore: "governancescore",
    policingintel: "policingintel",
    footballtally: "footballtally"
  };
  const folder = folderMap[vertical] || vertical;
  return {
    contractPath: resolveContractPath(vertical, ""),
    anglesPath: path.join("config", "angles-25-master.json"),
    metricsPath: path.join("state", folder, "daily_metrics_summary.json"),
    historyPath: path.join("state", folder, "angle_history.json"),
    outputPath: path.join("state", folder, "latest_selection.json")
  };
}

function scoreAngle(angle, ctx) {
  const m = ctx.metrics || {};
  const contract = ctx.contract || {};
  const primaryMetric = (contract.metrics && contract.metrics.primary) || {};
  const breakoutThreshold =
    typeof primaryMetric.breakout_delta_threshold === "number"
      ? primaryMetric.breakout_delta_threshold
      : 1.5;
  const deficitThreshold =
    typeof primaryMetric.deficit_delta_threshold === "number"
      ? primaryMetric.deficit_delta_threshold
      : -1.0;

  let score = angle.base_weight || 50;

  // Temporal & Rollover Overrides (UTC)
  if (ctx.isThursdayRollover && angle.id === "23") score += 65;
  if ((ctx.dayOfWeek === 2 || ctx.dayOfWeek === 3) && angle.id === "21" && m.hasFiveDayCrossover) score += 38;
  if ((ctx.dayOfWeek === 2 || ctx.dayOfWeek === 3) && angle.id === "22" && m.hasMidweekShift) score += 32;
  if (ctx.isMonthEnd && angle.id === "25") score += 50;

  // Data-Driven Archetype Triggers
  switch (angle.id) {
    case "01":
      if ((m.maxPositiveDelta || 0) >= breakoutThreshold) score += 42;
      break;
    case "02":
      if ((m.maxNegativeDelta || 0) <= deficitThreshold) score += 36;
      break;
    case "03":
      if ((m.flatTopWatchCount || 0) >= 2) score += 30;
      break;
    case "04":
      if (m.hasPostSpikeReversion) score += 28;
      break;
    case "05":
      if ((m.creepStreakDays || 0) >= 3) score += 27;
      break;
    case "06":
      if (m.hasPrimarySecondarySplit) score += 34;
      break;
    case "07":
      if (m.hasInverseDivergence) score += 31;
      break;
    case "08":
      if (m.hasThroughputGap) score += 29;
      break;
    case "09":
      if (m.hasStabilityLead) score += 25;
      break;
    case "10":
      if (m.hasDualTopTier) score += 35;
      break;
    case "11":
      if ((m.maxZoneClusterCount || 0) >= 3) score += 33;
      break;
    case "12":
      if (m.hasCorridorOrDerbyDriver) score += 26;
      break;
    case "13":
      if (m.isTopMarginTight) score += 25;
      break;
    case "14":
      if (m.hasBottomTierDrag) score += 23;
      break;
    case "15":
      if (m.hasTierCrossover) score += 29;
      break;
    case "16":
      if (m.hasFiscalOrFundingTrigger) score += 28;
      break;
    case "17":
      if (m.hasLeadershipOrTacticalShift) score += 28;
      break;
    case "18":
      if (m.hasAccountabilityOrDisciplineEvent) score += 27;
      break;
    case "19":
      if (m.hasExecutionOrSweepMilestone) score += 29;
      break;
    case "20":
      if (m.hasFrictionOrLateShock) score += 28;
      break;
    case "24":
      if ((m.leaderStreakRuns || 0) >= 4) score += 26;
      break;
    default:
      break;
  }

  // Deterministic tie-breaker per UTC date + vertical + angle ID
  const tieSeed = `${ctx.vertical}:${ctx.runDateUtc}:${angle.id}`;
  const tieHash = Array.from(tieSeed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return score + (tieHash % 10) * 0.1;
}

function selectAngle({
  vertical,
  runDateUtc,
  metrics,
  contract,
  anglesPath,
  historyPath,
  outputPath
}) {
  const validation = validateInputs({ vertical, runDateUtc, metrics, contract });
  if (!validation.valid) {
    throw new Error(`Input validation failed: ${validation.errors.join(" | ")}`);
  }

  const master = loadJson(anglesPath, { default_cooldown_days: 7, angles: [] });
  if (!Array.isArray(master.angles) || master.angles.length === 0) {
    throw new Error(`No angles found in master ruleset at: ${anglesPath}`);
  }

  const history = loadJson(historyPath, {
    schema_version: "1.0.0",
    vertical,
    cooldown_window_runs: master.default_cooldown_days || 7,
    entries: []
  });

  const dt = new Date(`${runDateUtc}T00:00:00Z`);
  const dayOfWeek = dt.getUTCDay(); // 4 = Thursday (00:00 UTC weekly rollover)
  const rolloverDay =
    contract.rollover && typeof contract.rollover.weekly_reset_day_utc === "number"
      ? contract.rollover.weekly_reset_day_utc
      : 4;
  const isThursdayRollover = dayOfWeek === rolloverDay;

  const tomorrow = new Date(dt.getTime() + 86400000);
  const isMonthEnd = tomorrow.getUTCDate() === 1;

  // Exclude same-date retry entry from prior cooldown calculation so retries overwrite cleanly
  const priorEntries = (history.entries || []).filter((e) => e.run_date_utc !== runDateUtc);
  const lastEntry = priorEntries[priorEntries.length - 1] || null;
  const blockedOpeningClass = lastEntry ? lastEntry.opening_class : null;

  const cooldownWindow = history.cooldown_window_runs || master.default_cooldown_days || 7;
  const recentIds = new Set(
    priorEntries.slice(-cooldownWindow).map((e) => String(e.angle_id))
  );

  const ctx = {
    vertical,
    runDateUtc,
    dayOfWeek,
    isThursdayRollover,
    isMonthEnd,
    metrics,
    contract
  };

  let candidates = master.angles.filter((a) => {
    const id = String(a.id);
    if (recentIds.has(id)) return false;
    if (blockedOpeningClass && a.opening_class === blockedOpeningClass) return false;
    return true;
  });

  // Fallback if all non-cooldown angles share yesterday's opening_class
  if (candidates.length === 0) {
    candidates = master.angles.filter((a) => !recentIds.has(String(a.id)));
  }

  // Ultimate fallback if cooldown_window >= total angles
  if (candidates.length === 0) {
    candidates = master.angles.slice();
  }

  candidates.sort((a, b) => scoreAngle(b, ctx) - scoreAngle(a, ctx));
  const chosen = candidates[0];

  const syntaxMap = chosen.syntax || {};
  const headlineSkeleton = syntaxMap[vertical] || "";

  const latestSelection = {
    schema_version: "1.0.0",
    run_date_utc: runDateUtc,
    vertical: contract.vertical,
    domain: contract.domain,
    is_thursday_rollover: isThursdayRollover,
    selected_angle_id: String(chosen.id),
    family: chosen.family,
    opening_class: chosen.opening_class,
    headline_skeleton: headlineSkeleton,
    lede_rule: chosen.lede_rule,
    excluded_recent_ids: Array.from(recentIds)
  };

  const historyRecord = {
    run_date_utc: runDateUtc,
    angle_id: String(chosen.id),
    family: chosen.family,
    opening_class: chosen.opening_class
  };

  const updatedEntries = Array.isArray(history.entries) ? history.entries.slice() : [];
  const existingIdx = updatedEntries.findIndex((e) => e.run_date_utc === runDateUtc);
  if (existingIdx >= 0) {
    updatedEntries[existingIdx] = historyRecord;
  } else {
    updatedEntries.push(historyRecord);
  }

  history.schema_version = history.schema_version || "1.0.0";
  history.vertical = contract.vertical;
  history.cooldown_window_runs = cooldownWindow;
  history.entries = updatedEntries.slice(-90);

  saveJson(outputPath, latestSelection);
  saveJson(historyPath, history);

  return latestSelection;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  try {
    const vertical = getArg("--vertical", "policingintel");
    const runDateUtc = getArg("--date", new Date().toISOString().slice(0, 10));
    const defaults = getDefaultPaths(vertical);

    const contractPath = getArg("--contract", defaults.contractPath);
    const anglesPath = getArg("--angles", defaults.anglesPath);
    const metricsPath = getArg("--metrics", defaults.metricsPath);
    const historyPath = getArg("--history", defaults.historyPath);
    const outputPath = getArg("--out", defaults.outputPath);

    const contract = loadJson(contractPath, null);
    if (!contract) {
      throw new Error(`Missing contract file at: ${contractPath}`);
    }
    const metrics = loadJson(metricsPath, null);
    if (!metrics) {
      throw new Error(`Missing daily metrics summary file at: ${metricsPath}`);
    }

    const result = selectAngle({
      vertical,
      runDateUtc,
      metrics,
      contract,
      anglesPath,
      historyPath,
      outputPath
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { selectAngle, scoreAngle, getDefaultPaths };
