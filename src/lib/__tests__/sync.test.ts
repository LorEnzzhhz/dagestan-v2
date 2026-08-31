import { describe, it, expect } from "vitest";
import { encryptChat, decryptChat, initSync, resumeSync } from "../sync";

const hasSubtle = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";

interface ChatShape { title: string; messages: Array<{ role: string; content: string }> }

const sample: ChatShape = {
  title: "Project kickoff",
  messages: [
    { role: "user", content: "Plan the next sprint" },
    { role: "assistant", content: "Sure — first, define done…" },
  ],
};

describe.skipIf(!hasSubtle)("sync round-trip", () => {
  it("encrypt → decrypt returns the original payload", async () => {
    const { key } = await initSync("correct horse battery staple");
    const blob = await encryptChat(key, "chat-1", sample);
    expect(blob.id).toBe("chat-1");
    expect(blob.iv.length).toBeGreaterThan(0);
    expect(blob.ciphertext.length).toBeGreaterThan(0);

    const back = await decryptChat<ChatShape>(key, blob);
    expect(back).toEqual(sample);
  });

  it("wrong passphrase produces garbage (auth fails)", async () => {
    const { key: k1, salt } = await initSync("hunter2");
    const blob = await encryptChat(k1, "chat-x", sample);

    // Decrypting with a different key MUST fail (AES-GCM auth tag check)
    const k2 = await resumeSync("hunter3", btoa(String.fromCharCode(...salt)));
    await expect(decryptChat(k2, blob)).rejects.toThrow();
  });

  it("same passphrase + salt → same key", async () => {
    const { key: k1, salt } = await initSync("open sesame");
    const k2 = await resumeSync("open sesame", btoa(String.fromCharCode(...salt)));
    // Can't compare CryptoKey directly, but encrypt with one and decrypt with the other
    const blob = await encryptChat(k1, "c", { ok: true });
    const back = await decryptChat<{ ok: boolean }>(k2, blob);
    expect(back.ok).toBe(true);
  });

  it("random IV per encryption → distinct ciphertexts", async () => {
    const { key } = await initSync("p");
    const blob1 = await encryptChat(key, "c", sample);
    const blob2 = await encryptChat(key, "c", sample);
    expect(blob1.iv).not.toBe(blob2.iv);
    expect(blob1.ciphertext).not.toBe(blob2.ciphertext);
  });
});
