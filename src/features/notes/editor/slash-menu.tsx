"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  SquareFunction,
  Table,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MathKind } from "./extensions";

export type SlashItem = {
  title: string;
  hint: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  run: (editor: Editor, range: Range) => void;
};

/** The blocks the "/" menu offers. Maths opens the formula editor instead of inserting straight away. */
export function slashItems(openMath: (kind: MathKind) => void): SlashItem[] {
  const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);
  return [
    {
      title: "Text",
      hint: "Plain paragraph",
      keywords: ["paragraph", "p"],
      icon: Pilcrow,
      run: (e, r) => chain(e, r).setParagraph().run(),
    },
    {
      title: "Heading 1",
      hint: "Large section heading",
      keywords: ["h1", "title"],
      icon: Heading1,
      run: (e, r) => chain(e, r).setHeading({ level: 1 }).run(),
    },
    {
      title: "Heading 2",
      hint: "Medium heading",
      keywords: ["h2", "subtitle"],
      icon: Heading2,
      run: (e, r) => chain(e, r).setHeading({ level: 2 }).run(),
    },
    {
      title: "Heading 3",
      hint: "Small heading",
      keywords: ["h3"],
      icon: Heading3,
      run: (e, r) => chain(e, r).setHeading({ level: 3 }).run(),
    },
    {
      title: "Bulleted list",
      hint: "A simple list",
      keywords: ["ul", "bullet", "unordered"],
      icon: List,
      run: (e, r) => chain(e, r).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      hint: "A list with numbers",
      keywords: ["ol", "ordered", "steps"],
      icon: ListOrdered,
      run: (e, r) => chain(e, r).toggleOrderedList().run(),
    },
    {
      title: "To-do list",
      hint: "Track things to do",
      keywords: ["todo", "task", "checkbox", "check"],
      icon: CheckSquare,
      run: (e, r) => chain(e, r).toggleTaskList().run(),
    },
    {
      title: "Quote",
      hint: "A quotation or callout",
      keywords: ["blockquote", "callout"],
      icon: Quote,
      run: (e, r) => chain(e, r).setBlockquote().run(),
    },
    {
      title: "Code",
      hint: "A block of code",
      keywords: ["codeblock", "pre", "program"],
      icon: Code2,
      run: (e, r) => chain(e, r).setCodeBlock().run(),
    },
    {
      title: "Equation",
      hint: "A LaTeX formula on its own line",
      keywords: ["math", "maths", "latex", "formula", "block"],
      icon: SquareFunction,
      run: (e, r) => {
        chain(e, r).run();
        openMath("block");
      },
    },
    {
      title: "Inline maths",
      hint: "A LaTeX formula within the text",
      keywords: ["math", "maths", "latex", "formula", "inline"],
      icon: Sigma,
      run: (e, r) => {
        chain(e, r).run();
        openMath("inline");
      },
    },
    {
      title: "Table",
      hint: "Rows and columns",
      keywords: ["grid", "columns"],
      icon: Table,
      run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: "Divider",
      hint: "A horizontal line",
      keywords: ["hr", "rule", "separator", "line"],
      icon: Minus,
      run: (e, r) => chain(e, r).setHorizontalRule().run(),
    },
  ];
}

export function filterSlashItems(items: SlashItem[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.title.toLowerCase().includes(q) || i.keywords.some((k) => k.startsWith(q)));
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };
type MenuProps = SuggestionProps<SlashItem, SlashItem>;

const SlashMenuList = forwardRef<MenuHandle, MenuProps>(function SlashMenuList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);
  // A new list of items starts the selection again at the top.
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setSelected(0);
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      role="listbox"
      aria-label="Insert a block"
      className="bg-popover text-popover-foreground max-h-80 w-64 overflow-y-auto rounded-lg border p-1 shadow-lg"
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground px-2 py-1.5 text-sm">No matching blocks</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            role="option"
            aria-selected={i === selected}
            onMouseEnter={() => setSelected(i)}
            // Keeps the editor focused, so the command runs where the cursor is.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => command(item)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
              i === selected && "bg-accent text-accent-foreground",
            )}
          >
            <span className="bg-background grid size-8 shrink-0 place-items-center rounded-md border">
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="text-muted-foreground block truncate text-xs">{item.hint}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
});

/** The "/" menu: type a slash at the start of a word to insert a block. */
export function slashCommand(openMath: (kind: MathKind) => void) {
  const all = slashItems(openMath);
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          allowSpaces: false,
          // Not inside code, where a slash is just a slash.
          allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filterSlashItems(all, query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
            let unmount: (() => void) | null = null;
            return {
              onStart: (props) => {
                renderer = new ReactRenderer(SlashMenuList, { props, editor: props.editor });
                // The positioned wrapper decides stacking, so it sits above the sticky toolbar.
                (renderer.element as HTMLElement).style.zIndex = "50";
                unmount = props.mount(renderer.element as HTMLElement);
              },
              onUpdate: (props) => renderer?.updateProps(props),
              onKeyDown: (props) => {
                if (props.event.key === "Escape") return false;
                return renderer?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                unmount?.();
                renderer?.destroy();
                renderer = null;
                unmount = null;
              },
            };
          },
        }),
      ];
    },
  });
}
