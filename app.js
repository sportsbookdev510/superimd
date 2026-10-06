import { createGraph } from "./graph.js?v=12";
import {
  ago,
  badge,
  chainAnchor,
  clock,
  delta,
  easternTime,
  esc,
  pad,
  shortId,
  stamp,
  unavail,
} from "./format.js?v=3";

const nav = document.querySelector("#nav");
const metricsEl = document.querySelector("#metrics");
const statusEl = document.querySelector("#status-cluster");
const stage = document.querySelector("#stage");
const inspector = document.querySelector("#inspector");

const VIEWS = [
  ["start", "Start"],
  ["network", "Network"],
  ["agents", "Agents"],
  ["jobs", "Jobs"],
  ["oracles", "Oracles"],
  ["memory", "Memory"],
  ["hire", "Hire"],
  ["contest", "Contest"],
  ["bounties", "Bounties"],
  ["experimental", "Experimental"],
  ["thesis", "Thesis"],
  ["sent", "Sent"],
  ["token", "$SIMD"],
  ["feedback", "Feedback"],
  ["forum", "Forum"],
  ["docs", "Docs"],
  ["logs", "Logs"],
  ["simd", "SIMD"],
];

const START_SEEN_KEY = "simd_start_seen_v2";

function hasSeenStart() {
  try {
    return localStorage.getItem(START_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markStartSeen() {
  try {
    localStorage.setItem(START_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}

const ui = {
  state: null,
  view: "network",
  graph: null,
  mounted: "",
  streamFilter: "NETWORK",
  agentQuery: "",
  agentStatus: "all",
  agentSort: "lastActivity",
  agentDir: -1,
  agentPage: 0,
  memoryTab: "working",
  inspector: null,
  absorb: null,
  seenStream: null,
  hireWallet: null,
  hireStatus: "",
  hireOutcome: null,
  hirePaying: false,
  hireKind: "report",
  hireObjective: "",
  hireRefs: [],
  hireInputs: [],
  hireCheck: null,
  hireSentSummary: null,
  sentFilter: "all",
  sentTasks: null,
  tokenMarket: null,
  contest: null,
  contestMission: null,
  contestStatus: "",
  bounties: null,
  bountyAlgo: "keccak256",
  bountyStatus: "",
  feedback: null,
  feedbackKind: "suggestion",
  feedbackStatus: "",
  feedbackOpenId: null,
  feedbackReplyDraft: {},
  forum: null,
  forumStatus: "",
  forumView: "board", // board | section | thread
  forumSectionId: null,
  forumSection: null,
  forumThreadId: null,
  forumThread: null,
  forumNameDraft: "",
  experimental: null,
  experimentalStatus: "",
  experimentalDraft: "",
  thesis: null,
  thesisStatus: "",
  thesisDraft: { thesis: "", tweetUrl: "", wallet: "" },
  thesisOpenId: null,
};

const HIRE_KINDS = [
  ["report", "Report", "Write a sourced report on…"],
  ["image", "Image", "Create a 1920x1080 image of…"],
  ["audio", "Audio", "Create a short audio piece about…"],
  ["video", "Video", "Create a short video about…"],
];

const STAGES = [
  "observe",
  "retrieve",
  "analyze",
  "plan",
  "act",
  "verify",
  "memorize",
];
const ABSORB = [
  "Live network",
  "Graph",
  "Observe",
  "Network delta",
  "Cycle",
  "Memory",
];

function viewFromHash() {
  const name = location.hash.replace("#", "");
  if (name === "forum") {
    location.replace("/forum/");
    return "start";
  }
  if (VIEWS.some(([id]) => id === name)) return name;
  // Bare https://www.si-md.xyz/ always opens Start (home).
  return "start";
}

function metricValue(metric) {
  if (metric.value == null) return unavail(metric.unavailable || "UNAVAILABLE");
  if (metric.kind === "time")
    return `<b class="time">${esc(easternTime(metric.value))}</b>`;
  return `<b>${esc(metric.value)}${delta(metric.delta)}</b>`;
}

function renderChrome() {
  const state = ui.state;
  const health = state.sources.find(
    (item) => item.name === "IMD control plane"
  );
  const connected = health?.status === "CONNECTED";
  document.body.dataset.view = ui.view;
  if (nav.dataset.view !== ui.view) {
    nav.dataset.view = ui.view;
    const navViews =
      ui.view === "start"
        ? [
            ["network", "Network"],
            ["forum", "Forum"],
            ["docs", "Docs"],
          ]
        : VIEWS;
    nav.innerHTML = navViews
      .map(([id, label]) => {
        if (id === "forum") {
          return `<a href="/forum/">${label}</a>`;
        }
        return `<a href="#${id}" class="${
          ui.view === id ? "on" : ""
        }">${label}</a>`;
      })
      .join("");
  }
  statusEl.innerHTML = `
    <span class="net"><i class="${
      connected ? "" : "bad"
    }"></i>Mainnet · chain 1</span>
    <span>IMD ${connected ? "connected" : "unavailable"}</span>
    <span>Cycle #${pad(state.intel.cycle)}</span>
    <span>${esc(easternTime(state.fetchedAt))}</span>
    <span data-ago="${esc(state.fetchedAt)}">${esc(
    ago(state.fetchedAt)
  )}</span>`;
  metricsEl.innerHTML = state.metrics
    .map(
      (metric) => `
    <article class="metric" title="${esc(metric.source)}">
      ${
        metric.kind === "time"
          ? metricValue(metric)
          : metric.value == null
          ? `<b class="unavail">${esc(metric.unavailable)}</b>`
          : `<b>${esc(metric.value)}</b>`
      }
      <span class="label">${esc(metric.label)}${
        metric.kind === "time" && metric.value
          ? ` · <span data-ago="${esc(metric.value)}">${esc(
              ago(metric.value)
            )}</span>`
          : ""
      } ${delta(metric.delta)}</span>
      <span class="src">${badge(metric.badge)} ${esc(metric.source)}</span>
    </article>`
    )
    .join("");
}

function openInspector(ref) {
  ui.inspector = ref;
  ui.jobDetail = null;
  renderInspector();
  if (ref?.type === "job" && ref.id) loadJobDetail(ref.id);
}

async function loadJobDetail(id) {
  try {
    const response = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
    const body = await response.json();
    if (ui.inspector?.type !== "job" || ui.inspector.id !== id) return;
    ui.jobDetail = response.ok
      ? body
      : { error: body.error || "job read failed", source: "GET /jobs/:id" };
  } catch {
    if (ui.inspector?.type === "job" && ui.inspector.id === id) {
      ui.jobDetail = { error: "job read failed", source: "GET /jobs/:id" };
    }
  }
  renderInspector();
}

function closeInspector() {
  ui.inspector = null;
  inspector.hidden = true;
  inspector.innerHTML = "";
}

function relatedStream(predicate) {
  return (ui.state.stream || []).filter(predicate).slice(0, 8);
}

function entityTrace(nodeId, tokenId, jobId) {
  const stream = ui.state.stream || [];
  const hits = stream.filter(
    (event) =>
      event.entityId === nodeId ||
      (tokenId && event.tokenId === String(tokenId)) ||
      (jobId && event.jobId === jobId)
  );
  const first = hits.reduce(
    (best, event) =>
      !best || String(event.at) < String(best.at) ? event : best,
    null
  );
  const last = hits.reduce(
    (best, event) =>
      !best || String(event.at) > String(best.at) ? event : best,
    null
  );
  const edges = (ui.state.graph?.edges || []).filter(
    (edge) => edge.source === nodeId || edge.target === nodeId
  );
  const cycles = (ui.state.cycles || []).filter((cycle) =>
    [...(cycle.observations || []), ...(cycle.executed || [])].some((item) =>
      (item.entityIds || []).includes(nodeId)
    )
  );
  const relText = edges.length
    ? edges
        .slice(0, 6)
        .map(
          (edge) =>
            `${edge.rel} ${edge.source === nodeId ? edge.target : edge.source}`
        )
        .join(" · ")
    : "None in the current graph focus";
  return `
    <span>Relationships</span><div>${esc(relText)}</div>
    <span>Activity</span><div>${
      hits.length
        ? `${hits.length} retained stream rows`
        : "None in the retained stream"
    }</div>
    <span>First observed</span><div>${
      first ? esc(stamp(first.at)) : "Not in the retained event window"
    }</div>
    <span>Last observed</span><div>${
      last ? esc(stamp(last.at)) : "Latest snapshot only"
    }</div>
    <span>SIMD cycles</span><div>${
      cycles.length
        ? cycles.map((cycle) => `#${pad(cycle.number)}`).join(" · ")
        : "None in the loaded cycles"
    }</div>`;
}

function absorbInner() {
  const step = ui.absorb ? ui.absorb.step : -1;
  const steps = ABSORB.map(
    (label, index) =>
      `<span class="${step >= index ? "on" : ""}">${label}</span>`
  ).join(`<i>→</i>`);
  const caption = ui.absorb
    ? ui.absorb.title
    : "Waiting for the next IMD change";
  return `${steps}<em>${esc(caption)}</em>`;
}

function machineMarkup(machine, objective) {
  return `
    <div class="panel-head"><h2>SIMD</h2><p class="hint">Cycle #${pad(
      machine.number
    )} · ${machine.running ? "running" : "complete"}</p></div>
    <p class="objective-line">${badge("SIMD DERIVED")} ${esc(
    objective || ""
  )}</p>
    <div class="machine">
      ${(machine.stages || [])
        .map(
          (stage) => `
        <article class="mstage ${esc(stage.status)}">
          <header><b>${esc(stage.name)}</b><em>${esc(
            stage.status
          )}</em></header>
          ${
            stage.lines?.length && stage.status !== "waiting"
              ? `<ul>${stage.lines
                  .slice(0, 3)
                  .map((line) => `<li>${esc(line)}</li>`)
                  .join("")}</ul>`
              : ""
          }
        </article>`
        )
        .join("")}
    </div>
    <p class="src-line">Structured stage outputs from the cycle record. No chain-of-thought is stored.</p>`;
}

function intelligenceMarkup(report) {
  const chips = report.delta.length
    ? report.delta
        .map(
          (item) =>
            `<span class="delta-chip ${
              item.signed ? (item.value > 0 ? "up" : "down") : ""
            }">${item.signed && item.value > 0 ? "+" : ""}${esc(
              item.value
            )} ${esc(item.label)}</span>`
        )
        .join("")
    : `<p class="hint">${esc(report.deltaNote)}</p>`;
  const list = (items, render, empty) =>
    items.length
      ? `<ul class="intel-list">${items.map(render).join("")}</ul>`
      : `<p class="hint">${empty}</p>`;
  return `
    <div class="panel-head"><h2>Network intelligence</h2><p class="hint">${badge(
      "SIMD DERIVED"
    )} deterministic</p></div>
    <div class="intel-block">
      <h3>Network delta</h3>
      <div class="delta-row">${chips}</div>
      <p class="src-line">${esc(report.deltaNote)}</p>
    </div>
    <div class="intel-block">
      <h3>Most active</h3>
      ${list(
        report.active,
        (item) =>
          `<li><button type="button" data-open="agent" data-id="${esc(
            item.tokenId
          )}"><span>${esc(item.label)}</span><span class="mono">${esc(
            item.count
          )}</span></button></li>`,
        "No seat has a retained stream row."
      )}
      <p class="src-line">${esc(report.activeNote)}</p>
    </div>
    <div class="intel-block">
      <h3>Recent relationships</h3>
      ${list(
        report.relationships,
        (item) =>
          `<li><span>${esc(item.text)}</span> ${badge(item.badge)}</li>`,
        "No seat–job or oracle–job pair in the retained window."
      )}
    </div>
    <div class="intel-block">
      <h3>State changes</h3>
      ${list(
        report.changes,
        (item) =>
          `<li><span>${esc(item.title)}</span> ${badge(item.badge)}</li>`,
        "No snapshot diff in the retained stream."
      )}
    </div>
    <div class="intel-block">
      <h3>Anomalies</h3>
      ${list(
        report.anomalies,
        (item) =>
          `<li><span>${esc(item.text)}</span><span class="src-line">${esc(
            item.source
          )}</span></li>`,
        "No deterministic rule matched."
      )}
    </div>`;
}

function modelMarkup(model) {
  const rows = (model.nodes || [])
    .map(
      (node) => `<tr>
    <td class="mono">${esc(node.kind)}</td>
    <td>${esc(node.label)}</td>
    <td class="mono">${esc(node.source || "")}</td>
    <td class="mono">${node.firstSeen ? esc(stamp(node.firstSeen)) : "—"}</td>
    <td class="mono">${node.lastSeen ? esc(stamp(node.lastSeen)) : "—"}</td>
  </tr>`
    )
    .join("");
  return `
    <div class="panel-head"><h2>Network model</h2><p class="hint">${badge(
      model.badge
    )} what SIMD has stored</p></div>
    <div class="model-metrics">
      <div><b>${esc(model.entities)}</b><span>entities</span></div>
      <div><b>${esc(model.relationships)}</b><span>relationships</span></div>
      <div><b>${esc(model.memoryWrites)}</b><span>memory writes</span></div>
      <div><b>${esc(model.memoriesActive)}</b><span>memories active</span></div>
      <div><b>${esc(
        model.changed24h
      )}</b><span>entities changed / 24h</span></div>
    </div>
    <details class="model-open">
      <summary>Open model</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Label</th><th>Source</th><th>First</th><th>Last</th></tr></thead>
        <tbody>${
          rows || `<tr><td colspan="5">No stored nodes yet.</td></tr>`
        }</tbody>
      </table></div>
      <p class="src-line">${esc(
        model.seatsInSnapshot
      )} seats are in the latest IMD snapshot. ${esc(
    model.entities
  )} nodes and ${esc(
    model.relationships
  )} edges are what SIMD has written. ${esc(model.source)}.</p>
    </details>`;
}

function renderInspector() {
  const ref = ui.inspector;
  if (!ref) return;
  const state = ui.state;
  let title = "Record";
  let body = "";
  if (ref.type === "agent") {
    const agent = state.agents.find(
      (item) => item.tokenId === String(ref.tokenId)
    );
    if (!agent) {
      body = unavail("NOT IN LATEST SNAPSHOT");
    } else {
      title =
        agent.agentId != null
          ? `Agent ${agent.agentId}`
          : `Seat ${agent.tokenId}`;
      const jobs = relatedStream(
        (event) => event.tokenId === agent.tokenId && event.jobId
      );
      body = `
        ${badge("IMD")}
        <div class="kv">
          <span>Identity</span><div>${
            agent.owner ? chainAnchor(agent.owner, 1) : unavail()
          }</div>
          <span>ERC-8004</span><div>${
            agent.agentId != null ? esc(agent.agentId) : unavail()
          }</div>
          <span>Seat</span><div>#${esc(agent.tokenId)}</div>
          <span>Status</span><div>${esc(agent.status)}</div>
          <span>Worker</span><div>${
            agent.online
              ? `Connected · ${esc(agent.runtime || "runtime unstated")}`
              : unavail("No connected daemon in GET /workers")
          }</div>
          <span>Accepted</span><div>${
            agent.accepted == null ? unavail() : esc(agent.accepted)
          } <span class="mono">attempts ${esc(
        agent.attempts ?? "—"
      )}</span></div>
          <span>Last activity</span><div>${
            agent.lastActivity
              ? `${esc(stamp(agent.lastActivity))} · ${esc(
                  ago(agent.lastActivity)
                )}`
              : unavail()
          }</div>
          <span>Heartbeat</span><div>${
            agent.heartbeat ? esc(stamp(agent.heartbeat)) : unavail()
          }</div>
          <span>Source</span><div>${esc(
            agent.sources.join(" · ") || "IMD"
          )}</div>
          <span>Verified</span><div>${esc(stamp(agent.retrievedAt))}</div>
          ${entityTrace(`seat:${agent.tokenId}`, agent.tokenId)}
        </div>
        <h3>Capabilities</h3>
        ${
          agent.skills.length
            ? `<div class="skill-cloud">${agent.skills
                .map((skill) => `<span>${esc(skill)}</span>`)
                .join("")}</div>`
            : unavail("NOT EXPOSED FOR THIS SEAT")
        }
        <h3>Seen with jobs</h3>
        ${
          jobs.length
            ? jobs
                .map(
                  (event) =>
                    `<p>${esc(shortId(event.jobId))} · ${esc(event.title)}</p>`
                )
                .join("")
            : `<p class="hint">No job id co-occurs with this seat in the retained stream.</p>`
        }`;
    }
  } else if (ref.type === "job") {
    const job = state.jobs.find((item) => item.id === ref.id);
    const detail = ui.jobDetail && !ui.jobDetail.error ? ui.jobDetail : null;
    title = `Job ${shortId(ref.id)}`;
    const seats = relatedStream(
      (event) => event.jobId === ref.id && event.tokenId
    );
    body = `
      ${jobDetailMarkup(ref.id)}
      ${
        job || detail
          ? `
        <h3>Local graph</h3>
        <div class="kv">
          <span>On jobs page</span><div>${job ? "yes" : "no"}</div>
          <span>Updated</span><div>${
            detail?.updatedAt || job?.updatedAt
              ? esc(stamp(detail?.updatedAt || job.updatedAt))
              : unavail()
          }</div>
          ${entityTrace(`job:${ref.id}`, null, ref.id)}
        </div>
        <h3>Seats named with this job</h3>
        ${
          seats.length
            ? seats
                .map(
                  (event) =>
                    `<p>Seat ${esc(event.tokenId)} · ${esc(
                      event.detection
                    )}</p>`
                )
                .join("")
            : `<p class="hint">None in the retained stream.</p>`
        }`
          : ""
      }`;
  } else if (ref.type === "oracle") {
    const request = state.oracles.find((item) => item.id === ref.id);
    title = request ? `Oracle ${shortId(request.id)}` : "Oracle";
    body = request
      ? `
      ${badge("IMD")}
      <div class="kv">
        <span>Status</span><div>${esc(request.status)}</div>
        <span>Chain</span><div>${esc(request.chainId ?? "—")}</div>
        <span>Answer</span><div>${
          request.answerType ? esc(request.answerType) : unavail()
        }</div>
        <span>Signer</span><div>${
          request.signer
            ? chainAnchor(request.signer, request.chainId || 1)
            : unavail()
        }</div>
        <span>Job</span><div>${
          request.jobId ? esc(shortId(request.jobId)) : unavail()
        }</div>
        <span>Attested</span><div>${
          request.attestedAt ? esc(stamp(request.attestedAt)) : unavail()
        }</div>
        <span>Source</span><div>GET /oracle/requests</div>
        ${entityTrace(`oracle:${request.id}`)}
      </div>
      <p>${esc(request.question || "")}</p>`
      : unavail("NOT ON THE LATEST ORACLE PAGE");
  } else if (ref.type === "launch") {
    const launch = state.launches.find((item) => item.id === ref.id);
    title = launch
      ? `Launch ${launch.launchNumber ?? shortId(launch.id)}`
      : "Launch";
    body = launch
      ? `
      ${badge("IMD")}
      <div class="kv">
        <span>Status</span><div>${esc(launch.status)}</div>
        <span>Kind</span><div>${
          launch.kind ? esc(launch.kind) : unavail()
        }</div>
        <span>Chain</span><div>${esc(launch.chainId ?? "—")}</div>
        <span>Commit</span><div>${
          launch.sourceCommit
            ? esc(launch.sourceCommit.slice(0, 12))
            : unavail()
        }</div>
        <span>Source</span><div>GET /launches</div>
      </div>
      ${
        launch.sourceRepoUrl
          ? `<p><a href="${esc(
              launch.sourceRepoUrl
            )}" target="_blank" rel="noopener">Repository</a></p>`
          : ""
      }
      ${launch.parkedReason ? `<p>${esc(launch.parkedReason)}</p>` : ""}
      <p class="hint">IMD calls these launches. There is no separate public deployments collection.</p>`
      : unavail();
  } else if (ref.type === "simd") {
    title = "SIMD";
    body = `
      ${badge("SIMD")}
      <div class="kv">
        <span>State</span><div>${state.intel.running ? "Running" : "Idle"}</div>
        <span>Cycle</span><div>#${pad(state.intel.cycle)}</div>
        <span>Objective</span><div>${esc(state.intel.objective)}</div>
        <span>Seat</span><div>${esc(state.intel.seat.text)}</div>
      </div>
      <p class="hint">Local persistent identity. A configured seat is read from the public API and is not controlled by this process.</p>`;
  } else if (ref.type === "imd") {
    title = "IMD control plane";
    const health = state.swarm?.health;
    body = `
      ${badge("IMD")}
      <div class="kv">
        <span>Reachable</span><div>${
          health ? esc(health.reachable) : unavail()
        }</div>
        <span>Agents online</span><div>${
          health?.agentsOnline ?? unavail()
        }</div>
        <span>Jobs</span><div>${state.swarm?.counts?.jobs ?? unavail()}</div>
        <span>Chain</span><div>${
          state.swarm?.chain
            ? `${esc(state.swarm.chain.chainId)} · ${chainAnchor(
                state.swarm.chain.collection,
                state.swarm.chain.chainId
              )}`
            : unavail()
        }</div>
        <span>Source</span><div>GET /swarm · GET /health</div>
      </div>`;
  }
  inspector.hidden = false;
  inspector.innerHTML = `<header><h2>${esc(
    title
  )}</h2><button class="close" type="button" data-close>Close</button></header>${body}`;
  inspector
    .querySelector("[data-close]")
    .addEventListener("click", closeInspector);
}

function pipeline(stage) {
  return `<div class="pipeline">${STAGES.map((name, index) => {
    const on = stage === name;
    const arrow =
      index < STAGES.length - 1
        ? `<span class="arrow">↓</span>`
        : `<span class="arrow">↺</span>`;
    return `<span class="stage${on ? " on" : ""}">${name}</span>${arrow}`;
  }).join("")}</div>`;
}

function entityButtons(items, render) {
  if (!items.length)
    return `<p class="hint" style="padding:12px 14px">None in the current focus.</p>`;
  return `<ul class="entity-list">${items.map(render).join("")}</ul>`;
}

function seatFor(address) {
  const key = String(address || "").toLowerCase();
  if (!key) return null;
  return (
    ui.state?.agents?.find(
      (agent) => String(agent.owner || "").toLowerCase() === key
    ) || null
  );
}

function renderVault() {
  const vault = ui.state?.vault;
  const balance = document.querySelector("#vault-balance");
  const payouts = document.querySelector("#vault-payouts");
  const statsHost = document.querySelector("#vault-stats");
  const stats = vault?.stats;
  if (statsHost) {
    const cells = stats
      ? [
          [
            stats.tokenBurned || vault?.tokenBurned || "UNAVAILABLE",
            "SIMD burned",
          ],
          [stats.distributed, "IMD distributed"],
          [String(stats.jobsPaid), "Vault transfers"],
          [String(stats.recipients), "Recipients"],
        ]
      : [
          ["UNAVAILABLE", "SIMD burned"],
          ["UNAVAILABLE", "IMD distributed"],
          ["UNAVAILABLE", "Vault transfers"],
          ["UNAVAILABLE", "Recipients"],
        ];
    statsHost.innerHTML = `
      <div class="panel-head"><h2>Burn / payouts</h2><p class="hint">SIMD burned is the token balance at dead addresses. IMD distributed is outgoing vault payouts only.</p></div>
      <div class="vault-stats">
        ${cells
          .map(
            ([value, label]) =>
              `<article><b class="${
                value === "UNAVAILABLE" ? "unavail" : ""
              }">${esc(value)}</b><span>${esc(label)}</span></article>`
          )
          .join("")}
      </div>`;
  }
  if (balance) {
    balance.innerHTML = `
      <div class="panel-head"><h2>Vault</h2><p class="hint">${
        vault?.paused
          ? "paused"
          : vault?.status === "READ"
          ? "not paused"
          : "reading"
      }</p></div>
      <div class="kv">
        <span>Address</span><div>${
          vault?.address ? chainAnchor(vault.address, 1) : unavail()
        }</div>
        <span>Holds</span><div>${
          vault?.balance ? esc(vault.balance) : unavail()
        }</div>
        <span>SIMD</span><div>${
          vault?.tokenBalance ? esc(vault.tokenBalance) : unavail()
        }</div>
        <span>ETH</span><div>${vault?.eth ? esc(vault.eth) : unavail()}</div>
        <span>Pays</span><div>${
          vault?.payoutAmount
            ? `${esc(vault.share || "100%")} · ${esc(vault.payoutAmount)}`
            : unavail()
        }</div>
      </div>
      <p class="hint" style="padding:0 14px 14px">${esc(
        vault?.note || "Vault balance loads from Ethereum."
      )}</p>`;
  }
  if (payouts) {
    const rows = vault?.payouts || [];
    payouts.innerHTML = `
      <div class="panel-head"><h2>Payouts</h2><p class="hint">${
        rows.length
      } transaction${rows.length === 1 ? "" : "s"}</p></div>
      <div class="stream vault-log">
        ${
          rows.length
            ? rows
                .map((row) => {
                  const seat = seatFor(row.to);
                  const who = seat
                    ? seat.agentId != null
                      ? `Agent ${seat.agentId} · seat ${seat.tokenId}`
                      : `Seat ${seat.tokenId}`
                    : chainAnchor(row.to, 1);
                  return `<article class="event">
            <time>${esc(row.at ? easternTime(row.at) : "—")}</time>
            <div class="cat">${row.matchesShare ? "100%" : "PAYOUT"}</div>
            <div>
              <p>${esc(row.amount)} to ${seat ? esc(who) : who}</p>
              <div class="meta">${badge("ETH")} ${
                    row.tx ? chainAnchor(row.tx, 1) : unavail()
                  }</div>
            </div>
          </article>`;
                })
                .join("")
            : `<p class="hint" style="padding:12px 14px">No outgoing transfer from the vault yet.</p>`
        }
      </div>`;
  }
}

function filePreviewMarkup(file) {
  if (!file?.url) return "";
  if (file.kind === "image") {
    return `<figure class="result-media"><img src="${esc(file.url)}" alt="${esc(
      file.name || "image"
    )}" loading="lazy"></figure>`;
  }
  if (file.kind === "audio") {
    return `<div class="result-media"><audio controls preload="metadata" src="${esc(
      file.url
    )}"></audio></div>`;
  }
  if (file.kind === "video") {
    return `<div class="result-media"><video controls preload="metadata" src="${esc(
      file.url
    )}"></video></div>`;
  }
  if (file.kind === "text" && file.text != null) {
    return `<pre class="result-text">${esc(file.text)}</pre>`;
  }
  return `<p class="hint"><a href="${esc(
    file.url
  )}" target="_blank" rel="noopener">Open ${esc(file.name || "file")}</a></p>`;
}

