import { ago, esc } from "../format.js?v=3";

const state = {
  board: null,
  feed: [],
  sort: "hot",
  view: "feed", // feed | board | thread | submit
  sectionId: null,
  section: null,
  threadId: null,
  thread: null,
  status: "",
  nameDraft: "",
  query: "",
  privy: {
    config: null,
    client: null,
    user: null,
  },
};

const EMOJIS = [
  "😀",
  "😂",
  "🔥",
  "🚀",
  "💡",
  "👀",
  "🤝",
  "🧠",
  "⚡",
  "💎",
  "🛠️",
  "❤️",
];

function toast(msg) {
  state.status = msg || "";
  const el = document.querySelector("#rf-toast");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (!parts.length) return { view: "feed", sectionId: null, threadId: null };
  if (parts[0] === "b" && parts[1])
    return { view: "board", sectionId: parts[1], threadId: null };
  if (parts[0] === "t" && parts[1])
    return { view: "thread", sectionId: null, threadId: parts[1] };
  if (parts[0] === "submit") {
    const q = new URLSearchParams(
      parts[1] || location.hash.split("?")[1] || ""
    );
    // support #/submit/general or #/submit?b=general
    const sectionId =
      parts[1] && parts[1] !== "?"
        ? parts[1].split("?")[0]
        : new URLSearchParams(location.hash.split("?")[1] || "").get("b");
    return {
      view: "submit",
      sectionId: sectionId || "general",
      threadId: null,
    };
  }
  return { view: "feed", sectionId: null, threadId: null };
}

function go(hash) {
  location.hash = hash;
}

function authorHtml(author) {
  if (!author) return "—";
  const label = esc(author.displayName || author.label || "?");
  if (author.url)
    return `<a href="${esc(
      author.url
    )}" target="_blank" rel="noopener">${label}</a>`;
  return label;
}

