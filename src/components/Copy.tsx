import { Button } from "@/components/ui/button";
import { useState } from "react";

export async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export default function Copy({ text, label = "Copy", className = "btn" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant={className.includes("btn-primary") ? "studioPrimary" : "studio"} size="studio"
      type="button"
      className={className.replace(/btn(?:-primary)?/g, "").trim()}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </Button>
  );
}
