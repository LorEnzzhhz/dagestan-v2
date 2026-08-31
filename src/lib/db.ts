// ---------------------------------------------------------------------------
// db.ts — Local persistence (localStorage) for chats, messages, devices,
// commands, and provider keys. Returns synchronously so call sites read like
// a normal data layer. Keys never leave the device.
// ---------------------------------------------------------------------------

import * as store from "./store";

// ---- Synchronous reads (replaces the old async Convex useQuery) ---------

export function listChats(): store.Chat[] {
  return store.listChats();
}

export function getChat(id: string): store.Chat | undefined {
  return store.getChat(id);
}

export function listMessages(chatId: string): store.Message[] {
  return store.listMessages(chatId);
}

export function createChat(
  title: string,
  provider: string,
  model: string,
): string {
  const chat = store.createChat(title, provider, model);
  return chat._id;
}

export function addMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  provider?: string,
  model?: string,
): string {
  const msg = store.addMessage(chatId, role, content, provider, model);
  return msg._id;
}

export function editMessage(id: string, content: string): void {
  store.editMessage(id, content);
}

export function truncateAfter(chatId: string, messageId: string): void {
  store.truncateAfter(chatId, messageId);
}

export function renameChat(id: string, title: string): void {
  store.renameChat(id, title);
}

export function setChatModel(
  id: string,
  provider: string,
  model: string,
): void {
  store.setChatModel(id, provider, model);
}

export function togglePin(id: string): void {
  store.togglePin(id);
}

export function deleteChat(id: string): void {
  store.deleteChat(id);
}

// ---- Agent devices --------------------------------------------------------

export function listDevices(): store.AgentDevice[] {
  return store.listDevices();
}

export function createDevice(name: string): { token: string } {
  const result = store.createDevice(name);
  return { token: result.token };
}

export function deleteDevice(id: string): void {
  store.deleteDevice(id);
}

// ---- Agent commands -------------------------------------------------------

export function getCommand(id: string): store.AgentCommand | undefined {
  return store.getCommand(id);
}

export function createCommand(deviceId: string, command: string, chatId?: string): string {
  return store.enqueueCommand(deviceId, command, chatId);
}

// ---- API keys -------------------------------------------------------------

export function getKeyStatus(): Record<string, boolean> {
  const keys = store.getApiKeys();
  return {
    openrouter: Boolean(keys.openrouter),
    nvidia: Boolean(keys.nvidia),
    zen: Boolean(keys.zen),
    exa: Boolean(keys.exa),
  };
}

// ---- Re-export store types for components ---------------------------------

export type { Chat, Message, AgentDevice, AgentCommand } from "./store";

export function getApiKeys() {
  return store.getApiKeys();
}

export function setApiKeys(keys: Parameters<typeof store.setApiKeys>[0]) {
  store.setApiKeys(keys);
}
