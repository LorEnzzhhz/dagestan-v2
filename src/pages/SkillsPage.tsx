import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SKILLS, useSkills, getSkillsByCategory } from "@/hooks/use-skills";
import * as db from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { KeyRound, Plus, TerminalSquare, Trash2, Zap, Store, HardDrive } from "lucide-react";
import { SkillStore } from "@/components/features/SkillStore";
import { LocalModelsBrowser } from "@/components/features/LocalModelsBrowser";

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  core: { label: "Core Skills", description: "Essential capabilities for everyday use" },
  advanced: { label: "Advanced Skills", description: "Power tools for specific tasks" },
  creative: { label: "Creative Skills", description: "Imagination and reasoning boosters" },
  system: { label: "System Skills", description: "Security and system utilities" },
};

export default function SkillsPage() {
  const { enabled, toggle } = useSkills();
  const [devices, setDevices] = useState<db.AgentDevice[]>(
    () => db.listDevices(),
  );
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = db.createDevice(name.trim());
      setNewToken(res.token);
      setName("");
      setDevices(db.listDevices());
    } finally {
      setBusy(false);
    }
  };

  const grouped = getSkillsByCategory();
  const enabledCount = enabled.length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Superpowers
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Skills & plugins</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Toggle abilities that are injected into every conversation.{" "}
          <span className="font-medium text-primary">{enabledCount}</span> of{" "}
          <span className="font-medium">{SKILLS.length}</span> skills enabled.
        </p>
      </header>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="store"><Store className="mr-1 size-3" /> Store</TabsTrigger>
          <TabsTrigger value="local-models"><HardDrive className="mr-1 size-3" /> Local</TabsTrigger>
          <TabsTrigger value="all">All ({SKILLS.length})</TabsTrigger>
          {grouped.map((g) => (
            <TabsTrigger key={g.category} value={g.category}>
              {CATEGORY_LABELS[g.category]?.label.split(" ")[0]} ({g.skills.length})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="store" className="mt-4">
          <SkillStore />
        </TabsContent>

        <TabsContent value="local-models" className="mt-4">
          <LocalModelsBrowser />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {grouped.map((g) => (
            <div key={g.category} className="mb-6">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[g.category]?.label}
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                {CATEGORY_LABELS[g.category]?.description}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {g.skills.map((skill, i) => {
                  const on = enabled.includes(skill.id);
                  return (
                    <motion.div
                      key={skill.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Card
                        className={`h-full border shadow-none transition-colors ${
                          on ? "border-primary/40" : "border-border/70"
                        }`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <skill.icon className={`size-5 ${on ? "text-primary" : "text-muted-foreground"}`} />
                            <Switch checked={on} onCheckedChange={() => toggle(skill.id)} />
                          </div>
                          <CardTitle className="pt-1 text-sm">{skill.name}</CardTitle>
                          <CardDescription className="text-xs">{skill.tagline}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {skill.description}
                          </p>
                          {on && (
                            <Badge
                              variant="outline"
                              className="mt-2 border-primary/30 bg-primary/10 text-[9px] text-primary"
                            >
                              Active
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        {grouped.map((g) => (
          <TabsContent key={g.category} value={g.category} className="mt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {g.skills.map((skill, i) => {
                const on = enabled.includes(skill.id);
                return (
                  <motion.div
                    key={skill.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card
                      className={`h-full border shadow-none transition-colors ${
                        on ? "border-primary/40" : "border-border/70"
                      }`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <skill.icon className={`size-5 ${on ? "text-primary" : "text-muted-foreground"}`} />
                          <Switch checked={on} onCheckedChange={() => toggle(skill.id)} />
                        </div>
                        <CardTitle className="pt-1 text-sm">{skill.name}</CardTitle>
                        <CardDescription className="text-xs">{skill.tagline}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {skill.description}
                        </p>
                        {skill.id === "web" && (
                          <p className="mt-2 rounded bg-secondary/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                            Targets YouTube · TikTok · Instagram · Facebook · GitHub · Brave
                            when you mention them — results show real site icons.
                          </p>
                        )}
                        {on && (
                          <Badge
                            variant="outline"
                            className="mt-2 border-primary/30 bg-primary/10 text-[9px] text-primary"
                          >
                            Active
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Device agent */}
      <Card className="border-border/70 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TerminalSquare className="size-4 text-primary" />
            Device agent — silent root shell
          </CardTitle>
          <CardDescription className="text-xs">
            Runs on your Android phone (Termux) or any Linux box. Gives the AI a
            full root Debian or Alpine container with headless Chromium; every
            command executes quietly via <span className="font-mono">/bin/bash -lc</span> and
            only a collapsed chip is shown in chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pixel phone"
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={busy}>
              <Plus className="size-4" /> Create agent
            </Button>
          </div>

          {newToken && (
            <Alert className="border-primary/40">
              <KeyRound className="size-4 text-primary" />
              <AlertTitle className="text-sm">Agent token — copy it now</AlertTitle>
              <AlertDescription className="break-all font-mono text-xs">
                {newToken}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            {(devices ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No devices yet. Create one above, then run the setup script below
                on your phone.
              </p>
            )}
            {(devices ?? []).map((d) => {
              const online = Boolean(d.online) && now - (d.lastSeen ?? 0) < 90_000;
              return (
                <div
                  key={d._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          online
                            ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
                            : "bg-muted-foreground/40"
                        }`}
                      />
                      {d.name}
                      {d.distro && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {d.distro}
                        </Badge>
                      )}
                    </p>
                    <p className="truncate pl-4 text-[11px] text-muted-foreground">
                      {online
                        ? "online — ready for silent commands"
                        : `last seen ${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "never"}`}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => { db.deleteDevice(d._id); setDevices(db.listDevices()); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <details className="group rounded-lg border border-border/70 bg-secondary/30 p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold">
              📱 Phone setup (Termux) — tap to expand
            </summary>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
              <li>
                Install Termux (from F-Droid), then:
                <pre className="scrollbar-slim mt-1 overflow-x-auto rounded bg-background/80 p-2 font-mono text-[11px]">{`pkg update -y && pkg install proot-distro tar curl jq -y`}</pre>
              </li>
              <li>
                Pull the runner and set your token (created above):
                <pre className="scrollbar-slim mt-1 overflow-x-auto rounded bg-background/80 p-2 font-mono text-[11px]">{`curl -O $SITE_URL/dagestan-agent.sh
chmod +x dagestan-agent.sh
export DAGESTAN_SITE="$SITE_URL"
export DAGESTAN_TOKEN="<your token>"
./dagestan-agent.sh debian   # or: ./dagestan-agent.sh alpine`}</pre>
              </li>
              <li>
                The script boots a <b>full root container</b> (Debian or Alpine),
                installs Python/Node and <b>headless Chromium</b>, then polls for
                commands. Anything the model asks — installing tools, running
                scripts, browsing headlessly — executes as root inside it.
              </li>
              <li>
                Come back to Chat: the ⚡ badge lights up and the model can now
                act silently on your device until you press stop.
              </li>
            </ol>
          </details>

          <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            <Zap className="mt-0.5 size-3.5 shrink-0 text-primary" />
            Commands run only on devices you register, stay on your hardware, and
            are never sent anywhere except this app's backend. There's no
            unrestricted "do anything" mode — providers cut off keys that attempt
            to bypass their safety rules.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
