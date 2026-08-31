package com.dagestan.mobile.services

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Single source of truth for LLM-callable tools. The ChatScreen
 * queries [manifestJson] for the `tools` field of the /v1/responses
 * request and calls [dispatch] when the model returns tool_calls.
 *
 * Tools live in two places:
 *   - [SkillsService]  (install_skill, list_skills, run_skill, plus
 *                       per-skill wrappers)
 *   - [ServersAdapter] (start_server, stop_server, server_status)
 *
 * Adding a new tool: add it here, add the JSON descriptor in
 * [manifestJson], and the JSON branch in [dispatch]. The
 * [com.dagestan.mobile.bus.BusEvent.ToolCallRequested] /
 * [com.dagestan.mobile.bus.BusEvent.ToolCallResult] events are
 * published around each call so the chat UI can render the call
 * as it happens.
 */
class ToolRegistry private constructor(
    private val appContext: Context,
) {
    private val skills: SkillsService = SkillsService.getInstance(appContext)
    private val servers: ServersAdapter = ServersAdapter.getInstance(appContext)

    /**
     * The JSON `tools` array for the /v1/responses request body.
     * Pure string concatenation — no extra deps.
     */
    fun manifestJson(): String {
        val sb = StringBuilder("[")
        // ── SkillsService tools ────────────────────────────────────────
        sb.append("{\"type\":\"function\",\"name\":\"install_skill\",\"description\":\"Install a skill from the bundled Dagestan marketplace. Returns the installed version.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Skill name, e.g. git-commit, explain-stacktrace, summarize-url.\"}},\"required\":[\"name\"]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"list_skills\",\"description\":\"List all skills in the bundled marketplace and which are already installed.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{},\"required\":[]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"run_skill\",\"description\":\"Run an installed skill. The stdin field, if provided, is piped to the skill. The args field is passed as positional command-line arguments.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"args\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"stdin\":{\"type\":\"string\"}},\"required\":[\"name\"]}}")
        // Per-skill wrappers so the model can call them by their natural name.
        for (skill in skills.marketplace.value) {
            sb.append(",{\"type\":\"function\",\"name\":\"skill_" + skill.name.replace("-", "_") +
                "\",\"description\":\"" + escapeJson(skill.description) +
                "\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"input\":{\"type\":\"string\",\"description\":\"Free-form input passed to the skill (stdin or first arg).\"}},\"required\":[]}}")
        }
        // ── ServersAdapter tools ───────────────────────────────────────
        sb.append(",{\"type\":\"function\",\"name\":\"start_server\",\"description\":\"Start a Dagestan server in the background. Valid names: codex, openclaw, hermes.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\",\"description\":\"Server key: codex | openclaw | hermes.\"}},\"required\":[\"name\"]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"stop_server\",\"description\":\"Stop a running Dagestan server. Valid names: codex, openclaw, hermes.\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}}")
        sb.append(",{\"type\":\"function\",\"name\":\"server_status\",\"description\":\"Return the current running/stopped state of all three servers (codex, openclaw, hermes).\",\"strict\":false,\"parameters\":{\"type\":\"object\",\"properties\":{},\"required\":[]}}")
        sb.append("]")
        return sb.toString()
    }

    /**
     * Dispatch a tool call. `arguments` is the raw JSON object string
     * from the model's tool_call.arguments field. Returns a JSON object
     * string suitable for stuffing back into the next conversation turn
     * as a `function_call_output`.
     */
    fun dispatch(name: String, arguments: String, callId: String): String {
        val args = try { JSONObject(arguments) } catch (t: Throwable) { JSONObject() }
        val result = when (name) {
            "install_skill" -> {
                val n = args.optString("name", "")
                if (n.isBlank()) errorResult("missing 'name'")
                else if (skills.install(n)) {
                    successResult("Installed '$n'. It is now available via run_skill.")
                } else errorResult("install failed: '$n' is not in the bundled marketplace")
            }
            "list_skills" -> {
                val sb = StringBuilder()
                sb.append("Marketplace:\n")
                for (s in skills.marketplace.value) {
                    val installed = if (s.name in skills.installed.value) " [installed]" else ""
                    sb.append("- ").append(s.name).append(" (").append(s.version).append("): ")
                        .append(s.title).append(installed).append('\n')
                }
                successResult(sb.toString())
            }
            "run_skill" -> {
                val n = args.optString("name", "")
                if (n.isBlank()) errorResult("missing 'name'")
                else {
                    val arr = args.optJSONArray("args") ?: JSONArray()
                    val a = (0 until arr.length()).map { arr.getString(it) }
                    val stdin = if (args.has("stdin")) args.optString("stdin") else null
                    val r = skills.run(n, a, stdin)
                    if (r.success) successResult(r.output)
                    else errorResult("exit=${r.exitCode}: ${r.output}")
                }
            }
            "start_server" -> {
                val n = args.optString("name", "")
                when (n) {
                    "codex"   -> { servers.startCodex();   successResult("starting codex…") }
                    "openclaw"-> { servers.startOpenClaw(); successResult("starting openclaw…") }
                    "hermes"  -> { servers.startHermes();  successResult("starting hermes…") }
                    else -> errorResult("unknown server '$n' (use codex | openclaw | hermes)")
                }
            }
            "stop_server" -> {
                val n = args.optString("name", "")
                when (n) {
                    "codex"   -> { servers.stopCodex();   successResult("stopped codex") }
                    "openclaw"-> { servers.stopOpenClaw(); successResult("stopped openclaw") }
                    "hermes"  -> { servers.stopHermes();  successResult("stopped hermes") }
                    else -> errorResult("unknown server '$n' (use codex | openclaw | hermes)")
                }
            }
            "server_status" -> successResult(servers.statusSnapshot())
            else -> {
                // Per-skill wrapper: skill_git_commit, skill_explain_stacktrace, ...
                if (name.startsWith("skill_")) {
                    val skillName = name.removePrefix("skill_").replace("_", "-")
                    val input = args.optString("input", "")
                    val r = skills.run(skillName, listOf(input))
                    if (r.success) successResult(r.output)
                    else errorResult("exit=${r.exitCode}: ${r.output}")
                } else {
                    errorResult("unknown tool '$name'")
                }
            }
        }
        // Publish the result on the bus so any other listener (the
        // chat bubble UI, an analytics sink, etc.) can react.
        com.dagestan.mobile.bus.DagestanBus.publishAsync(
            com.dagestan.mobile.bus.BusEvent.ToolCallResult(
                callId = callId,
                toolName = name,
                success = result.optBoolean("ok", false),
                output = result.optString("output", ""),
            )
        )
        return result.toString()
    }

    private fun successResult(text: String): JSONObject =
        JSONObject().put("ok", true).put("output", text)

    private fun errorResult(text: String): JSONObject =
        JSONObject().put("ok", false).put("output", text)

    private fun escapeJson(s: String): String {
        val sb = StringBuilder()
        for (c in s) when (c) {
            '"'  -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> sb.append(c)
        }
        return sb.toString()
    }

    companion object {
        @Volatile
        private var instance: ToolRegistry? = null

        fun getInstance(context: Context): ToolRegistry =
            instance ?: synchronized(this) {
                instance ?: ToolRegistry(context.applicationContext)
                    .also { instance = it }
            }
    }
}
