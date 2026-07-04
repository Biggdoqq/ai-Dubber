import { useCallback, useRef, useState } from "react";
import { api, pollJob } from "../api/client";
import type { Job } from "../api/types";

export function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const idRef = useRef<string | null>(null);

  const start = useCallback(
    async (begin: () => Promise<{ job_id: string }>): Promise<Job> => {
      setRunning(true);
      try {
        const { job_id } = await begin();
        idRef.current = job_id;
        const final = await pollJob(job_id, (j) => setJob(j));
        return final;
      } finally {
        setRunning(false);
      }
    },
    []
  );

  const cancel = useCallback(async () => {
    if (idRef.current) await api.cancelJob(idRef.current).catch(() => {});
  }, []);

  return { job, running, start, cancel };
}
