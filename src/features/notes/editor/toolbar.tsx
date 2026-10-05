"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  CheckSquare,
  ChevronDown,
  Code,
  Code2,
  Columns3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Rows3,
  Sigma,
  SquareFunction,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MathKind } from "./extensions";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = (key: string) => `${isMac() ? "⌘" : "Ctrl+"}${key}`;

const BLOCK_STYLES = [
  { label: "Text", level: 0 },
  { label: "Heading 1", level: 1 },
  { label: "Heading 2", level: 2 },
  { label: "Heading 3", level: 3 },
] as const;

/** The formatting bar above the note. Everything here also has a keyboard shortcut or a "/" command. */
export function EditorToolbar({
  editor,
  onLink,
  onMath,
}: {
  editor: Editor;
  onLink: () => void;
  onMath: (kind: MathKind) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      level: ([1, 2, 3] as const).find((level) => e.isActive("heading", { level })) ?? 0,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      taskList: e.isActive("taskList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();
  const style = BLOCK_STYLES.find((s) => s.level === state.level) ?? BLOCK_STYLES[0];

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-14 z-20 -mx-1 flex items-center gap-0.5 overflow-x-auto border-b px-1 py-1.5 backdrop-blur md:top-0"
    >
      <ToolButton label="Undo" shortcut={mod("Z")} disabled={!state.canUndo} onClick={() => run().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton
        label="Redo"
        shortcut={mod(isMac() ? "⇧Z" : "Y")}
        disabled={!state.canRedo}
        onClick={() => run().redo().run()}
      >
        <Redo2 />
      </ToolButton>
      <Divider />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-[7.5rem] shrink-0 justify-between font-normal">
            {style.label}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          {BLOCK_STYLES.map((s) => (
            <DropdownMenuItem
              key={s.label}
              onSelect={() => (s.level === 0 ? run().setParagraph().run() : run().setHeading({ level: s.level }).run())}
              className={cn(
                s.level === 1 && "text-lg font-semibold",
                s.level === 2 && "text-base font-semibold",
                s.level === 3 && "font-semibold",
              )}
            >
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />
      <ToolButton label="Bold" shortcut={mod("B")} active={state.bold} onClick={() => run().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic" shortcut={mod("I")} active={state.italic} onClick={() => run().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton
        label="Underline"
        shortcut={mod("U")}
        active={state.underline}
        onClick={() => run().toggleUnderline().run()}
      >
        <Underline />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        shortcut={mod(isMac() ? "⇧S" : "Shift+S")}
        active={state.strike}
        onClick={() => run().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolButton>
      <ToolButton
        label="Highlight"
        shortcut={mod(isMac() ? "⇧H" : "Shift+H")}
        active={state.highlight}
        onClick={() => run().toggleHighlight().run()}
      >
        <Highlighter />
      </ToolButton>
      <ToolButton label="Inline code" shortcut={mod("E")} active={state.code} onClick={() => run().toggleCode().run()}>
        <Code />
      </ToolButton>
      <ToolButton label="Link" active={state.link} onClick={onLink}>
        <Link2 />
      </ToolButton>
      <Divider />
      <ToolButton label="Bulleted list" active={state.bulletList} onClick={() => run().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label="Numbered list" active={state.orderedList} onClick={() => run().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label="To-do list" active={state.taskList} onClick={() => run().toggleTaskList().run()}>
        <CheckSquare />
      </ToolButton>
      <ToolButton label="Quote" active={state.blockquote} onClick={() => run().toggleBlockquote().run()}>
        <Quote />
      </ToolButton>
      <ToolButton label="Code block" active={state.codeBlock} onClick={() => run().toggleCodeBlock().run()}>
        <Code2 />
      </ToolButton>
      <Divider />
      <ToolButton label="Inline maths" onClick={() => onMath("inline")}>
        <Sigma />
      </ToolButton>
      <ToolButton label="Equation" onClick={() => onMath("block")}>
        <SquareFunction />
      </ToolButton>
      {state.table ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="bg-accent shrink-0" aria-label="Table options">
              <Table />
              <ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem onSelect={() => run().addRowAfter().run()}>
              <Rows3 aria-hidden />
              Add row below
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run().addColumnAfter().run()}>
              <Columns3 aria-hidden />
              Add column right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => run().deleteRow().run()}>
              <Rows3 aria-hidden />
              Delete row
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run().deleteColumn().run()}>
              <Columns3 aria-hidden />
              Delete column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => run().deleteTable().run()}>
              <Trash2 aria-hidden />
              Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <ToolButton label="Table" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table />
        </ToolButton>
      )}
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="bg-border mx-1 h-5 w-px shrink-0" />;
}

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active === undefined ? undefined : active}
          disabled={disabled}
          // Keeps the selection in the editor while clicking.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn("text-muted-foreground shrink-0", active && "bg-accent text-accent-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
