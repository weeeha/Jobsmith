export function BadEdgeCases() {
  const enabled = true; // still flags rgb(0, 0, 0) even inside a trailing comment
  return (
    <div>
      <span className="text-[var(--brand-accent)_solid]">compound var</span>
      <span className="text-[calc(var(--brand-accent)+2px)]">calc var</span>
      <span>{enabled ? "on" : "off"}</span>
    </div>
  );
}
