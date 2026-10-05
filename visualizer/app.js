const $ = (id) => document.getElementById(id);
let currentField = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const cleanDemo = {
  schemaVersion: 1,
  goalId: "demo",
  workflowRunId: "run-1",
  observedAt: "demo",
  stateVersion: "v1",
  agents: [
    { sessionId: "implement", lifecycle: "active", adapterId: "demo", modelId: "A", progress: { stalled: false } },
    { sessionId: "verify", lifecycle: "active", adapterId: "demo", modelId: "B", progress: { stalled: false } }
  ],
  work: [
    { workId: "implement", stepId: "implement", status: "active", assignedSessionId: "implement", readSet: ["api"], writeSet: ["service"] },
    { workId: "verify", stepId: "verify", status: "active", assignedSessionId: "verify", readSet: ["tests"], writeSet: [] }
  ],
  coverage: [
    { workId: "implement", status: "covered", sessionId: "implement", reason: null },
    { workId: "verify", status: "covered", sessionId: "verify", reason: null }
  ],
  overlaps: [],
  contentions: [],
  evidenceGaps: [],
  uncovered: [],
  resources: { activeAgentCount: 2, concurrencyLimit: 2, knownCostUsd: 0.42, budgetRemainingUsd: null },
  sourceRefs: { sessionIds: ["implement","verify"], stepRunIds: ["implement","verify"], harnessTransitionIds: [] }
};

const workerLossDemo = structuredClone(cleanDemo);
workerLossDemo.stateVersion = "v2";
workerLossDemo.agents[0].lifecycle = "stopped";
workerLossDemo.coverage[0] = { workId: "implement", status: "uncovered", sessionId: "implement", reason: "session_not_live" };
workerLossDemo.uncovered = [{ workId: "implement", sessionId: "implement", reason: "session_not_live" }];
workerLossDemo.resources = { ...workerLossDemo.resources, activeAgentCount: 1, knownCostUsd: 0.46 };

function metric(label, value) {
  return `<div class="metric"><strong>${escapeHtml(value ?? "—")}</strong><span>${escapeHtml(label)}</span></div>`;
}

function item(text) {
  return `<div class="item">${text}</div>`;
}

function render(field) {
  currentField = field;
  $("status").textContent = `${field.goalId ?? "unknown"} · ${field.stateVersion ?? "no state version"}`;

  const coverage = new Map((field.coverage ?? []).map((x) => [x.workId, x]));
  $("metrics").innerHTML = [
    metric("Active agents", field.resources?.activeAgentCount ?? field.agents?.length ?? 0),
    metric("Covered work", (field.coverage ?? []).filter((x) => x.status === "covered").length),
    metric("Degraded work", (field.coverage ?? []).filter((x) => x.status === "degraded").length),
    metric("Uncovered work", (field.coverage ?? []).filter((x) => x.status === "uncovered").length),
    metric("Overlaps", field.overlaps?.length ?? 0),
    metric("Contentions", field.contentions?.length ?? 0),
    metric("Evidence gaps", field.evidenceGaps?.length ?? 0)
  ].join("");

  $("agents").innerHTML = (field.agents ?? []).map((agent) => `
    <div class="card" data-agent="${escapeHtml(agent.sessionId)}">
      <h3>${escapeHtml(agent.sessionId)}</h3>
      <p>${escapeHtml(agent.modelId ?? agent.adapterId ?? "agent")}</p>
      <span class="badge">${escapeHtml(agent.lifecycle ?? "unknown")}</span>
    </div>
  `).join("");

  $("work").innerHTML = (field.work ?? []).map((work) => {
    const c = coverage.get(work.workId);
    return `
      <div class="card ${escapeHtml(c?.status ?? "")}" data-work="${escapeHtml(work.workId)}">
        <h3>${escapeHtml(work.stepId ?? work.workId)}</h3>
        <p>${escapeHtml(work.objective ?? work.status ?? "")}</p>
        <span class="badge">${escapeHtml(c?.status ?? "inactive")}</span>
      </div>
    `;
  }).join("");

  $("overlaps").innerHTML = (field.overlaps ?? []).length
    ? field.overlaps.map((x) => item(`${escapeHtml(x.kind)}: ${escapeHtml(x.leftWorkId)} ↔ ${escapeHtml(x.rightWorkId)}<br><small>${escapeHtml((x.refs ?? []).join(", "))}</small>`)).join("")
    : '<div class="empty">None</div>';

  $("contentions").innerHTML = (field.contentions ?? []).length
    ? field.contentions.map((x) => item(`${escapeHtml(x.source)} · ${escapeHtml(x.severity)}<br><small>${escapeHtml((x.refs ?? []).join(", "))}</small>`)).join("")
    : '<div class="empty">None</div>';

  $("gaps").innerHTML = (field.evidenceGaps ?? []).length
    ? field.evidenceGaps.map((x) => item(`${escapeHtml(x.workId)}: ${escapeHtml(x.type)}`)).join("")
    : '<div class="empty">None</div>';

  requestAnimationFrame(() => drawLinks(field));
}

function drawLinks(field) {
  const court = document.querySelector(".court").getBoundingClientRect();
  const svg = $("links");
  svg.innerHTML = "";

  for (const c of field.coverage ?? []) {
    if (!c.sessionId) continue;
    const agent = document.querySelector(`[data-agent="${CSS.escape(c.sessionId)}"]`);
    const work = document.querySelector(`[data-work="${CSS.escape(c.workId)}"]`);
    if (!agent || !work) continue;

    const a = agent.getBoundingClientRect();
    const w = work.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.left + a.width / 2 - court.left);
    line.setAttribute("y1", a.bottom - court.top);
    line.setAttribute("x2", w.left + w.width / 2 - court.left);
    line.setAttribute("y2", w.top - court.top);
    line.setAttribute("stroke", c.status === "uncovered" ? "#dc2626" : c.status === "degraded" ? "#d97706" : "#9ca3af");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-dasharray", c.status === "uncovered" ? "6 5" : "none");
    svg.appendChild(line);
  }
}

$("demo-clean").addEventListener("click", () => render(cleanDemo));
$("demo-loss").addEventListener("click", () => render(workerLossDemo));
$("file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    render(JSON.parse(await file.text()));
  } catch (error) {
    $("status").textContent = `Could not parse file: ${error.message}`;
  }
});
window.addEventListener("resize", () => {
  if (currentField) drawLinks(currentField);
});
render(cleanDemo);

