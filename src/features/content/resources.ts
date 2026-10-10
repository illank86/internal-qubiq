import type { AppPermission } from "@/lib/types";
import type { Database } from "@/lib/database.types";

export type TableName = keyof Database["public"]["Tables"];

export type FieldType =
  | "text"
  | "slug"
  | "textarea"
  | "markdown"
  | "number"
  | "boolean"
  | "select"
  | "url"
  /** URL with a media picker attached: browse the library, upload, or paste. */
  | "image"
  /** Same picker, for things that are not pictures — installers, PDFs, checksums. */
  | "file"
  /** Media picker restricted to video, previewed with a real player. */
  | "video"
  /** Runtime typed as `mm:ss`, stored as seconds. */
  | "duration"
  /** Map pin. Writes this column plus the paired longitude column. */
  | "geo"
  | "tags"
  /** Short texts, one row each (highlights, key points): stored as a text array. */
  | "list"
  /** Release highlights: each a sentence with a kind (New / Improved / Fixed), stored "Kind: text". */
  | "release-notes"
  /** A text array typed as a multi-line box, one entry per line (an address). */
  | "lines"
  | "json"
  | "date"
  | "datetime"
  | "icon"
  | "relation";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** For `relation`: which table to offer, and which column to show. */
  relation?: { table: TableName; labelColumn: string; orderBy?: string };
  /**
   * For `geo`: the column that takes longitude (this field holds latitude), and
   * which address columns the reverse-geocoded pin should fill in.
   */
  geo?: {
    longitudeField: string;
    fill?: {
      addressLine?: string;
      city?: string;
      region?: string;
      country?: string;
      postalCode?: string;
    };
  };
  /**
   * Saved but never rendered.
   *
   * For a column another control already writes — the longitude half of a `geo`
   * pair. It still has to be declared, because `writableColumns` and the save
   * action are both driven off this list.
   */
  hidden?: boolean;
  /** Form section heading. Fields with no group land in "Content". */
  group?: string;
  /** 1 = half width on desktop, 2 = full width. Defaults to 2 for long-form types. */
  span?: 1 | 2;
  rows?: number;
};

export type ListColumn = {
  name: string;
  label: string;
  type?: "text" | "boolean" | "badge" | "number" | "bytes" | "date" | "image" | "duration";
  /** Renders the value of a joined row instead, e.g. `category.name`. */
  className?: string;
};

export type Resource = {
  /** Table name; also the URL segment at /admin/<key>. */
  key: TableName;
  label: string;
  singular: string;
  /**
   * Plural for row counts. The nav label usually doubles as the plural, but not
   * always — "Media library" would count as "2 media library".
   */
  plural?: string;
  description: string;
  icon: string;
  permission: AppPermission;
  /** Nav grouping in the admin sidebar. */
  section: "Site" | "Marketing" | "Commerce" | "Community" | "Blog" | "Inbox";
  /** Exactly one row; the list view is skipped and the form opens directly. */
  singleton?: boolean;
  /** Rows cannot be created or deleted from the UI (e.g. audit log). */
  readOnly?: boolean;
  /**
   * Tick several rows and delete them at once. Allowed even on a read-only
   * list whose rows nobody edits but which can be cleared out (the
   * notification log); RLS still decides who may delete.
   */
  bulkDelete?: boolean;
  /**
   * Left out of the sidebar because a bespoke page leads to it instead
   * (quote requests sit under Sales → Quotations; invoice settings beside
   * Invoices). The URL still works.
   */
  navHidden?: boolean;
  /**
   * Splits the edit form into tabs, each holding the named field groups in
   * order. Every tab stays in the form, so one Save keeps them all.
   */
  tabs?: { label: string; groups: string[] }[];
  /**
   * Rows arrive from the public site, not from staff. Hides "New …".
   *
   * Not cosmetic: `bug_reports` accepts an insert only when `reporter_id` is the
   * caller, so the generic form could never have produced a valid row — the
   * button led to an RLS error every time.
   */
  noCreate?: boolean;
  listColumns: ListColumn[];
  fields: Field[];
  defaultSort?: { column: string; ascending?: boolean }[];
  searchColumn?: string;
  /** Column holding the manual ordering, if the resource is sortable. */
  orderColumn?: string;
  /**
   * The column the ordering is scoped by, when `sort_order` restarts per parent.
   *
   * Page sections are numbered 1..n *within a page*, so several rows across the
   * table share every value. Without this, "move up" looks for the next lowest
   * `sort_order` anywhere in the table and can swap a home-page block with one
   * belonging to /download, reordering two pages at once. Set it wherever the
   * ordering is per-parent rather than global.
   */
  orderScope?: string;
  /**
   * Break the list into labelled groups on this column.
   *
   * For a resource whose ordering is per-parent, a flat table of every child of
   * every parent is close to unreadable — and the move buttons look broken,
   * because the row above on screen may belong to a different parent entirely.
   * Foreign keys are resolved to a name through the same lookup map the columns
   * use.
   */
  groupBy?: string;
};

const VISIBILITY: Field = {
  name: "is_visible",
  label: "Visible on the site",
  type: "boolean",
  group: "Display",
  span: 1,
};

const SORT_ORDER: Field = {
  name: "sort_order",
  label: "Sort order",
  type: "number",
  hint: "Lower numbers appear first.",
  group: "Display",
  span: 1,
};

const IMAGE_FIELDS: Field[] = [
  {
    name: "image_url",
    label: "Image URL",
    type: "image",
    group: "Media",
    hint: "Leave blank to show a labelled placeholder frame.",
  },
  { name: "image_alt", label: "Image alt text", type: "text", group: "Media", span: 1 },
];

const SEO_FIELDS: Field[] = [
  {
    name: "seo_title",
    label: "SEO title",
    type: "text",
    group: "SEO",
    hint: "The browser tab and the search result for this route. Wins over the site default — clear it to fall back.",
  },
  {
    name: "seo_description",
    label: "Meta description",
    type: "textarea",
    group: "SEO",
    rows: 3,
    hint: "Wins over the site default. Clear it to fall back.",
  },
];

/**
 * Everything an admin can edit, described once.
 *
 * The list page, the form page and the save action are all generated from these
 * definitions, so adding a manageable table means adding one entry here — not a
 * new route, form and action per table. The `key` is validated against this
 * registry before any query runs, which is what stops a crafted URL from
 * reaching a table that was never meant to be editable.
 */
