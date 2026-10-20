"use client";

import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { useEffect, useState } from "react";

export function CodeEditor({
  path,
  value,
  onChange,
  readOnly = false,
}: {
  path: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  useEffect(() => {
    let current = true;
    const extension = path.split(".").at(-1)?.toLowerCase();
    const language = extension
      ? languages.find((candidate) =>
          candidate.extensions.some(
            (value) => value.toLowerCase() === extension,
          ),
        )
      : undefined;
    if (!language) {
      setExtensions([]);
      return () => {
        current = false;
      };
    }
    void language.load().then((support) => {
      if (current) setExtensions([support]);
    });
    return () => {
      current = false;
    };
  }, [path]);
  return (
    <div aria-label={`Code editor for ${path}`} role="group">
      <CodeMirror
        value={value}
        height="22rem"
        theme="none"
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: true }}
      />
    </div>
  );
}