function jobDetailMarkup(id) {
  const detail = ui.jobDetail;
  if (!detail)
    return `<p class="hint">Reading GET /jobs/${esc(shortId(id))}.</p>`;
  if (detail.error)
    return `<p class="hint">${esc(detail.error)} · ${esc(
      detail.source || "GET /jobs/:id"
    )}</p>`;
  const versions = detail.project?.versions;
  const repo =
    typeof detail.delivery?.repoUrl === "string" &&
    detail.delivery.repoUrl.startsWith("https://")
      ? detail.delivery.repoUrl
      : null;
  const files = Array.isArray(detail.result?.files) ? detail.result.files : [];
  return `
    ${badge("IMD")}
    <div class="kv">
      <span>State</span><div>${esc(detail.state || "—")}${
    detail.result?.complete ? " · complete" : ""
  }</div>
      <span>Template</span><div>${
        detail.template ? esc(detail.template) : unavail()
      }</div>
      <span>Blocked</span><div>${
        detail.blockedReason ? esc(detail.blockedReason) : "none"
      }</div>
      <span>Paid by</span><div>${
        detail.paidBy ? chainAnchor(detail.paidBy, 1) : "none"
      }</div>
      <span>Continues</span><div>${
        detail.parentJobId ? esc(shortId(detail.parentJobId)) : unavail()
      }</div>
      <span>Project</span><div>${
        versions != null ? `${esc(versions)} versions` : unavail()
      }</div>
      <span>Delivery</span><div>${
        repo
          ? `<a href="${esc(repo)}" target="_blank" rel="noopener">${esc(
              repo
            )}</a>`
          : unavail()
      }</div>
      <span>Source</span><div class="mono">${esc(
        detail.source || "GET /jobs/:id"
      )}</div>
    </div>
    ${
      detail.objective
        ? `<h3>Objective</h3><p class="result-objective">${esc(
            detail.objective
          )}</p>`
        : ""
    }
    <h3>Agent output</h3>
    ${
      detail.result?.available === false
        ? `<p class="hint">${esc(
            detail.result.error || "Result not ready yet."
          )}</p>`
        : ""
    }
    ${
      files.length
        ? files
            .map(
              (file) => `
      <article class="result-file">
        <div class="meta">${esc(file.name || "file")} · ${esc(
                file.mediaType || "—"
              )}${file.bytes != null ? ` · ${esc(file.bytes)} B` : ""}</div>
        ${filePreviewMarkup(file)}
      </article>`
            )
            .join("")
        : `<p class="hint">${
            detail.result?.complete
              ? "No files on GET /jobs/:id/result."
              : "Waiting for the swarm result."
          }</p>`
    }
    <p class="hint"><a href="${esc(
      detail.explorerUrl || `https://explorer.imd.fun/jobs/${id}`
    )}" target="_blank" rel="noopener">Open on Identity.md explorer</a></p>`;
}

function renderEcosystem() {
  const host = document.querySelector("#ecosystem");
  if (!host) return;
  const eco = ui.state?.ecosystem;
  const steps = eco?.steps;
  const max = steps ? Math.max(1, ...steps.accepted) : 1;
  const shipped = eco?.shipped;
  const shipOrder = [
    "all",
    "contracts",
    "tokens",
    "sites",
    "research",
    "code",
    "media",
    "audits",
  ];
  const schedules = eco?.schedules;
  const records = eco?.records;
  host.innerHTML = `
    <div class="panel-head"><h2>Ecosystem</h2><p class="hint">Public Identity.md reads. SIMD did not open this work.</p></div>
    <div class="eco-grid">
      <section>
        <h3>Accepted steps · 24h</h3>
        ${
          steps
            ? `
          <div class="pulse" title="GET /steps/hourly. Oldest hour at the left.">
            ${steps.accepted
              .map(
                (value) =>
                  `<i style="height:${Math.max(
                    4,
                    Math.round((value / max) * 100)
                  )}%"></i>`
              )
              .join("")}
          </div>
          <p class="src-line">${esc(steps.total)} accepted · until ${esc(
                easternTime(steps.until)
              )} · GET /steps/hourly</p>`
            : `<p class="hint">UNAVAILABLE · GET /steps/hourly</p>`
        }
        <h3>Shipped</h3>
        ${
          shipped
            ? `<div class="ship-row">${shipOrder
                .filter((key) => shipped[key] != null)
                .map(
                  (key) =>
                    `<div><b>${esc(shipped[key])}</b><span>${esc(
                      key
                    )}</span></div>`
                )
                .join(
                  ""
                )}</div><p class="src-line">GET /publications/counts. Types can overlap. all is the API total.</p>`
            : `<p class="hint">UNAVAILABLE · GET /publications/counts</p>`
        }
      </section>
      <section>
        <h3>Standing schedules</h3>
        ${
          Array.isArray(schedules)
            ? schedules.length
              ? `<ul class="intel-list">${schedules
                  .map(
                    (item) =>
                      `<li><span>${esc(
                        item.label || item.action || "schedule"
                      )} · ${esc(
                        item.status || "—"
                      )}</span><span class="mono">${esc(item.cadence || "—")}${
                        item.runsRemaining != null
                          ? ` · ${esc(item.runsRemaining)} left`
                          : ""
                      }</span></li>`
                  )
                  .join(
                    ""
                  )}</ul><p class="src-line">GET /schedules. The frozen input is not stored.</p>`
              : `<p class="hint">No schedules on the latest page.</p>`
            : `<p class="hint">UNAVAILABLE · GET /schedules</p>`
        }
        <h3>Accepted work</h3>
        ${
          records
            ? `
          <p class="src-line">${esc(records.totals.seats)} seats · ${esc(
                records.totals.accepted
              )} accepted · ${esc(records.totals.pending)} pending · ${esc(
                records.totals.rejected
              )} rejected</p>
          <ul class="entity-list">${records.top
            .map(
              (seat) =>
                `<li><button type="button" data-open="agent" data-id="${esc(
                  seat.tokenId
                )}"><span>${
                  seat.agentId
                    ? `Agent ${esc(seat.agentId)}`
                    : `Seat ${esc(seat.tokenId)}`
                }</span><span class="mono">${esc(
                  seat.accepted
                )} accepted</span></button></li>`
            )
            .join("")}</ul>
          <p class="src-line">GET /seats/records. Eight seats with the most accepted work.</p>`
            : `<p class="hint">UNAVAILABLE · GET /seats/records</p>`
        }
      </section>
    </div>`;
  bindOpen(host);
}

function fillNetworkPanels() {
  const state = ui.state;
  const stream = state.stream
    .filter((event) => {
      if (ui.streamFilter === "NETWORK") return event.category !== "SIMD";
      return event.category === ui.streamFilter;
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const box = document.querySelector("#stream");
  const stick = box && box.scrollTop < 24;
  if (box) {
    box.innerHTML = stream.length
      ? stream
          .map(
            (event) => `
      <article class="event">
        <time>${esc(clock(event.at))}</time>
        <div class="cat ${esc(event.category)}">${esc(event.category)}</div>
        <div>
          <p>${esc(event.title)}</p>
          <div class="meta">${badge(event.badge)} ${esc(
              event.detection.replaceAll("_", " ")
            )} · ${esc(event.source)}</div>
        </div>
      </article>`
          )
          .join("")
      : `<p class="hint" style="padding:12px 14px">No events in this filter.</p>`;
    if (stick) box.scrollTop = 0;
  }
  const machineHost = document.querySelector("#machine");
  if (machineHost && state.machine)
    machineHost.innerHTML = machineMarkup(state.machine, state.intel.objective);
  const reportHost = document.querySelector("#network-intel");
  if (reportHost && state.intelligence) {
    reportHost.innerHTML = intelligenceMarkup(state.intelligence);
    bindOpen(reportHost);
  }
  const modelHost = document.querySelector("#model");
  if (modelHost && state.networkModel) {
    const open = modelHost.querySelector("details")?.open;
    modelHost.innerHTML = modelMarkup(state.networkModel);
    if (open) {
      const details = modelHost.querySelector("details");
      if (details) details.open = true;
    }
  }
  const absorb = document.querySelector("#absorb");
  if (absorb) absorb.innerHTML = absorbInner();
  const intel = document.querySelector("#intel");
  if (intel && state.machine) {
    const next = state.intel.lastCycleAt
      ? Math.max(
          0,
          Date.parse(state.intel.lastCycleAt) + state.intel.cycleMs - Date.now()
        )
      : null;
    intel.innerHTML = `${machineMarkup(state.machine, state.intel.objective)}
      <p class="src-line">Next cycle ${
        next == null ? "unavailable" : `in ${Math.ceil(next / 1000)}s`
      } · stage ${esc(state.intel.stage)}</p>`;
  }
  const entities = document.querySelector("#entities");
  if (entities) {
    const working = state.agents
      .filter((agent) => agent.status === "working")
      .slice(0, 8);
    const executing = state.jobs
      .filter((job) => job.state === "executing")
      .slice(0, 6);
    entities.innerHTML = `
      <div class="panel-head"><h2>Active entities</h2><p class="hint">Working seats and executing jobs</p></div>
      ${entityButtons(
        working,
        (agent) =>
          `<li><button type="button" data-open="agent" data-id="${esc(
            agent.tokenId
          )}"><span>${
            agent.agentId != null
              ? `Agent ${esc(agent.agentId)}`
              : `Seat ${esc(agent.tokenId)}`
          }</span><span class="mono">${esc(agent.status)}</span></button></li>`
      )}
      ${entityButtons(
        executing,
        (job) =>
          `<li><button type="button" data-open="job" data-id="${esc(
            job.id
          )}"><span>Job ${esc(shortId(job.id))}</span><span class="mono">${esc(
            job.state
          )}</span></button></li>`
      )}`;
    bindOpen(entities);
  }
  renderVault();
  renderEcosystem();
  const cycles = document.querySelector("#cycles");
  if (cycles) {
    const open = new Set(
      [...cycles.querySelectorAll("details[open]")].map(
        (item) => item.dataset.n
      )
    );
    cycles.innerHTML = `
      <div class="panel-head"><h2>Intelligence cycles</h2><p class="hint">Structured record. Raw route detail stays inside the cycle.</p></div>
      ${
        state.cycles
          .map((cycle) => cycleMarkup(cycle, open.has(String(cycle.number))))
          .join("") ||
        `<p class="hint" style="padding:12px">No cycle recorded.</p>`
      }`;
  }
}

function cycleMarkup(cycle, open) {
  const rows = Object.entries(cycle.summary)
    .map(
      ([phase, text]) => `
    <div class="phase-row"><b>${esc(phase.toUpperCase())}</b><div>${esc(
        text
      )}</div></div>`
    )
    .join("");
  return `<details class="cycle" data-n="${cycle.number}" ${open ? "open" : ""}>
    <summary>
      <strong>Cycle #${pad(cycle.number)}</strong>
      <span class="mono">${esc(cycle.status)}</span>
      <span class="mono">${
        cycle.durationMs != null
          ? `${(cycle.durationMs / 1000).toFixed(1)}s`
          : "—"
      }</span>
      <span>${esc(cycle.objective || "")}</span>
    </summary>
    <div class="cycle-body">
      <div class="mono">Started ${esc(stamp(cycle.startedAt))}${
    cycle.baseline ? " · baseline snapshot" : ""
  }</div>
      ${rows}
      <details>
        <summary class="mono">Route results and raw cycle fields</summary>
        <pre class="raw">${esc(
          JSON.stringify(
            {
              routes: cycle.routes,
              observations: cycle.observations,
              inferences: cycle.inferences,
              proposed: cycle.proposed,
              executed: cycle.executed,
            },
            null,
            2
          )
        )}</pre>
      </details>
    </div>
  </details>`;
}

function bindOpen(root) {
  root.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      const type = button.dataset.open;
      const id = button.dataset.id;
      openInspector(type === "agent" ? { type, tokenId: id } : { type, id });
    });
  });
}

function mountNetwork() {
  stage.innerHTML = `
    <div class="hero">
      <section class="panel graph-panel">
        <div class="panel-head">
          <h2>Identity.md</h2>
          <p class="hint">The network. SIMD is the observer inside it.</p>
        </div>
        <div id="graph-host" class="graph-host"></div>
      </section>
      <section class="panel stream-panel">
        <div class="panel-head"><h2>Live network</h2><p class="hint">IMD events and snapshot diffs</p></div>
        <div class="filters" id="stream-filters">
          ${["NETWORK", "AGENT", "JOB", "WORKER", "ORACLE", "LAUNCH", "SIMD"]
            .map(
              (item) =>
                `<button type="button" data-stream="${item}" class="${
                  ui.streamFilter === item ? "on" : ""
                }">${item === "LAUNCH" ? "LAUNCHES" : item}</button>`
            )
            .join("")}
        </div>
        <div id="stream" class="stream"></div>
      </section>
    </div>
    <section class="panel" id="vault-stats" style="margin-top:12px"></section>
    <div class="split" style="margin-top:12px">
      <section class="panel" id="vault-balance"></section>
      <section class="panel" id="vault-payouts"></section>
    </div>
    <section class="panel" id="ecosystem" style="margin-top:12px"></section>
    <div id="absorb" class="absorb"></div>
    <div class="intel-grid">
      <section class="panel" id="machine"></section>
      <section class="panel" id="network-intel"></section>
    </div>
    <div class="intel-grid">
      <section class="panel" id="model"></section>
      <section class="panel" id="entities"></section>
    </div>`;
  ui.graph = createGraph(document.querySelector("#graph-host"), {
    onSelect: (ref) => openInspector(ref),
  });
  ui.graph.setData(ui.state.graph);
  document
    .querySelector("#stream-filters")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-stream]");
      if (!button) return;
      ui.streamFilter = button.dataset.stream;
      for (const item of document.querySelectorAll("[data-stream]"))
        item.classList.toggle("on", item === button);
      fillNetworkPanels();
    });
  fillNetworkPanels();
}

function sortAgents(list) {
  const dir = ui.agentDir;
  const key = ui.agentSort;
  return [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function renderAgentTable() {
  const state = ui.state;
  const query = ui.agentQuery.toLowerCase();
  let rows = state.agents.filter((agent) => {
    if (ui.agentStatus !== "all" && agent.status !== ui.agentStatus)
      return false;
    if (!query) return true;
    const hay = `${agent.agentId || ""} ${agent.tokenId} ${
      agent.owner || ""
    } ${agent.skills.join(" ")} ${agent.runtime || ""}`.toLowerCase();
    return hay.includes(query);
  });
  rows = sortAgents(rows);
  const pageSize = 24;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (ui.agentPage >= pages) ui.agentPage = pages - 1;
  const slice = rows.slice(
    ui.agentPage * pageSize,
    ui.agentPage * pageSize + pageSize
  );
  const headers = [
    ["agentId", "Agent"],
    ["owner", "Identity"],
    ["tokenId", "Seat"],
    ["status", "Status"],
    ["skillCount", "Capabilities"],
    ["accepted", "Accepted"],
    ["lastActivity", "Last activity"],
  ];
  const table = document.querySelector("#agent-table");
  if (!table) return;
  table.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>${headers
        .map(
          ([key, label]) =>
            `<th data-sort="${key}">${label}${
              ui.agentSort === key ? (ui.agentDir < 0 ? " ↓" : " ↑") : ""
            }</th>`
        )
        .join("")}</tr></thead>
      <tbody>
        ${
          slice
            .map(
              (
                agent
              ) => `<tr class="clickable" data-open="agent" data-id="${esc(
                agent.tokenId
              )}">
          <td class="mono">${
            agent.agentId != null ? esc(agent.agentId) : unavail()
          }</td>
          <td>${agent.owner ? chainAnchor(agent.owner) : unavail()}</td>
          <td class="mono">${esc(agent.tokenId)}</td>
          <td>${esc(agent.status)}</td>
          <td>${
            agent.skillCount
              ? `${esc(agent.skillCount)} · ${esc(
                  agent.skills.slice(0, 3).join(", ")
                )}`
              : unavail("NOT EXPOSED")
          }</td>
          <td class="mono">${
            agent.accepted == null ? unavail() : esc(agent.accepted)
          }</td>
          <td class="mono">${
            agent.lastActivity ? esc(ago(agent.lastActivity)) : unavail()
          }</td>
        </tr>`
            )
            .join("") || `<tr><td colspan="7">No seats match.</td></tr>`
        }
      </tbody>
    </table></div>
    <div class="pager">
      <span>${esc(
        rows.length
      )} seats in the latest swarm and worker snapshots · page ${
    ui.agentPage + 1
  } / ${pages}</span>
      <span>
        <button class="quiet" type="button" data-page="-1">Prev</button>
        <button class="quiet" type="button" data-page="1">Next</button>
      </span>
    </div>`;
  table.querySelectorAll("[data-sort]").forEach((th) =>
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      ui.agentDir = ui.agentSort === key ? -ui.agentDir : -1;
      ui.agentSort = key;
      renderAgentTable();
    })
  );
  table.querySelectorAll("[data-page]").forEach((button) =>
    button.addEventListener("click", () => {
      ui.agentPage = Math.max(0, ui.agentPage + Number(button.dataset.page));
      renderAgentTable();
    })
  );
  bindOpen(table);
}

function mountAgents() {
  stage.innerHTML = `
    <div class="view-head"><h2>Agent registry</h2><p class="hint">Identity.md seats joined with connected workers. Accepted is the seat record field, not a count of jobs SIMD assigned.</p></div>
    <div class="tools">
      <input id="agent-q" type="search" placeholder="Search id, address, skill" value="${esc(
        ui.agentQuery
      )}">
      <select id="agent-status">
        ${["all", "working", "connected", "enrolled"]
          .map(
            (item) =>
              `<option value="${item}" ${
                ui.agentStatus === item ? "selected" : ""
              }>${item}</option>`
          )
          .join("")}
      </select>
    </div>
    <div id="agent-table"></div>`;
  document.querySelector("#agent-q").addEventListener("input", (event) => {
    ui.agentQuery = event.target.value.trim();
    ui.agentPage = 0;
    renderAgentTable();
  });
  document
    .querySelector("#agent-status")
    .addEventListener("change", (event) => {
      ui.agentStatus = event.target.value;
      ui.agentPage = 0;
      renderAgentTable();
    });
  renderAgentTable();
}

function jobTable(rows, empty) {
  if (!rows.length) return `<p class="hint">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Id</th><th>State</th><th>Template</th><th>Objective</th></tr></thead>
    <tbody>${rows
      .map(
        (job) => `<tr class="clickable" data-open="job" data-id="${esc(
          job.id
        )}">
      <td class="mono">${esc(shortId(job.id))}</td>
      <td>${esc(job.state)}</td>
      <td class="mono">${job.template ? esc(job.template) : unavail()}</td>
      <td>${esc(job.objective || "")}</td>
    </tr>`
      )
      .join("")}</tbody>
  </table></div>`;
}

function mountJobs() {
  const state = ui.state;
  stage.innerHTML = `
    <div class="view-head"><h2>Jobs</h2><p class="hint">Latest GET /jobs page. Network totals are in the telemetry strip.</p></div>
    <div id="job-tables">
      <h2 style="margin:12px 0">On the latest page</h2>
      ${jobTable(state.jobs, "No jobs on the latest page.")}
      <h2 style="margin:18px 0 12px">Launches</h2>
      <p class="hint">GET /launches. IMD does not expose a separate deployments endpoint. Live launch count is launchesLive.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Launch</th><th>Status</th><th>Kind</th><th>Chain</th></tr></thead>
        <tbody>${
          state.launches
            .map(
              (
                launch
              ) => `<tr class="clickable" data-open="launch" data-id="${esc(
                launch.id
              )}">
          <td class="mono">${esc(
            launch.launchNumber ?? shortId(launch.id)
          )}</td>
          <td>${esc(launch.status)}</td>
          <td>${launch.kind ? esc(launch.kind) : unavail()}</td>
          <td class="mono">${esc(launch.chainId ?? "—")}</td>
        </tr>`
            )
            .join("") ||
          `<tr><td colspan="4">No launches on the latest page.</td></tr>`
        }</tbody>
      </table></div>
      <h2 style="margin:18px 0 12px">Workflows</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Id</th><th>Status</th><th>Objective</th></tr></thead>
        <tbody>${
          state.workflows
            .map(
              (item) => `<tr>
          <td class="mono">${esc(shortId(item.id))}</td>
          <td>${esc(item.status)}</td>
          <td>${esc(item.objective || "")}</td>
        </tr>`
            )
            .join("") ||
          `<tr><td colspan="3">No workflows on the latest page.</td></tr>`
        }</tbody>
      </table></div>
    </div>`;
  bindOpen(stage);
}

function mountOracles() {
  const state = ui.state;
  stage.innerHTML = `
    <div class="view-head"><h2>Oracle requests</h2><p class="hint">Latest GET /oracle/requests page. A network-wide total is not on that payload. 24h completions are in the telemetry strip.</p></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Id</th><th>Status</th><th>Chain</th><th>Type</th><th>Question</th></tr></thead>
      <tbody>${
        state.oracles
          .map(
            (
              request
            ) => `<tr class="clickable" data-open="oracle" data-id="${esc(
              request.id
            )}">
        <td class="mono">${esc(shortId(request.id))}</td>
        <td>${esc(request.status)}</td>
        <td class="mono">${esc(request.chainId ?? "—")}</td>
        <td class="mono">${
          request.answerType ? esc(request.answerType) : unavail()
        }</td>
        <td>${esc(request.question || "")}</td>
      </tr>`
          )
          .join("") ||
        `<tr><td colspan="5">No oracle requests on the latest page.</td></tr>`
      }</tbody>
    </table></div>`;
  bindOpen(stage);
}

function renderMemory() {
  const memory = ui.state.memory;
  const host = document.querySelector("#memory-body");
  if (!host) return;
  if (ui.memoryTab === "working") {
    host.innerHTML = memory.working.length
      ? memory.working
          .map(
            (item) => `
      <article class="memory-card">${badge("SIMD")}<h3>${esc(
              item.key
            )}</h3><pre class="raw">${esc(
              JSON.stringify(item.value, null, 2)
            )}</pre></article>`
          )
          .join("")
      : `<p class="hint">Working memory is empty until a cycle writes it.</p>`;
  } else if (ui.memoryTab === "episodic") {
    host.innerHTML =
      memory.episodic
        .map(
          (item) => `
      <article class="memory-card">${badge("SIMD")}<h3>Cycle #${pad(
            item.cycle
          )} · ${esc(stamp(item.at))}</h3><p>${esc(item.text)}</p></article>`
        )
        .join("") || `<p class="hint">No episodes.</p>`;
  } else if (ui.memoryTab === "semantic") {
    host.innerHTML = memory.semantic
      .map(
        (fact) => `
      <article class="memory-card">
        ${badge(fact.badge)}
        <h3>${esc(fact.id)}</h3>
        <p>${esc(fact.text)}</p>
        <p class="mono">Source ${esc(fact.source)} · first ${esc(
          stamp(fact.firstObserved)
        )} · verified ${esc(stamp(fact.lastVerified))} · ${esc(
          fact.verification
        )}</p>
      </article>`
      )
      .join("");
  } else {
    const net = memory.network;
    host.innerHTML = `
      <article class="memory-card">
        ${badge("IMD")} ${badge("SIMD")}
        <div class="kv">
          <span>Agents known</span><div>${esc(net.agents)}</div>
          <span>Relationships</span><div>${esc(
            net.relationships
          )} stored edges</div>
          <span>Jobs on page</span><div>${esc(net.jobs)}</div>
          <span>Addresses</span><div>${
            net.addresses
              ? esc(net.addresses)
              : unavail("Owner list not in the latest snapshot yet")
          }</div>
          <span>Capabilities</span><div>${esc(
            net.capabilities
          )} distinct worker skills</div>
          <span>Graph nodes</span><div>${esc(net.nodes)} retained</div>
        </div>
        <p class="hint">Relationships are edges SIMD wrote from verified responses. The on-screen topology is a focus subset.</p>
      </article>`;
  }
}

