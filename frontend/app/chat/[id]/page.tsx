import ChatRoomClient from "../../../components/chat/ChatRoomClient";


export default function ChatRoomPage({ params }: { params: { id: string } }) {
  return <ChatRoomClient params={params} />;
}
