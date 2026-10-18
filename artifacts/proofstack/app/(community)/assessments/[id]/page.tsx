import React from "react";
import { AssessmentAttemptView } from "../../../../features/assessments/assessment-attempt";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentAttemptView id={id} />;
}
