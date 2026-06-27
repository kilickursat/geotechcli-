import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Public, indexable routes only. Internal/API routes are intentionally excluded.
const ROUTES: Array<{ path: string; changeFrequency: 'weekly' | 'monthly'; priority: number }> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/docs', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/changelog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'monthly', priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
