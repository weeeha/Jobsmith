import { requireUser } from "@/lib/auth/session";

export default async function HomePage() {
  await requireUser();
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Home</h1>
      <p className="mt-2 text-muted-foreground">Nothing needs attention yet.</p>
    </div>
  );
}
