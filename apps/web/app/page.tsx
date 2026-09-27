import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/i18n/messages";

export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-8 px-6 py-20 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-lg font-semibold tracking-tight">{messages.home.brand}</p>
        <Badge variant="secondary">{messages.home.status}</Badge>
      </header>
      <Card>
        <CardHeader>
          <CardTitle><h1>{messages.home.title}</h1></CardTitle>
          <CardDescription>{messages.home.description}</CardDescription>
        </CardHeader>
        <CardContent><p>{messages.home.notice}</p></CardContent>
      </Card>
      <footer className="text-sm text-muted-foreground">{messages.home.footer}</footer>
    </main>
  );
}
