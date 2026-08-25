const SUPABASE_URL = "https://wddfqmghzjsnqkjssswb.supabase.co";
const SUPABASE_KEY = "sb_publishable_5CHpxUbWndV20eafCq4pNw_ChUAI94E";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// STATE
// ============================================================

let currentUserId = null;

let currentPartyId = null;
let currentPartyName = null;
let currentHostUserId = null;
let currentStage = null;

let currentPartyIsHost = false;
let currentPlayerId = null;

let currentPlayers = [];

// Blind pizza information:
//
// id
// label
// is_mine
// created_at
let currentPizzas = [];

// Private information about current user's pizzas:
//
// id
// label
// restaurant
// actual_price_tier
// created_at
let currentMyPizzas = [];

let currentEditingPizzaId = null;

let currentRatings = new Map();

let currentGuesses = new Map();

let currentVotingDone = false;
let currentVotingOnly = false;

let currentRestaurantChoices = [];

let currentPlannedPizzaCount = 0;

let currentBlindingRound = null;
let currentBlindingIsMyTurn = false;
let currentBlindingLabels = [];

let selectedRatingPizzaId = null;

let pendingInviteToken = null;

let pendingTransferToken = null;

let pendingTransferredInviteToken = null;

let partyChannel = null;

let settingsReturnScreen = "home-screen";

const PARTY_STORAGE_KEY = "pizzaParty:lastPartyId";

const THEME_STORAGE_KEY = "pizzaParty:theme";

const PRICE_TIERS = new Set(["$", "$$", "$$$"]);

const screens = [
  "home-screen",
  "invite-screen",
  "settings-screen",
  "lobby-screen",
  "pizza-screen",
  "blinding-screen",
  "tasting-screen",
  "voting-screen",
  "results-screen",
];

// ============================================================
// BASIC UI
// ============================================================

function showScreen(screenId) {
  screens.forEach((id) => {
    document.getElementById(id)?.classList.add("hidden");
  });

  document.getElementById(screenId)?.classList.remove("hidden");
}

function getVisibleScreenId() {
  return (
    screens.find((id) => {
      const element = document.getElementById(id);

      return element && !element.classList.contains("hidden");
    }) || "home-screen"
  );
}

function makeElement(tag, className = "", text = "") {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = text;
  }

  return element;
}

function setText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text || "";
  }
}

function normalized(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function shortPizzaLabel(label) {
  return String(label ?? "")
    .replace(/^Pizza\s+/i, "")
    .trim();
}

function clearMessages() {
  [
    "create-error",
    "invite-error",
    "invite-link-message",
    "lobby-error",
    "pizza-error",
    "blinding-message",
    "rating-message",
    "transfer-create-message",
    "transfer-claim-message",
  ].forEach((id) => {
    setText(id, "");
  });
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return Number(value).toFixed(2).replace(/\.00$/, ".0");
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return (
    values.reduce((total, value) => total + Number(value), 0) / values.length
  );
}

// ============================================================
// THEME
// ============================================================

function getSavedTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "system";
}

function getActualTheme(preference) {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return preference;
}

function applyTheme(preference, save = true) {
  const actualTheme = getActualTheme(preference);

  document.documentElement.setAttribute("data-theme", actualTheme);

  if (save) {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }

  document
    .getElementById("theme-color-meta")
    ?.setAttribute("content", actualTheme === "dark" ? "#161412" : "#fff8ed");

  [
    ["theme-light-button", "light"],
    ["theme-dark-button", "dark"],
    ["theme-system-button", "system"],
  ].forEach(([id, value]) => {
    document
      .getElementById(id)
      ?.classList.toggle("selected", preference === value);
  });
}

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (getSavedTheme() === "system") {
      applyTheme("system", false);
    }
  });

// ============================================================
// SETTINGS
// ============================================================

function openSettings() {
  clearMessages();

  const visible = getVisibleScreenId();

  if (visible !== "settings-screen") {
    settingsReturnScreen = visible;
  }

  document
    .getElementById("create-transfer-section")
    ?.classList.toggle("hidden", !currentPartyId);

  applyTheme(getSavedTheme(), false);

  showScreen("settings-screen");

  if (pendingTransferToken) {
    const input = document.getElementById("transfer-input");

    if (input) {
      input.value = pendingTransferToken;
    }
  }
}

async function closeSettings() {
  if (currentPartyId) {
    await routePartyStage();

    return;
  }

  if (pendingInviteToken) {
    showScreen("invite-screen");

    return;
  }

  showScreen(settingsReturnScreen || "home-screen");
}

// ============================================================
// SCORE SELECTS
// ============================================================

function initializeScoreSelects() {
  ["crust-score", "sauce-score", "cheese-score"].forEach((id) => {
    const select = document.getElementById(id);

    if (!select) {
      return;
    }

    select.innerHTML = "";

    const blank = document.createElement("option");

    blank.value = "";

    blank.textContent = "Select";

    select.appendChild(blank);

    for (let score = 1; score <= 10; score++) {
      const option = document.createElement("option");

      option.value = String(score);

      option.textContent = String(score);

      select.appendChild(option);
    }

    select.addEventListener("change", updateOverallDisplay);
  });
}

// ============================================================
// OVERALL SCORE
// ============================================================

function calculateCurrentOverall() {
  const crust = Number(document.getElementById("crust-score")?.value);

  const sauce = Number(document.getElementById("sauce-score")?.value);

  const cheese = Number(document.getElementById("cheese-score")?.value);

  if (!crust || !sauce || !cheese) {
    return null;
  }

  return (crust + sauce + cheese) / 3;
}

function updateOverallDisplay() {
  const overall = calculateCurrentOverall();

  setText(
    "overall-score-display",
    overall === null ? "—" : `${overall.toFixed(2)} / 10`,
  );
}

// ============================================================
// URL TOKENS
// ============================================================

function readAccessTokensFromUrl() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const transfer = params.get("transfer");

  const invite = params.get("invite");

  if (transfer && /^[0-9a-f]{48}$/i.test(transfer)) {
    pendingTransferToken = transfer.toLowerCase();

    pendingInviteToken = null;

    if (invite && /^[0-9a-f]{48}$/i.test(invite)) {
      pendingTransferredInviteToken = invite.toLowerCase();
    }

    return;
  }

  if (invite && /^[0-9a-f]{48}$/i.test(invite)) {
    pendingInviteToken = invite.toLowerCase();
  }
}

function removeAccessTokensFromUrl() {
  history.replaceState(
    {},
    "",
    window.location.pathname + window.location.search,
  );
}

function inviteStorageKey(partyId) {
  return `pizzaParty:inviteToken:${partyId}`;
}

function buildInviteUrl(token) {
  return (
    window.location.origin +
    window.location.pathname +
    "#invite=" +
    encodeURIComponent(token)
  );
}

function buildTransferUrl(token) {
  const params = new URLSearchParams();

  params.set("transfer", token);

  /*
    If the current participant is the host, preserve the
    already-existing friend invitation during device transfer.
  */

  if (currentPartyIsHost && currentPartyId) {
    const invite = localStorage.getItem(inviteStorageKey(currentPartyId));

    if (invite && /^[0-9a-f]{48}$/i.test(invite)) {
      params.set("invite", invite);
    }
  }

  return (
    window.location.origin + window.location.pathname + "#" + params.toString()
  );
}

// ============================================================
// TRANSFER TOKEN PARSING
// ============================================================

function parseTransferInput(input) {
  const value = String(input || "").trim();

  if (/^[0-9a-f]{48}$/i.test(value)) {
    return {
      transferToken: value.toLowerCase(),

      inviteToken: null,
    };
  }

  try {
    const url = new URL(value);

    const params = new URLSearchParams(url.hash.replace(/^#/, ""));

    const transferToken = params.get("transfer");

    const inviteToken = params.get("invite");

    if (!transferToken || !/^[0-9a-f]{48}$/i.test(transferToken)) {
      return null;
    }

    return {
      transferToken: transferToken.toLowerCase(),

      inviteToken:
        inviteToken && /^[0-9a-f]{48}$/i.test(inviteToken)
          ? inviteToken.toLowerCase()
          : null,
    };
  } catch {
    return null;
  }
}

// ============================================================
// CLIPBOARD
// ============================================================

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);

    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = value;

  textarea.style.position = "fixed";

  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  textarea.select();

  document.execCommand("copy");

  textarea.remove();
}

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeApp() {
  initializeScoreSelects();

  applyTheme(getSavedTheme(), false);

  const status = document.getElementById("status");

  try {
    let {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
    }

    if (!session) {
      const { data, error } = await supabaseClient.auth.signInAnonymously();

      if (error) {
        throw error;
      }

      session = data.session;
    }

    if (!session?.user?.id) {
      throw new Error("Unable to create session.");
    }

    currentUserId = session.user.id;

    if (status) {
      status.textContent = "Connected securely ✓";
    }

    readAccessTokensFromUrl();

    if (pendingTransferToken) {
      settingsReturnScreen = "home-screen";

      openSettings();

      return;
    }

    if (pendingInviteToken) {
      showScreen("invite-screen");

      return;
    }

    const storedParty = localStorage.getItem(PARTY_STORAGE_KEY);

    if (storedParty) {
      const resumed = await enterParty(storedParty, false);

      if (resumed) {
        return;
      }
    }

    showScreen("home-screen");
  } catch (error) {
    console.error("Initialization error:", error);

    if (status) {
      status.textContent = "Unable to connect.";
    }
  }
}

