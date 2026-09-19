import { requireUser } from "@/lib/auth/session";

export default async function BoardPage(props: PageProps<"/board">) {
  void props;
  await requireUser();
  return (
    <main className="p-6">
      <h1>Board</h1>
    </main>
  );
}
