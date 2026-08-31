import { getLlama } from "node-llama-cpp";

try {
  const llama = await getLlama();
  console.log("[llama] loaded ok");
  console.log("[llama] keys:", Object.keys(llama).slice(0, 30).join(", "));
} catch (e) {
  console.error("[llama] load failed:", e.message);
  console.error(e.stack?.split("\n").slice(0, 5).join("\n"));
}
