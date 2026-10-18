import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/workspace";

export const metadata: Metadata = {
  title: "Workspace · Receipts",
};

export default function AppPage() {
  return <Workspace />;
}
