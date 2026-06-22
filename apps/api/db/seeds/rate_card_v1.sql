-- ============================================================================
-- KWS rate_card v1.0 - seed
-- Source of truth: kws_rate_card_v1.html (5 categories, ~40 entries)
-- ADR-KWS-004: rate card lives in DB, not config
-- KWS-SEC-009: writes require admin role; this seed runs as service role
-- ============================================================================

-- Cat. 01 - Cloud Services (base KES 4,000/hr)
insert into public.rate_card (category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version) values
  ('cloud', 'GCP project creation', 'New project setup, billing account link, budget alerts, basic IAM', 1.0, 4000,  4000, 'simple',   '1.0'),
  ('cloud', 'IAM roles & permissions configuration', 'Service accounts, role assignments, least-privilege policy, access review', 1.5, 4000,  6000, 'standard', '1.0'),
  ('cloud', 'Google Workspace setup', 'Domain verification, MX records, up to 10 user accounts, admin console config', 2.0, 4000,  8000, 'standard', '1.0'),
  ('cloud', 'Microsoft 365 / Exchange setup', 'Tenant creation, domain config, up to 10 licences, Teams and SharePoint basics', 2.5, 4000, 10000, 'standard', '1.0'),
  ('cloud', 'Managed hosting provisioning', 'GCP or Railway site setup, SSL, domain pointing, uptime monitoring config', 2.0, 4000,  8000, 'standard', '1.0'),
  ('cloud', 'Cloud billing audit & optimisation', 'Review current GCP/Azure spend, identify waste, recommend rightsizing', 2.0, 4000,  8000, 'standard', '1.0'),
  ('cloud', 'Cloud migration assessment', 'Document current infrastructure, migration risk analysis, phased plan with cost estimate', 4.0, 4000, 16000, 'complex',  '1.0'),
  ('cloud', 'GCP / Azure migration execution', 'Live migration of existing project or workloads. Scoped per migration assessment first.', 6.0, 4000, 24000, 'complex',  '1.0')
on conflict (task_name, version) do nothing;

-- Cat. 02 - Web Development (base KES 3,500/hr)
insert into public.rate_card (category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version) values
  ('web', 'Content update - text only', 'Copy changes to existing pages. No layout changes. Up to 500 words.', 0.5, 3500,  1750, 'simple',   '1.0'),
  ('web', 'Image swap or gallery update', 'Replace or add images on existing pages. Image optimisation included.', 0.5, 3500,  1750, 'simple',   '1.0'),
  ('web', 'Contact form rebuild', 'Rebuild or replace contact form. Spam protection, email routing, confirmation message.', 1.0, 3500,  3500, 'simple',   '1.0'),
  ('web', 'Section redesign (hero, about, CTA)', 'Redesign one page section. New layout, typography, images. Mobile-responsive.', 3.0, 3500, 10500, 'standard', '1.0'),
  ('web', 'New page - template-based', 'Add a new page using existing site structure and design patterns. Up to 6 sections.', 3.5, 3500, 12250, 'standard', '1.0'),
  ('web', 'Landing page build', 'Single-page conversion build. Copy, design, form integration, mobile-first. No bespoke dev.', 5.0, 3500, 17500, 'standard', '1.0'),
  ('web', 'CMS setup & configuration', 'WordPress or headless CMS installation, theme setup, admin training session (1 hr).', 4.0, 3500, 14000, 'standard', '1.0'),
  ('web', 'SME website build - template', '5-8 page mobile-first website. Template-based. Copy provided by client. Not bespoke.', 16.0, 3500, 56000, 'complex',  '1.0'),
  ('web', 'Security patch & plugin update', 'WordPress core + plugin updates, backup before, staging test, go-live confirmation.', 0.75, 3500, 2625, 'simple',   '1.0'),
  ('web', 'Performance audit & fix', 'Page speed analysis, image compression, caching setup, Core Web Vitals review.', 2.5, 3500,  8750, 'standard', '1.0')
on conflict (task_name, version) do nothing;

