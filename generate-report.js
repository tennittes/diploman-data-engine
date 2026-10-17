const fs = require('fs');
const path = require('path');

// Extract text safely from string, array, or nested object
function extractText(field, fallback = '') {
  if (!field) return fallback;
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.filter(Boolean).join(' ');
  if (typeof field === 'object') {
    return Object.values(field).filter(Boolean).join('\n\n');
  }
  return String(fallback);
}

// Target ISO Week Calculation
function getTargetWeekDetails(targetDate = new Date()) {
  const d = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()));
  const dayNum = d.getUTCDay() || 7;
  
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  
  const friday = new Date(d);
  friday.setUTCDate(d.getUTCDate() + (5 - (d.getUTCDay() || 7)));

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedFriday = `${monthNames[friday.getUTCMonth()]} ${String(friday.getUTCDate()).padStart(2, '0')}, ${friday.getUTCFullYear()}`;
  const yearMonthFolder = `${monthNames[friday.getUTCMonth()].toLowerCase()}${friday.getUTCFullYear()}`;

  return { weekNumber: weekNo, year: friday.getUTCFullYear(), formattedFriday, yearMonthFolder };
}

// Build PSI & SIS Leaderboards from B2 Metrics
function buildLeaderboards(jurisdictions) {
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) {
    return { psiLeaderboard: 'N/A', sisLeaderboard: 'N/A' };
  }

  const psiList = [...jurisdictions]
    .map(j => {
      const score = parseFloat(j.metrics?.psiScore ?? j.metrics?.psi ?? j.metrics?.PSI);
      const name = j.state || j.jurisdiction || 'Unknown';
      return { name, score };
    })
    .filter(item => !isNaN(item.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item, idx) => `${idx + 1}. ${item.name} (${item.score.toFixed(1)} PSI)`);

  const sisList = [...jurisdictions]
    .map(j => {
      const score = parseFloat(j.metrics?.sisScore ?? j.metrics?.sis ?? j.metrics?.SIS);
      const name = j.state || j.jurisdiction || 'Unknown';
      return { name, score };
    })
    .filter(item => !isNaN(item.score))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item, idx) => `${idx + 1}. ${item.name} (${item.score.toFixed(1)} SIS)`);

  return {
    psiLeaderboard: psiList.join(' • ') || 'N/A',
    sisLeaderboard: sisList.join(' • ') || 'N/A'
  };
}

