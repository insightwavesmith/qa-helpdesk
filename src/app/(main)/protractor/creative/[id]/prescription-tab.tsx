"use client";

import { PrescriptionPanel } from "@/components/protractor/PrescriptionPanel";

interface PrescriptionTabProps {
  creativeMediaId: string;
  accountId: string;
}

export default function PrescriptionTab({ creativeMediaId, accountId }: PrescriptionTabProps) {
  return (
    <div className="py-4">
      <PrescriptionPanel creativeMediaId={creativeMediaId} accountId={accountId} />
    </div>
  );
}
