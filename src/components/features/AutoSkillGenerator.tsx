import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Plus, Check, X, Eye, Brain, TrendingUp, Zap } from "lucide-react"
import {
  type SkillObservation,
  type GeneratedSkill,
  detectPatterns,
  generateSkill,
  loadObservations,
  saveObservations,
  loadGeneratedSkills,
  saveGeneratedSkills,
} from "@/lib/skill-generator";


export function AutoSkillGenerator() {
  const [observations, setObservations] = useState<SkillObservation[]>([]);
  const [generatedSkills, setGeneratedSkills] = useState<GeneratedSkill[]>([]);
  const [expandedObs, setExpandedObs] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [stats, setStats] = useState({ totalPatterns: 0, skillsGenerated: 0, autoApproved: 0 });

  // Load persisted data
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObservations(loadObservations());
    const skills = loadGeneratedSkills();
     
    setGeneratedSkills(skills);
     
    setStats({
      totalPatterns: loadObservations().length,
      skillsGenerated: skills.length,
      autoApproved: skills.filter((s) => s.source === "auto-generated").length,
    });
  }, []);

  // Scan for patterns from chat messages
  const scanPatterns = useCallback(() => {
    setIsScanning(true);
    // Scan patterns from chat history stored in localStorage
    const raw = localStorage.getItem("dagestan.chat-history");
    const history: { role: string; content: string }[] = raw ? JSON.parse(raw) : [];
    const newObs = detectPatterns(history);

    // Merge with existing, deduplicate by pattern name
    const existing = loadObservations();
    const existingPatterns = new Set(existing.map((o) => o.pattern));
    const merged = [...existing];

    for (const obs of newObs) {
      if (!existingPatterns.has(obs.pattern)) {
        merged.push(obs);
      } else {
        // Update frequency
        const idx = merged.findIndex((m) => m.pattern === obs.pattern);
        if (idx !== -1) {
          merged[idx] = { ...merged[idx], frequency: obs.frequency, examples: obs.examples };
        }
      }
    }

    saveObservations(merged);
    setObservations(merged);
    setStats((s) => ({ ...s, totalPatterns: merged.length }));
    setIsScanning(false);
  }, []);

  // Auto-generate skill from observation
  const handleGenerate = useCallback(
    (obs: SkillObservation) => {
      const skill = generateSkill(obs);
      if (!skill) return;

      const updatedObs = observations.map((o) =>
        o.id === obs.id ? { ...o, status: "approved" as const } : o,
      );
      saveObservations(updatedObs);
      setObservations(updatedObs);

      const existingSkills = loadGeneratedSkills();
      const updatedSkills = [...existingSkills, skill];
      saveGeneratedSkills(updatedSkills);
      setGeneratedSkills(updatedSkills);
      setStats((s) => ({ ...s, skillsGenerated: updatedSkills.length, autoApproved: s.autoApproved + 1 }));
    },
    [observations],
  );

  // Dismiss observation
  const handleDismiss = useCallback(
    (obsId: string) => {
      const updated = observations.map((o) =>
        o.id === obsId ? { ...o, status: "rejected" as const } : o,
      );
      saveObservations(updated);
      setObservations(updated);
    },
    [observations],
  );

  // Auto-create all pending skills with 3+ frequency
  const handleAutoCreateAll = useCallback(() => {
    const pending = observations.filter((o) => o.status === "pending" && o.frequency >= 3);
    const existingSkills = loadGeneratedSkills();
    const newSkills: GeneratedSkill[] = [];

    for (const obs of pending) {
      const skill = generateSkill(obs);
      if (skill) newSkills.push(skill);
    }

    if (newSkills.length > 0) {
      const updatedSkills = [...existingSkills, ...newSkills];
      saveGeneratedSkills(updatedSkills);
      setGeneratedSkills(updatedSkills);

      const updatedObs = observations.map((o) =>
        o.status === "pending" && o.frequency >= 3 ? { ...o, status: "approved" as const } : o,
      );
      saveObservations(updatedObs);
      setObservations(updatedObs);
      setStats((s) => ({
        ...s,
        skillsGenerated: updatedSkills.length,
        autoApproved: s.autoApproved + newSkills.length,
      }));
    }
  }, [observations]);

  const pendingCount = observations.filter((o) => o.status === "pending").length;
  const pendingHighConf = observations.filter((o) => o.status === "pending" && o.frequency >= 3).length;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Brain className="w-4 h-4" />} label="Patterns Found" value={stats.totalPatterns} color="text-violet-400" />
        <StatCard icon={<Sparkles className="w-4 h-4" />} label="Skills Generated" value={stats.skillsGenerated} color="text-cyan-400" />
        <StatCard icon={<Zap className="w-4 h-4" />} label="Auto-Created" value={stats.autoApproved} color="text-emerald-400" />
      </div>

      {/* Scan Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={scanPatterns}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {isScanning ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {isScanning ? "Scanning..." : "Scan Sessions"}
        </button>

        {pendingHighConf > 0 && (
          <button
            onClick={handleAutoCreateAll}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            Auto-Create {pendingHighConf} Skills
          </button>
        )}

        {pendingCount > 0 && (
          <span className="text-xs text-zinc-500">{pendingCount} pending patterns</span>
        )}
      </div>

      {/* Observations List */}
      <div className="space-y-2">
        <AnimatePresence>
          {observations.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-zinc-500"
            >
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No patterns detected yet.</p>
              <p className="text-xs mt-1">Start chatting and click "Scan Sessions" to detect repeating workflows.</p>
            </motion.div>
          )}

          {observations.map((obs) => (
            <motion.div
              key={obs.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={obs.status} />
                  <div>
                    <span className="text-sm font-medium capitalize">{obs.pattern.replace(/-/g, " ")}</span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {obs.frequency}× detected
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setExpandedObs(expandedObs === obs.id ? null : obs.id)}
                    className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  </button>
                  {obs.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleGenerate(obs)}
                        className="p-1.5 hover:bg-emerald-900/50 rounded transition-colors"
                        title="Create skill"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                      <button
                        onClick={() => handleDismiss(obs.id)}
                        className="p-1.5 hover:bg-red-900/50 rounded transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </>
                  )}
                  {obs.status === "approved" && (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </div>
              </div>

              {/* Expanded details */}
              <AnimatePresence>
                {expandedObs === obs.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                      <p className="text-xs text-zinc-400">
                        <strong>Suggested skill:</strong> {obs.suggestedSkill}
                      </p>
                      <div className="text-xs text-zinc-500">
                        <strong>Examples:</strong>
                        <ul className="mt-1 space-y-1">
                          {obs.examples.map((ex, i) => (
                            <li key={i} className="truncate pl-2 border-l border-zinc-700">
                              "{ex.slice(0, 80)}{ex.length > 80 ? "..." : ""}"
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Generated Skills */}
      {generatedSkills.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Generated Skills ({generatedSkills.length})
          </h4>
          {generatedSkills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center gap-3 p-2 bg-zinc-900/50 rounded-lg border border-zinc-800"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{skill.name}</p>
                <p className="text-xs text-zinc-500 truncate">{skill.tagline}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {skill.improvementLog.length > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {skill.improvementLog.length}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {skill.source === "auto-generated" ? "Auto" : "Manual"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-400",
    approved: "bg-emerald-400",
    rejected: "bg-red-400",
    "auto-created": "bg-cyan-400",
  };
  return (
    <div className={`w-2 h-2 rounded-full ${colors[status] || "bg-zinc-500"}`} />
  );
}
