import Link from "next/link";
import { messages } from "@/i18n/messages";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">{messages.notFound.title}</h1>
      <p>{messages.notFound.description}</p>
      <Link href="/" className="w-fit underline underline-offset-4">{messages.navigation.home}</Link>
    </main>
  );
}
