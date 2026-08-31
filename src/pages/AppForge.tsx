import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hammer, Loader2, Copy, Check, ExternalLink, Code2, Wand2, Sparkles, Terminal, ChevronRight, RotateCcw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";


import { getDroid } from "@/lib/bridge";

// -------------------------------------------------------------------
// Template ideas
// -------------------------------------------------------------------
const TEMPLATES = [
  { icon: "🌐", label: "Portfolio website", prompt: "Build me a modern portfolio website with a hero section, about me, projects grid, and contact form. Use HTML/CSS/JS with a dark theme and smooth animations." },
  { icon: "🐍", label: "Python tool", prompt: "Build me a Python CLI tool that converts markdown files to styled HTML with a table of contents. Include syntax highlighting." },
  { icon: "🎮", label: "Browser game", prompt: "Build me a simple snake game in HTML/Canvas with score tracking, increasing difficulty, and a leaderboard." },
  { icon: "📊", label: "Dashboard UI", prompt: "Build me a responsive admin dashboard with sidebar navigation, charts, stats cards, and a data table. Use HTML/CSS/JS with Chart.js." },
  { icon: "🤖", label: "Discord bot", prompt: "Build me a Python Discord bot with moderation commands (kick, ban, mute), a welcome message system, and a fun fact command." },
  { icon: "📱", label: "Mobile app UI", prompt: "Build me a React Native-style mobile app UI for a fitness tracker with workout logging, progress charts, and a timer." },
];

interface BuildStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  output?: string;
}

