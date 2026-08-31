import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion"
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  RotateCcw,
  BarChart3,
  Zap,
} from "lucide-react";
import {
  type ExecutionLog,
  type GeneratedSkill,
  loadExecutionLogs,
  loadGeneratedSkills,
  analyzeExecution,
  applyImprovement,
  saveGeneratedSkills,
} from "@/lib/skill-generator";

export function SkillSelfImprover() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [skills, setSkills] = useState<GeneratedSkill[]>([]);
  const [improvements, setImprovements] = useState<{ skillId: string; improvement: ReturnType<typeof analyzeExecution> }[]>([]);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  useEffect(() => {
    const allLogs = loadExecutionLogs();
    const allSkills = loadGeneratedSkills();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogs(allLogs);
     
    setSkills(allSkills);

    // Analyze failed executions for improvement opportunities
    const pendingImprovements = allLogs
      .filter((l) => !l.success)
      .map((log) => {
        const skill = allSkills.find((s) => s.id === log.skillId);
        if (!skill) return null;
        return { skillId: skill.id, improvement: analyzeExecution(log, skill) };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.improvement !== null);

    setImprovements(pendingImprovements);
  }, []);

  const handleApplyImprovement = useCallback(
    (skillId: string, idx: number) => {
      const skill = skills.find((s) => s.id === skillId);
      const improvement = improvements[idx]?.improvement;
      if (!skill || !improvement) return;

      const updated = applyImprovement(skill, improvement);
      const updatedSkills = skills.map((s) => (s.id === skillId ? updated : s));
      saveGeneratedSkills(updatedSkills);
      setSkills(updatedSkills);
      setImprovements((prev) => prev.filter((_, i) => i !== idx));
    },
    [skills, improvements],
  );

  // Compute stats
  const successRate = logs.length > 0 ? ((logs.filter((l) => l.success).length / logs.length) * 100).toFixed(1) : "0";
  const avgDuration = logs.length > 0 ? (logs.reduce((sum, l) => sum + l.duration, 0) / logs.length / 1000).toFixed(1) : "0";
  const failedCount = logs.filter((l) => !l.success).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <MiniStat icon={<BarChart3 className="w-3.5 h-3.5" />} label="Executions" value={logs.length} color="text-blue-400" />
        <MiniStat icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Success" value={`${successRate}%`} color="text-emerald-400" />
        <MiniStat icon={<Clock className="w-3.5 h-3.5" />} label="Avg Time" value={`${avgDuration}s`} color="text-violet-400" />
        <MiniStat icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Failed" value={failedCount} color="text-red-400" />
      </div>

      {/* Pending Improvements */}
      {improvements.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-400" />
            Pending Self-Improvements ({improvements.length})
          </h4>
          {improvements.map((imp, idx) => (
            <motion.div
              key={`${imp.skillId}-${idx}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-amber-900/50 bg-amber-950/20 rounded-lg p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-200">
                    {skills.find((s) => s.id === imp.skillId)?.name || imp.skillId}
                  </p>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    {imp.improvement?.trigger === "user-correction"
                      ? "User correction detected"
                      : "Execution failure detected"}
                  </p>
                </div>
                <button
                  onClick={() => handleApplyImprovement(imp.skillId, idx)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-medium transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Apply Fix
                </button>
              </div>
              {imp.improvement?.reason && (
                <p className="text-xs text-zinc-500 mt-2 pl-3 border-l-2 border-amber-800">
                  {imp.improvement.reason}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Execution Logs */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          Recent Executions
        </h4>
        {logs.length === 0 && (
          <div className="text-center py-6 text-zinc-500">
            <RotateCcw className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No skill executions logged yet.</p>
            <p className="text-xs mt-1">Generated skills will log their executions here.</p>
          </div>
        )}
        {logs
          .slice(-10)
          .reverse()
          .map((log, i) => (
            <div
              key={`${log.timestamp}-${i}`}
              className="flex items-center gap-3 p-2 bg-zinc-900/30 rounded-lg text-xs cursor-pointer hover:bg-zinc-900/60 transition-colors"
              onClick={() => setSelectedLog(selectedLog === `${log.timestamp}-${i}` ? null : `${log.timestamp}-${i}`)}
            >
              {log.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <span className="flex-1 truncate text-zinc-300">
                {skills.find((s) => s.id === log.skillId)?.name || log.skillId}
              </span>
              <span className="text-zinc-500">{(log.duration / 1000).toFixed(1)}s</span>
              <span className="text-zinc-600">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
      </div>

      {/* Skill Health */}
      {skills.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Skill Health
          </h4>
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center gap-3 p-2 bg-zinc-900/30 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{skill.name}</p>
                <p className="text-xs text-zinc-500">
                  {skill.executionCount} runs · {skill.successRate.toFixed(0)}% success
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${skill.successRate}%`,
                      backgroundColor:
                        skill.successRate >= 90
                          ? "#22c55e"
                          : skill.successRate >= 70
                            ? "#eab308"
                            : "#ef4444",
                    }}
                  />
                </div>
                {skill.improvementLog.length > 0 && (
                  <span className="text-xs text-amber-400 flex items-center gap-0.5">
                    <Wrench className="w-3 h-3" />
                    {skill.improvementLog.length}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
