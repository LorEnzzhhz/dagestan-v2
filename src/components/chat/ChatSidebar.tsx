import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Pin, PinOff, Search, Trash2 } from "lucide-react";
import type { Chat } from "@/lib/store";

interface Props {
  chats: Chat[];
  activeId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPin?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
}

export function ChatSidebar({
  chats,
  activeId,
  onNew,
  onSelect,
  onDelete,
  onPin,
  onRename,
}: Props) {
  const { user } = useAuth();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const displayName = user?.name || user?.email || "Explorer";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  // pinned first, then most recently updated
  const ordered = useMemo(() => [...chats.filter((c) => c.pinned), ...chats.filter((c) => !c.pinned)], [chats]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? ordered.filter((c) => c.title.toLowerCase().includes(q)) : ordered),
    [ordered, q],
  );

  const startRename = (chat: Chat) => {
    setRenamingId(chat._id);
    setDraft(chat.title);
  };

  const commitRename = (id: string) => {
    const t = draft.trim();
    if (t && t !== chats.find((c) => c._id === id)?.title) onRename?.(id, t);
    setRenamingId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className="mx-3 mt-3 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <span className="text-base leading-none">＋</span> New chat
      </button>

      <div className="relative mx-3 mt-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-[12px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
      </div>

      <nav className="scrollbar-slim mt-3 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {shown.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {q ? "No chats match your search" : "No conversations yet"}
          </p>
        )}
        {shown.map((chat) => (
          <div key={chat._id} className="group relative">
            {renamingId === chat._id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(chat._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(chat._id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-full rounded-md border border-primary/50 bg-card px-3 py-1.5 text-[13px] outline-none"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSelect(chat._id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md py-2 pl-3 pr-[74px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    chat._id === activeId && "bg-accent/70 text-foreground",
                  )}
                >
                  {chat.pinned && (
                    <Pin className="size-3 shrink-0 rotate-45 text-primary" />
                  )}
                  <span className="truncate">{chat.title}</span>
                </button>
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {onPin && (
                    <button
                      type="button"
                      aria-label={chat.pinned ? "Unpin chat" : "Pin chat"}
                      title={chat.pinned ? "Unpin" : "Pin"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(chat._id);
                      }}
                      className={cn(
                        "rounded p-1 text-muted-foreground transition-colors hover:text-primary",
                        chat.pinned && "text-primary",
                      )}
                    >
                      {chat.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                    </button>
                  )}
                  {onRename && (
                    <button
                      type="button"
                      aria-label="Rename chat"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(chat);
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Delete chat"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(chat._id);
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border/70 px-4 py-3">
        <Avatar className="size-7 border">
          {user?.image && <AvatarImage src={user.image} alt={displayName} />}
          <AvatarFallback className="bg-transparent text-[10px] font-semibold">
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{displayName}</p>
          <p className="truncate text-[10px] text-muted-foreground">Dagestan</p>
        </div>
      </div>
    </div>
  );
}