function preview(text, n = 220) {
  const t = String(text || "").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

function queryText() {
  return String(state.query || "")
    .trim()
    .toLowerCase();
}

function searchableAuthor(author) {
  return [author?.displayName, author?.label, author?.username, author?.wallet]
    .filter(Boolean)
    .join(" ");
}

function matchesQuery(thread) {
  const q = queryText();
  if (!q) return true;
  const section = thread.section || {
    id: thread.sectionId,
    title: thread.sectionId,
  };
  return [
    thread.title,
    thread.body,
    section.id,
    section.title,
    searchableAuthor(thread.author),
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function imageHtml(image, label = "Attached image") {
  if (!image?.url) return "";
  return `<a class="rf-attachment" href="${esc(
    image.url
  )}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="${esc(
    image.name || label
  )}" loading="lazy"></a>`;
}

function composerTools(id) {
  return `<div class="rf-composer-tools" data-composer="${esc(id)}">
    <div class="rf-emoji-picker" aria-label="Emoji">
      ${EMOJIS.map(
        (emoji) =>
          `<button type="button" class="rf-emoji" data-emoji-target="${esc(
            id
          )}" data-emoji="${esc(emoji)}" title="Add ${esc(
            emoji
          )}">${emoji}</button>`
      ).join("")}
    </div>
    <label class="rf-file-button" title="Attach image">
      <span aria-hidden="true">📎</span><span>Image</span>
      <input type="file" name="image" accept="image/png,image/jpeg,image/gif,image/webp">
    </label>
    <span class="rf-file-name" data-file-name="${esc(id)}">No image</span>
  </div>`;
}

function bindComposerTools(host, id) {
  const textarea = host.querySelector(`[data-emoji-input="${esc(id)}"]`);
  host
    .querySelectorAll(`[data-emoji-target="${esc(id)}"]`)
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (!textarea) return;
        const emoji = button.dataset.emoji || "";
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        textarea.value = `${textarea.value.slice(
          0,
          start
        )}${emoji}${textarea.value.slice(end)}`;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      });
    });
  const input = host.querySelector(
    `[data-composer="${esc(id)}"] input[type="file"]`
  );
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    const name = host.querySelector(`[data-file-name="${esc(id)}"]`);
    if (!name) return;
    if (!file) {
      name.textContent = "No image";
      return;
    }
    name.textContent =
      file.size > 2 * 1024 * 1024 ? "Image too large" : file.name;
  });
}

function readImageAttachment(input) {
  const file = input?.files?.[0];
  if (!file) return Promise.resolve(null);
  if (
    !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)
  ) {
    return Promise.reject(new Error("Use PNG, JPG, GIF or WebP"));
  }
  if (file.size > 2 * 1024 * 1024)
    return Promise.reject(new Error("Image must be smaller than 2 MB"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function staticForumPath(path) {
  let url;
  try {
    url = new URL(path, location.origin);
  } catch {
    return path;
  }
  if (url.pathname !== "/api/forum") return path;
  const op = url.searchParams.get("op");
  if (op === "privy-config") return "/api/forum/privy-config.json";
  if (op === "feed" || op === "board") return "/api/forum/feed.json";
  if (op === "section") {
    const section = url.searchParams.get("section") || "";
    if (/^[a-z0-9_-]+$/i.test(section))
      return `/api/forum/section-${section}.json`;
  }
  if (op === "thread") {
    const id = url.searchParams.get("id") || "";
    if (/^[a-z0-9_-]+$/i.test(id)) return `/api/forum/thread-${id}.json`;
  }
  return path;
}

function request(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method === "GET") path = staticForumPath(path);
  if (typeof window.fetch === "function") return window.fetch(path, options);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", path, true);
    xhr.withCredentials = options.credentials === "include";
    Object.entries(options.headers || {}).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value)
    );
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText || "{}"),
        text: async () => xhr.responseText || "",
      });
    xhr.onerror = () => reject(new Error("network request failed"));
    xhr.send(options.body || null);
  });
}

async function api(path, options = {}) {
  const { skipPrivy = false, ...requestOptions } = options;
  const privyToken = skipPrivy ? null : await getPrivyAccessToken();
  const response = await request(path, {
    credentials: "include",
    cache: "no-store",
    ...requestOptions,
    headers: {
      ...(requestOptions.body ? { "content-type": "application/json" } : {}),
      ...(privyToken ? { authorization: `Bearer ${privyToken}` } : {}),
      ...(requestOptions.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

const PRIVY_SDK_URL =
  "https://cdn.jsdelivr.net/npm/@privy-io/js-sdk-core@0.78.0/+esm";

async function getPrivyAccessToken() {
  if (!state.privy.client || !state.privy.user) return null;
  try {
    return await state.privy.client.getAccessToken();
  } catch {
    return null;
  }
}

async function initPrivy() {
  if (state.privy.client || state.privy.config?.checked)
    return state.privy.client;
  state.privy.config = { checked: true };
  try {
    const response = await request("/api/forum?op=privy-config", {
      cache: "no-store",
    });
    const config = await response.json();
    state.privy.config = config;
    if (!config.enabled) return null;
    const sdk = await import(PRIVY_SDK_URL);
    const client = new sdk.default({
      appId: config.appId,
      clientId: config.clientId,
      storage: new sdk.LocalStorage(),
    });
    await client.initialize();
    const callbackCode = new URLSearchParams(location.search).get(
      "privy_oauth_code"
    );
    const callbackState = new URLSearchParams(location.search).get(
      "privy_oauth_state"
    );
    if (callbackCode && callbackState) {
      await client.auth.oauth.loginWithCode(callbackCode, callbackState);
      const cleanUrl = `${location.pathname}${location.hash || ""}`;
      history.replaceState(null, "", cleanUrl);
    }
    const current = await client.user.get();
    state.privy.client = client;
    state.privy.user = current?.user || null;
    return client;
  } catch (error) {
    state.privy.config = {
      checked: true,
      enabled: false,
      error: error?.message || "Privy unavailable",
    };
    return null;
  }
}

function closePrivyDialog() {
  document.querySelector("#rf-privy-dialog")?.close();
}

function ensurePrivyDialog() {
  let dialog = document.querySelector("#rf-privy-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "rf-privy-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="rf-privy-dialog-card">
      <button type="submit" class="rf-privy-close" aria-label="Close">x</button>
      <span class="rf-kicker">Privy access</span>
      <h2>Choose a way in</h2>
      <p>Use Google or email to join the forum. X remains the route for upvotes.</p>
      <div class="rf-privy-options">
        <button type="button" class="quiet on" data-privy-provider="google">Continue with Google</button>
        <button type="button" class="quiet" data-privy-provider="email">Continue with email</button>
      </div>
      <p class="hint" data-privy-status></p>
    </form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closePrivyDialog();
  });
  dialog.querySelectorAll("[data-privy-provider]").forEach((button) => {
    button.addEventListener("click", () =>
      connectPrivyProvider(button.dataset.privyProvider)
    );
  });
  return dialog;
}

async function connectPrivyProvider(provider) {
  const client = await initPrivy();
  const dialog = ensurePrivyDialog();
  const status = dialog.querySelector("[data-privy-status]");
  if (!client) {
    if (status)
      status.textContent = "Privy is not configured for this environment yet.";
    return;
  }
  try {
    if (provider === "google") {
      const result = await client.auth.oauth.generateURL(
        "google",
        `${location.origin}/forum/`
      );
      location.assign(result.url);
      return;
    }
    const email = window.prompt("Email address");
    if (!email) return;
    if (status) status.textContent = "Sending code…";
    await client.auth.email.sendCode(email);
    const code = window.prompt("Enter the code sent to your email");
    if (!code) return;
    const session = await client.auth.email.loginWithCode(email, code);
    state.privy.user = session?.user || (await client.user.get())?.user || null;
    closePrivyDialog();
    toast("Connected with Privy");
    await boot(true);
  } catch (error) {
    if (status) status.textContent = error?.message || "Privy login failed";
  }
}

async function connectWallet() {
  const eth = window.ethereum;
  if (!eth?.request) {
    toast(
      "No wallet found in this browser — open localhost in Chrome, Brave, or MetaMask browser."
    );
    return;
  }
  toast("Requesting wallet…");
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    const address = String(accounts?.[0] || "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(address))
      throw new Error("wallet unavailable");
    const challenge = await api(
      `/api/forum?op=wallet-challenge&address=${encodeURIComponent(address)}`
    );
    if (!challenge.ok || !challenge.body.message)
      throw new Error(challenge.body.error || "challenge failed");
    toast("Sign the login message…");
    const signature = await eth.request({
      method: "personal_sign",
      params: [challenge.body.message, address],
    });
    const login = await api("/api/forum?op=wallet-login", {
      method: "POST",
      body: JSON.stringify({
        address,
        message: challenge.body.message,
        signature,
      }),
    });
    if (!login.ok) throw new Error(login.body.error || "wallet login failed");
    await api("/api/forum?op=access", { method: "POST", body: "{}" });
    toast(`Connected ${login.body.label || address.slice(0, 10)}`);
    await boot(true);
  } catch (error) {
    toast(error?.message || "Wallet cancelled");
  }
}

function renderAuth() {
  const host = document.querySelector("#rf-auth");
  if (!host) return;
  const me = state.board?.me;
  if (me) {
    host.innerHTML = `
      <span class="hint">u/${esc(me.displayName || "anon")}</span>
      ${
        me.kind === "twitter"
          ? `<button type="button" class="quiet" id="rf-link-wallet">Link wallet</button>`
          : ""
      }
      <button type="button" class="quiet on" id="rf-create">Create post</button>
      <button type="button" class="quiet" id="rf-logout">Log out</button>`;
  } else {
    host.innerHTML = `
      <button type="button" class="quiet" id="rf-x">Connect X</button>
      <button type="button" class="quiet" id="rf-wallet">Connect wallet</button>
      <button type="button" class="quiet on" id="rf-privy">Connect with Privy</button>`;
  }
  document.querySelector("#rf-x")?.addEventListener("click", async () => {
    toast("Opening X…");
    const res = await api("/api/forum?op=auth");
    if (!res.ok || !res.body.url) {
      toast(res.body.error || "X login failed");
      return;
    }
    location.href = res.body.url;
  });
  document
    .querySelector("#rf-wallet")
    ?.addEventListener("click", () => connectWallet());
  document.querySelector("#rf-privy")?.addEventListener("click", async () => {
    const dialog = ensurePrivyDialog();
    dialog.showModal();
    await initPrivy();
  });
  document
    .querySelector("#rf-link-wallet")
    ?.addEventListener("click", () => connectWallet());
  document.querySelector("#rf-logout")?.addEventListener("click", async () => {
    await api("/api/forum?op=logout", { method: "POST", body: "{}" });
    if (me?.kind === "privy" && state.privy.client && state.privy.user) {
      await state.privy.client.auth
        .logout({ userId: state.privy.user.id })
        .catch(() => {});
      state.privy.user = null;
    }
    toast("Logged out");
    await boot(true);
  });
  document.querySelector("#rf-create")?.addEventListener("click", () => {
    go(`#/submit/${state.sectionId || "general"}`);
  });
}

