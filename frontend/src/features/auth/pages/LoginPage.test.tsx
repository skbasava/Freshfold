import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage, type AuthService } from "../index";

function createFakeAuthService(
  overrides: Partial<AuthService> = {},
): AuthService {
  return {
    getSession: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
    refreshAccessToken: vi.fn().mockResolvedValue(null),
    onAuthStateChange: vi.fn().mockReturnValue(() => {}),
    signInWithPassword: vi.fn().mockResolvedValue({ ok: true }),
    signInWithGoogle: vi.fn().mockResolvedValue({ ok: true }),
    exchangeOAuthCallback: vi.fn().mockResolvedValue({ ok: true }),
    requestPasswordReset: vi.fn().mockResolvedValue({ ok: true }),
    updatePassword: vi.fn().mockResolvedValue({ ok: true }),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderLoginPage(
  authService: AuthService = createFakeAuthService(),
  onLoginSuccess = vi.fn(),
) {
  return {
    authService,
    onLoginSuccess,
    ...render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage authService={authService} onLoginSuccess={onLoginSuccess} />
      </MemoryRouter>,
    ),
  };
}

describe("LoginPage", () => {
  it("renders the login card, credentials form, and Google SSO option", () => {
    renderLoginPage();

    expect(screen.getByText("Sign in to FreshFold")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  it("validates missing email and password before calling authService", async () => {
    const user = userEvent.setup();
    const { authService } = renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByText("Enter your staff email address."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(authService.signInWithPassword).not.toHaveBeenCalled();
  });

  it("validates malformed email addresses", async () => {
    const user = userEvent.setup();
    const { authService } = renderLoginPage();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(authService.signInWithPassword).not.toHaveBeenCalled();
  });

  it("toggles password visibility via accessible button", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("submits trimmed credentials and calls onLoginSuccess when authenticated", async () => {
    const user = userEvent.setup();
    const { authService, onLoginSuccess } = renderLoginPage();

    await user.type(
      screen.getByLabelText("Email"),
      "  manager@freshfold.in  ",
    );
    await user.type(screen.getByLabelText("Password"), "strong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(authService.signInWithPassword).toHaveBeenCalledWith({
      email: "manager@freshfold.in",
      password: "strong-password",
    });
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows a destructive alert when password sign-in fails", async () => {
    const user = userEvent.setup();
    const authService = createFakeAuthService({
      signInWithPassword: vi.fn().mockResolvedValue({
        ok: false,
        error: "Incorrect email or password.",
      }),
    });
    const { onLoginSuccess } = renderLoginPage(authService);

    await user.type(screen.getByLabelText("Email"), "staff@freshfold.in");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Sign-in failed")).toBeInTheDocument();
    expect(
      screen.getByText("Incorrect email or password."),
    ).toBeInTheDocument();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it("starts Google sign-in when clicking the Google button", async () => {
    const user = userEvent.setup();
    const { authService, onLoginSuccess } = renderLoginPage();

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(authService.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(onLoginSuccess).toHaveBeenCalledTimes(1);
  });
});
