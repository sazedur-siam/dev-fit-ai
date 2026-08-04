import { NextResponse } from "next/server";
import { getAllDevelopers } from "@/lib/developerHelpers";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ developers: getAllDevelopers() });
}
