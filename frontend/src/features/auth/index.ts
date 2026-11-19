export {
  AuthCallbackPage,
  type AuthCallbackPageProps,
} from "./pages/AuthCallbackPage";
export {
  ForgotPasswordPage,
  type ForgotPasswordPageProps,
} from "./pages/ForgotPasswordPage";
export { LoginPage, type LoginPageProps } from "./pages/LoginPage";
export {
  ResetPasswordPage,
  type ResetPasswordPageProps,
} from "./pages/ResetPasswordPage";
export {
  AuthProvider,
  useAuth,
  useOptionalAuth,
  type AuthContextValue,
  type AuthProviderProps,
} from "./context/AuthContext";
export { PublicOnly, type PublicOnlyProps } from "./guards/PublicOnly";
export { RequireAuth, type RequireAuthProps } from "./guards/RequireAuth";
export {
  AuthBrandPanel,
  AuthStatusCardBlock,
  GoogleSignInButton,
  LoginCardBlock,
  LoginCredentialsForm,
  type AuthStatusCardBlockProps,
  type GoogleSignInButtonProps,
  type LoginCardBlockProps,
  type LoginCredentialsFormProps,
} from "./components";
export {
  useLoginForm,
  validateLoginCredentials,
  type UseLoginFormOptions,
  type UseLoginFormReturn,
} from "./hooks/useLoginForm";
export {
  createSupabaseAuthService,
  defaultAuthService,
  type SupabaseAuthServiceDeps,
} from "./services/auth.service";
export {
  verifyGatewaySession,
  type GatewaySessionVerification,
} from "./services/gateway-session";
export type {
  AuthActionResult,
  AuthDeniedCode,
  AuthService,
  AuthSession,
  AuthSessionOutcome,
  AuthState,
  AuthStatus,
  AuthSubmittingMode,
  AuthUser,
  LoginCredentials,
  LoginFieldErrors,
} from "./types/auth.types";
