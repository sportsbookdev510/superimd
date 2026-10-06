const PHI = Math.PI * (3 - Math.sqrt(5));

export function createGraph(host, { onSelect }) {
  host.innerHTML = `
    <div class="graph-tools">
      <div class="filters" data-graph-filters>
        ${["all", "working", "connected", "enrolled", "jobs"]
          .map(
            (item, index) =>
              `<button type="button" data-filter="${item}" class="${
                index === 0 ? "on" : ""
              }">${item}</button>`
          )
          .join("")}
      </div>
      <input data-graph-search type="search" placeholder="Find agent, seat, job" aria-label="Find a node">
      <button type="button" data-fit>Fit</button>
      <span class="graph-count" data-count></span>
    </div>
    <div class="graph-stage">
      <canvas class="graph-canvas"></canvas>
      <div class="graph-float" data-float></div>
      <div class="graph-tip" data-tip hidden></div>
    </div>
    <p class="graph-note" data-note></p>`;

  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const tip = host.querySelector("[data-tip]");
  const float = host.querySelector("[data-float]");
  const count = host.querySelector("[data-count]");
  const note = host.querySelector("[data-note]");

  let nodes = [];
  let edges = [];
  let cell = { x: 34, y: 34 };
  let counts = { working: 0, connected: 0, enrolled: 0 };
  let view = { x: 0, y: 0, k: 1 };
  let filter = "all";
  let query = "";
  let hover = null;
  let clusterHits = [];
  let drag = null;
  let fitted = false;
  let userMoved = false;
  let fitScale = 1;
  let fitSize = { w: 0, h: 0 };
  let frame = 0;

  host
    .querySelector("[data-graph-filters]")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      filter = button.dataset.filter;
      for (const item of host.querySelectorAll("[data-filter]"))
        item.classList.toggle("on", item === button);
    });
  host
    .querySelector("[data-graph-search]")
    .addEventListener("input", (event) => {
      query = event.target.value.trim().toLowerCase();
    });
  host.querySelector("[data-fit]").addEventListener("click", () => {
    userMoved = false;
    fit(true);
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      userMoved = true;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const wx = (mx - view.x) / view.k;
      const wy = (my - view.y) / view.k;
      view.k = Math.min(8, Math.max(0.12, view.k * factor));
      view.x = mx - wx * view.k;
      view.y = my - wy * view.k;
    },
    { passive: false }
  );

  canvas.addEventListener("pointerdown", (event) => {
    drag = {
      x: event.clientX,
      y: event.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) {
        drag.moved = true;
        userMoved = true;
      }
      view.x = drag.ox + dx;
      view.y = drag.oy + dy;
      return;
    }
    hover = hit(mx, my);
    placeTip(mx, my);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (drag && !drag.moved) {
      const rect = canvas.getBoundingClientRect();
      const node = hit(event.clientX - rect.left, event.clientY - rect.top);
      if (node?.kind === "cluster") {
        userMoved = true;
        const factor = 2.4;
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        view.k *= factor;
        view.x = mx - node.x * view.k;
        view.y = my - node.y * view.k;
      } else if (node?.ref) onSelect(node.ref, node);
    }
    drag = null;
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    tip.hidden = true;
  });

  function size() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (
      canvas.width !== Math.floor(w * dpr) ||
      canvas.height !== Math.floor(h * dpr)
    ) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    return { w, h, dpr };
  }

  function average(list, key) {
    return list.reduce((sum, node) => sum + node[key], 0) / list.length;
  }

  function otherEnd(edge, id) {
    return edge.source === id ? edge.target : edge.source;
  }

  function layout() {
    const seats = nodes.filter(
      (node) => node.kind === "agent" || node.kind === "seat"
    );
    seats.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
    const { w, h } = size();
    const aspect = Math.max(1.15, w / Math.max(h, 1));
    const cols = Math.max(
      1,
      Math.round(Math.sqrt(Math.max(seats.length, 1) * aspect))
    );
    const rows = Math.max(1, Math.ceil(seats.length / cols));
    const gapY = 34;
    const gapX =
      rows > 1 && cols > 1 ? (gapY * (aspect * (rows - 1))) / (cols - 1) : gapY;
    seats.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const seed = Number(node.tokenId) || index;
      node.x = (col - (cols - 1) / 2) * gapX + ((seed % 5) - 2) * 1.4;
      node.y = (row - (rows - 1) / 2) * gapY + (((seed >> 3) % 5) - 2) * 1.4;
      node.band = index;
    });

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const working = seats.filter((node) => node.status === "working");
    const simd = nodes.find((node) => node.kind === "simd");
    if (simd) {
      if (working.length) {
        simd.x = average(working, "x");
        simd.y = average(working, "y") - gapY * 0.85;
      } else {
        simd.x = -((cols - 1) / 2) * gapX - gapX * 0.8;
        simd.y = 0;
      }
      simd.band = 0;
    }

    const jobs = nodes.filter((node) => node.kind === "job");
    jobs.forEach((node, index) => {
      const linked = edges
        .filter(
          (edge) =>
            edge.rel === "seen_on" &&
            (edge.source === node.id || edge.target === node.id)
        )
        .map((edge) => byId.get(otherEnd(edge, node.id)))
        .filter(
          (item) => item && (item.kind === "agent" || item.kind === "seat")
        );
      if (linked.length) {
        const angle = -Math.PI / 2 + index * 0.85;
        node.x = average(linked, "x") + Math.cos(angle) * gapX * 0.72;
        node.y = average(linked, "y") + Math.sin(angle) * gapY * 0.72;
      } else if (simd) {
        const angle = index * PHI;
        node.x = simd.x + Math.cos(angle) * gapX * 1.15;
        node.y = simd.y + Math.sin(angle) * gapY * 1.15;
      } else {
        node.x = index * gapX;
        node.y = 0;
      }
      node.band = index;
    });

    const oracles = nodes.filter((node) => node.kind === "oracle");
    oracles.forEach((node, index) => {
      const edge = edges.find(
        (item) =>
          item.rel === "panel" &&
          (item.source === node.id || item.target === node.id)
      );
      const job = edge ? byId.get(otherEnd(edge, node.id)) : null;
      if (job && job.x != null) {
        node.x = job.x + gapX * 0.42;
        node.y = job.y + gapY * 0.28;
      } else {
        node.x = (index - (oracles.length - 1) / 2) * gapX * 0.8;
        node.y = -((rows - 1) / 2) * gapY - gapY;
      }
      node.band = index;
    });

    const launches = nodes.filter((node) => node.kind === "launch");
    launches.forEach((node, index) => {
      node.x = (index - (launches.length - 1) / 2) * gapX * 0.9;
      node.y = ((rows - 1) / 2) * gapY + gapY;
      node.band = index;
    });

    for (const node of nodes) {
      if (node.kind !== "worker") continue;
      const seat = byId.get(`seat:${node.tokenId}`);
      node.x = seat ? seat.x + gapX * 0.28 : 0;
      node.y = seat ? seat.y - gapY * 0.28 : 0;
      node.band = seat?.band || 0;
    }

    const floating = nodes.filter(
      (node) =>
        node.kind === "job" || node.kind === "oracle" || node.kind === "simd"
    );
    for (const node of floating) {
      for (const seat of seats) {
        let dx = node.x - seat.x;
        let dy = node.y - seat.y;
        let dist = Math.hypot(dx, dy);
        const minDist = node.kind === "simd" ? gapY * 0.7 : gapY * 0.55;
        if (dist < 0.01) {
          dx = gapX * 0.2;
          dy = -gapY * 0.2;
          dist = Math.hypot(dx, dy);
        }
        if (dist < minDist) {
          node.x = seat.x + (dx / dist) * minDist;
          node.y = seat.y + (dy / dist) * minDist;
        }
      }
    }

    let maxX = gapX;
    let maxY = gapY;
    for (const node of nodes) {
      if (node.x == null || node.y == null) continue;
      maxX = Math.max(maxX, Math.abs(node.x));
      maxY = Math.max(maxY, Math.abs(node.y));
    }
    const target = Math.max(0.35, (w - 28) / Math.max(h - 28, 1));
    const field = maxX / Math.max(maxY, 1);
    cell = { x: gapX, y: gapY };
    if (field > target) {
      const scale = field / target;
      for (const node of nodes) node.y *= scale;
      maxY *= scale;
      cell.y *= scale;
    } else if (field > 0) {
      const scale = target / field;
      for (const node of nodes) node.x *= scale;
      maxX *= scale;
      cell.x *= scale;
    }
    return { maxX: maxX + 8, maxY: maxY + 8 };
  }

  function matches(node) {
    if (!query) return false;
    return `${node.label} ${node.subtitle || ""} ${node.tokenId || ""} ${
      node.id
    }`
      .toLowerCase()
      .includes(query);
  }

  function emphasis(node) {
    if (query) return matches(node) ? 1 : 0.08;
    if (filter === "all") return node.status === "enrolled" ? 0.72 : 1;
    if (filter === "jobs")
      return node.kind === "job" ||
        node.kind === "oracle" ||
        node.kind === "launch" ||
        node.kind === "simd"
        ? 1
        : 0.12;
    if (filter === "working")
      return node.status === "working" ||
        node.kind === "simd" ||
        node.kind === "job"
        ? 1
        : 0.1;
    return node.status === filter || node.kind === "simd" ? 1 : 0.1;
  }

  function project(node) {
    const time = performance.now() / 1000;
    const seed = (node.band || 0) + (Number(node.tokenId) || 0);
    const room = Math.min(cell.x, cell.y) * view.k * 0.08;
    const amp =
      node.kind === "simd"
        ? room * 0.3
        : node.status === "working"
        ? room
        : room * 0.6;
    return {
      x: node.x * view.k + view.x + Math.sin(time * 0.7 + seed * 0.41) * amp,
      y:
        node.y * view.k +
        view.y +
        Math.cos(time * 0.52 + seed * 0.27) * amp * 0.72,
    };
  }

  function lod() {
    if (view.k < fitScale * 0.42) return "cluster";
    return "field";
  }

  function hit(mx, my) {
    if (lod() === "cluster") {
      for (const node of clusterHits) {
        const point = project(node);
        if (Math.hypot(point.x - mx, point.y - my) < 22) return node;
      }
    }
    let best = null;
    let bestDist = 16;
    for (const node of nodes) {
      const point = project(node);
      const dist = Math.hypot(point.x - mx, point.y - my);
      const reach = node.kind === "simd" ? 18 : 11;
      if (dist < Math.max(bestDist, reach) && dist < reach + 4) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }

  function placeTip(mx, my) {
    if (!hover) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.style.left = `${mx + 14}px`;
    tip.style.top = `${my + 14}px`;
    const lines = [
      hover.kind === "simd"
        ? "SIMD"
        : hover.kind === "agent" || hover.kind === "seat"
        ? `Agent ${hover.label}`
        : `${hover.kind} ${hover.label}`,
      hover.subtitle || "",
      hover.status && hover.kind !== "simd" ? hover.status : "",
      hover.source || "",
    ].filter(Boolean);
    tip.textContent = lines.join("\n");
  }

  function fit(force) {
    const { w, h } = size();
    if (!nodes.length || w < 80 || h < 80) return;
    const bounds = layout();
    const sameSize =
      Math.abs(w - fitSize.w) < 20 && Math.abs(h - fitSize.h) < 20;
    if (fitted && !force && (userMoved || sameSize)) return;
    const pad = 10;
    view.k = Math.min(
      (w - pad * 2) / (bounds.maxX * 2),
      (h - pad * 2) / (bounds.maxY * 2)
    );
    view.x = w / 2;
    view.y = h / 2;
    fitScale = view.k;
    fitSize = { w, h };
    fitted = true;
  }

  function dotRadius(node, time) {
    const pulse =
      node.status === "working" && node.kind !== "worker"
        ? 0.7 * Math.sin(time * 3 + (node.band || 0))
        : 0;
    if (node.kind === "worker") return 3.4;
    if (node.kind === "job") return 6.5;
    if (node.kind === "oracle" || node.kind === "launch") return 5;
    if (node.status === "working") return 5.4 + pulse;
    if (node.status === "connected") return 3.6;
    return 3;
  }

  function draw() {
    const { w, h, dpr } = size();
    fit(false);
    layout();
    const time = performance.now() / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const level = lod();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const seats = nodes.filter(
      (node) => node.kind === "agent" || node.kind === "seat"
    );
    clusterHits = [];
    if (level === "cluster") {
      const group = 40;
      const quiet = seats.filter((node) => node.status !== "working");
      for (let index = 0; index < quiet.length; index += group) {
        const members = quiet.slice(index, index + group);
        const x =
          members.reduce((sum, node) => sum + node.x, 0) / members.length;
        const y =
          members.reduce((sum, node) => sum + node.y, 0) / members.length;
        clusterHits.push({
          x,
          y,
          count: members.length,
          status: members[0].status,
          kind: "cluster",
          label: String(members.length),
          subtitle: members[0].status,
        });
      }
    }

    if (level === "field") {
      ctx.lineWidth = 1;
      for (const edge of edges) {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target || edge.rel === "runtime") continue;
        if (emphasis(source) < 0.5 || emphasis(target) < 0.5) continue;
        const a = project(source);
        const b = project(target);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const bend =
          edge.rel === "seen_on" ? 14 : edge.rel === "panel" ? 10 : 8;
        ctx.strokeStyle =
          edge.rel === "seen_on"
            ? "rgba(142,174,150,0.72)"
            : edge.rel === "panel"
            ? "rgba(198,174,114,0.7)"
            : edge.rel === "runtime"
            ? "rgba(143,180,201,0.45)"
            : "rgba(143,180,201,0.62)";
        const cx = a.x + dx / 2 - (dy / len) * bend;
        const cy = a.y + dy / 2 + (dx / len) * bend;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.stroke();
        const travel =
          (time * 0.16 +
            ((edge.source.length + edge.target.length) % 9) * 0.11) %
          1;
        const rest = 1 - travel;
        const px =
          rest * rest * a.x + 2 * rest * travel * cx + travel * travel * b.x;
        const py =
          rest * rest * a.y + 2 * rest * travel * cy + travel * travel * b.y;
        ctx.fillStyle = ctx.strokeStyle;
        traceDiamond(px, py, 1.5, 2);
        ctx.fill();
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const cluster of clusterHits) {
      const point = project(cluster);
      const radius = 8 + Math.sqrt(cluster.count) * 1.6;
      traceDiamond(point.x, point.y, radius, radius * 1.15);
      ctx.fillStyle = "#101418";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = cluster.status === "connected" ? "#8ea0a8" : "#5c676e";
      ctx.stroke();
      ctx.fillStyle = "#9eb4c4";
      ctx.font = `11px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillText(cluster.label, point.x, point.y);
    }

    for (const node of nodes) {
      if (node.kind === "simd" || node.kind === "worker") continue;
      if (
        level === "cluster" &&
        (node.kind === "agent" || node.kind === "seat") &&
        node.status !== "working"
      )
        continue;
      const point = project(node);
      const gap = Math.min(cell.x, cell.y) * view.k;
      const radius = Math.min(dotRadius(node, time), gap * 0.28);
      ctx.globalAlpha = emphasis(node);
      traceDiamond(point.x, point.y, radius, radius * 1.2);
      ctx.fillStyle = "#101418";
      ctx.fill();
      ctx.lineWidth = node.status === "working" ? 1.5 : 1;
      ctx.strokeStyle =
        node.kind === "worker"
          ? "#8fb4c9"
          : node.status === "working"
          ? "#d5ddd8"
          : node.status === "connected"
          ? "#8ea0a8"
          : node.kind === "job"
          ? "#8eae96"
          : node.kind === "oracle"
          ? "#c6ae72"
          : node.kind === "launch"
          ? "#9eb4c4"
          : "#6d8b9c";
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const simd = nodes.find((node) => node.kind === "simd");
    if (simd) {
      const point = project(simd);
      const half = Math.min(16, Math.min(cell.x, cell.y) * view.k * 0.42);
      ctx.fillStyle = "#101418";
      ctx.strokeStyle = "#d7c7a1";
      ctx.lineWidth = 1.5;
      traceDiamond(point.x, point.y, half * 1.35, half);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d7c7a1";
      ctx.font = `12px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SIMD", point.x, point.y);
    }

    const showLabels = view.k > fitScale * 1.15 || query;
    if (showLabels) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `10px "IBM Plex Mono", ui-monospace, monospace`;
      for (const node of nodes) {
        if (node.kind === "simd") continue;
        if (
          level === "cluster" &&
          (node.kind === "agent" || node.kind === "seat") &&
          node.status !== "working"
        )
          continue;
        const show = query ? matches(node) : true;
        if (!show) continue;
        const point = project(node);
        ctx.globalAlpha = emphasis(node);
        ctx.fillStyle = node.status === "working" ? "#d5ddd8" : "#8ea8b8";
        ctx.fillText(node.label, point.x + dotRadius(node, time) + 4, point.y);
      }
      ctx.globalAlpha = 1;
    }

    float.innerHTML = `
      <b>IDENTITY.MD</b>
      <span>${counts.working || 0} working</span>
      <span>${counts.connected || 0} connected</span>
      <span>${counts.enrolled || 0} enrolled</span>
      <span>${
        nodes.filter((node) => node.kind === "job").length
      } executing jobs</span>
      <span>cyan observes · green job · amber oracle</span>`;
    count.textContent = `${
      nodes.filter((node) => node.kind === "agent" || node.kind === "seat")
        .length
    } seats`;
  }

  function traceDiamond(x, y, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(x, y - ry);
    ctx.lineTo(x + rx, y);
    ctx.lineTo(x, y + ry);
    ctx.lineTo(x - rx, y);
    ctx.closePath();
  }

  function loop() {
    draw();
    frame = requestAnimationFrame(loop);
  }

  function setData(graph) {
    nodes = graph.nodes.map((node) => ({ ...node }));
    edges = graph.edges || [];
    counts = graph.counts || counts;
    note.textContent = graph.note || "";
    if (!fitted) fit(false);
  }

  frame = requestAnimationFrame(loop);
  return {
    setData,
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
