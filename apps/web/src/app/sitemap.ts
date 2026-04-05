import type { MetadataRoute } from "next";
import { getCardSlugsForSitemap } from "@/lib/db";

const BASE_URL = "https://scrymarket.au";

const staticRoutes: MetadataRoute.Sitemap = [
  { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  { url: `${BASE_URL}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  { url: `${BASE_URL}/disclaimer`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cards = await getCardSlugsForSitemap();
  const cardUrls: MetadataRoute.Sitemap = cards.map((c) => ({
    url: `${BASE_URL}/cards/${c.slug}`,
    lastModified: c.updated_at,
    changeFrequency: "daily",
    priority: 0.8,
  }));
  return [...staticRoutes, ...cardUrls];
}