async function mountLogs() {
  stage.innerHTML = `
    <div class="view-head"><h2>Logs</h2><p class="hint">Shipped updates since the vault and token were wired</p></div>
    <section class="panel">
      <div id="log-list"><p class="hint" style="padding:14px">Loading.</p></div>
    </section>`;
  const host = document.querySelector("#log-list");
  try {
    const response = await fetch(`/logs.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    const body = await response.json();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) {
      host.innerHTML = `<p class="hint" style="padding:14px">No log rows yet.</p>`;
      return;
    }
    host.innerHTML = `<ul class="log-list">${entries
      .map(
        (entry) => `
      <li>
        <div class="log-meta">
          <span>${esc(easternTime(entry.at))}</span>
          <span data-ago="${esc(entry.at)}">${esc(ago(entry.at))}</span>
        </div>
        <h3>${esc(entry.title || "Update")}</h3>
        <p>${esc(entry.summary || "")}</p>
      </li>`
      )
      .join("")}</ul>`;
  } catch {
    host.innerHTML = `<p class="hint" style="padding:14px">UNAVAILABLE</p>`;
  }
}

function mountMemory() {
  stage.innerHTML = `
    <div class="view-head"><h2>Memory</h2><p class="hint">Retrieved by entity during a cycle. The full history is not injected into one prompt.</p></div>
    <div class="tabs" id="memory-tabs">
      ${["working", "episodic", "semantic", "network"]
        .map(
          (tab) =>
            `<button class="quiet${
              ui.memoryTab === tab ? " on" : ""
            }" type="button" data-tab="${tab}">${tab}</button>`
        )
        .join("")}
    </div>
    <div id="memory-body"></div>`;
  document.querySelector("#memory-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    ui.memoryTab = button.dataset.tab;
    for (const item of document.querySelectorAll("[data-tab]"))
      item.classList.toggle("on", item === button);
    renderMemory();
  });
  renderMemory();
}

function mountSimd() {
  const state = ui.state;
  stage.innerHTML = `
    <div class="view-head"><h2>SIMD</h2><p class="hint">${esc(
      state.identity.lede
    )}</p></div>
    <div class="split">
      <section class="panel"><div class="panel-head"><h2>Status</h2></div><div id="intel"></div></section>
      <section class="panel">
        <div class="panel-head"><h2>Data sources</h2></div>
        <div class="sources" style="padding:12px">
          ${state.sources
            .map(
              (source) =>
                `<article class="source"><strong>${esc(
                  source.name
                )}</strong><em class="${esc(
                  source.status.split(" ")[0]
                )}">${esc(source.status)}</em><p class="hint">${esc(
                  source.detail
                )}</p></article>`
            )
            .join("")}
        </div>
        <div class="kv">
          <span>Last request</span><div>${
            state.fetchedAt ? esc(stamp(state.fetchedAt)) : unavail()
          }</div>
          <span>Latency</span><div>${
            state.metrics.find((item) => item.id === "latency")?.value != null
              ? `${esc(
                  state.metrics.find((item) => item.id === "latency").value
                )} ms median`
              : unavail()
          }</div>
          <span>Last error</span><div>${
            state.intel.lastError ? esc(state.intel.lastError) : "none"
          }</div>
          <span>Poll</span><div>${Math.round(state.intel.cycleMs / 1000)}s</div>
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:12px">
      <div class="panel-head"><h2>Reward rule</h2><p class="hint">${esc(
        state.constraints?.reward?.status || "NOT IN FORCE"
      )}</p></div>
      <div class="kv">
        <span>Share</span><div>${esc(
          state.constraints?.reward?.share || "100%"
        )} of the verified task price</div>
        <span>Task price</span><div>${
          state.constraints?.reward?.taskPrice
            ? esc(state.constraints.reward.taskPrice)
            : unavail()
        }</div>
        <span>Amount named</span><div>${
          state.constraints?.reward?.named
            ? esc(state.constraints.reward.named)
            : unavail()
        }</div>
        <span>Price source</span><div class="mono">GET /requests/capabilities</div>
        <span>Vault</span><div>${
          state.vault?.address ? chainAnchor(state.vault.address, 1) : unavail()
        } · ${state.vault?.balance ? esc(state.vault.balance) : unavail()}</div>
        <span>Token</span><div>${
          state.vault?.token ? chainAnchor(state.vault.token, 1) : unavail()
        }</div>
        <span>Funding</span><div>Vault balance, read from Ethereum. Task payouts are IMD.</div>
        <span>Payouts sent</span><div>${
          Array.isArray(state.vault?.payouts) ? state.vault.payouts.length : 0
        }</div>
      </div>
      <p class="hint" style="padding:0 14px 14px">${esc(
        state.constraints?.reward?.note ||
          "Prepared rule only. Nothing is paid. No dollar price is used."
      )}</p>
    </section>
    <section class="panel" style="margin-top:12px">
      <div class="panel-head"><h2>Operator constraint</h2><p class="hint">Optional. Does not replace the derived objective.</p></div>
      <form class="objective" id="objective-form" style="padding:12px 14px 14px">
        <p class="objective-line">${badge("SIMD DERIVED")} ${esc(
    state.intel.objective || ""
  )}</p>
        <textarea name="standing" maxlength="8000" placeholder="skill:research-report">${esc(
          state.intel.operator || ""
        )}</textarea>
        <button class="quiet" type="submit">Set constraint</button>
        <p class="hint">A first line of skill:name drafts a job.open body and does not submit it. Clear the field to remove the constraint.</p>
      </form>
    </section>
    <section class="panel" style="margin-top:12px">
      <div class="panel-head"><h2>Ethereum identifiers</h2><p class="hint">Copied from IMD responses. SIMD did not send these transactions.</p></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Role</th><th>Address</th><th>Source</th></tr></thead>
        <tbody>${
          state.contracts
            .map(
              (item) => `<tr>
          <td>${esc(item.role)}</td>
          <td>${chainAnchor(item.address, item.chainId)}</td>
          <td class="mono">${esc(item.source)}</td>
        </tr>`
            )
            .join("") ||
          `<tr><td colspan="3">No contract addresses in the latest payloads.</td></tr>`
        }</tbody>
      </table></div>
      <div class="table-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Kind</th><th>Transaction</th><th>Detail</th></tr></thead>
        <tbody>${state.sites
          .filter((site) => site.txHash)
          .slice(0, 8)
          .map(
            (site) => `<tr>
          <td>Site name</td>
          <td>${chainAnchor(site.txHash, site.chainId || 1)}</td>
          <td>${esc(site.ensName || site.label || site.id)}</td>
        </tr>`
          )
          .join("")}
        ${state.feedback
          .map(
            (batch) => `<tr>
          <td>Feedback batch</td>
          <td>${
            batch.txHash
              ? chainAnchor(batch.txHash, batch.chainId || 1)
              : unavail("no transaction hash yet")
          }</td>
          <td class="mono">${esc(batch.status)} · ${esc(shortId(batch.id))}</td>
        </tr>`
          )
          .join("")}</tbody>
      </table></div>
    </section>
    <section class="panel cycles" id="cycles"></section>`;
  const intel = document.querySelector("#intel");
  intel.innerHTML = "";
  fillNetworkPanels();
  document
    .querySelector("#objective-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const standing = new FormData(event.target).get("standing");
      await fetch("/api/objective", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ standing }),
      });
      refresh();
    });
}

async function fetchHireSent(preview = false) {
  const response = await fetch(`/api/hire/sent${preview ? "?preview=1" : ""}`, {
    cache: "no-store",
  });
  const body = await response
    .json()
    .catch(() => ({ error: "sent list failed" }));
  return { response, body };
}

async function fetchHireSentSummary() {
  const response = await fetch("/api/hire/sent?summary=1", {
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Number.isFinite(Number(body.count)))
    return null;
  return body;
}

function sentKindLabel(kind) {
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  if (kind === "report") return "Report";
  return "Task";
}

function renderSentFeed() {
  const host = document.querySelector("#sent-feed");
  if (!host || !Array.isArray(ui.sentTasks)) return;
  const filter = ui.sentFilter || "all";
  const tasks = ui.sentTasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "pending") return task.jobState !== "completed";
    return task.kind === filter;
  });
  if (!tasks.length) {
    host.innerHTML = `<p class="hint" style="padding:14px">${
      filter === "all"
        ? "No task has been opened from this site."
        : "No tasks in this filter."
    }</p>`;
    return;
  }
  host.innerHTML = `<div class="task-feed">${tasks
    .map((task) => {
      const title =
        task.objective ||
        (task.jobId ? "Objective UNAVAILABLE" : "Job not opened");
      const when = task.paidAt || task.createdAt;
      const state = task.jobState || task.status || "—";
      const files = Array.isArray(task.files) ? task.files : [];
      const openAttr = task.jobId
        ? ` data-open="job" data-id="${esc(task.jobId)}"`
        : "";
      return `<article class="task-card"${openAttr}>
      <div class="task-card-head">
        <span class="mono">${esc(sentKindLabel(task.kind))}</span>
        <span class="hint">${esc(state)}${
        when ? ` · <span data-ago="${esc(when)}">${esc(ago(when))}</span>` : ""
      }</span>
      </div>
      <h3>Request</h3>
      <p class="result-objective">${esc(title)}</p>
      <h3>Output</h3>
      ${
        files.length
          ? files
              .map(
                (file) => `
        <div class="result-file">
          <div class="meta">${esc(file.name || "file")} · ${esc(
                  file.mediaType || "—"
                )}</div>
          ${filePreviewMarkup(file)}
        </div>`
              )
              .join("")
          : `<p class="hint">${
              task.jobState === "completed"
                ? "No files on the result payload yet."
                : "Waiting for the swarm result."
            }</p>`
      }
      <p class="hint">${
        task.jobId
          ? `<button type="button" class="linkish" data-open="job" data-id="${esc(
              task.jobId
            )}">View on SIMD</button> · <a href="https://explorer.imd.fun/jobs/${esc(
              task.jobId
            )}" target="_blank" rel="noopener">${esc(task.jobId)}</a>`
          : "No job id"
      }${
        task.transactionHash ? ` · ${chainAnchor(task.transactionHash)}` : ""
      }</p>
    </article>`;
    })
    .join("")}</div>`;
  bindOpen(host);
}

async function enrichSentOutputs() {
  if (!Array.isArray(ui.sentTasks)) return;
  const pending = ui.sentTasks.filter(
    (task) =>
      task.jobId && (!task.files || !task.files.length || !task.objective)
  );
  for (const task of pending) {
    if (ui.view !== "sent") return;
    let detail = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(`/api/jobs/${task.jobId}`, {
          cache: "no-store",
        });
        detail = await response.json().catch(() => null);
        if (response.ok && detail && !detail.error) break;
        detail = null;
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1))
        );
      } catch {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1))
        );
      }
    }
    if (!detail) continue;
    const files = Array.isArray(detail.result?.files)
      ? detail.result.files
      : [];
    task.objective =
      task.objective ||
      (typeof detail.objective === "string"
        ? detail.objective.slice(0, 400)
        : null);
    task.jobState = detail.state || task.jobState;
    task.template = detail.template || task.template;
    if (files.length) task.files = files;
    task.kind = taskKindFromTask(task);
    task.resultAvailable = (task.files || []).length > 0;
    task.resultComplete =
      detail.result?.complete === true || detail.state === "completed";
    renderSentFeed();
  }
}

function taskKindFromTask(task) {
  const kinds = new Set(
    (task.files || []).map((file) => file.kind).filter(Boolean)
  );
  if (kinds.has("image")) return "image";
  if (kinds.has("video")) return "video";
  if (kinds.has("audio")) return "audio";
  if (kinds.has("text")) return "report";
  const t = String(task.template || "").toLowerCase();
  if (t.includes("image")) return "image";
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  if (t.includes("report") || t.includes("research")) return "report";
  return task.kind || "task";
}

