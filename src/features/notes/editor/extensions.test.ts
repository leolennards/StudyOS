import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { NOTE_MARK_TYPES, NOTE_NODE_TYPES } from "@/server/modules/notes/domain/content";
import { noteExtensions } from "./extensions";

describe("note editor schema", () => {
  const schema = getSchema(noteExtensions());

  it("only produces blocks the server accepts", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([...NOTE_NODE_TYPES].sort());
  });

  it("only produces formatting the server accepts", () => {
    expect(Object.keys(schema.marks).sort()).toEqual([...NOTE_MARK_TYPES].sort());
  });
});
