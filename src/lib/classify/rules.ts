import { OUT_OF_SCOPE_CATEGORY, type AllCategorySlug, type CategorySlug, type OccasionTag } from "@config/categories";

export interface CategoryRule {
  id: string;
  category: AllCategorySlug;
  subcategory: string;
  /** Evaluated against normalized `title + " " + breadcrumb` */
  pattern: RegExp;
  /** Optional negative guard to prevent cross-matches */
  exclude?: RegExp;
  /** Optional brand scope */
  brandSlugs?: string[];
  priority: number;
}

/**
 * Out-of-scope rules evaluated BEFORE in-scope rules so non-finance items
 * (women's, kids', swim, athletic, graphic tees, hats, gifts, home goods, underwear, casual socks)
 * are cleanly separated into `out_of_scope` (excluded from public feed, auditable in /admin).
 */
export const OUT_OF_SCOPE_RULES: readonly CategoryRule[] = [
  {
    id: "oos-gift-card",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Gift Card",
    pattern: /\b(gift\s*card|e-?gift|gift\s+certificate|gift\s+box|gift\s+wrap|gift\s+bag)\b/i,
    priority: 1,
  },
  {
    id: "oos-womens",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Women's Apparel",
    pattern:
      /\b(women'?s?|womens|ladies|maxi\s+dress|midi\s+dress|mini\s+dress|sundress|slip\s+dress|shirtdress|shirt\s+dress|wrap\s+dress|sweater\s+dress|skirt|romper|jumpsuit|bikini|one[- ]piece|tankini|bra\b|bralette|leggings?|maternity|blouse|camisole|cami\b|tunic|kaftan|caftan|sarong|poncho|pareo|skort|crop\s+top|cropped\s+tank|bodysuit|cover[- ]?up)\b/i,
    exclude: /\b(men'?s\s+dress\s+(shirt|pant|trouser|shoe|belt|sock)|dress\s+(shirt|pant|trouser|shoe|belt|sock))\b/i,
    priority: 2,
  },
  {
    id: "oos-kids",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Kids' Apparel",
    pattern: /\b(kids?'?|youth|toddler|baby|infant|boys?'?|girls?'?|little\s+ones|onesie)\b/i,
    priority: 3,
  },
  {
    id: "oos-swim",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Swimwear",
    pattern: /\b(swim\s*trunks?|swimwear|swim\s+short|men'?s\s+swim|all\s+day\s+swim|category:swim|\btrunks?\b|boardshorts?|board\s+shorts?|rash\s*guard|beacon\s+trunk|volley\s+trunk|swim\s+brief|beach\s+towel)\b/i,
    priority: 4,
  },
  {
    id: "oos-home-goods",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Home & Lifestyle",
    pattern:
      /\b(blanket|throw\s+pillow|pillow\s*case|candle|mug|tumbler|glassware|coaster|towel|bedding|duvet|quilt\b|rug\b|mat\b|chair|umbrella|cooler|sticker|keychain|ornament|dog\s+collar|dog\s+bed|pet\b|leash|book\b|magazine|cologne|perfume|fragrance|soap|lotion|grooming|sunglasses|eyewear|shoe\s+tree|garment\s+bag|shoe\s+bag|valet\s+tray|category:home|home\s*&\s*wellness)\b/i,
    exclude: /\b(quilted\s+(vest|jacket|coat|pullover)|blanket\s+stripe\s+(zip|sweater|shirt|pullover|cardigan))\b/i,
    priority: 5,
  },
  {
    id: "oos-hats-bags",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Hats & Casual Bags",
    pattern:
      /\b(baseball\s+(hat|cap)|trucker\s+(hat|cap)|dad\s+hat|bucket\s+hat|sun\s+hat|straw\s+hat|beanie|visor|snapback|ball\s*cap|\bhat\b|accessories\s+hats|accessories\s+bags|tote\s+bag|reusable\s+tote|\btote\b|pouch|money\s+clip|backpack|duffel|duffle|weekender|dopp\s+kit|wallet|card\s+holder|passport\s+holder|messenger\s+bag|sling\s+bag|fanny\s+pack|scarf|gloves?)\b/i,
    priority: 6,
  },
  {
    id: "oos-underwear-socks",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Underwear & Casual Socks",
    pattern:
      /\b(underwear|boxer\s*briefs?|boxer\s+shorts?|boxers?|briefs?|undershirt|pajamas?|sleepwear|lounge\s+pant|robe\b|socks?)\b/i,
    exclude: /\b(dress\s+socks?|over[- ]the[- ]calf|trouser\s+socks?|merino\s+dress\s+socks?)\b/i,
    priority: 7,
  },
  {
    id: "oos-shorts",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Shorts",
    pattern: /\b(shorts?|\brec\s+short\b|chino\s+short|golf\s+short|hybrid\s+short|all\s+day\s+short|cargo\s+short|linen\s+short)\b/i,
    exclude: /\b(short[- ]?sleeve|short\s+fit|38s|40s|42s)\b/i,
    priority: 8,
  },
  {
    id: "oos-athletic-lounge",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Athletic & Loungewear",
    pattern:
      /\b(joggers?|sweatpants?|sweat\s*pants?|sweatshorts?|track\s+pants?|windbreaker\s+pant|nylon\s+windbreaker|hoodies?|sweatshirts?|fleece\s+jogger|fleece\s+crew|french\s+terry\s+crew|organic\s+crew|men'?s\s+lounge|gym\s+short|running\s+short|training\s+short|active\s+pant|lounge\s+short|thermal\s+pant|sneakers?|saucony|quoddy\s+maliseet|sandals?|flip[- ]?flops?|slides?|slippers?|espadrilles?|boat\s+shoes?)\b/i,
    priority: 9,
  },
  {
    id: "oos-tees-tanks-henleys",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Tees, Tanks & Henleys",
    pattern:
      /\b(t-?shirts?|graphic\s+tee|pocket\s+tee|muscle\s+tee|performance\s+tee|sweater\s+tee|regenerative\s+tee|crew\s+tee|v-?neck\s+tee|long[- ]?sleeve\s+tee|short[- ]?sleeve\s+tee|\btee\b|tank\s+top|\btank\b|henley|sleeveless|rugby\s+shirt)\b/i,
    priority: 10,
  },
  {
    id: "oos-denim-jeans",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Denim & Casual Jeans",
    pattern: /\b(jeans?|denim\s+pant|selvedge\s+denim|stretch\s+denim|carpenter\s+denim|denim\s+jacket|trucker\s+jacket|\bdenim\b)\b/i,
    exclude: /\b(jeans?\s+belt|denim\s+shirt)\b/i,
    priority: 11,
  },
  {
    id: "oos-resort-camp-shirts",
    category: OUT_OF_SCOPE_CATEGORY,
    subcategory: "Resort & Short-Sleeve Casual Shirts",
    pattern: /\b(camp\s+shirt|cabana\s+shirt|hawaiian\s+shirt|aloha\s+shirt|riviera\s+short\s+sleeve|short[- ]?sleeve\s+.*\b(camp|breeze|oasis|monterey|sweater|linen|resort|vacation)\s+shirt)\b/i,
    priority: 12,
  },
];

/**
 * Declarative in-scope category & subcategory classification rules.
 * Evaluated in ascending `priority` order after `OUT_OF_SCOPE_RULES`.
 */
export const CATEGORY_RULES: readonly CategoryRule[] = [
  // Suits
  {
    id: "cat-suit-tuxedo",
    category: "suits",
    subcategory: "Tuxedo",
    pattern: /\b(tuxedo|dinner\s+suit|black[- ]tie\s+suit|dinner\s+jacket)\b/i,
    priority: 20,
  },
  {
    id: "cat-suit-travel",
    category: "suits",
    subcategory: "Travel Suit",
    pattern: /\b(travel\s+suit|jetsetter\s+.*\bsuit|stretch\s+wool\s+suit|commuter\s+suit)\b/i,
    exclude: /\b(suit\s+(pant|trouser|jacket|vest)|separate)\b/i,
    priority: 21,
  },
  {
    id: "cat-suit-worsted",
    category: "suits",
    subcategory: "Worsted Wool Suit",
    pattern: /\b(suits?|napoli\s+navy|havana\s+suit|ludlow\s+.*\bsuit|sutton\s+.*\bsuit|1818\s+.*\bsuit|empire\s+.*\bsuit)\b/i,
    exclude: /\b(suit\s+(pant|pants|trouser|trousers|jacket|vest)|suit\s+separate|garment\s+bag|swim\s*suit|sweat\s*suit|bodysuit|jumpsuit)\b/i,
    priority: 22,
  },

  // Blazers & Sport Coats
  {
    id: "cat-blazer-knit",
    category: "blazers-sport-coats",
    subcategory: "Knit Blazer",
    pattern: /\b(knit\s+blazers?|inlet\s+knit\s+blazer|jersey\s+blazer|sweater\s+blazer)\b/i,
    priority: 30,
  },
  {
    id: "cat-blazer-hopsack",
    category: "blazers-sport-coats",
    subcategory: "Hopsack Sport Coat",
    pattern: /\b(hopsack\s+(blazer|sport\s*coat|jacket)|sport\s*coats?|sportcoats?)\b/i,
    priority: 31,
  },
  {
    id: "cat-blazer-navy",
    category: "blazers-sport-coats",
    subcategory: "Navy Blazer",
    pattern: /\b(blazers?|suit\s+jackets?|tailored\s+jackets?|unstructured\s+.*\bblazer|jetsetter\s+.*\bblazer)\b/i,
    exclude: /\b(overcoat|topcoat|trench|rain\s+jacket|puffer|vest)\b/i,
    priority: 32,
  },

  // Ties & Pocket Squares
  {
    id: "cat-tie-pocket-square",
    category: "ties-pocket-squares",
    subcategory: "Pocket Square",
    pattern: /\b(pocket\s+squares?)\b/i,
    priority: 40,
  },
  {
    id: "cat-tie-grenadine",
    category: "ties-pocket-squares",
    subcategory: "Grenadine Tie",
    pattern: /\b(grenadine\s+ties?)\b/i,
    priority: 41,
  },
  {
    id: "cat-tie-silk",
    category: "ties-pocket-squares",
    subcategory: "Silk Tie",
    pattern:
      /\b(neck\s*ties?|silk\s+(?:\w+\s+)?ties?|twill\s+ties?|jacquard\s+ties?|knit\s+ties?|rep\s+ties?|repp\s+ties?|woven\s+ties?|striped\s+ties?|bow\s*ties?)\b/i,
    priority: 42,
  },

  // Loafers, Dress Shoes, Belts & Dress Socks
  {
    id: "cat-dress-socks",
    category: "shoes-belts",
    subcategory: "Dress Socks",
    pattern: /\b(dress\s+socks?|over[- ]the[- ]calf\s+socks?|trouser\s+socks?)\b/i,
    priority: 49,
  },
  {
    id: "cat-belt-dress",
    category: "shoes-belts",
    subcategory: "Dress Belt",
    pattern: /\b((dress|leather|calfskin|suede|braided|needlepoint|stretch|jeans|clubhouse|reversible|woven)\s+.*\bbelts?|\bbelts?\b)\b/i,
    exclude: /\b(belt\s+bag|seat\s*belt)\b/i,
    priority: 50,
  },
  {
    id: "cat-shoe-loafer",
    category: "shoes-belts",
    subcategory: "Penny Loafer",
    pattern: /\b(loafers?|penny\s+loafers?|tassel\s+loafers?|horsebit|bit\s+loafers?|venetian\s+loafers?|driving\s+shoes?)\b/i,
    priority: 51,
  },
  {
    id: "cat-shoe-oxford",
    category: "shoes-belts",
    subcategory: "Oxford Dress Shoe",
    pattern: /\b(oxfords?|cap[- ]toe|wholecut|balmoral|brogues?)\b/i,
    exclude: /\b(oxford\s+(cloth|shirt|button|weave)|ocbd|sport\s+shirt|stretch\s+oxford|cotton\s+oxford)\b/i,
    priority: 52,
  },
  {
    id: "cat-shoe-derby",
    category: "shoes-belts",
    subcategory: "Derby / Monk Strap",
    pattern: /\b(derby\s+shoes?|monk\s+straps?|double\s+monk|dress\s+shoes?|chelsea\s+boots?|chukka(\s+boots?)?|dress\s+boots?)\b/i,
    priority: 53,
  },

  // Outerwear (Vests, Overcoats, Trenches, Tailored/Smart-Casual Jackets)
  {
    id: "cat-outerwear-vest-quilted",
    category: "outerwear",
    subcategory: "Quilted Vest",
    pattern: /\b(quilted\s+vests?|insulated\s+vests?|down\s+vests?|hyperlight\s+vests?|gilets?)\b/i,
    priority: 60,
  },
  {
    id: "cat-outerwear-vest-fleece",
    category: "outerwear",
    subcategory: "Fleece Vest",
    pattern: /\b(fleece\s+vests?|sweater\s+vests?|performance\s+vests?|merino\s+vests?|\bvests?\b)\b/i,
    exclude: /\b(suit\s+vest|waistcoat)\b/i,
    priority: 61,
  },
  {
    id: "cat-outerwear-overcoat",
    category: "outerwear",
    subcategory: "Wool Overcoat",
    pattern: /\b(overcoats?|top\s*coats?|chesterfields?|car\s+coats?|balmacaans?|peacoats?|wool\s+coats?|shearling\s+coats?)\b/i,
    priority: 62,
  },
  {
    id: "cat-outerwear-trench",
    category: "outerwear",
    subcategory: "Trench / Mac Coat",
    pattern: /\b(trench\s+coats?|mac\s+coats?|rain\s+coats?|mackintosh)\b/i,
    priority: 63,
  },
  {
    id: "cat-outerwear-jacket",
    category: "outerwear",
    subcategory: "Tailored Jacket",
    pattern:
      /\b(chore\s+(jacket|coat)|bomber(\s+jacket)?|field\s+jacket|harrington\s+jacket|suede\s+(jacket|trucker)|twill\s+trucker|frontier\s+trucker|wool\s+jacket|fleece\s+jacket|quilted\s+jacket|shirt\s+jacket|shacket|\bcpo\b|parka|mercer\s+jacket|outerwear\s+jacket|\bjacket\b)\b/i,
    exclude: /\b(suit\s+jacket|denim\s+jacket|windbreaker|rain\s+shell)\b/i,
    priority: 64,
  },

  // Quarter-Zips & Pullovers
  {
    id: "cat-qzip-quarter",
    category: "quarter-zips-pullovers",
    subcategory: "Quarter-Zip",
    pattern:
      /\b(quarter[- ]?zips?|1\/4[- ]?zips?|q[- ]?zips?|perth\s+.*\b(zip|pullover)|shep\s+shirt|sully\s+.*\b(quarter|zip|pullover)|estate[- ]?rib)\b/i,
    priority: 70,
  },
  {
    id: "cat-qzip-half",
    category: "quarter-zips-pullovers",
    subcategory: "Half-Zip",
    pattern: /\b(half[- ]?zips?|1\/2[- ]?zips?|mock[- ]?neck\s+zip|zip\s+pullovers?|zip\s+sweaters?|full[- ]?zip\s+sweaters?)\b/i,
    priority: 71,
  },
  {
    id: "cat-qzip-cardigan",
    category: "quarter-zips-pullovers",
    subcategory: "Cardigan",
    pattern: /\b(cardigans?|shawl\s+collar\s+sweater)\b/i,
    priority: 72,
  },
  {
    id: "cat-qzip-crew",
    category: "quarter-zips-pullovers",
    subcategory: "Crewneck Sweater",
    pattern:
      /\b((merino|cashmere|cotton|linen|wool|cable|waffle|donegal|italian|washable|fine[- ]gauge)\s+.*\bsweaters?|crew[- ]?neck\s+sweaters?|crew\s+sweaters?|v[- ]?neck\s+sweaters?|mock[- ]?neck\s+sweaters?|turtleneck\s+sweaters?|pullover\s+sweaters?|knit\s+pullovers?|\bsweaters?\b|\bpullovers?\b)\b/i,
    exclude: /\b(sweater\s+shirt|sweater\s+blazer|sweater\s+vest|sweater\s+tee|sweater\s+polo|sweater\s+chore\s+jacket|sweater\s+jacket)\b/i,
    priority: 73,
  },

  // Polos
  {
    id: "cat-polo-perf",
    category: "polos",
    subcategory: "Performance Polo",
    pattern:
      /\b((performance|crown\s+sport|featherweight|sankaty|gamechanger|commuter|tech|stretch|jersey|golf)\s+.*\bpolos?|polos?\s+.*\b(performance|stretch|moisture))\b/i,
    priority: 80,
  },
  {
    id: "cat-polo-knit",
    category: "polos",
    subcategory: "Knit Polo",
    pattern: /\b((merino|silk|sweater|cashmere|knit|johnny\s+collar|long[- ]?sleeve)\s+.*\bpolos?)\b/i,
    priority: 81,
  },
  {
    id: "cat-polo-pique",
    category: "polos",
    subcategory: "Pique Polo",
    pattern: /\b(polo\s+shirts?|mesh\s+polos?|pique\s+polos?|piqu[eé]\s+polos?|\bpolos?\b)\b/i,
    exclude: /\b(polo\s+coat|water\s+polo|oxford\s+cloth|button[- ]?down|ocbd|dress\s+shirt)\b/i,
    priority: 82,
  },

  // Performance / Travel Trousers
  {
    id: "cat-perf-commuter",
    category: "performance-trousers",
    subcategory: "Commuter Pant",
    pattern:
      /\b(commuter\s+pants?|workday\s+pants?|on[- ]the[- ]go\s+pants?|eb66|highland\s+(tour|golf)\s+pants?|all[- ]day\s+every\s+day\s+pants?|all\s+day\s+pants?)\b/i,
    priority: 90,
  },
  {
    id: "cat-perf-5pocket",
    category: "performance-trousers",
    subcategory: "5-Pocket Tech Pant",
    pattern:
      /\b((performance|stretch|tech|travel|abc|five[- ]?pocket|5[- ]?pocket|bedford|corduroy)\s+.*\b(pants?|trousers?)|rapid\s+movement\s+.*\bpants?|5[- ]?pocket|five[- ]?pocket)\b/i,
    exclude: /\b(chinos?|windbreaker|jogger|sweatpant|jeans?|denim)\b/i,
    priority: 91,
  },
  {
    id: "cat-perf-travel",
    category: "performance-trousers",
    subcategory: "Travel Trouser",
    pattern: /\b(travel\s+(trousers?|pants?)|wrinkle[- ]?free\s+performance\s+pants?|weekday\s+warrior)\b/i,
    priority: 92,
  },

  // Chinos & Dress Pants
  {
    id: "cat-pant-flannel",
    category: "chinos-dress-pants",
    subcategory: "Flannel Trouser",
    pattern: /\b(flannel\s+(trousers?|pants?)|cavalry\s+twill\s+trousers?)\b/i,
    priority: 100,
  },
  {
    id: "cat-pant-wool",
    category: "chinos-dress-pants",
    subcategory: "Wool Dress Pant",
    pattern:
      /\b(dress\s+(pants?|trousers?)|wool\s+(trousers?|pants?)|worsted\s+(trousers?|pants?)|suit\s+(pants?|trousers?)|pleated\s+(trousers?|pants?)|flat[- ]?front\s+(trousers?|pants?)|italian\s+wool\s+(pants?|trousers?)|tailored\s+trousers?|\btrousers?\b)\b/i,
    priority: 101,
  },
  {
    id: "cat-pant-chino",
    category: "chinos-dress-pants",
    subcategory: "Chino",
    pattern:
      /\b(chinos?|khakis?\s+pants?|washed\s+chinos?|tech\s+chinos?|484\s+.*\bpants?|770\s+.*\bpants?|breaker\s+pants?|stretch\s+twill\s+pants?|twill\s+pants?|everyday\s+pants?|\bpants?\b)\b/i,
    exclude: /\b(sweatpants?|track\s+pants?|windbreaker\s+pants?|lounge\s+pants?|pajama\s+pants?|thermal\s+pants?)\b/i,
    priority: 102,
  },

  // OCBDs & Dress Shirts
  {
    id: "cat-shirt-perf",
    category: "dress-shirts-ocbds",
    subcategory: "Performance Dress Shirt",
    pattern:
      /\b(leeward\s+.*\bshirt|commuter\s+.*\bshirt|performance\s+dress\s+shirt|movement\s+.*\bshirt|stretch\s+performance\s+shirt|jetsetter\s+.*\bshirt|tech\s+button[- ]?down)\b/i,
    priority: 110,
  },
  {
    id: "cat-shirt-ocbd",
    category: "dress-shirts-ocbds",
    subcategory: "OCBD",
    pattern:
      /\b(ocbd|oxford\s+(cloth\s+)?(button[- ]?down|shirt)|button[- ]?down\s+oxford|pinpoint\s+oxford|stretch\s+oxford\s+shirt)\b/i,
    priority: 111,
  },
  {
    id: "cat-shirt-noniron",
    category: "dress-shirts-ocbds",
    subcategory: "Non-Iron Dress Shirt",
    pattern:
      /\b(non[- ]?iron\s+.*\bshirt|poplin\s+dress\s+shirt|twill\s+dress\s+shirt|herringbone\s+dress\s+shirt|dress\s+shirts?|formal\s+shirts?|spread\s+collar\s+shirt|daily\s+grind\s+.*\bshirt)\b/i,
    priority: 112,
  },
  {
    id: "cat-shirt-twill",
    category: "dress-shirts-ocbds",
    subcategory: "Twill Shirt",
    pattern:
      /\b(twill\s+shirts?|sport\s+shirts?|button[- ]?down(\s+shirt)?|hangin'\s+out\s+.*\bshirt|woven\s+shirts?|everyday\s+shirt|stretch\s+everyday\s+shirt|poplin\s+shirt|herringbone\s+shirt|chambray\s+.*\b(shirt|button[- ]?down))\b/i,
    priority: 113,
  },
  {
    id: "cat-shirt-casual-button-up",
    category: "dress-shirts-ocbds",
    subcategory: "Casual Button-Down",
    pattern:
      /\b(legend\s+sweater\s+shirt|coastline\s+knit\s+shirt|knit\s+shirt|sweater\s+shirt|seaview\s+.*\bshirt|linen\s+shirt|corduroy\s+shirt|flannel(\s+shirt)?|overshirt|popover|men'?s\s+button\s+ups?|button[- ]?up\s+shirt)\b/i,
    exclude: /\b(t-?shirt|polo\s+shirt|sweatshirt|undershirt|shep\s+shirt|camp\s+shirt|flannel\s+(trouser|pant))\b/i,
    priority: 114,
  },
];

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
  navy: "Navy",
  "french navy": "Navy",
  "midnight navy": "Navy",
  midnight: "Navy",
  "dark navy": "Navy",
  "eclipse navy": "Navy",
  "true navy": "Navy",
  "deep navy": "Navy",
  "abyss navy": "Navy",
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
