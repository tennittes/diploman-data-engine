// scripts/queue_scored_brief.js — Generates Dynamic, Boilerplate-Free Scored Briefs Into news-queue.json
const fs = require("fs");
const path = require("path");

const DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com";

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

function formatList(items, formatter, conjunction = "and") {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return "";
  const formatted = list.map(formatter);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} ${conjunction} ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, ${conjunction} ${formatted[formatted.length - 1]}`;
}

function buildFootballDraft(selection, metrics, dateStr) {
  const angleId = selection.selected_angle_id || "04";
  const topEntity = metrics.top_primary_entity || "Brighton Hove";
  const topScore = metrics.top_primary_score ?? 0;

  const leagueName = metrics.active_league_name || "Premier League";
  const leagueCode = metrics.active_league_code || "PL";
  const standings = metrics.active_league_standings || {};
  const dftTop3 = Array.isArray(standings.dft_top3) ? standings.dft_top3 : [];
  const dftBottom3 = Array.isArray(standings.dft_bottom3) ? standings.dft_bottom3 : [];
  const stdTop3 = Array.isArray(standings.std_top3) ? standings.std_top3 : [];
  const stdBottom3 = Array.isArray(standings.std_bottom3) ? standings.std_bottom3 : [];

  const runnerUp = dftTop3[1] || { club: "nearest rival", dft_pts: topScore };
  const thirdClub = dftTop3[2] || null;
  const tailClub = dftBottom3[0] || { club: "the bottom club", dft_pts: 0 };
  const stdLeader = stdTop3[0] || { club: topEntity, std_pts: topScore };
  const stdRunnerUp = stdTop3[1] || null;

  let title;
  let leadNarrative;

  switch (angleId) {
    case "07": {
      title = `Lower-Tier Pressure Persists on ${tailClub.club} (${tailClub.dft_pts} Pts) as ${topEntity} Stays Ahead on ${topScore} DFT Pts`;
      leadNarrative =
        `${tailClub.club} sits at the bottom of the ${leagueName} (${leagueCode}) two-half table on ${tailClub.dft_pts} points as of ${dateStr} UTC, ` +
        `while ${topEntity} maintains the top spot on ${topScore} points. ` +
        `Across the wider ${leagueName} table split, ${stdLeader.club} holds first place on the standard full-time standings with ${stdLeader.std_pts} points.`;
      break;
    }
    case "04":
    case "09": {
      title = `${topEntity} Tops ${leagueName} DFT Tally (${topScore} Pts) While ${stdLeader.club} Leads Full-Time Table (${stdLeader.std_pts} Pts)`;
      leadNarrative =
        `${topEntity} leads the ${leagueName} (${leagueCode}) two-half table with ${topScore} points as of ${dateStr} UTC, ` +
        `while ${stdLeader.club} sits atop the standard full-time standings on ${stdLeader.std_pts} points. ` +
        `The split between half-by-half control and final match outcomes continues to reshape positions across ${leagueName}.`;
      break;
    }
    case "06": {
      title = `${topEntity} (${topScore} Pts) Edges Narrow Lead Over ${runnerUp.club} (${runnerUp.dft_pts} Pts) in ${leagueName} DFT Race`;
      leadNarrative =
        `${topEntity} holds a narrow lead on ${topScore} two-half points ahead of ${runnerUp.club} (${runnerUp.dft_pts} points) in ${leagueName} (${leagueCode}) as of ${dateStr} UTC. ` +
        `In the standard full-time table, ${stdLeader.club} sets the pace on ${stdLeader.std_pts} points, keeping both races tightly contested.`;
      break;
    }
    default: {
      title = `${topEntity} Holds ${leagueName} DFT Lead on ${topScore} Pts Ahead of ${runnerUp.club} (${runnerUp.dft_pts} Pts)`;
      leadNarrative =
        `${topEntity} paces the ${leagueName} (${leagueCode}) two-half table with ${topScore} points ahead of ${runnerUp.club} (${runnerUp.dft_pts} points) as of ${dateStr} UTC. ` +
        `Meanwhile, ${stdLeader.club} leads the standard full-time standings on ${stdLeader.std_pts} points, underscoring different paths to points accumulation.`;
      break;
    }
  }

  const dftPodiumText = dftTop3.length
    ? formatList(dftTop3, (c, idx) => `${idx + 1}. ${c.club} (${c.dft_pts} pts)`)
    : `${topEntity} (${topScore} pts)`;

  const gapToSecond = Math.max(0, Number(topScore) - Number(runnerUp.dft_pts ?? topScore));
  const gapToThird = thirdClub
    ? Math.max(0, Number(topScore) - Number(thirdClub.dft_pts ?? topScore))
    : 0;

  const p1 =
    `At the top of the ${leagueName} two-half standings, the leading trio sits at ${dftPodiumText}. ` +
    `${topEntity} holds a ${gapToSecond}-point cushion over ${runnerUp.club}` +
    (thirdClub ? ` and leads third-placed ${thirdClub.club} by ${gapToThird} points.` : ".");

  const stdTopText = stdTop3.length
    ? formatList(stdTop3, (c) => `${c.club} (${c.std_pts} pts)`)
    : `${stdLeader.club} (${stdLeader.std_pts} pts)`;

  const p2 =
    `The standard full-time standings present a contrasting picture, led by ${stdTopText}. ` +
    (stdRunnerUp
      ? `${stdLeader.club} stays ${Math.max(0, Number(stdLeader.std_pts ?? 0) - Number(stdRunnerUp.std_pts ?? 0))} points clear of ${stdRunnerUp.club} in full-time points, `
      : "") +
    `showing how clubs that close out full matches can hold higher standard totals even when half-by-half tallies distribute points differently.`;

  const tailText = dftBottom3.length
    ? formatList(dftBottom3, (c) => `${c.club} (${c.dft_pts} pts)`)
    : `${tailClub.club} (${tailClub.dft_pts} pts)`;

  const stdTailText = stdBottom3.length
    ? formatList(stdBottom3, (c) => `${c.club} (${c.std_pts} pts)`)
    : "";

  const p3 =
    `At the opposite end of the ${leagueName} two-half table, ${tailText} sit under sustained points pressure` +
    (stdTailText ? `, while ${stdTailText} occupy the lower full-time spots.` : ".");

  const otherLeagues = (Array.isArray(metrics.leagues) ? metrics.leagues : [])
    .filter((l) => l.code !== leagueCode)
    .slice(0, 7);

  const crossLeagueText = otherLeagues.length
    ? formatList(
        otherLeagues,
        (l) =>
          `${l.name} (${l.dft_leader} on ${l.dft_leader_pts} two-half pts; ${l.std_leader} on ${l.std_leader_pts} full-time pts)`
      )
    : "";

  const p4 = crossLeagueText
    ? `Across other tracked top-flight competitions on ${dateStr} UTC, table leaders include ${crossLeagueText}.`
    : `Match tallies across tracked domestic leagues continue to update alongside ${leagueName} as fixtures conclude.`;

  return {
    title,
    summary: leadNarrative,
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
      src: "",
      alt: `${leagueName} Football Tally Standings`,
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

  const angleId = selection.selected_angle_id || "01";
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

  const runnerUp = primaryTop3[1] || null;
  const leadMover =
    jurisdictions
      .slice()
      .sort((a, b) => Number(b[`${primaryKey}_delta`] ?? 0) - Number(a[`${primaryKey}_delta`] ?? 0))[0] ||
    null;

  let title;
  let leadNarrative;

  if (angleId === "02" && Number(metrics.maxNegativeDelta ?? 0) < 0) {
    const dropper =
      jurisdictions
        .slice()
        .sort((a, b) => Number(a[`${primaryKey}_delta`] ?? 0) - Number(b[`${primaryKey}_delta`] ?? 0))[0] ||
      { entity: topEntity, [`${primaryKey}_delta`]: maxNeg };
    const dropDelta = formatDelta(dropper[`${primaryKey}_delta`]);
    title = `${dropDelta} Shift Tests ${dropper.entity} as ${topEntity} Holds ${topScore} ${primaryKey} Lead`;
    leadNarrative =
      `${dropper.entity} posted a ${dropDelta} ${primaryKey} movement on ${dateStr} UTC across the 37 jurisdictions, ` +
      `while ${topEntity} remained at the top of the ${metricLabel} table on ${topScore} ${primaryKey}. ` +
      `Steepest daily movement across the board reached ${maxPos} on the upside and ${maxNeg} on the downside.`;
  } else if (angleId === "06" && runnerUp) {
    title = `${topEntity} (${topScore} ${primaryKey}) Holds Narrow Lead Over ${runnerUp.entity} (${runnerUp.score} ${primaryKey})`;
    leadNarrative =
      `${topEntity} leads the 37-jurisdiction ${metricLabel} rankings on ${topScore} ${primaryKey} as of ${dateStr} UTC, ` +
      `just ahead of ${runnerUp.entity} on ${runnerUp.score} ${primaryKey}. ` +
      `Across all tracked jurisdictions, daily ${primaryKey} shifts ranged from ${maxNeg} to ${maxPos}.`;
  } else {
    const moverEntity = leadMover ? leadMover.entity : topEntity;
    const moverDelta = leadMover ? formatDelta(leadMover[`${primaryKey}_delta`]) : maxPos;
    title = `${moverEntity} Posts ${moverDelta} ${primaryKey} Shift as ${topEntity} Leads on ${topScore} ${primaryKey}`;
    leadNarrative =
      `${moverEntity} recorded a ${moverDelta} ${primaryKey} shift on ${dateStr} UTC, while ${topEntity} held the overall ${metricLabel} lead at ${topScore} ${primaryKey} across 37 jurisdictions. ` +
      `Daily shifts across the board spanned ${maxNeg} to ${maxPos} ${primaryKey}.`;
  }

  const top3Text = primaryTop3.length
    ? formatList(
        primaryTop3,
        (r, idx) => `${idx + 1}. ${r.entity} (${r.score} ${primaryKey}, ${formatDelta(r.delta)})`
      )
    : `${topEntity} (${topScore} ${primaryKey})`;

  const p1 =
    `Leading ${metricLabel} positions across the 37 jurisdictions on ${dateStr} UTC stand at ${top3Text}. ` +
    (runnerUp
      ? `${topEntity} holds a ${(Number(topScore) - Number(runnerUp.score ?? topScore)).toFixed(2).replace(/\.?0+$/, "")}-point margin over ${runnerUp.entity} in the primary ranking.`
      : `Daily ${primaryKey} readings reflect comparative performance across state commands and administrations.`);

  const secText = secondaryTop.length
    ? formatList(
        secondaryTop,
        (r) => `${r.entity} (${r.score} ${secondaryKey}, ${formatDelta(r.delta)})`
      )
    : "";

  const p2 = secText
    ? `On the ${secLabel} side, notable readings include ${secText}, ` +
      `highlighting jurisdictions where secondary risk or instability indicators behave differently from top ${primaryKey} totals.`
    : `Secondary ${secondaryKey} readings across the 37 jurisdictions continue to be tracked alongside ${primaryKey} movement.`;

  const trailingText = trailing.length
    ? formatList(
        trailing,
        (r) => `${r.entity} (${r[primaryKey]} ${primaryKey}, ${formatDelta(r[`${primaryKey}_delta`])})`
      )
    : "";

  const p3 = trailingText
    ? `Lower-ranked jurisdictions on the ${primaryKey} board include ${trailingText}, ` +
      `illustrating the spread between frontrunners and trailing states as of ${dateStr} UTC.`
    : `Rankings across all 37 jurisdictions remain updated for ${dateStr} UTC.`;

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
    title,
    summary: leadNarrative,
    leadNarrative,
    storyBody: [p1, p2, p3, p4],
    labels: [
      "News Report",
      "Diploman Times",
      verticalTag,
      topEntity,
      `Angle ${angleId}`
    ],
    featuredImage: {
      src: "",
      alt: `${topEntity} ${verticalTag} Telemetry`,
      target_url: DIPLOMAN_TIMES_URL
    }
  };
}

function buildStoryDraft(vertical, selection, metrics) {
  const dateStr = selection.run_date_utc || metrics.run_date_utc || new Date().toISOString().slice(0, 10);
  if (vertical === "footballtally") {
    return buildFootballDraft(selection, metrics, dateStr);
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

  const prefixMap = {
    governancescore: "scored-gov",
    footballtally: "scored-ftb",
    policingintel: "scored-pol"
  };
  const prefix = prefixMap[vertical] || `scored-${vertical}`;
  const runDate = selection.run_date_utc || metrics.run_date_utc || new Date().toISOString().slice(0, 10);
  const angleId = selection.selected_angle_id || "01";
  const id = `${prefix}-${runDate}-${angleId}`;

  const draft = buildStoryDraft(vertical, selection, metrics);

  const entry = {
    type: "scored_brief",
    id,
    published: false,
    target_url: DIPLOMAN_TIMES_URL,
    vertical,
    source_domain: selection.domain || DIPLOMAN_TIMES_URL,
    angle_id: angleId,
    angle_family: selection.family || "general",
    opening_class: selection.opening_class || "entity_first",
    headline_skeleton: selection.headline_skeleton || "",
    lede_rule: selection.lede_rule || "",
    title: draft.title,
    summary: draft.summary,
    labels: draft.labels,
    featured_image: draft.featuredImage,
    lead_narrative: draft.leadNarrative,
    story_body: draft.storyBody,
    queued_at_utc: new Date().toISOString()
  };

  const existingList = Array.isArray(existingQueue)
    ? existingQueue
    : Array.isArray(existingQueue.newsReports)
    ? existingQueue.newsReports
    : Array.isArray(existingQueue.items)
    ? existingQueue.items
    : [];

  const updatedReports = [entry, ...existingList.filter((item) => item.id !== id)];
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

module.exports = { queueScoredBrief };
