import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "luperr";
const REPO_NAME = "mtg-au-tracker";

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

// Simple in-memory rate limiter — max 3 submissions per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

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
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

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
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
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
