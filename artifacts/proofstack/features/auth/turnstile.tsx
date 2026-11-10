"use client";
import { useEffect, useRef } from "react";

// Cloudflare Turnstile: a bot check that usually completes without any
// interaction. It renders only when the API serves a site key (the check is
// on), and hands the form a token to send with the action. The server
// verifies the token once; without one the action is refused.
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type Turnstile = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not load"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function TurnstileField({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id: string | null = null;
    let gone = false;
    load()
      .then((turnstile) => {
        if (gone || !box.current) return;
        id = turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: "auto",
          callback: onToken,
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
      onToken(null);
    };
    // onToken is a state setter; re-rendering on it would reset the widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, action]);
  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