// ============================================================
// DEVICE TRANSFER
// ============================================================

async function createDeviceTransfer() {
  clearMessages();

  if (!currentPartyId) {
    setText("transfer-create-message", "You are not currently in a party.");

    return;
  }

  const button = document.getElementById("copy-transfer-button");

  if (button) {
    button.disabled = true;

    button.textContent = "Creating Link...";
  }

  try {
    const { data, error } = await supabaseClient.rpc(
      "create_device_transfer_token",
      {
        p_party_id: currentPartyId,
      },
    );

    if (error) {
      throw error;
    }

    if (!data || !/^[0-9a-f]{48}$/i.test(data)) {
      throw new Error("Invalid transfer token.");
    }

    const url = buildTransferUrl(data);

    await copyText(url);

    setText(
      "transfer-create-message",
      "Private transfer link copied. It expires in 5 minutes and can only be used once.",
    );
  } catch (error) {
    console.error("Create transfer error:", error);

    setText(
      "transfer-create-message",
      error.message || "Unable to create transfer link.",
    );
  } finally {
    if (button) {
      button.disabled = false;

      button.textContent = "Copy Private Transfer Link";
    }
  }
}

async function claimDeviceTransfer() {
  clearMessages();

  const input = document.getElementById("transfer-input");

  const parsed = parseTransferInput(input?.value);

  if (!parsed) {
    setText("transfer-claim-message", "Enter a valid private transfer link.");

    return;
  }

  const button = document.getElementById("claim-transfer-button");

  if (button) {
    button.disabled = true;

    button.textContent = "Transferring...";
  }

  try {
    const { data, error } = await supabaseClient.rpc("claim_device_transfer", {
      p_token: parsed.transferToken,
    });

    if (error) {
      throw error;
    }

    const partyId = Array.isArray(data) ? data[0] : data;

    if (!partyId) {
      throw new Error("No party was returned.");
    }

    const invite = parsed.inviteToken || pendingTransferredInviteToken;

    if (invite) {
      localStorage.setItem(inviteStorageKey(partyId), invite);
    }

    localStorage.setItem(PARTY_STORAGE_KEY, partyId);

    pendingTransferToken = null;

    pendingTransferredInviteToken = null;

    pendingInviteToken = null;

    removeAccessTokensFromUrl();

    if (input) {
      input.value = "";
    }

    const entered = await enterParty(partyId);

    if (!entered) {
      throw new Error(
        "The session transferred, but the party could not be opened.",
      );
    }
  } catch (error) {
    console.error("Claim transfer error:", error);

    setText(
      "transfer-claim-message",
      error.message || "Unable to transfer this session.",
    );
  } finally {
    if (button) {
      button.disabled = false;

      button.textContent = "Transfer to This Device";
    }
  }
}

// ============================================================
// CREATE PARTY
// ============================================================

async function createParty() {
  clearMessages();

  const partyName = document.getElementById("party-name")?.value.trim();

  const playerName = document.getElementById("host-name")?.value.trim();

  if (!partyName || !playerName) {
    setText("create-error", "Enter a party name and your name.");

    return;
  }

  const button = document.getElementById("create-party-button");

  if (button) {
    button.disabled = true;

    button.textContent = "Creating...";
  }

  try {
    const { data, error } = await supabaseClient.rpc("create_party_v2", {
      party_name: partyName,

      player_name: playerName,
    });

    if (error) {
      throw error;
    }

    const party = Array.isArray(data) ? data[0] : data;

    if (!party?.party_id || !party?.invite_token) {
      throw new Error("Invalid party response.");
    }

    localStorage.setItem(inviteStorageKey(party.party_id), party.invite_token);

    await enterParty(party.party_id);
  } catch (error) {
    console.error("Create party error:", error);

    setText("create-error", error.message || "Unable to create party.");
  } finally {
    if (button) {
      button.disabled = false;

      button.textContent = "Create Party";
    }
  }
}

// ============================================================
// JOIN PARTY
// ============================================================

async function joinFromInvite() {
  clearMessages();

  const name = document.getElementById("invite-player-name")?.value.trim();

  if (!name) {
    setText("invite-error", "Enter your name.");

    return;
  }

  if (!pendingInviteToken) {
    setText("invite-error", "This invitation is invalid.");

    return;
  }

  const button = document.getElementById("join-invite-button");

  if (button) {
    button.disabled = true;

    button.textContent = "Joining...";
  }

  try {
    const { data, error } = await supabaseClient.rpc("join_party_by_invite", {
      p_invite_token: pendingInviteToken,

      p_player_name: name,
    });

    if (error) {
      throw error;
    }

    const party = Array.isArray(data) ? data[0] : data;

    if (!party?.party_id) {
      throw new Error("Unable to join party.");
    }

    pendingInviteToken = null;

    removeAccessTokensFromUrl();

    await enterParty(party.party_id);
  } catch (error) {
    console.error("Join error:", error);

    setText(
      "invite-error",
      "The invitation is invalid or the party has already started.",
    );
  } finally {
    if (button) {
      button.disabled = false;

      button.textContent = "Join Party";
    }
  }
}

// ============================================================
// ENTER PARTY
// ============================================================

async function enterParty(partyId, logErrors = true) {
  try {
    const { data: party, error } = await supabaseClient
      .from("parties")
      .select(
        `
            id,
            name,
            host_user_id,
            stage
          `,
      )
      .eq("id", partyId)
      .single();

    if (error || !party) {
      if (logErrors) {
        console.error("Party load error:", error);
      }

      localStorage.removeItem(PARTY_STORAGE_KEY);

      return false;
    }

    const { data: player, error: playerError } = await supabaseClient
      .from("players")
      .select(
        `
            id,
            voting_done_at,
            guessing_done_at,
            voting_only
          `,
      )
      .eq("party_id", party.id)
      .eq("user_id", currentUserId)
      .single();

    if (playerError || !player) {
      if (logErrors) {
        console.error("Membership load error:", playerError);
      }

      localStorage.removeItem(PARTY_STORAGE_KEY);

      return false;
    }

    currentPartyId = party.id;

    currentPartyName = party.name;

    currentHostUserId = party.host_user_id;

    currentStage = party.stage;

    currentPartyIsHost = party.host_user_id === currentUserId;

    currentPlayerId = player.id;

    currentVotingDone = Boolean(player.voting_done_at);
    currentVotingOnly = Boolean(player.voting_only);

    localStorage.setItem(PARTY_STORAGE_KEY, currentPartyId);

    subscribeToParty();

    await routePartyStage();

    return true;
  } catch (error) {
    console.error("Enter party error:", error);

    localStorage.removeItem(PARTY_STORAGE_KEY);

    return false;
  }
}

// ============================================================
// REFRESH PARTY
// ============================================================

async function refreshPartyState() {
  if (!currentPartyId) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("parties")
    .select(
      `
          name,
          host_user_id,
          stage
        `,
    )
    .eq("id", currentPartyId)
    .single();

  if (error || !data) {
    console.error("Party refresh error:", error);

    return;
  }

  const previousStage = currentStage;

  currentPartyName = data.name;

  currentHostUserId = data.host_user_id;

  currentPartyIsHost = data.host_user_id === currentUserId;

  currentStage = data.stage;

  if (previousStage !== currentStage) {
    await routePartyStage();
  }
}

// ============================================================
// STAGE ROUTING
// ============================================================

async function routePartyStage() {
  if (currentStage === "lobby") {
    await openLobby();
    return;
  }

  if (currentStage === "blinding1" || currentStage === "blinding2") {
    await openBlinding();
    return;
  }

  if (currentStage === "tasting") {
    await openTasting();
    return;
  }

  // New parties stay in "voting" until reveal. If an older party is
  // already in the legacy "guessing" stage, use the same combined screen.
  if (currentStage === "voting" || currentStage === "guessing") {
    await openVoting();
    return;
  }

  if (currentStage === "revealed") {
    await openResults();
  }
}

// ============================================================
// REALTIME
// ============================================================

