import { useCallback, useState } from "react";
import * as db from "@/lib/db";
import { useNavigate } from "react-router";


export function useChatManager(initialChatId?: string) {
  const navigate = useNavigate();
  const [chats, setChats] = useState<db.Chat[]>(() => db.listChats());

  const refreshChats = useCallback(() => {
    setChats(db.listChats());
  }, []);

  const createChat = useCallback((
    title: string,
    provider: string,
    model: string,
  ): string => {
    const id = db.createChat(title, provider, model);
    refreshChats();
    return id;
  }, [refreshChats]);

  const deleteChat = useCallback((id: string) => {
    db.deleteChat(id);
    refreshChats();
    if (id === initialChatId) {
      navigate("/chat");
    }
  }, [refreshChats, initialChatId, navigate]);

  const renameChat = useCallback((id: string, title: string) => {
    db.renameChat(id, title);
    refreshChats();
  }, [refreshChats]);

  const togglePin = useCallback((id: string) => {
    db.togglePin(id);
    refreshChats();
  }, [refreshChats]);

  const setChatModel = useCallback((id: string, provider: string, model: string) => {
    db.setChatModel(id, provider, model);
  }, []);

  return {
    chats,
    refreshChats,
    createChat,
    deleteChat,
    renameChat,
    togglePin,
    setChatModel,
  };
}
