"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileUp, GalleryVerticalEnd, RotateCcw, Upload } from "lucide-react";
import { ChoiceGroup } from "@/components/shared/choice-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { selectClass } from "@/features/planner/deadline-form-dialog";
import { cn } from "@/lib/utils";
import { finishImport, importCards } from "@/server/actions/flashcards";
import {
  ankiNoteToDraft,
  DELIMITERS,
  detectDelimiter,
  IMPORT_LIMITS,
  IMPORT_SOURCE_LABELS,
  IMPORT_SOURCES,
  importBatches,
  type ImportDraft,
  type ImportSource,
  looksLikeHeader,
  parseDelimited,
  planImport,
  SKIP_REASON_LABELS,
  type SkipReason,
  textToDrafts,
} from "@/server/modules/flashcards/domain/import";
import { cardPreview, CARD_TYPE_LABELS } from "@/server/modules/flashcards/domain/items";
import { CardText } from "../card-text";
import { loadSqlite } from "./load-sqlite";
import { type AnkiDeck, AnkiReadError, readAnkiPackage } from "./read-anki";

type Loaded =
  | { source: "anki"; name: string; decks: AnkiDeck[]; notes: { draft: ImportDraft; deckIds: string[] }[] }
  | { source: "quizlet" | "text"; name: string; text: string };

type Totals = { added: number; duplicates: number; invalid: number };

const PREVIEW = 50;
const MB = 1024 * 1024;
const number = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, word: string) => `${number(n)} ${word}${n === 1 ? "" : "s"}`;

/**
 * Imports cards into one subject from an Anki deck, a Quizlet set or a
 * spreadsheet (ADR-018): read the file in the browser, check what will be
 * added, then send it in batches.
 */
