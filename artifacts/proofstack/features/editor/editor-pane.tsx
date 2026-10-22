"use client";

import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";

export function languageName(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return (
    languages.find((l) =>
      l.extensions.some((e) => e.toLowerCase() === extension),
    )?.name ?? "Plain text"
  );
}

// The editing surface of the workbench: full height, follows the site theme.
export function EditorPane({
  path,
  value,
  readOnly,
  onChange,
  onCursor,
  onSave,
}: {
  path: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onCursor: (line: number, column: number) => void;
  onSave: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const [language, setLanguage] = useState<Extension[]>([]);
  useEffect(() => {
    let current = true;
    const extension = path.split(".").at(-1)?.toLowerCase();
    const match = languages.find((l) =>
      l.extensions.some((e) => e.toLowerCase() === extension),
    );
    if (!match) {
      setLanguage([]);
      return;
    }
    void match.load().then((support) => {
      if (current) setLanguage([support]);
    });
    return () => {
      current = false;
    };
  }, [path]);
  const extensions = useMemo(
    () => [
      ...language,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSave();
            return true;
          },
        },
      ]),
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onCursor(line.number, head - line.from + 1);
      }),
    ],
    [language, onCursor, onSave],
  );
  return (
    <CodeMirror
      key={path}
      aria-label={`Editing ${path}`}
      value={value}
      height="100%"
      className="h-full text-[13px]"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: true,
        searchKeymap: true,
      }}
    />
  );
}