function renderLeft() {
  const host = document.querySelector("#rf-left");
  if (!host || !state.board) return;
  const sections = state.board.sections || [];
  const publicBoards = sections.filter((s) => !s.hidden);
  const active = state.view === "feed" ? "home" : state.sectionId;
  host.innerHTML = `
    <div class="rf-card">
      <h2>Communities</h2>
      <nav class="rf-comm">
        <a href="#/" class="${
          active === "home" ? "on" : ""
        }"><span>Home feed</span><span class="count">all</span></a>
        ${publicBoards
          .map(
            (s) => `<a href="#/b/${esc(s.id)}" class="${
              active === s.id ? "on" : ""
            }">
            <span>${
              s.iconOnly ? esc(s.title || s.id) : `b/${esc(s.id)}`
            }</span><span class="count">${esc(s.threadCount || 0)}</span>
          </a>`
          )
          .join("")}
      </nav>
    </div>`;
}

function renderRight() {
  const host = document.querySelector("#rf-right");
  if (!host || !state.board) return;
  const me = state.board.me;
  const access = state.board.access;
  host.innerHTML = `
    <div class="rf-card">
      <h2>About</h2>
      <p class="hint" style="margin:0">${esc(state.board.subtitle || "")}</p>
      <ul style="margin:10px 0 0;padding-left:16px;color:var(--muted)">
        ${(state.board.rules || []).map((r) => `<li>${esc(r)}</li>`).join("")}
      </ul>
    </div>
    ${
      me
        ? `<div class="rf-card">
            <h2>Profile</h2>
            <form id="rf-profile" class="rf-composer" style="border:0;padding:0">
              <label>Display name<input name="displayName" maxlength="32" minlength="2" required value="${esc(
                state.nameDraft || me.displayName || ""
              )}"></label>
              <div class="rf-composer-actions"><button class="quiet on" type="submit">Save</button></div>
            </form>
            <p class="hint" style="margin:8px 0 0">${esc(me.kind)}${
            me.wallet ? ` · ${esc(me.wallet.slice(0, 6))}…` : ""
          }</p>
          </div>`
        : `<div class="rf-card"><h2>Join</h2><p class="hint" style="margin:0">Connect X, wallet, or Privy to post and reply.</p></div>`
    }
    <div class="rf-card">
      <h2>Access</h2>
      <p class="hint" style="margin:0">
        ${
          access?.ok
            ? `Unlocked · ${esc((access.reasons || []).join(" · "))}`
            : access
            ? `Locked · ${esc((access.reasons || []).join(" · "))}`
            : "Connect wallet to check NFT / whale gate."
        }
      </p>
    </div>`;

  document
    .querySelector("#rf-profile")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = event.target.displayName.value;
      state.nameDraft = name;
      toast("Saving…");
      const res = await api("/api/forum?op=profile", {
        method: "POST",
        body: JSON.stringify({ displayName: name }),
      });
      toast(res.ok ? "Profile saved" : res.body.error || "Save failed");
      if (res.ok) {
        state.board.me = res.body.me;
        state.nameDraft = res.body.me?.displayName || name;
        renderAuth();
        renderRight();
      }
    });
}