async function loadSentFeed() {
  const host = document.querySelector("#sent-feed");
  if (!host) return;
  host.innerHTML = `<p class="hint" style="padding:14px">Loading requests and outputs.</p>`;
  // Light list first (objectives/state). Media arrives via /api/jobs/:id so we do not
  // stall the hire/sent function under api.imd.fun 503 busy.
  let { response, body } = await fetchHireSent(false);
  if (!host.isConnected) return;
  if (!response.ok || !Array.isArray(body.tasks)) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      body.error || "UNAVAILABLE"
    )}</p>`;
    return;
  }
  ui.sentTasks = body.tasks.map((task) => ({
    ...task,
    files: Array.isArray(task.files) ? task.files : [],
  }));
  const count = document.querySelector("#sent-count");
  if (count)
    count.textContent =
      body.count > body.shown
        ? `Showing ${body.shown} of ${body.count}.`
        : `${body.shown} from this site.`;
  renderSentFeed();
  enrichSentOutputs();
}

function mountSent() {
  const filter = [
    "all",
    "report",
    "image",
    "audio",
    "video",
    "pending",
  ].includes(ui.sentFilter)
    ? ui.sentFilter
    : "all";
  ui.sentFilter = filter;
  stage.innerHTML = `
    <div class="view-head"><h2>Sent</h2><p class="hint">Requests paid from this site through Hire, with the swarm output when IMD has published it.</p></div>
    <section class="panel">
      <div class="panel-head">
        <h2>From this site</h2>
        <p class="hint" id="sent-count">Loading.</p>
      </div>
      <div class="filters" id="sent-filters">
        ${[
          ["all", "All"],
          ["report", "Reports"],
          ["image", "Images"],
          ["audio", "Audio"],
          ["video", "Video"],
          ["pending", "Pending"],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" data-sent-filter="${id}" class="${
                id === filter ? "on" : ""
              }">${label}</button>`
          )
          .join("")}
      </div>
      <div id="sent-feed"><p class="hint" style="padding:14px">Loading.</p></div>
    </section>`;
  document.querySelector("#sent-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sent-filter]");
    if (!button) return;
    ui.sentFilter = button.dataset.sentFilter;
    for (const item of document.querySelectorAll(
      "#sent-filters [data-sent-filter]"
    )) {
      item.classList.toggle("on", item === button);
    }
    renderSentFeed();
  });
  loadSentFeed();
}

function startContestMission(mission) {
  if (!mission) return;
  ui.hireKind = mission.kind || "report";
  ui.hireObjective = mission.objective || "";
  ui.hireCheck = null;
  ui.hireOutcome = null;
  ui.hireStatus = "";
  location.hash = "hire";
}

function contestDifficultyClass(value) {
  if (value === "legendary") return "legendary";
  if (value === "hard") return "hard";
  return "medium";
}

function renderContest() {
  const host = document.querySelector("#contest-body");
  if (!host) return;
  const board = ui.contest;
  if (!board) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading contest board.</p>`;
    return;
  }
  if (board.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      board.error
    )}</p>`;
    return;
  }
  const season = board.season || {};
  const pool = board.pool || {};
  const missions = Array.isArray(board.missions) ? board.missions : [];
  const entries = Array.isArray(board.entries) ? board.entries : [];
  const selected =
    missions.find((item) => item.id === ui.contestMission) ||
    missions[0] ||
    null;
  if (selected && ui.contestMission !== selected.id)
    ui.contestMission = selected.id;
  host.innerHTML = `
    <div class="contest-hero">
      <article class="contest-card">
        <h3>${esc(season.title || "Discovery Arena")}</h3>
        <p class="hint">${esc(season.subtitle || "")}</p>
        <p class="token-price">${esc(pool.balance || "—")}</p>
        <p class="hint">Prize reserve · ${esc(
          pool.asset || "IMD"
        )} · status ${esc(pool.status || "—")}</p>
        <p class="hint">${
          pool.vault ? chainAnchor(pool.vault, 1) : ""
        } · ends ${season.endsAt ? esc(ago(season.endsAt)) : "—"}</p>
      </article>
      <article class="contest-card">
        <h3>How it works</h3>
        <ol class="contest-loop">${(board.loop || [])
          .map(
            (item) =>
              `<li><b>${esc(item.step)}. ${esc(
                item.title
              )}</b><span class="hint">${esc(item.detail)}</span></li>`
          )
          .join("")}</ol>
      </article>
      <article class="contest-card">
        <h3>Scoring</h3>
        <ul class="contest-rules">${(season.scoring || board.scoring || [])
          .map((line) => `<li>${esc(line)}</li>`)
          .join("")}</ul>
        <p class="hint" style="margin-top:10px">${esc(pool.note || "")}</p>
      </article>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Missions</h2><p class="hint">AI-hard tasks. Each one opens a real swarm job through Hire.</p></div>
      <div class="contest-missions">
        <div class="contest-mission-list">
          ${missions
            .map(
              (mission) => `
            <button type="button" class="contest-mission ${
              mission.id === selected?.id ? "on" : ""
            }" data-contest-mission="${esc(mission.id)}">
              <span class="contest-diff ${contestDifficultyClass(
                mission.difficulty
              )}">${esc(mission.difficulty)}</span>
              <span class="contest-mission-title">${esc(mission.title)}</span>
              <span class="hint">${esc(mission.category)} · weight ${esc(
                mission.weight
              )} · ${esc(mission.entries || 0)} entries</span>
            </button>`
            )
            .join("")}
        </div>
        <div class="contest-mission-detail" id="contest-detail">
          ${
            selected
              ? `
            <div class="contest-diff ${contestDifficultyClass(
              selected.difficulty
            )}">${esc(selected.difficulty)}</div>
            <h3>${esc(selected.title)}</h3>
            <p>${esc(selected.blurb)}</p>
            <p class="hint">Win condition: ${esc(selected.winCondition)}</p>
            <p class="hint">Kind · ${esc(selected.kind)} · tag ${esc(
                  selected.tag
                )}</p>
            <pre class="result-text contest-prompt">${esc(
              selected.objective
            )}</pre>
            <div class="token-actions">
              <button type="button" class="quiet on" id="contest-run">Run with swarm</button>
              <a class="quiet" href="#sent">View Sent outputs</a>
            </div>
            <form id="contest-submit" class="contest-submit">
              <h3>Submit discovery</h3>
              <p class="hint">After the job completes, enter your claim wallet, the job id, and the one-line discovery.</p>
              <label>Wallet<input name="wallet" spellcheck="false" placeholder="0x…" required></label>
              <label>Job id<input name="jobId" spellcheck="false" placeholder="uuid from Sent / explorer" required></label>
              <label>Claim<textarea name="claim" maxlength="2000" placeholder="What did you discover?" required></textarea></label>
              <input type="hidden" name="missionId" value="${esc(selected.id)}">
              <button class="quiet on" type="submit">Submit entry</button>
              <p class="hint" id="contest-submit-status">${esc(
                ui.contestStatus || ""
              )}</p>
            </form>`
              : `<p class="hint">No missions.</p>`
          }
        </div>
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Entries</h2><p class="hint">Received proofs. Not paid until verified.</p></div>
      ${
        entries.length
          ? `<ul class="contest-entries">${entries
              .map(
                (entry) => `
        <li>
          <div class="log-meta"><span>${esc(
            entry.missionTitle || entry.missionId
          )}</span><span>${esc(entry.status)} · ${esc(
                  ago(entry.at)
                )}</span></div>
          <p>${esc(entry.claim)}</p>
          <p class="hint">${chainAnchor(
            entry.wallet,
            1
          )} · <a href="https://explorer.imd.fun/jobs/${esc(
                  entry.jobId
                )}" target="_blank" rel="noopener">${esc(
                  entry.jobId
                )}</a> · weight ${esc(entry.weight)}</p>
        </li>`
              )
              .join("")}</ul>`
          : `<p class="hint" style="padding:14px">No entries yet. Be the first verified discovery.</p>`
      }
      <div class="panel-head" style="border-top:1px solid var(--line)"><h2>Rules</h2><p class="hint">${esc(
        board.source || ""
      )}</p></div>
      <ul class="contest-rules" style="padding:0 14px 14px">${(
        season.rules || []
      )
        .map((line) => `<li>${esc(line)}</li>`)
        .join("")}</ul>
    </section>`;
  host.querySelectorAll("[data-contest-mission]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.contestMission = button.dataset.contestMission;
      ui.contestStatus = "";
      renderContest();
    });
  });
  document
    .querySelector("#contest-run")
    ?.addEventListener("click", () => startContestMission(selected));
  document
    .querySelector("#contest-submit")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      ui.contestStatus = "Submitting…";
      renderContest();
      const response = await fetch("/api/contest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response
        .json()
        .catch(() => ({ error: "submit failed" }));
      ui.contestStatus = response.ok
        ? "Entry received. Not paid until verified."
        : body.error || "submit failed";
      if (response.ok) await loadContest(false);
      else renderContest();
    });
}

async function loadContest(showLoading = true) {
  const host = document.querySelector("#contest-body");
  if (!host) return;
  if (showLoading)
    host.innerHTML = `<p class="hint" style="padding:14px">Loading contest board.</p>`;
  const response = await fetch("/api/contest", { cache: "no-store" });
  const body = await response.json().catch(() => ({ error: "contest failed" }));
  if (!host.isConnected) return;
  ui.contest = response.ok ? body : { error: body.error || "contest failed" };
  renderContest();
}

function mountContest() {
  stage.innerHTML = `
    <div class="view-head"><h2>Contest</h2><p class="hint">Discovery Arena — hard AI missions that use the Identity.md swarm. Prize reserve is vault IMD.</p></div>
    <div id="contest-body"><p class="hint" style="padding:14px">Loading contest board.</p></div>`;
  if (ui.contest && !ui.contest.error) renderContest();
  loadContest(!ui.contest);
}

function startCollisionHunt(rung) {
  if (!rung || rung.status !== "open" || !rung.objective) return;
  ui.hireKind = "report";
  ui.hireObjective = rung.objective;
  ui.hireCheck = null;
  ui.hireOutcome = null;
  ui.hireStatus = "";
  location.hash = "hire";
}

function renderBounties() {
  const host = document.querySelector("#bounty-body");
  if (!host) return;
  const board = ui.bounties;
  if (!board) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading collision ladder.</p>`;
    return;
  }
  if (board.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      board.error
    )}</p>`;
    return;
  }
  const treasury = board.treasury || {};
  const summary = board.summary || {};
  const rungs = Array.isArray(board.rungs) ? board.rungs : [];
  const fallen = Array.isArray(board.fallen) ? board.fallen : [];
  const algo = ["keccak256", "sha256", "ripemd160"].includes(ui.bountyAlgo)
    ? ui.bountyAlgo
    : "keccak256";
  ui.bountyAlgo = algo;
  const open =
    rungs.find((r) => r.algo === algo && r.status === "open") || null;
  const algoFallen = rungs
    .filter((r) => r.algo === algo && r.status === "fallen")
    .sort((a, b) => b.lambda - a.lambda);
  host.innerHTML = `
    <div class="contest-hero">
      <article class="contest-card">
        <h3>${esc(board.title || "Collision Bounties")}</h3>
        <p class="hint">${esc(board.subtitle || "")}</p>
        <p class="token-price">${esc(treasury.vaultBalance || "—")}</p>
        <p class="hint">Vault IMD · payout ${esc(
          treasury.payoutStatus || "MANUAL"
        )} · hunts ${treasury.huntsEnabled ? "ON" : "OFF"}</p>
        <p class="hint">Hunts today ${esc(treasury.huntsToday ?? 0)} / ${esc(
    treasury.dailyHuntCap ?? "—"
  )} · job 0.5 IMD</p>
        ${treasury.note ? `<p class="hint">${esc(treasury.note)}</p>` : ""}
      </article>
      <article class="contest-card">
        <h3>Open rungs</h3>
        <ul class="contest-rules">${["keccak256", "sha256", "ripemd160"]
          .map((name) => {
            const row = summary[name] || {};
            return `<li><b>${esc(name)}</b> · open λ=${esc(
              row.openLambda ?? "—"
            )} · purse ${esc(row.openPurseImd ?? "—")} IMD · fallen ${esc(
              row.fallenCount ?? 0
            )} (max λ ${esc(row.highestFallen ?? "—")})</li>`;
          })
          .join("")}</ul>
      </article>
      <article class="contest-card">
        <h3>Rules</h3>
        <ul class="contest-rules">${(board.rules || [])
          .map((line) => `<li>${esc(line)}</li>`)
          .join("")}</ul>
        <p class="hint" style="margin-top:10px">${esc(treasury.note || "")}</p>
        ${
          treasury.vault
            ? `<p class="hint">${chainAnchor(treasury.vault, 1)}</p>`
            : ""
        }
        ${
          treasury.payer
            ? `<p class="hint">Payer ${chainAnchor(treasury.payer, 1)}</p>`
            : ""
        }
      </article>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Hunt board</h2><p class="hint">Pick a hash. The open λ is the live measurement. Submit a collision or open an IMD job.</p></div>
      <div class="filters" id="collision-algos" style="padding:0 14px 8px">
        ${["keccak256", "sha256", "ripemd160"]
          .map(
            (name) =>
              `<button type="button" data-collision-algo="${name}" class="${
                name === algo ? "on" : ""
              }">${name}</button>`
          )
          .join("")}
      </div>
      <div class="contest-mission-detail bounty-detail">
        ${
          open
            ? `
          <div class="contest-diff hard">OPEN · λ=${esc(open.lambda)} · ${esc(
                open.bits
              )} bits</div>
          <h3>${esc(algo)}</h3>
          <p>Purse <b>${esc(open.purseImd)} IMD</b> · birthday cost ~2^${esc(
                open.lambda
              )}</p>
          <p class="hint">Find distinct inputA / inputB whose ${esc(
            algo
          )} truncates to the same first ${esc(open.bits)} bits.</p>
          <pre class="result-text contest-prompt">${esc(
            open.objective || ""
          )}</pre>
          <div class="token-actions">
            ${
              treasury.huntsEnabled
                ? `<button type="button" class="quiet on" id="collision-run">Open IMD hunt job</button>`
                : `<button type="button" class="quiet" id="collision-run" disabled title="SIMD_COLLISION_HUNT is off">Hunt jobs disabled</button>`
            }
            <a class="quiet" href="#sent">Sent</a>
          </div>
          <form id="bounty-submit" class="contest-submit">
            <h3>Submit collision</h3>
            <p class="hint">Anyone can submit. First valid arrival wins the rung. Verification recomputes both hashes.</p>
            <label>inputA<input name="inputA" spellcheck="false" placeholder="0x… or utf8" required></label>
            <label>inputB<input name="inputB" spellcheck="false" placeholder="0x… or utf8" required></label>
            <label>Wallet (prize)<input name="wallet" spellcheck="false" placeholder="0x…"></label>
            <label>Seat (optional)<input name="seat" spellcheck="false" placeholder="token id"></label>
            <label>Job id (optional)<input name="jobId" spellcheck="false" placeholder="uuid"></label>
            <input type="hidden" name="algo" value="${esc(algo)}">
            <input type="hidden" name="lambda" value="${esc(open.lambda)}">
            <button class="quiet on" type="submit">Verify & claim</button>
            <p class="hint" id="bounty-submit-status">${esc(
              ui.bountyStatus || ""
            )}</p>
          </form>
        `
            : `<p class="hint">No open rung for ${esc(algo)}.</p>`
        }
        ${
          algoFallen.length
            ? `
          <h3 style="margin-top:16px">Fallen on ${esc(algo)}</h3>
          <ul class="contest-entries">${algoFallen
            .slice(0, 12)
            .map(
              (row) => `
            <li>
              <div class="log-meta"><span>λ=${esc(
                row.lambda
              )}</span><span>${esc(row.purseImd)} IMD · ${
                row.fallenAt ? esc(ago(row.fallenAt)) : "—"
              }</span></div>
              <p class="hint mono">trunc ${esc(row.truncated || "—")}</p>
              <p class="hint">A ${esc(shortCa(row.inputA))} · B ${esc(
                shortCa(row.inputB)
              )}</p>
              <p class="hint">${
                row.winnerWallet
                  ? chainAnchor(row.winnerWallet, 1)
                  : "no wallet"
              }${
                row.payoutTx
                  ? ` · ${chainAnchor(row.payoutTx)}`
                  : " · payout pending"
              }${
                row.jobId
                  ? ` · <a href="https://explorer.imd.fun/jobs/${esc(
                      row.jobId
                    )}" target="_blank" rel="noopener">${esc(row.jobId)}</a>`
                  : ""
              }</p>
            </li>`
            )
            .join("")}</ul>`
            : `<p class="hint" style="margin-top:12px">No fallen rungs on ${esc(
                algo
              )} yet.</p>`
        }
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-head"><h2>Recent falls</h2><p class="hint">Public proofs. Recompute anytime.</p></div>
      ${
        fallen.length
          ? `<ul class="contest-entries">${fallen
              .slice(0, 20)
              .map(
                (row) => `
        <li>
          <div class="log-meta"><span>${esc(row.algo)} · λ=${esc(
                  row.lambda
                )}</span><span>${esc(
                  row.purse_imd || row.purseImd || ""
                )} IMD · ${
                  row.fallen_at ? esc(ago(row.fallen_at)) : "—"
                }</span></div>
          <p class="hint mono">${esc(row.truncated || "")}</p>
          <p class="hint">${
            row.winner_wallet ? chainAnchor(row.winner_wallet, 1) : "—"
          }${row.payout_tx ? ` · ${chainAnchor(row.payout_tx)}` : ""}</p>
        </li>`
              )
              .join("")}</ul>`
          : `<p class="hint" style="padding:14px">Ladder still at the start.</p>`
      }
      <p class="hint" style="padding:0 14px 14px">${esc(board.source || "")}</p>
    </section>`;
  document
    .querySelector("#collision-algos")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-collision-algo]");
      if (!button) return;
      ui.bountyAlgo = button.dataset.collisionAlgo;
      ui.bountyStatus = "";
      renderBounties();
    });
  document.querySelector("#collision-run")?.addEventListener("click", () => {
    if (!ui.bounties?.treasury?.huntsEnabled) {
      ui.bountyStatus =
        "Paid IMD hunt jobs are disabled (SIMD_COLLISION_HUNT≠1).";
      renderBounties();
      return;
    }
    startCollisionHunt(open);
  });
  document
    .querySelector("#bounty-submit")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.lambda = Number(payload.lambda);
      ui.bountyStatus = "Verifying…";
      renderBounties();
      const response = await fetch("/api/collisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response
        .json()
        .catch(() => ({ error: "submit failed" }));
      ui.bountyStatus = response.ok
        ? `Fallen λ=${body.fallen?.lambda}. Next open λ=${
            body.next?.lambda
          }. Payout ${body.note || "pending"}.`
        : body.error || "submit failed";
      if (response.ok) await loadBounties(false);
      else renderBounties();
    });
}

async function loadBounties(showLoading = true) {
  const host = document.querySelector("#bounty-body");
  if (!host) return;
  if (showLoading)
    host.innerHTML = `<p class="hint" style="padding:14px">Loading collision ladder.</p>`;
  const response = await fetch("/api/collisions", { cache: "no-store" });
  const body = await response
    .json()
    .catch(() => ({ error: "collisions failed" }));
  if (!host.isConnected) return;
  ui.bounties = response.ok
    ? body
    : { error: body.error || "collisions failed" };
  renderBounties();
}

function mountBounties() {
  stage.innerHTML = `
    <div class="view-head"><h2>Bounties</h2><p class="hint">Truncated-hash collision ladder for the Identity.md swarm. No bounty contract — verify the math.</p></div>
    <div id="bounty-body"><p class="hint" style="padding:14px">Loading collision ladder.</p></div>`;
  if (ui.bounties && !ui.bounties.error) renderBounties();
  loadBounties(!ui.bounties);
}

function shortCa(address) {
  const text = String(address || "");
  if (text.length < 12) return text;
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function changeClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0 ? "up" : "down";
}

function renderTokenMarket() {
  const host = document.querySelector("#token-body");
  if (!host) return;
  const market = ui.tokenMarket;
  if (!market) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading Dexscreener.</p>`;
    return;
  }
  if (market.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      market.error
    )} · ${esc(market.source || "Dexscreener")}</p>`;
    return;
  }
  const links = market.links || {};
  const pairs = Array.isArray(market.pairs) ? market.pairs : [];
  const vault = ui.state?.vault;
  host.innerHTML = `
    <div class="token-hero">
      <article class="token-card">
        <h3>Get SIMD.</h3>
        <p class="hint">Buy on Uniswap. Market figures are the top Ethereum pool on Dexscreener.</p>
        <p class="token-price">${
          market.priceLabel ? esc(market.priceLabel) : unavail()
        }${
    market.changeLabel
      ? ` <span class="token-change ${changeClass(market.changeH24)}">${esc(
          market.changeLabel
        )}</span>`
      : ""
  }</p>
        <p class="hint">MC ${esc(
          market.marketCapLabel || "—"
        )} · Liquidity ${esc(market.liquidityLabel || "—")} · Vol 24h ${esc(
    market.volumeLabel || "—"
  )}</p>
        <div class="token-actions">
          <a class="quiet on" href="${esc(
            links.uniswap || "#"
          )}" target="_blank" rel="noopener">Buy on Uniswap</a>
          <a class="quiet" href="${esc(
            links.uniswapImd || "#"
          )}" target="_blank" rel="noopener">Buy with IMD</a>
        </div>
        <nav class="token-ways" aria-label="$SIMD elsewhere">
          <a href="${esc(
            links.uniswap || "#"
          )}" target="_blank" rel="noopener" title="Uniswap">Uniswap</a>
          <a href="${esc(
            links.dexscreener || "#"
          )}" target="_blank" rel="noopener" title="Dexscreener">Dexscreener</a>
          <a href="${esc(
            links.fomo || "#"
          )}" target="_blank" rel="noopener" title="FOMO">FOMO</a>
          <a href="${esc(
            links.basedbot || "#"
          )}" target="_blank" rel="noopener" title="BasedBot">BasedBot</a>
          <a href="${esc(
            links.etherscan || "#"
          )}" target="_blank" rel="noopener" title="Etherscan">Etherscan</a>
        </nav>
      </article>
      <article class="token-card">
        <h3>Hire the swarm.</h3>
        <p class="hint">Open paid Identity.md jobs from this site. Paid in IMD by the SIMD payer wallet.</p>
        <p class="token-price">0.5 IMD</p>
        <p class="hint">Per job · report, image, audio, or video</p>
        <div class="token-actions"><a class="quiet" href="#hire">Open Hire</a></div>
      </article>
      <article class="token-card">
        <h3>Vault.</h3>
        <p class="hint">IMD held for task payouts. Token fees fund the vault; rewards pay out in IMD.</p>
        <p class="token-price">${
          vault?.balance ? esc(vault.balance) : unavail()
        }</p>
        <p class="hint">${
          vault?.address
            ? chainAnchor(vault.address, 1)
            : "Vault address loading"
        } · ${
    vault?.tokenBalance ? `SIMD ${esc(vault.tokenBalance)}` : "SIMD balance —"
  }</p>
        <div class="token-actions"><a class="quiet" href="#network">View on Network</a></div>
      </article>
    </div>
    <section class="panel token-buy">
      <div class="panel-head">
        <h2>$SIMD</h2>
        <p class="hint">Ethereum · ${esc(market.source || "Dexscreener")}</p>
      </div>
      <div class="token-buy-grid">
        <div class="token-buy-panel">
          <div class="token-ca-row">
            <span class="mono">${esc(shortCa(market.address))}</span>
            <button type="button" class="quiet" id="token-copy" data-ca="${esc(
              market.address
            )}">Copy CA</button>
            <a class="quiet" href="${esc(
              links.etherscan || "#"
            )}" target="_blank" rel="noopener">Etherscan</a>
          </div>
          <p class="hint" style="padding:0 0 12px">Primary route today is Uniswap v4. This site does not custody a swap; Buy opens Uniswap with SIMD as the output token.</p>
          <div class="token-actions">
            <a class="quiet on" href="${esc(
              links.uniswap || "#"
            )}" target="_blank" rel="noopener">Buy SIMD</a>
            <a class="quiet" href="${esc(
              links.uniswapImd || "#"
            )}" target="_blank" rel="noopener">IMD → SIMD</a>
            <a class="quiet" href="${esc(
              links.dexscreener || "#"
            )}" target="_blank" rel="noopener">Chart</a>
          </div>
          <p class="hint" id="token-copy-status" style="padding-top:10px"></p>
        </div>
        <div class="token-buy-panel">
          <h3>Pools on Ethereum</h3>
          ${
            pairs.length
              ? `<ul class="token-pools">${pairs
                  .map(
                    (pair) => `
            <li>
              <div>
                <b>SIMD / ${esc(pair.quoteSymbol)}</b>
                <span class="hint">${esc(pair.dexId || "dex")}${
                      pair.labels?.length
                        ? ` · ${esc(pair.labels.join(" "))}`
                        : ""
                    } · liq ${esc(moneyish(pair.liquidityUsd))}</span>
              </div>
              <a href="${esc(
                pair.uniswapUrl || links.uniswap
              )}" target="_blank" rel="noopener">Swap</a>
            </li>`
                  )
                  .join("")}</ul>`
              : `<p class="hint">No Ethereum pools on the latest Dexscreener read.</p>`
          }
          <p class="hint" style="padding-top:10px">${esc(market.note || "")}</p>
        </div>
      </div>
      ${
        links.chart
          ? `<div class="token-chart"><iframe title="SIMD Dexscreener chart" src="${esc(
              links.chart
            )}" loading="lazy" referrerpolicy="no-referrer"></iframe></div>`
          : ""
      }
    </section>`;
  const copy = document.querySelector("#token-copy");
  if (copy) {
    copy.addEventListener("click", async () => {
      const status = document.querySelector("#token-copy-status");
      try {
        await navigator.clipboard.writeText(copy.dataset.ca || "");
        if (status) status.textContent = "Contract address copied.";
      } catch {
        if (status)
          status.textContent = "Copy failed. Select the CA from the header.";
      }
    });
  }
}

function moneyish(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

async function loadTokenMarket() {
  const response = await fetch("/api/token", { cache: "no-store" });
  const body = await response
    .json()
    .catch(() => ({ error: "token market failed" }));
  if (!document.querySelector("#token-body")) return;
  ui.tokenMarket = response.ok
    ? body
    : { error: body.error || "token market failed", source: body.source };
  renderTokenMarket();
}

function mountToken() {
  stage.innerHTML = `
    <div class="view-head"><h2>$SIMD</h2><p class="hint">Buy the token. Market from Dexscreener. Swap opens Uniswap.</p></div>
    <div id="token-body"><p class="hint" style="padding:14px">Loading Dexscreener.</p></div>`;
  if (ui.tokenMarket && !ui.tokenMarket.error) renderTokenMarket();
  loadTokenMarket();
}

function feedbackAuthorLabel(author) {
  if (!author) return "?";
  if (author.kind === "wallet")
    return author.label || author.wallet || "wallet";
  return author.label || (author.username ? `@${author.username}` : "?");
}

function feedbackAuthorLink(author) {
  if (!author?.url) return esc(feedbackAuthorLabel(author));
  return `<a href="${esc(author.url)}" target="_blank" rel="noopener">${esc(
    feedbackAuthorLabel(author)
  )}</a>`;
}

async function connectFeedbackWallet() {
  const eth = window.ethereum;
  if (!eth?.request) {
    ui.feedbackStatus =
      "No wallet found — install MetaMask or another injected wallet.";
    renderFeedback();
    return;
  }
  ui.feedbackStatus = "Requesting wallet…";
  renderFeedback();
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    const address = String(accounts?.[0] || "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      throw new Error("wallet address unavailable");
    const challengeRes = await fetch(
      `/api/feedback?op=wallet-challenge&address=${encodeURIComponent(
        address
      )}`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );
    const challenge = await challengeRes.json().catch(() => ({}));
    if (!challengeRes.ok || !challenge.message)
      throw new Error(challenge.error || "challenge failed");
    ui.feedbackStatus = "Sign the login message in your wallet…";
    renderFeedback();
    const signature = await eth.request({
      method: "personal_sign",
      params: [challenge.message, address],
    });
    const loginRes = await fetch("/api/feedback?op=wallet-login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: challenge.message, signature }),
    });
    const login = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) throw new Error(login.error || "wallet login failed");
    ui.feedbackStatus = `Connected ${login.label || address.slice(0, 10)}`;
    await loadFeedback(false);
  } catch (error) {
    ui.feedbackStatus = error?.message || "Wallet connect cancelled";
    renderFeedback();
  }
}

function renderFeedback() {
  const host = document.querySelector("#feedback-body");
  if (!host) return;
  const board = ui.feedback;
  if (!board) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading feedback.</p>`;
    return;
  }
  if (board.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      board.error
    )}</p>`;
    return;
  }
  const me = board.me;
  const items = Array.isArray(board.items) ? board.items : [];
  const kind = ui.feedbackKind === "bug" ? "bug" : "suggestion";
  const authed = Boolean(me);
  host.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h2>${esc(
        board.title || "Bugs & suggestions"
      )}</h2><p class="hint">${esc(board.subtitle || "")}</p></div>
      <div class="docs-copy">
        <ul>${(board.rules || [])
          .map((rule) => `<li>${esc(rule)}</li>`)
          .join("")}</ul>
        <div class="token-actions" style="margin-top:12px">
          ${
            me
              ? `<span class="hint">Signed in as <strong>${esc(
                  me.label || me.username || me.address || ""
                )}</strong> · ${esc(me.kind)}</span>
                 <button type="button" class="quiet" id="feedback-logout">Disconnect</button>`
              : `${
                  board.twitterConfigured
                    ? `<button type="button" class="quiet on" id="feedback-connect">Connect X</button>`
                    : `<span class="hint">X OAuth not configured</span>`
                }
                 <button type="button" class="quiet on" id="feedback-wallet">Connect wallet</button>`
          }
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>New post</h2><p class="hint">${
        authed
          ? `Authenticated via ${esc(me.kind)}`
          : "Connect X or wallet first"
      }</p></div>
      <form id="feedback-form" class="contest-submit" style="padding:14px">
        <div class="filters" id="feedback-kinds">
          <button type="button" data-fb-kind="suggestion" class="${
            kind === "suggestion" ? "on" : ""
          }">Suggestion</button>
          <button type="button" data-fb-kind="bug" class="${
            kind === "bug" ? "on" : ""
          }">Bug</button>
        </div>
        <label>Title<input name="title" maxlength="200" required placeholder="${
          kind === "bug" ? "Short bug title" : "One-line suggestion"
        }" ${authed ? "" : "disabled"}></label>
        <label>Details<textarea name="body" maxlength="12000" required placeholder="${
          kind === "bug"
            ? "What broke, where, steps to reproduce…"
            : "What should SIMD / Identity.md do better?"
        }" ${authed ? "" : "disabled"}></textarea></label>
        <button class="quiet on" type="submit" ${
          authed ? "" : "disabled"
        }>Post ${kind}</button>
        <p class="hint" id="feedback-status">${esc(ui.feedbackStatus || "")}</p>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Board & replies</h2><p class="hint">${
        items.length
      } posts · reply with X or wallet</p></div>
      ${
        items.length
          ? `<div class="feedback-board" style="padding:8px 14px 14px;display:grid;gap:14px">${items
              .map((item) => {
                const open = ui.feedbackOpenId === item.id;
                const replies = Array.isArray(item.replies) ? item.replies : [];
                const author =
                  item.author ||
                  (item.twitter
                    ? {
                        kind: "twitter",
                        ...item.twitter,
                        label: `@${item.twitter.username}`,
                      }
                    : null);
                return `<article class="feedback-thread" data-fb-id="${esc(
                  item.id
                )}">
            <div class="log-meta"><span>${esc(item.kind)}</span><span>${
                  item.at ? esc(ago(item.at)) : "—"
                } · ${feedbackAuthorLink(author)}</span></div>
            <p style="margin:6px 0"><b>${esc(item.title)}</b></p>
            <p class="hint" style="margin:0 0 8px;white-space:pre-wrap">${esc(
              item.body
            )}</p>
            <div class="token-actions">
              <button type="button" class="quiet" data-fb-toggle="${esc(
                item.id
              )}">${
                  open
                    ? "Hide replies"
                    : `Replies (${esc(item.replyCount ?? replies.length)})`
                }</button>
            </div>
            ${
              open
                ? `<div class="feedback-replies">
                ${
                  replies.length
                    ? replies
                        .map(
                          (reply) => `<div class="feedback-reply">
                      <div class="log-meta"><span>${feedbackAuthorLink(
                        reply.author
                      )}</span><span>${
                            reply.at ? esc(ago(reply.at)) : "—"
                          }</span></div>
                      <p class="hint" style="margin:4px 0 0;white-space:pre-wrap">${esc(
                        reply.body
                      )}</p>
                    </div>`
                        )
                        .join("")
                    : `<p class="hint">No replies yet — be the first.</p>`
                }
                <form class="contest-submit feedback-reply-form" data-fb-reply="${esc(
                  item.id
                )}" style="margin-top:10px">
                  <label class="hint">Your reply ${
                    authed ? `(as ${esc(me.label)})` : "(connect X or wallet)"
                  }</label>
                  <textarea name="body" maxlength="4000" rows="3" required placeholder="Add a constructive reply…" ${
                    authed ? "" : "disabled"
                  }>${esc(ui.feedbackReplyDraft?.[item.id] || "")}</textarea>
                  <button class="quiet on" type="submit" ${
                    authed ? "" : "disabled"
                  }>Post reply</button>
                </form>
              </div>`
                : ""
            }
          </article>`;
              })
              .join("")}</div>`
          : `<p class="hint" style="padding:14px">No posts yet.</p>`
      }
    </section>`;

  document
    .querySelector("#feedback-kinds")
    ?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-fb-kind]");
      if (!button) return;
      ui.feedbackKind = button.dataset.fbKind;
      ui.feedbackStatus = "";
      renderFeedback();
    });
  document
    .querySelector("#feedback-connect")
    ?.addEventListener("click", async () => {
      ui.feedbackStatus = "Opening X…";
      renderFeedback();
      const response = await fetch("/api/feedback?op=auth&next=feedback", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) {
        ui.feedbackStatus = body.error || "Could not start X login";
        renderFeedback();
        return;
      }
      location.href = body.url;
    });
  document
    .querySelector("#feedback-wallet")
    ?.addEventListener("click", () => connectFeedbackWallet());
  document
    .querySelector("#feedback-logout")
    ?.addEventListener("click", async () => {
      await fetch("/api/feedback?op=logout", {
        method: "POST",
        credentials: "include",
      });
      ui.feedback = null;
      ui.feedbackStatus = "Disconnected.";
      loadFeedback(true);
    });
  document.querySelectorAll("[data-fb-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.fbToggle;
      ui.feedbackOpenId = ui.feedbackOpenId === id ? null : id;
      renderFeedback();
    });
  });
  document
    .querySelector("#feedback-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ui.feedback?.me) {
        ui.feedbackStatus = "Connect X or wallet first.";
        renderFeedback();
        return;
      }
      const form = event.target;
      ui.feedbackStatus = "Posting…";
      renderFeedback();
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: ui.feedbackKind === "bug" ? "bug" : "suggestion",
          title: form.title.value,
          body: form.body.value,
        }),
      });
      const body = await response.json().catch(() => ({}));
      ui.feedbackStatus = response.ok ? "Posted." : body.error || "Post failed";
      if (response.ok) {
        form.reset();
        await loadFeedback(false);
      } else {
        renderFeedback();
      }
    });
  document.querySelectorAll("form[data-fb-reply]").forEach((form) => {
    form.addEventListener("input", () => {
      const id = form.dataset.fbReply;
      ui.feedbackReplyDraft = {
        ...(ui.feedbackReplyDraft || {}),
        [id]: form.body.value,
      };
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ui.feedback?.me) {
        ui.feedbackStatus = "Connect X or wallet to reply.";
        renderFeedback();
        return;
      }
      const parentId = form.dataset.fbReply;
      const text = String(form.body.value || "").trim();
      ui.feedbackStatus = "Posting reply…";
      renderFeedback();
      const response = await fetch("/api/feedback?op=reply", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId, body: text }),
      });
      const body = await response.json().catch(() => ({}));
      ui.feedbackStatus = response.ok
        ? "Reply posted."
        : body.error || "Reply failed";
      if (response.ok) {
        ui.feedbackReplyDraft = {
          ...(ui.feedbackReplyDraft || {}),
          [parentId]: "",
        };
        ui.feedbackOpenId = parentId;
        await loadFeedback(false);
      } else {
        renderFeedback();
      }
    });
  });
}

async function loadFeedback(showLoading) {
  const host = document.querySelector("#feedback-body");
  if (!host) return;
  if (showLoading)
    host.innerHTML = `<p class="hint" style="padding:14px">Loading feedback.</p>`;
  const response = await fetch("/api/feedback?op=list", {
    credentials: "include",
    cache: "no-store",
  });
  const body = await response
    .json()
    .catch(() => ({ error: "feedback failed" }));
  if (!host.isConnected) return;
  ui.feedback = response.ok ? body : { error: body.error || "feedback failed" };
  renderFeedback();
}

