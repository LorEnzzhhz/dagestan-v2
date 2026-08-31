// ---------------------------------------------------------------------------
// store.ts — localStorage-backed data store replacing the Convex backend.
// All data stays on-device. No accounts, no cloud, no external dependencies.
// ---------------------------------------------------------------------------

import { getPoolKey, type PoolProvider } from "./api-key-pool";

const PREFIX = "dagestan.";
const LEGACY_PREFIX = "prism.";

/**
 * One-time migration from the prism.* storage era: copies every legacy key to
 * its dagestan.* equivalent so users keep chats, keys, skills and settings.
 */
(function migrateLegacyStore() {
  try {
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) legacy.push(k);
    }
    for (const k of legacy) {
      const newKey = PREFIX + k.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(newKey) === null) {
        const v = localStorage.getItem(k);
        if (v !== null) localStorage.setItem(newKey, v);
      }
      localStorage.removeItem(k);
    }
  } catch {
    // storage unavailable — nothing to migrate
  }
})();

/** Rename a standalone legacy localStorage key once, preserving its value. */
export function migrateKey(legacy: string, key: string): string {
  try {
    const v = localStorage.getItem(legacy);
    if (v !== null && localStorage.getItem(key) === null) {
      localStorage.setItem(key, v);
    }
    localStorage.removeItem(legacy);
  } catch {
    // storage unavailable
  }
  return key;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

// ---- Types ----------------------------------------------------------------

export interface Chat {
  _id: string;
  title: string;
  provider: string;
  model: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  _id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string;
  model?: string;
  createdAt: number;
}

export interface AgentDevice {
  _id: string;
  name: string;
  token: string;
  device?: string;
  distro?: string;
  online?: boolean;
  createdAt: number;
  lastSeen?: number;
}

export interface AgentCommand {
  _id: string;
  deviceId: string;
  command: string;
  chatId?: string;
  status: "pending" | "running" | "done" | "error";
  exitCode?: number;
  output?: string;
  createdAt: number;
  finishedAt?: number;
}

export interface UserProfile {
  name: string;
  email?: string;
  image?: string;
  isAnonymous: boolean;
}

// ---- Helpers --------------------------------------------------------------

let _idCounter = Date.now();
function uid(): string {
  return `${Date.now()}-${++_idCounter}`;
}

// ---- User -----------------------------------------------------------------

const USER_KEY = "user";

export function getUser(): UserProfile {
  const existing = load<UserProfile>(USER_KEY, null as unknown as UserProfile);
  if (existing) return existing;
  const guest: UserProfile = {
    name: "Explorer",
    isAnonymous: true,
  };
  save(USER_KEY, guest);
  return guest;
}

export function setUser(u: UserProfile): void {
  save(USER_KEY, u);
}

export function signOutUser(): void {
  localStorage.removeItem(PREFIX + USER_KEY);
}

// ---- Chats ----------------------------------------------------------------

const CHATS_KEY = "chats";

function readChats(): Chat[] {
  return load<Chat[]>(CHATS_KEY, []);
}

function writeChats(chats: Chat[]): void {
  save(CHATS_KEY, chats);
}

export function listChats(): Chat[] {
  return readChats().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getChat(id: string): Chat | undefined {
  return readChats().find((c) => c._id === id);
}

export function createChat(
  title: string,
  provider: string,
  model: string,
): Chat {
  const now = Date.now();
  const chat: Chat = {
    _id: uid(),
    title: title.slice(0, 120),
    provider,
    model,
    createdAt: now,
    updatedAt: now,
  };
  const chats = readChats();
  chats.push(chat);
  writeChats(chats);
  return chat;
}

export function renameChat(id: string, title: string): void {
  const chats = readChats();
  const c = chats.find((x) => x._id === id);
  if (c) c.title = title.slice(0, 120);
  writeChats(chats);
}

export function setChatModel(
  id: string,
  provider: string,
  model: string,
): void {
  const chats = readChats();
  const c = chats.find((x) => x._id === id);
  if (c) {
    c.provider = provider;
    c.model = model;
  }
  writeChats(chats);
}

export function togglePin(id: string): void {
  const chats = readChats();
  const c = chats.find((x) => x._id === id);
  if (c) c.pinned = !c.pinned;
  writeChats(chats);
}

export function deleteChat(id: string): void {
  writeChats(readChats().filter((c) => c._id !== id));
  // Also remove messages for this chat
  const msgs = readMessages().filter((m) => m.chatId !== id);
  writeMessages(msgs);
}

// ---- Messages -------------------------------------------------------------

const MSGS_KEY = "messages";

function readMessages(): Message[] {
  return load<Message[]>(MSGS_KEY, []);
}

function writeMessages(msgs: Message[]): void {
  save(MSGS_KEY, msgs);
}

export function listMessages(chatId: string): Message[] {
  return readMessages()
    .filter((m) => m.chatId === chatId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  provider?: string,
  model?: string,
): Message {
  const now = Date.now();
  const msg: Message = {
    _id: uid(),
    chatId,
    role,
    content,
    provider,
    model,
    createdAt: now,
  };
  const msgs = readMessages();
  msgs.push(msg);
  writeMessages(msgs);

  // Auto-title from first user message
  if (role === "user") {
    const chats = readChats();
    const chat = chats.find((c) => c._id === chatId);
    if (chat && chat.title === "New chat") {
      chat.title =
        content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
      chat.updatedAt = now;
      writeChats(chats);
    }
  }

  return msg;
}

export function editMessage(id: string, content: string): void {
  const msgs = readMessages();
  const m = msgs.find((x) => x._id === id);
  if (m) m.content = content;
  writeMessages(msgs);
}

export function truncateAfter(chatId: string, messageId: string): void {
  const msgs = readMessages();
  const anchor = msgs.find((m) => m._id === messageId);
  if (!anchor) return;
  const filtered = msgs.filter(
    (m) => m.chatId !== chatId || m.createdAt <= anchor.createdAt,
  );
  writeMessages(filtered);
}

// ---- Agent Devices --------------------------------------------------------

const DEVICES_KEY = "devices";
const COMMANDS_KEY = "commands";

function readDevices(): AgentDevice[] {
  return load<AgentDevice[]>(DEVICES_KEY, []);
}

function writeDevices(d: AgentDevice[]): void {
  save(DEVICES_KEY, d);
}

export function listDevices(): AgentDevice[] {
  return readDevices();
}

export function createDevice(name: string): {
  device: AgentDevice;
  token: string;
} {
  const token = uid();
  const device: AgentDevice = {
    _id: uid(),
    name,
    token,
    createdAt: Date.now(),
  };
  const devices = readDevices();
  devices.push(device);
  writeDevices(devices);
  return { device, token };
}

export function deleteDevice(id: string): void {
  writeDevices(readDevices().filter((d) => d._id !== id));
}

export function getDeviceByToken(token: string): AgentDevice | undefined {
  return readDevices().find((d) => d.token === token);
}

export function updateDevice(
  id: string,
  patch: Partial<AgentDevice>,
): void {
  const devices = readDevices();
  const d = devices.find((x) => x._id === id);
  if (d) Object.assign(d, patch);
  writeDevices(devices);
}

// ---- Agent Commands -------------------------------------------------------

function readCommands(): AgentCommand[] {
  return load<AgentCommand[]>(COMMANDS_KEY, []);
}

function writeCommands(c: AgentCommand[]): void {
  save(COMMANDS_KEY, c);
}

export function enqueueCommand(
  deviceId: string,
  command: string,
  chatId?: string,
): string {
  const cmd: AgentCommand = {
    _id: uid(),
    deviceId,
    command,
    chatId,
    status: "pending",
    createdAt: Date.now(),
  };
  const cmds = readCommands();
  cmds.push(cmd);
  writeCommands(cmds);
  return cmd._id;
}

export function getCommand(id: string): AgentCommand | undefined {
  return readCommands().find((c) => c._id === id);
}

export function updateCommand(
  id: string,
  patch: Partial<AgentCommand>,
): void {
  const cmds = readCommands();
  const c = cmds.find((x) => x._id === id);
  if (c) Object.assign(c, patch);
  writeCommands(cmds);
}

export function pollPendingCommand(
  deviceId: string,
): AgentCommand | undefined {
  const cmds = readCommands();
  const c = cmds.find(
    (x) => x.deviceId === deviceId && x.status === "pending",
  );
  return c;
}

// ---- API Keys (stored locally) -------------------------------------------

const KEYS_KEY = "api_keys";

export interface ApiKeys {
  openrouter?: string;
  nvidia?: string;
  zen?: string;
  exa?: string;
}

/**
 * Get API keys — user keys first, then shared pool with cooldown rotation.
 * Free models work immediately without any setup.
 *
 * Pool logic:
 * - Each provider has multiple keys in the pool
 * - Keys rotate with a 1-hour cooldown
 * - If a key was used in the last hour, the next available key is picked
 * - If ALL keys are in cooldown, the least-recently-used one is reused
 */
export function getApiKeys(): ApiKeys {
  const userKeys = load<ApiKeys>(KEYS_KEY, {});

  // For each provider: use user key if set, otherwise pick from pool
  const resolve = (provider: PoolProvider, userVal?: string): string => {
    if (userVal) return userVal;
    return getPoolKey(provider) || "";
  };

  return {
    zen: resolve("zen", userKeys.zen),
    openrouter: resolve("openrouter", userKeys.openrouter),
    nvidia: resolve("nvidia", userKeys.nvidia),
    exa: resolve("exa", userKeys.exa),
  };
}

/** Check if user has set their own key (vs using pool) */
export function hasUserKey(provider: keyof ApiKeys): boolean {
  const userKeys = load<ApiKeys>(KEYS_KEY, {});
  return Boolean(userKeys[provider]);
}

export function setApiKeys(keys: ApiKeys): void {
  save(KEYS_KEY, keys);
}