export function CardImporter({
  subjectId,
  subjectName,
  groups,
}: {
  subjectId: string;
  subjectName: string;
  groups: TopicGroup[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<ImportSource>("anki");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  const [deckIds, setDeckIds] = useState<Set<string> | null>(null);
  const [delimiter, setDelimiter] = useState("\t");
  const [header, setHeader] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [topicId, setTopicId] = useState("");

  const importId = useRef<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<{ at: number; totals: Totals; message: string } | null>(null);
  const [result, setResult] = useState<Totals | null>(null);

  const plan = useMemo(() => {
    if (!loaded) return null;
    const drafts =
      loaded.source === "anki"
        ? loaded.notes.filter((n) => !deckIds || n.deckIds.some((d) => deckIds.has(d))).map((n) => n.draft)
        : textToDrafts(loaded.text, { delimiter, header });
    return planImport(drafts, { reverse: loaded.source !== "anki" && reverse });
  }, [loaded, deckIds, delimiter, header, reverse]);

  function reset() {
    setLoaded(null);
    setReadError(null);
    setPasted("");
    setDeckIds(null);
    setReverse(false);
    setTopicId("");
    setProgress(null);
    setFailed(null);
    setResult(null);
    importId.current = null;
  }

  function loadText(text: string, name: string, from: "quizlet" | "text") {
    const found = detectDelimiter(text);
    setDelimiter(found);
    setHeader(looksLikeHeader(parseDelimited(text.slice(0, 2_000), found)[0]?.fields ?? []));
    setLoaded({ source: from, name, text });
  }

  async function readFile(file: File) {
    setReadError(null);
    if (source === "anki") {
      if (file.size > IMPORT_LIMITS.ankiBytes) {
        setReadError(
          `That file is over ${IMPORT_LIMITS.ankiBytes / MB} MB. Export the deck without its media and try again.`,
        );
        return;
      }
      setReading(file.name);
      try {
        const [SQL, buffer] = await Promise.all([loadSqlite(), file.arrayBuffer()]);
        const pack = readAnkiPackage(new Uint8Array(buffer), SQL);
        if (pack.notes.length === 0) {
          setReadError("There are no cards in this deck.");
          return;
        }
        setDeckIds(null);
        setLoaded({
          source: "anki",
          name: file.name,
          decks: pack.decks,
          notes: pack.notes.map((n) => ({ draft: ankiNoteToDraft(n), deckIds: n.deckIds })),
        });
      } catch (error) {
        setReadError(
          error instanceof AnkiReadError
            ? error.message
            : "StudyOS couldn't read this file. Check your connection, then try again.",
        );
      } finally {
        setReading(null);
      }
      return;
    }
    if (file.size > IMPORT_LIMITS.textBytes) {
      setReadError(`That file is over ${IMPORT_LIMITS.textBytes / MB} MB. Split it into smaller files.`);
      return;
    }
    const text = await file.text();
    if (text.trim() === "") {
      setReadError("That file is empty.");
      return;
    }
    loadText(text, file.name, "text");
  }

  async function run(startAt = 0, before: Totals = { added: 0, duplicates: 0, invalid: 0 }) {
    if (!plan || !loaded) return;
    importId.current ??= crypto.randomUUID();
    const batches = importBatches(plan.cards);
    const totals = { ...before };
    let done = batches.slice(0, startAt).reduce((n, b) => n + b.length, 0);
    setFailed(null);
    for (let i = startAt; i < batches.length; i++) {
      setProgress({ done, total: plan.cards.length });
      let message: string | null = null;
      try {
        const r = await importCards({
          importId: importId.current,
          subjectId,
          source: loaded.source,
          name: loaded.name,
          topicId: topicId || undefined,
          cards: batches[i]!,
        });
        if (r.ok) {
          totals.added += r.data.added;
          totals.duplicates += r.data.duplicates;
          totals.invalid += r.data.invalid;
        } else message = r.error.message;
      } catch {
        message = "We couldn't reach StudyOS. Check your connection and try again.";
      }
      if (message) {
        setProgress(null);
        setFailed({ at: i, totals, message });
        if (totals.added > 0) router.refresh();
        return;
      }
      done += batches[i]!.length;
    }
    setProgress({ done, total: plan.cards.length });
    await finishImport({ id: importId.current }).catch(() => null);
    setProgress(null);
    setResult(totals);
    router.refresh();
  }

  if (result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="bg-success/10 text-success grid size-11 place-items-center rounded-xl">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <div role="status">
            <h2 className="text-lg font-semibold">
              {result.added > 0
                ? `Added ${plural(result.added, "card")} to ${subjectName}`
                : `No new cards: ${subjectName} already has them`}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {[
                result.duplicates > 0 &&
                  `${plural(result.duplicates, "card")} ${result.duplicates === 1 ? "was" : "were"} already there.`,
                result.invalid > 0 && `${plural(result.invalid, "card")} couldn't be saved.`,
                result.added > 0 && "They start as new cards, introduced a few a day as set in Settings.",
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {result.added > 0 && (
              <Button asChild>
                <Link href={`/review?subject=${subjectId}`}>
                  <GalleryVerticalEnd aria-hidden />
                  Review now
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/subjects/${subjectId}/flashcards`}>See the cards</Link>
            </Button>
            <Button variant="ghost" onClick={reset}>
              Import more
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!loaded || !plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Where are your cards?</h2>
          </CardTitle>
          <CardDescription>They&apos;re added to {subjectName} as new cards.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ChoiceGroup
            legend="Import from"
            name="import-source"
            value={source}
            onChange={(v) => {
              setSource(v as ImportSource);
              setReadError(null);
            }}
            options={IMPORT_SOURCES.map((s) => ({ value: s, label: IMPORT_SOURCE_LABELS[s] }))}
          />

          {source === "anki" && (
            <>
              <p className="text-muted-foreground text-sm">
                In Anki, choose <strong className="text-foreground font-medium">File › Export</strong>, pick{" "}
                <strong className="text-foreground font-medium">Anki Deck Package (.apkg)</strong> and the deck, then
                add the file here. A whole collection (.colpkg) works too. Your Anki review history isn&apos;t brought
                over.
              </p>
              <FileDrop
                accept=".apkg,.colpkg"
                prompt="Drop an Anki deck here"
                hint={`.apkg or .colpkg, up to ${IMPORT_LIMITS.ankiBytes / MB} MB`}
                busy={reading}
                onFile={readFile}
              />
            </>
          )}

          {source === "quizlet" && (
            <PasteBox
              id="import-quizlet"
              label="Paste your Quizlet set"
              help={
                <>
                  Open the set in Quizlet, choose <strong className="text-foreground font-medium">⋯ › Export</strong>,
                  keep <strong className="text-foreground font-medium">Tab</strong> between term and definition and{" "}
                  <strong className="text-foreground font-medium">New line</strong> between rows, then copy the text.
                </>
              }
              placeholder={"chien\tdog\nchat\tcat"}
              value={pasted}
              onChange={setPasted}
              onSubmit={() => loadText(pasted, "Quizlet set", "quizlet")}
            />
          )}

          {source === "text" && (
            <>
              <p className="text-muted-foreground text-sm">
                One card per row: the front in the first column and the back in the second. Save a spreadsheet as CSV,
                or paste the rows straight from it.
              </p>
              <FileDrop
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
                prompt="Drop a CSV or text file here"
                hint={`.csv, .tsv or .txt, up to ${IMPORT_LIMITS.textBytes / MB} MB`}
                busy={null}
                onFile={readFile}
              />
              <PasteBox
                id="import-text"
                label="Or paste the rows"
                placeholder={"Powerhouse of the cell\tMitochondria\nMakes proteins\tRibosome"}
                value={pasted}
                onChange={setPasted}
                onSubmit={() => loadText(pasted, "Pasted cards", "text")}
              />
            </>
          )}

          {readError && (
            <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {readError}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const unit = loaded.source === "anki" ? "note" : "row";
  const skips = (Object.entries(plan.skipped) as [SkipReason, number][]).filter(([, n]) => n > 0);
  const busy = progress !== null;
  const topicChoices = groups.filter((g) => g.topics.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Check the cards</h2>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <span className="truncate">From {loaded.name}</span>
          {!busy && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={reset}>
              Choose something else
            </Button>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
          {loaded.source === "anki" && loaded.decks.length > 1 && (
            <div className="grid gap-2 sm:col-span-2">
              <p className="text-sm font-medium" id="import-decks">
                Decks
              </p>
              <div
                role="group"
                aria-labelledby="import-decks"
                className="grid max-h-48 gap-0.5 overflow-y-auto rounded-md border p-2"
              >
                {loaded.decks.map((d) => (
                  <label
                    key={d.id}
                    className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={!deckIds || deckIds.has(d.id)}
                      onChange={(e) => {
                        const next = new Set(deckIds ?? loaded.decks.map((x) => x.id));
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        setDeckIds(next);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{number(d.notes)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {loaded.source !== "anki" && (
            <div className="grid gap-2">
              <label htmlFor="import-delimiter" className="text-sm font-medium">
                Front and back are separated by
              </label>
              <select
                id="import-delimiter"
                className={selectClass}
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
              >
                {DELIMITERS.map((d) => (
                  <option key={d.label} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-2">
            <label htmlFor="import-topic" className="text-sm font-medium">
              Topic
            </label>
            <select
              id="import-topic"
              className={selectClass}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={topicChoices.length === 0}
            >
              <option value="">{topicChoices.length === 0 ? "This subject has no topics yet" : "No topic"}</option>
              {topicChoices.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {loaded.source !== "anki" && (
            <div className="grid content-start gap-2 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={header}
                  onChange={(e) => setHeader(e.target.checked)}
                />
                The first row names the columns
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={reverse}
                  onChange={(e) => setReverse(e.target.checked)}
                />
                Also review each card from back to front
              </label>
            </div>
          )}
        </fieldset>

        <div className="grid gap-1 text-sm" aria-live="polite">
          <p className="font-medium">
            {plan.cards.length > 0 ? `${plural(plan.cards.length, "card")} ready to import` : "Nothing to import"}
          </p>
          {skips.map(([reason, n]) => (
            <p key={reason} className="text-muted-foreground">
              {plural(n, unit)} {SKIP_REASON_LABELS[reason]}, so {n === 1 ? "it was" : "they were"} left out.
            </p>
          ))}
          {plan.mediaDropped > 0 && (
            <p className="text-muted-foreground">
              {plural(plan.mediaDropped, "card")} had pictures or sound, which StudyOS cards can&apos;t show yet. Their
              text is kept.
            </p>
          )}
          {plan.overLimit > 0 && (
            <p className="text-muted-foreground">
              Only the first {number(IMPORT_LIMITS.cards)} cards are imported at once. Import the other{" "}
              {number(plan.overLimit)} afterwards, from a smaller file or by choosing fewer decks.
            </p>
          )}
          <p className="text-muted-foreground">Cards already in {subjectName} are skipped.</p>
        </div>

        {plan.cards.length > 0 && (
          <div className="grid gap-2">
            <ul aria-label="Cards to import" className="bg-card divide-y overflow-hidden rounded-xl border">
              {plan.cards.slice(0, PREVIEW).map((card, i) => (
                <li key={i} className="grid gap-0.5 p-3 text-sm">
                  <p className="line-clamp-2 font-medium">
                    <CardText text={card.type === "cloze" ? cardPreview(card) : card.front} />
                  </p>
                  {card.type !== "cloze" && (
                    <p className="text-muted-foreground line-clamp-2">
                      <CardText text={card.back} />
                    </p>
                  )}
                  {card.type !== "basic" && (
                    <p className="text-muted-foreground text-xs">{CARD_TYPE_LABELS[card.type]}</p>
                  )}
                </li>
              ))}
            </ul>
            {plan.cards.length > PREVIEW && (
              <p className="text-muted-foreground text-sm">
                Showing the first {PREVIEW} of {number(plan.cards.length)}.
              </p>
            )}
          </div>
        )}

        {progress && (
          <div className="grid gap-2" role="status">
            <p className="text-sm font-medium">
              Importing… {number(progress.done)} of {number(progress.total)}
            </p>
            <div
              className="bg-muted h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {failed && (
          <p role="alert" className="text-destructive flex items-start gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {failed.message}{" "}
              {failed.totals.added > 0 &&
                `${plural(failed.totals.added, "card")} ${failed.totals.added === 1 ? "was" : "were"} added before it stopped. `}
              Trying again carries on where it stopped.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {failed ? (
            <Button size="lg" onClick={() => run(failed.at, failed.totals)}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          ) : (
            <Button size="lg" onClick={() => run()} loading={busy} disabled={plan.cards.length === 0}>
              {!busy && <FileUp aria-hidden />}
              {plan.cards.length > 0 ? `Import ${plural(plan.cards.length, "card")}` : "Import"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FileDrop({
  accept,
  prompt,
  hint,
  busy,
  onFile,
}: {
  accept: string;
  prompt: string;
  hint: string;
  busy: string | null;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && !busy) onFile(file);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "bg-card",
      )}
    >
      <div className="bg-primary/10 text-primary grid size-11 place-items-center rounded-xl">
        <Upload className="size-5" aria-hidden />
      </div>
      <div>
        <p className="font-medium">{busy ? `Reading ${busy}…` : prompt}</p>
        <p className="text-muted-foreground mt-1 text-sm">{hint}</p>
      </div>
      <Button type="button" variant="outline" loading={busy !== null} onClick={() => input.current?.click()}>
        Choose a file
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label="Choose a file to import"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function PasteBox({
  id,
  label,
  help,
  placeholder,
  value,
  onChange,
  onSubmit,
}: {
  id: string;
  label: string;
  help?: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() !== "") onSubmit();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {help && <p className="text-muted-foreground text-sm">{help}</p>}
      <Textarea
        id={id}
        rows={6}
        className="font-mono text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={IMPORT_LIMITS.textBytes}
      />
      <div>
        <Button type="submit" variant="outline" disabled={value.trim() === ""}>
          Check the cards
        </Button>
      </div>
    </form>
  );
}
