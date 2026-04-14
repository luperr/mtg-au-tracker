import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { RATE_LIMIT_CONTACT_PER_HOUR, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_API_URL } from "@/lib/config";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  "wrong-price": "wrong-price",
  "store-request": "store-request",
  enhancement: "enhancement",
  feedback: "feedback",
};

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug report",
  "wrong-price": "Wrong price/printing",
  "store-request": "New store request",
  enhancement: "Feature idea",
  feedback: "General feedback",
};

const checkRateLimit = createRateLimiter(RATE_LIMIT_CONTACT_PER_HOUR, 60 * 60 * 1000);

function buildTitle(type: string, cardName?: string, storeName?: string): string {
  const prefix = TYPE_LABELS[type] ?? "Feedback";
  if (type === "bug" || type === "wrong-price") {
    if (cardName && storeName) return `[${prefix}] ${cardName} at ${storeName}`;
    if (cardName) return `[${prefix}] ${cardName}`;
    return `[${prefix}] Report`;
  }
  if (type === "store-request" && storeName) return `[${prefix}] ${storeName}`;
  return `[${prefix}]`;
}

function buildBody(fields: {
  type: string;
  description: string;
  cardName?: string;
  printing?: string;
  storeName?: string;
  storeUrl?: string;
  email?: string;
}): string {
  return `## Report type
${TYPE_LABELS[fields.type] ?? fields.type}

## Description
${fields.description}

## Card name
${fields.cardName || "Not provided"}

## Printing
${fields.printing || "Not provided"}

## Store
${fields.storeName || "Not provided"}

## Store URL
${fields.storeUrl || "Not provided"}

## Contact email
${fields.email || "Not provided"}

---
*Submitted via Scrymarket contact form*`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot — silently accept so bots don't retry
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const { type, description, cardName, printing, storeName, storeUrl, email } = body;

  if (!type || !LABEL_MAP[type]) {
    return NextResponse.json({ error: "Invalid issue type" }, { status: 400 });
  }
  if (!description || description.trim().length < 20) {
    return NextResponse.json(
      { error: "Description must be at least 20 characters" },
      { status: 400 }
    );
  }

  if (process.env.NODE_ENV !== "development" && !checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again in an hour." },
      { status: 429 }
    );
  }

  if (!GITHUB_TOKEN) {
    console.error("[contact] GITHUB_TOKEN env var not set");
    return NextResponse.json({ error: "Contact form is not configured" }, { status: 500 });
  }

  const title = buildTitle(type, cardName?.trim(), storeName?.trim());
  const issueBody = buildBody({
    type,
    description: description.trim(),
    cardName: cardName?.trim(),
    printing: printing?.trim(),
    storeName: storeName?.trim(),
    storeUrl: storeUrl?.trim(),
    email: email?.trim(),
  });

  const ghRes = await fetch(
    `${GITHUB_API_URL}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "Scrymarket/1.0",
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: [LABEL_MAP[type]],
      }),
    }
  );

  if (!ghRes.ok) {
    const text = await ghRes.text();
    console.error(`[contact] GitHub API ${ghRes.status}:`, text);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
