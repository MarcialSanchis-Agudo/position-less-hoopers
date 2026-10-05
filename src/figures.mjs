function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgFrame({ width = 960, height = 600, title, description = "", body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(description)}</desc>
  <rect width="100%" height="100%" fill="white"/>
  <style>
    text { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #111827; }
    .title { font-size: 24px; font-weight: 700; }
    .subtitle { font-size: 13px; fill: #4b5563; }
    .axis { stroke: #9ca3af; stroke-width: 1; }
    .grid { stroke: #e5e7eb; stroke-width: 1; }
    .label { font-size: 12px; fill: #374151; }
    .small { font-size: 11px; fill: #4b5563; }
    .line { fill: none; stroke: #111827; stroke-width: 3; }
    .point { fill: #111827; }
    .bar-static { fill: #9ca3af; }
    .bar-capability { fill: #4b5563; }
    .bar-situated { fill: #111827; }
    .good { fill: #d1fae5; }
    .bad { fill: #fee2e2; }
    .neutral { fill: #f3f4f6; }
    .covered { fill: #d1fae5; stroke: #065f46; stroke-width: 2; }
    .degraded { fill: #fef3c7; stroke: #92400e; stroke-width: 2; }
    .uncovered { fill: #fee2e2; stroke: #991b1b; stroke-width: 2; }
    .agent { fill: #f9fafb; stroke: #111827; stroke-width: 2; }
    .edge { stroke: #9ca3af; stroke-width: 2; }
  </style>
  ${body}
</svg>`;
}

export function renderSensitivityFigure(sweep) {
  const width = 960;
  const height = 600;
  const left = 90;
  const right = 40;
  const top = 100;
  const bottom = 80;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const rows = sweep.rows;
  const xMin = Math.min(...rows.map((row) => row.situatednessWeight));
  const xMax = Math.max(...rows.map((row) => row.situatednessWeight));
  const yMaxRaw = Math.max(...rows.map((row) => row.meanRegret));
  const yMax = yMaxRaw === 0 ? 1 : yMaxRaw * 1.1;
  const x = (value) => left + ((value - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (value) => top + plotH - (value / yMax) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: top + plotH - t * plotH,
    label: (t * yMax).toFixed(3)
  }));

  const path = rows.map((row, index) =>
    `${index === 0 ? "M" : "L"} ${x(row.situatednessWeight).toFixed(2)} ${y(row.meanRegret).toFixed(2)}`
  ).join(" ");

  const body = `
  <text class="title" x="${left}" y="42">P1 situatedness sensitivity</text>
  <text class="subtitle" x="${left}" y="66">Synthetic mean regret across true context-loss penalties 0.1–0.4</text>
  ${ticks.map((tick) => `<line class="grid" x1="${left}" y1="${tick.y}" x2="${left + plotW}" y2="${tick.y}"/>
  <text class="label" text-anchor="end" x="${left - 10}" y="${tick.y + 4}">${tick.label}</text>`).join("")}
  <line class="axis" x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}"/>
  <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}"/>
  <path class="line" d="${path}"/>
  ${rows.map((row) => `<circle class="point" cx="${x(row.situatednessWeight)}" cy="${y(row.meanRegret)}" r="4"/>
  <text class="small" text-anchor="middle" x="${x(row.situatednessWeight)}" y="${top + plotH + 24}">${row.situatednessWeight.toFixed(2)}</text>`).join("")}
  <text class="label" text-anchor="middle" x="${left + plotW / 2}" y="${height - 22}">Situatedness weight</text>
  <text class="label" transform="translate(24 ${top + plotH / 2}) rotate(-90)" text-anchor="middle">Mean synthetic regret</text>
  <line x1="${x(0.35)}" y1="${top}" x2="${x(0.35)}" y2="${top + plotH}" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text class="small" x="${x(0.35) + 6}" y="${top + 16}">Frozen P1 = 0.35</text>
  `;

  return svgFrame({
    width,
    height,
    title: "P1 situatedness sensitivity",
    description: "Mean synthetic regret as the situatedness coefficient changes.",
    body
  });
}

export function renderCalibrationHeatmap(grid) {
  const width = 960;
  const height = 620;
  const left = 150;
  const top = 110;
  const cellW = 62;
  const cellH = 62;
  const gaps = [...new Set(grid.cells.map((cell) => cell.capabilityGap))].sort((a, b) => a - b);
  const penalties = [...new Set(grid.cells.map((cell) => cell.trueMissingContextPenalty))].sort((a, b) => a - b);
  const lookup = new Map(grid.cells.map((cell) => [`${cell.trueMissingContextPenalty}:${cell.capabilityGap}`, cell]));

  const body = `
  <text class="title" x="${left}" y="42">Capability gap × true context-loss cost</text>
  <text class="subtitle" x="${left}" y="66">Green = frozen 0.35 matcher selects the synthetic optimum; red = mismatch</text>
  ${penalties.map((penalty, rowIndex) => `<text class="label" text-anchor="end" x="${left - 12}" y="${top + rowIndex * cellH + cellH / 2 + 4}">${penalty.toFixed(2)}</text>`).join("")}
  ${gaps.map((gap, colIndex) => `<text class="label" text-anchor="middle" x="${left + colIndex * cellW + cellW / 2}" y="${top - 16}">${gap.toFixed(2)}</text>`).join("")}
  ${penalties.flatMap((penalty, rowIndex) => gaps.map((gap, colIndex) => {
    const cell = lookup.get(`${penalty}:${gap}`);
    const cls = cell.correct ? "good" : "bad";
    const label = cell.selectedCandidateId === "situated" ? "S" : "C";
    return `<rect class="${cls}" x="${left + colIndex * cellW}" y="${top + rowIndex * cellH}" width="${cellW - 3}" height="${cellH - 3}" rx="5"/>
    <text class="label" text-anchor="middle" x="${left + colIndex * cellW + (cellW - 3) / 2}" y="${top + rowIndex * cellH + 25}">${label}</text>
    <text class="small" text-anchor="middle" x="${left + colIndex * cellW + (cellW - 3) / 2}" y="${top + rowIndex * cellH + 43}">r=${cell.regret.toFixed(2)}</text>`;
  })).join("")}
  <text class="label" text-anchor="middle" x="${left + (gaps.length * cellW) / 2}" y="${height - 22}">Capability advantage of unsituated candidate</text>
  <text class="label" transform="translate(28 ${top + (penalties.length * cellH) / 2}) rotate(-90)" text-anchor="middle">True missing-context penalty</text>
  <text class="small" x="${left + gaps.length * cellW - 140}" y="${height - 50}">S = situated, C = high capability</text>
  `;

  return svgFrame({
    width,
    height,
    title: "PLH P1 calibration heatmap",
    description: "Decision correctness over capability gaps and true context-loss penalties.",
    body
  });
}

export function renderPolicyRegimeFigure({ cheap, expensive }) {
  const width = 960;
  const height = 600;
  const left = 90;
  const top = 105;
  const bottom = 100;
  const plotH = height - top - bottom;
  const modes = ["static", "capability", "capability_situated"];
  const cheapMap = new Map(cheap.summary.map((row) => [row.mode, row.meanUtility]));
  const expensiveMap = new Map(expensive.summary.map((row) => [row.mode, row.meanUtility]));
  const values = [
    ...cheap.summary.map((row) => row.meanUtility),
    ...expensive.summary.map((row) => row.meanUtility)
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.03, (max - min) * 0.25);
  const yMin = min - pad;
  const yMax = max + pad;
  const y = (value) => top + plotH - ((value - yMin) / (yMax - yMin || 1)) * plotH;
  const groupCenters = [300, 650];
  const barW = 70;
  const classes = ["bar-static", "bar-capability", "bar-situated"];

  const groups = [
    { label: "Cheap reload (0.03)", values: cheapMap },
    { label: "Expensive reload (0.40)", values: expensiveMap }
  ];

  const body = `
  <text class="title" x="${left}" y="42">P1 policy behavior changes with context cost</text>
  <text class="subtitle" x="${left}" y="66">Seeded synthetic team simulation; higher mean utility is better</text>
  <line class="axis" x1="${left}" y1="${top + plotH}" x2="${width - 40}" y2="${top + plotH}"/>
  ${groups.map((group, gi) => modes.map((mode, mi) => {
    const value = group.values.get(mode);
    const x = groupCenters[gi] + (mi - 1) * (barW + 12);
    const yy = y(value);
    const h = top + plotH - yy;
    return `<rect class="${classes[mi]}" x="${x}" y="${yy}" width="${barW}" height="${h}"/>
    <text class="small" text-anchor="middle" x="${x + barW / 2}" y="${yy - 8}">${value.toFixed(3)}</text>`;
  }).join("")).join("")}
  ${groups.map((group, gi) => `<text class="label" text-anchor="middle" x="${groupCenters[gi] + barW / 2}" y="${top + plotH + 34}">${group.label}</text>`).join("")}
  ${modes.map((mode, mi) => `<rect class="${classes[mi]}" x="${260 + mi * 180}" y="${height - 48}" width="16" height="16"/>
  <text class="small" x="${282 + mi * 180}" y="${height - 35}">${mode.replace("_", " + ")}</text>`).join("")}
  `;

  return svgFrame({
    width,
    height,
    title: "P1 policy regimes",
    description: "Comparison of assignment policies under cheap and expensive context reload regimes.",
    body
  });
}



export function renderRegimeSweepFigure(sweep) {
  const width = 980;
  const height = 620;
  const left = 90;
  const right = 50;
  const top = 100;
  const bottom = 90;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const rows = sweep.rows;
  const xMin = Math.min(...rows.map((row) => row.trueMissingContextPenalty));
  const xMax = Math.max(...rows.map((row) => row.trueMissingContextPenalty));
  const values = rows.flatMap((row) => [
    row.staticMeanUtility,
    row.capabilityMeanUtility,
    row.situatedMeanUtility
  ]);
  const yMinRaw = Math.min(...values);
  const yMaxRaw = Math.max(...values);
  const pad = Math.max(0.02, (yMaxRaw - yMinRaw) * 0.12);
  const yMin = yMinRaw - pad;
  const yMax = yMaxRaw + pad;
  const x = (value) => left + ((value - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (value) => top + plotH - ((value - yMin) / (yMax - yMin || 1)) * plotH;

  const series = [
    { key: "staticMeanUtility", label: "static", stroke: "#9ca3af" },
    { key: "capabilityMeanUtility", label: "capability", stroke: "#4b5563" },
    { key: "situatedMeanUtility", label: "capability + situatedness", stroke: "#111827" }
  ];

  const paths = series.map((entry) => {
    const d = rows.map((row, index) =>
      `${index === 0 ? "M" : "L"} ${x(row.trueMissingContextPenalty).toFixed(2)} ${y(row[entry.key]).toFixed(2)}`
    ).join(" ");
    return `<path d="${d}" fill="none" stroke="${entry.stroke}" stroke-width="3"/>`;
  }).join("");

  const crossoverX = sweep.estimatedCrossoverPenalty == null
    ? null
    : x(sweep.estimatedCrossoverPenalty);

  const body = `
  <text class="title" x="${left}" y="42">Context cost changes the best coordination law</text>
  <text class="subtitle" x="${left}" y="66">Seeded synthetic team episodes; higher mean utility is better</text>
  <line class="axis" x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}"/>
  <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}"/>
  ${[0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = yMin + (yMax - yMin) * t;
    const yy = y(value);
    return `<line class="grid" x1="${left}" y1="${yy}" x2="${left + plotW}" y2="${yy}"/>
    <text class="label" text-anchor="end" x="${left - 10}" y="${yy + 4}">${value.toFixed(2)}</text>`;
  }).join("")}
  ${paths}
  ${series.map((entry) => rows.map((row) =>
    `<circle cx="${x(row.trueMissingContextPenalty)}" cy="${y(row[entry.key])}" r="3.5" fill="${entry.stroke}"/>`
  ).join("")).join("")}
  ${rows.map((row) => `<text class="small" text-anchor="middle" x="${x(row.trueMissingContextPenalty)}" y="${top + plotH + 25}">${row.trueMissingContextPenalty.toFixed(2)}</text>`).join("")}
  ${crossoverX == null ? "" : `<line x1="${crossoverX}" y1="${top}" x2="${crossoverX}" y2="${top + plotH}" stroke="#6b7280" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text class="small" x="${crossoverX + 6}" y="${top + 18}">synthetic crossover ≈ ${sweep.estimatedCrossoverPenalty.toFixed(3)}</text>`}
  <text class="label" text-anchor="middle" x="${left + plotW / 2}" y="${height - 22}">True missing-context penalty</text>
  <text class="label" transform="translate(24 ${top + plotH / 2}) rotate(-90)" text-anchor="middle">Mean synthetic utility</text>
  ${series.map((entry, index) => `<line x1="${205 + index * 250}" y1="${height - 50}" x2="${230 + index * 250}" y2="${height - 50}" stroke="${entry.stroke}" stroke-width="4"/>
  <text class="small" x="${240 + index * 250}" y="${height - 46}">${entry.label}</text>`).join("")}
  `;

  return svgFrame({
    width,
    height,
    title: "PLH P1 context-cost regime sweep",
    description: "Mean synthetic utility by coordination policy as true context-reload cost increases.",
    body
  });
}

export function renderCoordinationCycleFigure() {
  const width = 1200;
  const height = 560;

  const box = (x, y, w, h, title, subtitle, cls = "neutral") => `
    <rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14" stroke="#9ca3af" stroke-width="1.5"/>
    <text class="label" text-anchor="middle" x="${x + w / 2}" y="${y + 31}" font-weight="700">${esc(title)}</text>
    <text class="small" text-anchor="middle" x="${x + w / 2}" y="${y + 52}">${esc(subtitle)}</text>
  `;

  const arrow = (x1, y1, x2, y2, label = "") => `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6b7280" stroke-width="2" marker-end="url(#arrow)"/>
    ${label ? `<text class="small" text-anchor="middle" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}">${esc(label)}</text>` : ""}
  `;

  const body = `
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280"/>
    </marker>
  </defs>
  <text class="title" x="50" y="42">PLH deterministic coordination cycle</text>
  <text class="subtitle" x="50" y="66">Responsibilities may end; unresolved Needs do not disappear.</text>

  ${box(45, 140, 150, 76, "State", "authoritative")}
  ${box(235, 140, 170, 76, "NeedProposal", "non-authoritative")}
  ${box(445, 140, 150, 76, "Need", "admitted + versioned", "covered")}
  ${box(635, 140, 165, 76, "Matcher", "capability + situation")}
  ${box(840, 140, 175, 76, "Responsibility", "temporary lease", "degraded")}

  ${arrow(195, 178, 235, 178)}
  ${arrow(405, 178, 445, 178, "validate / dedupe")}
  ${arrow(595, 178, 635, 178)}
  ${arrow(800, 178, 840, 178)}

  ${box(840, 300, 175, 76, "Execution", "agent performs work")}
  ${box(620, 300, 180, 76, "Evidence check", "deterministic gate")}
  ${box(360, 420, 190, 76, "Need satisfied", "terminal", "covered")}
  ${box(670, 420, 190, 76, "Need reopened", "unresolved work survives", "uncovered")}

  ${arrow(927, 216, 927, 300)}
  ${arrow(840, 338, 800, 338)}
  ${arrow(710, 376, 505, 420, "obligations met")}
  ${arrow(710, 376, 765, 420, "missing evidence")}

  <path d="M 765 496 C 765 535, 520 535, 520 216" fill="none" stroke="#991b1b" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#arrow)"/>
  <text class="small" x="575" y="530">reassignment preserves Need identity</text>

  <text class="small" x="50" y="520">Fluid cognition; explicit authority; evidence-gated satisfaction.</text>
  `;

  return svgFrame({
    width,
    height,
    title: "PLH deterministic coordination cycle",
    description: "Need-first coordination from authoritative state through temporary responsibility and evidence-gated satisfaction or reopening.",
    body
  });
}

export function renderSwitchingPilotFigure(comparison) {
  const width = 980;
  const height = 620;
  const left = 100;
  const top = 110;
  const bottom = 110;
  const chartH = height - top - bottom;
  const runs = comparison.runs ?? [];
  const policies = runs.map((run) => run.policy);
  const maxSwitches = Math.max(1, ...runs.map((run) => run.switchCount));
  const maxUncovered = Math.max(1, ...runs.map((run) => run.uncoveredAfterWorkerLossMs));
  const groupX = [220, 500, 780];
  const barW = 54;

  const body = `
  <text class="title" x="${left}" y="42">P4 switching pilot — recovery vs churn</text>
  <text class="subtitle" x="${left}" y="66">Same candidate-state trace under no-switch, greedy-switch, and PLH hysteresis</text>

  <text class="label" x="${left}" y="96">switch count / unnecessary switches</text>
  <line class="axis" x1="${left}" y1="${top + chartH}" x2="${width - 40}" y2="${top + chartH}"/>

  ${runs.map((run, i) => {
    const x = groupX[i];
    const switchH = (run.switchCount / maxSwitches) * (chartH * 0.42);
    const unnecessaryH = (run.unnecessarySwitchCount / maxSwitches) * (chartH * 0.42);
    const uncoveredH = (run.uncoveredAfterWorkerLossMs / maxUncovered) * (chartH * 0.42);
    return `
      <rect x="${x - 72}" y="${top + chartH - switchH}" width="${barW}" height="${switchH}" fill="#4b5563"/>
      <rect x="${x - 9}" y="${top + chartH - unnecessaryH}" width="${barW}" height="${unnecessaryH}" fill="#9ca3af"/>
      <rect x="${x + 54}" y="${top + chartH - uncoveredH}" width="${barW}" height="${uncoveredH}" fill="#111827"/>

      <text class="small" text-anchor="middle" x="${x - 45}" y="${top + chartH - switchH - 8}">${run.switchCount}</text>
      <text class="small" text-anchor="middle" x="${x + 18}" y="${top + chartH - unnecessaryH - 8}">${run.unnecessarySwitchCount}</text>
      <text class="small" text-anchor="middle" x="${x + 81}" y="${top + chartH - uncoveredH - 8}">${Math.round(run.uncoveredAfterWorkerLossMs / 1000)}s</text>

      <text class="label" text-anchor="middle" x="${x}" y="${top + chartH + 30}">${esc(run.policy)}</text>
      <text class="small" text-anchor="middle" x="${x}" y="${top + chartH + 50}">
        final=${esc(run.finalAssigneeId)} · operational=${run.finalOperational ? "yes" : "no"}
      </text>
    `;
  }).join("")}

  <rect x="245" y="${height - 42}" width="15" height="15" fill="#4b5563"/>
  <text class="small" x="268" y="${height - 30}">switch count</text>
  <rect x="390" y="${height - 42}" width="15" height="15" fill="#9ca3af"/>
  <text class="small" x="413" y="${height - 30}">unnecessary switches</text>
  <rect x="575" y="${height - 42}" width="15" height="15" fill="#111827"/>
  <text class="small" x="598" y="${height - 30}">uncovered after worker loss</text>
  `;

  return svgFrame({
    width,
    height,
    title: "PLH P4 switching pilot",
    description: "Comparison of switching count, unnecessary switching, and uncovered time after worker loss across three switching policies.",
    body
  });
}

export function renderTriggerPolicyFigure(summary) {
  const width = 980;
  const height = 600;
  const top = 110;
  const bottom = 100;
  const chartH = height - top - bottom;
  const groupX = [220, 500, 780];
  const maxRecompute = Math.max(
    1,
    ...summary.map((row) => row.coordinationRecomputations)
  );

  const body = `
  <text class="title" x="80" y="42">P5b trigger policy comparison</text>
  <text class="subtitle" x="80" y="66">Three synthetic traces: coupled support signal, noise-only, and slow drift</text>
  <line class="axis" x1="80" y1="${top + chartH}" x2="${width - 40}" y2="${top + chartH}"/>

  ${summary.map((row, i) => {
    const x = groupX[i];
    const allH = (row.coordinationRecomputations / maxRecompute) * chartH * 0.70;
    const unnecessaryH = (row.unnecessaryRecomputations / maxRecompute) * chartH * 0.70;
    const latency = row.meanHelpTriggerLatencyMs == null
      ? "—"
      : `${Math.round(row.meanHelpTriggerLatencyMs / 1000)}s`;
    return `
      <rect x="${x - 55}" y="${top + chartH - allH}" width="48" height="${allH}" fill="#4b5563"/>
      <rect x="${x + 8}" y="${top + chartH - unnecessaryH}" width="48" height="${unnecessaryH}" fill="#9ca3af"/>
      <text class="small" text-anchor="middle" x="${x - 31}" y="${top + chartH - allH - 8}">${row.coordinationRecomputations}</text>
      <text class="small" text-anchor="middle" x="${x + 32}" y="${top + chartH - unnecessaryH - 8}">${row.unnecessaryRecomputations}</text>
      <text class="label" text-anchor="middle" x="${x}" y="${top + chartH + 30}">${esc(row.policy)}</text>
      <text class="small" text-anchor="middle" x="${x}" y="${top + chartH + 50}">mean help latency: ${latency}</text>
    `;
  }).join("")}

  <rect x="300" y="${height - 42}" width="15" height="15" fill="#4b5563"/>
  <text class="small" x="323" y="${height - 30}">all recomputations</text>
  <rect x="510" y="${height - 42}" width="15" height="15" fill="#9ca3af"/>
  <text class="small" x="533" y="${height - 30}">unnecessary recomputations</text>
  `;

  return svgFrame({
    width,
    height,
    title: "PLH P5b trigger policy comparison",
    description: "Coordination recomputation counts and mean help-trigger latency across reactive, direct, and pressure-trigger policies.",
    body
  });
}

export function renderTriggerSensitivityFigure(sweep) {
  const width = 900;
  const height = 620;
  const left = 150;
  const top = 115;
  const cellW = 145;
  const cellH = 90;
  const nodeThresholds = sweep.nodeThresholds;
  const groupThresholds = sweep.groupThresholds;
  const lookup = new Map(
    sweep.rows.map((row) => [`${row.nodeThreshold}:${row.groupThreshold}`, row])
  );

  const body = `
  <text class="title" x="${left}" y="42">P5b threshold sensitivity</text>
  <text class="subtitle" x="${left}" y="66">Each cell: recomputations / unnecessary / mean help latency</text>

  ${nodeThresholds.map((value, i) =>
    `<text class="label" text-anchor="middle" x="${left + i * cellW + cellW / 2}" y="${top - 20}">node τ=${value.toFixed(2)}</text>`
  ).join("")}

  ${groupThresholds.map((value, row) =>
    `<text class="label" text-anchor="end" x="${left - 14}" y="${top + row * cellH + cellH / 2 + 4}">group τ=${value.toFixed(2)}</text>`
  ).join("")}

  ${groupThresholds.flatMap((groupThreshold, row) =>
    nodeThresholds.map((nodeThreshold, col) => {
      const item = lookup.get(`${nodeThreshold}:${groupThreshold}`);
      const latency = item.meanHelpTriggerLatencyMs == null
        ? "miss"
        : `${Math.round(item.meanHelpTriggerLatencyMs / 1000)}s`;
      const cls = item.unnecessaryRecomputations === 0 ? "good" :
        item.missedSupportCount > 0 ? "bad" : "neutral";
      return `
        <rect class="${cls}" x="${left + col * cellW}" y="${top + row * cellH}" width="${cellW - 4}" height="${cellH - 4}" rx="8"/>
        <text class="label" text-anchor="middle" x="${left + col * cellW + (cellW - 4)/2}" y="${top + row * cellH + 31}">
          r=${item.coordinationRecomputations} · u=${item.unnecessaryRecomputations}
        </text>
        <text class="small" text-anchor="middle" x="${left + col * cellW + (cellW - 4)/2}" y="${top + row * cellH + 53}">
          help latency=${latency}
        </text>
      `;
    })
  ).join("")}
  `;

  return svgFrame({
    width,
    height,
    title: "PLH P5b threshold sensitivity",
    description: "Sensitivity grid over node and group pressure thresholds.",
    body
  });
}

export function renderCourtShiftFigure({ before, after }) {
  const width = 1100;
  const height = 620;

  function panel(field, x0, title) {
    const agentY = 170;
    const workY = 390;
    const panelW = 500;
    const agents = field.agents;
    const work = field.work;
    const coverageByWork = new Map(field.coverage.map((item) => [item.workId, item]));
    const agentX = new Map(agents.map((agent, index) => [
      agent.sessionId,
      x0 + 90 + index * ((panelW - 180) / Math.max(1, agents.length - 1))
    ]));
    const workX = new Map(work.map((item, index) => [
      item.workId,
      x0 + 90 + index * ((panelW - 180) / Math.max(1, work.length - 1))
    ]));

    const edges = work.map((item) => {
      const coverage = coverageByWork.get(item.workId);
      if (!coverage?.sessionId || !agentX.has(coverage.sessionId)) return "";
      return `<line class="edge" x1="${agentX.get(coverage.sessionId)}" y1="${agentY + 34}" x2="${workX.get(item.workId)}" y2="${workY - 38}"/>`;
    }).join("");

    const agentNodes = agents.map((agent) => `
      <circle class="agent" cx="${agentX.get(agent.sessionId)}" cy="${agentY}" r="34"/>
      <text class="label" text-anchor="middle" x="${agentX.get(agent.sessionId)}" y="${agentY + 4}">${esc(agent.sessionId.replace("session-", ""))}</text>
      <text class="small" text-anchor="middle" x="${agentX.get(agent.sessionId)}" y="${agentY + 58}">${esc(agent.lifecycle)}</text>
    `).join("");

    const workNodes = work.map((item) => {
      const coverage = coverageByWork.get(item.workId);
      const cls = coverage?.status === "covered" ? "covered" :
        coverage?.status === "degraded" ? "degraded" : "uncovered";
      return `
      <rect class="${cls}" x="${workX.get(item.workId) - 65}" y="${workY - 34}" width="130" height="68" rx="10"/>
      <text class="label" text-anchor="middle" x="${workX.get(item.workId)}" y="${workY - 5}">${esc(item.stepId ?? item.workId)}</text>
      <text class="small" text-anchor="middle" x="${workX.get(item.workId)}" y="${workY + 14}">${esc(coverage?.status ?? "inactive")}</text>
      `;
    }).join("");

    return `
      <rect x="${x0}" y="90" width="${panelW}" height="460" rx="18" fill="#f9fafb" stroke="#d1d5db"/>
      <text class="title" x="${x0 + 26}" y="132">${esc(title)}</text>
      <text class="small" x="${x0 + 26}" y="154">agents</text>
      <text class="small" x="${x0 + 26}" y="342">work</text>
      ${edges}
      ${agentNodes}
      ${workNodes}
    `;
  }

  const body = `
  <text class="title" x="50" y="44">CourtShift P2 — worker loss changes coverage</text>
  <text class="subtitle" x="50" y="68">Same work state; one agent disappears between snapshots</text>
  ${panel(before, 35, "Before perturbation")}
  ${panel(after, 565, "After worker loss")}
  `;

  return svgFrame({
    width,
    height,
    title: "CourtShift worker-loss visualization",
    description: "Before-and-after view of agent coverage when an implementation worker is lost.",
    body
  });
}

