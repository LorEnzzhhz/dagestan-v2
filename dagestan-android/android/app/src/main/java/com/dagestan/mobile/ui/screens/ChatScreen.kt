package com.dagestan.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import com.dagestan.mobile.services.CodexService
import com.dagestan.mobile.services.ToolRegistry
import com.dagestan.mobile.services.VoiceService
import com.dagestan.mobile.ui.animation.pressScale
import com.dagestan.mobile.ui.animation.rememberPulseAlpha
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Chat tab — native chat with tool/function calling (beta2).
 *
 * Sends a request to Codex's `/v1/responses` with the
 * [ToolRegistry] manifest attached as `tools`. The LLM may either
 * stream an assistant message or emit one or more `tool_calls`.
 * We route each tool call through [ToolRegistry.dispatch] and feed
 * the result back as a `function_call_output` in the next turn.
 *
 * The chat is also the destination for the voice service: when
 * [BusEvent.VoiceFinalTranscript] fires, the transcript is appended
 * as a user message and submitted just like a typed prompt.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen() {
    val context = LocalContext.current
    val codex = remember { CodexService.getInstance(context) }
    val isRunning by codex.isRunning.collectAsState()
    val tools = remember { ToolRegistry.getInstance(context) }
    val voice = remember { VoiceService.getInstance(context) }
    val voiceListening by voice.isListening.collectAsState()
    val partial by voice.partial.collectAsState()

    val messages = remember { mutableStateListOf<ChatMessage>() }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    // Auto-submit when the voice service finalizes a transcript.
    LaunchedEffect(Unit) {
        DagestanBus.events.collect { ev ->
            if (ev is BusEvent.VoiceFinalTranscript) {
                val text = ev.text.trim()
                if (text.isNotEmpty() && !busy) {
                    submit(text, messages, codex, tools, isRunning) { busy = it }
                    input = ""
                }
            }
        }
    }

    // After each assistant turn, speak the final visible text
    // (the part that isn't a tool-call line) back through TTS.
    LaunchedEffect(messages.size, busy) {
        if (!busy && messages.isNotEmpty()) {
            val last = messages.last()
            if (last.role == ChatRole.ASSISTANT && last.text.isNotBlank()
                && !last.text.contains("🔧")
                && !last.text.startsWith("[")) {
                val speakable = last.text.lineSequence()
                    .filter { !it.startsWith("🔧") }
                    .joinToString(" ")
                    .trim()
                if (speakable.isNotEmpty()) voice.speak(speakable)
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Chat") }) },
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            if (!isRunning) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Codex isn't running. Start it from the Home tab.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(messages, key = { it.id }) { msg ->
                    MessageBubble(msg)
                }
            }
            if (voiceListening) {
                PartialBubble(partial)
            }
            Composer(
                value = input,
                onChange = { input = it },
                enabled = isRunning && !busy,
                onSend = {
                    val text = input.trim()
                    if (text.isEmpty()) return@Composer
                    submit(text, messages, codex, tools, isRunning) { busy = it }
                    input = ""
                },
            )
        }
    }
}

private fun submit(
    text: String,
    messages: MutableList<ChatMessage>,
    codex: CodexService,
    tools: ToolRegistry,
    isRunning: Boolean,
    setBusy: (Boolean) -> Unit,
) {
    if (!isRunning) return
    val user = ChatMessage(role = ChatRole.USER, text = text)
    val assistantId = System.currentTimeMillis() + 1
    val assistant = ChatMessage(id = assistantId, role = ChatRole.ASSISTANT, text = "")
    messages.add(user)
    messages.add(assistant)
    setBusy(true)
    val scope = CoroutineScopeWrapper
    scope.launch {
        runConversation(text, assistantId, messages, tools)
        setBusy(false)
    }
}

// Tiny wrapper so the function above can launch a coroutine without
// pulling rememberCoroutineScope into the call site.
private object CoroutineScopeWrapper {
    private val scope = kotlinx.coroutines.CoroutineScope(
        kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main
    )
    fun launch(block: suspend () -> Unit) = scope.launch { block() }
}

/**
 * The full conversation loop: send the user turn, then keep sending
 * tool-call outputs back to the LLM until it produces a final
 * assistant message. Each iteration appends one ChatMessage to
 * [messages].
 */
