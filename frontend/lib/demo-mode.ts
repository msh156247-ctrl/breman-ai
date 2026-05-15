export function isDemoModeEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_BREMEN_DEMO_MODE;
  if (typeof raw !== "string") return true;
  return raw.toLowerCase() !== "false";
}
