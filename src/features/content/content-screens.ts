/** Which tables each content screen holds, as tabs. */
export const CONTENT_SCREENS: Record<string, { title: string; description: string; keys: string[] }> = {
  "/content/pages": { title: "Pages", description: "Website pages and the sections they are built from.", keys: ["pages", "page_sections"] },
  "/content/navigation": { title: "Navigation", description: "Header and footer menus.", keys: ["navigation_items"] },
  "/content/features": { title: "Features", description: "Features, their categories and use cases.", keys: ["features", "feature_categories", "use_cases"] },
  "/content/marketing": { title: "Proof & FAQs", description: "Testimonials, logos, stats, FAQs and videos.", keys: ["testimonials", "logos", "stats", "faqs", "videos", "video_categories"] },
  "/content/releases": { title: "Releases", description: "Product releases, their download files and system requirements.", keys: ["releases", "release_artifacts", "system_requirements"] },
  "/content/site": { title: "Site settings", description: "Company details, contact addresses and site-wide settings.", keys: ["site_settings"] },
  "/blog/posts": { title: "Blog posts", description: "Write and publish blog posts.", keys: ["blog_posts"] },
  "/blog/taxonomy": { title: "Categories & tags", description: "How blog posts are grouped.", keys: ["blog_categories", "blog_tags"] },
};
