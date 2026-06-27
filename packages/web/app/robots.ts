import type { MetadataRoute } from 'next';
import { IS_PUBLIC_PRODUCTION, SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  // Only the public production host (www) is indexable. Beta and every other host
  // (previews, local) stay fully blocked so internal R&D never reaches search engines.
  if (!IS_PUBLIC_PRODUCTION) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
