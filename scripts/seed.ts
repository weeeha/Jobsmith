import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";

async function main() {
  const email = "demo@example.com";
  const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString("base64url");

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Demo user" },
    headers: process.env.SETUP_TOKEN
      ? { "x-setup-token": process.env.SETUP_TOKEN }
      : undefined,
  });

  await scoped(getDb(), result.user.id).profile.upsert({
    headline: "Product designer exploring new roles",
    resumeMd: "# Demo resume\n\nThis is fictional seed data for local development.",
  });

  console.log(`Seeded demo user: ${email}`);
  if (!process.env.SEED_PASSWORD) {
    console.log(`Generated password (shown once): ${password}`);
  }
}

// getDb() keeps a pooled connection open, which would hold the process for
// several seconds after the work is done, so exit explicitly on both paths.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
