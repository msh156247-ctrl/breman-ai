import { useEffect, useState } from "react";

export function useWebSocket(missionId?: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("bremen_jwt") : "";
    const wsUrl = missionId
      ? `ws://localhost:8000/ws/${missionId}${token ? `?jwt=${token}` : ""}`
      : `ws://localhost:8000/ws${token ? `?jwt=${token}` : ""}`;

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
      } catch {
        // noop
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => ws.close();
  }, [missionId]);

  return { messages, connected };
}