function subscribeToParty() {
  if (!currentPartyId) {
    return;
  }

  if (partyChannel) {
    supabaseClient.removeChannel(partyChannel);
  }

  partyChannel = supabaseClient
    .channel(`party-${currentPartyId}`)

    .on(
      "postgres_changes",
      {
        event: "UPDATE",

        schema: "public",

        table: "parties",

        filter: `id=eq.${currentPartyId}`,
      },

      async () => {
        await refreshPartyState();
      },
    )

    .on(
      "postgres_changes",
      {
        event: "*",

        schema: "public",

        table: "players",

        filter: `party_id=eq.${currentPartyId}`,
      },

      async () => {
        await handlePlayerChange();
      },
    )

    .on(
      "postgres_changes",
      {
        event: "*",

        schema: "public",

        table: "pizzas",

        filter: `party_id=eq.${currentPartyId}`,
      },

      async () => {
        if (currentStage === "lobby") {
          await openLobby();
        }
      },
    )

    .subscribe();
}

// ============================================================
// REALTIME PLAYER CHANGES
// ============================================================

async function handlePlayerChange() {
  if (currentStage === "lobby") {
    await Promise.all([loadPlayers(), loadMyVotingOnly()]);
    renderMyPizzas();

    if (currentPartyIsHost) {
      await loadHostProgress("lobby");
    }

    return;
  }

  if (
    (currentStage === "voting" || currentStage === "guessing") &&
    currentPartyIsHost
  ) {
    await loadHostProgress("voting");
  }
}

// ============================================================
// FRIEND INVITE
// ============================================================

function getStoredInviteToken() {
  if (!currentPartyId) {
    return null;
  }

  const token = localStorage.getItem(inviteStorageKey(currentPartyId));

  return token && /^[0-9a-f]{48}$/i.test(token) ? token.toLowerCase() : null;
}

async function copyInviteLink() {
  clearMessages();

  const token = getStoredInviteToken();

  if (!token) {
    setText(
      "invite-link-message",
      "The original invite link is not stored on this device. Replace it only if you want the existing link to stop working.",
    );

    return;
  }

  try {
    await copyText(buildInviteUrl(token));

    setText("invite-link-message", "Friend invite link copied.");
  } catch (error) {
    console.error("Copy invite error:", error);

    setText("invite-link-message", "Unable to copy invite link.");
  }
}

async function rotateInviteLink() {
  const confirmed = window.confirm(
    "Replace the friend invitation link? The existing link will stop working.",
  );

  if (!confirmed) {
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc("rotate_party_invite", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    localStorage.setItem(inviteStorageKey(currentPartyId), data);

    await copyText(buildInviteUrl(data));

    setText(
      "invite-link-message",
      "New friend invite copied. The previous invite no longer works.",
    );
  } catch (error) {
    console.error("Rotate invite error:", error);

    setText(
      "invite-link-message",
      error.message || "Unable to replace invite link.",
    );
  }
}

// ============================================================
// LOBBY
// ============================================================

async function openLobby() {
  clearMessages();

  setText("lobby-party-name", currentPartyName);

  document
    .getElementById("invite-controls")
    ?.classList.toggle("hidden", !currentPartyIsHost);

  document
    .getElementById("lobby-host-progress")
    ?.classList.toggle("hidden", !currentPartyIsHost);

  showScreen("lobby-screen");

  await Promise.all([
    loadPlayers(),
    loadMyPizzas(),
    loadMyVotingOnly(),
    loadPlannedPizzas(),
  ]);

  renderMyPizzas();

  if (currentPartyIsHost) {
    await loadHostProgress("lobby");
  }
}

// ============================================================
// PLAYERS
// ============================================================

async function loadPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select(
      `
          id,
          user_id,
          display_name,
          voting_only,
          created_at
        `,
    )
    .eq("party_id", currentPartyId)
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    console.error("Player load error:", error);

    return;
  }

  currentPlayers = data || [];

  setText("player-count", String(currentPlayers.length));

  const container = document.getElementById("player-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  currentPlayers.forEach((player) => {
    const row = makeElement("div", "player-row");

    row.appendChild(makeElement("div", "row-primary", player.display_name));

    const badges = makeElement("div", "badges");

    if (player.user_id === currentHostUserId) {
      badges.appendChild(makeElement("span", "badge host", "HOST"));
    }

    if (player.user_id === currentUserId) {
      badges.appendChild(makeElement("span", "badge you", "YOU"));
    }

    if (player.voting_only) {
      badges.appendChild(makeElement("span", "badge", "VOTING ONLY"));
    }

    row.appendChild(badges);

    container.appendChild(row);
  });
}

// ============================================================
// MY PARTICIPATION MODE
// ============================================================

async function loadMyVotingOnly() {
  if (!currentPlayerId) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("players")
    .select("voting_only")
    .eq("id", currentPlayerId)
    .single();

  if (error || !data) {
    console.error("Participation mode load error:", error);
    return;
  }

  currentVotingOnly = Boolean(data.voting_only);
}

async function setMyVotingOnly(votingOnly) {
  const { error } = await supabaseClient.rpc("set_my_voting_only", {
    p_party_id: currentPartyId,
    p_voting_only: Boolean(votingOnly),
  });

  if (error) {
    throw error;
  }

  currentVotingOnly = Boolean(votingOnly);
}

async function chooseVotingOnly() {
  clearMessages();

  const button = document.getElementById("voting-only-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    await setMyVotingOnly(true);
    renderMyPizzas();

    if (currentPartyIsHost) {
      await loadHostProgress("lobby");
    }
  } catch (error) {
    console.error("Voting-only error:", error);
    setText(
      "lobby-error",
      error.message || "Unable to update your participation choice.",
    );
  } finally {
    renderMyPizzas();
  }
}

async function startAddingPizza() {
  clearMessages();

  try {
    if (currentVotingOnly) {
      await setMyVotingOnly(false);

      if (currentPartyIsHost) {
        await loadHostProgress("lobby");
      }
    }

    openPizzaEditor();
  } catch (error) {
    console.error("Participation mode error:", error);
    setText(
      "lobby-error",
      error.message || "Unable to switch to bringing a pizza.",
    );
  }
}

// ============================================================
// PRIVATE MY-PIZZA DATA
// ============================================================

async function loadMyPizzas() {
  if (!currentPartyId) {
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_my_pizzas", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Unable to load my pizzas:", error);

    return;
  }

  currentMyPizzas = data || [];

  renderMyPizzas();
}

// ============================================================
// RENDER MY PIZZAS
// ============================================================

