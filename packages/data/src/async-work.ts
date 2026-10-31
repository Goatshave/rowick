export function abortFailure(): Error {
  return new DOMException("Operation interrupted; its remote outcome may require confirmation", "AbortError");
}

/** Bounds active work; queued tasks are removed on abort/dispose. */
export function createWorkQueue(concurrency: number) {
  let active = 0, disposed = false;
  const waiting: Array<{ start: () => void; cancel: () => void }> = [];
  const drain = () => { while (!disposed && active < concurrency && waiting.length) waiting.shift()!.start(); };
  return {
    run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (disposed || signal.aborted) { reject(abortFailure()); return; }
        const job = {
          cancel: () => {
            const index = waiting.indexOf(job);
            if (index >= 0) waiting.splice(index, 1);
            signal.removeEventListener("abort", job.cancel); reject(abortFailure());
          },
          start: () => {
            signal.removeEventListener("abort", job.cancel);
            if (signal.aborted) { reject(abortFailure()); return; }
            active += 1;
            void Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; drain(); });
          },
        };
        signal.addEventListener("abort", job.cancel, { once: true });
        waiting.push(job); drain();
      });
    },
    dispose() { disposed = true; for (const job of [...waiting]) job.cancel(); },
  };
}

export async function interruptible<T>(task: () => T | Promise<T>, controller: AbortController, timeoutMs: number): Promise<T> {
  let rejectAbort!: () => void;
  const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(abortFailure()); });
  controller.signal.addEventListener("abort", rejectAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw abortFailure();
      return task();
    })]);
  } finally {
    clearTimeout(timer); controller.signal.removeEventListener("abort", rejectAbort);
  }
}
