export const PRODUCT_CATEGORIES = [
  {
    slug: "quarter-zips-pullovers",
    label: "Quarter-Zips & Pullovers",
    shortLabel: "Quarter-Zips",
    subcategories: ["Quarter-Zip", "Half-Zip", "Crewneck Sweater", "Cardigan"],
  },
  {
    slug: "polos",
    label: "Polos",
    shortLabel: "Polos",
    subcategories: ["Performance Polo", "Pique Polo", "Knit Polo"],
  },
  {
    slug: "dress-shirts-ocbds",
    label: "OCBDs & Dress Shirts",
    shortLabel: "Dress Shirts",
    subcategories: [
      "Non-Iron Dress Shirt",
      "OCBD",
      "Performance Dress Shirt",
      "Twill Shirt",
      "Casual Button-Down",
    ],
  },
  {
    slug: "chinos-dress-pants",
    label: "Chinos & Dress Pants",
    shortLabel: "Chinos & Trousers",
    subcategories: ["Chino", "Wool Dress Pant", "Flannel Trouser"],
  },
  {
    slug: "performance-trousers",
    label: "Performance & Travel Trousers",
    shortLabel: "Commuter Pants",
    subcategories: ["Commuter Pant", "5-Pocket Tech Pant", "Travel Trouser"],
  },
  {
    slug: "blazers-sport-coats",
    label: "Blazers & Sport Coats",
    shortLabel: "Blazers",
    subcategories: ["Navy Blazer", "Hopsack Sport Coat", "Knit Blazer", "Unstructured Blazer"],
  },
  {
    slug: "suits",
    label: "Suits",
    shortLabel: "Suits",
    subcategories: ["Worsted Wool Suit", "Travel Suit", "Tuxedo"],
  },
  {
    slug: "ties-pocket-squares",
    label: "Ties & Pocket Squares",
    shortLabel: "Ties & Squares",
    subcategories: ["Silk Tie", "Grenadine Tie", "Pocket Square"],
  },
  {
    slug: "shoes-belts",
    label: "Loafers, Dress Shoes & Belts",
    shortLabel: "Shoes & Belts",
    subcategories: [
      "Penny Loafer",
      "Oxford Dress Shoe",
      "Derby / Monk Strap",
      "Dress Belt",
      "Dress Socks",
    ],
  },
  {
    slug: "outerwear",
    label: "Outerwear",
    shortLabel: "Outerwear",
    subcategories: [
      "Quilted Vest",
      "Fleece Vest",
      "Wool Overcoat",
      "Trench / Mac Coat",
      "Tailored Jacket",
    ],
  },
] as const;

export const OUT_OF_SCOPE_CATEGORY = "out_of_scope" as const;

export type CategorySlug = (typeof PRODUCT_CATEGORIES)[number]["slug"];
export type AllCategorySlug = CategorySlug | typeof OUT_OF_SCOPE_CATEGORY;

export const CATEGORY_BY_SLUG: Record<string, (typeof PRODUCT_CATEGORIES)[number]> =
  Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c.slug, c]));

export const OCCASIONS = [
  "Interview",
  "Superday",
  "Office daily",
  "Networking event",
  "Summer internship",
] as const;

export type OccasionTag = (typeof OCCASIONS)[number];
