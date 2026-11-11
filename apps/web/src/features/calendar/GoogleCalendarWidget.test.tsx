import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarWidget } from "./GoogleCalendarWidget";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GoogleCalendarWidget", () => {
  it("renders the configured embed URL in a titled iframe", () => {
    vi.stubEnv(
      "VITE_GOOGLE_CALENDAR_EMBED_URL",
      "https://calendar.google.com/calendar/embed?src=freshfold%40example.com&ctz=Asia%2FKolkata",
    );

    render(<GoogleCalendarWidget />);

    expect(screen.getByTitle("Google Calendar")).toHaveAttribute(
      "src",
      "https://calendar.google.com/calendar/embed?src=freshfold%40example.com&ctz=Asia%2FKolkata",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading calendar");
  });

  it("builds an India-time week embed URL from a calendar ID", () => {
    vi.stubEnv(
      "VITE_GOOGLE_CALENDAR_ID",
      "freshfold@group.calendar.google.com",
    );

    render(<GoogleCalendarWidget />);

    const src = screen.getByTitle("Google Calendar").getAttribute("src");
    expect(src).toBeTruthy();
    const url = new URL(src as string);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://calendar.google.com/calendar/embed",
    );
    expect(url.searchParams.get("src")).toBe(
      "freshfold@group.calendar.google.com",
    );
    expect(url.searchParams.get("ctz")).toBe("Asia/Kolkata");
    expect(url.searchParams.get("mode")).toBe("WEEK");
    expect(url.searchParams.get("showTitle")).toBe("0");
    expect(url.searchParams.get("showPrint")).toBe("0");
    expect(url.searchParams.get("showTabs")).toBe("0");
    expect(url.searchParams.get("showCalendars")).toBe("0");
  });

  it("shows setup guidance instead of a broken iframe when unconfigured", () => {
    vi.stubEnv("VITE_GOOGLE_CALENDAR_EMBED_URL", "");
    vi.stubEnv("VITE_GOOGLE_CALENDAR_ID", "");

    render(<GoogleCalendarWidget />);

    expect(
      screen.getByText("Google Calendar is not set up"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Google Calendar")).not.toBeInTheDocument();
  });

  it("rejects an invalid embed URL", () => {
    vi.stubEnv("VITE_GOOGLE_CALENDAR_EMBED_URL", "not-a-url");

    render(<GoogleCalendarWidget />);

    expect(
      screen.getByText("Google Calendar is not set up"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Google Calendar")).not.toBeInTheDocument();
  });
});