function renderMyPizzas() {
  const container = document.getElementById("my-pizza-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  setText("my-pizza-count", String(currentMyPizzas.length));

  const participationStatus = document.getElementById("participation-status");
  const votingOnlyButton = document.getElementById("voting-only-button");
  const addPizzaButton = document.getElementById("add-pizza-button");

  if (currentMyPizzas.length > 0) {
    if (participationStatus) {
      participationStatus.textContent =
        currentMyPizzas.length === 1
          ? "You're bringing 1 pizza and will also vote on every pizza."
          : `You're bringing ${currentMyPizzas.length} pizzas and will also vote on every pizza.`;
    }

    votingOnlyButton?.classList.add("hidden");

    if (addPizzaButton) {
      addPizzaButton.textContent = "Add Another Pizza";
    }
  } else if (currentVotingOnly) {
    if (participationStatus) {
      participationStatus.textContent =
        "You're voting only. You'll still rate, price-guess, and restaurant-match every pizza.";
    }

    votingOnlyButton?.classList.remove("hidden");

    if (votingOnlyButton) {
      votingOnlyButton.disabled = true;
      votingOnlyButton.textContent = "Voting Only ✓";
    }

    if (addPizzaButton) {
      addPizzaButton.textContent = "Bring a Pizza Instead";
    }
  } else {
    if (participationStatus) {
      participationStatus.textContent =
        "Bringing a pizza is optional. Add one, or choose Voting Only if you're just here to taste and rank.";
    }

    votingOnlyButton?.classList.remove("hidden");

    if (votingOnlyButton) {
      votingOnlyButton.disabled = false;
      votingOnlyButton.textContent = "I'm Voting Only";
    }

    if (addPizzaButton) {
      addPizzaButton.textContent = "Add Pizza";
    }
  }

  if (currentMyPizzas.length === 0) {
    container.appendChild(
      makeElement("div", "empty-state", "You have not added a pizza."),
    );

    return;
  }

  currentMyPizzas.forEach((pizza) => {
    const row = makeElement("div", "my-pizza-row");

    const info = makeElement("div", "my-pizza-info");

    info.appendChild(makeElement("div", "my-pizza-label", pizza.label));

    info.appendChild(makeElement("div", "row-primary", pizza.restaurant));

    info.appendChild(
      makeElement(
        "div",
        pizza.actual_price_tier ? "my-pizza-price" : "my-pizza-price missing",
        pizza.actual_price_tier
          ? `Actual price tier: ${pizza.actual_price_tier}`
          : "Actual price tier: Not set",
      ),
    );

    const actions = makeElement("div", "my-pizza-actions");

    const editButton = makeElement("button", "", "Edit");

    editButton.type = "button";

    editButton.addEventListener("click", () => {
      openPizzaEditor(pizza.id);
    });

    actions.appendChild(editButton);

    row.appendChild(info);

    row.appendChild(actions);

    container.appendChild(row);
  });
}

// ============================================================
// PUBLIC PLANNING RESTAURANTS
// ============================================================

async function loadPlannedPizzas() {
  const { data, error } = await supabaseClient.rpc("get_planned_pizzas", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Planned pizza error:", error);

    return;
  }

  const pizzas = data || [];

  currentPlannedPizzaCount = pizzas.length;

  setText("planned-pizza-count", String(pizzas.length));

  const container = document.getElementById("planned-pizza-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!pizzas.length) {
    container.appendChild(
      makeElement("div", "empty-state", "No pizzas have been submitted."),
    );

    return;
  }

  pizzas.forEach((pizza) => {
    const row = makeElement("div", "planned-pizza-row");

    row.appendChild(makeElement("div", "row-primary", pizza.restaurant_name));

    container.appendChild(row);
  });
}

// ============================================================
// PIZZA EDITOR
// ============================================================

function openPizzaEditor(pizzaId = null) {
  if (currentStage !== "lobby") {
    return;
  }

  clearMessages();

  currentEditingPizzaId = pizzaId;

  const restaurantInput = document.getElementById("pizza-restaurant");
  const priceTierInput = document.getElementById("actual-price-tier");

  if (!restaurantInput) {
    return;
  }

  restaurantInput.value = "";

  if (priceTierInput) {
    priceTierInput.value = "";
  }

  if (!pizzaId) {
    setText("pizza-editor-title", "Add Pizza");
    showScreen("pizza-screen");
    return;
  }

  const pizza = currentMyPizzas.find((item) => item.id === pizzaId);

  if (!pizza) {
    console.error("Attempted to edit another participant's pizza.");
    return;
  }

  setText("pizza-editor-title", `Edit ${pizza.label}`);

  restaurantInput.value = pizza.restaurant;

  if (priceTierInput) {
    priceTierInput.value = pizza.actual_price_tier || "";
  }

  showScreen("pizza-screen");
}

// ============================================================
// SAVE PIZZA
// ============================================================

async function savePizza() {
  clearMessages();

  const restaurant = document.getElementById("pizza-restaurant")?.value.trim();
  const priceTier = document.getElementById("actual-price-tier")?.value || "";

  if (!restaurant) {
    setText("pizza-error", "Enter the restaurant.");
    return;
  }

  if (priceTier && !PRICE_TIERS.has(priceTier)) {
    setText("pizza-error", "Select a valid price tier.");
    return;
  }

  const button = document.getElementById("save-pizza-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    let result;

    if (currentEditingPizzaId) {
      result = await supabaseClient.rpc("update_my_pizza_v2", {
        p_pizza_id: currentEditingPizzaId,
        p_restaurant_name: restaurant,
        p_actual_price_tier: priceTier || null,
      });
    } else {
      result = await supabaseClient.rpc("submit_pizza_v2", {
        p_party_id: currentPartyId,
        p_restaurant: restaurant,
        p_actual_price_tier: priceTier || null,
      });
    }

    if (result.error) {
      throw result.error;
    }

    if (currentVotingOnly) {
      await setMyVotingOnly(false);
    }

    currentEditingPizzaId = null;
    await openLobby();
  } catch (error) {
    console.error("Save pizza error:", error);
    setText("pizza-error", error.message || "Unable to save pizza.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Save Pizza";
    }
  }
}

// ============================================================
// HOST PROGRESS
// ============================================================

async function loadHostProgress(mode) {
  if (!currentPartyIsHost) {
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_host_progress", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Progress error:", error);
    return;
  }

  const players = data || [];

  const config = {
    lobby: {
      property: "ready_for_start",
      summary: "lobby-progress-summary",
      waiting: "lobby-waiting",
      list: "lobby-progress-list",
      button: "begin-blinding-button",
      word: "ready",
    },

    voting: {
      property: "voting_done",
      summary: "voting-progress-summary",
      waiting: "voting-waiting",
      list: "voting-progress-list",
      button: "reveal-results-button",
      word: "finished",
    },
  }[mode];

  if (!config) {
    return;
  }

  const done = players.filter((player) => Boolean(player[config.property]));
  const waiting = players.filter((player) => !player[config.property]);

  setText(config.summary, `${done.length} of ${players.length} ${config.word}`);

  let waitingText = waiting.length
    ? `Waiting for: ${waiting.map((player) => player.display_name).join(", ")}`
    : "Everyone is ready.";

  if (
    mode === "lobby" &&
    waiting.length === 0 &&
    currentPlannedPizzaCount < 3
  ) {
    waitingText =
      "At least 3 pizzas are required for two-round double-blind relabeling.";
  }

  setText(config.waiting, waitingText);

  const container = document.getElementById(config.list);

  if (container) {
    container.innerHTML = "";

    players.forEach((player) => {
      const ready = Boolean(player[config.property]);
      const row = makeElement("div", "progress-row");

      let statusText = ready ? "Done" : "Waiting";

      if (mode === "lobby") {
        if (player.has_pizza) {
          statusText = "Bringing pizza";
        } else if (player.voting_only) {
          statusText = "Voting only";
        } else {
          statusText = "Waiting";
        }
      }

      row.appendChild(makeElement("span", "row-primary", player.display_name));
      row.appendChild(
        makeElement(
          "span",
          ready ? "status-done" : "status-waiting",
          statusText,
        ),
      );

      container.appendChild(row);
    });
  }

  const button = document.getElementById(config.button);

  if (button) {
    const enoughPeople = players.length >= 2;
    const enoughPizzas = mode !== "lobby" || currentPlannedPizzaCount >= 3;

    button.disabled = !(enoughPeople && enoughPizzas && waiting.length === 0);
  }
}

// ============================================================
// BEGIN DOUBLE-BLIND SETUP
// ============================================================

async function beginDoubleBlind() {
  clearMessages();

  const button = document.getElementById("begin-blinding-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Selecting Relabelers...";
  }

  try {
    const { error } = await supabaseClient.rpc("begin_double_blind", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    await refreshPartyState();
  } catch (error) {
    console.error("Begin double-blind error:", error);
    setText(
      "lobby-error",
      error.message || "Unable to begin double-blind setup.",
    );
  } finally {
    if (button) {
      button.textContent = "Begin Double-Blind Setup";
    }
  }
}

// ============================================================
// DOUBLE-BLIND STATUS + RELABELING
// ============================================================

async function openBlinding() {
  clearMessages();
  showScreen("blinding-screen");

  currentBlindingRound = null;
  currentBlindingIsMyTurn = false;
  currentBlindingLabels = [];

  const handlerPanel = document.getElementById("blinding-handler-panel");
  const waitingPanel = document.getElementById("blinding-waiting-panel");

  handlerPanel?.classList.add("hidden");
  waitingPanel?.classList.remove("hidden");

  try {
    const { data, error } = await supabaseClient.rpc("get_blinding_status", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    const status = Array.isArray(data) ? data[0] : data;

    if (!status) {
      throw new Error("Double-blind setup status could not be loaded.");
    }

    currentBlindingRound = Number(status.active_round);
    currentBlindingIsMyTurn = Boolean(status.is_my_turn);

    setText(
      "blinding-round-title",
      `Double-Blind Relabeling · Round ${currentBlindingRound}`,
    );

    if (!currentBlindingIsMyTurn) {
      setText(
        "blinding-waiting-text",
        currentBlindingRound === 1
          ? "The first relabeler has been selected privately. Waiting for Round 1 to be locked."
          : "Round 1 is complete. The second relabeler has been selected privately. Waiting for Round 2 to be locked.",
      );
      return;
    }

    waitingPanel?.classList.add("hidden");
    handlerPanel?.classList.remove("hidden");

    setText(
      "blinding-handler-heading",
      `You were randomly selected for Relabeling Round ${currentBlindingRound}`,
    );

    setText(
      "blinding-handler-copy",
      currentBlindingRound === 1
        ? "Do this round alone. Move every sticky-note letter to a different pizza, shuffle the pizza positions, and record each new label below. Keep your mapping secret after you lock it."
        : "Do this round alone. You are only seeing the labels left by Round 1. Move every sticky-note letter to a different pizza, shuffle the pizza positions again, and record each new label below. Do not ask what the original labels were.",
    );

    const { data: labels, error: labelsError } = await supabaseClient.rpc(
      "get_blinding_labels",
      {
        p_party_id: currentPartyId,
      },
    );

    if (labelsError) {
      throw labelsError;
    }

    currentBlindingLabels = (labels || [])
      .map((row) => row.input_label)
      .filter(Boolean)
      .sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true }),
      );

    renderBlindingMappings();
  } catch (error) {
    console.error("Blinding screen error:", error);
    setText(
      "blinding-message",
      error.message || "Unable to load double-blind setup.",
    );
  }
}

