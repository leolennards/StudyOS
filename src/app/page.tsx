import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainCircuit, FileText, Layers, Sparkles } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/platform/auth/session";

const features = [
  {
    icon: Layers,
    title: "Everything in one place",
    body: "Subjects, sections and topics give your course a shape you can actually revise from.",
  },
  {
    icon: FileText,
    title: "Your material, understood",
    body: "Lectures, PDFs, slides and notes, organised and searchable.",
  },
  {
    icon: BrainCircuit,
    title: "Practice that sticks",
    body: "Flashcards and quizzes scheduled by when you're about to forget.",
  },
  {
    icon: Sparkles,
    title: "Told what to study next",
    body: "Based on your results, your exams and what you haven't reviewed.",
  },
];

export default async function LandingPage() {
  if (await getSession()) redirect("/today");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 py-20 text-center sm:px-8 sm:py-28">
          <div
            aria-hidden
            className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b to-transparent"
          />
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your whole degree, in one calm workspace
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-lg text-pretty">
            StudyOS organises your course material, helps you understand it, and tells you what to revise next.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Create your account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/sign-in">I already have one</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
          <h2 id="features-heading" className="sr-only">
            What StudyOS does
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f.title} className="bg-card rounded-xl border p-6 shadow-xs">
                <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-6 text-sm sm:px-8">
        <p>StudyOS · Built for students, one subject at a time.</p>
      </footer>
    </div>
  );
}
