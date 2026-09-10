"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import { createChatStore, type ChatState } from "./chat-store";

const ChatStoreContext = createContext<StoreApi<ChatState> | null>(null);

export function ChatStoreProvider({
  children,
  focusOnMount = false,
}: {
  children: ReactNode;
  focusOnMount?: boolean;
}) {
  const [store] = useState(() => createChatStore({ focusOnMount }));
  return <ChatStoreContext.Provider value={store}>{children}</ChatStoreContext.Provider>;
}

export function useChatStoreApi(): StoreApi<ChatState> {
  const store = useContext(ChatStoreContext);
  if (!store) throw new Error("useChatStoreApi must be used inside ChatStoreProvider");
  return store;
}

export function useChatStore<T>(selector: (state: ChatState) => T): T {
  return useStore(useChatStoreApi(), selector);
}