function voteControl(thread) {
  const canVote = state.board?.me?.kind === "twitter";
  const voted = Boolean(thread.voted);
  const title = canVote
    ? voted
      ? "Remove upvote"
      : "Upvote"
    : "Sign in with X to upvote";
  return `<div class="rf-vote">
    <button type="button" class="rf-vote-button ${
      voted ? "on" : ""
    }" data-vote="${esc(thread.id)}" aria-pressed="${voted}" title="${title}" ${
    canVote ? "" : "disabled"
  }>
      <span class="arrow" aria-hidden="true">▲</span>
      <span class="score">${esc(thread.upvotes ?? 0)}</span>
    </button>
  </div>`;
}

function bindVoteButtons(host) {
  host.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.board?.me?.kind !== "twitter") {
        toast("Sign in with X to upvote");
        return;
      }
      button.disabled = true;
      const res = await api("/api/forum?op=vote", {
        method: "POST",
        body: JSON.stringify({ threadId: button.dataset.vote }),
      });
      if (!res.ok) {
        button.disabled = false;
        toast(res.body.error || "Vote failed");
        return;
      }
      toast(res.body.voted ? "Upvoted" : "Upvote removed");
      if (state.view === "thread") await loadThread(state.threadId);
      else if (state.view === "board") await loadBoard(state.sectionId);
      else await loadFeed();
    });
  });
}

