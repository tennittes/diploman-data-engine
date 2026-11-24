// scripts/select_angle.js — Selects Daily Angle From 25-Angle Matrix With Anti-Repetition
const fs = require("fs");
const path = require("path");
const { resolveContractPath } = require("./validate_inputs");

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function isThursdayUtc(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 4;
}

function evaluateCondition(cond, m) {
  if (!cond || typeof cond !== "object") return true;

  for (const [key, expected] of Object.entries(cond)) {
    if (key === "maxPositiveDelta_gte") {
      if (Number(m.maxPositiveDelta || 0) < Number(expected)) return false;
    } else if (key === "maxNegativeDelta_lte") {
      if (Number(m.maxNegativeDelta || 0) > Number(expected)) return false;
    } else if (key === "flatTopWatchCount_gte") {
      if (Number(m.flatTopWatchCount || 0) < Number(expected)) return false;
    } else if (key === "creepStreakDays_gte") {
      if (Number(m.creepStreakDays || 0) < Number(expected)) return false;
    } else if (key === "maxZoneClusterCount_gte") {
      if (Number(m.maxZoneClusterCount || 0) < Number(expected)) return false;
    } else if (key === "leaderStreakRuns_gte") {
      if (Number(m.leaderStreakRuns || 0) < Number(expected)) return false;
    } else if (key === "maxWeakPoints_gte") {
      if (Number(m.maxWeakPoints || 0) < Number(expected)) return false;
    } else if (key === "minWeakPoints_lte") {
      if (Number(m.minWeakPoints || 0) > Number(expected)) return false;
    } else {
      if (Boolean(m[key]) !== Boolean(expected)) return false;
    }
  }
  return true;
}

