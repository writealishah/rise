"use strict";

const WEB3 = {
  chainIdHex: "0xaa39db",
  chainName: "RISE Testnet",
  rpcUrl: "https://testnet.riselabs.xyz",
  contractAddress: "0x6Fa4A5B3F837Cb957BD5a1C872087b596252fC70",
  selectors: {
    submitScore: "aff0b297",
    getLeaderboard: "6d763a6e",
  },
};

const STORAGE = {
  usernames: "rise_local_usernames_v1",
};

const RISE_WALLET_CDN_URL = "https://esm.sh/rise-wallet@0.3.5";

const state = {
  account: null,
  chainIdHex: null,
  busy: false,
  listenersAttached: false,
  useRiseWallet: false,
  riseWallet: null,
  riseProvider: null,
  riseInitPromise: null,
  lastVisibleScore: null,
  statusLine: "",
  statusUntil: 0,
  lastTxHash: "",
  layoutName: "",
  usernameMap: {},
  leaderboardRows: [],
  leaderboardLoading: false,
  showLeaderboard: false,
  modal: {
    active: false,
    value: "",
    error: "",
  },
  dom: {
    root: null,
    homeBrandWrap: null,
    homeBrandTitle: null,
    homeBrandWordmark: null,
    homeBrandSubtitle: null,
    homeBrandBeta: null,
    homeBrandPower: null,
    homeBrandLogo: null,
    loaderWrap: null,
    loaderBeta: null,
    loaderLogo: null,
    loaderTitle: null,
    loaderHint: null,
    loaderSub: null,
    infoBrandWrap: null,
    infoBrandLogo: null,
    infoBrandText: null,
    homeWrap: null,
    homeConnect: null,
    homeSwitch: null,
    homeUsername: null,
    homeLeaderboard: null,
    homeStatus: null,
    gameSubmit: null,
    boardWrap: null,
    boardRows: null,
    boardClose: null,
    modalWrap: null,
    modalInput: null,
    modalHelp: null,
    modalSave: null,
    modalCancel: null,
    runtimeRef: null,
  },
  hitboxes: {
    homeConnect: null,
    homeSwitch: null,
    homeUsername: null,
    homeLeaderboard: null,
    gameSubmit: null,
    boardClose: null,
    modalSave: null,
    modalCancel: null,
  },
};

const ui = {
  home: {
    connect: null,
    switchNetwork: null,
    username: null,
    leaderboard: null,
    status: null,
  },
  game: {
    submit: null,
    status: null,
  },
  board: {
    bg: null,
    title: null,
    rows: null,
    close: null,
  },
  modal: {
    bg: null,
    title: null,
    input: null,
    help: null,
    save: null,
    cancel: null,
  },
};

function nowMs() {
  return Date.now();
}

function setStatus(msg, holdMs = 5000) {
  state.statusLine = String(msg || "");
  state.statusUntil = nowMs() + holdMs;
}

function getStatus() {
  return nowMs() <= state.statusUntil ? state.statusLine : "";
}

function getEthereum() {
  const injected = typeof window !== "undefined" ? (window.ethereum || null) : null;
  if (state.useRiseWallet && state.riseProvider) {
    return state.riseProvider;
  }
  return injected || state.riseProvider || null;
}

async function ensureRiseWalletProvider() {
  if (state.riseProvider) {
    return state.riseProvider;
  }
  if (state.riseInitPromise) {
    return state.riseInitPromise;
  }
  if (typeof window === "undefined") {
    return null;
  }
  state.riseInitPromise = (async () => {
    try {
      const riseModule = await import(RISE_WALLET_CDN_URL);
      const RiseWalletApi = riseModule?.RiseWallet;
      if (!RiseWalletApi || typeof RiseWalletApi.create !== "function") {
        throw new Error("Rise Wallet module missing expected API.");
      }
      const walletInstance = RiseWalletApi.create(RiseWalletApi.defaultConfig);
      const provider = walletInstance?.provider || null;
      if (!provider || typeof provider.request !== "function") {
        throw new Error("Rise Wallet provider not available.");
      }
      state.riseWallet = walletInstance;
      state.riseProvider = provider;
      return provider;
    } catch (err) {
      console.warn("[MR RISE] Rise Wallet load failed:", err);
      return null;
    } finally {
      state.riseInitPromise = null;
    }
  })();
  return state.riseInitPromise;
}

function normalizeChainHex(value) {
  if (value == null) {
    return null;
  }
  try {
    if (typeof value === "string" && value.startsWith("0x")) {
      return `0x${parseInt(value, 16).toString(16)}`;
    }
    return `0x${Number(value).toString(16)}`;
  } catch (_) {
    return null;
  }
}

function isOnRise() {
  return normalizeChainHex(state.chainIdHex) === WEB3.chainIdHex;
}

