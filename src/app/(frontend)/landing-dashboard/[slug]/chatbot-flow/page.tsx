import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import config from "@/payload.config";
import { AWAY_DIGITAL_SLUG } from "@/lib/away-digital";
import { validateDashboardToken } from "../../../api/dashboard/verify/route";
import { DashboardPinEntry } from "@/components/dashboards/shared/DashboardPinEntry";
import { ChatbotFlowView } from "@/components/dashboards/landing/ChatbotFlowView";
import { PinGateFrame } from "@/components/PinGateFrame";
import "../../../google-dashboard/globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

interface Props { params: Promise<{ slug: string }>; }

export const metadata = { title: "Chatbot flow review | Away Digital Teams" };

export default async function ChatbotFlowPage({ params }: Props) {
  const { slug } = await params;
  // Reject every alias before authorization or data access. The shorter historical
  // slug belongs to another client and must never share Away's dashboard token.
  if (slug !== AWAY_DIGITAL_SLUG) notFound();

  const payload = await getPayload({ config });
  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: AWAY_DIGITAL_SLUG } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const client = clients.docs[0];
  if (!client) notFound();

  const cookieStore = await cookies();
  const isAuthenticated = validateDashboardToken(cookieStore.get("dashboard_token")?.value, AWAY_DIGITAL_SLUG);
  if (!isAuthenticated) {
    return (
      <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
        <PinGateFrame eyebrow="Chatbot Flow Review" title={client.name} subtitle="Enter your 4-digit PIN access code to review the proposed conversation flow">
          <DashboardPinEntry slug={AWAY_DIGITAL_SLUG} redirectTo={`/landing-dashboard/${AWAY_DIGITAL_SLUG}/chatbot-flow`} />
        </PinGateFrame>
      </div>
    );
  }

  return (
    <main className={`od-dashboard-root min-h-screen bg-slate-50 text-slate-900 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-col gap-2 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 font-mono text-xs font-medium uppercase tracking-[0.14em] text-slate-600">Review proposal</p>
            <h1 className="m-0 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Chatbot conversation flow</h1>
          </div>
          <p className="m-0 max-w-xl text-sm leading-6 text-slate-700 sm:text-right">A read-only view of every proposed path, fallback, handoff, and open implementation decision for {client.name}.</p>
        </header>
        <ChatbotFlowView />
      </div>
    </main>
  );
}
