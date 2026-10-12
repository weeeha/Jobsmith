// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LiveAnnouncerProvider } from "@/components/live-announcer";
import { ProfileSection } from "@/components/settings/profile-section";
import { saveProfileAction } from "@/app/(app)/settings/actions";
import { listTimeZones } from "@/lib/time/zone";
import { timeZoneItems } from "@/lib/time/zone-list";

// Same style as the other component tests here: no jest-dom, direct DOM reads.
vi.mock("@/app/(app)/settings/actions", () => ({ saveProfileAction: vi.fn() }));

const mockedSave = vi.mocked(saveProfileAction);

const PROFILE: { headline: string | null; resumeMd: string | null; timezone: string } = { headline: "Product designer, design systems", resumeMd: "# Resume\n\nEight years.", timezone: "UTC" };
const ITEMS = [
  { value: "UTC", label: "UTC", group: "UTC" },
  { value: "Asia/Tokyo", label: "Tokyo", group: "Asia" },
  { value: "America/New_York", label: "New York", group: "America" },
];

function renderSection(profile = PROFILE, timeZones = ITEMS) {
  return render(
    <LiveAnnouncerProvider>
      <ProfileSection profile={profile} timeZones={timeZones} />
    </LiveAnnouncerProvider>,
  );
}

// Only a call with no zone option asks for the device's own zone; every call
// that names a zone (the zone helpers use those) still gets the real thing.
function stubDeviceZone(zone: string) {
  const Real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    if (options?.timeZone !== undefined) return new Real(locales, options);
    return { resolvedOptions: () => ({ timeZone: zone }) } as Intl.DateTimeFormat;
  } as never);
}

function submittedForm(): FormData {
  const form = screen.getByRole("button", { name: "Save profile" }).closest("form")!;
  return new FormData(form);
}

beforeEach(() => {
  mockedSave.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProfileSection", () => {
  it("is a section named Profile with the intro, three fields and their hints", () => {
    renderSection();
    const section = screen.getByRole("region", { name: "Profile" });
    expect(within(section).getByRole("heading", { level: 2, name: "Profile" })).not.toBeNull();
    expect(
      within(section).getByText("Your resume is used only to score how well jobs fit. It never leaves through the bridge."),
    ).not.toBeNull();
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(PROFILE.headline);
    expect((screen.getByLabelText("Resume") as HTMLTextAreaElement).value).toBe(PROFILE.resumeMd);
    expect(screen.getByText("A short line about you, for example: Product designer, design systems.")).not.toBeNull();
    expect(screen.getByText("Markdown. Paste your resume text here.")).not.toBeNull();
    expect(screen.getByText("Dates and times across Jobsmith use this zone.")).not.toBeNull();
    expect(screen.getByLabelText("Time zone").textContent).toContain("UTC");
    expect(screen.getByRole("button", { name: "Save profile" })).not.toBeNull();
  });

  it("starts blank for a profile with nothing saved", () => {
    renderSection({ headline: null, resumeMd: null, timezone: "UTC" });
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Resume") as HTMLTextAreaElement).value).toBe("");
  });

  it("sends headline, resumeMd and timezone, and announces Profile saved.", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mockedSave.mockResolvedValue({ ok: true });
    renderSection({ headline: null, resumeMd: null, timezone: "Asia/Tokyo" });
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Design lead" } });
    fireEvent.change(screen.getByLabelText("Resume"), { target: { value: "Led a team." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      await Promise.resolve();
    });
    // The announcer speaks 50 ms after the result lands.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    vi.useRealTimers();

    expect(mockedSave).toHaveBeenCalledTimes(1);
    const sent = mockedSave.mock.calls[0]![1];
    expect(sent.get("headline")).toBe("Design lead");
    expect(sent.get("resumeMd")).toBe("Led a team.");
    expect(sent.get("timezone")).toBe("Asia/Tokyo");
    expect(screen.getByRole("status").textContent).toBe("Profile saved.");
  });

  it("shows the field errors under their fields, the alert, and puts focus back on Save profile", async () => {
    mockedSave.mockResolvedValue({
      ok: false,
      code: "invalid",
      message: "Check the highlighted fields.",
      fieldErrors: {
        headline: "Keep the headline under 200 characters.",
        resumeMd: "Keep the resume under 50,000 characters.",
        timezone: "Choose a time zone from the list.",
      },
    });
    renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert").textContent).toBe("Check the highlighted fields.");
    for (const [label, message] of [
      ["Headline", "Keep the headline under 200 characters."],
      ["Resume", "Keep the resume under 50,000 characters."],
      ["Time zone", "Choose a time zone from the list."],
    ] as const) {
      const control = screen.getByLabelText(label);
      const error = screen.getByText(message);
      expect(control.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    }
    expect(screen.getByLabelText("Headline").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save profile" }));
    // A rejected save keeps what was typed.
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe(PROFILE.headline);
  });

  it("offers the device's zone when it differs and selects it, adding it to the list when missing", async () => {
    stubDeviceZone("Europe/Amsterdam");
    renderSection();
    const button = await screen.findByRole("button", { name: "Use this device's time zone (Europe/Amsterdam)" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(submittedForm().get("timezone")).toBe("Europe/Amsterdam");
    expect(screen.getByLabelText("Time zone").textContent).toContain("Amsterdam");
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
    // The button took focus with it when it went away; the picker gets it.
    expect(document.activeElement).toBe(screen.getByLabelText("Time zone"));
  });

  it("canonicalizes the device's zone name before comparing", async () => {
    stubDeviceZone("Etc/UTC");
    renderSection();
    // Give the mount effect a turn, then check that nothing was offered.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
  });

  it("offers nothing when the device zone is the selected one or not a zone", async () => {
    stubDeviceZone("Asia/Tokyo");
    const { unmount } = renderSection({ ...PROFILE, timezone: "Asia/Tokyo" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
    unmount();

    vi.restoreAllMocks();
    stubDeviceZone("Mars/Olympus");
    renderSection();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: /Use this device's time zone/ })).toBeNull();
  });

  it("works with the full zone list and groups it by region", async () => {
    const full = timeZoneItems(listTimeZones(), ["UTC"]);
    renderSection(PROFILE, full);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Time zone"));
    });
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getAllByRole("group").length).toBeGreaterThan(5);
    expect(within(listbox).getByRole("option", { name: "Amsterdam" })).not.toBeNull();
  });
});
