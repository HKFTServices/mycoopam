import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Bot, User, Loader2, LifeBuoy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

export default function AiAssistantBubble() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: Msg = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Failed" }));
        upsert(err.error || "Sorry, something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) upsert(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch {
      upsert("Sorry, I couldn't connect. Please try again later.");
    }
    setIsLoading(false);
  }, [input, isLoading, messages]);

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 sm:bottom-20 right-4 z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden"
          style={{ height: "min(520px, calc(100vh - 7rem))" }}>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
            <span className="font-semibold text-sm flex-1">MyCoop Assistant</span>
            <button onClick={() => setOpen(false)} className="hover:opacity-80"><X className="h-4 w-4" /></button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-xs mt-6 px-4">
                <Bot className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Hi there! 👋 I'm your MyCoop assistant. Ask me anything about the platform.</p>
                <button
                  onClick={() => { setOpen(false); navigate("/dashboard/support-tickets"); }}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  Lodge an issue or suggestion
                </button>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "rounded-xl px-3 py-2 text-sm max-w-[80%]",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
                {m.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-xl px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-2">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type your question..."
                rows={1}
                className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-20 sm:bottom-4 right-4 z-[60] h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform",
          open && "bg-muted text-muted-foreground"
        )}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
}
