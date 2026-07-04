import { Component } from "@/lib/decks/templates/delivery-radius-review/Component";
import { deliveryRadiusReviewSamplePayload } from "@/lib/decks/templates/delivery-radius-review/payload";

export const metadata = {
  title: "Roselands Jan–Jun 2026 Review · Optimise Digital",
  robots: { index: false, follow: false },
};

export default function RoselandsJanJun2026ReviewPage() {
  return <Component payload={deliveryRadiusReviewSamplePayload} />;
}
