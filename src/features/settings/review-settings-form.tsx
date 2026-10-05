"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/features/knowledge/use-action";
import { updateSettings } from "@/server/actions/settings";
import {
  NEW_PER_DAY_MAX,
  RETENTION_MAX,
  RETENTION_MIN,
  REVIEWS_PER_DAY_MAX,
} from "@/server/modules/flashcards/domain/limits";

type Values = { desiredRetention: number; newCardsPerDay: number; reviewsPerDay: number };

/** Flashcard review settings (Architecture §21): target retention and daily limits. */
export function ReviewSettingsForm(initial: Values) {
  const id = useId();
  const { run, pending } = useAction();
  const [retention, setRetention] = useState(String(Math.round(initial.desiredRetention * 100)));
  const [newPerDay, setNewPerDay] = useState(String(initial.newCardsPerDay));
  const [reviewsPerDay, setReviewsPerDay] = useState(String(initial.reviewsPerDay));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const values = {
    desiredRetention: Number(retention) / 100,
    newCardsPerDay: Number(newPerDay),
    reviewsPerDay: Number(reviewsPerDay),
  };
  const dirty =
    values.desiredRetention !== initial.desiredRetention ||
    values.newCardsPerDay !== initial.newCardsPerDay ||
    values.reviewsPerDay !== initial.reviewsPerDay;

  async function save() {
    setErrors({});
    await run(() => updateSettings(values), {
      success: "Review settings saved",
      onError: (r) =>
        setErrors(
          Object.fromEntries(Object.entries(r.error.fields ?? {}).map(([k, v]) => [k, v?.[0]])) as Record<
            string,
            string
          >,
        ),
    });
  }

  return (
    <div className="grid max-w-md gap-4">
      <FormField
        id={`${id}-retention`}
        label="Target recall (%)"
        error={errors.desiredRetention}
        hint={`How likely you want to be to remember a card when it comes up, from ${RETENTION_MIN * 100}% to ${RETENTION_MAX * 100}%. Higher means more reviews. 90% suits most students.`}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={RETENTION_MIN * 100}
          max={RETENTION_MAX * 100}
          step={1}
          value={retention}
          onChange={(e) => setRetention(e.target.value)}
        />
      </FormField>
      <FormField
        id={`${id}-new`}
        label="New cards per day"
        error={errors.newCardsPerDay}
        hint="How many cards you haven't seen before are introduced each day, across all subjects."
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={NEW_PER_DAY_MAX}
          step={1}
          value={newPerDay}
          onChange={(e) => setNewPerDay(e.target.value)}
        />
      </FormField>
      <FormField
        id={`${id}-reviews`}
        label="Maximum reviews per day"
        error={errors.reviewsPerDay}
        hint="Reviews beyond this wait until tomorrow. Cards you are still learning are always shown."
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={REVIEWS_PER_DAY_MAX}
          step={1}
          value={reviewsPerDay}
          onChange={(e) => setReviewsPerDay(e.target.value)}
        />
      </FormField>
      <div>
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}
