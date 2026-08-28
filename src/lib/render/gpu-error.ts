export function describeGpuError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const gpu = typeof navigator !== "undefined" ? navigator.gpu : undefined;

  if (!gpu) {
    return "This browser has no WebGPU. Use latest Chrome, Edge, or Safari.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "WebGPU only runs on localhost or HTTPS. Open http://localhost:3000 rather than a LAN IP.";
  }
  if (message.includes("requestAdapter") || message.includes("returned null")) {
    return "Chrome found no GPU adapter. On Linux, open chrome://gpu and check WebGPU. If it is blocklisted, enable Vulkan under chrome://flags.";
  }
  return message;
}
