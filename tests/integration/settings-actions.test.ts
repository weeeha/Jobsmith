import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { loadProfile } from "@/lib/profile/store";
import { makeTestDb, createTestUser } from "../helpers/db";
import { seedProfile } from "../helpers/profile";

// Same harness as the other action tests: the signed-in user and path
// revalidation need a live Next.js request, so both are stubbed; scopedFor
// points at a real PGlite database through the real scoped().
const harness = vi.hoisted(() => ({ db: undefined as Db | undefined, userId: "" }));
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: harness.userId }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/db/scoped", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/scoped")>();
  return { ...actual, scopedFor: (userId: string) => actual.scoped(harness.db!, userId) };
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

function profileForm(values: { headline?: string; resumeMd?: string; timezone?: string }): FormData {
  const formData = new FormData();
  formData.set("headline", values.headline ?? "");
  formData.set("resumeMd", values.resumeMd ?? "");
  formData.set("timezone", values.timezone ?? "UTC");
  return formData;
}

async function setup(email: string) {
  const made = await makeTestDb();
  harness.db = made.db;
  harness.userId = (await createTestUser(made.db, email)).id;
  return { ...made, s: scoped(made.db, harness.userId) };
}

describe("saveProfileAction", () => {
  it("saves the headline, resume and zone, and revalidates every page", async () => {
    const { s, close } = await setup("profile-save@example.com");
    try {
      const state = await saveProfileAction(
        undefined,
        profileForm({ headline: "  Product designer, design systems  ", resumeMd: "# Resume\r\nEight years.", timezone: "Etc/UTC" }),
      );

      expect(state).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.headline).toBe("Product designer, design systems");
      expect(profile.resumeMd).toBe("# Resume\nEight years.");
      expect(profile.timezone).toBe("UTC");
      expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    } finally {
      await close();
    }
  });

  it("stores a canonical zone name for a real zone", async () => {
    const { s, close } = await setup("profile-zone@example.com");
    try {
      expect(await saveProfileAction(undefined, profileForm({ timezone: "Europe/Amsterdam" }))).toEqual({ ok: true });
      expect((await loadProfile(s)).timezone).toBe("Europe/Amsterdam");
    } finally {
      await close();
    }
  });

  it("rejects a name that is not a zone and keeps what was saved", async () => {
    const { s, close } = await setup("profile-bad-zone@example.com");
    try {
      await seedProfile(s, { headline: "Before", timezone: "Asia/Tokyo" });
      const state = await saveProfileAction(undefined, profileForm({ headline: "After", timezone: "Mars/Olympus" }));

      expect(state).toEqual({
        ok: false,
        code: "invalid",
        message: "Check the highlighted fields.",
        fieldErrors: { timezone: "Choose a time zone from the list." },
      });
      const profile = await loadProfile(s);
      expect(profile.headline).toBe("Before");
      expect(profile.timezone).toBe("Asia/Tokyo");
      expect(revalidatePathMock).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("rejects a resume over 50,000 characters and a headline over 200", async () => {
    const { close } = await setup("profile-long@example.com");
    try {
      const state = await saveProfileAction(
        undefined,
        profileForm({ headline: "h".repeat(201), resumeMd: "r".repeat(50_001) }),
      );
      expect(state).toMatchObject({
        ok: false,
        code: "invalid",
        fieldErrors: {
          headline: "Keep the headline under 200 characters.",
          resumeMd: "Keep the resume under 50,000 characters.",
        },
      });
    } finally {
      await close();
    }
  });

  it("stores blank text as null and leaves the preferences alone", async () => {
    const { s, close } = await setup("profile-blank@example.com");
    try {
      await seedProfile(s, { headline: "Before", preferences: { v: 1, titles: ["Product Designer"] } });
      expect(await saveProfileAction(undefined, profileForm({ headline: "   ", resumeMd: "  \n " }))).toEqual({ ok: true });
      const profile = await loadProfile(s);
      expect(profile.headline).toBeNull();
      expect(profile.resumeMd).toBeNull();
      expect(profile.preferences.titles).toEqual(["Product Designer"]);
    } finally {
      await close();
    }
  });
});