function renderBlindingMappings() {
  const container = document.getElementById("blinding-mapping-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  currentBlindingLabels.forEach((inputLabel) => {
    const row = makeElement("div", "blinding-map-row");
    row.dataset.inputLabel = inputLabel;

    const currentWrap = makeElement("div", "blinding-current-label");
    currentWrap.appendChild(makeElement("span", "row-secondary", "Current"));
    currentWrap.appendChild(
      makeElement("strong", "", shortPizzaLabel(inputLabel)),
    );

    row.appendChild(currentWrap);
    row.appendChild(makeElement("div", "blinding-arrow", "→"));

    const select = document.createElement("select");
    select.className = "blinding-output-select";
    select.dataset.inputLabel = inputLabel;
    select.setAttribute(
      "aria-label",
      `New label for ${shortPizzaLabel(inputLabel)}`,
    );

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "New label";
    select.appendChild(blank);

    currentBlindingLabels.forEach((outputLabel) => {
      const option = document.createElement("option");
      option.value = outputLabel;
      option.textContent = shortPizzaLabel(outputLabel);

      if (outputLabel === inputLabel) {
        option.disabled = true;
        option.textContent += " · must move";
      }

      select.appendChild(option);
    });

    select.addEventListener("change", updateBlindingMappingControls);
    row.appendChild(select);
    container.appendChild(row);
  });

  updateBlindingMappingControls();
}

function updateBlindingMappingControls() {
  const selects = Array.from(
    document.querySelectorAll(".blinding-output-select"),
  );

  const selections = selects.map((select) => select.value).filter(Boolean);
  const usedLabels = new Set(selections);

  selects.forEach((select) => {
    Array.from(select.options).forEach((option) => {
      if (!option.value) {
        return;
      }

      const isCurrent = option.value === select.value;
      const isSameAsInput = option.value === select.dataset.inputLabel;
      const usedElsewhere = usedLabels.has(option.value) && !isCurrent;

      option.disabled = isSameAsInput || usedElsewhere;
    });
  });

  const uniqueSelections = new Set(selections);
  const complete =
    selects.length >= 3 &&
    selections.length === selects.length &&
    uniqueSelections.size === selects.length &&
    selects.every(
      (select) => select.value && select.value !== select.dataset.inputLabel,
    );

  const submit = document.getElementById("submit-blinding-button");

  if (submit) {
    submit.disabled = !complete;
  }
}

async function submitBlindingRound() {
  clearMessages();

  if (!currentBlindingIsMyTurn) {
    return;
  }

  const selects = Array.from(
    document.querySelectorAll(".blinding-output-select"),
  );

  const mappings = selects.map((select) => ({
    input_label: select.dataset.inputLabel,
    output_label: select.value,
  }));

  const outputLabels = mappings.map((mapping) => mapping.output_label);

  if (
    mappings.length < 3 ||
    outputLabels.some((label) => !label) ||
    new Set(outputLabels).size !== mappings.length ||
    mappings.some((mapping) => mapping.input_label === mapping.output_label)
  ) {
    setText(
      "blinding-message",
      "Every pizza must receive one different, unused label before this round can be locked.",
    );
    return;
  }

  const confirmed = window.confirm(
    "Lock this relabeling round? You will not be able to view or change the mapping afterward.",
  );

  if (!confirmed) {
    return;
  }

  const button = document.getElementById("submit-blinding-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Locking Round...";
  }

  try {
    const { error } = await supabaseClient.rpc("submit_blinding_round", {
      p_party_id: currentPartyId,
      p_mappings: mappings,
    });

    if (error) {
      throw error;
    }

    currentBlindingLabels = [];
    currentBlindingIsMyTurn = false;
    await refreshPartyState();
  } catch (error) {
    console.error("Submit blinding round error:", error);
    setText(
      "blinding-message",
      error.message || "Unable to lock this relabeling round.",
    );
  } finally {
    if (button) {
      button.textContent = "Lock Relabeling Round";
    }
  }
}

// ============================================================
// SAFE BLIND PIZZA LIST
// ============================================================

async function loadPizzas() {
  const { data, error } = await supabaseClient.rpc("get_blind_pizzas", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Unable to load blind pizzas:", error);

    currentPizzas = [];

    return;
  }

  currentPizzas = data || [];
}

// ============================================================
// TASTING
// ============================================================

async function openTasting() {
  await loadPizzas();

  const container = document.getElementById("tasting-pizza-list");

  if (container) {
    container.innerHTML = "";

    currentPizzas.forEach((pizza) => {
      const row = makeElement("div", "planned-pizza-row");

      row.appendChild(makeElement("span", "row-primary", pizza.label));

      container.appendChild(row);
    });
  }

  document
    .getElementById("host-tasting-controls")
    ?.classList.toggle("hidden", !currentPartyIsHost);

  showScreen("tasting-screen");
}

// ============================================================
// OPEN VOTING
// ============================================================

async function openVotingStage() {
  try {
    const { error } = await supabaseClient.rpc("open_voting", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    await refreshPartyState();
  } catch (error) {
    console.error("Open voting error:", error);
  }
}

// ============================================================
// CURRENT PLAYER STATUS
// ============================================================

async function loadCurrentPlayerStatus() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("voting_done_at")
    .eq("id", currentPlayerId)
    .single();

  if (error || !data) {
    console.error("Player status error:", error);
    return;
  }

  currentVotingDone = Boolean(data.voting_done_at);
}

// ============================================================
// VOTING + MATCHING DATA
// ============================================================

async function loadRestaurantChoices() {
  const { data, error } = await supabaseClient.rpc(
    "get_restaurant_choices_v2",
    {
      p_party_id: currentPartyId,
    },
  );

  if (error) {
    console.error("Restaurant choices error:", error);
    currentRestaurantChoices = [];
    return;
  }

  currentRestaurantChoices = (data || []).map(
    (choice) => choice.restaurant_name,
  );
}

async function loadMyRatings() {
  const { data, error } = await supabaseClient.rpc("get_my_blind_ratings", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Rating load error:", error);
    return;
  }

  currentRatings = new Map();

  (data || []).forEach((rating) => {
    currentRatings.set(rating.pizza_id, rating);
  });
}

async function loadMyGuesses() {
  const { data, error } = await supabaseClient.rpc("get_my_blind_guesses", {
    p_party_id: currentPartyId,
  });

  if (error) {
    console.error("Restaurant guess load error:", error);
    return;
  }

  currentGuesses = new Map();

  (data || []).forEach((guess) => {
    currentGuesses.set(guess.pizza_id, guess.guessed_restaurant);
  });
}

// ============================================================
// VOTING COMPLETION
// ============================================================

function isVoteCompleteForPizza(pizza) {
  const rating = currentRatings.get(pizza.id);
  const restaurantGuess = currentGuesses.get(pizza.id);

  if (!rating) {
    return false;
  }

  if (!rating.crust || !rating.sauce || !rating.cheese) {
    return false;
  }

  if (!PRICE_TIERS.has(rating.price_guess)) {
    return false;
  }

  return Boolean(restaurantGuess && String(restaurantGuess).trim());
}

function countCompletedVotes() {
  return currentPizzas.filter((pizza) => isVoteCompleteForPizza(pizza)).length;
}

// ============================================================
// VOTING + RESTAURANT MATCHING
// ============================================================

async function openVoting() {
  clearMessages();

  await Promise.all([
    loadPizzas(),
    loadCurrentPlayerStatus(),
    loadRestaurantChoices(),
    loadMyRatings(),
    loadMyGuesses(),
  ]);

  document
    .getElementById("voting-host-progress")
    ?.classList.toggle("hidden", !currentPartyIsHost);

  if (currentPartyIsHost) {
    await loadHostProgress("voting");
  }

  if (
    !selectedRatingPizzaId ||
    !currentPizzas.some((pizza) => pizza.id === selectedRatingPizzaId)
  ) {
    selectedRatingPizzaId = currentPizzas[0]?.id || null;
  }

  renderVotingNavigation();

  if (selectedRatingPizzaId) {
    selectRatingPizza(selectedRatingPizzaId);
  }

  updateVotingControls();
  showScreen("voting-screen");
}

// ============================================================
// PIZZA SELECTION DURING VOTING
// ============================================================

function renderVotingNavigation() {
  const select = document.getElementById("rating-pizza-select");

  if (!select) {
    return;
  }

  select.innerHTML = "";

  currentPizzas.forEach((pizza) => {
    const option = document.createElement("option");
    option.value = pizza.id;
    option.textContent = isVoteCompleteForPizza(pizza)
      ? `${pizza.label} ✓`
      : pizza.label;
    select.appendChild(option);
  });

  if (selectedRatingPizzaId) {
    select.value = selectedRatingPizzaId;
  }

  setText(
    "voting-progress",
    `${countCompletedVotes()} of ${currentPizzas.length} completed`,
  );

  updatePizzaNavigationButtons();
}