-- Cat. 03 - SEO (base KES 3,000/hr)
insert into public.rate_card (category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version) values
  ('seo', 'Technical SEO audit', 'Crawl analysis, sitemap, robots.txt, canonical tags, page speed, structured data check.', 2.5, 3000, 7500, 'standard', '1.0'),
  ('seo', 'On-page SEO audit - per page', 'Title tag, meta description, H1-H3 review, keyword alignment, internal linking check.', 0.75, 3000, 2250, 'simple',   '1.0'),
  ('seo', 'On-page SEO fixes - per page', 'Implement audit recommendations on a single page. Copy edits, tag updates, image alt text.', 0.5, 3000, 1500, 'simple',   '1.0'),
  ('seo', 'Google Search Console setup & verify', 'Property verification, sitemap submission, initial coverage report review.', 0.75, 3000, 2250, 'simple',   '1.0'),
  ('seo', 'Google Business Profile setup', 'Create or claim profile, verify, populate all fields, link to website, initial photo upload.', 1.0, 3000, 3000, 'simple',   '1.0'),
  ('seo', 'Backlink profile audit', 'Analyse inbound link profile, flag toxic domains, disavow file if needed.', 1.5, 3000, 4500, 'standard', '1.0'),
  ('seo', 'SEO audit report & recommendations', 'PDF deliverable. Priority fix list, estimated impact scoring, 90-day action plan.', 2.0, 3000, 6000, 'standard', '1.0'),
  ('seo', 'Full site SEO audit (up to 10 pages)', 'Technical audit + on-page audit for up to 10 pages + backlink review + full report.', 9.0, 3000, 27000, 'complex',  '1.0')
on conflict (task_name, version) do nothing;

-- Cat. 04 - Social Media Management (base KES 2,500/hr)
insert into public.rate_card (category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version) values
  ('social', 'Single social media post', '1 post: copy, design asset, hashtag set, scheduled. Instagram or LinkedIn.', 1.5, 2500, 3750, 'simple',   '1.0'),
  ('social', 'Social media post - carousel (4 slides)', '4-slide carousel post. Copy per slide, designed consistently. Caption + hashtags.', 2.5, 2500, 6250, 'standard', '1.0'),
  ('social', 'Monthly content calendar (4 posts/platform)', 'Strategy brief review, 4 post concepts per platform, copy drafts, design, scheduling.', 6.0, 2500, 15000, 'standard', '1.0'),
  ('social', 'Monthly content calendar (8 posts/platform)', 'Same as above, 8 posts. Full month coverage for active clients.', 10.0, 2500, 25000, 'complex',  '1.0'),
  ('social', 'Social media profile setup', 'Create or optimise 1 profile. Bio, cover image, profile photo, link-in-bio, pinned post.', 1.0, 2500, 2500, 'simple',   '1.0'),
  ('social', 'Social media audit & strategy brief', 'Review current accounts, competitor benchmarking, 3-month content strategy document.', 3.0, 2500, 7500, 'standard', '1.0'),
  ('social', 'Promotional post - event / product launch', 'Campaign post set (3 posts: pre, launch, follow-up). Copy, design, scheduling per post.', 4.0, 2500, 10000, 'standard', '1.0')
on conflict (task_name, version) do nothing;

-- Cat. 05 - DNS, Domain & Maintenance (base KES 2,000/hr)
insert into public.rate_card (category, task_name, task_description, estimated_hours, base_rate_kes_per_hour, fixed_price_kes, complexity, version) values
  ('dns', 'DNS record addition (A, CNAME, TXT)', 'Add or update a single DNS record. Verification included.', 0.5, 2000, 1000, 'simple',   '1.0'),
  ('dns', 'MX record setup (email routing)', 'Add and verify MX records for Google Workspace, Microsoft 365, or third-party email.', 0.75, 2000, 1500, 'simple',   '1.0'),
  ('dns', 'Domain transfer to Cloudflare', 'Transfer domain registrar to Cloudflare. Auth code, transfer initiation, verification.', 1.0, 2000, 2000, 'standard', '1.0'),
  ('dns', 'SSL certificate provisioning', 'Provision and install SSL on hosted site. Force HTTPS. Verify across browsers.', 0.5, 2000, 1000, 'simple',   '1.0'),
  ('dns', 'Domain renewal', 'Annual domain renewal via Cloudflare. Confirmation sent to client on completion.', 0.25, 2000, 500, 'simple',   '1.0'),
  ('dns', 'Full DNS audit & cleanup', 'Review all DNS records, identify stale or conflicting entries, document and clean up.', 1.5, 2000, 3000, 'standard', '1.0'),
  ('dns', 'Subdomain setup & routing', 'Create subdomain, point to correct server or service, verify routing and SSL.', 0.5, 2000, 1000, 'simple',   '1.0'),
  ('dns', 'Monthly maintenance retainer add-on', 'Uptime monitoring alerts, WordPress updates, SSL renewal check, monthly report.', 1.0, 2000, 2000, 'simple',   '1.0')
on conflict (task_name, version) do nothing;