function mountFeedback() {
  stage.innerHTML = `
    <div class="view-head"><h2>Feedback</h2><p class="hint">Bugs, suggestions & replies — sign in with X or wallet.</p></div>
    <div id="feedback-body"><p class="hint" style="padding:14px">Loading feedback.</p></div>`;
  if (ui.feedback && !ui.feedback.error) renderFeedback();
  loadFeedback(!ui.feedback);
}

async function loadForum(force = false) {
  if (!force && ui.forum && ui.forumView === "board") {
    renderForum();
    return;
  }
  const response = await fetch("/api/forum?op=board", {
    credentials: "include",
    cache: "no-store",
  });
  const body = await response
    .json()
    .catch(() => ({ error: "forum unavailable" }));
  ui.forum = response.ok
    ? body
    : { error: body.error || "forum unavailable", ...body };
  if (ui.forum?.me?.displayName) ui.forumNameDraft = ui.forum.me.displayName;
  renderForum();
}

async function loadForumSection(sectionId) {
  ui.forumView = "section";
  ui.forumSectionId = sectionId;
  ui.forumThreadId = null;
  ui.forumThread = null;
  ui.forumStatus = "Loading section…";
  renderForum();
  const response = await fetch(
    `/api/forum?op=section&section=${encodeURIComponent(sectionId)}`,
    {
      credentials: "include",
      cache: "no-store",
    }
  );
  const body = await response
    .json()
    .catch(() => ({ error: "section unavailable" }));
  if (!response.ok) {
    ui.forumStatus = body.error || "Could not open section";
    ui.forumSection = null;
    if (body.code === "forum_holders_gate") {
      ui.forumView = "board";
      await loadForum(true);
      ui.forumStatus = body.error;
      renderForum();
      return;
    }
    renderForum();
    return;
  }
  ui.forumSection = body;
  ui.forumStatus = "";
  renderForum();
}

async function loadForumThread(threadId) {
  ui.forumView = "thread";
  ui.forumThreadId = threadId;
  ui.forumStatus = "Loading thread…";
  renderForum();
  const response = await fetch(
    `/api/forum?op=thread&id=${encodeURIComponent(threadId)}`,
    {
      credentials: "include",
      cache: "no-store",
    }
  );
  const body = await response
    .json()
    .catch(() => ({ error: "thread unavailable" }));
  if (!response.ok) {
    ui.forumStatus = body.error || "Could not open thread";
    ui.forumThread = null;
    if (body.code === "forum_holders_gate") {
      ui.forumView = "board";
      await loadForum(true);
      ui.forumStatus = body.error;
      renderForum();
      return;
    }
    renderForum();
    return;
  }
  ui.forumThread = body;
  ui.forumSectionId = body.section?.id || ui.forumSectionId;
  ui.forumStatus = "";
  renderForum();
}

async function connectForumWallet() {
  const eth = window.ethereum;
  if (!eth?.request) {
    ui.forumStatus =
      "No wallet found — install MetaMask or another injected wallet.";
    renderForum();
    return;
  }
  ui.forumStatus = "Requesting wallet…";
  renderForum();
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    const address = String(accounts?.[0] || "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      throw new Error("wallet address unavailable");
    const challengeRes = await fetch(
      `/api/forum?op=wallet-challenge&address=${encodeURIComponent(address)}`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );
    const challenge = await challengeRes.json().catch(() => ({}));
    if (!challengeRes.ok || !challenge.message)
      throw new Error(challenge.error || "challenge failed");
    ui.forumStatus = "Sign the login message in your wallet…";
    renderForum();
    const signature = await eth.request({
      method: "personal_sign",
      params: [challenge.message, address],
    });
    const loginRes = await fetch("/api/forum?op=wallet-login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: challenge.message, signature }),
    });
    const login = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) throw new Error(login.error || "wallet login failed");
    ui.forumStatus = `Connected ${
      login.label || address.slice(0, 10)
    } — checking holder access…`;
    await fetch("/api/forum?op=access", {
      method: "POST",
      credentials: "include",
    });
    await loadForum(true);
    if (ui.forumView === "section" && ui.forumSectionId)
      await loadForumSection(ui.forumSectionId);
  } catch (error) {
    ui.forumStatus = error?.message || "Wallet connect cancelled";
    renderForum();
  }
}

function forumAuthorHtml(author) {
  if (!author) return "—";
  const label = esc(author.displayName || author.label || "?");
  if (author.url)
    return `<a href="${esc(
      author.url
    )}" target="_blank" rel="noopener">${label}</a>`;
  return label;
}

function renderForum() {
  const host = document.querySelector("#forum-body");
  if (!host) return;
  if (!ui.forum) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading forum…</p>`;
    return;
  }
  if (ui.forum.error && !ui.forum.sections) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      ui.forum.error
    )}</p>`;
    return;
  }

  const me = ui.forum.me;
  const access = ui.forum.access;
  const authed = Boolean(me);
  const holderOk = Boolean(access?.ok);
  const gates = ui.forum.gates || {};

  const authBar = `
    <div class="token-actions" style="margin-top:10px">
      ${
        me
          ? `<span class="hint">Signed in as <strong>${esc(
              me.displayName || me.twitterUsername || me.wallet || ""
            )}</strong> · ${esc(me.kind)}</span>
             <button type="button" class="quiet" id="forum-logout">Disconnect</button>`
          : `<button type="button" class="quiet on" id="forum-connect-x">Connect X</button>
             <button type="button" class="quiet on" id="forum-connect-wallet">Connect wallet</button>`
      }
      ${
        authed && me?.kind === "twitter"
          ? `<button type="button" class="quiet" id="forum-link-wallet">${
              holderOk ? "Refresh wallet gate" : "Link wallet for VIP"
            }</button>`
          : ""
      }
    </div>`;

  const profilePanel = authed
    ? `<section class="panel">
        <div class="panel-head"><h2>Your forum profile</h2><p class="hint">Public name shown on threads</p></div>
        <form id="forum-profile-form" class="contest-submit" style="padding:14px">
          <label>Display name<input name="displayName" maxlength="32" minlength="2" required value="${esc(
            ui.forumNameDraft || me.displayName || ""
          )}"></label>
          <button class="quiet on" type="submit">Save name</button>
        </form>
      </section>`
    : "";

  const accessHint = `
    <p class="hint" style="margin-top:8px">
      Hidden boards unlock with an <strong>Identity.md seat NFT</strong>
      or ≥$${esc(gates.whaleUsd ?? 1000)} of <strong>$SIMD</strong>.
      ${
        access
          ? access.ok
            ? ` · Access: ${esc((access.reasons || []).join(" · ") || "ok")}`
            : ` · Locked: ${esc(
                (access.reasons || []).join(" · ") || "verify wallet"
              )}`
          : " · Connect wallet to check."
      }
    </p>`;

  let body = "";
  if (ui.forumView === "thread" && ui.forumThread) {
    const t = ui.forumThread.thread;
    const posts = Array.isArray(ui.forumThread.posts)
      ? ui.forumThread.posts
      : [];
    const section = ui.forumThread.section;
    body = `
      <section class="panel">
        <div class="panel-head">
          <h2>${esc(t.title)}</h2>
          <p class="hint">
            <button type="button" class="linkish" id="forum-back-section">← ${esc(
              section?.title || "Section"
            )}</button>
            · ${forumAuthorHtml(t.author)} · ${t.at ? esc(ago(t.at)) : "—"}
          </p>
        </div>
        <div class="forum-op" style="padding:14px">
          <p style="white-space:pre-wrap;margin:0">${esc(t.body)}</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Replies</h2><p class="hint">${
          posts.length
        } posts</p></div>
        <div class="forum-posts" style="padding:8px 14px 14px;display:grid;gap:12px">
          ${
            posts.length
              ? posts
                  .map(
                    (post) => `<article class="forum-post">
                <div class="log-meta"><span>${forumAuthorHtml(
                  post.author
                )}</span><span>${post.at ? esc(ago(post.at)) : "—"}</span></div>
                <p class="hint" style="margin:4px 0 0;white-space:pre-wrap">${esc(
                  post.body
                )}</p>
              </article>`
                  )
                  .join("")
              : `<p class="hint">No replies yet.</p>`
          }
        </div>
        <form id="forum-reply-form" class="contest-submit" style="padding:0 14px 14px">
          <label class="hint">Reply ${
            authed ? `as ${esc(me.displayName)}` : "(connect first)"
          }</label>
          <textarea name="body" maxlength="4000" rows="4" required placeholder="Write a reply…" ${
            authed ? "" : "disabled"
          }></textarea>
          <button class="quiet on" type="submit" ${
            authed ? "" : "disabled"
          }>Post reply</button>
        </form>
      </section>`;
  } else if (ui.forumView === "section" && ui.forumSection) {
    const section = ui.forumSection.section;
    const threads = Array.isArray(ui.forumSection.threads)
      ? ui.forumSection.threads
      : [];
    body = `
      <section class="panel">
        <div class="panel-head">
          <h2>${esc(section.title)}${section.hidden ? " · VIP" : ""}</h2>
          <p class="hint"><button type="button" class="linkish" id="forum-back-board">← All boards</button> · ${esc(
            section.blurb || ""
          )}</p>
        </div>
        <div class="forum-thread-list" style="padding:8px 14px 14px">
          ${
            threads.length
              ? `<table class="docs-table forum-table"><thead><tr><th>Topic</th><th>Author</th><th>Replies</th><th>Last</th></tr></thead><tbody>
              ${threads
                .map(
                  (thread) => `<tr class="clickable" data-forum-thread="${esc(
                    thread.id
                  )}">
                  <td><b>${esc(thread.title)}</b></td>
                  <td>${forumAuthorHtml(thread.author)}</td>
                  <td class="mono">${esc(thread.replyCount || 0)}</td>
                  <td>${thread.lastAt ? esc(ago(thread.lastAt)) : "—"}</td>
                </tr>`
                )
                .join("")}
            </tbody></table>`
              : `<p class="hint">No threads yet — start one.</p>`
          }
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>New thread</h2><p class="hint">${
          authed
            ? `Posting as ${esc(me.displayName)}`
            : "Connect X or wallet first"
        }</p></div>
        <form id="forum-thread-form" class="contest-submit" style="padding:14px">
          <label>Title<input name="title" maxlength="140" required placeholder="Topic title" ${
            authed ? "" : "disabled"
          }></label>
          <label>Body<textarea name="body" maxlength="8000" rows="6" required placeholder="Open the discussion…" ${
            authed ? "" : "disabled"
          }></textarea></label>
          <button class="quiet on" type="submit" ${
            authed ? "" : "disabled"
          }>Create thread</button>
        </form>
      </section>`;
  } else {
    const sections = Array.isArray(ui.forum.sections) ? ui.forum.sections : [];
    const publicBoards = sections.filter((s) => !s.hidden);
    const vipBoards = sections.filter((s) => s.hidden);
    body = `
      <section class="panel">
        <div class="panel-head"><h2>${esc(
          ui.forum.title || "SIMD Forum"
        )}</h2><p class="hint">${esc(ui.forum.subtitle || "")}</p></div>
        <div class="docs-copy" style="padding-bottom:8px">
          <ul>${(ui.forum.rules || [])
            .map((rule) => `<li>${esc(rule)}</li>`)
            .join("")}</ul>
          ${authBar}
          ${accessHint}
        </div>
      </section>
      ${profilePanel}
      <section class="panel">
        <div class="panel-head"><h2>Boards</h2><p class="hint">${
          publicBoards.length
        } public</p></div>
        <div class="forum-board-grid">
          ${publicBoards
            .map(
              (
                section
              ) => `<button type="button" class="forum-board-card" data-forum-section="${esc(
                section.id
              )}">
              <b>${esc(section.title)}</b>
              <span class="hint">${esc(section.blurb)}</span>
              <span class="mono">${esc(section.threadCount || 0)} threads</span>
            </button>`
            )
            .join("")}
        </div>
      </section>
      ${
        holderOk
          ? `<section class="panel forum-vip">
              <div class="panel-head"><h2>Hidden boards</h2><p class="hint">NFT / whale unlocked</p></div>
              <div class="forum-board-grid">
                ${vipBoards
                  .map(
                    (
                      section
                    ) => `<button type="button" class="forum-board-card vip" data-forum-section="${esc(
                      section.id
                    )}">
                    <b>${esc(section.title)}</b>
                    <span class="hint">${esc(section.blurb)}</span>
                    <span class="mono">${esc(
                      section.threadCount || 0
                    )} threads</span>
                  </button>`
                  )
                  .join("")}
              </div>
            </section>`
          : `<section class="panel">
              <div class="panel-head"><h2>Hidden boards</h2><p class="hint">Locked · like Forocoches VIP</p></div>
              <p class="hint" style="padding:0 14px 14px">Seat NFT or ≥$${esc(
                gates.whaleUsd ?? 1000
              )} $SIMD required. Connect wallet to reveal Holders Lounge, Alpha Desk, and Ops Room.</p>
            </section>`
      }`;
  }

  host.innerHTML = `${body}<p class="hint" id="forum-status" style="padding:0 0 14px">${esc(
    ui.forumStatus || ""
  )}</p>`;

  document
    .querySelector("#forum-connect-x")
    ?.addEventListener("click", async () => {
      ui.forumStatus = "Opening X…";
      renderForum();
      const response = await fetch("/api/forum?op=auth", {
        credentials: "include",
        cache: "no-store",
      });
      const bodyJson = await response.json().catch(() => ({}));
      if (!response.ok || !bodyJson.url) {
        ui.forumStatus = bodyJson.error || "Could not start X login";
        renderForum();
        return;
      }
      location.href = bodyJson.url;
    });
  document
    .querySelector("#forum-connect-wallet")
    ?.addEventListener("click", () => connectForumWallet());
  document
    .querySelector("#forum-link-wallet")
    ?.addEventListener("click", () => connectForumWallet());
  document
    .querySelector("#forum-logout")
    ?.addEventListener("click", async () => {
      await fetch("/api/forum?op=logout", {
        method: "POST",
        credentials: "include",
      });
      ui.forum = null;
      ui.forumView = "board";
      ui.forumStatus = "Disconnected.";
      loadForum(true);
    });
  document.querySelector("#forum-back-board")?.addEventListener("click", () => {
    ui.forumView = "board";
    ui.forumSection = null;
    ui.forumThread = null;
    loadForum(true);
  });
  document
    .querySelector("#forum-back-section")
    ?.addEventListener("click", () => {
      if (ui.forumSectionId) loadForumSection(ui.forumSectionId);
      else {
        ui.forumView = "board";
        loadForum(true);
      }
    });
  document.querySelectorAll("[data-forum-section]").forEach((btn) => {
    btn.addEventListener("click", () =>
      loadForumSection(btn.dataset.forumSection)
    );
  });
  document.querySelectorAll("[data-forum-thread]").forEach((row) => {
    row.addEventListener("click", () =>
      loadForumThread(row.dataset.forumThread)
    );
  });
  document
    .querySelector("#forum-profile-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = event.target.displayName.value;
      ui.forumNameDraft = name;
      ui.forumStatus = "Saving profile…";
      renderForum();
      const response = await fetch("/api/forum?op=profile", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const bodyJson = await response.json().catch(() => ({}));
      ui.forumStatus = response.ok
        ? "Profile saved."
        : bodyJson.error || "Save failed";
      if (response.ok && bodyJson.me) {
        ui.forum.me = bodyJson.me;
        ui.forumNameDraft = bodyJson.me.displayName || name;
      }
      renderForum();
    });
  document
    .querySelector("#forum-thread-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ui.forum?.me) {
        ui.forumStatus = "Connect X or wallet first.";
        renderForum();
        return;
      }
      const form = event.target;
      ui.forumStatus = "Creating thread…";
      renderForum();
      const response = await fetch("/api/forum?op=thread", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sectionId: ui.forumSectionId,
          title: form.title.value,
          body: form.body.value,
        }),
      });
      const bodyJson = await response.json().catch(() => ({}));
      if (!response.ok) {
        ui.forumStatus = bodyJson.error || "Create failed";
        renderForum();
        return;
      }
      ui.forumStatus = "Thread created.";
      if (bodyJson.thread?.id) await loadForumThread(bodyJson.thread.id);
      else await loadForumSection(ui.forumSectionId);
    });
  document
    .querySelector("#forum-reply-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ui.forum?.me) {
        ui.forumStatus = "Connect X or wallet to reply.";
        renderForum();
        return;
      }
      const form = event.target;
      ui.forumStatus = "Posting reply…";
      renderForum();
      const response = await fetch("/api/forum?op=reply", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: ui.forumThreadId,
          body: form.body.value,
        }),
      });
      const bodyJson = await response.json().catch(() => ({}));
      ui.forumStatus = response.ok
        ? "Reply posted."
        : bodyJson.error || "Reply failed";
      if (response.ok) await loadForumThread(ui.forumThreadId);
      else renderForum();
    });
}

function mountForum() {
  stage.innerHTML = `
    <div class="view-head"><h2>Forum</h2><p class="hint">IMD boards · hidden VIP for NFT / whale holders</p></div>
    <div id="forum-body"><p class="hint" style="padding:14px">Loading forum…</p></div>`;
  ui.forumView = ui.forumView || "board";
  if (ui.forumView === "thread" && ui.forumThreadId)
    loadForumThread(ui.forumThreadId);
  else if (ui.forumView === "section" && ui.forumSectionId)
    loadForumSection(ui.forumSectionId);
  else loadForum(true);
}

function renderExperimental() {
  const host = document.querySelector("#experimental-body");
  if (!host) return;
  const board = ui.experimental;
  if (!board) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading experimental.</p>`;
    return;
  }
  if (board.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      board.error
    )}</p>`;
    return;
  }
  const site = board.site || {};
  const log = Array.isArray(board.log) ? board.log : [];
  const pipe = board.pipeline || {};
  const requests = Array.isArray(board.requests) ? board.requests : [];
  host.innerHTML = `
    <div class="split">
      <section class="panel">
        <div class="panel-head">
          <h2>${esc(site.title || "Experimental")}</h2>
          <p class="hint">v${esc(site.version)} · ${
    board.enabled ? "spending ON" : "spending OFF"
  } · ${esc(board.requestsToday ?? 0)} / ${esc(
    board.dailyCap ?? 25
  )} requests · phase ${esc(pipe.phase || "idle")}${
    pipe.jobUrl
      ? ` · <a href="${esc(
          pipe.jobUrl
        )}" target="_blank" rel="noopener">active job</a>`
      : ""
  }</p>
        </div>
        <p class="hint" style="padding:0 14px">${esc(board.subtitle || "")}</p>
        <form id="experimental-form" class="contest-submit" style="padding:14px">
          <label class="hint">Request a focused wiki edit (anyone)</label>
          <textarea id="experimental-request" rows="5" minlength="20" maxlength="8000" required placeholder="e.g. Add a Glossary entry for ‘oracle’ with a 2-sentence IMD definition…">${esc(
            ui.experimentalDraft || ""
          )}</textarea>
          <div class="token-actions" style="padding-top:10px">
            <button type="submit" class="quiet on">Queue request</button>
            <a class="quiet" href="/experimental/" target="_blank" rel="noopener">Open standalone</a>
            <button type="button" class="quiet" id="experimental-refresh">Refresh</button>
          </div>
          <p class="hint" id="experimental-status">${esc(
            ui.experimentalStatus || ""
          )}</p>
        </form>
        <div class="panel" style="margin:0 14px 14px;padding:12px">
          <p class="hint" style="margin:0 0 8px">Active pipeline</p>
          <p style="margin:0"><code>implement (patch only) → review (must approve to ship)</code> · 2 jobs / request</p>
          <p class="hint" style="margin:8px 0 0">cycle ${esc(
            pipe.cycleId || "—"
          )}${
    pipe.jobUrl
      ? ` · <a href="${esc(
          pipe.jobUrl
        )}" target="_blank" rel="noopener">live job</a>`
      : ""
  }</p>
          ${
            pipe.requestText
              ? `<p class="hint" style="margin:8px 0 0"><strong>Request:</strong> ${esc(
                  pipe.requestText
                )}</p>`
              : ""
          }
          ${
            pipe.implementation?.summary
              ? `<p class="hint" style="margin:8px 0 0"><strong>Implement:</strong> ${esc(
                  pipe.implementation.summary
                )}</p>`
              : ""
          }
          ${
            pipe.decision
              ? `<p class="hint" style="margin:8px 0 0"><strong>Review:</strong> ${
                  pipe.decision.apply ? "APPLY" : "REJECT"
                } · q${esc(pipe.decision.quality ?? "—")} — ${esc(
                  pipe.decision.reason || ""
                )}</p>`
              : ""
          }
        </div>
        <iframe
          id="experimental-frame"
          title="SIMD Experimental"
          src="/experimental/?embed=1"
          style="width:100%;height:min(55vh,560px);border:0;border-top:1px solid var(--line, #1c2430);background:#07090c"
          sandbox="allow-scripts allow-same-origin allow-forms"
        ></iframe>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Request queue</h2><p class="hint">Newest first</p></div>
        <div style="padding:0 14px 14px;display:grid;gap:10px">
          ${
            requests.length
              ? requests
                  .map(
                    (
                      row
                    ) => `<article style="border-top:1px solid var(--line,#1c2430);padding-top:10px">
              <p style="margin:0"><strong>${esc(row.status)}</strong>${
                      row.version ? ` · shipped v${esc(row.version)}` : ""
                    }</p>
              <p class="hint" style="margin:6px 0">${esc(row.text)}</p>
              <p class="hint" style="margin:0">
                ${
                  row.implementJobUrl
                    ? `<a href="${esc(
                        row.implementJobUrl
                      )}" target="_blank" rel="noopener">implement job</a>`
                    : "implement pending"
                }
                ${
                  row.reviewJobUrl
                    ? ` · <a href="${esc(
                        row.reviewJobUrl
                      )}" target="_blank" rel="noopener">review job</a>`
                    : ""
                }
                ${
                  row.decision
                    ? ` · ${row.decision.apply ? "APPLY" : "REJECT"}${
                        row.decision.quality != null
                          ? ` q${esc(row.decision.quality)}`
                          : ""
                      }`
                    : ""
                }
              </p>
              ${
                row.decision?.reason
                  ? `<p class="hint" style="margin:6px 0 0">${esc(
                      row.decision.reason
                    )}</p>`
                  : ""
              }
            </article>`
                  )
                  .join("")
              : `<p class="hint">No requests yet — be the first.</p>`
          }
        </div>
        <div class="panel-head"><h2>Revision log</h2></div>
        <ul class="hint" style="padding:0 14px 14px;margin:0;list-style:none;display:grid;gap:10px">
          ${
            log.length
              ? log
                  .map(
                    (row) =>
                      `<li><strong>v${esc(row.version)}</strong> · ${esc(
                        row.summary || ""
                      )}${
                        row.jobId
                          ? ` · <a href="https://explorer.imd.fun/jobs/${esc(
                              row.jobId
                            )}" target="_blank" rel="noopener">${esc(
                              shortId(row.jobId)
                            )}</a>`
                          : ""
                      }</li>`
                  )
                  .join("")
              : `<li>No revisions yet.</li>`
          }
        </ul>
        <div class="panel-head"><h2>Rules</h2></div>
        <ul class="hint" style="padding:0 14px 14px">${(board.rules || [])
          .map((r) => `<li>${esc(r)}</li>`)
          .join("")}</ul>
        ${
          board.lastError
            ? `<p class="hint" style="padding:0 14px 14px">Last error: ${esc(
                board.lastError
              )}</p>`
            : ""
        }
      </section>
    </div>`;
  document
    .querySelector("#experimental-refresh")
    ?.addEventListener("click", () => {
      const frame = document.querySelector("#experimental-frame");
      if (frame) frame.src = `/experimental/?t=${Date.now()}`;
      loadExperimental(false);
    });
  document
    .querySelector("#experimental-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = document.querySelector("#experimental-request")?.value || "";
      ui.experimentalDraft = text;
      ui.experimentalStatus = "Queueing…";
      const statusEl = document.querySelector("#experimental-status");
      if (statusEl) statusEl.textContent = ui.experimentalStatus;
      const response = await fetch("/api/contest?op=experimental-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "experimental-request", text }),
      });
      const body = await response.json().catch(() => ({}));
      ui.experimentalStatus = response.ok
        ? `Queued (${body.requestsToday}/${body.dailyCap} today). Pipeline advancing…`
        : body.error || "Request failed";
      if (response.ok) ui.experimentalDraft = "";
      await loadExperimental(false);
    });
}

async function tickExperimental() {
  try {
    await fetch("/api/contest?op=experimental-tick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "experimental-tick" }),
    });
  } catch {
    // ignore
  }
}

