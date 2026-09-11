import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://automator.ardasari.co", lastModified: new Date(), priority: 1 }];
}
