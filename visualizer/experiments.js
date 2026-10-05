const data = window.PLH_EXPERIMENT_DATA;

const views = {
  crossover: {
    title: "Context-cost crossover",
    caption: "Where capability+situatedness overtakes capability-only as reconstructing context becomes more expensive.",
    src: "../artifacts/figures/p1-context-cost-crossover.svg",
    alt: "Synthetic utility curves across context-loss costs."
  },
  regimes: {
    title: "Cheap vs expensive context reload",
    caption: "Two regimes make the tradeoff visible: capability dominates when reload is cheap; situatedness dominates when reload is costly.",
    src: "../artifacts/figures/p1-policy-regimes.svg",
    alt: "Policy utilities under cheap and expensive context reload."
  },
  sensitivity: {
    title: "Situatedness-weight sensitivity",
    caption: "Synthetic regret as the locality coefficient changes; the current development coefficient is 0.35.",
    src: "../artifacts/figures/p1-situatedness-sensitivity.svg",
    alt: "Sensitivity of synthetic regret to situatedness weight."
  },
  calibration: {
    title: "Capability gap × context cost",
    caption: "Decision correctness for the frozen matcher across different synthetic ground-truth regimes.",
    src: "../artifacts/figures/p1-context-calibration.svg",
    alt: "Calibration heatmap."
  },
  court: {
    title: "CourtShift worker loss",
    caption: "P0 visualization of coverage before and after an active worker disappears.",
    src: "../artifacts/figures/p0-courtshift-worker-loss.svg",
    alt: "Before and after worker loss."
  }
};

function metric(label, value) {
  const shown = typeof value === "number" ? value.toFixed(3) : value;
  return `<div class="metric"><strong>${shown}</strong><span>${label}</span></div>`;
}

document.getElementById("summary").innerHTML = [
  metric("Estimated crossover cost", data.crossover.estimatedPenalty),
  metric("Frozen situatedness weight", data.sensitivity.frozenWeight),
  metric("Synthetic best weight(s)", data.sensitivity.bestWeights.join(" / ")),
  metric("Frozen mean regret", data.sensitivity.frozenMeanRegret)
].join("");

function policyTable(rows) {
  return `<table>
    <thead><tr><th>Policy</th><th>Mean utility</th><th>Context reload rate</th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr><td>${row.mode}</td><td>${row.meanUtility.toFixed(3)}</td><td>${row.meanContextReloadRate.toFixed(3)}</td></tr>`).join("")}
    </tbody>
  </table>`;
}

function renderDetails(view) {
  if (view === "regimes") {
    return `
      <p><strong>Cheap reload = ${data.policyRegimes.cheapPenalty}</strong></p>
      ${policyTable(data.policyRegimes.cheap)}
      <p><strong>Expensive reload = ${data.policyRegimes.expensivePenalty}</strong></p>
      ${policyTable(data.policyRegimes.expensive)}
    `;
  }
  if (view === "crossover") {
    return `
      <div class="note">Estimated synthetic crossover: <strong>${data.crossover.estimatedPenalty.toFixed(3)}</strong>. This is a simulation result, not a real-agent threshold.</div>
      <table>
        <thead><tr><th>Context penalty</th><th>Capability</th><th>Situated</th><th>Δ situated-capability</th></tr></thead>
        <tbody>
          ${data.crossover.rows.map((row) => `<tr><td>${row.trueMissingContextPenalty.toFixed(3)}</td><td>${row.capabilityMeanUtility.toFixed(3)}</td><td>${row.situatedMeanUtility.toFixed(3)}</td><td>${row.situatedMinusCapability.toFixed(3)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }
  if (view === "sensitivity") {
    return `<div class="note">Synthetic minimum regret occurs at situatedness weights <strong>${data.sensitivity.bestWeights.join(" and ")}</strong>; the development matcher remains frozen at <strong>${data.sensitivity.frozenWeight}</strong> until real context-reload measurements exist.</div>`;
  }
  if (view === "court") {
    return '<div class="note">The court visualization is P0 observability only: coverage changes are measured, but automatic reassignment is not yet part of this figure.</div>';
  }
  return '<div class="note">Green cells indicate the frozen matcher picked the synthetic optimum; red cells show calibration error.</div>';
}

function select(view) {
  const spec = views[view];
  document.querySelectorAll("#tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.getElementById("figure-title").textContent = spec.title;
  document.getElementById("figure-caption").textContent = spec.caption;
  const img = document.getElementById("figure");
  img.src = spec.src;
  img.alt = spec.alt;
  document.getElementById("details").innerHTML = renderDetails(view);
}

document.getElementById("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (button) select(button.dataset.view);
});

select("crossover");