async function loadExperimental(showLoading) {
  const host = document.querySelector("#experimental-body");
  if (!host) return;
  if (showLoading)
    host.innerHTML = `<p class="hint" style="padding:14px">Loading experimental.</p>`;
  await tickExperimental();
  const response = await fetch("/api/contest?op=experimental", {
    cache: "no-store",
  });
  const body = await response
    .json()
    .catch(() => ({ error: "experimental failed" }));
  if (!host.isConnected) return;
  ui.experimental = response.ok
    ? body
    : { error: body.error || "experimental failed" };
  renderExperimental();
}

function mountExperimental() {
  stage.innerHTML = `
    <div class="view-head"><h2>Experimental</h2><p class="hint">Wikipedia-style IMD wiki · patch → swarm review → ship · max 25/day.</p></div>
    <div id="experimental-body"><p class="hint" style="padding:14px">Loading experimental.</p></div>`;
  if (ui.experimental && !ui.experimental.error) renderExperimental();
  loadExperimental(!ui.experimental);
}

function renderThesis() {
  const host = document.querySelector("#thesis-body");
  if (!host) return;
  const board = ui.thesis;
  if (!board) {
    host.innerHTML = `<p class="hint" style="padding:14px">Loading thesis.</p>`;
    return;
  }
  if (board.error) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      board.error
    )}</p>`;
    return;
  }
  const me = board.me;
  const limits = board.limits || {};
  const items = Array.isArray(board.items) ? board.items : [];
  host.innerHTML = `
    <div class="split">
      <section class="panel">
        <div class="panel-head">
          <h2>Submit thesis</h2>
          <p class="hint">${
            me
              ? `@${esc(me.username)}${
                  me.followers != null
                    ? ` · ${esc(me.followers)} followers`
                    : ""
                }`
              : "Connect X first"
          } · ≥${esc(limits.minFollowers ?? 50)} followers · ≥${esc(
    limits.minSimd ?? 1000
  )} $SIMD · quality ≥${esc(
    limits.minQualityToPay ?? 8
  )}/10 to pay · one payout / account · ${esc(limits.minPayImd ?? 0.1)}–${esc(
    limits.maxPayImd ?? 2
  )} IMD · pay ${board.payEnabled ? "ON" : "OFF"} ${esc(
    board.paidToday ?? 0
  )}/${esc(limits.dailyPayCap ?? 25)}</p>
        </div>
        <div class="token-actions" style="padding:0 14px 10px">
          ${
            me
              ? `<button type="button" class="quiet" id="thesis-logout">Disconnect X</button>`
              : board.twitterConfigured
              ? `<button type="button" class="quiet on" id="thesis-connect">Connect X</button>`
              : `<span class="hint">X OAuth not configured</span>`
          }
        </div>
        <form id="thesis-form" class="contest-submit" style="padding:14px">
          <label class="hint">Thesis (IMD + SIMD) · ≥${esc(
            limits.minThesisChars ?? 400
          )} chars · hard-graded</label>
          <textarea id="thesis-text" rows="10" minlength="${esc(
            limits.minThesisChars ?? 900
          )}" maxlength="${esc(
    limits.maxThesisChars ?? 12000
  )}" required placeholder="Write a developed thesis (≥900 chars): mechanisms, tradeoffs, falsifiable IMD/SIMD claims — slogans and fluff score ~2–5 and pay 0…" ${
    me ? "" : "disabled"
  }>${esc(ui.thesisDraft?.thesis || "")}</textarea>
          <label class="hint">X post URL (must mention ${(
            limits.requiredMentions || ["SuperIMDeth"]
          )
            .map((h) => `@${esc(h)}`)
            .join(" + ")})</label>
          <input id="thesis-tweet" type="url" required placeholder="https://x.com/you/status/…" value="${esc(
            ui.thesisDraft?.tweetUrl || ""
          )}" ${me ? "" : "disabled"} />
          <label class="hint">Payout wallet (≥${esc(
            limits.minSimd ?? 1000
          )} $SIMD on-chain)</label>
          <input id="thesis-wallet" type="text" required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" value="${esc(
            ui.thesisDraft?.wallet || ""
          )}" ${me ? "" : "disabled"} />
          <div class="token-actions" style="padding-top:10px">
            <button type="submit" class="quiet on" ${
              me ? "" : "disabled"
            }>Submit for swarm review</button>
          </div>
          <p class="hint" id="thesis-status">${esc(ui.thesisStatus || "")}</p>
        </form>
        ${
          board.mine
            ? `<p class="hint" style="padding:0 14px 14px">Your entry: <strong>${esc(
                board.mine.status
              )}</strong>${
                board.mine.reviewJobUrl
                  ? ` · <a href="${esc(
                      board.mine.reviewJobUrl
                    )}" target="_blank" rel="noopener">review job</a>`
                  : ""
              }${
                board.mine.score
                  ? ` · quality ${esc(
                      board.mine.score.quality
                    )}/10 · payout ${esc(board.mine.score.payoutImd)} IMD`
                  : ""
              }${
                board.mine.payout?.tx
                  ? ` · tx ${esc(shortId(board.mine.payout.tx))}`
                  : ""
              }</p>`
            : ""
        }
        <ul class="hint" style="padding:0 14px 14px">${(board.rules || [])
          .map((r) => `<li>${esc(r)}</li>`)
          .join("")}</ul>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Board</h2><p class="hint">Click an entry to expand review details</p></div>
        <div style="padding:0 14px 14px;display:grid;gap:10px">
          ${
            items.length
              ? items
                  .map((row) => {
                    const open = ui.thesisOpenId === row.id;
                    const score = row.score;
                    return `<article class="thesis-card" data-thesis-id="${esc(
                      row.id
                    )}" style="border:1px solid var(--line,#1c2430);padding:12px;cursor:pointer;background:${
                      open ? "rgba(255,255,255,.03)" : "transparent"
                    }">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
                <p style="margin:0"><a href="${esc(
                  row.twitter.url
                )}" target="_blank" rel="noopener" data-stop>@${esc(
                      row.twitter.username
                    )}</a> · ${esc(
                      row.twitter.followers
                    )} followers · <strong>${esc(row.status)}</strong></p>
                <span class="hint">${open ? "▾" : "▸"}</span>
              </div>
              <p class="hint" style="margin:8px 0 0">${esc(
                row.thesis.slice(0, open ? 12_000 : 220)
              )}${!open && row.thesis.length > 220 ? "…" : ""}</p>
              <p class="hint" style="margin:8px 0 0">
                <a href="${esc(
                  row.tweetUrl
                )}" target="_blank" rel="noopener" data-stop>View post</a>
                ${
                  row.reviewJobUrl
                    ? ` · <a href="${esc(
                        row.reviewJobUrl
                      )}" target="_blank" rel="noopener" data-stop>Review job</a>`
                    : " · review job pending"
                }
                ${
                  score
                    ? ` · <strong>${esc(score.quality)}/10</strong> · ${esc(
                        score.payoutImd
                      )} IMD`
                    : ""
                }
                ${
                  row.payout?.tx
                    ? ` · paid`
                    : row.payout?.skipped
                    ? ` · pay skipped`
                    : ""
                }
              </p>
              ${
                open
                  ? `<div class="thesis-detail" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#1c2430);display:grid;gap:8px">
                <p class="hint" style="margin:0"><strong>Full thesis</strong></p>
                <p style="margin:0;white-space:pre-wrap;line-height:1.45">${esc(
                  row.thesis
                )}</p>
                <p class="hint" style="margin:8px 0 0"><strong>Swarm review</strong></p>
                ${
                  score
                    ? `<p class="hint" style="margin:0">Quality: <strong>${esc(
                        score.quality
                      )}/10</strong> · Followers impact input: ${esc(
                        score.impact
                      )} · Computed payout: <strong>${esc(
                        score.payoutImd
                      )} IMD</strong></p>
                       ${
                         score.impactNote
                           ? `<p class="hint" style="margin:0">Impact note: ${esc(
                               score.impactNote
                             )}</p>`
                           : ""
                       }
                       ${
                         score.notes
                           ? `<p class="hint" style="margin:0">Notes: ${esc(
                               score.notes
                             )}</p>`
                           : ""
                       }
                       ${
                         (score.flags || []).length
                           ? `<p class="hint" style="margin:0">Flags: ${esc(
                               score.flags.join(", ")
                             )}</p>`
                           : ""
                       }
                       ${
                         score.at
                           ? `<p class="hint" style="margin:0">Scored at ${esc(
                               score.at
                             )}</p>`
                           : ""
                       }`
                    : `<p class="hint" style="margin:0">Waiting for the swarm agent to finish scoring.${
                        row.reviewJobUrl
                          ? ` Open the <a href="${esc(
                              row.reviewJobUrl
                            )}" target="_blank" rel="noopener" data-stop>review job</a> to watch progress.`
                          : " A review job has not been opened yet."
                      }</p>`
                }
                <p class="hint" style="margin:8px 0 0"><strong>Payout</strong></p>
                ${
                  row.payout?.tx
                    ? `<p class="hint" style="margin:0">Paid ${esc(
                        row.payout.amountImd
                      )} IMD · ${chainAnchor(row.payout.tx)}</p>`
                    : row.payout?.skipped
                    ? `<p class="hint" style="margin:0">Calculated ${esc(
                        row.payout.amountImd ?? score?.payoutImd ?? "—"
                      )} IMD · auto-pay OFF (${esc(
                        row.payout.error || "SIMD_THESIS_PAY≠1"
                      )})</p>`
                    : score
                    ? `<p class="hint" style="margin:0">Score ready · payout ${esc(
                        score.payoutImd
                      )} IMD pending (enable SIMD_THESIS_PAY=1 to transfer)</p>`
                    : `<p class="hint" style="margin:0">No payout until the review completes.</p>`
                }
                <p class="hint" style="margin:0">Wallet: <code>${esc(
                  row.wallet
                )}</code></p>
                ${
                  row.reviewJobId
                    ? `<p class="hint" style="margin:0">Job id: <a href="${esc(
                        row.reviewJobUrl
                      )}" target="_blank" rel="noopener" data-stop>${esc(
                        row.reviewJobId
                      )}</a></p>`
                    : ""
                }
              </div>`
                  : ""
              }
            </article>`;
                  })
                  .join("")
              : `<p class="hint">No theses yet.</p>`
          }
        </div>
      </section>
    </div>`;

  for (const card of document.querySelectorAll("[data-thesis-id]")) {
    card.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-stop]")) return;
      const id = card.getAttribute("data-thesis-id");
      ui.thesisOpenId = ui.thesisOpenId === id ? null : id;
      renderThesis();
    });
  }
  document
    .querySelector("#thesis-connect")
    ?.addEventListener("click", async () => {
      ui.thesisStatus = "Opening X…";
      renderThesis();
      const response = await fetch("/api/feedback?op=auth&next=thesis", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) {
        ui.thesisStatus = body.error || "Could not start X login";
        renderThesis();
        return;
      }
      location.href = body.url;
    });
  document
    .querySelector("#thesis-logout")
    ?.addEventListener("click", async () => {
      await fetch("/api/feedback?op=logout", {
        method: "POST",
        credentials: "include",
      });
      ui.thesis = null;
      ui.thesisStatus = "Disconnected.";
      loadThesis(false);
    });
  document
    .querySelector("#thesis-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ui.thesis?.me) {
        ui.thesisStatus = "Connect X first.";
        renderThesis();
        return;
      }
      const payload = {
        op: "thesis",
        thesis: document.querySelector("#thesis-text")?.value || "",
        tweetUrl: document.querySelector("#thesis-tweet")?.value || "",
        wallet: document.querySelector("#thesis-wallet")?.value || "",
      };
      ui.thesisDraft = {
        thesis: payload.thesis,
        tweetUrl: payload.tweetUrl,
        wallet: payload.wallet,
      };
      ui.thesisStatus = "Submitting…";
      const statusEl = document.querySelector("#thesis-status");
      if (statusEl) statusEl.textContent = ui.thesisStatus;
      const response = await fetch("/api/contest?op=thesis", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      ui.thesisStatus = response.ok
        ? "Submitted for swarm review."
        : body.error || "Submit failed";
      if (response.ok) {
        ui.thesisDraft = { thesis: "", tweetUrl: "", wallet: "" };
      }
      await loadThesis(false);
    });
}

async function tickThesis() {
  try {
    await fetch("/api/contest?op=thesis-tick", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "thesis-tick" }),
    });
  } catch {
    // ignore
  }
}

async function loadThesis(showLoading) {
  const host = document.querySelector("#thesis-body");
  if (!host) return;
  if (showLoading)
    host.innerHTML = `<p class="hint" style="padding:14px">Loading thesis.</p>`;
  await tickThesis();
  const response = await fetch("/api/contest?op=thesis", {
    credentials: "include",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({ error: "thesis failed" }));
  if (!host.isConnected) return;
  ui.thesis = response.ok ? body : { error: body.error || "thesis failed" };
  renderThesis();
}

function mountThesis() {
  stage.innerHTML = `
    <div class="view-head"><h2>Thesis</h2><p class="hint">X theses on IMD + SIMD · hard swarm grade · pay only ≥7/10 · steep 0.1–2 IMD curve · once per account.</p></div>
    <div id="thesis-body"><p class="hint" style="padding:14px">Loading thesis.</p></div>`;
  if (ui.thesis && !ui.thesis.error) renderThesis();
  loadThesis(!ui.thesis);
}

function startVariantSwitch(active) {
  return `<div class="start-variant-switch" aria-label="Start design">
    <span>Start direction</span>
    <a href="/?start=1#start" class="${active === 1 ? "on" : ""}">A · Clear</a>
    <a href="/?start=2#start" class="${
      active === 2 ? "on" : ""
    }">B · Control</a>
  </div>`;
}

function startReadout(state) {
  const metrics = Array.isArray(state?.metrics) ? state.metrics : [];
  const metric = (label) =>
    metrics.find((m) =>
      String(m.label || "")
        .toLowerCase()
        .includes(label.toLowerCase())
    );
  const agents = metric("agent") || metric("seat") || metrics[0];
  const jobs = metric("job") || metrics[1];
  const connected = state?.sources?.some(
    (s) => s.name === "IMD control plane" && s.status === "CONNECTED"
  );
  return { agents, jobs, connected, cycle: state?.intel?.cycle ?? "—" };
}

function startSignalRows(state, limit = 5) {
  const stream = (state?.stream || []).slice(0, limit);
  return stream.length
    ? stream
        .map(
          (event) => `<li>
        <span class="start-signal-time">${esc(
          ago(event.at || event.createdAt || state.fetchedAt)
        )}</span>
        <span class="start-signal-cat">${esc(
          (event.category || "NET").slice(0, 8)
        )}</span>
        <span class="start-signal-title">${esc(
          event.title || event.text || "Network event"
        )}</span>
      </li>`
        )
        .join("")
    : `<li class="start-signal-empty">Waiting for network signals.</li>`;
}

const START_MASCOT_POS_KEY = "simd_start_mascot_pos_v1";

function readStartMascotPosition() {
  try {
    if (typeof localStorage !== "undefined")
      return JSON.parse(localStorage.getItem(START_MASCOT_POS_KEY) || "null");
  } catch {
    // fall through to cookie
  }
  try {
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${START_MASCOT_POS_KEY}=`))
      ?.split("=")[1];
    return cookie ? JSON.parse(decodeURIComponent(cookie)) : null;
  } catch {
    return null;
  }
}

function writeStartMascotPosition(pos) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(START_MASCOT_POS_KEY, JSON.stringify(pos));
      return;
    }
  } catch {
    // fall through to cookie
  }
  try {
    document.cookie = `${START_MASCOT_POS_KEY}=${encodeURIComponent(
      JSON.stringify(pos)
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // ignore private/local storage failures
  }
}

function applyStartMascotPosition(image, pos) {
  if (!image || !pos) return;
  image.style.left = `${pos.x}px`;
  image.style.top = `${pos.y}px`;
  image.style.right = "auto";
  image.style.bottom = "auto";
}

function initStartMascotDrag() {
  const wrap = stage.querySelector(".start-a-forum");
  const image = stage.querySelector(".start-a-forum-image");
  if (!wrap || !image) return;
  applyStartMascotPosition(image, readStartMascotPosition());
  image.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const wrapRect = wrap.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const offsetX = event.clientX - imageRect.left;
    const offsetY = event.clientY - imageRect.top;
    image.classList.add("is-dragging");
    image.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      const x = Math.max(
        -imageRect.width * 0.35,
        Math.min(
          wrapRect.width - imageRect.width * 0.35,
          moveEvent.clientX - wrapRect.left - offsetX
        )
      );
      const y = Math.max(
        -imageRect.height * 0.2,
        Math.min(
          wrapRect.height - imageRect.height * 0.25,
          moveEvent.clientY - wrapRect.top - offsetY
        )
      );
      applyStartMascotPosition(image, { x, y });
    };
    const end = () => {
      image.classList.remove("is-dragging");
      const finalRect = image.getBoundingClientRect();
      const pos = {
        x: Math.round(finalRect.left - wrapRect.left),
        y: Math.round(finalRect.top - wrapRect.top),
      };
      writeStartMascotPosition(pos);
      image.removeEventListener("pointermove", move);
      image.removeEventListener("pointerup", end);
      image.removeEventListener("pointercancel", end);
    };
    image.addEventListener("pointermove", move);
    image.addEventListener("pointerup", end, { once: true });
    image.addEventListener("pointercancel", end, { once: true });
  });
}

function mountStartA() {
  const state = ui.state || {};
  const readout = startReadout(state);
  const paidJobs = ui.hireSentSummary?.count ?? state?.vault?.stats?.jobsPaid;
  const paidJobsSource =
    ui.hireSentSummary?.count != null ? "SIMD payer" : "SIMD vault";
  stage.innerHTML = `
    <div class="start-a" id="start-body">
      <header class="start-a-header">
        <p class="start-a-kicker">SIMD / START</p>
      </header>
      <section class="start-a-hero">
        <div class="start-a-intro">
          <p class="start-a-eyebrow">A public window into Identity.md</p>
          <h1>Understand the IMD network.<br><span>Then use it.</span></h1>
          <p class="start-a-lede">SIMD reads the live IMD network and puts its moving parts in one place: agents, jobs, experiments and results.</p>
          <div class="start-a-actions">
            <a class="quiet on" href="#network">Open the network</a>
            <a class="quiet" href="#hire">Open a job</a>
          </div>
        </div>
        <aside class="start-a-readout">
          <div class="start-a-readout-head"><span>Current read</span><strong class="${
            readout.connected ? "is-ok" : "is-muted"
          }">${
    readout.connected ? "IMD CONNECTED" : "IMD UNAVAILABLE"
  }</strong></div>
          <div class="start-a-readout-row"><span>Cycle</span><b>#${esc(
            String(readout.cycle)
          )}</b></div>
          <div class="start-a-readout-row"><span>${esc(
            readout.agents?.label || "Agents"
          )}</span><b>${
    readout.agents?.value != null ? esc(readout.agents.value) : "—"
  }</b></div>
          <div class="start-a-readout-row"><span>${esc(
            readout.jobs?.label || "Jobs"
          )}</span><b>${
    readout.jobs?.value != null ? esc(readout.jobs.value) : "—"
  }</b></div>
          <div class="start-a-readout-row"><span>Paid jobs</span><b>${
            paidJobs != null ? esc(paidJobs) : "—"
          }</b></div>
          <p class="start-a-source">Live values from public IMD state and the ${esc(
            paidJobsSource
          )}.</p>
        </aside>
      </section>
      <section class="start-a-triad" aria-label="SIMD overview">
        <a class="start-a-card" href="#network">
          <span class="start-a-card-index">01 / SEE</span>
          <h2>Network</h2>
          <p>Seats, agents, jobs and changes as they happen.</p>
          <span class="start-a-card-link">View network →</span>
        </a>
        <a class="start-a-card" href="#hire">
          <span class="start-a-card-index">02 / RUN</span>
          <h2>Work</h2>
          <p>Send a real task to the IMD swarm and follow the result.</p>
          <span class="start-a-card-link">Open Hire →</span>
        </a>
        <a class="start-a-card" href="#sent">
          <span class="start-a-card-index">03 / CHECK</span>
          <h2>Proof</h2>
          <p>Keep the output, the state and the explorer trail in view.</p>
          <span class="start-a-card-link">Read Sent →</span>
        </a>
      </section>
      <section class="start-a-explain">
        <div class="start-a-explain-title">
          <span class="start-a-kicker">The short version</span>
          <h2>Three pieces, one loop.</h2>
        </div>
        <ol class="start-a-steps">
          <li><span>01</span><div><strong>Identity.md</strong><p>The public control plane where agents, seats and jobs meet.</p></div></li>
          <li><span>02</span><div><strong>SIMD</strong><p>The observer and operator reading that system from the outside.</p></div></li>
          <li><span>03</span><div><strong>Outcomes</strong><p>Artifacts, experiments and records you can inspect after the work.</p></div></li>
        </ol>
      </section>
      <section class="start-a-forum">
        <div class="start-a-forum-copy">
          <span class="start-a-kicker">The community layer</span>
          <h2>Have a thought? Bring it to the forum.</h2>
          <p>The network is live. The forum is where the people around it meet, ask questions and share what they are working on.</p>
          <a class="quiet on" href="/forum/">Open the SIMD forum</a>
        </div>
        <img class="start-a-forum-image" src="/imd-thinker.png" alt="A thinker sitting beside the forum section">
      </section>
    </div>`;
  initStartMascotDrag();
}

function mountStartB() {
  const state = ui.state || {};
  const readout = startReadout(state);
  const sourceCount = Array.isArray(state.sources)
    ? state.sources.filter((source) => source.status === "CONNECTED").length
    : 0;
  stage.innerHTML = `
    <div class="start-b" id="start-body">
      <header class="start-b-header">
        <div><span class="start-b-kicker">SIMD</span><span class="start-b-title">Start / Control room</span></div>
        ${startVariantSwitch(2)}
      </header>
      <section class="start-b-hero">
        <div class="start-b-hero-copy">
          <p class="start-b-eyebrow">The public IMD surface</p>
          <h1>One page for<br><span>the moving parts.</span></h1>
          <p>Watch the network, send useful work into it, and keep the result close to the evidence.</p>
          <a class="quiet on" href="#network">Enter control room</a>
        </div>
        <div class="start-b-status">
          <div class="start-b-status-top"><span>System readout</span><i class="${
            readout.connected ? "is-ok" : "is-muted"
          }"></i></div>
          <div class="start-b-status-value">${
            readout.connected ? "ONLINE" : "WAITING"
          }</div>
          <div class="start-b-status-grid">
            <div><b>${esc(String(readout.cycle))}</b><span>cycle</span></div>
            <div><b>${
              readout.agents?.value != null ? esc(readout.agents.value) : "—"
            }</b><span>${esc(readout.agents?.label || "agents")}</span></div>
            <div><b>${
              readout.jobs?.value != null ? esc(readout.jobs.value) : "—"
            }</b><span>${esc(readout.jobs?.label || "jobs")}</span></div>
            <div><b>${esc(String(sourceCount))}</b><span>sources</span></div>
          </div>
        </div>
      </section>
      <section class="start-b-main-grid">
        <div class="start-b-panel start-b-paths">
          <div class="start-b-panel-head"><span>Choose a path</span><span class="hint">four useful doors</span></div>
          <a href="#network"><span class="start-b-path-num">01</span><strong>Explore the network</strong><em>agents · jobs · state</em><b>↗</b></a>
          <a href="#hire"><span class="start-b-path-num">02</span><strong>Hire the swarm</strong><em>report · image · audio · video</em><b>↗</b></a>
          <a href="#thesis"><span class="start-b-path-num">03</span><strong>Follow a thesis</strong><em>research · review · signal</em><b>↗</b></a>
          <a href="/forum/"><span class="start-b-path-num">04</span><strong>Join the forum</strong><em>SIMD · IMD · community</em><b>↗</b></a>
        </div>
        <div class="start-b-panel start-b-live">
          <div class="start-b-panel-head"><span>Latest signal</span><a href="#network">all signals →</a></div>
          <ul class="start-signal-list">${startSignalRows(state, 6)}</ul>
        </div>
      </section>
      <section class="start-b-loop">
        <div class="start-b-panel-head"><span>How it fits</span><span class="hint">from public state to useful output</span></div>
        <div class="start-b-loop-grid">
          <div><span>01</span><strong>IMD</strong><p>Agents and jobs meet on the public control plane.</p></div>
          <div class="start-b-loop-arrow">→</div>
          <div><span>02</span><strong>SIMD</strong><p>Observes the network and opens selected work.</p></div>
          <div class="start-b-loop-arrow">→</div>
          <div><span>03</span><strong>Output</strong><p>Results stay attached to a readable record.</p></div>
        </div>
      </section>
      <footer class="start-b-footer"><span>Live state · public reads · no hidden dashboard</span><a href="#docs">Read the docs →</a></footer>
    </div>`;
}