function selectDailyAngle({ vertical, runDateUtc, anglesPath, metricsPath, historyPath, contractPath }) {
  const contract = loadJson(contractPath, { domain: "https://www.diplomantimes.com/" });
  const anglesDoc = loadJson(anglesPath, { angles: [] });
  const allAngles = Array.isArray(anglesDoc.angles) ? anglesDoc.angles : [];
  const metrics = loadJson(metricsPath, {});
  const historyDoc = loadJson(historyPath, { entries: [] });
  const historyEntries = Array.isArray(historyDoc.entries) ? historyDoc.entries : [];

  const isThursday = isThursdayUtc(runDateUtc);
  const priorEntries = historyEntries.filter(
    (e) => !(e.run_date_utc === runDateUtc && e.vertical === vertical)
  );

  // Enforce 12-run angle_id cooldown and 2-run family cooldown so consecutive days shift analytical focus
  const recentIds = new Set(priorEntries.slice(-12).map((e) => e.angle_id));
  const recentFamilies = new Set(priorEntries.slice(-2).map((e) => e.family).filter(Boolean));
  const lastEntry = priorEntries.length ? priorEntries[priorEntries.length - 1] : null;
  const lastOpeningClass = lastEntry ? lastEntry.opening_class : null;

  // Support both schema formats: a.syntax[vertical] or a.verticals.includes(vertical)
  const eligibleForVertical = allAngles.filter((a) => {
    const hasSyntax = a.syntax && typeof a.syntax === "object" && Boolean(a.syntax[vertical]);
    const hasVerticalArray = Array.isArray(a.verticals) && a.verticals.includes(vertical);
    if (!hasSyntax && !hasVerticalArray) return false;
    // Reserve angle 23 (Thursday rollover anchor) strictly for Thursdays
    if (String(a.id) === "23" && !isThursday) return false;
    return true;
  });

  if (eligibleForVertical.length === 0) {
    throw new Error(`No angles configured for vertical "${vertical}" in ${anglesPath}`);
  }

  let chosen = null;

  // On Thursdays, anchor on angle 23 (thursday_weekly_rollover_anchor) if configured
  if (isThursday) {
    chosen = eligibleForVertical.find((a) => String(a.id) === "23") || null;
  }

  if (!chosen) {
    // 1. Strictest: condition match + not in last 12 IDs + not in last 2 families + new opening_class
    let candidates = eligibleForVertical.filter(
      (a) =>
        !recentIds.has(a.id) &&
        (!a.family || !recentFamilies.has(a.family)) &&
        (!lastOpeningClass || a.opening_class !== lastOpeningClass) &&
        evaluateCondition(a.condition, metrics)
    );

    // 2. Relax opening_class while preserving 12-run ID cooldown & 2-run family cooldown
    if (candidates.length === 0) {
      candidates = eligibleForVertical.filter(
        (a) =>
          !recentIds.has(a.id) &&
          (!a.family || !recentFamilies.has(a.family)) &&
          evaluateCondition(a.condition, metrics)
      );
    }

    // 3. Relax family cooldown while preserving 12-run ID cooldown
    if (candidates.length === 0) {
      candidates = eligibleForVertical.filter(
        (a) => !recentIds.has(a.id) && evaluateCondition(a.condition, metrics)
      );
    }

    // 4. Relax condition match while preserving 12-run ID cooldown
    if (candidates.length === 0) {
      candidates = eligibleForVertical.filter((a) => !recentIds.has(a.id));
    }

    // 5. Fallback to last-7 ID cooldown
    if (candidates.length === 0) {
      const last7 = new Set(priorEntries.slice(-7).map((e) => e.angle_id));
      candidates = eligibleForVertical.filter((a) => !last7.has(a.id));
    }

    if (candidates.length === 0) {
      candidates = eligibleForVertical;
    }

    // Deterministic weighted pick seeded by date + vertical
    const seedStr = `${runDateUtc}:${vertical}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    }
    chosen = candidates[hash % candidates.length];
  }

  const resolvedSkeleton =
    (chosen.syntax && chosen.syntax[vertical]) || chosen.headline_skeleton || "";

  const selection = {
    schema_version: "1.0.0",
    run_date_utc: runDateUtc,
    vertical,
    domain: contract.domain || "https://www.diplomantimes.com/",
    is_thursday_rollover: isThursday,
    selected_angle_id: chosen.id,
    angle_name: chosen.name || "",
    family: chosen.family || "general",
    opening_class: chosen.opening_class || "entity_first",
    headline_skeleton: resolvedSkeleton,
    lede_rule: chosen.lede_rule || "",
    weak_points_context: {
      has_divergence: Boolean(metrics.hasWeakPointsDivergence),
      top_club: metrics.top_weak_points_club || null,
      max_weak_points: Number(metrics.maxWeakPoints || 0),
      lowest_club: metrics.lowest_weak_points_club || null,
      min_weak_points: Number(metrics.minWeakPoints || 0)
    },
    excluded_recent_ids: Array.from(recentIds),
    excluded_recent_families: Array.from(recentFamilies)
  };

  const nextEntries = priorEntries
    .concat({
      run_date_utc: runDateUtc,
      vertical,
      angle_id: chosen.id,
      angle_name: chosen.name || "",
      family: chosen.family || "general",
      opening_class: chosen.opening_class || "entity_first"
    })
    .slice(-30);

  return {
    selection,
    updatedHistory: {
      schema_version: "1.0.0",
      vertical,
      entries: nextEntries
    }
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
    const runDateUtc = getArg("--date", new Date().toISOString().slice(0, 10));
    const anglesPath = getArg("--angles", path.join("config", "angles-25-master.json"));
    const metricsPath = getArg("--metrics", path.join("state", vertical, "daily_metrics_summary.json"));
    const historyPath = getArg("--history", path.join("state", vertical, "angle_history.json"));
    const outPath = getArg("--out", path.join("state", vertical, "latest_selection.json"));
    const contractPath = resolveContractPath(vertical, getArg("--contract", ""));

    const { selection, updatedHistory } = selectDailyAngle({
      vertical,
      runDateUtc,
      anglesPath,
      metricsPath,
      historyPath,
      contractPath
    });

    saveJson(outPath, selection);
    saveJson(historyPath, updatedHistory);

    console.log(JSON.stringify(selection, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { selectDailyAngle };
