export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pad(number) {
  return String(number ?? 0).padStart(5, "0");
}

export function shortId(id) {
  const text = String(id ?? "");
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

export function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

export function isTx(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || ""));
}

export function explorerBase(chainId) {
  return Number(chainId) === 11155111
    ? "https://sepolia.etherscan.io"
    : "https://etherscan.io";
}

export function chainAnchor(value, chainId = 1) {
  const text = String(value || "");
  const kind = isTx(text) ? "tx" : isAddress(text) ? "address" : null;
  if (!kind) return esc(text || "UNAVAILABLE");
  const short = `${text.slice(0, 6)}…${text.slice(-4)}`;
  const href = `${explorerBase(chainId)}/${kind}/${text}`;
  return `<a class="chain" href="${href}" target="_blank" rel="noopener" title="${esc(
    text
  )}">${esc(short)} ↗</a>`;
}

export function ago(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const EASTERN = "America/New_York";

function easternParts(value, withSeconds) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const options = {
    timeZone: EASTERN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  if (withSeconds) options.second = "2-digit";
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(
    new Date(time)
  );
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const clock = withSeconds
    ? `${get("hour")}:${get("minute")}:${get("second")}`
    : `${get("hour")}:${get("minute")}`;
  return clock;
}

export function clock(value) {
  return easternParts(value, true) || "—";
}

export function easternTime(value) {
  const clock = easternParts(value, false);
  return clock ? `${clock} ET` : "—";
}

export function stamp(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(time))
    .replace(",", "");
  return `${formatted} ET`;
}

const BADGE_CLASS = {
  IMD: "imd",
  "IMD DERIVED": "imd-derived",
  ETH: "eth",
  "SIMD DERIVED": "simd-derived",
  "SIMD INFERENCE": "simd-inference",
  "SIMD ACTION": "simd-action",
  VERIFIED: "verified",
  SIMD: "simd-derived",
  INFERRED: "simd-inference",
};

export function badge(kind) {
  const label = String(kind || "IMD").toUpperCase();
  const tone = BADGE_CLASS[label] || label.toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge badge-${esc(tone)}">${esc(label)}</span>`;
}

export function delta(value) {
  if (value == null || value === 0) return "";
  const sign = value > 0 ? "+" : "";
  const tone = value > 0 ? "up" : "down";
  return `<em class="delta ${tone}">${sign}${esc(value)}</em>`;
}

export function unavail(text = "UNAVAILABLE") {
  return `<span class="unavail">${esc(text)}</span>`;
}
