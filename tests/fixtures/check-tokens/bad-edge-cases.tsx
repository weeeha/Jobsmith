export function BadEdgeCases() {
  const bg = "#ff0000"; // a harmless trailing comment, not scanned
  return (
    <div>
      <span className="text-[var(--brand-accent)_solid]">compound var</span>
      <span className="text-[calc(var(--brand-accent)+2px)]">calc var</span>
      <span>{bg}</span>
    </div>
  );
}
