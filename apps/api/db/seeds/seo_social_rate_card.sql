-- Seed: SEO + Social Media rate card entries (S7)
-- Base rates: SEO = KES 3,000/hr, Social = KES 2,500/hr
-- Source: kws_rate_card_v1.html (inaugural pack)

INSERT INTO public.rate_card (category, task_name, task_description, complexity, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, active)
VALUES
  -- SEO (Cat. 03 - base KES 3,000/hr)
  ('seo', 'Technical SEO audit', 'Crawl analysis, sitemap, robots.txt, canonical tags, page speed, structured data check.', 'standard', 2.5, 3000, 7500, true),
  ('seo', 'On-page SEO audit - per page', 'Title tag, meta description, H1-H3 review, keyword alignment, internal linking check.', 'simple', 0.75, 3000, 2250, true),
  ('seo', 'On-page SEO fixes - per page', 'Implement audit recommendations on a single page. Copy edits, tag updates, image alt text.', 'simple', 0.5, 3000, 1500, true),
  ('seo', 'Google Search Console setup & verify', 'Property verification, sitemap submission, initial coverage report review.', 'simple', 0.75, 3000, 2250, true),
  ('seo', 'Google Business Profile setup', 'Create or claim GBP listing. Business info, categories, photos, opening hours, verification.', 'simple', 1.0, 3000, 3000, true),
  ('seo', 'Backlink profile audit', 'Analyse inbound link profile, flag toxic domains, disavow file if needed.', 'standard', 1.5, 3000, 4500, true),
  ('seo', 'SEO audit report & recommendations', 'PDF deliverable. Priority fix list, estimated impact scoring, 90-day action plan.', 'standard', 2.0, 3000, 6000, true),
  ('seo', 'Full site SEO audit (up to 10 pages)', 'Technical audit + on-page audit for up to 10 pages + backlink review + full report.', 'complex', 9.0, 3000, 27000, true),

  -- Social Media Management (Cat. 04 - base KES 2,500/hr)
  ('social', 'Single social media post', '1 post: copy, design asset, hashtag set, scheduled. Instagram or LinkedIn.', 'simple', 1.5, 2500, 3750, true),
  ('social', 'Social media post - carousel (4 slides)', '4-slide carousel post. Copy per slide, designed consistently. Caption + hashtags.', 'standard', 2.5, 2500, 6250, true),
  ('social', 'Monthly content calendar (4 posts/platform)', 'Strategy brief review, 4 post concepts per platform, copy drafts, design, scheduling.', 'standard', 6.0, 2500, 15000, true),
  ('social', 'Monthly content calendar (8 posts/platform)', 'Same as above, 8 posts. Full month coverage for active clients.', 'complex', 10.0, 2500, 25000, true),
  ('social', 'Social media profile setup', 'Create or optimise 1 profile. Bio, cover image, profile photo, link-in-bio, pinned post.', 'simple', 1.0, 2500, 2500, true),
  ('social', 'Social media audit & strategy brief', 'Review current accounts, competitor benchmarking, 3-month content strategy document.', 'standard', 3.0, 2500, 7500, true),
  ('social', 'Promotional post - event / product launch', 'Campaign post set (3 posts: pre, launch, follow-up). Copy, design, scheduling per post.', 'standard', 4.0, 2500, 10000, true)
ON CONFLICT DO NOTHING;