function getSelectedPizzaIndex() {
  return currentPizzas.findIndex((pizza) => pizza.id === selectedRatingPizzaId);
}

function selectPreviousPizza() {
  const index = getSelectedPizzaIndex();

  if (index <= 0) {
    return;
  }

  selectRatingPizza(currentPizzas[index - 1].id);
}

function selectNextPizza() {
  const index = getSelectedPizzaIndex();

  if (index < 0 || index >= currentPizzas.length - 1) {
    return;
  }

  selectRatingPizza(currentPizzas[index + 1].id);
}

function updatePizzaNavigationButtons() {
  const index = getSelectedPizzaIndex();
  const previous = document.getElementById("previous-pizza-button");
  const next = document.getElementById("next-pizza-button");

  if (previous) {
    previous.disabled = index <= 0;
  }

  if (next) {
    next.disabled = index < 0 || index >= currentPizzas.length - 1;
  }
}

function renderRestaurantGuessOptions(pizzaId) {
  const select = document.getElementById("restaurant-guess");

  if (!select) {
    return;
  }

  const currentValue = currentGuesses.get(pizzaId) || "";
  const selectedPizzaHasExistingGuess = Boolean(currentValue);

  const assignments = new Map();
  currentGuesses.forEach((restaurant, assignedPizzaId) => {
    if (restaurant) {
      assignments.set(normalized(restaurant), assignedPizzaId);
    }
  });

  select.innerHTML = "";

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select restaurant";
  select.appendChild(blank);

  currentRestaurantChoices.forEach((restaurant) => {
    const option = document.createElement("option");
    const assignedPizzaId = assignments.get(normalized(restaurant));
    const assignedPizza = currentPizzas.find(
      (pizza) => pizza.id === assignedPizzaId,
    );
    const assignedElsewhere = assignedPizzaId && assignedPizzaId !== pizzaId;

    option.value = restaurant;

    if (assignedElsewhere && selectedPizzaHasExistingGuess) {
      option.textContent = `${restaurant} — swap with ${assignedPizza?.label || "another pizza"}`;
    } else if (assignedElsewhere) {
      option.textContent = `${restaurant} — already used`;
      option.disabled = true;
    } else {
      option.textContent = restaurant;
    }

    select.appendChild(option);
  });

  select.value = currentValue;

  setText(
    "restaurant-guess-helper",
    selectedPizzaHasExistingGuess
      ? "Use each restaurant once. Choosing a restaurant already assigned to another pizza will swap the two matches."
      : "Match this pizza to one restaurant. Each restaurant can only be used once.",
  );
}

// ============================================================
// SELECT PIZZA TO RATE + MATCH
// ============================================================

function selectRatingPizza(pizzaId) {
  selectedRatingPizzaId = pizzaId;

  const pizzaSelect = document.getElementById("rating-pizza-select");

  if (pizzaSelect) {
    pizzaSelect.value = pizzaId;
  }

  const pizza = currentPizzas.find((item) => item.id === pizzaId);

  if (!pizza) {
    return;
  }

  const rating = currentRatings.get(pizzaId);

  setText("rating-pizza-label", pizza.label);

  const crust = document.getElementById("crust-score");
  const sauce = document.getElementById("sauce-score");
  const cheese = document.getElementById("cheese-score");
  const priceGuess = document.getElementById("price-guess");
  const notes = document.getElementById("rating-notes");

  if (crust) {
    crust.value = rating?.crust ?? "";
  }

  if (sauce) {
    sauce.value = rating?.sauce ?? "";
  }

  if (cheese) {
    cheese.value = rating?.cheese ?? "";
  }

  if (priceGuess) {
    priceGuess.value = rating?.price_guess ?? "";
  }

  if (notes) {
    notes.value = rating?.notes ?? "";
  }

  renderRestaurantGuessOptions(pizzaId);
  updateOverallDisplay();
  renderVotingNavigation();
  applyVotingLockedState();
  updatePizzaNavigationButtons();
}

// ============================================================
// VOTING LOCK
// ============================================================

function applyVotingLockedState() {
  [
    "crust-score",
    "sauce-score",
    "cheese-score",
    "price-guess",
    "restaurant-guess",
    "rating-notes",
    "save-rating-button",
  ].forEach((id) => {
    const element = document.getElementById(id);

    if (element) {
      element.disabled = currentVotingDone;
    }
  });
}

// ============================================================
// VOTING CONTROLS
// ============================================================

function updateVotingControls() {
  const allComplete =
    currentPizzas.length > 0 && countCompletedVotes() === currentPizzas.length;

  const finish = document.getElementById("finish-voting-button");

  if (finish) {
    finish.classList.toggle("hidden", currentVotingDone);
    finish.disabled = !allComplete;
  }

  const reopen = document.getElementById("reopen-voting-button");

  if (reopen) {
    reopen.classList.toggle("hidden", !currentVotingDone);
  }

  setText(
    "voting-lock-message",
    currentVotingDone
      ? "Your votes and matches are submitted. You can edit them until the host reveals the results."
      : "",
  );

  applyVotingLockedState();
}

// ============================================================
// SAVE COMPLETE PIZZA VOTE
// ============================================================

async function saveVote() {
  clearMessages();

  if (currentVotingDone || !selectedRatingPizzaId) {
    return;
  }

  const pizza = currentPizzas.find((item) => item.id === selectedRatingPizzaId);

  if (!pizza) {
    return;
  }

  const crust = Number(document.getElementById("crust-score")?.value);
  const sauce = Number(document.getElementById("sauce-score")?.value);
  const cheese = Number(document.getElementById("cheese-score")?.value);
  const priceGuess = document.getElementById("price-guess")?.value || "";
  const restaurantGuess =
    document.getElementById("restaurant-guess")?.value || "";
  const notes = document.getElementById("rating-notes")?.value.trim();

  if (!crust || !sauce || !cheese) {
    setText("rating-message", "Select all three scores.");
    return;
  }

  if (!PRICE_TIERS.has(priceGuess)) {
    setText("rating-message", "Select a price guess.");
    return;
  }

  if (!restaurantGuess) {
    setText("rating-message", "Select a restaurant guess.");
    return;
  }

  const button = document.getElementById("save-rating-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    const { error } = await supabaseClient.rpc("submit_vote_v5", {
      p_pizza_id: selectedRatingPizzaId,
      p_crust: crust,
      p_sauce: sauce,
      p_cheese: cheese,
      p_price_guess: priceGuess,
      p_restaurant_guess: restaurantGuess,
      p_notes: notes || null,
    });

    if (error) {
      throw error;
    }

    await Promise.all([loadMyRatings(), loadMyGuesses()]);

    renderVotingNavigation();
    updateVotingControls();
    setText("rating-message", "Vote saved.");

    const next = currentPizzas.find((item) => !isVoteCompleteForPizza(item));

    if (next && next.id !== selectedRatingPizzaId) {
      selectRatingPizza(next.id);
    } else {
      // A swap can change another pizza's restaurant guess, so always
      // re-render the current dropdown after the server response.
      selectRatingPizza(selectedRatingPizzaId);
    }
  } catch (error) {
    console.error("Save vote error:", error);
    setText("rating-message", error.message || "Unable to save this vote.");
  } finally {
    if (button) {
      button.textContent = "Save Pizza Vote";
      applyVotingLockedState();
    }
  }
}

// ============================================================
// FINISH / REOPEN VOTING
// ============================================================

