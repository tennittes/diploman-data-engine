const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch JSON via HTTPS with redirect support
function fetchJsonData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJsonData(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Helper to safely extract narrative text from string or array
function extractText(field, defaultValue = '') {
  if (!field) return defaultValue;
  if (Array.isArray(field)) return field.filter(Boolean).join(' ');
  if (typeof field === 'object') return Object.values(field).filter(Boolean).join(' ');
  return String(field);
}

// Calculate target ISO week and Friday date
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

  return {
    weekNumber: weekNo,
    year: friday.getUTCFullYear(),
    formattedFriday,
    yearMonthFolder
  };
}

// Build Top Performers & Lowest Risk Leaderboards from Jurisdictions Dataset
function buildLeaderboards(jurisdictions) {
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) {
    return { psiLeaderboard: 'N/A', sisLeaderboard: 'N/A' };
  }

  const psiList = [...jurisdictions]
    .filter(j => j.metrics && j.metrics.psi !== undefined)
    .sort((a, b) => parseFloat(b.metrics.psi) - parseFloat(a.metrics.psi))
    .slice(0, 3)
    .map((item, idx) => `${idx + 1}. ${item.state} (${parseFloat(item.metrics.psi).toFixed(1)} PSI)`);

  const sisList = [...jurisdictions]
    .filter(j => j.metrics && j.metrics.sis !== undefined)
    .sort((a, b) => parseFloat(a.metrics.sis) - parseFloat(b.metrics.sis))
    .slice(0, 3)
    .map((item, idx) => `${idx + 1}. ${item.state} (${parseFloat(item.metrics.sis).toFixed(1)} SIS)`);

  return {
    psiLeaderboard: psiList.join(' • ') || 'N/A',
    sisLeaderboard: sisList.join(' • ') || 'N/A'
  };
}

// Build HTML Report Output
function renderHtmlReport(data, weekDetails) {
  const globalData = data.globalData || {};
  const corridorGroups = data.corridorGroups || [];
  const jurisdictions = data.jurisdictions || [];

  const { psiLeaderboard, sisLeaderboard } = buildLeaderboards(jurisdictions);

  // Extract Global Narratives safely
  const leadNarrativeText = extractText(
    globalData.leadNarrative || globalData.leadNarratives,
    "Nigeria's subnational governance landscape this week reflected strategic progress across fiscal discipline, infrastructure, healthcare expansion, and energy development. State governments advanced vital legislative budgets, social protection schemes, and regional infrastructure pipelines to strengthen local economic productivity and governance accountability across the country."
  );

  const macroSynthesisText = extractText(
    globalData.macroSynthesis || globalData.macroAnalysis,
    "Across Nigeria's 36 states and the Federal Capital Territory, reported executive activity during the week focused on fiscal planning, energy development, public-service delivery and social protection."
  );

  const riskAnalysisText = extractText(
    globalData.riskAnalysis || globalData.instabilityAnalysis,
    "The State Instability Score (SIS) gives decision-makers a high-level, quantitative view of subnational risk. Although it tracks broader trends rather than individual incidents, it provides an important strategic baseline."
  );

  const strategicOutlookText = extractText(
    globalData.strategicOutlook || globalData.outlook,
    "The week's announcements identify several priorities for continued executive scrutiny across budget execution, energy infrastructure maintenance, and social protection verification."
  );

  const conclusionText = extractText(
    globalData.conclusion || globalData.executiveConclusion,
    "This week's record reflects active policymaking across several sectors; however, the volume of announcements is not, by itself, evidence of effective governance. Diploman Times will continue to track executive decisions across all 36 states and the FCT."
  );

  // Build Corridor Groups Markup
  const corridorHtmlBlocks = corridorGroups.map((group, index) => {
    const groupNum = String(index + 1).padStart(2, '0');
    const groupStates = Array.isArray(group.states) ? group.states : [];

    // Filter matching jurisdictions for this corridor group
    const statesInGroup = jurisdictions.filter(j => groupStates.includes(j.state));

    const stateCards = statesInGroup.map(item => {
      let developmentsText = '';

      if (Array.isArray(item.policyBreakdown) && item.policyBreakdown.length > 0) {
        developmentsText = item.policyBreakdown
          .map(p => p.body || p.impactVector || p.headline || '')
          .filter(Boolean)
          .join(' ');
      } else {
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
          ${group.groupTitle || group.title || 'Strategic Corridor'}
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

// Main execution function
async function run() {
  try {
    const weekDetails = getTargetWeekDetails();
    const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'tennittes';
    const jsonUrl = `https://raw.githubusercontent.com/${repoOwner}/diploman-data-engine/main/${weekDetails.yearMonthFolder}/master-data.json`;

    console.log(`Fetching data for Week ${weekDetails.weekNumber} (${weekDetails.formattedFriday}) from ${jsonUrl}...`);

    let masterData;
    try {
      masterData = await fetchJsonData(jsonUrl);
    } catch (err) {
      console.warn(`Fetch failed from raw GitHub URL. Attempting local dataset fallback...`);
      const localPath = path.join(__dirname, weekDetails.yearMonthFolder, 'master-data.json');
      const rootLocalPath = path.join(__dirname, 'master-data.json');
      
      if (fs.existsSync(localPath)) {
        masterData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      } else if (fs.existsSync(rootLocalPath)) {
        masterData = JSON.parse(fs.readFileSync(rootLocalPath, 'utf8'));
      } else {
        throw new Error(`Data source not available at ${jsonUrl} or local paths.`);
      }
    }

    const htmlOutput = renderHtmlReport(masterData, weekDetails);
    
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `weekly-report-week${weekDetails.weekNumber}.html`);
    fs.writeFileSync(outputPath, htmlOutput, 'utf8');

    console.log(`Report generated successfully at: ${outputPath}`);
  } catch (error) {
    console.error('Error generating weekly executive report:', error);
    process.exit(1);
  }
}

run();
