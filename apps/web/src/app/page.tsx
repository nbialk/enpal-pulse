import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { GitHubStars } from "@/components/github-stars";
import { ThemeToggle } from "@/components/theme-toggle";

const MCP_URL = "https://mcp.pulse.niklas.sh/mcp";
const GITHUB_REPO = "nbialk/enpal-pulse";

const prompts = [
  "Why was my bill higher this month?",
  "When should I charge my car?",
  "What was my energy usage today?",
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Enpal Pulse"
              width={36}
              height={36}
              className="size-9 rounded-lg"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">
                Enpal Pulse
              </span>
              <span className="text-xs text-muted-foreground">
                Smart Energy Companion
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <GitHubStars repo={GITHUB_REPO} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="size-3" />
              AI x ENERGY Hackathon · Berlin
            </Badge>
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The Smart Energy Companion
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
            Enpal Pulse brings a household&apos;s solar production, battery
            state, heat pump and EV load, grid flows, dynamic tariffs and
            contract terms together in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open dashboard
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#connect">Connect MCP</a>
            </Button>
          </div>
        </section>

        {/* Connect MCP */}
        <section id="connect" className="mx-auto mt-20 max-w-2xl scroll-mt-20">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-center gap-3">
              <Image
                src="/chatgpt.webp"
                alt="ChatGPT"
                width={36}
                height={36}
                className="size-9 rounded-lg dark:hidden"
              />
              <Image
                src="/chatgpt-white.png"
                alt="ChatGPT"
                width={36}
                height={36}
                className="hidden size-9 rounded-lg dark:block"
              />
              <Image
                src="/claude.png"
                alt="Claude"
                width={36}
                height={36}
                className="size-9 rounded-lg"
              />
            </div>
            <h2 className="mt-4 text-center text-xl font-semibold tracking-tight">
              Connect in ChatGPT or Claude
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-center text-sm text-muted-foreground">
              Add the URL as a custom connector.
            </p>

            <div className="mt-5 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">
                {MCP_URL}
              </code>
              <CopyButton value={MCP_URL} />
            </div>

            <div className="mt-6">
              <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Example prompts
              </p>
              <ul className="mt-3 space-y-2">
                {prompts.map((p) => (
                  <li
                    key={p}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>Enpal Pulse — Smart Energy Companion</span>
          <span>AI x Energy Hackathon · 20–21 Juni 2026 · Enpal Track</span>
        </div>
      </footer>
    </div>
  );
}
