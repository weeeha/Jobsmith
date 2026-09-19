// A single-line comment mentioning rgb(), hsl() and #ff0000 is not scanned:
// this whole line is a comment, so check-tokens skips it entirely.

/**
 * Block comments are skipped line by line too, even one mentioning
 * oklch(0.5 0 0) or a Tailwind palette class like bg-zinc-100.
 */
export function CleanEdgeCases() {
  return (
    <div className="text-[var(--brand-accent)]">
      {/* JSX comments mentioning rgb(0, 0, 0) are skipped the same way. */}
      {/* check-tokens-ignore-next-line: "#face" is an anchor fragment, not a hex color */}
      <a href="#face">Jump to face</a>
    </div>
  );
}
