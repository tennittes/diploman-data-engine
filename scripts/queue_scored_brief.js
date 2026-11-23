// scripts/queue_scored_brief.js — Formats Selected 25-Angle Scored Brief Into Diploman Times news-queue.json
const fs = require("fs");
const path = require("path");

const DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com";

const VERTICAL_META = {
  governancescore: {
    label: "Governance Score",
    prefix: "gov",
    primaryMetric: "PSI",
    secondaryMetric: "SIS",
    notice:
      "This Scored Intelligence Brief translates subnational Policy Signal Index (PSI) and State Instability Score (SIS) telemetry across 37 Nigerian jurisdictions into verified news coverage for Diploman Times."
  },
  policingintel: {
    label: "Policing Intel",
    prefix: "pol",
    primaryMetric: "SPS",
    secondaryMetric: "JTI",
    notice:
      "This Scored Intelligence Brief translates Security Performance Score (SPS) and Jurisdiction Threat Index (JTI) command telemetry across 37 Nigerian jurisdictions into verified news coverage for Diploman Times."
  },
  footballtally: {
    label: "Football Tally",
    prefix: "ftb",
    primaryMetric: "DFT",
    secondaryMetric: "STD",
    notice:
      "This Scored Intelligence Brief translates Diploman Football Tally (DFT) two-half consistency metrics against Standard Full-Time Points (STD) across 8 tracked leagues for Diploman Times."
  }
};

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function buildStoryDraft(vertical, selection, metrics) {
  const meta = VERTICAL_META[vertical] || VERTICAL_META.governancescore;
  const topEntity = metrics.top_primary_entity || "Tracked Leader";
  const topScore = metrics.top_primary_score !== undefined ? metrics.top_primary_score : "N/A";
  const maxPosDelta =
    typeof metrics.maxPositiveDelta === "number"
      ? `${metrics.maxPositiveDelta >= 0 ? "+" : ""}${metrics.maxPositiveDelta}`
      : "+0.0";

  if (vertical === "governancescore") {
    const pTop = (metrics.leaders && metrics.leaders.primary_top3) || [];
    const sTop = (metrics.leaders && metrics.leaders.secondary_top3) || [];
    const breakout = pTop.slice().sort((a, b) => (b.delta || 0) - (a.delta || 0))[0] || pTop[0] || {};
    const stabilityLead = sTop[0] || {};

    return {
      title: `${breakout.entity || topEntity} Posts ${maxPosDelta} Policy Surge to ${breakout.score || topScore} PSI as ${topEntity} Holds Subnational Lead`,
      labels: [
        "News Report",
        "Diploman Times",
        "Governance Score",
        breakout.entity || topEntity,
        `Angle ${selection.selected_angle_id}`
      ],
      alt: `${breakout.entity || topEntity} Subnational Governance Score Telemetry`,
      lead_narrative: `${breakout.entity || topEntity} recorded the sharpest subnational policy movement across Nigeria's 37 jurisdictions on ${selection.run_date_utc}, climbing ${maxPosDelta} to ${breakout.score || topScore} PSI, while ${topEntity} retained the overall Policy Signal Index lead at ${topScore} PSI. On the stability front, ${stabilityLead.entity || "Lagos"} anchored the State Instability Score table at ${stabilityLead.score !== undefined ? stabilityLead.score : "1.2"} SIS.`,
      story_body: [
        `Engine telemetry processed under Angle ${selection.selected_angle_id} (${selection.family}) highlights ${breakout.entity || topEntity}'s upward Policy Signal Index shift alongside sustained top-tier execution from ${topEntity} (${topScore} PSI).`,
        `Across the broader 37-jurisdiction board, ${pTop.map((x) => `${x.entity} (${x.score} PSI, ${x.delta >= 0 ? "+" : ""}${x.delta})`).join(", ") || `${topEntity} (${topScore} PSI)`} paced daily policy output.`,
        `Institutional friction readings remained lowest in ${sTop.map((x) => `${x.entity} (${x.score} SIS)`).join(", ") || "top-performing stability jurisdictions"}, reinforcing subnational divergence ahead of the Thursday 00:00 UTC rollover window.`
      ]
    };
  }

  if (vertical === "policingintel") {
    const pTop = (metrics.leaders && metrics.leaders.primary_top3) || [];
    const watchTop = (metrics.leaders && metrics.leaders.secondary_top_watch) || [];

    return {
      title: `${topEntity} Command Climbs ${maxPosDelta} to ${topScore} SPS as High-Watch Threat Baselines Hold Steady`,
      labels: [
        "News Report",
        "Diploman Times",
        "Policing Intel",
        topEntity,
        `Angle ${selection.selected_angle_id}`
      ],
      alt: `${topEntity} State Police Command Security Performance Score Telemetry`,
      lead_narrative: `${topEntity} State Police Command led national daily enforcement performance across 37 jurisdictions on ${selection.run_date_utc} at ${topScore} SPS (${maxPosDelta}), driven by coordinated operational output. Meanwhile, ${watchTop.map((w) => `${w.entity} (${w.score} JTI)`).join(", ") || "high-watch commands"} remained the highest-watch threat jurisdictions with zero net daily movement (+0.0).`,
      story_body: [
        `Structured under Angle ${selection.selected_angle_id} (${selection.family}), daily command telemetry places ${pTop.map((x) => `${x.entity} (${x.score} SPS, ${x.delta >= 0 ? "+" : ""}${x.delta})`).join(", ") || `${topEntity} (${topScore} SPS)`} at the top of the Security Performance Score rankings.`,
        `Each command's SPS composite weighs Patrol & Response Index (PRI, 35%), Crime Deterrence Index (CDI, 40%), and Rapid Policing Index (RPI, 25%) against calibrated 5.5–7.5 baseline bands.`,
        `On the Jurisdiction Threat Index (JTI, 2.5–4.5 baseline band), persistent readings in ${watchTop.map((w) => `${w.entity} (${w.score} JTI)`).join(", ") || "monitored northeastern and northwestern corridors"} underscore ongoing containment priorities across the federation.`
      ]
    };
  }

  // footballtally
  const leagueName = metrics.active_league_name || metrics.active_league_code || "Premier League";
  const dftTop = (metrics.active_league_standings && metrics.active_league_standings.dft_top3) || [];
  const dftBottom = (metrics.active_league_standings && metrics.active_league_standings.dft_bottom3) || [];
  const stdTop = (metrics.active_league_standings && metrics.active_league_standings.std_top3) || [];
  const stdLeader = stdTop[0] || { club: "Arsenal", std_pts: 27, dft_pts: 13 };

  return {
    title: `${topEntity} Leads ${leagueName} DFT Table on ${topScore} Pts Despite Trailing ${stdLeader.club} on STD Standings`,
    labels: [
      "News Report",
      "Diploman Times",
      "Football Tally",
      leagueName,
      topEntity,
      `Angle ${selection.selected_angle_id}`
    ],
    alt: `${topEntity} ${leagueName} Diploman Football Tally Standings`,
    lead_narrative: `${topEntity} topped the ${leagueName} Diploman Football Tally (DFT) standings with ${topScore} pts on ${selection.run_date_utc}—outpacing standard full-time leader ${stdLeader.club} (${stdLeader.std_pts} STD pts, ${stdLeader.dft_pts} DFT pts)—through sustained two-half sweep bonuses. At the foot of the two-half table, ${dftBottom.slice(0, 2).map((c) => `${c.club} (${c.dft_pts} DFT pts)`).join(" and ") || "bottom-tier clubs"} remained anchored on low half-by-half returns.`,
    story_body: [
      `Evaluated under Angle ${selection.selected_angle_id} (${selection.family}), ${leagueName} two-half telemetry highlights ${dftTop.map((c) => `${c.club} (${c.dft_pts} DFT / ${c.std_pts} STD)`).join(", ") || `${topEntity} (${topScore} DFT pts)`}.`,
      `Under the DFT scoring engine, clubs earn 1 pt per half won plus a +1 sweep bonus for winning both 45-minute halves, exposing sharp divergence from conventional 3-1-0 full-time tables.`,
      `Across all 8 tracked competitions, two-half consistency continues to separate teams controlling both halves from clubs reliant on single-half surges.`
    ]
  };
}

