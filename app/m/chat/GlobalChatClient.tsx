"use client";
import ChatThread from "./ChatThread";

interface Props {
  userEmail: string;
}

export default function GlobalChatClient({ userEmail }: Props) {
  return (
    <div className="m-page">
      <div className="m-pagehead">
        <h1 className="m-title">Team channel</h1>
      </div>
      <ChatThread scope="global" userEmail={userEmail} />
    </div>
  );
}
