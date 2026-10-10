export const BROWSER_SMOKE_API_PORT = 3013;

export function assertDedicatedSmokeApiPortAvailable(port, available, owners) {
  if (available) {
    return;
  }

  const ownerDescription = owners
    .map(({ pid, cwd }) => `PID ${pid} (${cwd})`)
    .join(", ");
  throw new Error(
    `Dedicated browser-smoke API port ${port} is occupied${ownerDescription ? `: ${ownerDescription}` : ""}. No process was reused or stopped.`,
  );
}

export function isOwnedSmokeApiListener(owner, processId, apiDirectory) {
  return (
    owner.pid === String(processId) &&
    owner.cwd === apiDirectory &&
    owner.command.includes("dist/main.js")
  );
}
