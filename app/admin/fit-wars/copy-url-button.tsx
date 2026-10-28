"use client";

import { useState } from "react";

export default function CopyUrlButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="adm-btn" data-variant="secondary" data-size="sm" onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }).catch(() => undefined); }}>{copied ? "Copied" : "Copy URL"}</button>;
}
