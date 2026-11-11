import { LoadingState } from "@freshfold/ui";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "./AuthLayout";

export function AuthCallbackPage() {
  const auth = useAuth();

  if (auth.state.status === "loading") {
    return (
      <AuthLayout>
        <LoadingState label="Signing you in" rows={2} />
      </AuthLayout>
    );
  }

  if (auth.state.status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }

  if (auth.state.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <Navigate to="/login" replace />;
}
