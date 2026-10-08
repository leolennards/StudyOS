import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { subjects, topics } from "./knowledge";
import { documents } from "./library";
import { notes } from "./notes";
import { tsvector } from "./types";

/**
 * Card types (Architecture §20). `reverse` is "basic and reversed": one card
 * reviewed in both directions. A cloze card is reviewed once per deletion
 * number. An image occlusion card is reviewed once per box hidden on its image.
 */
export const cardType = pgEnum("card_type", ["basic", "reverse", "cloze", "image_occlusion"]);

/** Where a card came from: written by the student, generated (a later phase), or imported (ADR-018). */
export const cardOrigin = pgEnum("card_origin", ["user", "ai", "imported"]);

/** The FSRS learning state of one reviewable item. */
export const cardLearningState = pgEnum("card_learning_state", ["new", "learning", "review", "relearning"]);

/**
 * One import of cards from Anki, Quizlet or a spreadsheet into a subject
 * (ADR-018). Cards remember the import that added them, so an import can be
 * taken back in one go; deleting it deletes its cards.
 */
export const cardImports = pgTable(
  "card_imports",
  {
    /** Chosen by the browser, so every request of one import adds to the same record. */
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    source: text("source").notNull(),
    /** The file's name, or what the student called a pasted set. */
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("card_imports_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "card_imports_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    index("card_imports_subject_idx").on(t.workspaceId, t.subjectId, t.createdAt),
    check("card_imports_source_check", sql`${t.source} in ('anki', 'quizlet', 'text')`),
  ],
);

/**
 * Pictures on cards (ADR-021). The browser uploads the original straight to
 * storage; the server then re-encodes it as WebP (stripping its metadata and
 * capping its size), deletes the original and marks the image ready. An
 * image no card uses is deleted by the hourly clean-up a day after upload.
 */
export const cardImages = pgTable(
  "card_images",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    status: text("status").notNull().default("pending"),
    /** The size declared for the upload while pending, then the stored WebP's size. */
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("card_images_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "card_images_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    index("card_images_created_idx").on(t.createdAt),
    check("card_images_status_check", sql`${t.status} in ('pending', 'ready')`),
    check("card_images_size_check", sql`${t.sizeBytes} >= 0`),
  ],
);

/** One box hidden on an image occlusion card, in fractions of the image's width and height. */
export type OcclusionBox = { n: number; x: number; y: number; w: number; h: number };

/**
 * Flashcards. A card belongs to one subject and links to its topics; there
 * are no decks, because a deck is a filter over subject and topics (§20).
 * For a cloze card `front` holds the text with its deletions and `back` any
 * extra detail shown with the answer. Either side may also have a picture.
 * An image occlusion card has its picture on the front, the boxes hidden on
 * it in `occlusions`, an optional prompt in `front` and extra detail in `back`.
 */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    type: cardType("type").notNull(),
    front: text("front").notNull(),
    back: text("back").notNull().default(""),
    frontImageId: uuid("front_image_id"),
    backImageId: uuid("back_image_id"),
    occlusions: jsonb("occlusions").$type<OcclusionBox[]>(),
    origin: cardOrigin("origin").notNull().default("user"),
    /** The note or document page the card was made from, if any. Cleared if the source is deleted. */
    sourceNoteId: uuid("source_note_id").references(() => notes.id, { onDelete: "set null" }),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id, { onDelete: "set null" }),
    sourcePage: integer("source_page"),
    /** The import that added the card, if it was imported. */
    importId: uuid("import_id"),
    /** A suspended card is kept, with its history, but never shown for review. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    searchVector: tsvector("search_vector")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('english', coalesce(front, '')), 'A') || setweight(to_tsvector('english', coalesce(back, '')), 'B')`,
      ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("cards_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "cards_subject_fk",
      columns: [t.workspaceId, t.subjectId],
      foreignColumns: [subjects.workspaceId, subjects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cards_import_fk",
      columns: [t.workspaceId, t.importId],
      foreignColumns: [cardImports.workspaceId, cardImports.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cards_front_image_fk",
      columns: [t.workspaceId, t.frontImageId],
      foreignColumns: [cardImages.workspaceId, cardImages.id],
    }),
    foreignKey({
      name: "cards_back_image_fk",
      columns: [t.workspaceId, t.backImageId],
      foreignColumns: [cardImages.workspaceId, cardImages.id],
    }),
    index("cards_subject_idx").on(t.workspaceId, t.subjectId, t.createdAt),
    index("cards_import_idx").on(t.workspaceId, t.importId),
    index("cards_search_idx").using("gin", t.searchVector),
    check("cards_source_page_positive", sql`${t.sourcePage} is null or ${t.sourcePage} > 0`),
    check(
      "cards_occlusions_check",
      sql`(${t.type}::text = 'image_occlusion') = (${t.occlusions} is not null and ${t.frontImageId} is not null)`,
    ),
  ],
);

/** The topics a card covers. */
export const cardTopics = pgTable(
  "card_topics",
  {
    workspaceId: uuid("workspace_id").notNull(),
    cardId: uuid("card_id").notNull(),
    topicId: uuid("topic_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.topicId] }),
    foreignKey({
      name: "card_topics_card_fk",
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [cards.workspaceId, cards.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "card_topics_topic_fk",
      columns: [t.workspaceId, t.topicId],
      foreignColumns: [topics.workspaceId, topics.id],
    }).onDelete("cascade"),
    index("card_topics_topic_idx").on(t.workspaceId, t.topicId),
  ],
);

/**
 * The FSRS memory state of each reviewable item of a card (§21). A basic
 * card has one item (ordinal 0); a reversed card has two (0 front→back,
 * 1 back→front); a cloze card has one per deletion number (c1 → 1, …).
 */
export const cardStates = pgTable(
  "card_states",
  {
    workspaceId: uuid("workspace_id").notNull(),
    cardId: uuid("card_id").notNull(),
    ordinal: smallint("ordinal").notNull(),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: cardLearningState("state").notNull().default("new"),
    lastReview: timestamp("last_review", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.ordinal] }),
    foreignKey({
      name: "card_states_card_fk",
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [cards.workspaceId, cards.id],
    }).onDelete("cascade"),
    index("card_states_due_idx").on(t.workspaceId, t.state, t.due),
    check("card_states_ordinal_range", sql`${t.ordinal} >= 0 and ${t.ordinal} <= 99`),
  ],
);

/**
 * Every rating, append-only (§21): to audit scheduling, to fit FSRS
 * parameters to the student later, and to feed mastery. `previous` is the
 * item's state before the rating, so the latest rating can be undone.
 */
export const cardReviews = pgTable(
  "card_reviews",
  {
    /** Chosen by the browser, so a retried rating is recorded once. */
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    cardId: uuid("card_id").notNull(),
    ordinal: smallint("ordinal").notNull(),
    rating: smallint("rating").notNull(),
    stateBefore: cardLearningState("state_before").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    durationMs: integer("duration_ms"),
    previous: jsonb("previous").notNull(),
  },
  (t) => [
    foreignKey({
      name: "card_reviews_card_fk",
      columns: [t.workspaceId, t.cardId],
      foreignColumns: [cards.workspaceId, cards.id],
    }).onDelete("cascade"),
    index("card_reviews_item_idx").on(t.cardId, t.ordinal, t.reviewedAt),
    index("card_reviews_day_idx").on(t.workspaceId, t.reviewedAt),
    check("card_reviews_rating_range", sql`${t.rating} between 1 and 4`),
  ],
);