private suspend fun runConversation(
    userText: String,
    assistantId: Long,
    messages: MutableList<ChatMessage>,
    tools: ToolRegistry,
) = withContext(Dispatchers.IO) {
    // `input` for the very first turn. Subsequent turns use the
    // function_call_output form, which we model as an extra
    // input item of role "function" with the tool's name + output.
    val initialInput = JSONArray().apply {
        put(JSONObject().put("role", "user").put("content", userText))
    }

    // Cap tool-call loops so a misbehaving model can't loop forever.
    val maxTurns = 8
    var turn = 0
    var currentInput = initialInput

    while (turn < maxTurns) {
        turn++
        val turnAssistantText = StringBuilder()
        // Each turn may emit 0..N tool calls. We collect them as we
        // stream the SSE; once we see the response.complete event we
        // dispatch them and loop.
        val toolCalls = mutableListOf<Triple<String, String, String>>() // callId, name, args

        val ok = streamOneTurn(currentInput, tools) { deltaText, toolCallJson ->
            if (deltaText.isNotEmpty()) {
                turnAssistantText.append(deltaText)
                appendToMessage(messages, assistantId, deltaText)
            }
            if (toolCallJson != null) {
                val callId = toolCallJson.optString("call_id",
                    toolCallJson.optString("id", ""))
                val name = toolCallJson.optString("name", "")
                val args = toolCallJson.optString("arguments", "{}")
                if (name.isNotEmpty()) toolCalls += Triple(callId, name, args)
            }
        }

        if (!ok) {
            appendToMessage(messages, assistantId, "\n[network error]")
            return@withContext
        }

        if (toolCalls.isEmpty()) {
            // No tool calls — the assistant's reply is final.
            return@withContext
        }

        // Render each tool call in the chat as a small "tool: name"
        // bubble so the user sees what the model did. Then dispatch
        // it and feed the result back as the next input.
        appendToMessage(messages, assistantId, "\n")
        for ((callId, name, _) in toolCalls) {
            appendToMessage(messages, assistantId, "🔧 $name\n")
        }

        // Build the next input: append a function_call_output for
        // each tool call, then ask the model to continue.
        val nextInput = JSONArray()
        for (i in 0 until currentInput.length()) {
            nextInput.put(currentInput.get(i))
        }
        for ((callId, name, args) in toolCalls) {
            // Inform the model what tool we called (so it can match
            // output to call). Codex Responses API expects:
            //   { "type": "function_call_output",
            //     "call_id": "...",
            //     "output": "..." }
            val output = tools.dispatch(name, args, callId)
            nextInput.put(
                JSONObject()
                    .put("type", "function_call_output")
                    .put("call_id", callId)
                    .put("output", output)
            )
        }
        currentInput = nextInput

        // Continue loop — the same assistantId keeps getting appended
        // so the conversation is a single bubble per user turn.
    }
    appendToMessage(messages, assistantId, "\n[stopped after $maxTurns tool turns]")
}

/**
 * Stream a single /v1/responses turn. The [onDelta] callback fires
 * for each text delta; the [onToolCall] callback fires for each
 * complete tool_call item in the final response.
 *
 * Returns false on network error; true on graceful completion.
 */
