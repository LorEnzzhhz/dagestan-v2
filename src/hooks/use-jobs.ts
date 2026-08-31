import { useEffect, useState, useCallback } from "react";
import * as jobs from "@/lib/jobs";
import type { JobEvent } from "@/lib/jobs";

/** Subscribe to a single job's events. */
export function useJob(id: string | undefined) {
  const [event, setEvent] = useState<JobEvent | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    // Defer the reset so we don't setState synchronously inside the effect.
    queueMicrotask(() => {
      setEvent(null);
      setError(null);
    });
    return jobs.subscribeJob(id, setEvent, setError);
  }, [id]);

  return { event, error };
}

/** Create + subscribe to a new job. */
export function useJobCreate<TPayload extends object>(
  kind: jobs.JobKind | string,
  payload: TPayload,
) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<Error | null>(null);
  const { event, error: subscribeError } = useJob(jobId ?? undefined);
  // Stable stringified payload for dep array comparison.
  const payloadKey = JSON.stringify(payload);

  const start = useCallback(async () => {
    setJobId(null);
    setCreateError(null);
    try {
      const job = await jobs.createJob(kind, payload);
      setJobId(job.id);
    } catch (e) {
      setCreateError(e as Error);
    }
    // payloadKey is derived from `payload`; deps intentionally omit `payload`
    // because callers may pass a new object reference every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, payloadKey]);

  return { jobId, start, event, error: createError ?? subscribeError };
}