function shortAddress(address) {
  if (!address || typeof address !== "string" || address.length < 12) {
    return "not connected";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || typeof hash !== "string" || hash.length < 14) {
    return "";
  }
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function toBigIntWord(hexWord) {
  return BigInt(`0x${hexWord || "0"}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadUsernameMap() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE.usernames);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveUsernameMap() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE.usernames, JSON.stringify(state.usernameMap));
  } catch (_) {
    // best effort
  }
}

function getUsernameFor(address) {
  if (!address) {
    return "";
  }
  return state.usernameMap[String(address).toLowerCase()] || "";
}

function setUsernameFor(address, username) {
  if (!address) {
    return;
  }
  state.usernameMap[String(address).toLowerCase()] = username;
  saveUsernameMap();
}

function getConnectedUsername() {
  return getUsernameFor(state.account);
}

function validateUsername(name) {
  const value = String(name || "").trim();
  if (value.length < 3 || value.length > 20) {
    throw new Error("Username must be 3-20 characters.");
  }
  if (!/^[A-Za-z0-9_ ]+$/.test(value)) {
    throw new Error("Only letters, numbers, spaces, and underscore are allowed.");
  }
  return value;
}

function canUseInstance(instance) {
  if (!instance) {
    return false;
  }
  try {
    return typeof instance.uid !== "undefined";
  } catch (_) {
    return false;
  }
}

function destroyInstance(instance) {
  if (!canUseInstance(instance)) {
    return;
  }
  try {
    if (typeof instance.destroy === "function") {
      instance.destroy();
    }
  } catch (_) {
    // stale instance after layout change
  }
}

function getObjectClass(runtime, objectName) {
  try {
    return runtime?.objects?.[objectName] || null;
  } catch (_) {
    return null;
  }
}

function getFirstInstance(runtime, objectName) {
  const objectClass = getObjectClass(runtime, objectName);
  if (!objectClass || typeof objectClass.getFirstInstance !== "function") {
    return null;
  }
  try {
    return objectClass.getFirstInstance();
  } catch (_) {
    return null;
  }
}

function getAllInstances(runtime, objectName) {
  const objectClass = getObjectClass(runtime, objectName);
  if (!objectClass) {
    return [];
  }
  try {
    if (typeof objectClass.getAllInstances === "function") {
      return objectClass.getAllInstances() || [];
    }
    if (Array.isArray(objectClass.instances)) {
      return objectClass.instances;
    }
  } catch (_) {
    return [];
  }
  return [];
}

function createInstance(runtime, objectName, layerName, x, y) {
  const objectClass = getObjectClass(runtime, objectName);
  if (!objectClass || typeof objectClass.createInstance !== "function") {
    return null;
  }
  try {
    return objectClass.createInstance(layerName, x, y, false);
  } catch (_) {
    return null;
  }
}

function styleText(instance, opts) {
  if (!canUseInstance(instance)) {
    return;
  }
  try {
    if (opts.text != null) {
      instance.text = String(opts.text);
    }
    if (opts.x != null) {
      instance.x = opts.x;
    }
    if (opts.y != null) {
      instance.y = opts.y;
    }
    if (opts.width != null && "width" in instance) {
      instance.width = opts.width;
    }
    if (opts.height != null && "height" in instance) {
      instance.height = opts.height;
    }
    if (opts.sizePt != null && "sizePt" in instance) {
      instance.sizePt = opts.sizePt;
    }
    if (opts.alignH != null && "horizontalAlign" in instance) {
      instance.horizontalAlign = opts.alignH;
    }
    if (opts.alignV != null && "verticalAlign" in instance) {
      instance.verticalAlign = opts.alignV;
    }
    if (opts.visible != null) {
      instance.isVisible = !!opts.visible;
    }
  } catch (_) {
    // best effort
  }
}

function styleSprite(instance, opts) {
  if (!canUseInstance(instance)) {
    return;
  }
  try {
    if (opts.x != null) {
      instance.x = opts.x;
    }
    if (opts.y != null) {
      instance.y = opts.y;
    }
    if (opts.width != null && "width" in instance) {
      instance.width = opts.width;
    }
    if (opts.height != null && "height" in instance) {
      instance.height = opts.height;
    }
    if (opts.opacity != null && "opacity" in instance) {
      instance.opacity = opts.opacity;
    }
    if (opts.visible != null) {
      instance.isVisible = !!opts.visible;
    }
  } catch (_) {
    // best effort
  }
}

function getViewport(instance, fallback) {
  if (canUseInstance(instance) && instance.layer && typeof instance.layer.getViewport === "function") {
    try {
      return instance.layer.getViewport();
    } catch (_) {
      // fallback below
    }
  }
  return fallback || { left: 0, top: 0, right: 1280, bottom: 720 };
}

function normalizeInputEvent(event) {
  if (!event) {
    return null;
  }
  if (typeof event.clientX === "number" && typeof event.clientY === "number") {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  if (event.touches && event.touches.length) {
    return { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
  }
  if (event.changedTouches && event.changedTouches.length) {
    return { clientX: event.changedTouches[0].clientX, clientY: event.changedTouches[0].clientY };
  }
  return null;
}

function pointInRect(point, rect) {
  if (!point || !rect) {
    return false;
  }
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

function getCanvasElement() {
  if (typeof window !== "undefined" && window.c3canvas && window.c3canvas.isConnected) {
    return window.c3canvas;
  }
  if (typeof document !== "undefined") {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    if (!canvases.length) {
      return null;
    }
    canvases.sort((a, b) => {
      const ar = (a.width || 0) * (a.height || 0);
      const br = (b.width || 0) * (b.height || 0);
      return br - ar;
    });
    return canvases[0];
  }
  return null;
}

function getCanvasRect() {
  const canvas = getCanvasElement();
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
    return null;
  }
  return canvas.getBoundingClientRect();
}

function makeHitboxFromLayerRect(cx, cy, width, height, viewport) {
  const rect = getCanvasRect();
  if (!rect || !viewport) {
    return null;
  }
  const vw = viewport.right - viewport.left;
  const vh = viewport.bottom - viewport.top;
  if (vw <= 0 || vh <= 0) {
    return null;
  }
  const leftLayer = cx - width / 2;
  const rightLayer = cx + width / 2;
  const topLayer = cy - height / 2;
  const bottomLayer = cy + height / 2;

  const left = rect.left + ((leftLayer - viewport.left) / vw) * rect.width;
  const right = rect.left + ((rightLayer - viewport.left) / vw) * rect.width;
  const top = rect.top + ((topLayer - viewport.top) / vh) * rect.height;
  const bottom = rect.top + ((bottomLayer - viewport.top) / vh) * rect.height;
  return { left, right, top, bottom };
}

function ensureDomCss() {
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById("rise-web3-ui-style")) {
    return;
  }
  const styleEl = document.createElement("style");
  styleEl.id = "rise-web3-ui-style";
  styleEl.textContent = `
    @keyframes riseTapPulse {
      0%, 100% { transform: translateY(0); box-shadow: 0 6px 16px rgba(20, 46, 74, 0.45); }
      50% { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(20, 46, 74, 0.6); }
    }
    #rise-web3-ui .rise-home-btn {
      transition: transform 120ms ease, filter 120ms ease, background 120ms ease;
    }
    #rise-web3-ui .rise-home-btn:hover {
      transform: translateX(-1px);
      filter: brightness(1.08);
      background: linear-gradient(135deg, rgba(43, 127, 193, 0.5), rgba(33, 89, 140, 0.38));
    }
    #rise-web3-ui .rise-tap-hint {
      animation: riseTapPulse 1.35s ease-in-out infinite;
    }
  `;
  if (document.head) {
    document.head.appendChild(styleEl);
  }
}

function applyDomButtonStyle(btn) {
  btn.type = "button";
  btn.className = "rise-home-btn";
  btn.style.display = "block";
  btn.style.width = "100%";
  btn.style.margin = "0 0 8px 0";
  btn.style.padding = "8px 12px";
  btn.style.border = "1px solid rgba(224, 242, 255, 0.42)";
  btn.style.borderRadius = "12px";
  btn.style.background = "linear-gradient(135deg, rgba(29, 95, 149, 0.45), rgba(21, 66, 104, 0.34))";
  btn.style.color = "#f7fbff";
  btn.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  btn.style.fontSize = "18px";
  btn.style.letterSpacing = "0.65px";
  btn.style.textAlign = "left";
  btn.style.whiteSpace = "nowrap";
  btn.style.textShadow = "0 2px 0 rgba(16,28,41,0.72)";
  btn.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.22)";
  btn.style.cursor = "pointer";
  btn.style.pointerEvents = "auto";
}

function createDomButton(text, onClick) {
  const btn = document.createElement("button");
  btn.textContent = text;
  applyDomButtonStyle(btn);
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return btn;
}

function ensureDomUi() {
  if (typeof document === "undefined") {
    return;
  }
  ensureDomCss();
  if (state.dom.root && state.dom.root.isConnected) {
    return;
  }

  const root = document.createElement("div");
  root.id = "rise-web3-ui";
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.left = "0";
  root.style.top = "0";
  root.style.width = "100vw";
  root.style.height = "100vh";
  root.style.zIndex = "2147483647";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";
  root.style.isolation = "isolate";

  const homeBrandWrap = document.createElement("div");
  homeBrandWrap.style.position = "fixed";
  homeBrandWrap.style.display = "none";
  homeBrandWrap.style.pointerEvents = "none";
  homeBrandWrap.style.textAlign = "left";
  homeBrandWrap.style.padding = "10px 12px 12px 12px";
  homeBrandWrap.style.borderRadius = "16px";
  homeBrandWrap.style.border = "1px solid rgba(224,242,255,0.34)";
  homeBrandWrap.style.background = "linear-gradient(135deg, rgba(10, 34, 58, 0.45), rgba(22, 72, 110, 0.22))";
  homeBrandWrap.style.boxShadow = "0 12px 24px rgba(3,12,22,0.24), inset 0 1px 0 rgba(255,255,255,0.17)";
  homeBrandWrap.style.backdropFilter = "blur(3px)";
  homeBrandWrap.style.webkitBackdropFilter = "blur(3px)";
  homeBrandWrap.style.boxSizing = "border-box";

  const homeBrandBeta = document.createElement("div");
  homeBrandBeta.textContent = "BETA BUILD";
  homeBrandBeta.style.display = "inline-block";
  homeBrandBeta.style.padding = "1px 10px";
  homeBrandBeta.style.marginBottom = "6px";
  homeBrandBeta.style.borderRadius = "999px";
  homeBrandBeta.style.background = "linear-gradient(90deg, rgba(236,204,42,0.92), rgba(255,235,150,0.92))";
  homeBrandBeta.style.color = "#1f3150";
  homeBrandBeta.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  homeBrandBeta.style.fontSize = "15px";
  homeBrandBeta.style.letterSpacing = "0.6px";
  homeBrandBeta.style.textShadow = "0 1px 0 rgba(255,255,255,0.5)";
  homeBrandWrap.appendChild(homeBrandBeta);

  const homeBrandWordmark = document.createElement("img");
  homeBrandWordmark.src = "icons/mr-rise-wordmark.png";
  homeBrandWordmark.alt = "MR. RISE";
  homeBrandWordmark.style.width = "420px";
  homeBrandWordmark.style.maxWidth = "100%";
  homeBrandWordmark.style.height = "auto";
  homeBrandWordmark.style.display = "block";
  homeBrandWordmark.style.margin = "0";
  homeBrandWordmark.style.filter = "drop-shadow(0 3px 6px rgba(2,9,16,0.2))";
  homeBrandWrap.appendChild(homeBrandWordmark);

  const homeBrandTitle = document.createElement("div");
  homeBrandTitle.textContent = "MR. RISE";
  homeBrandTitle.style.display = "none";
  homeBrandTitle.style.color = "#ffffff";
  homeBrandTitle.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  homeBrandTitle.style.fontSize = "72px";
  homeBrandTitle.style.lineHeight = "0.95";
  homeBrandTitle.style.letterSpacing = "1px";
  homeBrandTitle.style.textShadow = "0 4px 0 rgba(21,31,44,0.85), 0 0 16px rgba(255,255,255,0.2)";
  homeBrandWrap.appendChild(homeBrandTitle);

  const homeBrandSubtitle = document.createElement("div");
  homeBrandSubtitle.textContent = "WEB3 ARCADE ON RISE TESTNET";
  homeBrandSubtitle.style.display = "block";
  homeBrandSubtitle.style.marginTop = "2px";
  homeBrandSubtitle.style.color = "#e9f3ff";
  homeBrandSubtitle.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  homeBrandSubtitle.style.fontSize = "19px";
  homeBrandSubtitle.style.letterSpacing = "0.8px";
  homeBrandSubtitle.style.textShadow = "0 2px 0 rgba(21,31,44,0.72)";
  homeBrandWrap.appendChild(homeBrandSubtitle);

  const homeBrandPower = document.createElement("div");
  homeBrandPower.style.display = "none";
  homeBrandPower.style.alignItems = "center";
  homeBrandPower.style.gap = "8px";
  homeBrandPower.style.marginTop = "6px";
  homeBrandPower.style.color = "#f0f8ff";
  homeBrandPower.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  homeBrandPower.style.fontSize = "18px";
  homeBrandPower.style.letterSpacing = "0.6px";
  homeBrandPower.style.textShadow = "0 2px 0 rgba(21,31,44,0.75)";

  const homeBrandLogo = document.createElement("img");
  homeBrandLogo.src = "icons/rise-dark.svg";
  homeBrandLogo.alt = "Rise logo";
  homeBrandLogo.style.width = "116px";
  homeBrandLogo.style.height = "40px";
  homeBrandLogo.style.display = "block";
  homeBrandLogo.style.objectFit = "contain";
  homeBrandPower.appendChild(homeBrandLogo);

  homeBrandWrap.appendChild(homeBrandPower);

  const loaderWrap = document.createElement("div");
  loaderWrap.style.position = "fixed";
  loaderWrap.style.display = "none";
  loaderWrap.style.pointerEvents = "none";
  loaderWrap.style.textAlign = "center";
  loaderWrap.style.padding = "12px 16px 14px 16px";
  loaderWrap.style.borderRadius = "18px";
  loaderWrap.style.border = "1px solid rgba(224,242,255,0.32)";
  loaderWrap.style.background = "linear-gradient(145deg, rgba(9, 31, 53, 0.46), rgba(24, 75, 112, 0.22))";
  loaderWrap.style.boxShadow = "0 12px 24px rgba(6,18,32,0.28), inset 0 1px 0 rgba(255,255,255,0.2)";
  loaderWrap.style.backdropFilter = "blur(3px)";
  loaderWrap.style.webkitBackdropFilter = "blur(3px)";
  loaderWrap.style.boxSizing = "border-box";

  const loaderBeta = document.createElement("div");
  loaderBeta.textContent = "BETA BUILD";
  loaderBeta.style.display = "inline-block";
  loaderBeta.style.padding = "1px 12px";
  loaderBeta.style.marginBottom = "8px";
  loaderBeta.style.borderRadius = "999px";
  loaderBeta.style.background = "linear-gradient(90deg, rgba(236,204,42,0.92), rgba(255,235,150,0.92))";
  loaderBeta.style.color = "#1f3150";
  loaderBeta.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  loaderBeta.style.fontSize = "16px";
  loaderBeta.style.letterSpacing = "0.6px";
  loaderBeta.style.textShadow = "0 1px 0 rgba(255,255,255,0.5)";
  loaderWrap.appendChild(loaderBeta);

  const loaderLogo = document.createElement("img");
  loaderLogo.src = "icons/mr-rise-wordmark.png";
  loaderLogo.alt = "Mr. Rise";
  loaderLogo.style.width = "380px";
  loaderLogo.style.maxWidth = "52vw";
  loaderLogo.style.height = "auto";
  loaderLogo.style.display = "block";
  loaderLogo.style.margin = "0 auto";
  loaderWrap.appendChild(loaderLogo);

  const loaderTitle = document.createElement("div");
  loaderTitle.textContent = "POWERED BY RISE";
  loaderTitle.style.marginTop = "2px";
  loaderTitle.style.color = "#f7fbff";
  loaderTitle.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  loaderTitle.style.fontSize = "22px";
  loaderTitle.style.letterSpacing = "0.8px";
  loaderTitle.style.textShadow = "0 2px 0 rgba(16,28,41,0.72)";
  loaderWrap.appendChild(loaderTitle);

  const loaderHint = document.createElement("div");
  loaderHint.textContent = "TAP TO START";
  loaderHint.className = "rise-tap-hint";
  loaderHint.style.display = "inline-block";
  loaderHint.style.marginTop = "6px";
  loaderHint.style.padding = "4px 14px";
  loaderHint.style.borderRadius = "999px";
  loaderHint.style.border = "1px solid rgba(234,246,255,0.5)";
  loaderHint.style.background = "linear-gradient(135deg, rgba(34, 113, 176, 0.52), rgba(24, 74, 120, 0.38))";
  loaderHint.style.color = "#eef7ff";
  loaderHint.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  loaderHint.style.fontSize = "19px";
  loaderHint.style.letterSpacing = "0.9px";
  loaderHint.style.textShadow = "0 2px 0 rgba(16,28,41,0.72)";
  loaderWrap.appendChild(loaderHint);

  const loaderSub = document.createElement("div");
  loaderSub.textContent = "CONNECT WALLET LATER FROM HOME";
  loaderSub.style.marginTop = "5px";
  loaderSub.style.color = "rgba(224,242,255,0.9)";
  loaderSub.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  loaderSub.style.fontSize = "12px";
  loaderSub.style.letterSpacing = "0.7px";
  loaderSub.style.textShadow = "0 2px 0 rgba(16,28,41,0.6)";
  loaderWrap.appendChild(loaderSub);

  const infoBrandWrap = document.createElement("div");
  infoBrandWrap.style.position = "fixed";
  infoBrandWrap.style.display = "none";
  infoBrandWrap.style.pointerEvents = "none";
  infoBrandWrap.style.textAlign = "center";

  const infoBrandLogo = document.createElement("img");
  infoBrandLogo.src = "icons/mr-rise-loader-logo.png";
  infoBrandLogo.alt = "Rise logo";
  infoBrandLogo.style.width = "220px";
  infoBrandLogo.style.maxWidth = "40vw";
  infoBrandLogo.style.height = "auto";
  infoBrandLogo.style.display = "block";
  infoBrandLogo.style.margin = "0 auto";
  infoBrandWrap.appendChild(infoBrandLogo);

  const infoBrandText = document.createElement("div");
  infoBrandText.textContent = "POWERED BY RISE";
  infoBrandText.style.marginTop = "4px";
  infoBrandText.style.color = "#f2f9ff";
  infoBrandText.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  infoBrandText.style.fontSize = "22px";
  infoBrandText.style.letterSpacing = "0.6px";
  infoBrandText.style.textShadow = "0 2px 0 rgba(21,31,44,0.75)";
  infoBrandWrap.appendChild(infoBrandText);

  const homeWrap = document.createElement("div");
  homeWrap.style.position = "fixed";
  homeWrap.style.display = "none";
  homeWrap.style.width = "280px";
  homeWrap.style.pointerEvents = "none";
  homeWrap.style.textAlign = "left";
  homeWrap.style.padding = "10px 12px 12px 12px";
  homeWrap.style.borderRadius = "16px";
  homeWrap.style.border = "1px solid rgba(224,242,255,0.35)";
  homeWrap.style.background = "linear-gradient(145deg, rgba(7, 25, 42, 0.58), rgba(20, 69, 106, 0.3))";
  homeWrap.style.boxShadow = "0 14px 30px rgba(4,14,24,0.32), inset 0 1px 0 rgba(255,255,255,0.18)";
  homeWrap.style.backdropFilter = "blur(5px)";
  homeWrap.style.webkitBackdropFilter = "blur(5px)";
  homeWrap.style.boxSizing = "border-box";

  const homeConnect = createDomButton("CONNECT WALLET", () => { void connectWalletAction(); });
  const homeSwitch = createDomButton("SWITCH NETWORK", () => { void switchNetworkAction(); });
  const homeUsername = createDomButton("SET USERNAME", () => { openUsernameModal(); });
  const homeLeaderboard = createDomButton("VIEW TOP 20", () => {
    state.showLeaderboard = !state.showLeaderboard;
    if (state.showLeaderboard) {
      void fetchLeaderboard();
    }
  });
  homeWrap.appendChild(homeConnect);
  homeWrap.appendChild(homeSwitch);
  homeWrap.appendChild(homeUsername);
  homeWrap.appendChild(homeLeaderboard);

  const homeStatus = document.createElement("div");
  homeStatus.style.marginTop = "6px";
  homeStatus.style.color = "#f1f7ff";
  homeStatus.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  homeStatus.style.fontSize = "13px";
  homeStatus.style.lineHeight = "1.15";
  homeStatus.style.whiteSpace = "pre-line";
  homeStatus.style.textAlign = "left";
  homeStatus.style.textShadow = "0 2px 0 rgba(22,34,49,0.65)";
  homeStatus.style.pointerEvents = "none";
  homeWrap.appendChild(homeStatus);

  const gameSubmit = document.createElement("button");
  gameSubmit.type = "button";
  gameSubmit.textContent = "SUBMIT SCORE";
  gameSubmit.style.position = "fixed";
  gameSubmit.style.display = "none";
  gameSubmit.style.pointerEvents = "auto";
  gameSubmit.style.zIndex = "10000";
  gameSubmit.style.border = "2px solid rgba(255,255,255,0.55)";
  gameSubmit.style.borderRadius = "16px";
  gameSubmit.style.background = "rgba(236,204,42,0.88)";
  gameSubmit.style.color = "#1f3150";
  gameSubmit.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  gameSubmit.style.fontSize = "28px";
  gameSubmit.style.textShadow = "0 1px 0 rgba(255,255,255,0.4)";
  gameSubmit.style.padding = "6px 14px";
  gameSubmit.style.cursor = "pointer";
  gameSubmit.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.dom.runtimeRef) {
      void submitScoreAction(state.dom.runtimeRef);
    }
  });

  const boardWrap = document.createElement("div");
  boardWrap.style.position = "fixed";
  boardWrap.style.display = "none";
  boardWrap.style.pointerEvents = "auto";
  boardWrap.style.background = "rgba(9,26,46,0.86)";
  boardWrap.style.border = "2px solid rgba(255,255,255,0.24)";
  boardWrap.style.borderRadius = "12px";
  boardWrap.style.padding = "14px";
  boardWrap.style.boxSizing = "border-box";

  const boardTitle = document.createElement("div");
  boardTitle.textContent = "TOP 20 LEADERBOARD";
  boardTitle.style.color = "#f8fbff";
  boardTitle.style.textAlign = "center";
  boardTitle.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  boardTitle.style.fontSize = "28px";
  boardTitle.style.textShadow = "0 2px 0 rgba(17,28,43,0.7)";
  boardTitle.style.marginBottom = "8px";
  boardWrap.appendChild(boardTitle);

  const boardRows = document.createElement("pre");
  boardRows.style.margin = "0";
  boardRows.style.height = "calc(100% - 72px)";
  boardRows.style.overflow = "auto";
  boardRows.style.background = "rgba(0,0,0,0.18)";
  boardRows.style.borderRadius = "8px";
  boardRows.style.padding = "8px";
  boardRows.style.color = "#f5f9ff";
  boardRows.style.fontSize = "14px";
  boardRows.style.lineHeight = "1.2";
  boardRows.style.fontFamily = "Consolas, Menlo, monospace";
  boardWrap.appendChild(boardRows);

  const boardClose = document.createElement("button");
  boardClose.type = "button";
  boardClose.textContent = "CLOSE";
  boardClose.style.display = "block";
  boardClose.style.margin = "10px auto 0 auto";
  boardClose.style.pointerEvents = "auto";
  boardClose.style.border = "2px solid rgba(255,255,255,0.45)";
  boardClose.style.borderRadius = "10px";
  boardClose.style.background = "rgba(12,48,77,0.72)";
  boardClose.style.color = "#f8fbff";
  boardClose.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  boardClose.style.fontSize = "20px";
  boardClose.style.textShadow = "0 2px 0 rgba(17,28,43,0.7)";
  boardClose.style.padding = "4px 18px";
  boardClose.style.cursor = "pointer";
  boardClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.showLeaderboard = false;
  });
  boardWrap.appendChild(boardClose);

  const modalWrap = document.createElement("div");
  modalWrap.style.position = "fixed";
  modalWrap.style.display = "none";
  modalWrap.style.pointerEvents = "auto";
  modalWrap.style.background = "rgba(9,26,46,0.9)";
  modalWrap.style.border = "2px solid rgba(255,255,255,0.28)";
  modalWrap.style.borderRadius = "12px";
  modalWrap.style.padding = "16px";
  modalWrap.style.boxSizing = "border-box";
  modalWrap.style.textAlign = "center";

  const modalTitle = document.createElement("div");
  modalTitle.textContent = "SET USERNAME";
  modalTitle.style.color = "#f8fbff";
  modalTitle.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  modalTitle.style.fontSize = "34px";
  modalTitle.style.textShadow = "0 2px 0 rgba(17,28,43,0.7)";
  modalTitle.style.marginBottom = "8px";
  modalWrap.appendChild(modalTitle);

  const modalInput = document.createElement("input");
  modalInput.type = "text";
  modalInput.maxLength = 20;
  modalInput.placeholder = "Type username...";
  modalInput.spellcheck = false;
  modalInput.autocomplete = "off";
  modalInput.autocapitalize = "off";
  modalInput.style.width = "80%";
  modalInput.style.maxWidth = "520px";
  modalInput.style.height = "40px";
  modalInput.style.borderRadius = "8px";
  modalInput.style.border = "2px solid rgba(255,255,255,0.4)";
  modalInput.style.background = "rgba(255,255,255,0.9)";
  modalInput.style.padding = "4px 10px";
  modalInput.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  modalInput.style.fontSize = "24px";
  modalInput.addEventListener("input", () => {
    state.modal.value = modalInput.value;
    state.modal.error = "";
  });
  modalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      state.modal.value = modalInput.value;
      saveUsernameFromModal();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeUsernameModal();
    }
  });
  modalWrap.appendChild(modalInput);

  const modalHelp = document.createElement("div");
  modalHelp.style.marginTop = "8px";
  modalHelp.style.color = "#ecf4ff";
  modalHelp.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  modalHelp.style.fontSize = "14px";
  modalHelp.style.textShadow = "0 2px 0 rgba(17,28,43,0.7)";
  modalWrap.appendChild(modalHelp);

  const modalRow = document.createElement("div");
  modalRow.style.marginTop = "10px";
  modalWrap.appendChild(modalRow);

  const modalCancel = document.createElement("button");
  modalCancel.type = "button";
  modalCancel.textContent = "CANCEL";
  modalCancel.style.marginRight = "14px";
  modalCancel.style.border = "2px solid rgba(255,255,255,0.45)";
  modalCancel.style.borderRadius = "10px";
  modalCancel.style.background = "rgba(12,48,77,0.72)";
  modalCancel.style.color = "#f8fbff";
  modalCancel.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  modalCancel.style.fontSize = "20px";
  modalCancel.style.textShadow = "0 2px 0 rgba(17,28,43,0.7)";
  modalCancel.style.padding = "4px 16px";
  modalCancel.style.cursor = "pointer";
  modalCancel.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeUsernameModal();
  });
  modalRow.appendChild(modalCancel);

  const modalSave = document.createElement("button");
  modalSave.type = "button";
  modalSave.textContent = "SAVE";
  modalSave.style.border = "2px solid rgba(255,255,255,0.45)";
  modalSave.style.borderRadius = "10px";
  modalSave.style.background = "rgba(184,171,33,0.72)";
  modalSave.style.color = "#1f3150";
  modalSave.style.fontFamily = "'Bangers-Regular', 'Bangers', sans-serif";
  modalSave.style.fontSize = "20px";
  modalSave.style.textShadow = "0 1px 0 rgba(255,255,255,0.35)";
  modalSave.style.padding = "4px 18px";
  modalSave.style.cursor = "pointer";
  modalSave.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.modal.value = modalInput.value;
    saveUsernameFromModal();
  });
  modalRow.appendChild(modalSave);

  root.appendChild(loaderWrap);
  root.appendChild(infoBrandWrap);
  root.appendChild(homeBrandWrap);
  root.appendChild(homeWrap);
  root.appendChild(gameSubmit);
  root.appendChild(boardWrap);
  root.appendChild(modalWrap);
  document.body.appendChild(root);

  state.dom.root = root;
  state.dom.homeBrandWrap = homeBrandWrap;
  state.dom.homeBrandTitle = homeBrandTitle;
  state.dom.homeBrandWordmark = homeBrandWordmark;
  state.dom.homeBrandSubtitle = homeBrandSubtitle;
  state.dom.homeBrandBeta = homeBrandBeta;
  state.dom.homeBrandPower = homeBrandPower;
  state.dom.homeBrandLogo = homeBrandLogo;
  state.dom.loaderWrap = loaderWrap;
  state.dom.loaderBeta = loaderBeta;
  state.dom.loaderLogo = loaderLogo;
  state.dom.loaderTitle = loaderTitle;
  state.dom.loaderHint = loaderHint;
  state.dom.loaderSub = loaderSub;
  state.dom.infoBrandWrap = infoBrandWrap;
  state.dom.infoBrandLogo = infoBrandLogo;
  state.dom.infoBrandText = infoBrandText;
  state.dom.homeWrap = homeWrap;
  state.dom.homeConnect = homeConnect;
  state.dom.homeSwitch = homeSwitch;
  state.dom.homeUsername = homeUsername;
  state.dom.homeLeaderboard = homeLeaderboard;
  state.dom.homeStatus = homeStatus;
  state.dom.gameSubmit = gameSubmit;
  state.dom.boardWrap = boardWrap;
  state.dom.boardRows = boardRows;
  state.dom.boardClose = boardClose;
  state.dom.modalWrap = modalWrap;
  state.dom.modalInput = modalInput;
  state.dom.modalHelp = modalHelp;
  state.dom.modalSave = modalSave;
  state.dom.modalCancel = modalCancel;
}

function updateDomUi(runtime) {
  ensureDomUi();
  const rect = getCanvasRect();
  if (!rect || !state.dom.root) {
    return;
  }
  state.dom.runtimeRef = runtime;

  const layoutName = getLayoutName(runtime);
  const onLoader = layoutName === "Loader";
  const onMain = layoutName === "Main";
  const onGameOver = layoutName === "Game" && isGameOver(runtime);
  const observedScore = parseVisibleScore(runtime);
  if (Number.isFinite(observedScore) && observedScore >= 0) {
    state.lastVisibleScore = observedScore;
  }

  const loaderTap = getFirstInstance(runtime, "txt_taptocontinue");
  if (canUseInstance(loaderTap)) {
    loaderTap.text = "";
  }
  const loaderIntro = getFirstInstance(runtime, "intro_");
  if (canUseInstance(loaderIntro)) {
    loaderIntro.isVisible = false;
  }
  const loaderReset = getFirstInstance(runtime, "txt_reset");
  if (canUseInstance(loaderReset)) {
    loaderReset.isVisible = !onLoader;
  }

  const loaderW = Math.min(560, Math.max(320, Math.round(rect.width * 0.5)));
  const loaderLeft = Math.round(rect.left + (rect.width - loaderW) * 0.5);
  state.dom.loaderWrap.style.display = onLoader ? "block" : "none";
  state.dom.loaderWrap.style.left = `${loaderLeft}px`;
  state.dom.loaderWrap.style.top = `${Math.round(rect.top + rect.height * 0.2)}px`;
  state.dom.loaderWrap.style.width = `${loaderW}px`;
  state.dom.loaderBeta.style.fontSize = `${Math.max(13, Math.round(loaderW * 0.033))}px`;
  state.dom.loaderLogo.style.width = `${Math.round(loaderW * 0.76)}px`;
  state.dom.loaderTitle.style.fontSize = `${Math.max(18, Math.round(loaderW * 0.052))}px`;
  state.dom.loaderHint.style.fontSize = `${Math.max(17, Math.round(loaderW * 0.055))}px`;
  state.dom.loaderSub.style.fontSize = `${Math.max(11, Math.round(loaderW * 0.025))}px`;

  const creditInstances = getAllInstances(runtime, "txt_credits").filter((inst) => canUseInstance(inst));
  const infoVisible = onMain && creditInstances.some((inst) => !!inst.isVisible);
  if (infoVisible) {
    const blockedPatterns = [
      /macagi/i,
      /micagi/i,
      /mr\.\s*micagi/i,
      /mr\.\s*macagi/i,
      /otavio/i,
      /trezegames/i,
      /powered\s*by\s*rise/i,
      /^rise$/i,
      /glizzy\s*elf\s*forest/i,
      /opengameart\.org/i,
      /zane[-\s]*little/i,
      /^music$/i,
      /this\s*game\s*was\s*made\s*in\s*construct\s*3/i,
      /construct\s*3/i,
      /game\s*design\s*and\s*code/i,
      /game\s*and\s*code\s*by\s*0xalishah/i,
      /game\s*desing\s*and\s*code\s*by\s*:?\s*0xalishah/i,
    ];
    for (const creditsText of creditInstances) {
      if (!creditsText.isVisible) {
        continue;
      }
      const original = String(creditsText.text || "");
      const keptLines = original
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => {
          if (!line) {
            return false;
          }
          return !blockedPatterns.some((rx) => rx.test(line));
        });
      const cleaned = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      const signature = "game desing and code by: 0xAlishah";
      const signed = cleaned ? `${cleaned}\n\n${signature}` : signature;
      if (signed !== original) {
        creditsText.text = signed;
      }
    }
  }
  state.dom.infoBrandWrap.style.display = "none";
  state.dom.infoBrandWrap.style.left = `${Math.round(rect.left + rect.width * 0.5 - Math.min(170, rect.width * 0.2))}px`;
  state.dom.infoBrandWrap.style.top = `${Math.round(rect.top + rect.height * 0.22)}px`;

  const legacyTitleInstances = getAllInstances(runtime, "title");
  for (const legacyTitle of legacyTitleInstances) {
    if (canUseInstance(legacyTitle)) {
      legacyTitle.isVisible = !onMain;
    }
  }

  const titleSize = Math.max(54, Math.round(rect.width * 0.078));
  const brandW = Math.min(560, Math.max(290, Math.round(rect.width * 0.38)));
  state.dom.homeBrandWrap.style.display = onMain ? "block" : "none";
  state.dom.homeBrandWrap.style.left = `${Math.round(rect.left + Math.max(14, rect.width * 0.025))}px`;
  state.dom.homeBrandWrap.style.top = `${Math.round(rect.top + Math.max(8, rect.height * 0.018))}px`;
  state.dom.homeBrandWrap.style.width = `${brandW}px`;
  state.dom.homeBrandWordmark.style.width = `${Math.max(236, Math.round(brandW * 0.9))}px`;
  state.dom.homeBrandBeta.style.fontSize = `${Math.max(13, Math.round(brandW * 0.037))}px`;
  state.dom.homeBrandSubtitle.style.fontSize = `${Math.max(15, Math.round(brandW * 0.054))}px`;
  state.dom.homeBrandTitle.style.fontSize = `${titleSize}px`;
  state.dom.homeBrandPower.style.fontSize = `${Math.max(15, Math.round(titleSize * 0.24))}px`;
  state.dom.homeBrandLogo.style.width = `${Math.max(92, Math.round(titleSize * 1.55))}px`;
  state.dom.homeBrandLogo.style.height = `${Math.max(30, Math.round(titleSize * 0.52))}px`;
  state.dom.homeBrandPower.style.display = "none";

  const homeW = Math.min(340, Math.max(236, Math.round(rect.width * 0.225)));
  const homeMargin = Math.max(12, Math.round(rect.width * 0.012));
  const actionSize = Math.max(15, Math.round(homeW * 0.072));
  const homeLeft = Math.round(rect.right - homeW - homeMargin);
  state.dom.homeWrap.style.display = onMain ? "block" : "none";
  state.dom.homeWrap.style.left = `${homeLeft}px`;
  state.dom.homeWrap.style.top = `${Math.round(rect.top + Math.max(98, rect.height * 0.145))}px`;
  state.dom.homeWrap.style.width = `${homeW}px`;
  state.dom.homeConnect.style.fontSize = `${actionSize}px`;
  state.dom.homeSwitch.style.fontSize = `${actionSize}px`;
  state.dom.homeUsername.style.fontSize = `${actionSize}px`;
  state.dom.homeLeaderboard.style.fontSize = `${actionSize}px`;
  state.dom.homeStatus.style.fontSize = `${Math.max(12, Math.round(actionSize * 0.68))}px`;
  const hasInjectedWallet = typeof window !== "undefined" && !!window.ethereum;
  state.dom.homeConnect.textContent = state.account
    ? `CONNECTED ${shortAddress(state.account).toUpperCase()}`
    : (hasInjectedWallet ? "CONNECT WALLET" : "CONNECT PASSKEY");
  state.dom.homeSwitch.textContent = isOnRise() ? "RISE READY" : "SWITCH NETWORK";
  state.dom.homeUsername.textContent = getConnectedUsername() ? "EDIT USERNAME" : "SET USERNAME";
  state.dom.homeLeaderboard.textContent = "VIEW TOP 20";
  state.dom.homeStatus.textContent = [
    `WALLET: ${shortAddress(state.account).toUpperCase()}`,
    `NETWORK: ${isOnRise() ? WEB3.chainName.toUpperCase() : String(state.chainIdHex || "UNKNOWN").toUpperCase()}`,
    `USERNAME: ${(getConnectedUsername() || "NOT SET").toUpperCase()}`,
    (getStatus() || "TIP: CONNECT (WALLET OR PASSKEY), SWITCH, SET USERNAME.").toUpperCase(),
  ].join("\n");

  state.dom.gameSubmit.style.display = onGameOver ? "block" : "none";
  state.dom.gameSubmit.style.left = `${Math.round(rect.left + rect.width * 0.57)}px`;
  state.dom.gameSubmit.style.top = `${Math.round(rect.top + rect.height * 0.62)}px`;
  state.dom.gameSubmit.style.width = `${Math.round(rect.width * 0.18)}px`;

  const canShowBoard = state.showLeaderboard && (onMain || onGameOver);
  state.dom.boardWrap.style.display = canShowBoard ? "block" : "none";
  if (canShowBoard) {
    state.dom.boardWrap.style.left = `${Math.round(rect.left + rect.width * 0.12)}px`;
    state.dom.boardWrap.style.top = `${Math.round(rect.top + rect.height * 0.12)}px`;
    state.dom.boardWrap.style.width = `${Math.round(rect.width * 0.76)}px`;
    state.dom.boardWrap.style.height = `${Math.round(rect.height * 0.76)}px`;
    state.dom.boardRows.textContent = buildLeaderboardLines();
  }

  const canShowModal = state.modal.active && onMain;
  state.dom.modalWrap.style.display = canShowModal ? "block" : "none";
  if (canShowModal) {
    state.dom.modalWrap.style.left = `${Math.round(rect.left + rect.width * 0.2)}px`;
    state.dom.modalWrap.style.top = `${Math.round(rect.top + rect.height * 0.26)}px`;
    state.dom.modalWrap.style.width = `${Math.round(rect.width * 0.6)}px`;
    state.dom.modalWrap.style.height = `${Math.round(rect.height * 0.38)}px`;
    if (document.activeElement !== state.dom.modalInput) {
      state.dom.modalInput.value = state.modal.value || "";
    }
    state.dom.modalHelp.textContent = state.modal.error || "3-20 chars. Letters, numbers, spaces, underscore.";
  }
}

function hitInstance(instance, pointerEvent) {
  if (!canUseInstance(instance) || !pointerEvent) {
    return false;
  }
  try {
    const layer = instance.layer;
    if (!layer || typeof layer.cssPxToLayer !== "function") {
      return false;
    }

    const point = layer.cssPxToLayer(pointerEvent.clientX, pointerEvent.clientY);
    if (!Array.isArray(point) || point.length < 2) {
      return false;
    }

    const lx = point[0];
    const ly = point[1];

    if (typeof instance.containsPoint === "function" && instance.containsPoint(lx, ly)) {
      return true;
    }

    if (
      typeof instance.x === "number" &&
      typeof instance.y === "number" &&
      typeof instance.width === "number" &&
      typeof instance.height === "number"
    ) {
      const halfW = instance.width / 2;
      const halfH = instance.height / 2;
      return (
        lx >= instance.x - halfW &&
        lx <= instance.x + halfW &&
        ly >= instance.y - halfH &&
        ly <= instance.y + halfH
      );
    }
  } catch (_) {
    return false;
  }
  return false;
}

function getLayoutName(runtime) {
  try {
    return String(runtime?.layout?.name || "");
  } catch (_) {
    return "";
  }
}

function isGameOver(runtime) {
  const gameOverText = getFirstInstance(runtime, "txt_gameover");
  const restartButton = getFirstInstance(runtime, "btn_restartGame");
  const restartButtonAlt = getFirstInstance(runtime, "btn_restart");
  try {
    if (canUseInstance(gameOverText) && gameOverText.isVisible) {
      return true;
    }
    if (canUseInstance(restartButton) && restartButton.isVisible) {
      return true;
    }
    if (canUseInstance(restartButtonAlt) && restartButtonAlt.isVisible) {
      return true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

function parseVisibleScore(runtime) {
  const scoreText = getFirstInstance(runtime, "txt_score");
  if (canUseInstance(scoreText)) {
    try {
      const txt = String(scoreText.text || "");
      const m = txt.match(/score[^0-9]*([0-9]+)/i);
      if (m) {
        return Number.parseInt(m[1], 10);
      }
      const all = txt.match(/[0-9]+/g);
      if (all && all.length) {
        return Number.parseInt(all[all.length - 1], 10);
      }
    } catch (_) {
      // continue
    }
  }
  return null;
}

function ensureHomeUi(runtime) {
  if (!canUseInstance(ui.home.connect)) {
    ui.home.connect = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
  if (!canUseInstance(ui.home.switchNetwork)) {
    ui.home.switchNetwork = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
  if (!canUseInstance(ui.home.username)) {
    ui.home.username = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
  if (!canUseInstance(ui.home.leaderboard)) {
    ui.home.leaderboard = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
  if (!canUseInstance(ui.home.status)) {
    ui.home.status = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
}

function clearHomeUi() {
  destroyInstance(ui.home.connect);
  destroyInstance(ui.home.switchNetwork);
  destroyInstance(ui.home.username);
  destroyInstance(ui.home.leaderboard);
  destroyInstance(ui.home.status);
  ui.home.connect = null;
  ui.home.switchNetwork = null;
  ui.home.username = null;
  ui.home.leaderboard = null;
  ui.home.status = null;
  state.hitboxes.homeConnect = null;
  state.hitboxes.homeSwitch = null;
  state.hitboxes.homeUsername = null;
  state.hitboxes.homeLeaderboard = null;
}

function ensureGameUi(runtime) {
  if (!canUseInstance(ui.game.submit)) {
    ui.game.submit = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
  if (!canUseInstance(ui.game.status)) {
    ui.game.status = createInstance(runtime, "txt_ver", "Hud", 0, 0);
  }
}

function clearGameUi() {
  destroyInstance(ui.game.submit);
  destroyInstance(ui.game.status);
  ui.game.submit = null;
  ui.game.status = null;
  state.hitboxes.gameSubmit = null;
}

function ensureBoardUi(runtime) {
  if (!canUseInstance(ui.board.bg)) {
    ui.board.bg = createInstance(runtime, "bgPaused", "Hud", 640, 360);
  }
  if (!canUseInstance(ui.board.title)) {
    ui.board.title = createInstance(runtime, "txt_paused", "Hud", 640, 120);
  }
  if (!canUseInstance(ui.board.rows)) {
    ui.board.rows = createInstance(runtime, "txt_credits", "Hud", 640, 180);
  }
  if (!canUseInstance(ui.board.close)) {
    ui.board.close = createInstance(runtime, "txt_infoBack", "Hud", 640, 638);
  }
}

function clearBoardUi() {
  destroyInstance(ui.board.bg);
  destroyInstance(ui.board.title);
  destroyInstance(ui.board.rows);
  destroyInstance(ui.board.close);
  ui.board.bg = null;
  ui.board.title = null;
  ui.board.rows = null;
  ui.board.close = null;
  state.hitboxes.boardClose = null;
}

function ensureModalUi(runtime) {
  if (!canUseInstance(ui.modal.bg)) {
    ui.modal.bg = createInstance(runtime, "bgPaused", "Hud", 640, 360);
  }
  if (!canUseInstance(ui.modal.title)) {
    ui.modal.title = createInstance(runtime, "txt_paused", "Hud", 640, 252);
  }
  if (!canUseInstance(ui.modal.input)) {
    ui.modal.input = createInstance(runtime, "txt_gotit", "Hud", 640, 330);
  }
  if (!canUseInstance(ui.modal.help)) {
    ui.modal.help = createInstance(runtime, "txt_infoBack", "Hud", 640, 392);
  }
  if (!canUseInstance(ui.modal.save)) {
    ui.modal.save = createInstance(runtime, "txt_ver", "Hud", 760, 458);
  }
  if (!canUseInstance(ui.modal.cancel)) {
    ui.modal.cancel = createInstance(runtime, "txt_ver", "Hud", 520, 458);
  }
}

function clearModalUi() {
  destroyInstance(ui.modal.bg);
  destroyInstance(ui.modal.title);
  destroyInstance(ui.modal.input);
  destroyInstance(ui.modal.help);
  destroyInstance(ui.modal.save);
  destroyInstance(ui.modal.cancel);
  ui.modal.bg = null;
  ui.modal.title = null;
  ui.modal.input = null;
  ui.modal.help = null;
  ui.modal.save = null;
  ui.modal.cancel = null;
  state.hitboxes.modalSave = null;
  state.hitboxes.modalCancel = null;
}

async function refreshWalletState() {
  const eth = getEthereum();
  if (!eth) {
    state.account = null;
    state.chainIdHex = null;
    return;
  }
  try {
    const accounts = await eth.request({ method: "eth_accounts" });
    state.account = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
  } catch (_) {
    state.account = null;
  }
  try {
    const chainId = await eth.request({ method: "eth_chainId" });
    state.chainIdHex = normalizeChainHex(chainId);
  } catch (_) {
    state.chainIdHex = null;
  }
}

function attachWalletListeners() {
  const eth = getEthereum();
  if (!eth || state.listenersAttached || typeof eth.on !== "function") {
    return;
  }
  state.listenersAttached = true;
  eth.on("accountsChanged", (accounts) => {
    state.account = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
    state.showLeaderboard = false;
    setStatus(state.account ? `Connected ${shortAddress(state.account)}.` : "Wallet disconnected.");
    if (state.account && !getConnectedUsername()) {
      setStatus("Set your username.", 6000);
    }
  });
  eth.on("chainChanged", (chainId) => {
    state.chainIdHex = normalizeChainHex(chainId);
    setStatus(isOnRise() ? "On Rise testnet." : `Network: ${state.chainIdHex || "unknown"}`);
  });
}

async function connectWalletCore() {
  const injected = typeof window !== "undefined" ? (window.ethereum || null) : null;
  let eth = injected;
  if (eth) {
    state.useRiseWallet = false;
  } else {
    setStatus("Opening Rise Wallet...");
    eth = await ensureRiseWalletProvider();
    if (eth) {
      state.useRiseWallet = true;
    }
  }
  if (!eth) {
    setStatus("No wallet found.");
    return false;
  }
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    state.account = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
    const chainId = await eth.request({ method: "eth_chainId" });
    state.chainIdHex = normalizeChainHex(chainId);
    setStatus(state.account ? `Connected ${shortAddress(state.account)}.` : "No account selected.");
    return !!state.account;
  } catch (err) {
    if (err && err.code === 4001) {
      setStatus("Wallet connection rejected.");
    } else {
      setStatus("Wallet connection failed.");
    }
    return false;
  }
}

async function connectWalletAction() {
  if (state.busy) {
    return;
  }
  state.busy = true;
  try {
    const ok = await connectWalletCore();
    if (ok && !getConnectedUsername()) {
      openUsernameModal();
    }
  } finally {
    state.busy = false;
  }
}

async function switchNetworkCore() {
  let eth = getEthereum();
  if (!eth && state.useRiseWallet) {
    eth = await ensureRiseWalletProvider();
  }
  if (!eth) {
    setStatus("No wallet found.");
    return false;
  }
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: WEB3.chainIdHex }],
    });
  } catch (err) {
    const addNeeded = err && (err.code === 4902 || String(err.message || "").toLowerCase().includes("unrecognized"));
    if (!addNeeded) {
      setStatus("Network switch failed.");
      return false;
    }
    try {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: WEB3.chainIdHex,
          chainName: WEB3.chainName,
          rpcUrls: [WEB3.rpcUrl],
          blockExplorerUrls: ["https://explorer.testnet.riselabs.xyz"],
          nativeCurrency: { name: "RISE Testnet Ether", symbol: "ETH", decimals: 18 },
        }],
      });
    } catch (_) {
      setStatus("Could not add Rise testnet.");
      return false;
    }
  }
  try {
    const chainId = await eth.request({ method: "eth_chainId" });
    state.chainIdHex = normalizeChainHex(chainId);
  } catch (_) {
    // best effort
  }
  setStatus(isOnRise() ? "Switched to Rise testnet." : "Switch done, but wrong chain.");
  return isOnRise();
}

async function switchNetworkAction() {
  if (state.busy) {
    return;
  }
  state.busy = true;
  try {
    await switchNetworkCore();
  } finally {
    state.busy = false;
  }
}

async function rpcCall(method, params) {
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params: params || [],
  };
  const response = await fetch(WEB3.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("RPC request failed.");
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(String(data.error.message || "RPC error"));
  }
  return data.result;
}

async function ethCall(data) {
  const callParams = [{ to: WEB3.contractAddress, data }, "latest"];
  try {
    return await rpcCall("eth_call", callParams);
  } catch (err) {
    const eth = getEthereum();
    if (!eth) {
      throw err;
    }
    return await eth.request({ method: "eth_call", params: callParams });
  }
}

function decodeLegacyLeaderboard(rawHex) {
  const hex = String(rawHex || "").replace(/^0x/, "");
  if (!hex || hex.length < 128) {
    return [];
  }
  const word = (index) => hex.slice(index * 64, (index + 1) * 64);
  const offsetWords = Number(toBigIntWord(word(0)) / 32n);
  const length = Number(toBigIntWord(word(offsetWords)));
  const rows = [];
  const start = offsetWords + 1;
  for (let i = 0; i < length; i += 1) {
    const addrWord = word(start + i * 2);
    const scoreWord = word(start + i * 2 + 1);
    if (!addrWord || !scoreWord) {
      break;
    }
    const wallet = `0x${addrWord.slice(24)}`;
    const bestScore = Number(toBigIntWord(scoreWord));
    rows.push({ wallet, bestScore });
  }
  rows.sort((a, b) => b.bestScore - a.bestScore);
  return rows.slice(0, 20);
}

async function fetchLeaderboard() {
  state.leaderboardLoading = true;
  try {
    const raw = await ethCall(`0x${WEB3.selectors.getLeaderboard}`);
    const rows = decodeLegacyLeaderboard(raw);
    state.leaderboardRows = rows.map((row, i) => ({
      rank: i + 1,
      wallet: row.wallet,
      username: getUsernameFor(row.wallet) || "Anon",
      bestScore: row.bestScore,
    }));
    if (!state.leaderboardRows.length) {
      setStatus("Leaderboard is empty.");
    }
  } catch (err) {
    state.leaderboardRows = [];
    setStatus(`Leaderboard read failed: ${String(err.message || err)}`, 7000);
  } finally {
    state.leaderboardLoading = false;
  }
}

function openUsernameModal() {
  if (!state.account) {
    setStatus("Connect wallet first.");
    return;
  }
  state.modal.active = true;
  state.modal.value = getConnectedUsername() || "";
  state.modal.error = "";
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (state.dom.modalInput && typeof state.dom.modalInput.focus === "function") {
        state.dom.modalInput.focus();
      }
    }, 0);
  }
}

function closeUsernameModal() {
  state.modal.active = false;
  state.modal.value = "";
  state.modal.error = "";
}

function saveUsernameFromModal() {
  try {
    const valid = validateUsername(state.modal.value);
    setUsernameFor(state.account, valid);
    setStatus(`Username set: ${valid}`);
    closeUsernameModal();
  } catch (err) {
    state.modal.error = String(err.message || err);
  }
}

function encodeSubmitScore(score) {
  const value = BigInt(score).toString(16).padStart(64, "0");
  return `0x${WEB3.selectors.submitScore}${value}`;
}

async function waitForReceipt(txHash, timeoutMs) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    try {
      const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
      if (receipt) {
        return receipt;
      }
    } catch (_) {
      // keep polling
    }
    await sleep(1500);
  }
  return null;
}

async function submitScoreAction(runtime) {
  if (state.busy) {
    setStatus("Please wait, previous action still in progress.");
    return;
  }
  let eth = getEthereum();
  if (!eth) {
    eth = await ensureRiseWalletProvider();
    if (eth) {
      state.useRiseWallet = true;
    }
  }
  if (!eth) {
    setStatus("No wallet found.");
    return;
  }

  const runtimeRef = runtime || state.dom.runtimeRef;
  let score = parseVisibleScore(runtimeRef);
  if ((!Number.isFinite(score) || score <= 0) && Number.isFinite(state.lastVisibleScore)) {
    score = state.lastVisibleScore;
  }
  if (!Number.isFinite(score) || score <= 0) {
    setStatus("Could not read a valid score.");
    return;
  }

  state.busy = true;
  try {
    if (!state.account) {
      const connected = await connectWalletCore();
      if (!connected) {
        return;
      }
    }
    if (!isOnRise()) {
      const switched = await switchNetworkCore();
      if (!switched) {
        return;
      }
    }
    eth = getEthereum() || eth;
    if (!eth) {
      setStatus("Wallet provider unavailable.");
      return;
    }

    const txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from: state.account,
        to: WEB3.contractAddress,
        value: "0x0",
        data: encodeSubmitScore(score),
      }],
    });
    state.lastTxHash = txHash;
    setStatus(`Submitted tx ${shortHash(txHash)}.`);

    const receipt = await waitForReceipt(txHash, 90000);
    if (receipt && receipt.status === "0x1") {
      setStatus(`Score submitted on-chain. ${shortHash(txHash)}`);
    } else if (receipt) {
      setStatus("Transaction reverted.");
    } else {
      setStatus(`Pending confirmation: ${shortHash(txHash)}`);
    }
  } catch (err) {
    if (err && err.code === 4001) {
      setStatus("Transaction rejected.");
    } else {
      setStatus(`Submit failed: ${String(err.message || err)}`);
    }
  } finally {
    state.busy = false;
  }
}

function buildLeaderboardLines() {
  if (state.leaderboardLoading) {
    return "Loading top 20 from chain...";
  }
  if (!state.leaderboardRows.length) {
    return "No entries yet.";
  }
  const rows = ["RANK   USERNAME            WALLET            BEST"];
  for (let i = 0; i < 20; i += 1) {
    const row = state.leaderboardRows[i];
    if (!row) {
      rows.push(`${String(i + 1).padEnd(6)}${"-".padEnd(20)}${"-".padEnd(18)}-`);
      continue;
    }
    const rank = String(row.rank).padEnd(6);
    const username = String(row.username || "Anon").slice(0, 18).padEnd(20);
    const wallet = shortAddress(row.wallet).padEnd(18);
    const best = String(Math.max(0, Math.floor(row.bestScore || 0)));
    rows.push(`${rank}${username}${wallet}${best}`);
  }
  return rows.join("\n");
}

function updateHomeUi(runtime) {
  ensureHomeUi(runtime);
  const vp = getViewport(ui.home.connect, { left: 0, top: 0, right: 1280, bottom: 720 });
  const x = vp.right - 190;
  const y0 = vp.top + 96;
  const rowGap = 34;
  const btnW = 260;
  const btnH = 32;

  const connectText = state.account
    ? `CONNECTED ${shortAddress(state.account).toUpperCase()}`
    : "CONNECT WALLET";
  const networkText = isOnRise() ? "RISE READY" : "SWITCH NETWORK";
  const usernameText = getConnectedUsername() ? "EDIT USERNAME" : "SET USERNAME";

  styleText(ui.home.connect, {
    text: connectText,
    x,
    y: y0,
    width: btnW,
    height: btnH,
    sizePt: 16,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.home.switchNetwork, {
    text: networkText,
    x,
    y: y0 + rowGap,
    width: btnW,
    height: btnH,
    sizePt: 16,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.home.username, {
    text: usernameText,
    x,
    y: y0 + rowGap * 2,
    width: btnW,
    height: btnH,
    sizePt: 16,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.home.leaderboard, {
    text: "VIEW TOP 20",
    x,
    y: y0 + rowGap * 3,
    width: btnW,
    height: btnH,
    sizePt: 16,
    alignH: "center",
    alignV: "center",
    visible: true,
  });

  const walletLine = `Wallet: ${shortAddress(state.account)}`;
  const networkLine = `Network: ${isOnRise() ? WEB3.chainName : (state.chainIdHex || "unknown")}`;
  const usernameLine = `Username: ${getConnectedUsername() || "not set"}`;
  const statusLine = getStatus() || "Tip: connect, switch, set username.";
  styleText(ui.home.status, {
    text: `${walletLine}\n${networkLine}\n${usernameLine}\n${statusLine}`,
    x: vp.right - 16,
    y: y0 + rowGap * 4 + 6,
    width: 520,
    height: 120,
    sizePt: 12,
    alignH: "right",
    alignV: "top",
    visible: true,
  });

  state.hitboxes.homeConnect = makeHitboxFromLayerRect(x, y0, btnW, btnH, vp);
  state.hitboxes.homeSwitch = makeHitboxFromLayerRect(x, y0 + rowGap, btnW, btnH, vp);
  state.hitboxes.homeUsername = makeHitboxFromLayerRect(x, y0 + rowGap * 2, btnW, btnH, vp);
  state.hitboxes.homeLeaderboard = makeHitboxFromLayerRect(x, y0 + rowGap * 3, btnW, btnH, vp);
}

function updateGameUi(runtime) {
  ensureGameUi(runtime);
  const over = isGameOver(runtime);

  if (!over) {
    styleText(ui.game.submit, { visible: false });
    styleText(ui.game.status, { visible: false });
    state.hitboxes.gameSubmit = null;
    if (state.showLeaderboard) {
      state.showLeaderboard = false;
      clearBoardUi();
    }
    return;
  }

  const vp = getViewport(ui.game.submit, { left: 0, top: 0, right: 1280, bottom: 720 });
  const cx = (vp.left + vp.right) / 2;
  const by = vp.top + (vp.bottom - vp.top) * 0.63;
  const score = parseVisibleScore(runtime);

  styleText(ui.game.submit, {
    text: "SUBMIT SCORE",
    x: cx + 180,
    y: by,
    width: 360,
    height: 44,
    sizePt: 22,
    alignH: "center",
    alignV: "center",
    visible: true,
  });

  const scoreLine = `Score: ${Number.isFinite(score) ? String(score) : "unknown"}`;
  const walletLine = `Wallet: ${shortAddress(state.account)}`;
  const networkLine = `Network: ${isOnRise() ? WEB3.chainName : (state.chainIdHex || "unknown")}`;
  const txLine = state.lastTxHash ? `Last tx: ${shortHash(state.lastTxHash)}` : (getStatus() || "Tap submit to write on-chain.");
  styleText(ui.game.status, {
    text: `${scoreLine}\n${walletLine}\n${networkLine}\n${txLine}`,
    x: cx,
    y: by + 66,
    width: 780,
    height: 120,
    sizePt: 12,
    alignH: "center",
    alignV: "top",
    visible: true,
  });

  state.hitboxes.gameSubmit = makeHitboxFromLayerRect(cx + 180, by, 360, 44, vp);
}

function updateBoardUi(runtime, isVisible) {
  if (!isVisible) {
    state.hitboxes.boardClose = null;
    clearBoardUi();
    return;
  }
  ensureBoardUi(runtime);
  styleSprite(ui.board.bg, {
    x: 640,
    y: 360,
    width: 1180,
    height: 620,
    opacity: 85,
    visible: true,
  });
  styleText(ui.board.title, {
    text: "TOP 20 LEADERBOARD",
    x: 640,
    y: 106,
    width: 900,
    height: 54,
    sizePt: 30,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.board.rows, {
    text: buildLeaderboardLines(),
    x: 640,
    y: 170,
    width: 1040,
    height: 420,
    sizePt: 12,
    alignH: "left",
    alignV: "top",
    visible: true,
  });
  styleText(ui.board.close, {
    text: "CLOSE",
    x: 640,
    y: 640,
    width: 220,
    height: 36,
    sizePt: 18,
    alignH: "center",
    alignV: "center",
    visible: true,
  });

  const vp = getViewport(ui.board.close, { left: 0, top: 0, right: 1280, bottom: 720 });
  state.hitboxes.boardClose = makeHitboxFromLayerRect(640, 640, 220, 36, vp);
}

function updateModalUi(runtime, isVisible) {
  if (!isVisible) {
    state.hitboxes.modalSave = null;
    state.hitboxes.modalCancel = null;
    clearModalUi();
    return;
  }
  ensureModalUi(runtime);
  styleSprite(ui.modal.bg, {
    x: 640,
    y: 360,
    width: 900,
    height: 420,
    opacity: 92,
    visible: true,
  });
  styleText(ui.modal.title, {
    text: "SET USERNAME",
    x: 640,
    y: 252,
    width: 500,
    height: 56,
    sizePt: 32,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.modal.input, {
    text: state.modal.value || "Type username...",
    x: 640,
    y: 330,
    width: 700,
    height: 56,
    sizePt: 22,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.modal.help, {
    text: state.modal.error || "3-20 chars. Letters, numbers, spaces, underscore. Enter=Save Esc=Cancel",
    x: 640,
    y: 394,
    width: 760,
    height: 54,
    sizePt: 12,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.modal.cancel, {
    text: "CANCEL",
    x: 520,
    y: 458,
    width: 220,
    height: 40,
    sizePt: 18,
    alignH: "center",
    alignV: "center",
    visible: true,
  });
  styleText(ui.modal.save, {
    text: "SAVE",
    x: 760,
    y: 458,
    width: 220,
    height: 40,
    sizePt: 18,
    alignH: "center",
    alignV: "center",
    visible: true,
  });

  const vp = getViewport(ui.modal.save, { left: 0, top: 0, right: 1280, bottom: 720 });
  state.hitboxes.modalCancel = makeHitboxFromLayerRect(520, 458, 220, 40, vp);
  state.hitboxes.modalSave = makeHitboxFromLayerRect(760, 458, 220, 40, vp);
}

function clearAllUi() {
  clearHomeUi();
  clearGameUi();
  clearBoardUi();
  clearModalUi();
}

function updateTick(runtime) {
  const layoutName = getLayoutName(runtime);
  if (!layoutName) {
    return;
  }

  if (layoutName !== state.layoutName) {
    state.layoutName = layoutName;
    state.showLeaderboard = false;
    state.modal.active = false;
    clearAllUi();
  }
  clearAllUi();
  updateDomUi(runtime);
}

function handleModalKey(event) {
  if (!state.modal.active) {
    return false;
  }
  const key = String(event.key || "");
  const domInputFocused = typeof document !== "undefined" &&
    state.dom.modalInput &&
    document.activeElement === state.dom.modalInput;
  if (domInputFocused) {
    if (key === "Escape") {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      closeUsernameModal();
      return true;
    }
    if (key === "Enter") {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      state.modal.value = String(state.dom.modalInput.value || "");
      saveUsernameFromModal();
      return true;
    }
    // Let the real input element handle typing/backspace, but stop global hotkeys.
    return true;
  }
  if (key === "Escape") {
    closeUsernameModal();
    return true;
  }
  if (key === "Enter") {
    saveUsernameFromModal();
    return true;
  }
  if (key === "Backspace") {
    state.modal.value = state.modal.value.slice(0, -1);
    event.preventDefault();
    return true;
  }
  if (key.length !== 1) {
    return false;
  }
  if (!/[A-Za-z0-9_ ]/.test(key)) {
    return true;
  }
  if (state.modal.value.length >= 20) {
    return true;
  }
  state.modal.value += key;
  state.modal.error = "";
  return true;
}

function handleHotkeys(runtime, event) {
  if (handleModalKey(event)) {
    return;
  }
  const key = String(event.key || "").toLowerCase();
  const layoutName = getLayoutName(runtime);

  if (layoutName === "Main") {
    if (key === "c") {
      void connectWalletAction();
    } else if (key === "n") {
      void switchNetworkAction();
    } else if (key === "u") {
      openUsernameModal();
    } else if (key === "l") {
      state.showLeaderboard = !state.showLeaderboard;
      if (state.showLeaderboard) {
        void fetchLeaderboard();
      }
    }
  }

  if (layoutName === "Game" && isGameOver(runtime)) {
    if (key === "s") {
      void submitScoreAction(runtime);
    } else if (key === "l") {
      state.showLeaderboard = !state.showLeaderboard;
      if (state.showLeaderboard) {
        void fetchLeaderboard();
      }
    }
  }
}

function handlePointer(runtime, pointerEvent) {
  const layoutName = getLayoutName(runtime);
  if (!layoutName) {
    return false;
  }

  if (state.modal.active) {
    if (pointInRect(pointerEvent, state.hitboxes.modalSave) || hitInstance(ui.modal.save, pointerEvent)) {
      saveUsernameFromModal();
      return true;
    }
    if (
      pointInRect(pointerEvent, state.hitboxes.modalCancel) ||
      hitInstance(ui.modal.cancel, pointerEvent) ||
      hitInstance(ui.modal.bg, pointerEvent)
    ) {
      closeUsernameModal();
      return true;
    }
  }

  if (state.showLeaderboard) {
    if (pointInRect(pointerEvent, state.hitboxes.boardClose) || hitInstance(ui.board.close, pointerEvent)) {
      state.showLeaderboard = false;
      return true;
    }
  }

  if (layoutName === "Main") {
    if (pointInRect(pointerEvent, state.hitboxes.homeConnect) || hitInstance(ui.home.connect, pointerEvent)) {
      void connectWalletAction();
      return true;
    }
    if (pointInRect(pointerEvent, state.hitboxes.homeSwitch) || hitInstance(ui.home.switchNetwork, pointerEvent)) {
      void switchNetworkAction();
      return true;
    }
    if (pointInRect(pointerEvent, state.hitboxes.homeUsername) || hitInstance(ui.home.username, pointerEvent)) {
      openUsernameModal();
      return true;
    }
    if (pointInRect(pointerEvent, state.hitboxes.homeLeaderboard) || hitInstance(ui.home.leaderboard, pointerEvent)) {
      state.showLeaderboard = !state.showLeaderboard;
      if (state.showLeaderboard) {
        void fetchLeaderboard();
      }
      return true;
    }
  }

  if (layoutName === "Game" && isGameOver(runtime)) {
    if (pointInRect(pointerEvent, state.hitboxes.gameSubmit) || hitInstance(ui.game.submit, pointerEvent)) {
      void submitScoreAction(runtime);
      return true;
    }
  }
  return false;
}

runOnStartup(async (runtime) => {
  if (typeof document !== "undefined") {
    document.title = "Mr. Rise";
  }
  state.usernameMap = loadUsernameMap();
  runtime.addEventListener("tick", () => updateTick(runtime));

  if (typeof document !== "undefined") {
    const pointerHandler = (event) => {
      const p = normalizeInputEvent(event);
      if (!p) {
        return;
      }
      const handled = handlePointer(runtime, p);
      if (handled && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (handled && typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
    };
    const pointerTarget = getCanvasElement() || document;
    pointerTarget.addEventListener("pointerdown", pointerHandler, { capture: true });
    pointerTarget.addEventListener("mousedown", pointerHandler, { capture: true });
    pointerTarget.addEventListener("touchstart", pointerHandler, { passive: false, capture: true });
    pointerTarget.addEventListener("click", pointerHandler, { capture: true });
    document.addEventListener("keydown", (event) => handleHotkeys(runtime, event), { capture: true });
  }

  try {
    await refreshWalletState();
    attachWalletListeners();
  } catch (err) {
    console.warn("[MR RISE] Wallet startup failed:", err);
  }
});