private suspend fun streamOneTurn(
    input: JSONArray,
    tools: ToolRegistry,
    onDelta: (text: String, toolCall: JSONObject?) -> Unit,
): Boolean = withContext(Dispatchers.IO) {
    val toolsJson = tools.manifestJson()
    val inputJson = input.toString()
    val body = buildString {
        append("{\"model\":\"$MODEL\",\"stream\":true,\"tools\":")
        append(toolsJson)
        append(",\"input\":")
        append(inputJson)
        append("}")
    }

    val conn = (URL("http://127.0.0.1:18925/v1/responses").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "text/event-stream")
        connectTimeout = 10_000
        readTimeout = 120_000
    }
    try {
        conn.outputStream.use { it.write(body.toByteArray()); it.flush() }
        if (conn.responseCode !in 200..299) {
            onDelta("[error ${conn.responseCode}]", null)
            return@withContext false
        }
        val reader = BufferedReader(InputStreamReader(conn.inputStream))
        reader.useLines { lines ->
            for (line in lines) {
                if (!line.startsWith("data:")) continue
                val payload = line.removePrefix("data:").trim()
                if (payload == "[DONE]") break
                try {
                    val obj = JSONObject(payload)
                    val type = obj.optString("type", "")
                    when {
                        // Streaming text delta
                        type.endsWith(".text_delta") || type.endsWith(".output_text.delta") -> {
                            val delta = obj.optString("delta", "")
                            if (delta.isNotEmpty()) onDelta(delta, null)
                        }
                        // Legacy fallback
                        type == "response.output_text.delta" || type == "message.delta" -> {
                            val delta = obj.optString("delta", "")
                            if (delta.isEmpty()) {
                                val msg = obj.optJSONObject("message")
                                if (msg != null) {
                                    val content = msg.optJSONArray("content")
                                    if (content != null) {
                                        for (i in 0 until content.length()) {
                                            val item = content.getJSONObject(i)
                                            val text = item.optString("text", "")
                                            if (text.isNotEmpty()) onDelta(text, null)
                                        }
                                    }
                                }
                            } else onDelta(delta, null)
                        }
                        // A tool call item is complete
                        type.endsWith(".tool_call") || type == "response.tool_call" -> {
                            onDelta("", obj)
                        }
                        // A tool call item in the streaming output
                        type.endsWith(".function_call") || type == "response.function_call_arguments.done" -> {
                            onDelta("", obj)
                        }
                        // Final response.completed: may include a
                        // top-level output array with tool calls.
                        type == "response.completed" || type == "response.done" -> {
                            val resp = obj.optJSONObject("response")
                            if (resp != null) {
                                val out = resp.optJSONArray("output")
                                if (out != null) {
                                    for (i in 0 until out.length()) {
                                        val item = out.getJSONObject(i)
                                        val t = item.optString("type", "")
                                        if (t == "tool_call" || t == "function_call") {
                                            onDelta("", item)
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (_: Throwable) {
                    // ignore malformed SSE lines
                }
            }
        }
        true
    } catch (t: Throwable) {
        onDelta("\n[network error: ${t.message}]", null)
        false
    } finally {
        conn.disconnect()
    }
}

private fun appendToMessage(messages: MutableList<ChatMessage>, id: Long, chunk: String) {
    // We're called from IO; switch back to UI thread.
    android.os.Handler(android.os.Looper.getMainLooper()).post {
        val idx = messages.indexOfFirst { it.id == id }
        if (idx >= 0) {
            val current = messages[idx]
            messages[idx] = current.copy(text = current.text + chunk)
        }
    }
}

private const val MODEL = "gpt-4o-mini" // overridden by the active provider in beta1+

private enum class ChatRole { USER, ASSISTANT, TOOL }
private data class ChatMessage(
    val id: Long = System.currentTimeMillis(),
    val role: ChatRole,
    val text: String,
)

@Composable
private fun MessageBubble(msg: ChatMessage) {
    val isUser = msg.role == ChatRole.USER
    val bg = if (isUser) MaterialTheme.colorScheme.primary
             else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (isUser) MaterialTheme.colorScheme.onPrimary
             else MaterialTheme.colorScheme.onSurface
    val shape = RoundedCornerShape(
        topStart = 16.dp,
        topEnd = 16.dp,
        bottomStart = if (isUser) 16.dp else 4.dp,
        bottomEnd = if (isUser) 4.dp else 16.dp,
    )
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Card(
            colors = CardDefaults.cardColors(containerColor = bg),
            shape = shape,
            modifier = Modifier.pressScale(pressedScale = 0.99f),
        ) {
            Text(
                text = msg.text.ifEmpty { "…" },
                color = fg,
                modifier = Modifier.padding(12.dp),
            )
        }
    }
}

@Composable
private fun PartialBubble(text: String) {
    if (text.isBlank()) return
    val alpha = rememberPulseAlpha(durationMs = 1000)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Start,
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f * alpha)
            ),
            shape = RoundedCornerShape(16.dp),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Mic,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "  $text",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun Composer(
    value: String,
    onChange: (String) -> Unit,
    enabled: Boolean,
    onSend: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Message Codex…") },
            enabled = enabled,
            maxLines = 4,
        )
        IconButton(
            onClick = onSend,
            enabled = enabled && value.isNotBlank(),
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(MaterialTheme.colorScheme.primary)
                .padding(8.dp),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = "Send",
                tint = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}
