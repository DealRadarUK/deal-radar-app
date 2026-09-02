// GET /api/status
//
// Tiny endpoint the dashboard/report pages use to check which optional
// integrations are actually configured, so the UI can adapt (e.g. show a
// manual metrics entry form instead of erroring when Metricool isn't
// connected) instead of guessing client-side.

import { NextResponse } from "next/server";
import { isMetricoolConfigured } from "@/lib/metricool";

export async function GET() {
  return NextResponse.json({ metricoolConfigured: isMetricoolConfigured() });
}
