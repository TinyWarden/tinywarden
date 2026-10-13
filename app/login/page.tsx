import LoginClient from "./login-client";

// Login must reflect the current navigation even after a deployment.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient />;
}
