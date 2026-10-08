/**
 * The tool registry — the single source of truth for every tool's name, copy and SEO.
 * The home grid, tool pages, header nav, sitemap and structured data all read from here,
 * so adding a tool is: one entry below + one work component (see components/tools/).
 */

export type ToolSlug = "edit-pdf" | "merge-pdf" | "organize-pdf" | "images-to-pdf" | "split-pdf";

export interface Faq {
  q: string;
  a: string;
}

export interface ToolDef {
  slug: ToolSlug;
  /** Route, with trailing slash (the site is a static export). */
  path: `/${string}/`;
  /** Full name, used in titles and headings. */
  name: string;
  /** One or two words, for the nav. */
  short: string;
  /** Casual one-liner for cards. */
  tagline: string;
  /** Hero: plain line, then the accented line. */
  headline: string;
  headlineAccent: string;
  lead: string;
  /** What the dropzone asks for. */
  dropTitle: string;
  dropHint: string;
  accept: "pdf" | "image";
  multiple: boolean;
  /** <title> text (the site name is appended by the layout's title template). */
  seoTitle: string;
  description: string;
  keywords: string[];
  chips: string[];
  steps: Array<{ title: string; text: string }>;
  faq: Faq[];
}

const PRIVACY_FAQ: Faq = {
  q: "Is my file uploaded anywhere?",
  a: "No. Everything happens inside your web browser on your own device, so your files are never sent to a server. There's no account and nothing to install.",
};

