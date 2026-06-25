"use client";

import ChatRoomView from "./ChatRoomView";

export default function ChatRoomClient({ params }: { params: { id: string } }) {
  return <ChatRoomView params={params} />;
}