function queueScoredBrief({
  vertical,
  selectionPath,
  metricsPath,
  queuePath,
  featuredImageSrc
}) {
  const selection = loadJson(selectionPath, null);
  if (!selection || !selection.selected_angle_id || !selection.run_date_utc) {
    throw new Error(`Invalid or empty latest_selection.json at: ${selectionPath}`);
  }

  const metrics = loadJson(metricsPath, null);
  if (!metrics) {
    throw new Error(`Missing daily_metrics_summary.json at: ${metricsPath}`);
  }

  const queueData = loadJson(queuePath, { newsReports: [] });
  if (!Array.isArray(queueData.newsReports)) {
    queueData.newsReports = [];
  }

  const meta = VERTICAL_META[vertical] || VERTICAL_META.governancescore;
  const draft = buildStoryDraft(vertical, selection, metrics);
  const reportId = `scored-${meta.prefix}-${selection.run_date_utc}-${selection.selected_angle_id}`;

  const entry = {
    type: "scored_brief",
    id: reportId,
    published: false,
    vertical,
    source_domain: selection.domain,
    angle_id: selection.selected_angle_id,
    angle_family: selection.family,
    opening_class: selection.opening_class,
    headline_skeleton: selection.headline_skeleton,
    lede_rule: selection.lede_rule,
    title: draft.title,
    labels: draft.labels,
    featured_image: {
      src: featuredImageSrc || "",
      alt: draft.alt,
      target_url: DIPLOMAN_TIMES_URL
    },
    lead_narrative: draft.lead_narrative,
    editorial_notice: meta.notice,
    story_body: draft.story_body
  };

  // Upsert by reportId so same-day reruns update in place without duplicates
  const existingIdx = queueData.newsReports.findIndex((item) => item.id === reportId);
  if (existingIdx >= 0) {
    // Preserve published: true if already published on the same date/angle
    entry.published = Boolean(queueData.newsReports[existingIdx].published);
    queueData.newsReports[existingIdx] = entry;
  } else {
    queueData.newsReports.unshift(entry);
  }

  saveJson(queuePath, queueData);
  return entry;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  try {
    const vertical = getArg("--vertical", "governancescore");
    const selectionPath = getArg(
      "--selection",
      path.join("state", vertical, "latest_selection.json")
    );
    const metricsPath = getArg(
      "--metrics",
      path.join("state", vertical, "daily_metrics_summary.json")
    );
    const queuePath = getArg("--queue", "news-queue.json");
    const featuredImageSrc = getArg("--image", "");

    const queued = queueScoredBrief({
      vertical,
      selectionPath,
      metricsPath,
      queuePath,
      featuredImageSrc
    });

    console.log(JSON.stringify({ status: "QUEUED", target_url: DIPLOMAN_TIMES_URL, entry: queued }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: "ERROR", message: err.message }, null, 2));
    process.exit(1);
  }
}

module.exports = { queueScoredBrief, buildStoryDraft, DIPLOMAN_TIMES_URL };
