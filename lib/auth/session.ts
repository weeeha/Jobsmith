import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./index";

// cache() deduplicates within one request: the layout and the page it
// wraps each call requireUser()/getUser() independently, and without this
// they would each look up the session separately.
export const getUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
