import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUBBLE_COLORS, bubbleColorOf } from "@/lib/shop";
import { motion } from "framer-motion";
import { Check, Crown, Lock, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface ChatMessage {
  /** Stable key — a server chat row id, or a local numeric id for system
   *  / bot / vendor lines that never touch the server. */
  id: string | number;
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
  bubbleColor,
  isVip,
  onSelectColor,
  onOpenVip,
  onSend,
  onClose,
}: {
  messages: ChatMessage[];
  username: string;
  bubbleColor: string;
  isVip: boolean;
  onSelectColor: (colorId: string) => void;
  onOpenVip: () => void;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const colorDef = bubbleColorOf(bubbleColor);

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

  const pickColor = (colorId: string) => {
    const def = BUBBLE_COLORS.find((c) => c.id === colorId);
    if (!def) return;
    if (def.vip && !isVip) {
      toast.error("Bu renk VIP üyeliğe özel", {
        description:
          "Kraliyet VIP Köşesi'nden üyelik alınca tüm balon renkleri senin olur.",
        action: {
          label: "👑 VIP Al",
          onClick: onOpenVip,
        },
      });
      return;
    }
    onSelectColor(colorId);
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
        className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[62vh] w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-border bg-card p-5 shadow-2xl sm:p-6"
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
                    ? "rounded-br-md"
                    : "rounded-bl-md border border-border/70 bg-card"
                }`}
                style={
                  m.isMe
                    ? { backgroundColor: colorDef.hex, color: colorDef.text }
                    : undefined
                }
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

        {/* bubble color picker — like the classic client: a label pill + a
            row of swatches. Colored bubbles need a VIP membership. */}
        <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold shadow-sm"
              style={{ backgroundColor: colorDef.hex, color: colorDef.text }}
            >
              {colorDef.name} Konuşma Balonu
            </span>
            {isVip ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold text-amber-700">
                <Crown className="size-3" /> VIP aktif
              </span>
            ) : (
              <button
                type="button"
                onClick={onOpenVip}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-extrabold text-primary transition-colors hover:bg-primary/20"
              >
                <Crown className="size-3" /> Tüm renkler için VIP ol
              </button>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {BUBBLE_COLORS.map((c) => {
              const locked = c.vip && !isVip;
              const selected = c.id === colorDef.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickColor(c.id)}
                  aria-label={`${c.name} balon rengi${locked ? " (VIP gerekli)" : ""}`}
                  title={`${c.name}${locked ? " — VIP gerekli" : ""}`}
                  className={`relative size-8 rounded-full border-2 transition-transform active:scale-90 ${
                    selected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-black/10 hover:scale-110"
                  }`}
                  style={{ backgroundColor: c.hex }}
                >
                  {locked && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                      <Lock className="size-3.5 text-white" />
                    </span>
                  )}
                  {selected && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ color: c.text }}
                    >
                      <Check className="size-4" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] font-semibold text-muted-foreground">
            {isVip
              ? "Tüm renkler senin — balonu seç, dünyada görünsün."
              : "Beyaz balon herkese açık. Renkli balonlar VIP üyeliğe özel."}
          </p>
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
