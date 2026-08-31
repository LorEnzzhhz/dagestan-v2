import { useCallback } from "react";
import { getDroid } from "@/lib/bridge";
import * as db from "@/lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useDeviceCommands() {
  const droid = getDroid();

  const pollResult = useCallback(async (
    commandId: string,
  ): Promise<{ exitCode: number; output: string }> => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const c = db.getCommand(commandId);
      if (c && c.status !== "pending" && c.status !== "running") {
        return { exitCode: c.exitCode ?? 1, output: c.output ?? "(no output)" };
      }
      await sleep(1500);
    }
    return { exitCode: 124, output: "timed out after 3 minutes" };
  }, []);

  const executeCommand = useCallback(async (
    cmd: string,
    options?: {
      timeout?: number;
      onProgress?: (output: string) => void;
      onAbort?: () => boolean;
    },
  ): Promise<{ exitCode: number; output: string }> => {
    const timeout = options?.timeout ?? 15 * 60_000;
    
    if (droid?.submit && droid.job) {
      const jobId = droid.submit(cmd);
      const deadline = Date.now() + timeout;
      
      for (;;) {
        if (options?.onAbort?.()) {
          try { droid.killJob?.(jobId); } catch { /* gone */ }
          return { exitCode: 130, output: "^C stopped by user" };
        }
        if (Date.now() > deadline) {
          try { droid.killJob?.(jobId); } catch { /* gone */ }
          return { exitCode: 124, output: "[timed out]" };
        }
        await sleep(700);
        try {
          const st = JSON.parse(droid.job(jobId)) as {
            done: boolean;
            exit: number;
            out: string;
          };
          if (st.done) {
            return { exitCode: st.exit, output: st.out || "(no output)" };
          }
          options?.onProgress?.(st.out);
        } catch { /* transient parse — keep polling */ }
      }
    }

    // Synchronous fallback
    const syncRaw = droid?.run(cmd) ?? "";
    const m = /^EXIT:(\d+)\n([\s\S]*)$/.exec(syncRaw);
    return {
      exitCode: m ? Number(m[1]) : 0,
      output: m ? m[2] : syncRaw,
    };
  }, [droid]);

  const killJob = useCallback((jobId: string) => {
    try { droid?.killJob?.(jobId); } catch { /* gone */ }
  }, [droid]);

  return {
    droid,
    pollResult,
    executeCommand,
    killJob,
    isAvailable: Boolean(droid),
  };
}
