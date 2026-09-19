import { requireUser } from "@/lib/auth/session";
import { logout } from "./actions";

export default async function HomePage(props: PageProps<"/">) {
  void props;
  const user = await requireUser();
  return (
    <main className="p-6">
      <p>Signed in as {user.email}</p>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