function threadIcons(thread) {
  const reactions = thread.reactions || {};
  const me = state.board?.me;
  const canReact = Boolean(me);
  const heartOn = reactions.mine === "heart";
  const skullOn = reactions.mine === "skull";
  return `<div class="rf-icons" data-thread-icons="${esc(thread.id)}">
    <button type="button" class="${
      heartOn ? "on" : ""
    }" data-react="heart" data-thread-id="${esc(thread.id)}" title="${
    canReact ? "React with heart" : "Connect to react"
  }" ${canReact ? "" : "disabled"}>
      <span aria-hidden="true">♥</span><b>${esc(reactions.heart || 0)}</b>
    </button>
    <button type="button" class="${
      skullOn ? "on" : ""
    }" data-react="skull" data-thread-id="${esc(thread.id)}" title="${
    canReact ? "React with skull" : "Connect to react"
  }" ${canReact ? "" : "disabled"}>
      <span aria-hidden="true">☠</span><b>${esc(reactions.skull || 0)}</b>
    </button>
  </div>`;
}

function bindReactionButtons(host) {
  host.querySelectorAll("[data-react][data-thread-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!state.board?.me) {
        toast("Connect first to react");
        return;
      }
      button.disabled = true;
      const res = await api("/api/forum?op=react", {
        method: "POST",
        body: JSON.stringify({
          threadId: button.dataset.threadId,
          reaction: button.dataset.react,
        }),
      });
      if (!res.ok) {
        button.disabled = false;
        toast(res.body.error || "Reaction failed");
        return;
      }
      toast(button.dataset.react === "skull" ? "Skull marked" : "Heart marked");
      if (state.view === "thread") await loadThread(state.threadId);
      else if (state.view === "board") await loadBoard(state.sectionId);
      else await loadFeed();
    });
  });
}

function postCard(thread) {
  const section = thread.section || {
    id: thread.sectionId,
    title: thread.sectionId,
  };
  return `
    <article class="rf-post">
      ${voteControl(thread)}
      <div class="rf-body">
        <div class="rf-meta">
          <a href="#/b/${esc(section.id)}">b/${esc(section.id)}</a>
          <span>·</span>
          <span>Posted by ${authorHtml(thread.author)}</span>
          <span>·</span>
          <span>${thread.at ? esc(ago(thread.at)) : "—"}</span>
        </div>
        <h3 class="rf-title"><a href="#/t/${esc(thread.id)}">${esc(
    thread.title
  )}</a></h3>
        ${threadIcons(thread)}
        <p class="rf-preview">${esc(preview(thread.body))}</p>
        ${imageHtml(thread.image)}
        <div class="rf-actions">
          <a href="#/t/${esc(thread.id)}">${esc(
    thread.replyCount || 0
  )} comments</a>
          <a href="#/t/${esc(thread.id)}">Open thread</a>
        </div>
      </div>
    </article>`;
}

