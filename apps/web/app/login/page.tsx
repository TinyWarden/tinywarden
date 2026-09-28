"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { messages } from "@/i18n/messages";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/operator/login", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-TinyWarden-Request": "1" },
        body: JSON.stringify({ schema_version: 1, login: "admin", password }),
      });
      if (response.ok) { router.push("/fleet"); router.refresh(); return; }
      const body = await response.json();
      const code = body?.error?.code;
      setError(code === "rate_limited" ? messages.login.limited
        : code === "setup_required" ? messages.login.setup
        : response.status === 401 ? messages.login.invalid : messages.login.unavailable);
    } catch { setError(messages.login.unavailable); }
    finally { setPending(false); setPassword(""); }
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-12 text-lg font-semibold">{messages.home.brand}</Link>
      <h1 className="text-3xl font-semibold tracking-tight">{messages.login.title}</h1>
      <p className="mt-3 text-muted-foreground">{messages.login.description}</p>
      <form onSubmit={(event) => { void submit(event); }} className="mt-8 space-y-5">
        <div>
          <label htmlFor="login" className="mb-2 block text-sm font-medium">{messages.login.loginLabel}</label>
          <input id="login" value={messages.login.loginName} readOnly autoComplete="username"
            className="w-full rounded-md border bg-card px-3 py-2 text-base" />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">{messages.login.passwordLabel}</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border bg-card px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <button type="submit" disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {pending ? messages.login.working : messages.login.submit}
        </button>
      </form>
    </main>
  );
}
