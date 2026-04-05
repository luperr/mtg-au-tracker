import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/want-list"] },
    sitemap: "https://scrymarket.au/sitemap.xml",
  };
}
