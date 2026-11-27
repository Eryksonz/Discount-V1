import type { CategorySlug, OccasionTag } from "@config/categories";

export interface CategoryRule {
  id: string;
  category: CategorySlug;
  subcategory: string;
  /** Evaluated against normalized `title + " " + breadcrumb` */
  pattern: RegExp;
  /** Optional negative guard to prevent cross-matches (e.g. "blazer" matching "polo") */
  exclude?: RegExp;
  /** Optional brand scope when a proprietary product name belongs to one brand */
  brandSlugs?: string[];
  priority: number;
}

/**
 * Declarative category & subcategory classification rules.
 * Evaluated in ascending `priority` order; first match wins and its `id` is stored
 * in `products.matched_rule_id` for full auditability and debugging.
 */
export const CATEGORY_RULES: readonly CategoryRule[] = [
  // Suits (check before blazers/trousers so full suits are not split)
  {
    id: "cat-suit-tuxedo",
    category: "suits",
    subcategory: "Tuxedo",
    pattern: /\b(tuxedo|dinner\s+suit|black[- ]tie\s+suit)\b/i,
    priority: 10,
  },
  {
    id: "cat-suit-travel",
    category: "suits",
    subcategory: "Travel Suit",
    pattern: /\b(travel\s+suit|jetsetter\s+suit|stretch\s+wool\s+suit|commuter\s+suit)\b/i,
    priority: 11,
  },
  {
    id: "cat-suit-worsted",
    category: "suits",
    subcategory: "Worsted Wool Suit",
    pattern: /\b(suit|napoli\s+navy|havana\s+suit|ludlow\s+.*\bsuit|sutton\s+.*\bsuit|1818\s+.*\bsuit)\b/i,
    exclude: /\b(suit\s+pant|suit\s+trouser|suit\s+jacket\s+only|suit\s+separate\s+pant|garment\s+bag|swim\s*suit|sweat\s*suit)\b/i,
    priority: 12,
  },

  // Blazers & Sport Coats
  {
    id: "cat-blazer-knit",
    category: "blazers-sport-coats",
    subcategory: "Knit Blazer",
    pattern: /\b(knit\s+blazer|inlet\s+knit\s+blazer|jersey\s+blazer|sweater\s+blazer)\b/i,
    priority: 20,
  },
  {
    id: "cat-blazer-hopsack",
    category: "blazers-sport-coats",
    subcategory: "Hopsack Sport Coat",
    pattern: /\b(hopsack\s+(blazer|sport\s*coat|jacket)|sport\s*coat|sportcoat)\b/i,
    priority: 21,
  },
  {
    id: "cat-blazer-navy",
    category: "blazers-sport-coats",
    subcategory: "Navy Blazer",
    pattern: /\b(blazer|suit\s+jacket|tailored\s+jacket)\b/i,
    exclude: /\b(overcoat|topcoat|trench|rain\s+jacket|puffer|vest)\b/i,
    priority: 22,
  },

  // Ties & Pocket Squares (check before shirts so "Silk Tie" doesn't collide)
  {
    id: "cat-tie-pocket-square",
    category: "ties-pocket-squares",
    subcategory: "Pocket Square",
    pattern: /\b(pocket\s+square)\b/i,
    priority: 30,
  },
  {
    id: "cat-tie-grenadine",
    category: "ties-pocket-squares",
    subcategory: "Grenadine Tie",
    pattern: /\b(grenadine\s+tie)\b/i,
    priority: 31,
  },
  {
    id: "cat-tie-silk",
    category: "ties-pocket-squares",
    subcategory: "Silk Tie",
    pattern: /\b(neck\s*tie|silk\s+(?:\w+\s+)?tie|twill\s+tie|jacquard\s+tie|knit\s+tie|rep\s+tie|repp\s+tie|woven\s+tie|striped\s+tie|bowtie|bow\s+tie)\b/i,
    priority: 32,
  },

  // Loafers, Dress Shoes & Belts
  {
    id: "cat-belt-dress",
    category: "shoes-belts",
    subcategory: "Dress Belt",
    pattern: /\b(dress\s+belt|leather\s+belt|calfskin\s+belt|suede\s+belt|braided\s+belt|needlepoint\s+belt)\b/i,
    priority: 40,
  },
  {
    id: "cat-shoe-loafer",
    category: "shoes-belts",
    subcategory: "Penny Loafer",
    pattern: /\b(loafer|penny\s+loafer|tassel\s+loafer|horsebit|bit\s+loafer|venetian\s+loafer|driving\s+shoe)\b/i,
    priority: 41,
  },
  {
    id: "cat-shoe-oxford",
    category: "shoes-belts",
    subcategory: "Oxford Dress Shoe",
    pattern: /\b(oxford|cap[- ]toe|wholecut|balmoral|brogue)\b/i,
    exclude: /\b(oxford\s+(cloth|shirt|button|weave)|ocbd|sport\s+shirt)\b/i,
    priority: 42,
  },
  {
    id: "cat-shoe-derby",
    category: "shoes-belts",
    subcategory: "Derby / Monk Strap",
    pattern: /\b(derby\s+shoe|monk\s+strap|double\s+monk|dress\s+shoe|chelsea\s+boot)\b/i,
    priority: 43,
  },

  // Outerwear (Vests, Overcoats, Trenches)
  {
    id: "cat-outerwear-vest-quilted",
    category: "outerwear",
    subcategory: "Quilted Vest",
    pattern: /\b(quilted\s+vest|insulated\s+vest|down\s+vest|hyperlight\s+vest|gilet)\b/i,
    priority: 50,
  },
  {
    id: "cat-outerwear-vest-fleece",
    category: "outerwear",
    subcategory: "Fleece Vest",
    pattern: /\b(fleece\s+vest|sweater\s+vest|performance\s+vest|merino\s+vest|\bvest\b)\b/i,
    exclude: /\b(suit\s+vest|waistcoat)\b/i,
    priority: 51,
  },
  {
    id: "cat-outerwear-overcoat",
    category: "outerwear",
    subcategory: "Wool Overcoat",
    pattern: /\b(overcoat|topcoat|chesterfield|car\s+coat|balmacaan|peacoat|wool\s+coat)\b/i,
    priority: 52,
  },
  {
    id: "cat-outerwear-trench",
    category: "outerwear",
    subcategory: "Trench / Mac Coat",
    pattern: /\b(trench\s+coat|mac\s+coat|rain\s+coat|mackintosh)\b/i,
    priority: 53,
  },

  // Quarter-Zips & Pullovers
  {
    id: "cat-qzip-quarter",
    category: "quarter-zips-pullovers",
    subcategory: "Quarter-Zip",
    pattern: /\b(quarter[- ]?zip|1\/4[- ]?zip|q[- ]?zip|perth\s+.*\b(zip|pullover)|shep\s+shirt|sully\s+.*\b(quarter|zip|pullover)|estate[- ]?rib)\b/i,
    priority: 60,
  },
  {
    id: "cat-qzip-half",
    category: "quarter-zips-pullovers",
    subcategory: "Half-Zip",
    pattern: /\b(half[- ]?zip|1\/2[- ]?zip|mock[- ]?neck\s+zip|zip\s+pullover)\b/i,
    priority: 61,
  },
  {
    id: "cat-qzip-crew",
    category: "quarter-zips-pullovers",
    subcategory: "Crewneck Sweater",
    pattern: /\b(merino\s+crewneck|cashmere\s+crewneck|crewneck\s+sweater|v[- ]?neck\s+sweater|pullover\s+sweater|fine[- ]gauge\s+sweater)\b/i,
    priority: 62,
  },
  {
    id: "cat-qzip-cardigan",
    category: "quarter-zips-pullovers",
    subcategory: "Cardigan",
    pattern: /\b(cardigan)\b/i,
    priority: 63,
  },

  // Polos
  {
    id: "cat-polo-perf",
    category: "polos",
    subcategory: "Performance Polo",
    pattern: /\b((performance|crown\s+sport|featherweight|sankaty|gamechanger|commuter|tech|stretch|jersey)\s+.*\bpolo|polo\s+.*\b(performance|stretch|moisture))\b/i,
    priority: 70,
  },
  {
    id: "cat-polo-knit",
    category: "polos",
    subcategory: "Knit Polo",
    pattern: /\b((merino|silk|sweater|cashmere|knit|johnny\s+collar)\s+.*\bpolo)\b/i,
    priority: 71,
  },
  {
    id: "cat-polo-pique",
    category: "polos",
    subcategory: "Pique Polo",
    pattern: /\b(polo\s+shirt|mesh\s+polo|pique\s+polo|piqu[eé]\s+polo|\bpolo\b)\b/i,
    exclude: /\b(polo\s+coat|water\s+polo|oxford\s+cloth|button[- ]?down|ocbd|dress\s+shirt)\b/i,
    priority: 72,
  },

  // Performance / Travel Trousers (check before regular chinos)
  {
    id: "cat-perf-commuter",
    category: "performance-trousers",
    subcategory: "Commuter Pant",
    pattern: /\b(commuter\s+pant|workday\s+pant|on[- ]the[- ]go\s+pant|eb66|highland\s+tour\s+pant|all[- ]day\s+every\s+day\s+pant)\b/i,
    priority: 80,
  },
  {
    id: "cat-perf-5pocket",
    category: "performance-trousers",
    subcategory: "5-Pocket Tech Pant",
    pattern: /\b((performance|stretch|tech|travel|abc|five[- ]?pocket|5[- ]?pocket)\s+.*\b(pant|trouser)|rapid\s+movement\s+.*\bpant)\b/i,
    exclude: /\b(chino)\b/i,
    priority: 81,
  },
  {
    id: "cat-perf-travel",
    category: "performance-trousers",
    subcategory: "Travel Trouser",
    pattern: /\b(travel\s+(trouser|pant)|wrinkle[- ]?free\s+performance\s+pant|weekday\s+warrior)\b/i,
    priority: 82,
  },

  // Chinos & Dress Pants
  {
    id: "cat-pant-flannel",
    category: "chinos-dress-pants",
    subcategory: "Flannel Trouser",
    pattern: /\b(flannel\s+(trouser|pant)|cavalry\s+twill\s+trouser)\b/i,
    priority: 90,
  },
  {
    id: "cat-pant-wool",
    category: "chinos-dress-pants",
    subcategory: "Wool Dress Pant",
    pattern: /\b(dress\s+(pant|trouser)|wool\s+(trouser|pant)|worsted\s+(trouser|pant)|suit\s+(pant|trouser)|pleated\s+trouser|flat[- ]?front\s+trouser|italian\s+wool\s+pant)\b/i,
    priority: 91,
  },
  {
    id: "cat-pant-chino",
    category: "chinos-dress-pants",
    subcategory: "Chino",
    pattern: /\b(chino|khaki\s+pant|washed\s+chino|484\s+.*\bpant|770\s+.*\bpant|breaker\s+pant|stretch\s+twill\s+pant)\b/i,
    priority: 92,
  },

  // OCBDs & Dress Shirts
  {
    id: "cat-shirt-perf",
    category: "dress-shirts-ocbds",
    subcategory: "Performance Dress Shirt",
    pattern: /\b(leeward\s+.*\bshirt|commuter\s+.*\bshirt|performance\s+dress\s+shirt|movement\s+shirt|stretch\s+performance\s+shirt)\b/i,
    priority: 100,
  },
  {
    id: "cat-shirt-ocbd",
    category: "dress-shirts-ocbds",
    subcategory: "OCBD",
    pattern: /\b(ocbd|oxford\s+(cloth\s+)?(button[- ]?down|shirt)|button[- ]?down\s+oxford|pinpoint\s+oxford)\b/i,
    priority: 101,
  },
  {
    id: "cat-shirt-noniron",
    category: "dress-shirts-ocbds",
    subcategory: "Non-Iron Dress Shirt",
    pattern: /\b(non[- ]?iron\s+.*\bshirt|poplin\s+dress\s+shirt|twill\s+dress\s+shirt|herringbone\s+dress\s+shirt|dress\s+shirt|formal\s+shirt|spread\s+collar\s+shirt)\b/i,
    priority: 102,
  },
  {
    id: "cat-shirt-twill",
    category: "dress-shirts-ocbds",
    subcategory: "Twill Shirt",
    pattern: /\b(twill\s+shirt|sport\s+shirt|button[- ]?down\s+shirt|hangin'\s+out\s+shirt|woven\s+shirt)\b/i,
    priority: 103,
  },
];

/**
 * Deterministic occasion tag mapping derived from category + subcategory + title qualifiers.
 */
export const OCCASION_BY_CATEGORY: Record<CategorySlug, OccasionTag[]> = {
  suits: ["Interview", "Superday", "Networking event"],
  "blazers-sport-coats": ["Interview", "Superday", "Networking event", "Office daily"],
  "ties-pocket-squares": ["Interview", "Superday", "Networking event"],
  "dress-shirts-ocbds": ["Interview", "Superday", "Office daily", "Summer internship"],
  "shoes-belts": ["Interview", "Superday", "Office daily", "Networking event"],
  "chinos-dress-pants": ["Office daily", "Summer internship", "Networking event"],
  "performance-trousers": ["Office daily", "Summer internship"],
  "quarter-zips-pullovers": ["Office daily", "Networking event", "Summer internship"],
  polos: ["Office daily", "Summer internship"],
  outerwear: ["Office daily", "Networking event"],
};

export const COLOR_NORMALIZATION_MAP: Record<string, string> = {
  // Navy & Blues
  navy: "Navy",
  "french navy": "Navy",
  "midnight navy": "Navy",
  midnight: "Navy",
  "dark navy": "Navy",
  "eclipse navy": "Navy",
  "true navy": "Navy",
  marine: "Navy",
  "light blue": "Light Blue",
  "sky blue": "Light Blue",
  sky: "Light Blue",
  "ice blue": "Light Blue",
  "pale blue": "Light Blue",
  "university blue": "Light Blue",
  "gale blue": "Light Blue",
  chambray: "Light Blue",
  blue: "Blue",
  "royal blue": "Blue",
  cobalt: "Blue",
  "slate blue": "Slate",
  slate: "Slate",
  // Neutrals
  white: "White",
  "crisp white": "White",
  "optic white": "White",
  ivory: "Cream",
  cream: "Cream",
  ecru: "Cream",
  "off-white": "Cream",
  stone: "Stone",
  putty: "Stone",
  sand: "Stone",
  oatmeal: "Oatmeal",
  heather: "Gray",
  "heather gray": "Gray",
  "heather grey": "Gray",
  grey: "Gray",
  gray: "Gray",
  "light grey": "Light Gray",
  "light gray": "Light Gray",
  silver: "Light Gray",
  charcoal: "Charcoal",
  "dark charcoal": "Charcoal",
  "dark grey": "Charcoal",
  "dark gray": "Charcoal",
  graphite: "Charcoal",
  black: "Black",
  jet: "Black",
  onyx: "Black",
  // Browns, Khakis & Tans
  khaki: "Khaki",
  "british khaki": "Khaki",
  "british tan": "Tan",
  tan: "Tan",
  camel: "Camel",
  cognac: "Cognac",
  walnut: "Brown",
  espresso: "Dark Brown",
  "dark brown": "Dark Brown",
  mahogany: "Dark Brown",
  chocolate: "Dark Brown",
  brown: "Brown",
  tobacco: "Brown",
  // Greens & Accents
  "forest green": "Forest Green",
  "hunter green": "Forest Green",
  "british racing green": "Forest Green",
  pine: "Forest Green",
  emerald: "Forest Green",
  olive: "Olive",
  "dark olive": "Olive",
  sage: "Sage",
  burgundy: "Burgundy",
  oxblood: "Burgundy",
  wine: "Burgundy",
  maroon: "Burgundy",
  bordeaux: "Burgundy",
  pink: "Light Pink",
  "light pink": "Light Pink",
  lavender: "Lavender",
};
