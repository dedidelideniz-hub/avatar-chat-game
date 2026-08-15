import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  from: string;
  text: string;
  /** Accent color for the sender name (e.g. vendor brand color). */
  color?: string;
  isMe?: boolean;
}

const sheetPanel = {
  initial: { y: 40, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 40, opacity: 0 },
  transition: { duration: 0.25, ease: "easeOut" as const },
};

/** Street chat — a message log with an input. Lives outside the game area so
 *  the keyboard and scrolling work on mobile. */
export function ChatPanel({
  messages,
  username,
  onSend,
  onClose,
}: {
  messages: ChatMessage[];
  username: string;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[2px]"
      />
      <motion.div
        {...sheetPanel}
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[58vh] w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              💬 Cadde Sohbeti
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
              Caddedekilerle konuş — mesajın karakterinin üzerinde balon olarak
              görünür.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={onClose}
            aria-label="Sohbeti kapat"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          ref={listRef}
          className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-background/60 p-3"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.isMe
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border/70 bg-card"
                }`}
              >
                {!m.isMe && (
                  <p
                    className="text-[10px] font-extrabold"
                    style={{ color: m.color ?? "var(--muted-foreground)" }}
                  >
                    {m.from}
                  </p>
                )}
                <p className="leading-5">{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Mesaj yaz..."
            maxLength={120}
            autoComplete="off"
            className="h-11 flex-1 rounded-2xl"
          />
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 rounded-2xl"
            aria-label="Mesajı gönder"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </motion.div>
    </>
  );
}
