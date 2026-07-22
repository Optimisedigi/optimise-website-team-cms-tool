"use client";

import {
  incomingRevisionAction,
  insertReviewNote,
  parseReviewerNoteMarkdown,
  persistRecoveryRecord as persistWorkingDocRecovery,
  shouldOfferLocalRecovery,
  WorkingDocReviewEditor,
  type ReviewReply,
} from "@/components/WorkingDocReviewEditor";

const DOC_SLUG = "cipher/patient-journey-review";

export { incomingRevisionAction, insertReviewNote, parseReviewerNoteMarkdown, shouldOfferLocalRecovery };
export type { ReviewReply };

/** Cipher-scoped wrapper kept for existing imports and tests. */
export function persistRecoveryRecord(record: Parameters<typeof persistWorkingDocRecovery>[1]) {
  persistWorkingDocRecovery(DOC_SLUG, record);
}

export function PatientJourneyReviewClient() {
  return (
    <WorkingDocReviewEditor
      docSlug={DOC_SLUG}
      title="Patient Journey Review"
      subtitle="Shared working document for Cipher Health partners. Edits save automatically after you pause."
      businessName="Cipher Health patient journey review"
      reviewerStorageKey="cipher-patient-journey-reviewer-name"
      backupFileName="cipher-patient-journey-review-local-backup.md"
    />
  );
}