function renderFeed() {
  const host = document.querySelector("#rf-main");
  if (!host) return;
  const items = (state.feed || []).filter(matchesQuery);
  const hasQuery = Boolean(queryText());
  host.innerHTML = `
    <div class="rf-sort">
      <button type="button" data-sort="hot" class="${
        state.sort === "hot" ? "on" : ""
      }">Hot</button>
      <button type="button" data-sort="new" class="${
        state.sort === "new" ? "on" : ""
      }">New</button>
      <button type="button" data-sort="top" class="${
        state.sort === "top" ? "on" : ""
      }">Top</button>
      <button type="button" class="quiet on" id="rf-main-create" style="margin-left:auto">Create post</button>
    </div>
    ${
      items.length
        ? items.map(postCard).join("")
        : `<div class="rf-empty">${
            hasQuery
              ? "No posts match this search."
              : "No posts yet — be the first."
          }</div>`
    }`;

  host.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.sort = btn.dataset.sort;
      loadFeed();
    });
  });
  host
    .querySelector("#rf-main-create")
    ?.addEventListener("click", () => go("#/submit/general"));
  bindVoteButtons(host);
  bindReactionButtons(host);
}

function renderBoardView() {
  const host = document.querySelector("#rf-main");
  if (!host || !state.section) return;
  const section = state.section.section;
  const threads = (state.section.threads || []).filter((thread) =>
    matchesQuery({
      ...thread,
      section: { id: section.id, title: section.title },
    })
  );
  const hasQuery = Boolean(queryText());
  host.innerHTML = `
    <div class="rf-crumb">
      <a href="#/">Home</a><span>/</span><span>b/${esc(section.id)}</span>
    </div>
    <div class="rf-card">
      <h2>${esc(section.title)}${section.hidden ? " · VIP" : ""}</h2>
      <p class="hint" style="margin:0">${esc(section.blurb || "")}</p>
    </div>
    <div class="rf-sort">
      <button type="button" class="on">New</button>
      <button type="button" class="quiet on" id="rf-board-create" style="margin-left:auto">Create post</button>
    </div>
    ${
      threads.length
        ? threads
            .map((t) =>
              postCard({
                ...t,
                section: { id: section.id, title: section.title },
              })
            )
            .join("")
        : `<div class="rf-empty">${
            hasQuery
              ? "No posts match this search."
              : `No posts in b/${esc(section.id)} yet.`
          }</div>`
    }`;
  host
    .querySelector("#rf-board-create")
    ?.addEventListener("click", () => go(`#/submit/${section.id}`));
  bindVoteButtons(host);
  bindReactionButtons(host);
}

