// Feature flags are process-wide server env vars, not per-project or per-workspace settings.
// Usage:
//   FACET_RENDER=1 enables the optional director facet LLM polish path.
//   MOTION_PROMPT_IN_VIDEO=true can gate video motion-prompt experiments.
// Tests may pass opts.override to inject an explicit value without mutating global process.env.
export function isFlagOn(name: string, opts?: { override?: boolean }): boolean {
  if (typeof opts?.override === 'boolean') return opts.override

  const value = typeof process === 'undefined' ? undefined : process.env?.[name]
  return value === '1' || value?.toLowerCase() === 'true'
}
