import { notFound } from "next/navigation";
import { getIssue } from "@/lib/repository";
import { IssueView } from "../../../components/IssueView";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();
  return <IssueView issue={issue} label={issue.isLatest ? "Today’s discovery" : "From the library"} />;
}