function renderThreadView() {
  const host = document.querySelector("#rf-main");
  if (!host || !state.thread) return;
  const t = state.thread.thread;
  const section = state.thread.section;
  const posts = state.thread.posts || [];
  const me = state.board?.me;
  host.innerHTML = `
    <div class="rf-crumb">
      <a href="#/">Home</a><span>/</span>
      <a href="#/b/${esc(section?.id || t.sectionId)}">b/${esc(
    section?.id || t.sectionId
  )}</a>
      <span>/</span><span>thread</span>
    </div>
    <article class="rf-thread-op">
      ${voteControl(t)}
      <div class="rf-body">
        <div class="rf-meta">
          <a href="#/b/${esc(section?.id || t.sectionId)}">b/${esc(
    section?.id || t.sectionId
  )}</a>
          <span>·</span>
          <span>Posted by ${authorHtml(t.author)}</span>
          <span>·</span>
          <span>${t.at ? esc(ago(t.at)) : "—"}</span>
        </div>
        <h1 class="rf-title" style="font-size:18px">${esc(t.title)}</h1>
        ${threadIcons(t)}
        <p class="rf-text">${esc(t.body)}</p>
        ${imageHtml(t.image)}
        <div class="rf-actions" style="margin-top:12px"><span>${esc(
          posts.length
        )} comments</span></div>
      </div>
    </article>
    <div class="rf-comments">
      <h2 style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase">Comments</h2>
      ${
        posts.length
          ? posts
              .map(
                (p) => `<div class="rf-comment">
              <div class="rail" aria-hidden="true"></div>
              <div>
                <div class="meta">${authorHtml(p.author)} · ${
                  p.at ? esc(ago(p.at)) : "—"
                }</div>
                <p class="text">${esc(p.body)}</p>
                ${imageHtml(p.image, "Comment image")}
              </div>
            </div>`
              )
              .join("")
          : `<p class="hint" style="margin:0">No comments yet.</p>`
      }
      <form id="rf-reply" class="rf-composer" style="margin-top:4px">
        <label>Comment as ${me ? esc(me.displayName) : "…"}</label>
        <textarea name="body" data-emoji-input="reply" maxlength="4000" required placeholder="What are your thoughts?" ${
          me ? "" : "disabled"
        }></textarea>
        ${composerTools("reply")}
        <div class="rf-composer-actions">
          <button class="quiet on" type="submit" ${
            me ? "" : "disabled"
          }>Comment</button>
        </div>
      </form>
    </div>`;

  bindComposerTools(host, "reply");
  bindVoteButtons(host);
  bindReactionButtons(host);

  host.querySelector("#rf-reply")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!me) {
      toast("Connect X, wallet, or Privy to comment");
      return;
    }
    toast("Posting…");
    let image = null;
    try {
      image = await readImageAttachment(event.target.elements.image);
    } catch (error) {
      toast(error.message);
      return;
    }
    const res = await api("/api/forum?op=reply", {
      method: "POST",
      body: JSON.stringify({
        threadId: state.threadId,
        body: event.target.body.value,
        image,
      }),
    });
    toast(res.ok ? "Comment posted" : res.body.error || "Failed");
    if (res.ok) await loadThread(state.threadId);
  });
}

function renderSubmit() {
  const host = document.querySelector("#rf-main");
  if (!host || !state.board) return;
  const me = state.board.me;
  const sections = (state.board.sections || []).filter(
    (s) => !s.hidden || state.board.access?.ok
  );
  const selected = state.sectionId || "general";
  host.innerHTML = `
    <div class="rf-crumb"><a href="#/">Home</a><span>/</span><span>Create post</span></div>
    <form id="rf-submit" class="rf-composer">
      <label>Community
        <select name="sectionId" required>
          ${sections
            .map(
              (s) =>
                `<option value="${esc(s.id)}" ${
                  s.id === selected ? "selected" : ""
                }>b/${esc(s.id)} — ${esc(s.title)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>Title<input name="title" maxlength="140" required placeholder="Title" ${
        me ? "" : "disabled"
      }></label>
      <label>Text<textarea name="body" data-emoji-input="thread" maxlength="8000" required placeholder="Text (optional markdown later)" ${
        me ? "" : "disabled"
      }></textarea></label>
      ${composerTools("thread")}
      <div class="rf-composer-actions">
        <button type="button" class="quiet" id="rf-cancel">Cancel</button>
        <button class="quiet on" type="submit" ${
          me ? "" : "disabled"
        }>Post</button>
      </div>
      ${
        me
          ? ""
          : `<p class="hint" style="margin:0">Connect X, wallet, or Privy to create a post.</p>`
      }
    </form>`;
  bindComposerTools(host, "thread");
  host.querySelector("#rf-cancel")?.addEventListener("click", () => go("#/"));
  host
    .querySelector("#rf-submit")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!me) {
        toast("Connect first");
        return;
      }
      const form = event.target;
      toast("Creating…");
      let image = null;
      try {
        image = await readImageAttachment(form.elements.image);
      } catch (error) {
        toast(error.message);
        return;
      }
      const res = await api("/api/forum?op=thread", {
        method: "POST",
        body: JSON.stringify({
          sectionId: form.sectionId.value,
          title: form.title.value,
          body: form.body.value,
          image,
        }),
      });
      if (!res.ok) {
        toast(res.body.error || "Create failed");
        return;
      }
      toast("Posted");
      go(`#/t/${res.body.thread.id}`);
    });
}

