export function Bad() {
  return (
    <div
      className="bg-zinc-100 text-slate-500 rounded-[14px] duration-[250ms]"
      style={{ color: "#ff0000" }}
    >
      <span className="bg-[oklch(0.5_0_0)]">oklch</span>
      <span style={{ background: "rgb(0, 0, 0)" }}>rgb</span>
      <span style={{ background: "hsl(0, 0%, 0%)" }}>hsl</span>
    </div>
  );
}
