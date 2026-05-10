export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("@/lib/worker");
    const { scheduleReaper } = await import("@/lib/queue");

    startWorker();
    scheduleReaper().catch((err) => {
      console.error("Failed to schedule reaper:", err);
    });
  }
}