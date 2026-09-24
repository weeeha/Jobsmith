import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { scoped, type Scoped } from "@/lib/db/scoped";
import { createOpportunity } from "@/lib/pipeline/create";
import { placeOpportunity } from "@/lib/pipeline/place";
import { closeOpportunity } from "@/lib/pipeline/close";
import { scheduleStage } from "@/lib/pipeline/schedule";
import { addNote } from "@/lib/pipeline/notes";
import { addPersonToOpportunity } from "@/lib/people";
import type { Result } from "@/lib/result";

function unwrap<T>(result: Result<T, string>, what: string): T {
  if (!result.ok) {
    throw new Error(`seed: ${what} failed: ${result.code}: ${result.message}`);
  }
  return result.data;
}

async function seedJobs(s: Scoped) {
  // Acme Robotics: one job left in Saved, one moved to Applied.
  unwrap(
    await createOpportunity(s, {
      companyName: "Acme Robotics",
      roleTitle: "Senior Product Designer",
      location: "Remote",
      workMode: "remote",
    }),
    "create Senior Product Designer at Acme Robotics",
  );

  const staffAtAcme = unwrap(
    await createOpportunity(s, {
      companyName: "Acme Robotics",
      roleTitle: "Staff Product Designer",
      location: "Remote",
      workMode: "remote",
      compMin: 150000,
      compMax: 185000,
      compCurrency: "USD",
    }),
    "create Staff Product Designer at Acme Robotics",
  );
  unwrap(await placeOpportunity(s, staffAtAcme.id, "applied"), "place Staff Product Designer in Applied");

  // Northwind Labs: one job in Recruiter screen, one in Hiring manager with
  // a scheduled call, a linked person and a note.
  const productAtNorthwind = unwrap(
    await createOpportunity(s, {
      companyName: "Northwind Labs",
      roleTitle: "Product Designer",
      location: "Berlin, Germany",
      workMode: "hybrid",
    }),
    "create Product Designer at Northwind Labs",
  );
  unwrap(
    await placeOpportunity(s, productAtNorthwind.id, "recruiter_screen"),
    "place Product Designer in Recruiter screen",
  );

  const leadAtNorthwind = unwrap(
    await createOpportunity(s, {
      companyName: "Northwind Labs",
      roleTitle: "Design Lead",
      location: "Berlin, Germany",
      workMode: "hybrid",
      compMin: 165000,
      compMax: 200000,
      compCurrency: "USD",
    }),
    "create Design Lead at Northwind Labs",
  );
  unwrap(
    await placeOpportunity(s, leadAtNorthwind.id, "hiring_manager"),
    "place Design Lead in Hiring manager",
  );
  const leadStages = await s.stage.listForOpportunity(leadAtNorthwind.id);
  const leadHiringManagerStageId = leadStages.find((st) => st.kind === "hiring_manager")!.id;
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  unwrap(
    await scheduleStage(s, leadAtNorthwind.id, leadHiringManagerStageId, { scheduledAt: inThreeDays, format: "video" }),
    "schedule Design Lead's Hiring manager call",
  );
  unwrap(
    await addPersonToOpportunity(s, leadAtNorthwind.id, {
      name: "Tomas Okafor",
      role: "hiring_manager",
      title: "Head of Design",
    }),
    "add Tomas Okafor to Design Lead",
  );
  unwrap(
    await addNote(s, leadAtNorthwind.id, "Hiring manager call moved earlier in the week, still video."),
    "add note to Design Lead",
  );

  // Lumen Health: one job in Portfolio / case, one closed as rejected after
  // reaching Panel / final, with a linked recruiter and a note.
  const managerAtLumen = unwrap(
    await createOpportunity(s, {
      companyName: "Lumen Health",
      roleTitle: "Product Design Manager",
      location: "Remote",
      workMode: "remote",
    }),
    "create Product Design Manager at Lumen Health",
  );
  unwrap(
    await placeOpportunity(s, managerAtLumen.id, "portfolio_case"),
    "place Product Design Manager in Portfolio / case",
  );

  const principalAtLumen = unwrap(
    await createOpportunity(s, {
      companyName: "Lumen Health",
      roleTitle: "Principal Product Designer",
      location: "Remote",
      workMode: "remote",
    }),
    "create Principal Product Designer at Lumen Health",
  );
  unwrap(
    await addPersonToOpportunity(s, principalAtLumen.id, { name: "Priya Raman", role: "recruiter" }),
    "add Priya Raman to Principal Product Designer",
  );
  unwrap(
    await placeOpportunity(s, principalAtLumen.id, "panel_final"),
    "place Principal Product Designer in Panel / final",
  );
  unwrap(
    await addNote(s, principalAtLumen.id, "Panel went well, but the team hired internally."),
    "add note to Principal Product Designer",
  );
  unwrap(await closeOpportunity(s, principalAtLumen.id, "rejected"), "close Principal Product Designer");
}

async function main() {
  const email = "demo@example.com";
  const password = process.env.SEED_PASSWORD ?? crypto.randomBytes(9).toString("base64url");

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Demo user" },
    headers: process.env.SETUP_TOKEN ? { "x-setup-token": process.env.SETUP_TOKEN } : undefined,
  });

  const s = scoped(getDb(), result.user.id);

  await s.profile.upsert({
    headline: "Product designer exploring new roles",
    resumeMd: "# Demo resume\n\nThis is fictional seed data for local development.",
  });

  await seedJobs(s);

  console.log(`Seeded demo user: ${email}`);
  console.log("Seeded six fictional jobs across Acme Robotics, Northwind Labs and Lumen Health.");
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
