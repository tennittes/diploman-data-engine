// scripts/validate_inputs.js — Contract & Payload Gate Before Angle Selection
const fs = require("fs");
const path = require("path");

function loadJsonFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} file at: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${err.message}`);
  }
}

function isValidUtcDateString(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr;
}

function isFiniteNumber(val) {
  return typeof val === "number" && Number.isFinite(val);
}

function resolveContractPath(vertical, explicitContractPath) {
  if (explicitContractPath) return explicitContractPath;
  const map = {
    governancescore: path.join("config", "governance-contract.json"),
    policingintel: path.join("config", "policing-contract.json"),
    footballtally: path.join("config", "football-contract.json")
  };
  const resolved = map[vertical];
  if (!resolved) {
    throw new Error(`Unsupported vertical "${vertical}". Expected governancescore, policingintel, or footballtally.`);
  }
  return resolved;
}

function validateInputs({ vertical, runDateUtc, metrics, contract }) {
  const errors = [];

  if (!vertical || contract.vertical !== vertical) {
    errors.push(`Vertical mismatch: expected "${contract.vertical}", received "${vertical || "none"}".`);
  }

  if (!isValidUtcDateString(runDateUtc)) {
    errors.push(`Invalid run_date_utc "${runDateUtc}". Must match YYYY-MM-DD in UTC.`);
  }

  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    errors.push("Metrics payload must be a non-null JSON object.");
    return { valid: false, errors };
  }

  if (metrics.run_date_utc && metrics.run_date_utc !== runDateUtc) {
    errors.push(`Payload run_date_utc ("${metrics.run_date_utc}") does not match run date ("${runDateUtc}").`);
  }

  if (metrics.vertical && metrics.vertical !== contract.vertical) {
    errors.push(`Payload vertical ("${metrics.vertical}") does not match contract vertical ("${contract.vertical}").`);
  }

  const requiredFields = Array.isArray(contract.required_summary_fields)
    ? contract.required_summary_fields
    : [];

  for (const field of requiredFields) {
    if (metrics[field] === undefined || metrics[field] === null || metrics[field] === "") {
      errors.push(`Missing required summary field "${field}" for ${contract.vertical}.`);
    }
  }

  // Validate numeric delta/score fields when present
  const numericFields = [
    "top_primary_score",
    "maxPositiveDelta",
    "maxNegativeDelta",
    "flatTopWatchCount",
    "creepStreakDays",
    "maxZoneClusterCount",
    "leaderStreakRuns"
  ];

  for (const field of numericFields) {
    if (metrics[field] !== undefined && metrics[field] !== null && !isFiniteNumber(metrics[field])) {
      errors.push(`Field "${field}" must be a finite number, received "${metrics[field]}".`);
    }
  }

  // Vertical-specific coverage & baseline sanity checks
  if (contract.vertical === "governancescore" || contract.vertical === "policingintel") {
    const expectedCount = contract.coverage && contract.coverage.expected_count ? contract.coverage.expected_count : 37;
    if (metrics.jurisdiction_count !== undefined && Number(metrics.jurisdiction_count) !== expectedCount) {
      errors.push(`Expected ${expectedCount} jurisdictions for ${contract.vertical}, received ${metrics.jurisdiction_count}.`);
    }
  }

  if (contract.vertical === "footballtally") {
    const allowedLeagues = new Set(
      ((contract.coverage && contract.coverage.leagues) || []).map((l) => l.code)
    );
    if (metrics.active_league_code && allowedLeagues.size > 0 && !allowedLeagues.has(metrics.active_league_code)) {
      errors.push(`League code "${metrics.active_league_code}" is not in the 8 tracked leagues for footballtally.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      vertical: contract.vertical,
      domain: contract.domain,
      run_date_utc: runDateUtc,
      validated_at_utc: new Date().toISOString()
    }
  };
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
    const metricsPath = getArg("--metrics", path.join("state", vertical, "daily_metrics_summary.json"));
    const contractPath = resolveContractPath(vertical, getArg("--contract", ""));

    const contract = loadJsonFile(contractPath, "vertical contract");
    const metrics = loadJsonFile(metricsPath, "daily metrics summary");

    const result = validateInputs({ vertical, runDateUtc, metrics, contract });

    if (!result.valid) {
      console.error(JSON.stringify({ status: "INVALID", errors: result.errors }, null, 2));
      process.exit(1);
    }

    console.log(JSON.stringify({ status: "VALID", ...result.normalized }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { validateInputs, isValidUtcDateString, resolveContractPath };