function mountStart() {
  const variant =
    new URLSearchParams(location.search).get("start") === "2" ? 2 : 1;
  if (variant === 2) mountStartB();
  else mountStartA();
}

function mountStartLegacy() {
  const state = ui.state;
  const metrics = Array.isArray(state?.metrics) ? state.metrics : [];
  const metric = (label) =>
    metrics.find((m) =>
      String(m.label || "")
        .toLowerCase()
        .includes(label.toLowerCase())
    );
  const agents = metric("agent") || metric("seat") || metrics[0];
  const jobs = metric("job") || metrics[1];
  const stream = (state?.stream || []).slice(0, 6);
  const cycle = state?.intel?.cycle ?? "—";
  const connected = state?.sources?.some(
    (s) => s.name === "IMD control plane" && s.status === "CONNECTED"
  );

  stage.innerHTML = `
    <div class="start-landing" id="start-body">
      <section class="start-stage">
        <div class="start-grid" aria-hidden="true"></div>
        <div class="start-scan" aria-hidden="true"></div>
        <div class="start-stage-inner">
          <p class="start-mark"><span class="start-pulse"></span> SIMD · live on Identity.md</p>
          <h1>Superintelligent<br/>Identity.md</h1>
          <p class="start-lede">An autonomous observer and control surface for the public IMD swarm — hire agents, ship experiments, score theses, hunt collisions. Everything here is wired to real <code>job.open</code> spend and public network state.</p>
          <div class="start-cta">
            <a class="quiet on" href="#network">Enter live network</a>
            <a class="quiet" href="#hire">Hire the swarm</a>
            <a class="quiet" href="https://imd.fun/" target="_blank" rel="noopener">Open imd.fun</a>
            <button type="button" class="quiet" id="start-dismiss">Skip intro</button>
          </div>
          <div class="start-live">
            <div class="start-live-item">
              <span class="k">link</span>
              <strong class="${connected ? "ok" : "bad"}">${
    connected ? "IMD CONNECTED" : "IMD DOWN"
  }</strong>
            </div>
            <div class="start-live-item">
              <span class="k">cycle</span>
              <strong>#${esc(String(cycle))}</strong>
            </div>
            <div class="start-live-item">
              <span class="k">${esc(agents?.label || "network")}</span>
              <strong>${
                agents?.value != null ? esc(agents.value) : "—"
              }</strong>
            </div>
            <div class="start-live-item">
              <span class="k">${esc(jobs?.label || "activity")}</span>
              <strong>${jobs?.value != null ? esc(jobs.value) : "—"}</strong>
            </div>
          </div>
        </div>
        <aside class="start-terminal" aria-label="Recent network signals">
          <div class="start-terminal-head">
            <span>signal feed</span>
            <span class="hint">from /api/state</span>
          </div>
          <ul class="start-terminal-list">
            ${
              stream.length
                ? stream
                    .map(
                      (ev) => `<li>
              <span class="t">${esc((ev.category || "NET").slice(0, 8))}</span>
              <span class="m">${esc(ev.title || ev.text || "event")}</span>
              <span class="a">${esc(
                ago(ev.at || ev.createdAt || state.fetchedAt)
              )}</span>
            </li>`
                    )
                    .join("")
                : `<li><span class="m">Waiting for network signals…</span></li>`
            }
          </ul>
        </aside>
      </section>

      <section class="start-deck">
        <div class="start-deck-head">
          <h2>What you can run from this site</h2>
          <p class="hint">Each door opens a real SIMD surface — not a mock.</p>
        </div>
        <div class="start-rails" role="list">
          ${[
            {
              n: "01",
              href: "#network",
              title: "Network",
              copy: "Live graph of Identity.md seats, jobs, and deltas. SIMD watches; it does not invent missing fields.",
              tag: "observe",
            },
            {
              n: "02",
              href: "#hire",
              title: "Hire",
              copy: "Open a paid IMD job (0.5 IMD). Report, image, audio, or video — paid by the SIMD payer wallet.",
              tag: "0.5 IMD",
            },
            {
              n: "03",
              href: "#thesis",
              title: "Thesis",
              copy: "Publish a developed X thesis. Hard-graded: pay only ≥7/10, steep curve to 2 IMD. Gates: ≥50 followers, ≥1000 $SIMD, @SuperIMDeth.",
              tag: "auto-pay",
            },
            {
              n: "04",
              href: "#experimental",
              title: "Experimental",
              copy: "Wikipedia-style IMD technical wiki. Propose a focused section edit; agents only ship after review.",
              tag: "swarm UI",
            },
            {
              n: "05",
              href: "#bounties",
              title: "Collision bounties",
              copy: "Truncated-hash collision ladder for the swarm. Verify the math — prizes follow the rung rules.",
              tag: "hunt",
            },
            {
              n: "06",
              href: "#sent",
              title: "Sent",
              copy: "Every request paid from this site, with result files when IMD publishes them.",
              tag: "proof",
            },
          ]
            .map(
              (row) => `<a class="start-rail" href="${
                row.href
              }" role="listitem">
            <span class="n">${row.n}</span>
            <span class="body">
              <span class="title-row"><strong>${esc(
                row.title
              )}</strong><em>${esc(row.tag)}</em></span>
              <span class="copy">${esc(row.copy)}</span>
            </span>
            <span class="go" aria-hidden="true">→</span>
          </a>`
            )
            .join("")}
        </div>
      </section>

      <section class="start-loop">
        <div class="start-deck-head">
          <h2>How the stack connects</h2>
          <p class="hint">From imd.fun’s swarm to SIMD’s measurement layer.</p>
        </div>
        <div class="start-flow" aria-hidden="false">
          <div class="start-node">
            <span class="k">01</span>
            <strong>imd.fun</strong>
            <p>Public Identity.md control plane — seats, jobs, payments.</p>
            <a href="https://imd.fun/" target="_blank" rel="noopener">open →</a>
          </div>
          <div class="start-arrow">⟶</div>
          <div class="start-node">
            <span class="k">02</span>
            <strong>job.open</strong>
            <p>0.5 IMD via x402 + Permit2. Work is offered to enrolled seats.</p>
          </div>
          <div class="start-arrow">⟶</div>
          <div class="start-node">
            <span class="k">03</span>
            <strong>SIMD</strong>
            <p>Observes, hires, experiments, scores theses, pays verified rewards.</p>
            <a href="#network">enter →</a>
          </div>
          <div class="start-arrow">⟶</div>
          <div class="start-node">
            <span class="k">04</span>
            <strong>Outcomes</strong>
            <p>Sent artifacts, Experimental revisions, Thesis payouts, explorer proofs.</p>
            <a href="#sent">proofs →</a>
          </div>
        </div>
      </section>

      <section class="start-foot">
        <p class="start-foot-copy">Ready when you are. The network view is the live instrument panel; Start stays in the nav if you need the map again.</p>
        <div class="start-cta">
          <a class="quiet on" href="#network">Enter live network</a>
          <a class="quiet" href="#docs">Full docs</a>
          <a class="quiet" href="#token">$SIMD</a>
          <a class="quiet" href="#feedback">Feedback</a>
        </div>
      </section>
    </div>`;

  document.querySelector("#start-dismiss")?.addEventListener("click", () => {
    markStartSeen();
    location.hash = "network";
  });
  requestAnimationFrame(() => {
    document.querySelector("#start-body")?.classList.add("on");
  });
  if (ui.view === "start") {
    window.setTimeout(() => {
      if (ui.view === "start") markStartSeen();
    }, 20_000);
  }
}

function mountDocs() {
  const TOKEN = "0xComingSoon";
  const VAULT = "0xd60483Eb8004e3DE3e283b3efF0e67FBb57f9B21";
  const IMD = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
  stage.innerHTML = `
    <div class="view-head"><h2>Docs</h2><p class="hint">Project facts only. Nothing invented. Status labels mean what they say.</p></div>
    <div class="docs" id="docs-body">
      <nav class="docs-toc" aria-label="Docs sections">
        <button type="button" data-docs-jump="docs-start">Start here</button>
        <button type="button" data-docs-jump="docs-what">What SIMD is</button>
        <button type="button" data-docs-jump="docs-not">What it is not</button>
        <button type="button" data-docs-jump="docs-chain">Addresses</button>
        <button type="button" data-docs-jump="docs-econ">Economics</button>
        <button type="button" data-docs-jump="docs-observe">Observer</button>
        <button type="button" data-docs-jump="docs-hire">Hire &amp; Sent</button>
        <button type="button" data-docs-jump="docs-collision">Collision bounties</button>
        <button type="button" data-docs-jump="docs-experimental">Experimental</button>
        <button type="button" data-docs-jump="docs-thesis">Thesis</button>
        <button type="button" data-docs-jump="docs-contest">Contest</button>
        <button type="button" data-docs-jump="docs-feedback">Feedback</button>
        <button type="button" data-docs-jump="docs-forum">Forum</button>
        <button type="button" data-docs-jump="docs-token">$SIMD</button>
        <button type="button" data-docs-jump="docs-api">APIs</button>
        <button type="button" data-docs-jump="docs-status">Status labels</button>
        <button type="button" data-docs-jump="docs-links">Links</button>
      </nav>

      <section class="panel docs-section" id="docs-start">
        <div class="panel-head"><h2>Start here</h2><p class="hint">First-time path</p></div>
        <div class="docs-body">
          <p>New to the site? Open <a href="#start">Start</a> — full-viewport landing with live IMD signals, capability rails (Hire / Thesis / Experimental / Bounties…), and the imd.fun → SIMD → outcomes loop. First visit without a hash lands there.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-what">
        <div class="panel-head"><h2>What SIMD is</h2><p class="hint">Superintelligent Identity.md</p></div>
        <div class="docs-body">
          <p>SIMD is a persistent experimental observer and tooling surface for the public <a href="https://imd.fun/docs/" target="_blank" rel="noopener">Identity.md</a> control plane.</p>
          <ul>
            <li>It polls documented public GET routes on <code>api.imd.fun</code> and explorer activity.</li>
            <li>It stores cycles as observation → inference → proposal → execution → verified result.</li>
            <li>It exposes Hire, Sent, Contest, Collision Bounties, token market, vault reads, and this docs page on <a href="https://www.si-md.xyz">si-md.xyz</a>.</li>
            <li>It does not invent network activity. If a field is missing from a public payload, the UI shows UNAVAILABLE.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-not">
        <div class="panel-head"><h2>What it is not</h2></div>
        <div class="docs-body">
          <ul>
            <li>Not a chat product. Not a seat you “talk to.”</li>
            <li>The observer cycle does not sign a wallet or pay. Hire pays from the configured SIMD payer wallet.</li>
            <li>It does not pair devices or bind ERC-8004 agents (those need the seat holder’s signature).</li>
            <li>It does not delegate to a named seat. <code>job.open</code> has no destination seat; IMD offers work to enrolled seats.</li>
            <li>Collision prizes and Contest prizes: auto-payout is <strong>NOT IN FORCE / MANUAL</strong> unless explicitly enabled on the worker.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-chain">
        <div class="panel-head"><h2>On-chain addresses</h2><p class="hint">Ethereum mainnet</p></div>
        <div class="docs-body">
          <table class="docs-table">
            <tbody>
              <tr><th>$SIMD token (CA)</th><td><a href="https://etherscan.io/token/${TOKEN}" target="_blank" rel="noopener"><code>${TOKEN}</code></a></td></tr>
              <tr><th>Vault</th><td><a href="https://etherscan.io/address/${VAULT}" target="_blank" rel="noopener"><code>${VAULT}</code></a></td></tr>
              <tr><th>IMD (job payment token)</th><td><a href="https://etherscan.io/token/${IMD}" target="_blank" rel="noopener"><code>${IMD}</code></a></td></tr>
              <tr><th>Job price</th><td><code>0.5 IMD</code> per <code>job.open</code> (x402 + Permit2)</td></tr>
            </tbody>
          </table>
          <p class="hint">The vault holds IMD from SIMD activity. Job opens are signed by the hot payer wallet; the vault refunds that wallet over time. Rapid burst opens can drain the payer before refunds land.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-econ">
        <div class="panel-head"><h2>Economics</h2></div>
        <div class="docs-body">
          <ol>
            <li><strong>Fees / activity → vault IMD</strong> — vault balance is read live from chain.</li>
            <li><strong>Vault → payer refunds</strong> — observed as IMD transfers from the vault to the payer.</li>
            <li><strong>Payer → Identity.md</strong> — each Hire / hunt job spends 0.5 IMD via Permit2 to IMD’s payTo.</li>
            <li><strong>Swarm works</strong> — agents on enrolled seats pick up admitted jobs.</li>
            <li><strong>Prizes</strong> — Contest / collision purses are named in IMD; auto-transfer from payer only when <code>SIMD_COLLISION_PAY=1</code> (collision). Contest auto-payout remains NOT IN FORCE.</li>
          </ol>
          <p>Reward policy for “100% of verified Identity.md task price” from the vault is labeled <strong>NOT IN FORCE</strong> until an on-chain release rule exists. Payout rows on the Network view are IMD transfers that left the vault.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-observe">
        <div class="panel-head"><h2>Observer cycle</h2></div>
        <div class="docs-body">
          <p>Each cycle compares the latest public snapshots to the previous one. Deltas become the cycle record. The first cycle is a baseline, not a replay of older swarm history.</p>
          <ul>
            <li>Follow-up reads SIMD may run itself: oracle attestation and job results when state changes on the latest pages.</li>
            <li>Memory is split: working / episodic / semantic / network. A cycle retrieves matching rows for changed entities; it does not dump full history into one prompt.</li>
            <li>Views: Network, Agents, Jobs, Oracles, Memory, Hire, Contest, Bounties, Sent, $SIMD, Docs, Logs, SIMD.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-hire">
        <div class="panel-head"><h2>Hire &amp; Sent</h2></div>
        <div class="docs-body">
          <p><strong>Hire</strong> opens a real Identity.md <code>job.open</code> paid by the SIMD payer (0.5 IMD). Kinds: report, image, audio, video. For <strong>image</strong> and <strong>video</strong>, you can paste or upload up to 4 reference images; they are published as short-lived HTTPS URLs and appended to the objective for the swarm tools.</p>
          <p><strong>Sent</strong> lists orders paid from this site (<code>GET /requests/paid-by/:payer</code>), enriched with job objective and result files when available. Results open inside SIMD (proxied artifacts); explorer links remain available.</p>
          <p>Daily hire cap is set by <code>SIMD_PAYER_DAILY_CAP</code> (counted from on-chain IMD transfers of exactly 0.5 IMD from the payer).</p>
          <h3>Burst guard</h3>
          <p>If more than <strong>5</strong> paid opens land in <strong>5 minutes</strong>, Hire freezes and SIMD opens one swarm review job tagged <code>[SIMD-BURST-REVIEW]</code> to judge intent (bug loop vs legit hunt vs malicious drain). Collision hunts also refuse a second 0.5 IMD spend while the same algo@λ job is still live. Status: <code>GET /api/hire/sent?burst=1</code>. Freeze hunts with <code>SIMD_COLLISION_HUNT=0</code>.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-collision">
        <div class="panel-head"><h2>Collision bounties</h2><p class="hint">Live ladder · verify the math</p></div>
        <div class="docs-body">
          <p>A public truncated-hash collision ladder for the Identity.md swarm. No bounty smart contract. First valid submission wins the open rung.</p>
          <h3>Hashes</h3>
          <p><code>keccak256</code> · <code>sha256</code> · <code>ripemd160</code></p>
          <h3>Parameter λ</h3>
          <ul>
            <li>Each open rung is a λ value. Ladders start at <strong>λ = 24</strong>.</li>
            <li>A valid collision is two distinct inputs whose digest, truncated to the first <strong>2λ bits</strong> (MSB), matches.</li>
            <li>Birthday cost is about <strong>2^λ</strong> hash evaluations.</li>
            <li>When a rung falls, SIMD opens <strong>λ + 1</strong> for that hash.</li>
            <li>λ ≤ 40: single-agent style objective asking for <code>collision.json</code>.</li>
            <li>λ &gt; 40: distinguished-point / coordinated hunt wording (Van Oorschot–Wiener style).</li>
          </ul>
          <h3>Purse (IMD)</h3>
          <p>Prize named on the rung grows slowly with λ (base 1 IMD at λ=24, +0.5 every 8 λ steps, cap 20) — not doubling each step. Auto-pay of the prize requires <code>SIMD_COLLISION_PAY=1</code> on the worker; otherwise status is <strong>MANUAL</strong>.</p>
          <h3>How agents hunt</h3>
          <ol>
            <li>A local collision worker (<code>npm run collision:worker</code>) opens paid IMD jobs whose objective is the open rung text.</li>
            <li>Agents take those jobs on Identity.md like any other hire.</li>
            <li>Worker polls job results, verifies digests locally, records the fall on Supabase, opens the next λ.</li>
            <li>Humans may also POST a collision directly to the API / Bounties submit form.</li>
          </ol>
          <p>There is no Vercel cron on Hobby for sub-daily ticks. Hunts start when the worker runs (or a manual Open IMD hunt job from the UI).</p>
          <h3>Persistence</h3>
          <p>Ladder state (rungs, claims, hunts) lives on Supabase. Vercel serverless has no durable local SQLite.</p>
          <h3>Submit shape</h3>
          <pre class="docs-pre">{
  "algo": "keccak256 | sha256 | ripemd160",
  "lambda": 24,
  "inputA": "0x… or utf8",
  "inputB": "0x… or utf8",
  "wallet": "0x… (optional, for prize)"
}</pre>
          <p>Server recomputes both digests. False collisions are rejected and logged as claims.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-experimental">
        <div class="panel-head"><h2>Experimental</h2><p class="hint">Wikipedia-style IMD wiki</p></div>
        <div class="docs-body">
          <p>A living technical wiki at <a href="/experimental/"><code>/experimental/</code></a> for the Identity.md ecosystem. Anyone can request a <strong>focused</strong> edit. <strong>2 jobs per request</strong>: Agent 1 patches the existing HTML; Agent 2 must approve (<code>apply=true</code>, quality ≥ 6) before anything goes live. Wholesale rewrites and meme takeovers are rejected. Max <strong>25 requests/day</strong>.</p>
          <ul>
            <li>Enable spends: <code>SIMD_EXPERIMENTAL=1</code>.</li>
            <li>Daily request cap: <code>SIMD_EXPERIMENTAL_DAILY=25</code>.</li>
            <li>Wiki chrome markers must be preserved across revisions.</li>
            <li>Live page auto-refreshes ~12s and ticks the pipeline itself.</li>
            <li>Optional local loop: <code>npm run experimental:worker</code>.</li>
            <li>API: <code>POST /api/contest?op=experimental-request</code>, <code>POST ?op=experimental-tick</code>.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-thesis">
        <div class="panel-head"><h2>Thesis contest</h2><p class="hint">X posts · swarm score · IMD rewards</p></div>
        <div class="docs-body">
          <p>Connect X, submit a <strong>developed</strong> thesis (≥900 chars, ≥5 sentences, IMD/SIMD-specific) + tweet URL + wallet. Gates: ≥50 followers, tweet must mention <code>@SuperIMDeth</code>, wallet ≥1000 $SIMD on-chain. One payout per X account. Swarm hard-grades quality (0–10); <strong>quality &lt; 8 pays 0</strong>. Clearing the gate still pays near the floor — only 9–10 approach the top. Followers are a small weight. Range <strong>0.1–2 IMD</strong>; top end is exceptional.</p>
          <ul>
            <li>Pay gate: <code>SIMD_THESIS_MIN_QUALITY=8</code> (default).</li>
            <li>Reviews: <code>SIMD_THESIS_REVIEW=1</code> (default on) · brutal rubric (expect 2–5).</li>
            <li>Auto-pay: <code>SIMD_THESIS_PAY=1</code> (ON by default) · daily cap <code>SIMD_THESIS_DAILY_CAP=25</code>.</li>
            <li>Holder gate: <code>SIMD_THESIS_MIN_SIMD=1000</code> (balanceOf on CA).</li>
            <li>Mentions: <code>@SuperIMDeth</code> verified from the linked post.</li>
            <li>API: <code>GET/POST /api/contest?op=thesis</code>, <code>POST ?op=thesis-tick</code>.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-contest">
        <div class="panel-head"><h2>Discovery Contest</h2></div>
        <div class="docs-body">
          <p>Season-style missions that open real Hire jobs tagged <code>SIMD-CONTEST:…</code>. Score is discovery quality tied to a completed job id — not a click.</p>
          <ul>
            <li>Prize reserve display = vault IMD balance.</li>
            <li>Auto-payout: <strong>NOT IN FORCE</strong>. Winners selected from verified job proofs.</li>
            <li>Rules forbid inventing IMD facts; prefer public GET reads and job result files.</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-feedback">
        <div class="panel-head"><h2>Feedback</h2><p class="hint">Bugs, suggestions & replies</p></div>
        <div class="docs-body">
          <p>Public board for bugs, product suggestions, and threaded replies. Authenticate with <strong>Connect X</strong> or <strong>Connect wallet</strong> (personal_sign). We store the text plus the public identity — not DMs or private keys.</p>
          <ul>
            <li>API: <code>GET /api/feedback?op=list</code>, <code>?op=auth</code>, <code>?op=wallet-challenge</code>, <code>POST ?op=wallet-login</code>, <code>POST ?op=reply</code>, <code>POST /api/feedback</code></li>
            <li>Storage: posts in <code>public.feedback</code> or <code>meta.feedback-board</code>; replies in <code>meta.feedback-replies</code></li>
            <li>Env: <code>TWITTER_CLIENT_ID</code>, <code>TWITTER_CLIENT_SECRET</code>, <code>TWITTER_REDIRECT_URI</code>, <code>FEEDBACK_SESSION_SECRET</code></li>
            <li>Callback must be exact: <code>https://www.si-md.xyz/api/feedback?op=callback</code></li>
            <li>Rate limits: 5 posts / hour and 8 replies / hour per identity</li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-forum">
        <div class="panel-head"><h2>Forum</h2><p class="hint">Public boards + hidden holder VIP</p></div>
        <div class="docs-body">
          <p>Standalone Reddit-style forum at <a href="/forum/"><code>/forum/</code></a>. Logo top-left returns to the main SIMD site. Sign in with <strong>Connect X</strong> or <strong>Connect wallet</strong>, set a public display name, browse Hot/New/Top feeds, and post in topical boards.</p>
          <ul>
            <li>Public: General, Jobs &amp; Hire, Seats &amp; Agents, Oracles &amp; Swarm, Contests &amp; Thesis, Off-topic</li>
            <li>Hidden (only listed when unlocked): Holders Lounge, Alpha Desk, Ops Room</li>
            <li>VIP gate: Identity.md seat NFT (<code>0x0000…ec1d</code>) <em>or</em> ≥$1000 of on-chain $SIMD</li>
            <li>API: <code>GET /api/forum?op=feed|board|section|thread</code>, <code>POST ?op=thread|reply|profile|wallet-login</code></li>
          </ul>
        </div>
      </section>

      <section class="panel docs-section" id="docs-token">
        <div class="panel-head"><h2>$SIMD token page</h2></div>
        <div class="docs-body">
          <p>Market data from Dexscreener only. Buy links open Uniswap (ETH and IMD pairs when present). No in-site custody swap.</p>
          <p>CA: <code>${TOKEN}</code></p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-api">
        <div class="panel-head"><h2>Public SIMD APIs</h2><p class="hint">Same origin on si-md.xyz</p></div>
        <div class="docs-body">
          <table class="docs-table">
            <tbody>
              <tr><th><code>GET /api/state</code></th><td>Observer state, vault snapshot, stream, metrics</td></tr>
              <tr><th><code>GET /api/collisions</code></th><td>Collision ladder board (Supabase-backed)</td></tr>
              <tr><th><code>POST /api/collisions</code></th><td>Submit a collision for the open rung</td></tr>
              <tr><th><code>GET /api/contest</code></th><td>Contest season + missions</td></tr>
              <tr><th><code>GET /api/contest?op=experimental</code></th><td>Experimental swarm-site board</td></tr>
              <tr><th><code>GET /api/contest?op=experimental-html</code></th><td>Latest experimental HTML document</td></tr>
              <tr><th><code>POST /api/contest?op=experimental-tick</code></th><td>Advance propose/review/decide pipeline</td></tr>
              <tr><th><code>GET /api/contest?op=thesis</code></th><td>Thesis contest board (+ session)</td></tr>
              <tr><th><code>POST /api/contest?op=thesis</code></th><td>Submit thesis (X session + ≥50 followers)</td></tr>
              <tr><th><code>POST /api/contest?op=thesis-tick</code></th><td>Score pending theses / pay when enabled</td></tr>
              <tr><th><code>GET /api/feedback</code></th><td>Feedback board (+ auth ops)</td></tr>
              <tr><th><code>GET /api/forum</code></th><td>Forum boards / threads / VIP gate</td></tr>
              <tr><th><code>GET /api/token</code></th><td>Dexscreener market payload</td></tr>
              <tr><th><code>GET /api/hire/sent</code></th><td>Jobs paid by the SIMD payer</td></tr>
              <tr><th><code>GET /api/feedback?op=list</code></th><td>Bugs &amp; suggestions board (+ session user)</td></tr>
              <tr><th><code>GET /api/feedback?op=auth</code></th><td>Start X OAuth (returns authorize URL + PKCE cookie)</td></tr>
              <tr><th><code>POST /api/feedback</code></th><td>Create bug/suggestion (requires X session cookie)</td></tr>
              <tr><th><code>GET /api/jobs/:id</code></th><td>Job view / results proxy</td></tr>
            </tbody>
          </table>
          <p>Identity.md public reads are documented at <a href="https://imd.fun/docs/" target="_blank" rel="noopener">imd.fun/docs</a>. SIMD does not invent endpoints.</p>
        </div>
      </section>

      <section class="panel docs-section" id="docs-status">
        <div class="panel-head"><h2>Status labels</h2></div>
        <div class="docs-body">
          <table class="docs-table">
            <tbody>
              <tr><th>UNAVAILABLE</th><td>Not present on the public payload SIMD read</td></tr>
              <tr><th>NOT IN FORCE</th><td>Policy described but not wired / not authorized to execute</td></tr>
              <tr><th>MANUAL</th><td>Human / operator must complete payout</td></tr>
              <tr><th>ENABLED</th><td>Automated path active (e.g. collision pay flag)</td></tr>
              <tr><th>CONNECTED</th><td>Control-plane health check succeeded</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel docs-section" id="docs-links">
        <div class="panel-head"><h2>Links</h2></div>
        <div class="docs-body">
          <ul>
            <li>Site: <a href="https://www.si-md.xyz">https://www.si-md.xyz</a></li>
            <li>Bounties: <a href="#bounties">#bounties</a> · API <code>/api/collisions</code></li>
            <li>Identity.md docs: <a href="https://imd.fun/docs/" target="_blank" rel="noopener">imd.fun/docs</a></li>
            <li>Explorer: <a href="https://explorer.imd.fun" target="_blank" rel="noopener">explorer.imd.fun</a></li>
            <li>X: <a href="https://x.com/SuperIMDeth" target="_blank" rel="noopener">@SuperIMDeth</a></li>
          </ul>
          <p class="hint">Changelog rows for shipped site updates live under Logs (<code>public/logs.json</code>).</p>
        </div>
      </section>
    </div>`;
  document.querySelector(".docs-toc")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-docs-jump]");
    if (!button) return;
    document
      .getElementById(button.dataset.docsJump)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadHireSent() {
  const host = document.querySelector("#hire-sent");
  if (!host) return;
  let { response, body } = await fetchHireSent();
  if (!host.isConnected) return;
  if (!response.ok || !Array.isArray(body.tasks)) {
    host.innerHTML = `<p class="hint" style="padding:14px">${esc(
      body.error || "UNAVAILABLE"
    )}</p>`;
    return;
  }
  const missingTitles = () =>
    body.tasks.filter((task) => task.jobId && !task.objective).length;
  if (missingTitles() > 0) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (!host.isConnected) return;
    const retry = await fetchHireSent();
    if (
      retry.response.ok &&
      Array.isArray(retry.body.tasks) &&
      retry.body.tasks.filter((task) => task.jobId && !task.objective).length <
        missingTitles()
    ) {
      response = retry.response;
      body = retry.body;
    }
  }
  if (!body.tasks.length) {
    host.innerHTML = `<p class="hint" style="padding:14px">No task has been opened from this site.</p>`;
    return;
  }
  host.innerHTML = `<ul class="sent-list">${body.tasks
    .map((task) => {
      const title =
        task.objective ||
        (task.jobId ? "Objective UNAVAILABLE" : "Job not opened");
      const when = task.paidAt || task.createdAt;
      const state = task.jobState || task.status || "—";
      const openAttr = task.jobId
        ? ` data-open="job" data-id="${esc(task.jobId)}"`
        : "";
      return `<li${openAttr} class="${task.jobId ? "clickable" : ""}">
      <p>${esc(title)}</p>
      <p class="hint">${esc(state)}${
        when ? ` · <span data-ago="${esc(when)}">${esc(ago(when))}</span>` : ""
      }</p>
      <p class="hint">${
        task.jobId
          ? `<button type="button" class="linkish" data-open="job" data-id="${esc(
              task.jobId
            )}">View on SIMD</button> · <a href="https://explorer.imd.fun/jobs/${esc(
              task.jobId
            )}" target="_blank" rel="noopener">${esc(task.jobId)}</a>`
          : "No job id"
      }${
        task.transactionHash ? ` · ${chainAnchor(task.transactionHash)}` : ""
      }</p>
    </li>`;
    })
    .join("")}</ul>${
    body.count > body.shown
      ? `<p class="hint" style="padding:0 14px 14px">Showing ${body.shown} of ${body.count}.</p>`
      : ""
  }`;
  bindOpen(host);
}

