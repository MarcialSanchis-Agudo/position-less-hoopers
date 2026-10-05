function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortLabel(id) {
  return id
    .replaceAll("_", " ")
    .replace("short roll connector", "short-roll connector")
    .replace("weak side lift", "weak-side lift");
}

function courtTransform(panel) {
  const padX = 34;
  const padTop = 42;
  const padBottom = 34;
  const usableW = panel.w - padX * 2;
  const usableH = panel.h - padTop - padBottom;

  return {
    x: (value) => panel.x + padX + (value / 10) * usableW,
    y: (value) =>
      panel.y + panel.h - padBottom - (value / 10) * usableH
  };
}

function court(panel, title, subtitle, clock) {
  const t = courtTransform(panel);
  const left = t.x(0);
  const right = t.x(10);
  const bottom = t.y(0);
  const top = t.y(10);
  const hoopX = t.x(5);
  const hoopY = t.y(0.7);

  return `
    <g>
      <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}"
        rx="22" fill="#101827" stroke="#26334a" stroke-width="1.5"/>
      <text x="${panel.x + 28}" y="${panel.y + 30}" class="panel-title">${esc(title)}</text>
      <text x="${panel.x + 28}" y="${panel.y + 50}" class="panel-sub">${esc(subtitle)}</text>
      <text x="${panel.x + panel.w - 28}" y="${panel.y + 32}" text-anchor="end" class="clock">${esc(clock)}</text>

      <rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"
        rx="6" fill="#121d30" stroke="#526076" stroke-width="1.5"/>
      <line x1="${left}" y1="${t.y(8.8)}" x2="${right}" y2="${t.y(8.8)}"
        stroke="#26364c" stroke-width="1"/>
      <rect x="${t.x(3.55)}" y="${t.y(4.15)}"
        width="${t.x(6.45)-t.x(3.55)}" height="${t.y(0)-t.y(4.15)}"
        fill="none" stroke="#526076" stroke-width="1.4"/>
      <circle cx="${hoopX}" cy="${hoopY}" r="6"
        fill="none" stroke="#f59e0b" stroke-width="2.4"/>
      <line x1="${t.x(4.25)}" y1="${t.y(0.45)}" x2="${t.x(5.75)}" y2="${t.y(0.45)}"
        stroke="#526076" stroke-width="2"/>
      <path d="M ${t.x(1.2)} ${t.y(0)}
               L ${t.x(1.2)} ${t.y(2.25)}
               A ${(t.x(8.8)-t.x(1.2))/2} ${t.y(0)-t.y(5.7)}
                 0 0 0 ${t.x(8.8)} ${t.y(2.25)}
               L ${t.x(8.8)} ${t.y(0)}"
        fill="none" stroke="#526076" stroke-width="1.4"/>
      <circle cx="${hoopX}" cy="${t.y(4.15)}"
        r="${Math.abs(t.y(4.15)-t.y(2.35))}"
        fill="none" stroke="#3a4960" stroke-width="1"/>
    </g>
  `;
}

function playerNode(panel, player, offense = true, ball = false) {
  const t = courtTransform(panel);
  const loc = player.location ?? player.position;
  const x = t.x(loc.x);
  const y = t.y(loc.y);
  const cls = offense ? "offense" : "defense";

  return `
    <g>
      <circle cx="${x}" cy="${y}" r="16" class="${cls}"/>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="player-label">${esc(player.id)}</text>
      ${offense && player.nominalPosition ? `
        <text x="${x}" y="${y + 31}" text-anchor="middle" class="player-meta">
          ${esc(player.nominalPosition)} · ${esc((player.archetypes ?? []).slice(0, 2).map((a) => a.id.replaceAll("_", " ")).join(" / "))}
        </text>
      ` : ""}
      ${ball ? `<circle cx="${x + 18}" cy="${y - 14}" r="6" fill="#fb923c" stroke="#fed7aa" stroke-width="1.5"/>` : ""}
    </g>
  `;
}

function needTarget(panel, need, agentId, index) {
  const t = courtTransform(panel);
  const x = t.x(need.target.x);
  const y = t.y(need.target.y);
  const labelDx = index % 2 === 0 ? 12 : -12;
  const anchor = index % 2 === 0 ? "start" : "end";

  return `
    <g>
      <circle cx="${x}" cy="${y}" r="7" fill="#fbbf24" stroke="#fde68a" stroke-width="2"/>
      <text x="${x + labelDx}" y="${y - 10}" text-anchor="${anchor}" class="need-label">
        ${esc(shortLabel(need.id))}
      </text>
      <text x="${x + labelDx}" y="${y + 6}" text-anchor="${anchor}" class="need-agent">
        to ${esc(agentId)}
      </text>
    </g>
  `;
}

function assignmentArrows(panel, scenario, target) {
  const t = courtTransform(panel);
  return target.needs.map((need) => {
    const agentId = target.assignment[need.id];
    const agent = scenario.agents.find((item) => item.id === agentId);
    if (!agent) return "";
    const x1 = t.x(agent.location.x);
    const y1 = t.y(agent.location.y);
    const x2 = t.x(need.target.x);
    const y2 = t.y(need.target.y);

    if (Math.hypot(x2-x1, y2-y1) < 16) return "";

    return `
      <path d="M ${x1} ${y1} L ${x2} ${y2}"
        stroke="#fbbf24" stroke-width="2.2" stroke-dasharray="7 6"
        fill="none" opacity="0.86" marker-end="url(#gold-arrow)"/>
    `;
  }).join("");
}