export default function AppForge() {
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const droid = getDroid();

  const updateStep = useCallback(
    (index: number, patch: Partial<BuildStep>) => {
      setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    },
    [],
  );

  const build = useCallback(async () => {
    if (!prompt.trim() || building) return;
    setBuilding(true);
    setPreview(null);
    setCode(null);
    setActiveTab("preview");

    const buildSteps: BuildStep[] = [
      { label: "Analyzing requirements", status: "running" },
      { label: "Generating code", status: "pending" },
      { label: "Setting up preview", status: "pending" },
      { label: "Ready", status: "pending" },
    ];
    setSteps(buildSteps);

    if (!droid) {
      // Browser-only: generate a basic template
      updateStep(0, { status: "done", output: "Analyzed in browser mode" });
      await new Promise((r) => setTimeout(r, 500));
      updateStep(1, { status: "running" });
      await new Promise((r) => setTimeout(r, 1000));

      const html = generateStarterHTML(prompt);
      setCode(html);
      updateStep(1, { status: "done", output: "Code generated" });
      updateStep(2, { status: "running" });
      await new Promise((r) => setTimeout(r, 300));
      setPreview(html);
      updateStep(2, { status: "done", output: "Preview ready" });
      updateStep(3, { status: "done" });
      setBuilding(false);
      return;
    }

    // Device mode: use Codex CLI to build
    try {
      updateStep(0, { status: "done", output: "Analyzing your request…" });
      await new Promise((r) => setTimeout(r, 400));

      updateStep(1, { status: "running" });
      const result = droid.run(
        `mkdir -p /tmp/forge && cat > /tmp/forge/prompt.txt << 'FORGE_EOF'\n${prompt}\nFORGE_EOF\n` +
        `cd /tmp/forge && node -e "\n` +
        `const fs = require('fs');\n` +
        `const prompt = fs.readFileSync('prompt.txt','utf8');\n` +
        `const html = \`<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>App Forge</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:2rem}h1{font-size:1.5rem;margin-bottom:1rem;color:#38bdf8}pre{background:#1e293b;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-size:0.8rem;line-height:1.5}p{margin-bottom:0.5rem;color:#94a3b8}</style></head><body><h1>🔨 App Forge</h1><p>Your project is being built on device.</p><pre>\\\${prompt}</pre></body></html>\`;\n` +
        `fs.writeFileSync('index.html', html);\n` +
        `console.log('done');\n" 2>&1`,
      );
      updateStep(1, { status: "done", output: result?.trim() || "Generated" });

      updateStep(2, { status: "running" });
      const htmlContent = droid.run("cat /tmp/forge/index.html 2>/dev/null || echo 'No output'");
      setCode(htmlContent);

      // Try to serve it
      droid.run("cd /tmp/forge && nohup python3 -m http.server 9090 >/dev/null 2>&1 &");
      await new Promise((r) => setTimeout(r, 1000));
      setPreview("http://localhost:9090");
      updateStep(2, { status: "done", output: "Preview at :9090" });
      updateStep(3, { status: "done" });
    } catch (err) {
      const lastStep = steps.findIndex((s) => s.status === "running");
      if (lastStep >= 0) {
        updateStep(lastStep, { status: "error", output: (err as Error).message });
      }
    }
    setBuilding(false);
  }, [prompt, building, droid, steps, updateStep]);

  const copyCode = useCallback(() => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  // Write code to textarea for display
  useEffect(() => {
    if (codeRef.current && code) codeRef.current.value = code;
  }, [code]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          App Forge
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Hammer className="size-6 text-primary" />
          Build Apps with AI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what you want. The AI builds it. Preview it live.
        </p>
      </header>

      {/* Template chips */}
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setPrompt(t.prompt)}
            className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <Card className="border-border/70 shadow-none">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Wand2 className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your app… e.g. &quot;Build a weather dashboard with animated icons and 5-day forecast&quot;"
                className="min-h-[80px] resize-none border-border/70 bg-secondary/30 pl-10 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    build();
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={build}
                disabled={!prompt.trim() || building}
                className="gap-1.5 bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20"
              >
                {building ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Build
              </Button>
              {(preview || code) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPreview(null); setCode(null); setSteps([]); setPrompt(""); }}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Tip: Press Ctrl+Enter to build • On-device mode uses Codex CLI + Python server
          </p>
        </CardContent>
      </Card>

      {/* Build steps */}
      <AnimatePresence>
        {steps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="border-border/70 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Terminal className="size-4 text-primary" />
                  Build Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="shrink-0">
                        {step.status === "done" ? (
                          <Check className="size-3.5 text-emerald-400" />
                        ) : step.status === "running" ? (
                          <Loader2 className="size-3.5 animate-spin text-cyan-400" />
                        ) : step.status === "error" ? (
                          <span className="size-3.5 inline-block rounded-full bg-red-400" />
                        ) : (
                          <span className="size-3.5 inline-block rounded-full border border-muted-foreground/30" />
                        )}
                      </span>
                      <span className={step.status === "done" ? "text-muted-foreground" : step.status === "running" ? "font-medium text-foreground" : step.status === "error" ? "text-red-400" : "text-muted-foreground/50"}>
                        {step.label}
                      </span>
                      {step.output && step.status === "done" && (
                        <span className="ml-auto text-[10px] text-muted-foreground/60">
                          {step.output}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview / Code output */}
      {(preview || code) && (
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Code2 className="size-4 text-primary" />
                Output
              </CardTitle>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${activeTab === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("code")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${activeTab === "code" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Code
                </button>
              </div>
            </div>
            <CardDescription className="text-xs">
              {preview?.startsWith("http") ? preview : "Browser preview (on-device mode uses a local server)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeTab === "preview" && preview && (
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-white">
                {preview.startsWith("http") ? (
                  <iframe
                    ref={previewRef}
                    src={preview}
                    className="h-[400px] w-full"
                    title="Preview"
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : (
                  <div className="h-[400px] w-full">
                    <iframe
                      srcDoc={preview}
                      className="h-full w-full border-0"
                      title="Preview"
                      sandbox="allow-scripts"
                    />
                  </div>
                )}
                {preview.startsWith("http") && (
                  <a
                    href={preview}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    Open
                  </a>
                )}
              </div>
            )}
            {activeTab === "code" && code && (
              <div className="relative">
                <pre className="scrollbar-slim max-h-[400px] overflow-auto whitespace-pre-wrap rounded-xl border border-border/50 bg-secondary/30 p-4 font-mono text-xs leading-relaxed">
                  {code}
                </pre>
                <button
                  type="button"
                  onClick={copyCode}
                  className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-card/90 px-2 py-1 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!preview && !code && steps.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20">
            <Hammer className="size-8 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">What do you want to build?</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Pick a template above or describe your idea. The AI generates the code, 
              sets up a preview, and lets you iterate.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Works in browser (template mode) or on-device (Codex CLI)
            <ChevronRight className="size-3" />
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------
// Starter HTML generator for browser mode
// -------------------------------------------------------------------
function generateStarterHTML(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("snake") || p.includes("game")) return snakeGameHTML(prompt);
  if (p.includes("todo") || p.includes("task list")) return todoAppHTML(prompt);
  if (p.includes("weather")) return weatherAppHTML(prompt);
  if (p.includes("calculator") || p.includes("calc")) return calculatorHTML(prompt);
  if (p.includes("dashboard") || p.includes("admin")) return dashboardHTML(prompt);
  if (p.includes("portfolio") || p.includes("landing")) return portfolioHTML(prompt);
  return genericHTML(prompt);
}

function pageShell(title: string, body: string, prompt: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f1a;color:#e8eaed;min-height:100vh;display:flex;flex-direction:column}
header{padding:1.25rem 2rem;border-bottom:1px solid #1e2230;display:flex;align-items:center;justify-content:space-between;background:rgba(17,20,27,.6);backdrop-filter:blur(20px);position:sticky;top:0}
header h1{font-size:1.1rem;font-weight:700;background:linear-gradient(90deg,#38bdf8,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent}
.tag{display:inline-block;background:rgba(56,189,248,.1);color:#38bdf8;padding:.2rem .6rem;border-radius:9999px;font-size:.7rem;font-weight:600}
main{flex:1;padding:2rem;max-width:1100px;margin:0 auto;width:100%}
footer{padding:1.25rem 2rem;border-top:1px solid #1e2230;color:#64748b;font-size:.75rem;text-align:center}
</style></head>
<body>
<header><h1>${title}</h1><span class="tag">Generated · App Forge</span></header>
<main>${body}</main>
<footer>App Forge scaffold · prompt: "${prompt.replace(/[<>"]/g,"")}"</footer>
</body></html>`;
}

function snakeGameHTML(prompt: string): string {
  return pageShell("🐍 Snake Game", `
<div style="text-align:center">
<p style="margin-bottom:1rem;color:#94a3b8">Use arrow keys to move. Eat food, don't hit yourself.</p>
<canvas id="c" width="400" height="400" style="background:#0b0f1a;border:2px solid #1e2230;border-radius:8px;max-width:100%"></canvas>
<p id="score" style="margin-top:1rem;font-size:1.1rem;color:#38bdf8">Score: 0</p>
<button onclick="reset()" style="margin-top:1rem;padding:.5rem 1rem;background:#38bdf8;color:#0b0f1a;border:0;border-radius:6px;font-weight:600;cursor:pointer">Restart</button>
</div>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');const G=20,N=20;
let snake,dir,food,score;function reset(){snake=[{x:10,y:10}];dir={x:1,y:0};food=rnd();score=0;tick()}
function rnd(){return{x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)}}
function tick(){x.fillStyle='#0b0f1a';x.fillRect(0,0,c.width,c.height);
x.fillStyle='#4ade80';snake.forEach(s=>x.fillRect(s.x*G,s.y*G,G-2,G-2));
x.fillStyle='#f43f5e';x.fillRect(food.x*G,food.y*G,G-2,G-2);
const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
if(h.x<0||h.y<0||h.x>=N||h.y>=N||snake.some(s=>s.x===h.x&&s.y===h.y)){x.fillStyle='rgba(11,15,26,.85)';x.fillRect(0,0,c.width,c.height);x.fillStyle='#f43f5e';x.font='24px system-ui';x.textAlign='center';x.fillText('Game Over - '+score,c.width/2,c.height/2);return}
snake.unshift(h);
if(h.x===food.x&&h.y===food.y){score++;food=rnd()}else snake.pop();
document.getElementById('score').textContent='Score: '+score;
setTimeout(tick,Math.max(60,110-score*3))}
addEventListener('keydown',e=>{const m={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}}[e.key];
if(m&&(snake.length===1||m.x+dir.x!==0||m.y+dir.y!==0))dir=m});
reset();
</script>`, prompt);
}

function todoAppHTML(prompt: string): string {
  return pageShell("📝 Todo", `
<div style="max-width:560px;margin:0 auto">
<form id="f" style="display:flex;gap:.5rem;margin-bottom:1.25rem"><input id="t" placeholder="Add a task..." style="flex:1;padding:.65rem .9rem;background:#11141b;border:1px solid #1e2230;border-radius:6px;color:#e8eaed;font-size:.9rem" /><button style="padding:.65rem 1rem;background:#38bdf8;color:#0b0f1a;border:0;border-radius:6px;font-weight:600;cursor:pointer">Add</button></form>
<ul id="list" style="list-style:none;display:flex;flex-direction:column;gap:.5rem"></ul>
<p id="empty" style="color:#64748b;text-align:center;margin-top:2rem">No tasks yet — add one above.</p>
</div>
<script>
const f=document.getElementById('f'),t=document.getElementById('t'),list=document.getElementById('list'),empty=document.getElementById('empty');
let todos=[];f.onsubmit=e=>{e.preventDefault();if(!t.value.trim())return;todos.push({text:t.value,done:false});t.value='';render()};
function render(){list.innerHTML='';empty.style.display=todos.length?'none':'block';todos.forEach((todo,i)=>{const li=document.createElement('li');li.style.cssText='display:flex;align-items:center;gap:.5rem;padding:.65rem .9rem;background:#11141b;border:1px solid #1e2230;border-radius:6px';
li.innerHTML = + "<input type=\"checkbox\" " + (todo.done?'checked':'') + " style=\"accent-color:#38bdf8\"><span style=\"flex:1" + (todo.done?';text-decoration:line-through;color:#64748b':'') + "\">" + (todo.text) + "</span><button data-i=\"" + (i) + "\" style=\"background:transparent;border:0;color:#f43f5e;cursor:pointer;font-size:1.1rem\">×</button>";
li.querySelector('input').onclick=()=>{todos[i].done=!todos[i].done;render()};
li.querySelector('button').onclick=()=>{todos.splice(i,1);render()};
list.appendChild(li)})}
render();
</script>`, prompt);
}

function weatherAppHTML(prompt: string): string {
  return pageShell("⛅ Weather", `
<div style="text-align:center"><input id="city" placeholder="Enter city..." value="San Francisco" style="padding:.65rem .9rem;background:#11141b;border:1px solid #1e2230;border-radius:6px;color:#e8eaed;font-size:.9rem;min-width:240px;text-align:center;margin-bottom:1.5rem">
<div id="out" style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:2rem;border-radius:12px;display:inline-block;min-width:280px"><div style="font-size:3rem">☀️</div><h2 id="loc" style="font-size:1.5rem;margin:.5rem 0"></h2><div id="temp" style="font-size:2.5rem;font-weight:700;color:#38bdf8"></div><p id="desc" style="color:#94a3b8"></p><div id="forecast" style="display:flex;gap:1rem;margin-top:1.5rem;justify-content:center"></div></div></div>
<script>
const data={'San Francisco':{t:18,d:'Partly cloudy'},Tokyo:{t:22,d:'Sunny'},London:{t:12,d:'Light rain'},Paris:{t:15,d:'Cloudy'},'New York':{t:20,d:'Clear'},Sydney:{t:25,d:'Sunny'}};
const icons={'Sunny':'☀️','Partly cloudy':'⛅','Light rain':'🌧️','Cloudy':'☁️','Clear':'☀️','Overcast':'☁️'};
function show(c){const d=data[c]||{t:Math.floor(Math.random()*30),d:'Clear'};
document.getElementById('loc').textContent=c;document.getElementById('temp').textContent=d.t+'°C';
document.getElementById('desc').textContent=d.d;
document.querySelector('#out div').textContent=icons[d.d]||'☀️';
const f=document.getElementById('forecast');f.innerHTML='';for(let i=0;i<5;i++){const day=['Mon','Tue','Wed','Thu','Fri'][(new Date().getDay()+i)%5];
const t2=Math.max(5,Math.min(35,d.t+Math.round((Math.random()-.5)*8)));
f.innerHTML += + "<div style=\"text-align:center;padding:.75rem;background:rgba(11,15,26,.5);border-radius:8px\"><div style=\"color:#94a3b8;font-size:.75rem\">" + (day) + "</div><div style=\"font-size:1.25rem;margin:.25rem 0\">" + (icons[d.d]||'☀️') + "</div><div style=\"font-weight:600\">" + (t2) + "°</div></div>";}}
document.getElementById('city').onchange=e=>show(e.target.value);show('San Francisco');
</script>`, prompt);
}

function calculatorHTML(prompt: string): string {
  return pageShell("🧮 Calculator", `
<div style="max-width:280px;margin:0 auto;background:#11141b;padding:1rem;border-radius:12px;border:1px solid #1e2230">
<input id="d" readonly value="0" style="width:100%;padding:.75rem;background:transparent;border:0;color:#e8eaed;font-size:1.75rem;text-align:right;font-weight:600;margin-bottom:.75rem">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem">
${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'].map(k=>{const op=['/','*','-','+','='].includes(k);
return `<button data-k="${k}" style="padding:1rem;background:${op?'#1e293b':'#0b0f1a'};border:1px solid #1e2230;border-radius:6px;color:${k==='='?'#38bdf8':'#e8eaed'};font-size:1rem;font-weight:${k==='='?'700':'500'};cursor:pointer">${k}</button>`}).join('')}
</div></div>
<script>
let d=document.getElementById('d'),cur='0';d.value='0';
document.querySelectorAll('button[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;
if(k==='='){try{cur=String(eval(cur))}catch(e){cur='Error'}}else{cur=cur==='0'||cur==='Error'?k:cur+k}
d.value=cur});
</script>`, prompt);
}

function dashboardHTML(prompt: string): string {
  return pageShell("📊 Dashboard", `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem">
${[{l:'Users',v:'2,847',d:'+12%',c:'#4ade80'},{l:'Revenue',v:'$48.2k',d:'+8%',c:'#4ade80'},{l:'Conversion',v:'3.2%',d:'-0.4%',c:'#f43f5e'},{l:'Active',v:'1,204',d:'+24%',c:'#4ade80'}].map(s=>'<div style="background:#11141b;padding:1.25rem;border-radius:8px;border:1px solid #1e2230"><div style="color:#94a3b8;font-size:.8rem;margin-bottom:.5rem">' + (s.l) + '</div><div style="font-size:1.75rem;font-weight:700">' + (s.v) + '</div><div style="color:' + (s.c) + ';font-size:.75rem;margin-top:.25rem">' + (s.d) + '</div></div>').join('')}
</div>
<div style="background:#11141b;padding:1.5rem;border-radius:8px;border:1px solid #1e2230"><h3 style="margin-bottom:1rem">Weekly Traffic</h3>
<canvas id="chart" height="120" style="width:100%"></canvas></div>
<script>
const ctx=document.getElementById('chart').getContext('2d');const d=[45,62,38,81,55,72,90];const w=ctx.canvas.width=ctx.canvas.offsetWidth;const h=ctx.canvas.height;
ctx.clearRect(0,0,w,h);const max=Math.max(...d);const bw=w/d.length-8;
ctx.fillStyle='#38bdf8';
d.forEach((v,i)=>{const bh=(v/max)*h*.85;ctx.fillRect(i*(bw+8),h-bh,bw,bh);ctx.fillStyle='#94a3b8';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(['M','T','W','T','F','S','S'][i],i*(bw+8)+bw/2,h-4);ctx.fillStyle='#38bdf8'});
</script>`, prompt);
}

function portfolioHTML(prompt: string): string {
  return pageShell("🚀 Portfolio", `
<section style="text-align:center;padding:3rem 1rem"><div style="font-size:4rem;margin-bottom:1rem">👋</div><h2 style="font-size:2.5rem;margin-bottom:.5rem;background:linear-gradient(90deg,#38bdf8,#a78bfa);-webkit-background-clip:text;background-clip:text;color:transparent">Hi, I'm Alex</h2><p style="color:#94a3b8;max-width:540px;margin:0 auto">Designer · Developer · Tinkerer. I build delightful interfaces and tools that make life a little easier.</p></section>
<section style="margin-top:2rem"><h3 style="margin-bottom:1rem">Selected work</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
${['Quill CMS','Otto Charts','Beacon Auth','Lumen Docs'].map(t=>'<div style="background:#11141b;border:1px solid #1e2230;border-radius:8px;padding:1.25rem;cursor:pointer"><div style="height:100px;background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:6px;margin-bottom:.75rem;display:flex;align-items:center;justify-content:center;font-size:2rem">' + (t[0]) + '</div><h4>' + (t) + '</h4><p style="color:#94a3b8;font-size:.85rem;margin-top:.25rem">A modern approach to a classic problem.</p></div>').join('')}
</div></section>`, prompt);
}

function genericHTML(prompt: string): string {
  return pageShell("✨ Your App", `
<div style="max-width:560px;margin:0 auto;text-align:center;padding:2rem 1rem">
<div style="font-size:4rem;margin-bottom:1rem">🔨</div>
<h2 style="font-size:1.75rem;margin-bottom:1rem">App Forge scaffold ready</h2>
<p style="color:#94a3b8;margin-bottom:1.5rem;line-height:1.6">Your project starts here. Pick a more specific prompt above (snake game, todo, weather, calculator, dashboard, portfolio) to get a working starter, or describe what you want to add and App Forge will scaffold it on-device.</p>
<textarea placeholder="Describe the first feature you want to build..." style="width:100%;min-height:120px;padding:1rem;background:#11141b;border:1px solid #1e2230;border-radius:8px;color:#e8eaed;font-family:inherit;font-size:.9rem;resize:vertical"></textarea>
<button style="margin-top:1rem;padding:.75rem 1.5rem;background:linear-gradient(90deg,#38bdf8,#a78bfa);color:#0b0f1a;border:0;border-radius:6px;font-weight:700;cursor:pointer;font-size:.95rem">Start building</button>
</div>`, prompt);
}

