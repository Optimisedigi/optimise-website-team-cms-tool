import type { Metadata } from "next";

import { PatientJourneyReviewClient } from "./PatientJourneyReviewClient";

export const metadata: Metadata = {
  title: "Cipher Health Patient Journey Review | Optimise Digital CMS",
  description: "PIN-protected shared working document for Cipher Health patient journey review.",
  robots: { index: false, follow: false },
};

export default function CipherHealthPatientJourneyReviewPage() {
  return <PatientJourneyReviewClient />;
}
