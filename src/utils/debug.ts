export function debug(...args: any[]): void {
  if (process.env.DEBUG === "true") {
    console.log("[DEBUG]", ...args);
  }
}