export const RESOURCES: Resource[] = [
  // ---------------------------------------------------------------- Site
  {
    key: "site_settings",
    label: "Site settings",
    singular: "Site settings",
    description: "Brand, contact details, announcement bar and default SEO.",
    icon: "Sparkles",
    permission: "content.manage",
    section: "Site",
    singleton: true,
    listColumns: [],
    fields: [
      { name: "site_name", label: "Site name", type: "text", required: true, span: 1 },
      { name: "wordmark", label: "Header wordmark", type: "text", span: 1 },
      { name: "tagline", label: "Tagline", type: "text" },
      { name: "description", label: "Short description", type: "textarea", rows: 3 },

      { name: "logo_light_url", label: "Logo (light theme)", type: "image", group: "Media" },
      { name: "logo_dark_url", label: "Logo (dark theme)", type: "image", group: "Media" },
      { name: "default_og_image_url", label: "Default social image", type: "image", group: "Media" },

      {
        name: "default_seo_title",
        label: "Default SEO title",
        type: "text",
        group: "SEO",
        /**
         * Worth spelling out: a page's own SEO title always wins, and every
         * route in Pages has one — so editing this and watching nothing change
         * is the expected outcome, not a broken save.
         */
        hint: "Only used by routes with no SEO title of their own. To change a page's tab title, edit that page in Pages.",
      },
      {
        name: "default_seo_description",
        label: "Default meta description",
        type: "textarea",
        rows: 3,
        group: "SEO",
        hint: "Only used by routes with no meta description of their own.",
      },
      { name: "seo_keywords", label: "Default keywords", type: "tags", group: "SEO" },
      { name: "twitter_handle", label: "X / Twitter handle", type: "text", group: "SEO", span: 1 },

      { name: "organization_legal_name", label: "Legal entity name", type: "text", group: "Contact", span: 1 },
      { name: "founding_year", label: "Founded", type: "number", group: "Contact", span: 1 },
      { name: "contact_email", label: "General email", type: "text", group: "Contact", span: 1 },
      { name: "sales_email", label: "Sales email", type: "text", group: "Contact", span: 1 },
      { name: "support_email", label: "Support email", type: "text", group: "Contact", span: 1 },
      { name: "phone", label: "Phone", type: "text", group: "Contact", span: 1 },
      {
        name: "address_lines",
        label: "Address",
        type: "lines",
        group: "Contact",
        rows: 4,
        placeholder: "Street and number\nArea\nCity, province\nCountry",
        hint: "One line per row. Shown in the website footer, on invoices and quotations, and at the bottom of every email.",
      },

      {
        name: "social",
        label: "Social links",
        type: "json",
        group: "Advanced",
        hint: 'Object with any of: linkedin, github, youtube, x.',
      },
      {
        name: "announcement",
        label: "Announcement bar",
        type: "json",
        group: "Advanced",
        hint: '{ "enabled": true, "text": "...", "link_label": "...", "href": "/download" }',
      },
      {
        name: "header_ctas",
        label: "Header buttons",
        type: "json",
        group: "Advanced",
        hint: '[{ "label": "Download free", "href": "/download", "variant": "primary" }]',
      },
      {
        name: "legal_links",
        label: "Footer legal links",
        type: "json",
        group: "Advanced",
        hint: '[{ "label": "Privacy", "href": "/legal/privacy" }]',
      },
      { name: "footer_note", label: "Footer note", type: "text", group: "Advanced" },
    ],
  },
  {
    key: "navigation_items",
    label: "Navigation",
    singular: "Navigation item",
    description: "Header mega-menu, footer columns and utility links.",
    icon: "Waypoints",
    permission: "content.manage",
    section: "Site",
    orderColumn: "sort_order",
    searchColumn: "label",
    orderScope: "location",
    defaultSort: [{ column: "location" }, { column: "sort_order" }],
    listColumns: [
      { name: "label", label: "Label" },
      { name: "location", label: "Location", type: "badge" },
      { name: "href", label: "Link" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "label", label: "Label", type: "text", required: true, span: 1 },
      { name: "href", label: "Link", type: "text", required: true, span: 1, placeholder: "/features" },
      {
        name: "location",
        label: "Location",
        type: "select",
        span: 1,
        options: [
          { value: "header", label: "Header" },
          { value: "footer", label: "Footer" },
          { value: "legal", label: "Legal" },
          { value: "utility", label: "Utility" },
        ],
      },
      {
        name: "parent_id",
        label: "Parent item",
        type: "relation",
        span: 1,
        relation: { table: "navigation_items", labelColumn: "label" },
        hint: "Set to nest this under a header menu.",
      },
      { name: "group_label", label: "Footer column heading", type: "text", span: 1 },
      { name: "description", label: "Mega-menu description", type: "text" },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      { name: "badge", label: "Badge", type: "text", span: 1, placeholder: "New" },
      { name: "is_external", label: "Opens in a new tab", type: "boolean", group: "Display", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "pages",
    label: "Pages",
    singular: "Page",
    description: "One row per route. Owns that route's title, meta and sitemap entry.",
    icon: "FileText",
    permission: "content.manage",
    section: "Site",
    searchColumn: "title",
    defaultSort: [{ column: "sitemap_priority", ascending: false }],
    listColumns: [
      { name: "title", label: "Page" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "is_published", label: "Published", type: "boolean" },
      { name: "noindex", label: "No-index", type: "boolean" },
      { name: "updated_at", label: "Updated", type: "date" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      ...SEO_FIELDS,
      { name: "seo_keywords", label: "Keywords", type: "tags", group: "SEO" },
      { name: "og_image_url", label: "Social image", type: "image", group: "SEO" },
      {
        name: "canonical_url",
        label: "Canonical URL override",
        type: "url",
        group: "SEO",
        hint: "Leave blank to use this route's own URL.",
      },
      { name: "noindex", label: "Hide from search engines", type: "boolean", group: "SEO", span: 1 },
      { name: "is_published", label: "Published", type: "boolean", group: "Display", span: 1 },
      {
        name: "sitemap_priority",
        label: "Sitemap priority",
        type: "number",
        group: "Display",
        span: 1,
        hint: "0.0 to 1.0",
      },
      {
        name: "sitemap_changefreq",
        label: "Sitemap change frequency",
        type: "select",
        group: "Display",
        span: 1,
        options: ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].map((value) => ({
          value,
          label: value,
        })),
      },
    ],
  },
  {
    key: "page_sections",
    label: "Page sections",
    singular: "Section",
    description: "The ordered blocks that compose each page. Reorder, hide or rewrite any of them.",
    icon: "Layers",
    permission: "content.manage",
    section: "Site",
    orderColumn: "sort_order",
    orderScope: "page_id",
    groupBy: "page_id",
    searchColumn: "heading",
    defaultSort: [{ column: "page_id" }, { column: "sort_order" }],
    listColumns: [
      { name: "section_key", label: "Block", type: "badge" },
      { name: "heading", label: "Heading" },
      // No `page_id`: the group heading already names the page, and repeating
      // it on all fourteen of the home page's rows is noise.
      //
      // No `sort_order` either. In a grouped list you drag rows into place, so
      // the position on screen *is* the order and the number restates it — and
      // restates it wrongly for a moment, because the row moves instantly while
      // the server-rendered number only catches up on the next navigation.
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      {
        name: "page_id",
        label: "Page",
        type: "relation",
        required: true,
        span: 1,
        relation: { table: "pages", labelColumn: "title" },
      },
      {
        name: "section_key",
        label: "Block type",
        type: "select",
        required: true,
        span: 1,
        hint: "Selects which component renders this block.",
        options: [
          "hero",
          "page-header",
          "logo-wall",
          "stat-band",
          "steps",
          "feature-grid",
          "split-feature",
          "feature-categories",
          "protocols",
          "use-cases",
          "testimonials",
          "blog-teaser",
          "faq",
          "cta",
          "pricing-cards",
          "pricing-table",
          "license-builder",
          "edition-compare",
          "download-grid",
          "releases",
          "requirements",
          "contact-form",
          "prose",
          "video",
          "video-gallery",
          "integrator-form",
        ].map((value) => ({ value, label: value })),
      },
      {
        name: "variant",
        label: "Variant",
        type: "text",
        span: 1,
        hint:
          "e.g. centered, marquee, reverse, gradient, compact, detailed. · " +
          "`video` (one pasted link): blank = centred under the heading, `right`/`left` = beside the text, `wide` = full container. · " +
          "`video-gallery` (from the Videos list): blank = grid with filter chips, `wide` = ONE video the full width of the page, `bleed` = the same but out to the screen edge, `spotlight` = big player with the playlist beside it, `carousel` = a scrolling rail. · " +
          "`muted` tints the band and combines with any of them, e.g. “full muted”.",
      },
      { name: "eyebrow", label: "Eyebrow", type: "text", span: 1 },
      { name: "heading", label: "Heading", type: "text" },
      { name: "subheading", label: "Sub-heading", type: "textarea", rows: 3 },
      { name: "body", label: "Body", type: "markdown", rows: 6 },

      {
        name: "media_url",
        label: "Image URL",
        type: "image",
        group: "Media",
        hint: "On a video block this is the poster — the still shown before playback.",
      },
      { name: "media_alt", label: "Image alt text", type: "text", group: "Media" },
      {
        name: "video_url",
        label: "Video",
        type: "video",
        group: "Media",
        hint: "For the `video` block. Paste a YouTube or Vimeo link, or upload a file — either works.",
      },

      { name: "primary_cta_label", label: "Primary button label", type: "text", group: "Links", span: 1 },
      { name: "primary_cta_href", label: "Primary button link", type: "text", group: "Links", span: 1 },
      { name: "secondary_cta_label", label: "Secondary button label", type: "text", group: "Links", span: 1 },
      { name: "secondary_cta_href", label: "Secondary button link", type: "text", group: "Links", span: 1 },

      {
        name: "items",
        label: "Inline items",
        type: "json",
        group: "Advanced",
        hint: '[{ "title": "Connect", "icon": "PlugZap", "description": "..." }]',
      },
      {
        name: "settings",
        label: "Block settings",
        type: "json",
        group: "Advanced",
        hint:
          '{ "limit": 6, "featuredOnly": true, "kind": "protocol", "anchor": "use-cases" } · ' +
          'video takes { "aspect": "16/9", "autoplay": false, "loop": false, "muted": false, "caption": "…" } · ' +
          'video gallery takes { "limit": 9, "featuredOnly": false, "excludeFeatured": true, "categorySlug": "product-tour", "showFilters": true, "columns": 3 } — ' +
          '`excludeFeatured` leaves the lead video out, for a page that already shows it full width higher up — ' +
          'and on the `wide`/`bleed` variants { "aspect": "21/9" } shortens the band, { "caption": "…" } adds a line under it · ' +
          'licence builder takes { "showPrices": false } to hide every figure — no edition step, no totals, ' +
          "just the module list and a quote request",
      },
      VISIBILITY,
      SORT_ORDER,
    ],
  },

  // ------------------------------------------------------------ Marketing
  {
    key: "feature_categories",
    label: "Feature categories",
    singular: "Feature category",
    description: "Buckets that group features on the platform page.",
    icon: "Boxes",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Name" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      { name: "description", label: "Description", type: "textarea", rows: 3 },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "features",
    label: "Features",
    singular: "Feature",
    description: "Platform capabilities, each with its own detail page.",
    icon: "Layers",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "title",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "title", label: "Feature" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "is_featured", label: "Featured", type: "boolean" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      {
        name: "category_id",
        label: "Category",
        type: "relation",
        span: 1,
        relation: { table: "feature_categories", labelColumn: "name" },
      },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      { name: "summary", label: "Summary", type: "textarea", rows: 3, hint: "Shown on cards and grids." },
      { name: "description", label: "Detail page body", type: "markdown", rows: 10 },
      { name: "bullets", label: "Key points", type: "list", hint: "Press Enter for the next one." },
      { name: "badge", label: "Badge", type: "text", span: 1 },
      ...IMAGE_FIELDS,
      { name: "cta_label", label: "Button label", type: "text", group: "Links", span: 1 },
      { name: "cta_href", label: "Button link", type: "text", group: "Links", span: 1 },
      ...SEO_FIELDS,
      { name: "is_featured", label: "Show on the home page", type: "boolean", group: "Display", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "use_cases",
    label: "Use cases",
    singular: "Use case",
    description: "Solution cards: OEE, energy, predictive maintenance and friends.",
    icon: "Factory",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "title",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "title", label: "Use case" },
      { name: "industry", label: "Industry", type: "badge" },
      { name: "metric_value", label: "Metric" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      { name: "summary", label: "Summary", type: "textarea", rows: 2 },
      { name: "description", label: "Longer description", type: "textarea", rows: 4 },
      { name: "outcomes", label: "Outcomes", type: "list", hint: "Press Enter for the next one." },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      { name: "industry", label: "Industry", type: "text", span: 1 },
      { name: "metric_value", label: "Headline metric", type: "text", span: 1, placeholder: "+11 pts" },
      { name: "metric_label", label: "Metric caption", type: "text", span: 1 },
      ...IMAGE_FIELDS,
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "video_categories",
    label: "Video categories",
    singular: "Video category",
    description: "The filter chips above a video gallery: product tour, deep dive, webinar.",
    icon: "Tag",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Name" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      { name: "description", label: "Description", type: "textarea", rows: 2 },
      {
        name: "accent",
        label: "Accent",
        type: "text",
        span: 1,
        hint: "Optional colour token, e.g. primary or success.",
      },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "videos",
    label: "Videos",
    singular: "Video",
    description:
      "Product tours, demos and webinars. Paste a YouTube, Vimeo, Wistia or Loom link, or upload a file — all four play the same way.",
    icon: "Video",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "title",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "title", label: "Video" },
      { name: "category_id", label: "Category", type: "badge" },
      { name: "duration_seconds", label: "Runtime", type: "duration" },
      { name: "is_featured", label: "Featured", type: "boolean" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      {
        name: "video_url",
        label: "Video",
        type: "video",
        required: true,
        hint: "A YouTube, Vimeo, Wistia or Loom link, or a file from the media library. Paste the link you were given — the site works out how to play it.",
      },
      {
        name: "summary",
        label: "Summary",
        type: "textarea",
        rows: 2,
        hint: "Two lines on the card, and the description a search engine shows under the video.",
      },
      { name: "description", label: "Longer description", type: "markdown", rows: 6 },
      {
        name: "category_id",
        label: "Category",
        type: "relation",
        span: 1,
        relation: { table: "video_categories", labelColumn: "name" },
      },
      {
        name: "duration_seconds",
        label: "Runtime",
        type: "duration",
        span: 1,
        placeholder: "4:12",
        hint: "Shown on the thumbnail. It is the first thing anyone wants to know about a demo.",
      },
      { name: "badge", label: "Badge", type: "text", span: 1, placeholder: "New" },
      {
        name: "transcript",
        label: "Transcript",
        type: "textarea",
        rows: 8,
        hint: "Optional. Sits behind a “Transcript” toggle under the player — the only text a search engine can read out of a video that lives on YouTube.",
      },
      {
        name: "poster_url",
        label: "Poster image",
        type: "image",
        group: "Media",
        hint: "Optional. Left blank, the still is taken from the video host — this only has to be filled in to override it.",
      },
      { name: "poster_alt", label: "Poster alt text", type: "text", group: "Media", span: 1 },
      {
        name: "published_at",
        label: "Published",
        type: "datetime",
        group: "Display",
        span: 1,
        hint: "A date in the future keeps the video off the site until then.",
      },
      {
        name: "is_featured",
        label: "Lead video in the gallery",
        type: "boolean",
        group: "Display",
        span: 1,
        hint: "Shown wide across the top of the grid. One is enough.",
      },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "stats",
    label: "Stats",
    singular: "Stat",
    description: "The counting numbers in stat bands.",
    icon: "ChartNoAxesCombined",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "label",
    orderScope: "group_key",
    defaultSort: [{ column: "group_key" }, { column: "sort_order" }],
    listColumns: [
      { name: "label", label: "Label" },
      { name: "group_key", label: "Group", type: "badge" },
      { name: "value", label: "Value" },
      { name: "display_value", label: "Display value" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "label", label: "Label", type: "text", required: true, span: 1 },
      {
        name: "group_key",
        label: "Group",
        type: "text",
        span: 1,
        hint: "Matches the block's `group` setting, e.g. home or pricing.",
      },
      {
        name: "value",
        label: "Numeric value",
        type: "number",
        span: 1,
        hint: "Animates from zero. Leave blank for non-numeric stats.",
      },
      {
        name: "display_value",
        label: "Display value",
        type: "text",
        span: 1,
        hint: "Used when there is no numeric value, e.g. “Unlimited”.",
      },
      { name: "prefix", label: "Prefix", type: "text", span: 1, placeholder: "<" },
      { name: "suffix", label: "Suffix", type: "text", span: 1, placeholder: "M+" },
      { name: "description", label: "Caption", type: "text" },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "logos",
    label: "Logos & protocols",
    singular: "Logo",
    description: "Customer wall, protocol badges, integrations and compliance marks.",
    icon: "Network",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "name",
    orderScope: "kind",
    defaultSort: [{ column: "kind" }, { column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Name" },
      { name: "kind", label: "Kind", type: "badge" },
      { name: "category", label: "Category" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        span: 1,
        options: [
          { value: "customer", label: "Customer" },
          { value: "protocol", label: "Protocol" },
          { value: "integration", label: "Integration" },
          { value: "partner", label: "Partner" },
          { value: "certification", label: "Certification" },
        ],
      },
      { name: "category", label: "Category", type: "text", span: 1 },
      { name: "href", label: "Link", type: "url", span: 1 },
      { name: "description", label: "Description", type: "text" },
      {
        name: "image_url",
        label: "Logo image",
        type: "image",
        group: "Media",
        hint: "Leave blank to render the name as a monospace wordmark.",
      },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "testimonials",
    label: "Testimonials",
    singular: "Testimonial",
    description: "Customer quotes, with an optional headline metric.",
    icon: "Users",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "author_name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "author_name", label: "Author" },
      { name: "company", label: "Company" },
      { name: "is_featured", label: "Featured", type: "boolean" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "quote", label: "Quote", type: "markdown", required: true, rows: 6, hint: "Bold, italic, links and lists show on the website; headings and images do not." },
      { name: "author_name", label: "Author", type: "text", required: true, span: 1 },
      { name: "author_title", label: "Job title", type: "text", span: 1 },
      { name: "company", label: "Company", type: "text", span: 1 },
      { name: "industry", label: "Industry", type: "text", span: 1 },
      { name: "metric_value", label: "Headline metric", type: "text", span: 1 },
      { name: "metric_label", label: "Metric caption", type: "text", span: 1 },
      { name: "rating", label: "Rating (1–5)", type: "number", span: 1 },
      { name: "avatar_url", label: "Avatar", type: "image", group: "Media" },
      { name: "logo_url", label: "Company logo", type: "image", group: "Media" },
      { name: "is_featured", label: "Featured", type: "boolean", group: "Display", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "faqs",
    label: "FAQs",
    singular: "FAQ",
    description: "Accordion entries. Also emitted as FAQPage structured data.",
    icon: "LifeBuoy",
    permission: "content.manage",
    section: "Marketing",
    orderColumn: "sort_order",
    searchColumn: "question",
    orderScope: "page_slug",
    defaultSort: [{ column: "page_slug" }, { column: "sort_order" }],
    listColumns: [
      { name: "question", label: "Question" },
      { name: "page_slug", label: "Page", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "question", label: "Question", type: "text", required: true },
      { name: "answer", label: "Answer", type: "textarea", required: true, rows: 5 },
      {
        name: "page_slug",
        label: "Page",
        type: "text",
        span: 1,
        hint: "Which page's FAQ block this belongs to, e.g. home, pricing, download.",
      },
      { name: "category", label: "Category", type: "text", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "media_assets",
    label: "Media library",
    singular: "Media asset",
    plural: "media assets",
    description:
      "Everything uploaded to storage, plus any external URL worth reusing. Anything here can be picked from any image or file field.",
    icon: "Images",
    permission: "content.manage",
    section: "Marketing",
    searchColumn: "title",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "url", label: "Preview", type: "image" },
      { name: "title", label: "Title" },
      { name: "file_name", label: "File" },
      { name: "kind", label: "Kind", type: "badge" },
      { name: "size_bytes", label: "Size", type: "bytes" },
      { name: "created_at", label: "Added", type: "date" },
    ],
    fields: [
      { name: "url", label: "URL", type: "image", required: true },
      { name: "title", label: "Title", type: "text", span: 1 },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        span: 1,
        options: [
          { value: "image", label: "image" },
          { value: "file", label: "file" },
        ],
      },
      {
        name: "alt",
        label: "Alt text",
        type: "text",
        hint: "Describe what the image shows. Leave blank for non-images.",
      },
      { name: "tags", label: "Tags", type: "tags" },
      { name: "file_name", label: "File name", type: "text", group: "Advanced", span: 1 },
      { name: "mime_type", label: "MIME type", type: "text", group: "Advanced", span: 1 },
      { name: "width", label: "Width", type: "number", group: "Advanced", span: 1 },
      { name: "height", label: "Height", type: "number", group: "Advanced", span: 1 },
      {
        name: "storage_path",
        label: "Storage path",
        type: "text",
        group: "Advanced",
        hint: "Set when we host the file. Clearing it here does not delete the object — use Delete for that.",
      },
    ],
  },

  // ------------------------------------------------------------- Commerce
  {
    key: "releases",
    label: "Releases",
    singular: "Release",
    description: "Versions shown on the download page, with their notes.",
    icon: "Download",
    permission: "downloads.manage",
    section: "Commerce",
    searchColumn: "version",
    defaultSort: [{ column: "released_at", ascending: false }],
    listColumns: [
      { name: "version", label: "Version", type: "badge" },
      { name: "channel", label: "Channel", type: "badge" },
      { name: "title", label: "Title" },
      { name: "released_at", label: "Released", type: "date" },
      { name: "is_latest", label: "Latest", type: "boolean" },
    ],
    fields: [
      { name: "version", label: "Version", type: "text", required: true, span: 1, placeholder: "3.2.0" },
      {
        name: "channel",
        label: "Channel",
        type: "select",
        span: 1,
        options: [
          { value: "stable", label: "Stable" },
          { value: "beta", label: "Beta" },
          { value: "lts", label: "LTS" },
        ],
      },
      { name: "title", label: "Title", type: "text" },
      { name: "summary", label: "Summary", type: "textarea", rows: 3 },
      { name: "highlights", label: "Highlights", type: "release-notes", hint: "Grouped on the website as What's new, Improvements and Bug fixes." },
      { name: "notes", label: "Release notes", type: "markdown", rows: 12 },
      { name: "released_at", label: "Release date", type: "date", group: "Display", span: 1 },
      {
        name: "is_latest",
        label: "Latest in its channel",
        type: "boolean",
        group: "Display",
        span: 1,
        hint: "Only one release per channel can hold this.",
      },
      { name: "docs_url", label: "Docs URL", type: "url", group: "Links", span: 1 },
      { name: "changelog_url", label: "Changelog URL", type: "url", group: "Links", span: 1 },
      VISIBILITY,
    ],
  },
  {
    key: "release_artifacts",
    label: "Download files",
    singular: "Download file",
    description: "Per-platform installers, checksums and install commands.",
    icon: "HardDrive",
    permission: "downloads.manage",
    section: "Commerce",
    orderColumn: "sort_order",
    searchColumn: "label",
    orderScope: "release_id",
    defaultSort: [{ column: "release_id" }, { column: "sort_order" }],
    listColumns: [
      { name: "label", label: "File" },
      { name: "platform", label: "Platform", type: "badge" },
      { name: "arch", label: "Arch", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      {
        name: "release_id",
        label: "Release",
        type: "relation",
        required: true,
        span: 1,
        relation: { table: "releases", labelColumn: "version" },
      },
      { name: "label", label: "Label", type: "text", required: true, span: 1 },
      { name: "platform", label: "Platform", type: "text", span: 1, placeholder: "windows" },
      { name: "arch", label: "Architecture", type: "text", span: 1, placeholder: "x86_64" },
      { name: "file_name", label: "File name", type: "text", span: 1 },
      { name: "format", label: "Format", type: "text", span: 1 },
      {
        name: "file_url",
        label: "Download URL",
        type: "file",
        hint: "Upload the build, or point at wherever it is already hosted.",
      },
      { name: "file_size_bytes", label: "Size in bytes", type: "number", span: 1 },
      { name: "checksum_sha256", label: "SHA-256 checksum", type: "text" },
      { name: "install_command", label: "Install command", type: "text" },
      { name: "notes", label: "Notes", type: "text" },
      { name: "icon", label: "Icon", type: "icon", group: "Display", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "system_requirements",
    label: "System requirements",
    singular: "Requirement",
    description: "The minimum/recommended table on the download page.",
    icon: "Cpu",
    permission: "downloads.manage",
    section: "Commerce",
    orderColumn: "sort_order",
    searchColumn: "name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Component" },
      { name: "category", label: "Category", type: "badge" },
      { name: "minimum", label: "Minimum" },
      { name: "recommended", label: "Recommended" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Component", type: "text", required: true, span: 1 },
      { name: "category", label: "Category", type: "text", span: 1, placeholder: "Server" },
      { name: "minimum", label: "Minimum", type: "text", span: 1 },
      { name: "recommended", label: "Recommended", type: "text", span: 1 },
      { name: "note", label: "Note", type: "text" },
      VISIBILITY,
      SORT_ORDER,
    ],
  },

  // ----------------------------------------------------------------- Blog
  {
    key: "blog_posts",
    label: "Posts",
    singular: "Post",
    description: "Articles. Only published posts with a past date are public.",
    icon: "Newspaper",
    permission: "blog.manage",
    section: "Blog",
    searchColumn: "title",
    defaultSort: [{ column: "published_at", ascending: false }],
    listColumns: [
      { name: "title", label: "Title" },
      { name: "status", label: "Status", type: "badge" },
      { name: "published_at", label: "Published", type: "date" },
      { name: "view_count", label: "Views", type: "number" },
      { name: "is_featured", label: "Featured", type: "boolean" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      {
        name: "category_id",
        label: "Category",
        type: "relation",
        span: 1,
        relation: { table: "blog_categories", labelColumn: "name" },
      },
      { name: "excerpt", label: "Excerpt", type: "textarea", rows: 3, hint: "Shown on cards and in search results." },
      { name: "content", label: "Body", type: "markdown", rows: 24, required: true },

      { name: "cover_image_url", label: "Cover image", type: "image", group: "Media" },
      { name: "cover_image_alt", label: "Cover alt text", type: "text", group: "Media" },

      { name: "author_name", label: "Byline name", type: "text", group: "Author", span: 1 },
      { name: "author_title", label: "Byline title", type: "text", group: "Author", span: 1 },
      { name: "author_avatar_url", label: "Byline avatar", type: "image", group: "Author" },
      {
        name: "author_id",
        label: "Linked account",
        type: "relation",
        group: "Author",
        span: 1,
        relation: { table: "profiles", labelColumn: "full_name" },
        hint: "Optional. The byline fields above take precedence.",
      },

      ...SEO_FIELDS,
      { name: "og_image_url", label: "Social image", type: "image", group: "SEO" },
      { name: "canonical_url", label: "Canonical URL override", type: "url", group: "SEO" },
      { name: "noindex", label: "Hide from search engines", type: "boolean", group: "SEO", span: 1 },

      {
        name: "status",
        label: "Status",
        type: "select",
        group: "Display",
        span: 1,
        options: [
          { value: "draft", label: "Draft" },
          { value: "scheduled", label: "Scheduled" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ],
      },
      {
        name: "published_at",
        label: "Publish date",
        type: "datetime",
        group: "Display",
        span: 1,
        hint: "Required once the status is Published.",
      },
      { name: "is_featured", label: "Feature on the blog index", type: "boolean", group: "Display", span: 1 },
    ],
  },
  {
    key: "blog_categories",
    label: "Categories",
    singular: "Category",
    description: "Blog categories, each with its own indexable route.",
    icon: "FolderTree",
    permission: "blog.manage",
    section: "Blog",
    orderColumn: "sort_order",
    searchColumn: "name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Category" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      { name: "description", label: "Description", type: "textarea", rows: 3 },
      { name: "accent", label: "Accent colour", type: "text", span: 1 },
      ...SEO_FIELDS,
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "blog_tags",
    label: "Tags",
    singular: "Tag",
    description: "Free-form tags attached to posts.",
    icon: "Tag",
    permission: "blog.manage",
    section: "Blog",
    searchColumn: "name",
    defaultSort: [{ column: "name" }],
    listColumns: [
      { name: "name", label: "Tag" },
      { name: "slug", label: "Slug", type: "badge" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
    ],
  },


  // ------------------------------------------------------ Commerce (invoices)
  {
    key: "invoice_settings",
    navHidden: true,
    label: "Sales settings",
    singular: "Sales settings",
    description:
      "Defaults for invoices and quotations. Tax and decimal places apply to both. Our company name, address, email and phone come from Site settings (Legal entity name, Address, Sales email, Phone), the same details the website shows.",
    // General holds what both documents print or compute the same way, so it
    // is set once; each document's own tab holds only what is its own.
    tabs: [
      { label: "General", groups: ["Tax", "Documents"] },
      { label: "Invoices", groups: ["Numbering & terms", "How to pay"] },
      { label: "Quotations", groups: ["Numbering & validity", "Wording"] },
    ],
    icon: "Receipt",
    permission: "licenses.manage",
    section: "Commerce",
    singleton: true,
    listColumns: [],
    fields: [
      { name: "tax_label", label: "Tax name", type: "text", required: true, group: "Tax", span: 1, hint: "As printed, e.g. PPN or VAT." },
      { name: "tax_rate", label: "Tax rate (%)", type: "number", required: true, group: "Tax", span: 1, hint: "Applied to the subtotal of every new invoice and quotation, e.g. 11. Can be changed on each one." },
      { name: "tax_id", label: "Our tax ID (NPWP / VAT number)", type: "text", group: "Tax", span: 1, hint: "Printed with our address on invoices and quotations." },
      { name: "decimal_places", label: "Decimal places", type: "number", required: true, group: "Tax", span: 1, hint: "0 to 4, for new invoices and quotations, e.g. 0 for whole rupiah, 2 for cents. Can be changed on each one." },
      { name: "number_prefix", label: "Invoice number prefix", type: "text", required: true, group: "Numbering & terms", span: 1, hint: "Numbers look like INV-2026-0001." },
      { name: "payment_terms_days", label: "Payment due after (days)", type: "number", required: true, group: "Numbering & terms", span: 1, hint: "Sets the due date of a new invoice. Can be changed on each one." },
      {
        name: "bank_details",
        label: "How to pay",
        type: "markdown",
        rows: 6,
        group: "How to pay",
        hint: "Printed on unpaid invoices: bank, account name, account number, SWIFT. Several banks? Separate them with a horizontal line (—) or start each with a heading, and they print side by side as equal cards.",
      },
      { name: "footer_note", label: "Footer note", type: "text", group: "Documents", hint: "One line at the bottom of every invoice and quotation page, e.g. Thank you for your business." },
      { name: "quote_number_prefix", label: "Quotation number prefix", type: "text", required: true, group: "Numbering & validity", span: 1, hint: "Numbers look like QUO-2026-0001." },
      { name: "quote_validity_days", label: "Quotations valid for (days)", type: "number", required: true, group: "Numbering & validity", span: 1, hint: "Sets the Valid until date of a new quotation. Can be changed per quotation." },
      {
        name: "quote_closing",
        label: "Default closing paragraph",
        type: "textarea",
        rows: 4,
        group: "Wording",
        hint: "Printed above the signature. {company}, {name}, {email} and {phone} are filled in with our company name and the salesperson's details. Editable on each quotation; leave empty for none.",
      },
      { name: "quote_signoff", label: "Default sign-off", type: "text", required: true, group: "Wording", span: 1, hint: "e.g. Best regards, · Kind regards, · Sincerely," },
      {
        name: "quote_terms",
        label: "Default terms & conditions",
        type: "markdown",
        rows: 8,
        group: "Wording",
        hint: "Printed on every new quotation, and editable on each one.",
      },
    ],
  },

  // ------------------------------------------------- Commerce (perpetual)
  {
    key: "license_module_categories",
    label: "Module groups",
    singular: "Module group",
    description: "How modules are grouped in the licence builder.",
    icon: "Layers",
    permission: "pricing.manage",
    section: "Commerce",
    orderColumn: "sort_order",
    searchColumn: "name",
    defaultSort: [{ column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Group" },
      { name: "slug", label: "Slug", type: "badge" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      { name: "description", label: "Description", type: "text" },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      VISIBILITY,
      SORT_ORDER,
    ],
  },
  {
    key: "license_modules",
    label: "Licence modules",
    singular: "Module",
    description:
      "Every module and its price, and the editions built from them. An edition is a set of modules plus a platform base price: choosing it ticks its modules everywhere — the pricing page, quotations and invoices.",
    icon: "Boxes",
    permission: "pricing.manage",
    section: "Commerce",
    orderColumn: "sort_order",
    searchColumn: "name",
    orderScope: "category_id",
    defaultSort: [{ column: "category_id" }, { column: "sort_order" }],
    listColumns: [
      { name: "name", label: "Module" },
      { name: "price", label: "Price", type: "number" },
      { name: "is_default", label: "Preselected", type: "boolean" },
      { name: "is_visible", label: "Visible", type: "boolean" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, span: 1 },
      { name: "slug", label: "Slug", type: "slug", required: true, span: 1 },
      {
        name: "category_id",
        label: "Group",
        type: "relation",
        span: 1,
        relation: { table: "license_module_categories", labelColumn: "name" },
      },
      { name: "icon", label: "Icon", type: "icon", span: 1 },
      { name: "description", label: "Description", type: "textarea", rows: 2 },
      { name: "note", label: "Small print", type: "text" },
      { name: "price", label: "Price", type: "number", group: "Price", span: 1 },
      { name: "currency", label: "Currency", type: "text", group: "Price", span: 1 },
      {
        name: "percent_of_licence",
        label: "Or a % of the licence",
        type: "number",
        group: "Price",
        span: 1,
        hint: "Set this instead of a fixed price to charge a share of the licence total — how maintenance is priced. Leave blank for a flat fee.",
      },
      {
        name: "is_recurring",
        label: "Billed every year",
        type: "boolean",
        group: "Price",
        hint: "Kept out of the one-off total and offered on every edition, fixed or buildable.",
      },
      {
        name: "is_default",
        label: "Preselected in the builder",
        type: "boolean",
        group: "Price",
        span: 1,
        hint: "Ticked to start with, whatever the edition, and can be unticked — e.g. maintenance & support. Which modules an edition contains is set on the edition.",
      },
      {
        name: "requires",
        label: "Requires modules",
        type: "tags",
        group: "Advanced",
        hint: "Module slugs, one per line. Ticked automatically and locked while this is selected.",
      },
      VISIBILITY,
      SORT_ORDER,
    ],
  },

  // ----------------------------------------------------------- Community
  {
    key: "integrators",
    label: "Integrators",
    singular: "Integrator",
    description:
      "Partner directory. Applications come from signed-in accounts, arrive as pending, and stay invisible until approved.",
    icon: "Users",
    permission: "content.manage",
    section: "Community",
    searchColumn: "company_name",
    noCreate: true,
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "logo_url", label: "Logo", type: "image" },
      { name: "company_name", label: "Company" },
      { name: "country", label: "Country" },
      { name: "tier", label: "Tier", type: "badge" },
      { name: "status", label: "Status", type: "badge" },
      { name: "created_at", label: "Applied", type: "date" },
    ],
    fields: [
      { name: "company_name", label: "Company name", type: "text", required: true, span: 1 },
      {
        name: "slug",
        label: "Slug",
        type: "slug",
        span: 1,
        hint: "Required before the listing can be approved.",
      },
      { name: "summary", label: "One-line summary", type: "textarea", rows: 2 },
      { name: "description", label: "Profile", type: "markdown", rows: 10 },
      { name: "logo_url", label: "Logo", type: "image", group: "Media" },

      { name: "services", label: "Services", type: "tags", group: "Capabilities" },
      { name: "industries", label: "Industries", type: "tags", group: "Capabilities" },
      { name: "protocols", label: "Protocols", type: "tags", group: "Capabilities" },
      { name: "languages", label: "Languages", type: "tags", group: "Capabilities" },
      { name: "certifications", label: "Certifications", type: "tags", group: "Capabilities" },

      { name: "contact_name", label: "Contact name", type: "text", group: "Contact", span: 1 },
      { name: "contact_email", label: "Contact email", type: "text", group: "Contact", span: 1 },
      { name: "contact_phone", label: "Phone", type: "text", group: "Contact", span: 1 },
      { name: "website", label: "Website", type: "url", group: "Contact", span: 1 },

      {
        name: "latitude",
        label: "Location on the map",
        type: "geo",
        group: "Location",
        hint: "The pin is what puts this company on the directory map. Dropping one fills the address fields below.",
        geo: {
          longitudeField: "longitude",
          fill: {
            addressLine: "address_line",
            city: "city",
            region: "region",
            country: "country",
            postalCode: "postal_code",
          },
        },
      },
      // Written by the map above; declared so it is saved and stays writable.
      { name: "longitude", label: "Longitude", type: "number", group: "Location", hidden: true },

      { name: "address_line", label: "Address", type: "text", group: "Location" },
      { name: "city", label: "City", type: "text", group: "Location", span: 1 },
      { name: "region", label: "State / province", type: "text", group: "Location", span: 1 },
      { name: "country", label: "Country", type: "text", group: "Location", span: 1 },
      { name: "postal_code", label: "Postcode", type: "text", group: "Location", span: 1 },

      { name: "team_size", label: "Team size", type: "text", group: "Profile", span: 1 },
      { name: "founded_year", label: "Founded", type: "number", group: "Profile", span: 1 },
      { name: "project_count", label: "Projects delivered", type: "number", group: "Profile", span: 1 },

      {
        name: "status",
        label: "Status",
        type: "select",
        group: "Review",
        span: 1,
        options: ["pending", "approved", "rejected", "suspended"].map((value) => ({ value, label: value })),
      },
      {
        name: "tier",
        label: "Tier",
        type: "select",
        group: "Review",
        span: 1,
        options: ["registered", "certified", "premier"].map((value) => ({ value, label: value })),
      },
      { name: "is_featured", label: "Feature in the directory", type: "boolean", group: "Review", span: 1 },
      {
        name: "owner_id",
        label: "Applied by",
        type: "relation",
        group: "Review",
        span: 1,
        relation: { table: "profiles", labelColumn: "email" },
        hint: "The account that submitted it. They can correct their own details but not approve themselves.",
      },
      { name: "internal_notes", label: "Internal notes", type: "textarea", group: "Review", rows: 3 },
      ...SEO_FIELDS,
    ],
  },
  {
    key: "bug_reports",
    label: "Bug reports",
    singular: "Bug report",
    description:
      "Reports filed by customers at /support. Open one to triage it and reply — the reporter sees your replies against their reference.",
    icon: "Siren",
    permission: "leads.manage",
    section: "Community",
    searchColumn: "title",
    noCreate: true,
    defaultSort: [{ column: "last_activity_at", ascending: false }],
    listColumns: [
      { name: "reference", label: "Ref", type: "badge" },
      { name: "title", label: "Title" },
      { name: "severity", label: "Severity", type: "badge" },
      { name: "status", label: "Status", type: "badge" },
      { name: "created_at", label: "Filed", type: "date" },
      { name: "last_activity_at", label: "Last activity", type: "date" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "description", label: "What happened", type: "markdown", rows: 6 },
      { name: "steps_to_reproduce", label: "Steps to reproduce", type: "markdown", rows: 4 },
      { name: "expected_result", label: "Expected", type: "textarea", rows: 2, span: 1 },
      { name: "actual_result", label: "Actual", type: "textarea", rows: 2, span: 1 },

      {
        name: "severity",
        label: "Severity",
        type: "select",
        group: "Triage",
        span: 1,
        options: ["low", "medium", "high", "critical"].map((value) => ({ value, label: value })),
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        group: "Triage",
        span: 1,
        options: [
          "new",
          "triaged",
          "confirmed",
          "in_progress",
          "fixed",
          "wont_fix",
          "duplicate",
          "cannot_reproduce",
        ].map((value) => ({ value, label: value.replace(/_/g, " ") })),
      },
      { name: "area", label: "Area", type: "text", group: "Triage", span: 1 },
      {
        name: "assigned_to",
        label: "Assigned to",
        type: "relation",
        group: "Triage",
        span: 1,
        relation: { table: "profiles", labelColumn: "full_name" },
      },
      { name: "internal_notes", label: "Internal notes", type: "textarea", group: "Triage", rows: 3 },
      { name: "resolved_at", label: "Resolved at", type: "datetime", group: "Triage", span: 1 },

      { name: "product_version", label: "QUBIQ version", type: "text", group: "Environment", span: 1 },
      { name: "environment", label: "Environment", type: "text", group: "Environment", span: 1 },
      { name: "browser", label: "Browser", type: "text", group: "Environment" },
      { name: "page_path", label: "Reported from", type: "text", group: "Environment", span: 1 },

      { name: "reporter_name", label: "Reporter", type: "text", group: "Reporter", span: 1 },
      { name: "reporter_email", label: "Reporter email", type: "text", group: "Reporter", span: 1 },
      { name: "allow_contact", label: "May be contacted", type: "boolean", group: "Reporter", span: 1 },
    ],
  },

  // ---------------------------------------------------------------- Inbox
  {
    key: "quote_requests",
    label: "Quote requests",
    navHidden: true,
    singular: "Quote request",
    description:
      "Configurations built on the pricing page, with the contact details and the exact modules asked for.",
    icon: "FileText",
    permission: "leads.manage",
    section: "Inbox",
    bulkDelete: true,
    searchColumn: "contact_email",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "reference", label: "Ref", type: "badge" },
      { name: "company", label: "Company" },
      { name: "contact_email", label: "Email" },
      { name: "edition_name", label: "Edition", type: "badge" },
      { name: "module_count", label: "Modules", type: "number" },
      { name: "licence_total", label: "Licence", type: "number" },
      { name: "status", label: "Status", type: "badge" },
      { name: "created_at", label: "Received", type: "date" },
    ],
    fields: [
      { name: "contact_name", label: "Name", type: "text", span: 1 },
      { name: "contact_email", label: "Email", type: "text", span: 1 },
      { name: "company", label: "Company", type: "text", span: 1 },
      { name: "job_title", label: "Role", type: "text", span: 1 },
      { name: "phone", label: "Phone", type: "text", span: 1 },
      { name: "country", label: "Country", type: "text", span: 1, hint: "Determines tax treatment." },
      { name: "message", label: "Message", type: "textarea", rows: 5 },

      {
        name: "edition_name",
        label: "Edition",
        type: "text",
        group: "Configuration",
        span: 1,
      },
      {
        name: "is_custom",
        label: "Custom licence",
        type: "boolean",
        group: "Configuration",
        hint: "Priced against the deployment rather than from the list.",
      },
      {
        name: "modules",
        label: "Modules requested",
        type: "json",
        group: "Configuration",
        rows: 8,
        hint: "Exactly what was ticked when the request was sent.",
      },
      {
        name: "licence_total",
        label: "One-off licence",
        type: "number",
        group: "Configuration",
        span: 1,
        hint: "List price at the time of the request, excluding tax.",
      },
      {
        name: "maintenance_total",
        label: "Maintenance per year",
        type: "number",
        group: "Configuration",
        span: 1,
      },
      { name: "currency", label: "Currency", type: "text", group: "Configuration", span: 1 },
      { name: "page_path", label: "Requested from", type: "text", group: "Configuration", span: 1 },

      {
        name: "status",
        label: "Status",
        type: "select",
        group: "Pipeline",
        span: 1,
        options: ["new", "contacted", "quoted", "won", "lost", "spam"].map((value) => ({
          value,
          label: value,
        })),
      },
      { name: "internal_notes", label: "Internal notes", type: "textarea", group: "Pipeline", rows: 4 },
    ],
  },
  {
    key: "leads",
    label: "Leads",
    singular: "Lead",
    description: "Demo and contact requests submitted from the website.",
    icon: "Mail",
    permission: "leads.manage",
    section: "Inbox",
    bulkDelete: true,
    searchColumn: "email",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "name", label: "Name" },
      { name: "email", label: "Email" },
      { name: "company", label: "Company" },
      { name: "type", label: "Type", type: "badge" },
      { name: "status", label: "Status", type: "badge" },
      { name: "created_at", label: "Received", type: "date" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", span: 1 },
      { name: "email", label: "Email", type: "text", span: 1 },
      { name: "company", label: "Company", type: "text", span: 1 },
      { name: "job_title", label: "Job title", type: "text", span: 1 },
      { name: "phone", label: "Phone", type: "text", span: 1 },
      { name: "country", label: "Country", type: "text", span: 1 },
      { name: "industry", label: "Industry", type: "text", span: 1 },
      { name: "company_size", label: "Company size", type: "text", span: 1 },
      { name: "message", label: "Message", type: "textarea", rows: 6 },
      {
        name: "status",
        label: "Status",
        type: "select",
        group: "Pipeline",
        span: 1,
        options: ["new", "contacted", "qualified", "won", "lost", "spam"].map((value) => ({
          value,
          label: value,
        })),
      },
      {
        name: "type",
        label: "Type",
        type: "select",
        group: "Pipeline",
        span: 1,
        options: ["contact", "demo", "trial", "sales", "support", "partner"].map((value) => ({
          value,
          label: value,
        })),
      },
      { name: "internal_notes", label: "Internal notes", type: "textarea", group: "Pipeline", rows: 4 },
      { name: "source", label: "Source", type: "text", group: "Attribution", span: 1 },
      { name: "page_path", label: "Submitted from", type: "text", group: "Attribution", span: 1 },
      { name: "plan_slug", label: "Plan of interest", type: "text", group: "Attribution", span: 1 },
    ],
  },
  {
    key: "newsletter_issues",
    label: "Newsletters",
    singular: "Newsletter",
    description:
      "Write a newsletter, send yourself a test, then send it to every active subscriber. Each email carries the subscriber's own one-click unsubscribe link.",
    icon: "Newspaper",
    permission: "leads.manage",
    section: "Inbox",
    searchColumn: "title",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "title", label: "Subject" },
      { name: "status", label: "Status", type: "badge" },
      { name: "sent_count", label: "Sent", type: "number" },
      { name: "created_at", label: "Created", type: "date" },
    ],
    fields: [
      { name: "title", label: "Subject", type: "text", required: true, hint: "The email subject, and the heading inside it." },
      {
        name: "preheader",
        label: "Preview line",
        type: "text",
        hint: "The grey line inboxes show after the subject. One sentence that makes people open it.",
      },
      { name: "body", label: "Body", type: "markdown", rows: 18, required: true },
    ],
  },
  {
    key: "newsletter_subscribers",
    label: "Subscribers",
    singular: "Subscriber",
    description: "Release-note email list.",
    icon: "Mail",
    permission: "leads.manage",
    section: "Inbox",
    searchColumn: "email",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "email", label: "Email" },
      { name: "source", label: "Source", type: "badge" },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "created_at", label: "Subscribed", type: "date" },
    ],
    fields: [
      { name: "email", label: "Email", type: "text", required: true, span: 1 },
      { name: "source", label: "Source", type: "text", span: 1 },
      { name: "is_active", label: "Active", type: "boolean", span: 1 },
    ],
  },
  {
    key: "notification_log",
    label: "Notifications",
    singular: "Notification",
    description:
      "Every staff email the notification pipeline tried to send. Check here first when an enquiry arrived but nobody was told.",
    icon: "BellRing",
    permission: "leads.manage",
    section: "Inbox",
    // Written by the notify-staff Edge Function, never by a person — but it
    // can be cleared out, several entries at a time.
    readOnly: true,
    bulkDelete: true,
    searchColumn: "recipient",
    defaultSort: [{ column: "created_at", ascending: false }],
    listColumns: [
      { name: "status", label: "Status", type: "badge" },
      { name: "source_table", label: "Event", type: "badge" },
      { name: "subject", label: "Subject" },
      { name: "recipient", label: "Sent to" },
      { name: "created_at", label: "When", type: "date" },
    ],
    fields: [
      { name: "status", label: "Status", type: "text", span: 1 },
      { name: "source_table", label: "Event", type: "text", span: 1 },
      { name: "recipient", label: "Sent to", type: "text", span: 1 },
      { name: "channel", label: "Channel", type: "text", span: 1 },
      { name: "cc", label: "CC", type: "tags", span: 2, hint: "Also sent to, for quotation and invoice emails." },
      { name: "subject", label: "Subject", type: "text", span: 2 },
      { name: "error", label: "Error", type: "textarea", span: 2 },
    ],
  },
];

export const RESOURCE_MAP = new Map(RESOURCES.map((resource) => [resource.key as string, resource]));

export function getResource(key: string): Resource | undefined {
  return RESOURCE_MAP.get(key);
}

/** Resources the viewer is allowed to see, grouped for the sidebar. */
export function resourcesFor(permissions: AppPermission[]) {
  const allowed = RESOURCES.filter((resource) => permissions.includes(resource.permission) && !resource.navHidden);
  const sections = new Map<Resource["section"], Resource[]>();

  for (const resource of allowed) {
    const bucket = sections.get(resource.section);
    if (bucket) bucket.push(resource);
    else sections.set(resource.section, [resource]);
  }

  return [...sections].map(([section, items]) => ({ section, items }));
}

/** Column names the form is allowed to write. Everything else is server-owned. */
export function writableColumns(resource: Resource) {
  return new Set(resource.fields.map((field) => field.name));
}