export const TOOLS: readonly ToolDef[] = [
  {
    slug: "edit-pdf",
    path: "/edit-pdf/",
    name: "Edit PDF text",
    short: "Edit text",
    tagline: "Change any word. Keep the look.",
    headline: "Edit the text in any PDF.",
    headlineAccent: "Keep the original look.",
    lead: "Click a line, type your change, download. Fonts, layout and selectable text all survive the surgery.",
    dropTitle: "Drop your PDF here",
    dropHint: "Digital PDFs up to 150 MB · scanned documents aren't supported",
    accept: "pdf",
    multiple: false,
    seoTitle: "Edit PDF text online — free, keeps the original fonts",
    description:
      "Edit the text in a PDF online for free. Click any line, change the words and download a real PDF that keeps the original fonts, layout and selectable text. No sign-up, no watermark.",
    keywords: ["edit PDF text", "online PDF editor", "change text in PDF", "edit PDF free", "PDF text replace", "edit PDF without Acrobat", "keep PDF fonts"],
    chips: ["Original fonts kept", "Real, selectable text", "Free, no sign-up"],
    steps: [
      { title: "Open your PDF", text: "Drop a digital PDF on the page or pick one from your device. It opens instantly." },
      { title: "Click and type", text: "Click any line to select it, double-click to type over it. Move, resize or recolour with the toolbar." },
      { title: "Download", text: "Get a real PDF back — same fonts, same layout, every word still selectable and searchable." },
    ],
    faq: [
      {
        q: "Is this PDF editor free?",
        a: "Yes. It's completely free, with no sign-up, no watermark and no limit on how many files you edit.",
      },
      {
        q: "Will my edited PDF keep the original fonts and layout?",
        a: "Yes. Whenever the original font can draw your new text, the change is written in place with that exact font, size, colour and position. If a character is missing from an embedded font subset, a closely matching font is used and you're told which one.",
      },
      {
        q: "Is the text still selectable and searchable after editing?",
        a: "Yes. Changes are saved as real PDF text — not an image, and not a white box drawn over the old words — so you can select, copy and search them, and the old text is removed from the file.",
      },
      PRIVACY_FAQ,
      {
        q: "Can I edit scanned PDFs?",
        a: "Not yet. Scanned documents are pictures of text rather than real text, so they'd need OCR. The editor detects scanned PDFs and tells you when a file can't be edited.",
      },
      {
        q: "Does it work on my phone?",
        a: "Yes. Tap any text to select it, use the floating toolbar to edit, and download the finished PDF.",
      },
    ],
  },
  {
    slug: "merge-pdf",
    path: "/merge-pdf/",
    name: "Merge PDF",
    short: "Merge",
    tagline: "Glue PDFs together.",
    headline: "Merge PDFs into one.",
    headlineAccent: "Drag to reorder. Done.",
    lead: "Drop in a pile of PDFs, put them in the order you want, and get one clean file. No watermark, no limits.",
    dropTitle: "Drop your PDFs here",
    dropHint: "Add as many as you like · they stay in the order you choose",
    accept: "pdf",
    multiple: true,
    seoTitle: "Merge PDF files online — free, no sign-up",
    description:
      "Combine multiple PDF files into one document online for free. Drag to reorder, merge in seconds, no watermark, no sign-up — and your files never leave your browser.",
    keywords: ["merge PDF", "combine PDF", "join PDF files", "merge PDF online free", "PDF merger", "combine PDFs into one"],
    chips: ["Drag to reorder", "No watermark", "Any number of files"],
    steps: [
      { title: "Add your PDFs", text: "Drop several files at once, or add more any time. Each one shows its first page." },
      { title: "Put them in order", text: "Drag the cards around. Remove anything you don't need." },
      { title: "Merge and download", text: "One click and your combined PDF is ready." },
    ],
    faq: [
      { q: "How many PDFs can I merge?", a: "As many as your device's memory can handle — there's no fixed limit on the number of files, and no daily quota." },
      { q: "In what order are the files combined?", a: "In the order you see them on screen, from first to last. Drag the cards to change it before you merge." },
      {
        q: "Will the merged PDF look exactly like the originals?",
        a: "Yes. Pages, text, images and fonts are copied across as they are. Interactive extras such as bookmarks and fillable form fields aren't carried over.",
      },
      { q: "Can I merge password-protected PDFs?", a: "Not directly. Remove the password in the program you made the file with, then add it here." },
      PRIVACY_FAQ,
    ],
  },
  {
    slug: "organize-pdf",
    path: "/organize-pdf/",
    name: "Organize pages",
    short: "Organize",
    tagline: "Reorder, rotate, ditch pages.",
    headline: "Reorder, rotate and delete pages.",
    headlineAccent: "Fix your PDF in a few clicks.",
    lead: "See every page at a glance. Drag them into order, spin the sideways ones, bin the junk, then save.",
    dropTitle: "Drop your PDF here",
    dropHint: "Works with PDFs of any length",
    accept: "pdf",
    multiple: false,
    seoTitle: "Reorder, rotate & delete PDF pages online — free",
    description:
      "Rearrange, rotate, duplicate and delete pages in a PDF online for free. Drag thumbnails into order, remove pages you don't need and save a clean new PDF. No sign-up, no uploads.",
    keywords: ["reorder PDF pages", "delete PDF pages", "rotate PDF pages", "rearrange PDF", "remove pages from PDF", "organize PDF"],
    chips: ["Drag to reorder", "Rotate & duplicate", "Deleted means deleted"],
    steps: [
      { title: "Open a PDF", text: "Every page shows up as a thumbnail." },
      { title: "Shuffle it", text: "Drag pages into place, rotate them, duplicate or delete the ones you don't want. Undo is one click away." },
      { title: "Save", text: "Download the new PDF — only the pages you kept are in it." },
    ],
    faq: [
      {
        q: "Are deleted pages really gone from the file?",
        a: "Yes. The new PDF is built from only the pages you keep, so deleted pages — and anything only they used — aren't hiding inside the file.",
      },
      { q: "Can I undo a mistake?", a: "Yes. Undo and redo work for every change: moves, rotations, duplicates and deletions." },
      { q: "Can I save just some of the pages?", a: "Yes. Select the pages you want and choose “Save selected”, or simply delete the rest." },
      { q: "Does rotating change the page content?", a: "No. Rotation is stored in the page's settings, so text and images stay perfectly sharp." },
      PRIVACY_FAQ,
    ],
  },
  {
    slug: "images-to-pdf",
    path: "/images-to-pdf/",
    name: "Images to PDF",
    short: "Images → PDF",
    tagline: "Photos in. PDF out.",
    headline: "Turn images into a PDF.",
    headlineAccent: "One page per picture.",
    lead: "Drop in photos, scans or screenshots, put them in order, pick a page size. JPGs and PNGs go in untouched.",
    dropTitle: "Drop your images here",
    dropHint: "JPG, PNG, WebP, GIF, BMP and AVIF · as many as you like",
    accept: "image",
    multiple: true,
    seoTitle: "Convert images to PDF online — JPG, PNG & more, free",
    description:
      "Turn JPG, PNG, WebP and other images into a single PDF online for free. Reorder, rotate, choose A4, Letter or fit-to-image pages — with no quality loss, no sign-up and no uploads.",
    keywords: ["images to PDF", "JPG to PDF", "PNG to PDF", "photos to PDF", "combine images into PDF", "convert image to PDF"],
    chips: ["JPG & PNG kept as-is", "A4, Letter or fit", "Reorder & rotate"],
    steps: [
      { title: "Add images", text: "Pick as many photos, scans or screenshots as you like." },
      { title: "Arrange them", text: "Drag to reorder, rotate any that came in sideways, then choose page size and margins." },
      { title: "Create your PDF", text: "One page per image, ready to download or send." },
    ],
    faq: [
      { q: "Which image formats work?", a: "JPG and PNG always work and are embedded exactly as they are. WebP, GIF, BMP and AVIF work in any browser that can show them." },
      { q: "Will my photos lose quality?", a: "No. JPG and PNG files go into the PDF untouched. Only images that need rotating or converting are redrawn, at high quality." },
      { q: "Can I choose the page size?", a: "Yes: A4, US Letter, or “match image” where each page is the size of its picture. You can also set portrait or landscape and the margins." },
      { q: "Do phone photos come out the right way up?", a: "Yes. Photos that your phone stores rotated are detected and turned the right way automatically; you can also rotate any image by hand." },
      PRIVACY_FAQ,
    ],
  },
  {
    slug: "split-pdf",
    path: "/split-pdf/",
    name: "Split PDF",
    short: "Split",
    tagline: "Slice a PDF into pieces.",
    headline: "Split a PDF.",
    headlineAccent: "Slice it your way.",
    lead: "Chop a big PDF into smaller files — every few pages, by page ranges, or one file per page.",
    dropTitle: "Drop your PDF here",
    dropHint: "Get one PDF per piece, or a single .zip",
    accept: "pdf",
    multiple: false,
    seoTitle: "Split PDF online — by pages or ranges, free",
    description:
      "Split a PDF into separate files online for free. Split every N pages, by custom page ranges like 1-3, 5, 8-, or one page per file, and download a ZIP. No sign-up, no uploads.",
    keywords: ["split PDF", "extract pages from PDF", "PDF splitter", "split PDF by page range", "separate PDF pages", "cut PDF into parts"],
    chips: ["Every N pages", "Custom ranges", "Download as ZIP"],
    steps: [
      { title: "Open a PDF", text: "Drop the file you want to cut up." },
      { title: "Choose how to split", text: "Every few pages, custom ranges like 1-3, 5, 8-, or one page per file. See the pieces before you commit." },
      { title: "Download", text: "Grab each piece separately, or everything in one .zip." },
    ],
    faq: [
      { q: "How do page ranges work?", a: "Separate ranges with commas: “1-3, 5, 8-” gives pages 1 to 3, page 5, and page 8 to the end. Each range becomes its own file — or tick “one PDF” to combine them." },
      { q: "Can I get every page as its own file?", a: "Yes. Choose “Every page”, and you'll get one PDF per page, bundled in a .zip." },
      { q: "Can I just pull out a few pages?", a: "Yes. Type the pages you want as a custom range and put them in one PDF." },
      { q: "What if I want to reorder or delete pages instead?", a: "Use the Organize pages tool: drag thumbnails around, rotate or delete pages and save." },
      PRIVACY_FAQ,
    ],
  },
] as const;

const BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

export function getTool(slug: ToolSlug): ToolDef {
  const tool = BY_SLUG.get(slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

export function otherTools(slug: ToolSlug): ToolDef[] {
  return TOOLS.filter((t) => t.slug !== slug);
}

/** Site-wide FAQ for the home page. */
export const HOME_FAQ: Faq[] = [
  { q: "Is KillMyPDF free?", a: "Yes — every tool is free, with no sign-up, no watermarks and no limit on how many files you process." },
  PRIVACY_FAQ,
  {
    q: "Will my PDF look the same afterwards?",
    a: "Yes. The tools copy and rearrange the PDF's own pages, fonts and images instead of re-drawing them, and the text editor writes changes with the document's original fonts wherever it can.",
  },
  { q: "What can I do with it?", a: "Edit text in a PDF, merge several PDFs into one, reorder / rotate / delete pages, turn images into a PDF, and split a PDF into pieces. More tools are on the way." },
  { q: "Does it work on a phone?", a: "Yes. It's built for phones and tablets as well as desktops." },
];
