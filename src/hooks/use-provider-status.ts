import { useQuery } from "@tanstack/react-query";
import { getDroid } from "@/lib/bridge";

interface ServiceStatus {
  name: string;
  port: number;
  running: boolean;
  pid: string | null;
  cpu: string;
  mem: string;
}

const SERVICES = [
  // 18925 = CodexServerManager.SERVER_PORT (codex-web-local). The old value
  // here (3000) is the desktop dev-runner port, which never exists on-device.
  { name: "Codex CLI", port: 18925 },
  { name: "OpenClaw Gateway", port: 18790 },
  { name: "OpenCodex Proxy", port: 10101 },
  { name: "Hermes Web UI", port: 8788 },
];

function fetchServiceStatuses(): ServiceStatus[] {
  const droid = getDroid();
  if (!droid) {
    return SERVICES.map((s) => ({
      ...s,
      running: false,
      pid: null,
      cpu: "—",
      mem: "—",
    }));
  }

  return SERVICES.map((s) => {
    try {
      // lsof is often missing inside proot — fall back to the
      // /proc/net/tcp socket table (port in uppercase hex). The fallback
      // proves a listener exists but not its PID, so PID/CPU/MEM stay "—".
      const pidRaw = droid.run(
        `lsof -ti:${s.port} 2>/dev/null | head -1 || grep -c ":${s.port.toString(16).toUpperCase().padStart(4, "0")} " /proc/net/tcp 2>/dev/null || echo ""`,
      );
      let pid = pidRaw.trim();
      if (pid === "0") pid = "";
      if (!pid) {
        return { ...s, running: false, pid: null, cpu: "—", mem: "—" };
      }
      const psRaw = droid.run(
        `ps -p ${pid} -o %cpu,%mem 2>/dev/null | tail -1 || echo "0 0"`,
      );
      const parts = psRaw.trim().split(/\s+/);
      return {
        ...s,
        running: true,
        pid,
        cpu: (parts[0] || "—") + "%",
        mem: (parts[1] || "—") + "%",
      };
    } catch {
      return { ...s, running: false, pid: null, cpu: "—", mem: "—" };
    }
  });
}

export function useProviderStatus() {
  return useQuery({
    queryKey: ["provider-status"],
    queryFn: fetchServiceStatuses,
    refetchInterval: 10_000, // Poll every 10s
    enabled: typeof window !== "undefined",
    placeholderData: (prev) =>
      prev ??
      SERVICES.map((s) => ({
        ...s,
        running: false,
        pid: null,
        cpu: "—",
        mem: "—",
      })),
  });
}

export function useSystemMetrics() {
  return useQuery({
    queryKey: ["system-metrics"],
    queryFn: () => {
      const droid = getDroid();
      if (!droid) return null;

      try {
        const cpuRaw = droid.run(
          "top -bn1 | head -5 | grep 'Cpu' | awk '{print $2}' || echo 0",
        );
        const memRaw = droid.run(
          "free -m | awk '/Mem/{printf %.0f, $3/$2*100}' 2>/dev/null || echo 0",
        );
        const diskRaw = droid.run(
          "df -h / | awk 'NR==2{print $5}' 2>/dev/null || echo '—'",
        );
        const upRaw = droid.run(
          "uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'",
        );
        const netRaw = droid.run(
          "ip route get 1.1.1.1 2>/dev/null | awk '{print $7}' | head -1 || echo '—'",
        );

        return {
          cpu: parseFloat(cpuRaw.trim()) || 0,
          mem: parseFloat(memRaw.trim()) || 0,
          disk: diskRaw.trim() || "—",
          uptime: upRaw.trim() || "—",
          network: netRaw.trim() || "—",
        };
      } catch {
        return null;
      }
    },
    refetchInterval: 15_000,
    enabled: typeof window !== "undefined",
  });
}