// Main Render Function for B2 Schema
function renderHtmlReport(b2Data, weekDetails) {
  const reportTitles = b2Data.reportTitles || {};
  const macroAnalysis = b2Data.macroAnalysis || {};
  const corridorGroups = b2Data.corridorGroups || [];
  const jurisdictions = b2Data.jurisdictions || [];

  const { psiLeaderboard, sisLeaderboard } = buildLeaderboards(jurisdictions);

  // Global Text Summaries
  const leadNarrativeText = extractText(reportTitles.headlines?.summary, "Nigeria's subnational governance landscape this week reflected strategic progress across fiscal discipline, infrastructure, healthcare expansion, and energy development.");
  const macroSynthesisText = extractText(macroAnalysis.policy, "Across Nigeria's 36 states and the Federal Capital Territory, reported executive activity focused on strategic governance priorities.");
  const riskAnalysisText = extractText(macroAnalysis.security, "The State Instability Score (SIS) gives decision-makers a high-level, quantitative view of subnational risk.");
  
  const strategicOutlookText = extractText(macroAnalysis.policy?.strategicOutlook || macroAnalysis.security?.strategicOutlook, "The week's announcements identify several priorities for continued executive scrutiny across budget execution, energy infrastructure maintenance, and social protection verification.");
  const conclusionText = extractText(macroAnalysis.policy?.conclusion || macroAnalysis.security?.conclusion, "Diploman Times will continue to track executive decisions across all 36 states and the FCT.");

  // Corridor Group Render
  const corridorHtmlBlocks = corridorGroups.map((group, index) => {
    const groupNum = String(index + 1).padStart(2, '0');
    const groupStates = Array.isArray(group.states) ? group.states : [];

    // Match states by state name
    const statesInGroup = jurisdictions.filter(j => {
      const stateName = (j.state || '').trim().toLowerCase();
      return groupStates.some(st => String(st).trim().toLowerCase() === stateName);
    });

    const stateCards = statesInGroup.map(item => {
      let developmentsText = '';
      if (item.policyBreakdown && typeof item.policyBreakdown === 'object') {
        developmentsText = item.policyBreakdown.body || item.policyBreakdown.summary || '';
      }
      
      if (!developmentsText) {
        developmentsText = item.impactVector || item.headline || item.summary || '';
      }

      return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; padding: 14px 16px; margin-bottom: 12px; border-radius: 4px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #064e3b; margin-bottom: 4px;">
            Governor ${item.governor || 'Executive'} &bull; ${item.state} State (${item.zone || 'NIGERIA'})
          </div>
          <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.6; text-align: justify;">
            <strong>Key developments and governance significance:</strong> ${developmentsText}
          </p>
        </div>`;
    }).join('\n');

    return `
    <article style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="background-color: #064e3b; color: #ffffff; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 3px;">CORRIDOR GROUP ${groupNum}</span>
        <h3 style="font-size: 15px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0;">
          ${group.groupTitle || 'Strategic Corridor'}
        </h3>
      </div>
      <div style="margin-top: 12px;">
        ${stateCards}
      </div>
    </article>`;
  }).join('\n');

  return `<!-- DIPLOMAN TIMES SUBNATIONAL WEEKLY EXECUTIVE PAGE TEMPLATE -->
<div class="dt-executive-page-wrapper" itemscope itemtype="https://schema.org/Report" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 10px 0;">

  <!-- DYNAMIC TITLE HEADLINE -->
  <h1 style="font-size: 22px; font-weight: 900; color: #064e3b; margin: 0 0 16px 0; line-height: 1.35; border-bottom: 2px solid #064e3b; padding-bottom: 10px;">
    Nigeria Subnational Governance Brief Week ${weekDetails.weekNumber} Policy Roundup Ending ${weekDetails.formattedFriday}
  </h1>

  <!-- FEATURED IMAGE CONTAINER -->
  <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 16px; padding: 0px; position: relative; width: 100%;">
    <a href="https://www.diplomantimes.com/" aria-label="Nigeria State Governors" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
      <img alt="Nigeria State Governors" border="0" src="https.png" style="border: 0px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
    </a>
  </figure>

  <!-- LEAD NARRATIVE / BLOGGER SNIPPET -->
  <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
    ${leadNarrativeText}
  </p>

  <a name='more'></a>

  <!-- 1. QUANTITATIVE INDEX LEADERBOARD -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #064e3b; border-radius: 4px; padding: 16px 18px; margin-bottom: 28px;">
    <h2 style="margin: 0 0 12px 0; font-size: 12.5px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px;">
      Subnational Index Performance Benchmarks
    </h2>
    
    <div class="dt-leaderboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          POLICY SIGNAL INDEX (PSI) &bull; TOP PERFORMERS
        </div>
        <div id="dt-psi-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          ${psiLeaderboard}
        </div>
      </div>

      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          STATE INSTABILITY SCORE (SIS) &bull; LOWEST RISK
        </div>
        <div id="dt-sis-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          ${sisLeaderboard}
        </div>
      </div>
    </div>
  </section>

  <!-- 2. DYNAMIC MACRO ANALYSIS SYNTHESIS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Macro Governance Synthesis &amp; Policy Dynamics
    </h2>
    <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
      ${macroSynthesisText}
    </p>
    <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
      ${riskAnalysisText}
    </p>
  </section>

  <section style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; padding: 12px 16px; margin: 0 0 28px 0; border-radius: 4px;">
    <p style="font-size: 12px; color: #475569; line-height: 1.65; margin: 0; text-align: justify;"><strong>Editorial note:</strong> PSI and SIS rankings are reproduced from the reporting dataset for comparative use. Financial figures, projected savings, project status and reported outcomes should be interpreted according to their stated status and verified against the relevant official records. A policy announcement or approved allocation should not be treated as evidence that a project is complete or that a public outcome has been measured.</p>
  </section>

  <!-- 3. DYNAMIC CORRIDOR GROUPS WITH GOVERNOR IMPACT VECTORS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 16px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Subnational Strategic Corridor Group Analysis
    </h2>

    ${corridorHtmlBlocks}
  </section>

  <!-- 4. STRATEGIC OUTLOOK & CONCLUSION -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 20px; margin: 24px 0 12px 0;">
    <h3 style="font-size: 11px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px 0;">
      Strategic Policy Outlook
    </h3>
    <p style="font-size: 12.5px; color: #334155; line-height: 1.6; margin: 0 0 18px 0; text-align: justify;">
      ${strategicOutlookText}
    </p>

    <h3 style="font-size: 11px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px 0; border-top: 1px solid #e2e8f0; padding-top: 14px;">
      Executive Risk Conclusion
    </h3>
    <p style="font-size: 12.5px; color: #334155; line-height: 1.6; margin: 0; text-align: justify;">
      ${conclusionText}
    </p>
  </section>
</div>`;
}

// Execution Entry
function run() {
  try {
    const weekDetails = getTargetWeekDetails();
    const octPath = path.join(__dirname, 'oct2026', 'master-data.json');
    const rootPath = path.join(__dirname, 'master-data.json');

    let rawData;
    if (fs.existsSync(octPath)) {
      rawData = fs.readFileSync(octPath, 'utf8');
    } else if (fs.existsSync(rootPath)) {
      rawData = fs.readFileSync(rootPath, 'utf8');
    } else {
      throw new Error("Master dataset JSON file not found.");
    }

    const jsonParsed = JSON.parse(rawData);
    
    // Automatically find the active week key (e.g. "16", "data", "41")
    let b2Payload = jsonParsed;
    if (jsonParsed["16"]) {
      b2Payload = jsonParsed["16"];
    } else if (jsonParsed.data) {
      b2Payload = jsonParsed.data;
    } else {
      // Find first object containing reportTitles or jurisdictions
      const keys = Object.keys(jsonParsed);
      for (const k of keys) {
        if (jsonParsed[k] && (jsonParsed[k].reportTitles || jsonParsed[k].jurisdictions)) {
          b2Payload = jsonParsed[k];
          break;
        }
      }
    }

    const htmlOutput = renderHtmlReport(b2Payload, weekDetails);

    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `weekly-report-week${weekDetails.weekNumber}.html`);
    fs.writeFileSync(outputPath, htmlOutput, 'utf8');

    console.log(`Successfully compiled report at: ${outputPath}`);
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
}

run();