export function renderHoopersArenaFigure({ scenario, result }) {
  const width = 1440;
  const height = 820;
  const before = { x: 54, y: 126, w: 610, h: 560 };
  const after = { x: 776, y: 126, w: 610, h: 560 };

  const initialNeeds = result.initialTarget.needs;
  const trapNeeds = result.trapTarget.needs;

  const initialDefenders = scenario.initialState.defenders ?? [];
  const trapDefenders = scenario.trapState.defenders ?? [];

  const body = `
  <defs>
    <marker id="gold-arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24"/>
    </marker>
    <filter id="soft-glow">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="100%" height="100%" fill="#08111f"/>
  <text x="54" y="48" class="eyebrow">HOOPERS ARENA / CONTROLLED COORDINATION STUDY</text>
  <text x="54" y="82" class="hero">LAST POSSESSION</text>
  <text x="54" y="106" class="hero-sub">Same players. New state. New functions.</text>

  <g transform="translate(1045,34)">
    <rect x="0" y="0" width="341" height="68" rx="16" fill="#0f1b2e" stroke="#334155"/>
    <text x="20" y="25" class="stat-kicker">EXACT SEARCH</text>
    <text x="20" y="51" class="stat-main">120 feasible 5v5 assignments</text>
  </g>

  ${court(before, "12.0s - MAN COVERAGE", "Initial coordination target", "TIE / 12")}
  ${court(after, "8.0s - HARD TRAP", "State changes -> functions emerge", "TIE / 8")}

  ${initialDefenders.map((p) => playerNode(before, p, false, false)).join("")}
  ${scenario.agents.map((p) =>
    playerNode(before, p, true, p.id === scenario.initialState.ballHandler)
  ).join("")}

  ${trapDefenders.map((p) => playerNode(after, p, false, false)).join("")}
  ${assignmentArrows(after, scenario, result.trapTarget)}
  ${scenario.agents.map((p) =>
    playerNode(after, p, true, p.id === scenario.trapState.ballHandler)
  ).join("")}

  ${initialNeeds.map((need, i) =>
    needTarget(before, need, result.initialTarget.assignment[need.id], i)
  ).join("")}

  ${trapNeeds.map((need, i) =>
    needTarget(after, need, result.trapTarget.assignment[need.id], i)
  ).join("")}

  <g transform="translate(54,718)">
    <rect width="1332" height="70" rx="18" fill="#0e192a" stroke="#26364c"/>
    <text x="24" y="25" class="footer-head">ROLE-FIRST</text>
    <text x="24" y="49" class="footer-copy">creator / shooter / screener / wing / big</text>

    <line x1="420" y1="16" x2="420" y2="54" stroke="#334155"/>

    <text x="452" y="25" class="footer-head">NEED-FIRST / PLH</text>
    <text x="452" y="49" class="footer-copy">ball security / outlet / connector / lift / rim window</text>

    <line x1="970" y1="16" x2="970" y2="54" stroke="#334155"/>

    <text x="1000" y="25" class="footer-head">ORACLE REGRET</text>
    <text x="1000" y="49" class="footer-copy">
      PLH 0 / dyn. ${result.trap.dynamicPredefinedRoles.oracleRegret.toFixed(3)} / archetype ${result.trap.fixedArchetype.oracleRegret.toFixed(3)} / pos. ${result.trap.fixedPosition.oracleRegret.toFixed(3)}
    </text>
  </g>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="0 0 ${width} ${height}" role="img"
    aria-labelledby="title desc">
    <title id="title">Hoopers Arena - Last Possession 5v5</title>
    <desc id="desc">A five-on-five controlled coordination example. The defense changes from man coverage to a hard trap, causing PLH to derive new temporary functions and compute the exact best assignment among 120 feasible configurations.</desc>
    <style>
      text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .eyebrow { fill:#67e8f9; font-size:13px; font-weight:700; letter-spacing:2.2px; }
      .hero { fill:#f8fafc; font-size:30px; font-weight:800; letter-spacing:1px; }
      .hero-sub { fill:#94a3b8; font-size:15px; }
      .panel-title { fill:#f8fafc; font-size:15px; font-weight:800; letter-spacing:0.7px; }
      .panel-sub { fill:#94a3b8; font-size:11px; }
      .clock { fill:#fbbf24; font-size:16px; font-weight:800; }
      .offense { fill:#0f7490; stroke:#67e8f9; stroke-width:2.6; filter:url(#soft-glow); }
      .defense { fill:#7f1d1d; stroke:#fca5a5; stroke-width:2; }
      .player-label { fill:#f8fafc; font-size:12px; font-weight:800; }
      .player-meta { fill:#93c5fd; font-size:8.5px; font-weight:600; }
      .need-label { fill:#fde68a; font-size:10.5px; font-weight:700; }
      .need-agent { fill:#94a3b8; font-size:9.5px; font-weight:600; }
      .stat-kicker { fill:#67e8f9; font-size:10px; font-weight:800; letter-spacing:1.6px; }
      .stat-main { fill:#f8fafc; font-size:18px; font-weight:800; }
      .footer-head { fill:#67e8f9; font-size:10px; font-weight:800; letter-spacing:1.4px; }
      .footer-copy { fill:#e2e8f0; font-size:12px; font-weight:600; }
    </style>
    ${body}
  </svg>`;
}

