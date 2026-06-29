import { auth } from "@/auth";
import { redirect } from "next/navigation";
import GlobalChatClient from "./GlobalChatClient";

export const dynamic = "force-dynamic";

export default async function GlobalChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const userEmail = String(session.user.email ?? "");
  return <GlobalChatClient userEmail={userEmail} />;
}
