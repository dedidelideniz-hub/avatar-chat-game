import { useEffect, useRef, useState } from "react";

type LogEntry = {
  id: number;
  level: "log" | "warn" | "error";
  text: string;
  time: string;
};

let nextId = 0;

/**
 * Temporary on-screen console overlay for mobile debugging.
 * Activate by adding ?debug to the URL.
 * Captures console.log / console.warn / console.error and shows them
 * in a floating scrollable panel.
 */
export function DebugConsole({ maxEntries = 60 }: { maxEntries?: number }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const push = (level: LogEntry["level"], args: any[]) => {
      const text = args
        .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 0) : String(a)))
        .join(" ");
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
      setEntries((prev) => {
        const next = [...prev, { id: nextId++, level, text, time }];
        return next.length > maxEntries ? next.slice(-maxEntries) : next;
      });
    };

    console.log = (...args: any[]) => { origLog(...args); push("log", args); };
    console.warn = (...args: any[]) => { origWarn(...args); push("warn", args); };
    console.error = (...args: any[]) => { origError(...args); push("error", args); };

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    };
  }, [maxEntries]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current && !collapsed) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, collapsed]);

  // Filter state
  const [filter, setFilter] = useState("[Equip]");
  const filtered = filter
    ? entries.filter((e) => e.text.includes(filter))
    : entries;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        fontFamily: "monospace",
        fontSize: 10,
        pointerEvents: "auto",
      }}
    >
      {/* Toggle bar */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "#1a1a2e",
          color: "#00ff88",
          padding: "4px 10px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid #333",
          userSelect: "none",
        }}
      >
        <span>
          📟 Debug Console ({filtered.length}/{entries.length})
        </span>
        <span>{collapsed ? "▲ Aç" : "▼ Kapat"}</span>
      </div>

      {!collapsed && (
        <>
          {/* Filter input */}
          <div style={{ background: "#111", padding: "3px 6px", display: "flex", gap: 4 }}>
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtre... (boş = tümü)"
              style={{
                flex: 1,
                background: "#222",
                color: "#00ff88",
                border: "1px solid #444",
                borderRadius: 3,
                padding: "2px 6px",
                fontSize: 10,
                fontFamily: "monospace",
              }}
            />
            <button
              onClick={() => setEntries([])}
              style={{
                background: "#333",
                color: "#ff6666",
                border: "1px solid #555",
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              🗑 Temizle
            </button>
          </div>

          {/* Log list */}
          <div
            ref={listRef}
            style={{
              background: "rgba(10, 10, 30, 0.95)",
              maxHeight: "40vh",
              overflowY: "auto",
              padding: "4px 6px",
              borderTop: "1px solid #333",
            }}
          >
            {filtered.length === 0 && (
              <div style={{ color: "#666", padding: 4 }}>Henüz log yok...</div>
            )}
            {filtered.map((e) => (
              <div
                key={e.id}
                style={{
                  color:
                    e.level === "error"
                      ? "#ff4444"
                      : e.level === "warn"
                        ? "#ffaa00"
                        : "#00dd66",
                  padding: "1px 0",
                  wordBreak: "break-all",
                  lineHeight: 1.3,
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span style={{ color: "#555" }}>{e.time} </span>
                <span style={{ fontWeight: "bold" }}>
                  {e.level === "error" ? "❌" : e.level === "warn" ? "⚠️" : "📝"}
                </span>{" "}
                {e.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