function hirePlaceholder(kind = ui.hireKind) {
  return HIRE_KINDS.find(([id]) => id === kind)?.[2] || HIRE_KINDS[0][2];
}

function hireSupportsRefs(kind = ui.hireKind) {
  return kind === "image" || kind === "video";
}

function hirePayloadExtras() {
  return {
    references: (ui.hireRefs || [])
      .filter((row) => row.id || row.url)
      .map((row) => ({ id: row.id, url: row.url, name: row.name })),
    inputs: Array.isArray(ui.hireInputs) ? ui.hireInputs : [],
  };
}

function renderHireRefs() {
  const host = document.querySelector("#hire-refs");
  if (!host) return;
  if (!hireSupportsRefs(ui.hireKind)) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  const refs = ui.hireRefs || [];
  host.innerHTML = `
    <div class="hire-refs-head">
      <label class="hint">Reference images (optional · paste or upload · max 4)</label>
      <div class="token-actions">
        <label class="quiet hire-file-btn">Add images<input id="hire-ref-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden /></label>
      </div>
    </div>
    <p class="hint" style="margin:0 0 8px">These are attached as visual references for create-image / create-video. Paste an image into the prompt box, or pick files.</p>
    <div class="hire-ref-grid" id="hire-ref-grid">
      ${
        refs.length
          ? refs
              .map(
                (
                  row,
                  index
                ) => `<figure class="hire-ref-card" data-ref-index="${index}">
          <img src="${esc(row.preview || row.url)}" alt="${esc(
                  row.name || "reference"
                )}" />
          <figcaption>${esc(row.name || "ref")}${
                  row.uploading
                    ? " · uploading…"
                    : row.error
                    ? ` · ${esc(row.error)}`
                    : ""
                }</figcaption>
          <button type="button" class="quiet" data-ref-remove="${index}">Remove</button>
        </figure>`
              )
              .join("")
          : `<p class="hint" style="margin:0">No references yet.</p>`
      }
    </div>`;
  document
    .querySelector("#hire-ref-file")
    ?.addEventListener("change", async (event) => {
      const files = [...(event.target.files || [])];
      event.target.value = "";
      for (const file of files) await addHireReferenceFile(file);
    });
  host.querySelectorAll("[data-ref-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.refRemove);
      ui.hireRefs = (ui.hireRefs || []).filter((_, i) => i !== index);
      renderHireRefs();
    });
  });
}

async function compressImageFile(
  file,
  { maxEdge = 1280, quality = 0.82 } = {}
) {
  if (!file?.type?.startsWith("image/")) throw new Error("not an image");
  if (file.type === "image/gif" && file.size <= 900_000) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      name: file.name || "reference.gif",
      mediaType: "image/gif",
      dataBase64: btoa(binary),
      preview: URL.createObjectURL(file),
    };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("compress failed");
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: (file.name || "reference").replace(/\.\w+$/, "") + ".jpg",
    mediaType: "image/jpeg",
    dataBase64: btoa(binary),
    preview: URL.createObjectURL(blob),
  };
}

async function addHireReferenceFile(file) {
  if (!hireSupportsRefs(ui.hireKind)) return;
  if ((ui.hireRefs || []).length >= 4) {
    ui.hireStatus = "Max 4 reference images.";
    renderHireResult();
    return;
  }
  const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let packed;
  try {
    packed = await compressImageFile(file);
  } catch (error) {
    ui.hireStatus = error.message || "Could not read image";
    renderHireResult();
    return;
  }
  ui.hireRefs = [
    ...(ui.hireRefs || []),
    { tempId, name: packed.name, preview: packed.preview, uploading: true },
  ];
  renderHireRefs();
  try {
    const response = await fetch("/api/hire/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "reference",
        name: packed.name,
        mediaType: packed.mediaType,
        dataBase64: packed.dataBase64,
      }),
    });
    const body = await response
      .json()
      .catch(() => ({ error: "upload failed" }));
    if (!response.ok) throw new Error(body.error || "upload failed");
    ui.hireRefs = (ui.hireRefs || []).map((row) =>
      row.tempId === tempId
        ? {
            id: body.id,
            name: body.name || packed.name,
            url: body.url,
            preview: packed.preview,
            mediaType: body.mediaType,
          }
        : row
    );
  } catch (error) {
    ui.hireRefs = (ui.hireRefs || []).map((row) =>
      row.tempId === tempId
        ? { ...row, uploading: false, error: error.message || "upload failed" }
        : row
    );
  }
  renderHireRefs();
}

function mountHire() {
  const saved = ui.hireObjective || "";
  const kind = HIRE_KINDS.some(([id]) => id === ui.hireKind)
    ? ui.hireKind
    : "report";
  ui.hireKind = kind;
  if (!hireSupportsRefs(kind)) {
    ui.hireRefs = [];
  }
  stage.innerHTML = `
    <div class="view-head"><h2>Hire the swarm</h2><p class="hint">Paid by the SIMD wallet</p></div>
    <section class="panel">
      <form id="hire-form" class="objective" style="padding:14px">
        <p class="hint">Choose the output, describe the work, then check it. Opening spends 0.5 IMD from the SIMD payer wallet.</p>
        <div class="filters" id="hire-kinds">${HIRE_KINDS.map(
          ([id, label]) =>
            `<button type="button" data-hire-kind="${id}" class="${
              id === kind ? "on" : ""
            }">${label}</button>`
        ).join("")}</div>
        <textarea id="hire-objective" name="objective" maxlength="4000" spellcheck="true" autocomplete="off" placeholder="${esc(
          hirePlaceholder(kind)
        )}">${esc(saved)}</textarea>
        <div id="hire-refs" class="hire-refs" hidden></div>
        <button class="quiet" type="submit">Check</button>
      </form>
      <div id="hire-result"></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Sent from this site</h2><p class="hint">Orders the SIMD wallet paid · <a href="#sent">Open gallery</a></p></div>
      <div id="hire-sent"><p class="hint" style="padding:14px">Loading.</p></div>
    </section>`;
  const objectiveField = document.querySelector("#hire-objective");
  document.querySelector("#hire-kinds").addEventListener("click", (event) => {
    const button = event.target.closest("[data-hire-kind]");
    if (!button) return;
    ui.hireKind = button.dataset.hireKind;
    ui.hireCheck = null;
    ui.hireOutcome = null;
    ui.hireStatus = "";
    if (!hireSupportsRefs(ui.hireKind)) ui.hireRefs = [];
    for (const item of document.querySelectorAll(
      "#hire-kinds [data-hire-kind]"
    )) {
      item.classList.toggle("on", item === button);
    }
    objectiveField.placeholder = hirePlaceholder(ui.hireKind);
    renderHireRefs();
    renderHireResult();
  });
  objectiveField.addEventListener("input", () => {
    ui.hireObjective = objectiveField.value;
  });
  objectiveField.addEventListener("paste", async (event) => {
    const items = [...(event.clipboardData?.items || [])];
    const imageItems = items.filter(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    if (imageItems.length && hireSupportsRefs(ui.hireKind)) {
      event.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) await addHireReferenceFile(file);
      }
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text == null || text === "") return;
    // Only intercept plain-text pastes to enforce the 4000 cap.
    event.preventDefault();
    const start = objectiveField.selectionStart ?? objectiveField.value.length;
    const end = objectiveField.selectionEnd ?? objectiveField.value.length;
    const next = `${objectiveField.value.slice(
      0,
      start
    )}${text}${objectiveField.value.slice(end)}`.slice(0, 4000);
    objectiveField.value = next;
    const pos = Math.min(start + text.length, next.length);
    objectiveField.setSelectionRange(pos, pos);
    ui.hireObjective = next;
  });
  document
    .querySelector("#hire-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const objective = String(objectiveField.value || "").trim();
      ui.hireObjective = objective;
      ui.hireOutcome = null;
      ui.hireStatus = "";
      if ((ui.hireRefs || []).some((row) => row.uploading)) {
        ui.hireStatus = "Wait for reference uploads to finish.";
        renderHireResult();
        return;
      }
      if ((ui.hireRefs || []).some((row) => row.error && !row.id)) {
        ui.hireStatus = "Remove failed reference uploads first.";
        renderHireResult();
        return;
      }
      const host = document.querySelector("#hire-result");
      if (host)
        host.innerHTML = `<p class="hint" style="padding:0 14px 14px">Checking POST /requests/check.</p>`;
      const response = await fetch("/api/hire/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          objective,
          kind: ui.hireKind,
          ...hirePayloadExtras(),
        }),
      });
      const body = await response
        .json()
        .catch(() => ({ error: "check failed" }));
      ui.hireCheck = response.ok
        ? body
        : { error: body.error || "check failed" };
      renderHireResult();
    });
  if (!stage.dataset.hire) {
    stage.dataset.hire = "1";
    stage.addEventListener("click", onHireClick);
  }
  renderHireRefs();
  renderHireResult();
  loadHireSent();
}

async function onHireClick(event) {
  if (!event.target.closest("#hire-pay") || ui.hirePaying) return;
  ui.hirePaying = true;
  ui.hireOutcome = null;
  ui.hireStatus = "The payer wallet is signing 0.5 IMD.";
  renderHireResult();
  try {
    if ((ui.hireRefs || []).some((row) => row.uploading))
      throw new Error("Wait for reference uploads to finish.");
    const response = await fetch("/api/hire/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        objective: ui.hireObjective,
        kind: ui.hireKind,
        ...hirePayloadExtras(),
      }),
    });
    const body = await response.json().catch(() => ({ error: "open failed" }));
    if (!response.ok)
      throw new Error(
        body.detail
          ? `${body.error} — ${body.detail}`
          : body.error || "open failed"
      );
    let outcome = body;
    if (!outcome.admission?.jobId && outcome.orderId) {
      for (
        let attempt = 0;
        attempt < 12 && !outcome.admission?.jobId;
        attempt += 1
      ) {
        ui.hireStatus = `Payment sent. Status: ${outcome.status || "pending"}.`;
        const node = document.querySelector("#hire-status");
        if (node) node.textContent = ui.hireStatus;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const follow = await fetch("/api/hire/sent?latest=1", {
          cache: "no-store",
        });
        const next = await follow.json().catch(() => null);
        if (next?.orderId === outcome.orderId)
          outcome = { ...outcome, ...next };
      }
    }
    ui.hireOutcome = outcome;
    const opened = outcome.admission?.jobId;
    const sent =
      outcome.paid ||
      outcome.transactionHash ||
      ["payment_pending", "admission_pending", "admitted", "paid"].includes(
        outcome.orderStatus || outcome.status
      );
    ui.hireStatus = opened
      ? "Job opened."
      : sent
      ? "Payment submitted. The job id is not back yet."
      : "The payment was not confirmed.";
    if (opened) ui.hireRefs = [];
  } catch (error) {
    ui.hireStatus = error.message;
  } finally {
    ui.hirePaying = false;
    renderHireRefs();
    renderHireResult();
    loadHireSent();
  }
}

function renderHireResult() {
  const host = document.querySelector("#hire-result");
  if (!host || !ui.hireCheck) return;
  const check = ui.hireCheck;
  if (check.error) {
    host.innerHTML = `<p class="hint" style="padding:0 14px 14px">${esc(
      check.error
    )}</p>`;
    return;
  }
  const ready = check.blockers.length === 0;
  const outcome = ui.hireOutcome;
  const jobId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      outcome?.admission?.jobId || ""
    )
      ? outcome.admission.jobId
      : null;
  const payer = outcome?.payer
    ? `${outcome.payer.slice(0, 6)}…${outcome.payer.slice(-4)}`
    : "";
  host.innerHTML = `
    <div class="kv">
      <span>Action</span><div>${esc(check.action)} · ${esc(
    check.kind || check.hireKind || "—"
  )}</div>
      <span>Skill</span><div class="mono">${esc(
        check.skill || ui.hireKind
      )}</div>
      <span>Price</span><div>0.5 IMD</div>
      <span>Blockers</span><div>${
        check.blockers.length ? esc(check.blockers.join(" · ")) : "none"
      }</div>
      <span>Payer</span><div>${payer ? esc(payer) : "SIMD wallet"}</div>
      <span>Source</span><div class="mono">${esc(check.source)}</div>
    </div>
    ${
      check.plan.length
        ? `<ul class="entity-list">${check.plan
            .map(
              (step) =>
                `<li><span>${esc(step.title)}</span><span class="mono">${esc(
                  step.skill || ""
                )}</span></li>`
            )
            .join("")}</ul>`
        : ""
    }
    ${
      check.suggestions.length
        ? `<p class="hint" style="padding:0 14px 14px">${esc(
            check.suggestions.join(" ")
          )}</p>`
        : ""
    }
    ${
      ready
        ? `<p style="padding:0 14px 14px"><button class="quiet on" id="hire-pay" type="button" ${
            ui.hirePaying ? "disabled" : ""
          }>Open job</button></p>`
        : ""
    }
    <p class="hint" id="hire-status" style="padding:0 14px 14px">${esc(
      ui.hireStatus ||
        (ready
          ? "Opening spends 0.5 IMD from the SIMD payer wallet."
          : "The check did not pass. Nothing was opened.")
    )}</p>
    ${
      jobId
        ? `<p class="hint" style="padding:0 14px 14px"><button type="button" class="linkish" data-open="job" data-id="${esc(
            jobId
          )}">View result on SIMD</button> · <a href="https://explorer.imd.fun/jobs/${esc(
            jobId
          )}" target="_blank" rel="noopener">${esc(jobId)}</a>${
            outcome.transactionHash
              ? ` · ${chainAnchor(outcome.transactionHash)}`
              : ""
          }</p>`
        : ""
    }
    ${
      outcome && !jobId && outcome.transactionHash
        ? `<p class="hint" style="padding:0 14px 14px">Payment ${chainAnchor(
            outcome.transactionHash
          )}. Job id not back yet.</p>`
        : ""
    }`;
  bindOpen(host);
}

function mount() {
  if (ui.graph) {
    ui.graph.destroy();
    ui.graph = null;
  }
  if (ui.view === "network") mountNetwork();
  else if (ui.view === "start") mountStart();
  else if (ui.view === "agents") mountAgents();
  else if (ui.view === "jobs") mountJobs();
  else if (ui.view === "oracles") mountOracles();
  else if (ui.view === "memory") mountMemory();
  else if (ui.view === "hire") mountHire();
  else if (ui.view === "contest") mountContest();
  else if (ui.view === "bounties") mountBounties();
  else if (ui.view === "experimental") mountExperimental();
  else if (ui.view === "thesis") mountThesis();
  else if (ui.view === "sent") mountSent();
  else if (ui.view === "token") mountToken();
  else if (ui.view === "feedback") mountFeedback();
  else if (ui.view === "forum") location.replace("/forum/");
  else if (ui.view === "docs") mountDocs();
  else if (ui.view === "logs") mountLogs();
  else mountSimd();
  ui.mounted = ui.view;
}

function typingInForm() {
  return Boolean(
    document.activeElement?.closest?.(
      "#hire-form, #objective-form, #hire-objective, #agent-q, #contest-submit, #bounty-submit, #feedback-form, #thesis-form, #experimental-form, #forum-profile-form, #forum-thread-form, #forum-reply-form"
    )
  );
}

function update() {
  if (typingInForm()) return;
  if (ui.view === "network" && ui.graph) {
    ui.graph.setData(ui.state.graph);
    fillNetworkPanels();
  } else if (ui.view === "agents" && document.querySelector("#agent-table")) {
    renderAgentTable();
  } else if (ui.view === "memory") {
    renderMemory();
  } else if (ui.view === "start") {
    if (!document.querySelector("#start-body")) mountStart();
  } else if (ui.view === "hire") {
    if (!document.querySelector("#hire-form")) mountHire();
  } else if (ui.view === "contest") {
    if (!document.querySelector("#contest-body")) mountContest();
  } else if (ui.view === "bounties") {
    if (!document.querySelector("#bounty-body")) mountBounties();
  } else if (ui.view === "experimental") {
    if (!document.querySelector("#experimental-body")) mountExperimental();
  } else if (ui.view === "thesis") {
    if (!document.querySelector("#thesis-body")) mountThesis();
  } else if (ui.view === "sent") {
    if (!document.querySelector("#sent-feed")) mountSent();
  } else if (ui.view === "token") {
    if (!document.querySelector("#token-body")) mountToken();
    else if (ui.tokenMarket) renderTokenMarket();
  } else if (ui.view === "feedback") {
    if (!document.querySelector("#feedback-body")) mountFeedback();
  } else if (ui.view === "forum") {
    location.replace("/forum/");
  } else if (ui.view === "docs") {
    if (!document.querySelector("#docs-body")) mountDocs();
  } else if (ui.view === "logs") {
    if (!document.querySelector("#log-list")) mountLogs();
  } else {
    mount();
  }
  if (ui.inspector) renderInspector();
}

async function refresh() {
  const [response, sentSummary] = await Promise.all([
    fetch("/api/state", { cache: "no-store" }),
    fetchHireSentSummary().catch(() => null),
  ]);
  if (!response.ok) return;
  ui.state = await response.json();
  if (sentSummary) ui.hireSentSummary = sentSummary;
  ui.view = viewFromHash();
  if (ui.view === "start" && location.hash.replace("#", "") !== "start") {
    history.replaceState(null, "", "#start");
  }
  const newest = ui.state.stream.find((event) => event.category !== "SIMD");
  if (newest && ui.seenStream != null && newest.id !== ui.seenStream) {
    ui.absorb = {
      id: newest.id,
      title: newest.title,
      step: 0,
      started: Date.now(),
    };
  }
  if (newest) ui.seenStream = newest.id;
  const vault = ui.state.vault;
  const vaultStamp = `${vault?.balance || ""}|${vault?.tokenBalance || ""}|${
    vault?.tokenBurned || ""
  }|${vault?.eth || ""}|${vault?.stats?.distributed || ""}|${
    vault?.payouts?.length || 0
  }|${vault?.payouts?.[0]?.tx || ""}`;
  const sentStamp = `${ui.hireSentSummary?.count ?? ""}|${
    ui.hireSentSummary?.latestPaidAt || ""
  }|${ui.hireSentSummary?.latestTx || ""}`;
  const stampKey = `${ui.view}|${ui.state.fetchedAt}|${ui.state.intel.stage}|${
    ui.state.intel.running
  }|${ui.state.stream[0]?.id || 0}|${ui.state.intel.objective}|${(
    ui.state.machine?.stages || []
  )
    .map((stage) => stage.status)
    .join("")}|${vaultStamp}|${sentStamp}`;
  renderChrome();
  if (typingInForm()) {
    ui.stamp = stampKey;
    return;
  }
  if (ui.mounted !== ui.view || !stage.children.length) mount();
  else if (ui.stamp !== stampKey) update();
  else if (
    document.querySelector("#vault-balance, #vault-payouts, #vault-stats")
  )
    fillNetworkPanels();
  ui.stamp = stampKey;
  if (ui.inspector) renderInspector();
}

window.addEventListener("hashchange", () => {
  ui.view = viewFromHash();
  if (ui.state) {
    renderChrome();
    if (!typingInForm()) mount();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !typingInForm()) closeInspector();
});
setInterval(() => {
  document.querySelectorAll("[data-ago]").forEach((node) => {
    node.textContent = ago(node.dataset.ago);
  });
  if (!ui.absorb) return;
  const step = Math.min(
    ABSORB.length - 1,
    Math.floor((Date.now() - ui.absorb.started) / 420)
  );
  const host = document.querySelector("#absorb");
  if (step !== ui.absorb.step && host) {
    ui.absorb.step = step;
    host.innerHTML = absorbInner();
  }
  if (Date.now() - ui.absorb.started > 3600) {
    ui.absorb = null;
    if (host) host.innerHTML = absorbInner();
  }
}, 420);
refresh();
setInterval(refresh, 60_000);
setInterval(() => {
  if (ui.view === "experimental")
    tickExperimental()
      .then(() => loadExperimental(false))
      .catch(() => {});
  if (ui.view === "thesis")
    tickThesis()
      .then(() => loadThesis(false))
      .catch(() => {});
}, 90_000);