async function finishVoting() {
  try {
    const { error } = await supabaseClient.rpc("mark_voting_done", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    currentVotingDone = true;
    updateVotingControls();

    if (currentPartyIsHost) {
      await loadHostProgress("voting");
    }
  } catch (error) {
    console.error("Finish voting error:", error);
    setText("rating-message", error.message || "Unable to finish voting.");
  }
}

async function reopenVoting() {
  try {
    const { error } = await supabaseClient.rpc("reopen_voting", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    currentVotingDone = false;
    updateVotingControls();

    if (currentPartyIsHost) {
      await loadHostProgress("voting");
    }
  } catch (error) {
    console.error("Reopen voting error:", error);
    setText("rating-message", error.message || "Unable to reopen voting.");
  }
}

// ============================================================
// REVEAL PARTY
// ============================================================

async function revealParty() {
  clearMessages();

  const button = document.getElementById("reveal-results-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Revealing...";
  }

  try {
    const { data: party, error: stageError } = await supabaseClient
      .from("parties")
      .select("stage")
      .eq("id", currentPartyId)
      .single();

    if (stageError) {
      throw stageError;
    }

    if (!party) {
      throw new Error("Party could not be found.");
    }

    if (party.stage === "revealed") {
      currentStage = "revealed";
      await openResults();
      return;
    }

    if (party.stage !== "voting" && party.stage !== "guessing") {
      throw new Error(
        `Cannot reveal results while the party is in the "${party.stage}" stage.`,
      );
    }

    const { error } = await supabaseClient.rpc("reveal_party_v3", {
      p_party_id: currentPartyId,
    });

    if (error) {
      throw error;
    }

    await refreshPartyState();
  } catch (error) {
    console.error("Reveal error:", error);
    setText("rating-message", error.message || "Unable to reveal results.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Reveal Results";
    }
  }
}

// ============================================================
// RESULTS
// ============================================================

async function openResults() {
  showScreen("results-screen");

  const resultsContainer = document.getElementById("results-list");

  if (resultsContainer) {
    resultsContainer.innerHTML = "";
    resultsContainer.appendChild(
      makeElement("div", "empty-state", "Loading results..."),
    );
  }

  try {
    const revealedResult = await supabaseClient.rpc("get_revealed_pizzas", {
      p_party_id: currentPartyId,
    });

    if (revealedResult.error) {
      throw new Error(
        `Unable to load revealed pizzas: ${revealedResult.error.message}`,
      );
    }

    const revealedPizzas = revealedResult.data || [];

    if (!revealedPizzas.length) {
      throw new Error("The party was revealed, but no pizzas were returned.");
    }

    const pizzaIds = revealedPizzas.map((pizza) => pizza.id);

    const [
      ratingsResult,
      guessesResult,
      playersResult,
      chainResult,
      auditResult,
    ] = await Promise.all([
      supabaseClient
        .from("ratings")
        .select(
          `
            pizza_id,
            player_id,
            crust,
            sauce,
            cheese,
            overall,
            price_guess
          `,
        )
        .in("pizza_id", pizzaIds),

      supabaseClient
        .from("guesses")
        .select(
          `
            pizza_id,
            player_id,
            guessed_restaurant
          `,
        )
        .in("pizza_id", pizzaIds),

      supabaseClient
        .from("players")
        .select(
          `
            id,
            display_name
          `,
        )
        .eq("party_id", currentPartyId),

      supabaseClient.rpc("get_revealed_blinding_chain", {
        p_party_id: currentPartyId,
      }),

      supabaseClient.rpc("get_revealed_blinding_audit", {
        p_party_id: currentPartyId,
      }),
    ]);

    if (ratingsResult.error) {
      throw new Error(`Unable to load ratings: ${ratingsResult.error.message}`);
    }

    if (guessesResult.error) {
      throw new Error(
        `Unable to load restaurant guesses: ${guessesResult.error.message}`,
      );
    }

    if (playersResult.error) {
      throw new Error(`Unable to load players: ${playersResult.error.message}`);
    }

    if (chainResult.error) {
      console.error("Blinding chain load error:", chainResult.error);
    }

    if (auditResult.error) {
      console.error("Blinding audit load error:", auditResult.error);
    }

    const ratings = ratingsResult.data || [];
    const guesses = guessesResult.data || [];
    const players = playersResult.data || [];
    const blindingChain = chainResult.error ? [] : chainResult.data || [];
    const blindingAudit = auditResult.error
      ? null
      : Array.isArray(auditResult.data)
        ? auditResult.data[0] || null
        : auditResult.data || null;

    const ranked = revealedPizzas
      .map((pizza) => {
        const pizzaRatings = ratings.filter(
          (rating) => rating.pizza_id === pizza.id,
        );

        const priceGuessRatings = pizzaRatings.filter((rating) =>
          PRICE_TIERS.has(rating.price_guess),
        );

        const correctPriceGuesses = PRICE_TIERS.has(pizza.actual_price_tier)
          ? priceGuessRatings.filter(
              (rating) => rating.price_guess === pizza.actual_price_tier,
            ).length
          : 0;

        return {
          ...pizza,
          ratingCount: pizzaRatings.length,
          overall: average(pizzaRatings.map((rating) => rating.overall)),
          crust: average(pizzaRatings.map((rating) => rating.crust)),
          sauce: average(pizzaRatings.map((rating) => rating.sauce)),
          cheese: average(pizzaRatings.map((rating) => rating.cheese)),
          priceGuessCount: priceGuessRatings.length,
          correctPriceGuesses,
        };
      })
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));

    renderResults(
      ranked,
      guesses,
      ratings,
      players,
      blindingChain,
      blindingAudit,
    );
  } catch (error) {
    console.error("Results loading error:", error);

    if (resultsContainer) {
      resultsContainer.innerHTML = "";
      const errorBox = makeElement("div", "error-box");
      errorBox.appendChild(
        makeElement("strong", "", "Results could not be loaded."),
      );
      errorBox.appendChild(
        makeElement("p", "", error.message || "An unknown error occurred."),
      );
      resultsContainer.appendChild(errorBox);
    }
  }
}

// ============================================================
// RENDER PIZZA RESULTS
// ============================================================