function renderMain() {
  if (state.view === "thread") renderThreadView();
  else if (state.view === "board") renderBoardView();
  else if (state.view === "submit") renderSubmit();
  else renderFeed();
}

async function loadFeed() {
  toast("");
  const res = await api(
    `/api/forum?op=feed&sort=${encodeURIComponent(state.sort)}`
  );
  if (!res.ok) {
    state.board = { error: res.body.error || "forum unavailable" };
    document.querySelector("#rf-main").innerHTML = `<div class="rf-empty">${esc(
      state.board.error
    )}</div>`;
    return;
  }
  state.board = res.body;
  state.feed = res.body.feed || [];
  if (state.board.me?.displayName) state.nameDraft = state.board.me.displayName;
  renderAuth();
  renderLeft();
  renderRight();
  renderMain();
}

async function loadBoard(sectionId) {
  toast("");
  if (!state.board) {
    const board = await api("/api/forum?op=board");
    state.board = board.ok ? board.body : { error: board.body.error };
  }
  const res = await api(
    `/api/forum?op=section&section=${encodeURIComponent(sectionId)}`
  );
  if (!res.ok) {
    if (res.body.code === "forum_holders_gate") {
      toast(res.body.error || "Holders only");
      go("#/");
      return;
    }
    document.querySelector("#rf-main").innerHTML = `<div class="rf-empty">${esc(
      res.body.error || "failed"
    )}</div>`;
    return;
  }
  state.section = res.body;
  state.sectionId = sectionId;
  renderAuth();
  renderLeft();
  renderRight();
  renderMain();
}

async function loadThread(threadId) {
  toast("");
  if (!state.board) {
    const board = await api("/api/forum?op=board");
    state.board = board.ok ? board.body : { error: board.body.error };
  }
  const res = await api(
    `/api/forum?op=thread&id=${encodeURIComponent(threadId)}`
  );
  if (!res.ok) {
    if (res.body.code === "forum_holders_gate") {
      toast(res.body.error || "Holders only");
      go("#/");
      return;
    }
    document.querySelector("#rf-main").innerHTML = `<div class="rf-empty">${esc(
      res.body.error || "failed"
    )}</div>`;
    return;
  }
  state.thread = res.body;
  state.threadId = threadId;
  state.sectionId = res.body.section?.id || null;
  renderAuth();
  renderLeft();
  renderRight();
  renderMain();
}

async function route() {
  const r = parseRoute();
  state.view = r.view;
  state.sectionId = r.sectionId;
  state.threadId = r.threadId;
  if (r.view === "thread") await loadThread(r.threadId);
  else if (r.view === "board") await loadBoard(r.sectionId);
  else if (r.view === "submit") {
    if (!state.board) {
      const board = await api("/api/forum?op=board");
      state.board = board.ok
        ? board.body
        : { error: board.body.error || "forum unavailable", sections: [] };
      if (state.board.me?.displayName)
        state.nameDraft = state.board.me.displayName;
    }
    renderAuth();
    renderLeft();
    renderRight();
    renderMain();
  } else await loadFeed();
}

async function boot() {
  document.querySelector("#rf-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderMain();
  });
  await initPrivy();
  await route();
}

window.addEventListener("hashchange", () => route());
boot().catch((error) => {
  const host = document.querySelector("#rf-main");
  if (host)
    host.innerHTML = `<div class="rf-empty">${esc(
      error?.message || "Forum failed to load"
    )}</div>`;
});