function renderResults(
  ranked,
  guesses,
  ratings,
  players,
  blindingChain,
  blindingAudit,
) {
  const container = document.getElementById("results-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  // No top-three cutoff. Every pizza is shown.
  ranked.forEach((pizza, index) => {
    const card = makeElement("div", "result-card");

    card.appendChild(makeElement("div", "result-rank", `#${index + 1}`));
    card.appendChild(makeElement("div", "result-title", pizza.label));
    card.appendChild(makeElement("div", "result-restaurant", pizza.restaurant));
    card.appendChild(
      makeElement("div", "result-detail", `Brought by ${pizza.bringer_name}`),
    );
    card.appendChild(
      makeElement("div", "result-score", `${formatScore(pizza.overall)} / 10`),
    );
    card.appendChild(
      makeElement(
        "div",
        "result-detail",
        `Crust ${formatScore(pizza.crust)} · Sauce ${formatScore(
          pizza.sauce,
        )} · Cheese ${formatScore(pizza.cheese)}`,
      ),
    );
    card.appendChild(
      makeElement("div", "result-detail", `${pizza.ratingCount} ratings`),
    );

    if (PRICE_TIERS.has(pizza.actual_price_tier)) {
      card.appendChild(
        makeElement(
          "div",
          "price-result",
          `Actual price tier: ${pizza.actual_price_tier}`,
        ),
      );
      card.appendChild(
        makeElement(
          "div",
          "result-detail",
          `${pizza.correctPriceGuesses} of ${pizza.priceGuessCount} price guesses were correct`,
        ),
      );
    } else {
      card.appendChild(
        makeElement("div", "price-result", "Actual price tier: Not provided"),
      );
    }

    container.appendChild(card);
  });

  renderMyGuessTable(ranked, guesses, ratings);
  renderMatchingResults(ranked, guesses, players);
  renderPriceGuessResults(ranked, ratings, players);
  renderBlindingChain(blindingChain, blindingAudit);
}

// ============================================================
// CURRENT USER'S FULL GUESS TABLE
// ============================================================

function makeResultBadge(text, status) {
  return makeElement("span", `result-badge ${status}`, text);
}

function renderMyGuessTable(pizzas, guesses, ratings) {
  const container = document.getElementById("my-guess-table");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const orderedPizzas = [...pizzas].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );

  const wrap = makeElement("div", "results-table-wrap");
  const table = makeElement("table", "guess-results-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  [
    "Pizza",
    "Your Restaurant Guess",
    "Actual Restaurant",
    "Restaurant Result",
    "Price Guess",
    "Actual Tier",
    "Price Result",
  ].forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  orderedPizzas.forEach((pizza) => {
    const guess = guesses.find(
      (item) =>
        item.player_id === currentPlayerId && item.pizza_id === pizza.id,
    );
    const rating = ratings.find(
      (item) =>
        item.player_id === currentPlayerId && item.pizza_id === pizza.id,
    );

    const restaurantCorrect =
      Boolean(guess?.guessed_restaurant) &&
      normalized(guess.guessed_restaurant) === normalized(pizza.restaurant);

    const hasActualTier = PRICE_TIERS.has(pizza.actual_price_tier);
    const priceCorrect =
      hasActualTier && rating?.price_guess === pizza.actual_price_tier;

    const row = document.createElement("tr");

    if (!restaurantCorrect || (hasActualTier && !priceCorrect)) {
      row.classList.add("has-incorrect");
    }

    const values = [
      pizza.label,
      guess?.guessed_restaurant || "Not submitted",
      pizza.restaurant,
    ];

    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    });

    const restaurantResultCell = document.createElement("td");
    restaurantResultCell.appendChild(
      makeResultBadge(
        restaurantCorrect ? "Correct" : "Incorrect",
        restaurantCorrect ? "correct" : "incorrect",
      ),
    );
    row.appendChild(restaurantResultCell);

    const priceGuessCell = document.createElement("td");
    priceGuessCell.textContent = rating?.price_guess || "Not submitted";
    row.appendChild(priceGuessCell);

    const actualTierCell = document.createElement("td");
    actualTierCell.textContent = hasActualTier
      ? pizza.actual_price_tier
      : "Not provided";
    row.appendChild(actualTierCell);

    const priceResultCell = document.createElement("td");

    if (!hasActualTier) {
      priceResultCell.appendChild(makeResultBadge("Not scored", "neutral"));
    } else {
      priceResultCell.appendChild(
        makeResultBadge(
          priceCorrect ? "Correct" : "Incorrect",
          priceCorrect ? "correct" : "incorrect",
        ),
      );
    }

    row.appendChild(priceResultCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

// ============================================================
// RESTAURANT MATCHING LEADERBOARD
// ============================================================

function renderMatchingResults(pizzas, guesses, players) {
  const scores = players
    .map((player) => {
      let correct = 0;

      // Every pizza counts, including pizzas the participant brought.
      pizzas.forEach((pizza) => {
        const guess = guesses.find(
          (item) => item.player_id === player.id && item.pizza_id === pizza.id,
        );

        if (
          guess &&
          normalized(guess.guessed_restaurant) === normalized(pizza.restaurant)
        ) {
          correct++;
        }
      });

      return {
        name: player.display_name,
        correct,
        possible: pizzas.length,
      };
    })
    .sort((a, b) => {
      if (b.correct !== a.correct) {
        return b.correct - a.correct;
      }

      return a.name.localeCompare(b.name);
    });

  const container = document.getElementById("detective-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  // No top-three cutoff. Every participant is shown.
  scores.forEach((score, index) => {
    const row = makeElement("div", "detective-row");
    row.appendChild(
      makeElement("span", "row-primary", `${index + 1}. ${score.name}`),
    );
    row.appendChild(
      makeElement("strong", "", `${score.correct}/${score.possible}`),
    );
    container.appendChild(row);
  });
}

// ============================================================
// PRICE GUESSING LEADERBOARD
// ============================================================

function renderPriceGuessResults(pizzas, ratings, players) {
  const container = document.getElementById("price-guess-list");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const eligiblePizzas = pizzas.filter((pizza) =>
    PRICE_TIERS.has(pizza.actual_price_tier),
  );

  if (!eligiblePizzas.length) {
    container.appendChild(
      makeElement(
        "div",
        "empty-state",
        "No actual price tiers were provided, so there are no price guesses to score.",
      ),
    );
    return;
  }

  const scores = players
    .map((player) => {
      let correct = 0;

      // Every pizza with an actual tier counts, including the player's own.
      eligiblePizzas.forEach((pizza) => {
        const rating = ratings.find(
          (item) => item.player_id === player.id && item.pizza_id === pizza.id,
        );

        if (rating?.price_guess === pizza.actual_price_tier) {
          correct++;
        }
      });

      return {
        name: player.display_name,
        correct,
        possible: eligiblePizzas.length,
      };
    })
    .sort((a, b) => {
      if (b.correct !== a.correct) {
        return b.correct - a.correct;
      }

      return a.name.localeCompare(b.name);
    });

  // No top-three cutoff. Every participant is shown.
  scores.forEach((score, index) => {
    const row = makeElement("div", "detective-row");
    row.appendChild(
      makeElement("span", "row-primary", `${index + 1}. ${score.name}`),
    );
    row.appendChild(
      makeElement("strong", "", `${score.correct}/${score.possible}`),
    );
    container.appendChild(row);
  });
}

// ============================================================
// DOUBLE-BLIND CHAIN OF CUSTODY
// ============================================================

function renderBlindingChain(chain, audit) {
  const section = document.getElementById("blinding-chain-section");
  const container = document.getElementById("blinding-chain-table");

  if (!section || !container) {
    return;
  }

  if (!chain?.length) {
    section.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = "";

  const auditParts = [];

  if (audit?.round1_handler) {
    auditParts.push(
      `Round 1: ${audit.round1_handler}${
        audit.round1_completed_at
          ? ` · ${new Date(audit.round1_completed_at).toLocaleString()}`
          : ""
      }`,
    );
  }

  if (audit?.round2_handler) {
    auditParts.push(
      `Round 2: ${audit.round2_handler}${
        audit.round2_completed_at
          ? ` · ${new Date(audit.round2_completed_at).toLocaleString()}`
          : ""
      }`,
    );
  }

  setText("blinding-audit-summary", auditParts.join("  •  "));

  const wrap = makeElement("div", "results-table-wrap custody-table-wrap");
  const table = makeElement("table", "guess-results-table custody-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  ["Original Label", "After Round 1", "Final Tasting Label"].forEach(
    (heading) => {
      const th = document.createElement("th");
      th.textContent = heading;
      headerRow.appendChild(th);
    },
  );

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  [...chain]
    .sort((a, b) =>
      String(a.original_label).localeCompare(
        String(b.original_label),
        undefined,
        {
          numeric: true,
        },
      ),
    )
    .forEach((mapping) => {
      const row = document.createElement("tr");

      [
        mapping.original_label,
        mapping.round1_label,
        mapping.final_label,
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value || "—";
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });

  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

// ============================================================
// RETURN HOME
// ============================================================

async function returnHome() {
  localStorage.removeItem(PARTY_STORAGE_KEY);

  if (partyChannel) {
    await supabaseClient.removeChannel(partyChannel);
  }

  partyChannel = null;

  currentPartyId = null;

  currentPartyName = null;

  currentHostUserId = null;

  currentStage = null;

  currentPartyIsHost = false;

  currentPlayerId = null;

  currentPlayers = [];

  currentPizzas = [];

  currentMyPizzas = [];

  currentEditingPizzaId = null;

  currentRatings = new Map();

  currentGuesses = new Map();

  currentVotingDone = false;
  currentVotingOnly = false;

  currentRestaurantChoices = [];

  currentPlannedPizzaCount = 0;

  currentBlindingRound = null;
  currentBlindingIsMyTurn = false;
  currentBlindingLabels = [];

  selectedRatingPizzaId = null;

  showScreen("home-screen");
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document
  .getElementById("settings-button")
  ?.addEventListener("click", openSettings);

document
  .getElementById("settings-back-button")
  ?.addEventListener("click", closeSettings);

document.getElementById("theme-light-button")?.addEventListener("click", () => {
  applyTheme("light");
});

document.getElementById("theme-dark-button")?.addEventListener("click", () => {
  applyTheme("dark");
});

document
  .getElementById("theme-system-button")
  ?.addEventListener("click", () => {
    applyTheme("system");
  });

document
  .getElementById("copy-transfer-button")
  ?.addEventListener("click", createDeviceTransfer);

document
  .getElementById("claim-transfer-button")
  ?.addEventListener("click", claimDeviceTransfer);

document
  .getElementById("create-party-button")
  ?.addEventListener("click", createParty);

document
  .getElementById("join-invite-button")
  ?.addEventListener("click", joinFromInvite);

document
  .getElementById("copy-invite-button")
  ?.addEventListener("click", copyInviteLink);

document
  .getElementById("rotate-invite-button")
  ?.addEventListener("click", rotateInviteLink);

document
  .getElementById("add-pizza-button")
  ?.addEventListener("click", startAddingPizza);

document
  .getElementById("voting-only-button")
  ?.addEventListener("click", chooseVotingOnly);

document
  .getElementById("pizza-back-button")
  ?.addEventListener("click", openLobby);

document
  .getElementById("save-pizza-button")
  ?.addEventListener("click", savePizza);

document
  .getElementById("begin-blinding-button")
  ?.addEventListener("click", beginDoubleBlind);

document
  .getElementById("submit-blinding-button")
  ?.addEventListener("click", submitBlindingRound);

document
  .getElementById("open-voting-button")
  ?.addEventListener("click", openVotingStage);

document
  .getElementById("rating-pizza-select")
  ?.addEventListener("change", (event) => {
    selectRatingPizza(event.target.value);
  });

document
  .getElementById("previous-pizza-button")
  ?.addEventListener("click", selectPreviousPizza);

document
  .getElementById("next-pizza-button")
  ?.addEventListener("click", selectNextPizza);

document
  .getElementById("save-rating-button")
  ?.addEventListener("click", saveVote);

document
  .getElementById("finish-voting-button")
  ?.addEventListener("click", finishVoting);

document
  .getElementById("reopen-voting-button")
  ?.addEventListener("click", reopenVoting);

document
  .getElementById("reveal-results-button")
  ?.addEventListener("click", revealParty);

document
  .getElementById("return-home-button")
  ?.addEventListener("click", returnHome);

// ============================================================
// ENTER KEY SUPPORT
// ============================================================

document.getElementById("party-name")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    document.getElementById("host-name")?.focus();
  }
});

document.getElementById("host-name")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    createParty();
  }
});

document
  .getElementById("invite-player-name")
  ?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      joinFromInvite();
    }
  });

document
  .getElementById("pizza-restaurant")
  ?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      document.getElementById("actual-price-tier")?.focus();
    }
  });

document
  .getElementById("actual-price-tier")
  ?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      savePizza();
    }
  });

document
  .getElementById("transfer-input")
  ?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      claimDeviceTransfer();
    }
  });

// ============================================================
// START APP
// ============================================================

initializeApp();