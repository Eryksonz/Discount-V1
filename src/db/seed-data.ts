import { BRANDS, validateAndBuildOutboundUrl } from "@config/brands";
import { classifyProduct } from "@/lib/classify";
import { evaluateProductDeal, type PriceSnapshotPoint } from "@/lib/deals";

export interface SeededProductRecord {
  id: string;
  brandSlug: string;
  brandName: string;
  brandCode: string;
  brandSwatchHex: string;
  externalId: string;
  slug: string;
  name: string;
  rawBreadcrumb: string;
  dataSource: "demo" | "crawler";
  category: string | null;
  subcategory: string | null;
  occasions: string[];
  colors: string[];
  sizes: string[];
  matchedRuleId: string | null;
  classificationStatus: "classified" | "unclassified";
  currentPriceCents: number;
  originalPriceCents: number;
  currency: string;
  productUrl: string;
  affiliateUrl: string | null;
  imageUrl: string | null;
  inStock: boolean;
  dataNote: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastCheckedAt: Date;
  median30dCents: number;
  median90dCents: number;
  low90dCents: number;
  allTimeLowCents: number;
  timesAtOrBelowCurrent: number;
  lastPriceChangeCents: number;
  lastPriceChangeAt: Date | null;
  pctBelowMedian: number;
  pctBelowOriginal: number;
  historyDays: number;
  dealLabel: string;
  dealScore: number;
  dealScoreBreakdown: {
    belowMedian: number;
    belowOriginal: number;
    recency: number;
    stock: number;
    total: number;
  };
  dealBlurb: string;
  snapshots: PriceSnapshotPoint[];
}

function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProductTemplate {
  brandSlug: string;
  name: string;
  breadcrumb: string;
  msrpDollars: number;
  colors: string[];
  sizes: string[];
  path: string;
}

const ALPHA_SIZES = ["S", "M", "L", "XL", "XXL"];
const SHIRT_SIZES = ["15/32", "15.5/33", "16/34", "16.5/35", "17/35"];
const PANT_SIZES = ["30x30", "32x30", "32x32", "34x30", "34x32", "36x32"];
const SUIT_SIZES = ["38R", "40R", "40L", "42R", "42L", "44R"];
const SHOE_SIZES = ["8.5D", "9D", "9.5D", "10D", "10.5D", "11D", "12D"];

const BASE_CATALOG_TEMPLATES: ProductTemplate[] = [
  // Peter Millar
  { brandSlug: "peter-millar", name: "Perth Performance Quarter-Zip", breadcrumb: "Men > Pullovers", msrpDollars: 140, colors: ["French Navy", "Gale Blue", "Heather Grey"], sizes: ALPHA_SIZES, path: "/p/perth-performance-quarter-zip" },
  { brandSlug: "peter-millar", name: "Crown Sport Featherweight Performance Polo", breadcrumb: "Men > Polos", msrpDollars: 110, colors: ["Sky Blue", "Optic White", "Navy"], sizes: ALPHA_SIZES, path: "/p/crown-sport-featherweight-polo" },
  { brandSlug: "peter-millar", name: "EB66 Performance Five-Pocket Pant", breadcrumb: "Men > Pants", msrpDollars: 165, colors: ["British Khaki", "Dark Navy", "Stone"], sizes: PANT_SIZES, path: "/p/eb66-performance-pant" },
  { brandSlug: "peter-millar", name: "Hyperlight Weld Quilted Vest", breadcrumb: "Men > Outerwear > Vests", msrpDollars: 235, colors: ["Midnight Navy", "Hunter Green", "Charcoal"], sizes: ALPHA_SIZES, path: "/p/hyperlight-weld-quilted-vest" },
  { brandSlug: "peter-millar", name: "Crown Crafted Merino Half-Zip Pullover", breadcrumb: "Men > Sweaters", msrpDollars: 215, colors: ["Charcoal", "Oatmeal", "Navy"], sizes: ALPHA_SIZES, path: "/p/crown-crafted-merino-half-zip" },
  { brandSlug: "peter-millar", name: "Flynn Classic Wool Blazer", breadcrumb: "Men > Tailored Clothing", msrpDollars: 695, colors: ["True Navy"], sizes: SUIT_SIZES, path: "/p/flynn-classic-wool-blazer" },

  // Vineyard Vines
  { brandSlug: "vineyard-vines", name: "Saltwater Quarter-Zip Pullover", breadcrumb: "Men > Pullovers", msrpDollars: 118, colors: ["Navy", "Heather Grey", "Light Blue"], sizes: ALPHA_SIZES, path: "/p/saltwater-quarter-zip" },
  { brandSlug: "vineyard-vines", name: "Sankaty Performance Polo", breadcrumb: "Men > Polos", msrpDollars: 98, colors: ["White", "Sky Blue", "Navy"], sizes: ALPHA_SIZES, path: "/p/sankaty-performance-polo" },
  { brandSlug: "vineyard-vines", name: "On-The-Go Performance Pant", breadcrumb: "Men > Pants", msrpDollars: 138, colors: ["Khaki", "Stone", "Navy"], sizes: PANT_SIZES, path: "/p/on-the-go-performance-pant" },
  { brandSlug: "vineyard-vines", name: "Breaker Chino Pant", breadcrumb: "Men > Chinos", msrpDollars: 108, colors: ["British Khaki", "Navy", "Stone"], sizes: PANT_SIZES, path: "/p/breaker-chino-pant" },
  { brandSlug: "vineyard-vines", name: "Shep Shirt Cotton Quarter-Zip", breadcrumb: "Men > Pullovers", msrpDollars: 128, colors: ["Navy", "Oatmeal"], sizes: ALPHA_SIZES, path: "/p/shep-shirt-quarter-zip" },
  { brandSlug: "vineyard-vines", name: "Harbor Performance Fleece Vest", breadcrumb: "Men > Vests", msrpDollars: 148, colors: ["Charcoal", "Navy"], sizes: ALPHA_SIZES, path: "/p/harbor-fleece-vest" },

  // Brooks Brothers
  { brandSlug: "brooks-brothers", name: "Regent Fit Non-Iron Stretch Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 118, colors: ["Crisp White", "Light Blue"], sizes: SHIRT_SIZES, path: "/p/regent-non-iron-dress-shirt" },
  { brandSlug: "brooks-brothers", name: "Milano Fit Oxford Cloth Button-Down Shirt", breadcrumb: "Men > Casual Shirts", msrpDollars: 128, colors: ["University Blue", "White", "Light Pink"], sizes: ALPHA_SIZES, path: "/p/milano-ocbd-shirt" },
  { brandSlug: "brooks-brothers", name: "1818 Regent Fit Worsted Wool Suit", breadcrumb: "Men > Suits", msrpDollars: 1198, colors: ["True Navy", "Dark Charcoal"], sizes: SUIT_SIZES, path: "/p/1818-regent-wool-suit" },
  { brandSlug: "brooks-brothers", name: "Regent Fit Two-Button Navy Hopsack Blazer", breadcrumb: "Men > Blazers", msrpDollars: 598, colors: ["French Navy"], sizes: SUIT_SIZES, path: "/p/regent-navy-hopsack-blazer" },
  { brandSlug: "brooks-brothers", name: "BB#1 Rep Silk Tie", breadcrumb: "Men > Ties", msrpDollars: 98, colors: ["Navy", "Burgundy"], sizes: ["One Size"], path: "/p/bb1-rep-silk-tie" },
  { brandSlug: "brooks-brothers", name: "Elliot Flat-Front Wool Dress Trouser", breadcrumb: "Men > Dress Pants", msrpDollars: 228, colors: ["Dark Grey", "Navy", "Charcoal"], sizes: PANT_SIZES, path: "/p/elliot-wool-dress-trouser" },

  // Johnnie-O
  { brandSlug: "johnnie-o", name: "Sully Quarter-Zip Pullover", breadcrumb: "Men > Pullovers", msrpDollars: 138, colors: ["Heather Grey", "Navy", "Slate"], sizes: ALPHA_SIZES, path: "/p/sully-quarter-zip" },
  { brandSlug: "johnnie-o", name: "Featherweight Performance Polo", breadcrumb: "Men > Polos", msrpDollars: 108, colors: ["Sky Blue", "Navy", "White"], sizes: ALPHA_SIZES, path: "/p/featherweight-performance-polo" },
  { brandSlug: "johnnie-o", name: "Flex Performance Five-Pocket Pant", breadcrumb: "Men > Pants", msrpDollars: 148, colors: ["Khaki", "Stone", "Navy"], sizes: PANT_SIZES, path: "/p/flex-performance-5-pocket-pant" },
  { brandSlug: "johnnie-o", name: "Hangin' Out Twill Button-Down Shirt", breadcrumb: "Men > Woven Shirts", msrpDollars: 138, colors: ["Light Blue", "White"], sizes: ALPHA_SIZES, path: "/p/hangin-out-twill-shirt" },
  { brandSlug: "johnnie-o", name: "Bandon Quilted Vest", breadcrumb: "Men > Outerwear", msrpDollars: 198, colors: ["Navy", "Olive"], sizes: ALPHA_SIZES, path: "/p/bandon-quilted-vest" },

  // Faherty
  { brandSlug: "faherty", name: "Movement Performance Dress Shirt", breadcrumb: "Men > Shirts", msrpDollars: 168, colors: ["White", "Sky Blue", "Navy"], sizes: ALPHA_SIZES, path: "/p/movement-shirt" },
  { brandSlug: "faherty", name: "Inlet Knit Blazer", breadcrumb: "Men > Blazers", msrpDollars: 298, colors: ["Midnight", "Charcoal", "Camel"], sizes: ALPHA_SIZES, path: "/p/inlet-knit-blazer" },
  { brandSlug: "faherty", name: "Stretch Terry Five-Pocket Chino", breadcrumb: "Men > Pants", msrpDollars: 168, colors: ["Stone", "Khaki", "Navy"], sizes: PANT_SIZES, path: "/p/stretch-terry-chino" },
  { brandSlug: "faherty", name: "Merino Crewneck Sweater", breadcrumb: "Men > Sweaters", msrpDollars: 198, colors: ["Oatmeal", "Navy", "Forest Green"], sizes: ALPHA_SIZES, path: "/p/merino-crewneck-sweater" },
  { brandSlug: "faherty", name: "Sunwashed Pique Polo", breadcrumb: "Men > Polos", msrpDollars: 98, colors: ["Navy", "Sage", "White"], sizes: ALPHA_SIZES, path: "/p/sunwashed-pique-polo" },

  // Mizzen+Main
  { brandSlug: "mizzen-main", name: "Leeward Performance Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 138, colors: ["Crisp White", "Light Blue", "Lavender"], sizes: ALPHA_SIZES, path: "/p/leeward-dress-shirt" },
  { brandSlug: "mizzen-main", name: "Baron Performance Quarter-Zip", breadcrumb: "Men > Pullovers", msrpDollars: 148, colors: ["Navy", "Charcoal", "Heather Grey"], sizes: ALPHA_SIZES, path: "/p/baron-quarter-zip" },
  { brandSlug: "mizzen-main", name: "Helmsman Travel Trouser", breadcrumb: "Men > Pants", msrpDollars: 158, colors: ["Dark Navy", "Charcoal", "Khaki"], sizes: PANT_SIZES, path: "/p/helmsman-travel-trouser" },
  { brandSlug: "mizzen-main", name: "Versa Performance Polo", breadcrumb: "Men > Polos", msrpDollars: 98, colors: ["Navy", "Light Blue", "White"], sizes: ALPHA_SIZES, path: "/p/versa-performance-polo" },
  { brandSlug: "mizzen-main", name: "Fairway Quilted Vest", breadcrumb: "Men > Outerwear", msrpDollars: 178, colors: ["Midnight Navy", "Black"], sizes: ALPHA_SIZES, path: "/p/fairway-quilted-vest" },

  // Rhone
  { brandSlug: "rhone", name: "Commuter Performance Dress Shirt", breadcrumb: "Men > Commuter", msrpDollars: 138, colors: ["White", "Sky Blue", "Navy"], sizes: ALPHA_SIZES, path: "/p/commuter-dress-shirt" },
  { brandSlug: "rhone", name: "Commuter Pant Slim", breadcrumb: "Men > Commuter > Pants", msrpDollars: 138, colors: ["Dark Navy", "Khaki", "Charcoal", "Stone"], sizes: PANT_SIZES, path: "/p/commuter-pant-slim" },
  { brandSlug: "rhone", name: "Commuter Performance Polo", breadcrumb: "Men > Commuter > Polos", msrpDollars: 98, colors: ["Navy", "White", "Slate"], sizes: ALPHA_SIZES, path: "/p/commuter-polo" },
  { brandSlug: "rhone", name: "Spar Quarter-Zip Pullover", breadcrumb: "Men > Pullovers", msrpDollars: 128, colors: ["Navy", "Heather Grey"], sizes: ALPHA_SIZES, path: "/p/spar-quarter-zip" },
  { brandSlug: "rhone", name: "Commuter Unstructured Blazer", breadcrumb: "Men > Commuter > Outerwear", msrpDollars: 298, colors: ["Navy", "Charcoal"], sizes: ALPHA_SIZES, path: "/p/commuter-blazer" },

  // Bonobos
  { brandSlug: "bonobos", name: "Stretch Washed Chino 2.0", breadcrumb: "Men > Chinos", msrpDollars: 109, colors: ["British Khaki", "Navy", "Stone", "Olive"], sizes: PANT_SIZES, path: "/p/stretch-washed-chino-2" },
  { brandSlug: "bonobos", name: "Jetsetter Stretch Wool Travel Suit", breadcrumb: "Men > Suits", msrpDollars: 750, colors: ["True Navy", "Charcoal"], sizes: SUIT_SIZES, path: "/p/jetsetter-stretch-wool-suit" },
  { brandSlug: "bonobos", name: "Jetsetter Stretch Wool Blazer", breadcrumb: "Men > Blazers", msrpDollars: 450, colors: ["French Navy", "Dark Grey"], sizes: SUIT_SIZES, path: "/p/jetsetter-wool-blazer" },
  { brandSlug: "bonobos", name: "Weekday Warrior Non-Iron Dress Pant", breadcrumb: "Men > Dress Pants", msrpDollars: 129, colors: ["Charcoal", "Navy", "Light Gray"], sizes: PANT_SIZES, path: "/p/weekday-warrior-dress-pant" },
  { brandSlug: "bonobos", name: "Daily Grind Wrinkle-Free Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 119, colors: ["Crisp White", "Light Blue"], sizes: ALPHA_SIZES, path: "/p/daily-grind-dress-shirt" },
  { brandSlug: "bonobos", name: "Italian Merino Quarter-Zip", breadcrumb: "Men > Sweaters", msrpDollars: 149, colors: ["Navy", "Heather Grey", "Burgundy"], sizes: ALPHA_SIZES, path: "/p/italian-merino-quarter-zip" },

  // Ralph Lauren
  { brandSlug: "ralph-lauren", name: "Estate-Rib Cotton Quarter-Zip Pullover", breadcrumb: "Men > Sweaters", msrpDollars: 138, colors: ["Navy", "Heather Grey", "Forest Green", "Camel"], sizes: ALPHA_SIZES, path: "/p/estate-rib-quarter-zip" },
  { brandSlug: "ralph-lauren", name: "Custom Slim Fit Mesh Pique Polo", breadcrumb: "Men > Polos", msrpDollars: 110, colors: ["Navy", "White", "Light Blue"], sizes: ALPHA_SIZES, path: "/p/custom-slim-mesh-polo" },
  { brandSlug: "ralph-lauren", name: "Classic Fit Oxford Cloth Button-Down Shirt", breadcrumb: "Men > Casual Shirts", msrpDollars: 125, colors: ["University Blue", "White", "Light Pink"], sizes: ALPHA_SIZES, path: "/p/classic-fit-ocbd" },
  { brandSlug: "ralph-lauren", name: "Polo Soft Wool Hopsack Blazer", breadcrumb: "Men > Sport Coats", msrpDollars: 698, colors: ["True Navy"], sizes: SUIT_SIZES, path: "/p/polo-soft-hopsack-blazer" },
  { brandSlug: "ralph-lauren", name: "Italian Wool Double-Breasted Overcoat", breadcrumb: "Men > Outerwear", msrpDollars: 998, colors: ["Charcoal", "Camel", "Navy"], sizes: SUIT_SIZES, path: "/p/italian-wool-overcoat" },
  { brandSlug: "ralph-lauren", name: "Calfskin Bridle Dress Belt", breadcrumb: "Men > Belts", msrpDollars: 125, colors: ["Dark Brown", "Black"], sizes: ["32", "34", "36", "38"], path: "/p/calfskin-dress-belt" },

  // J.Crew
  { brandSlug: "j-crew", name: "Ludlow Slim-Fit Italian Worsted Wool Suit", breadcrumb: "Men > Suits", msrpDollars: 698, colors: ["True Navy", "Dark Charcoal"], sizes: SUIT_SIZES, path: "/p/ludlow-italian-wool-suit" },
  { brandSlug: "j-crew", name: "770 Straight-Fit Stretch Chino", breadcrumb: "Men > Pants > Chinos", msrpDollars: 98, colors: ["British Khaki", "Navy", "Stone"], sizes: PANT_SIZES, path: "/p/770-stretch-chino" },
  { brandSlug: "j-crew", name: "Merino Wool Half-Zip Sweater", breadcrumb: "Men > Sweaters", msrpDollars: 118, colors: ["Charcoal", "Navy", "Forest Green"], sizes: ALPHA_SIZES, path: "/p/merino-wool-half-zip" },
  { brandSlug: "j-crew", name: "Bowery Slim-Fit Italian Wool Dress Pant", breadcrumb: "Men > Dress Pants", msrpDollars: 148, colors: ["Charcoal", "Dark Grey", "Navy"], sizes: PANT_SIZES, path: "/p/bowery-wool-dress-pant" },
  { brandSlug: "j-crew", name: "Ludlow Italian Wool Topcoat Overcoat", breadcrumb: "Men > Coats", msrpDollars: 498, colors: ["Camel", "Charcoal", "Navy"], sizes: SUIT_SIZES, path: "/p/ludlow-wool-overcoat" },
  { brandSlug: "j-crew", name: "Camden Leather Penny Loafer", breadcrumb: "Men > Shoes", msrpDollars: 248, colors: ["Dark Brown", "Black", "Burgundy"], sizes: SHOE_SIZES, path: "/p/camden-penny-loafer" },

  // Charles Tyrwhitt
  { brandSlug: "charles-tyrwhitt", name: "Non-Iron Twill Spread Collar Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 119, colors: ["Crisp White", "Sky Blue"], sizes: SHIRT_SIZES, path: "/p/non-iron-twill-dress-shirt" },
  { brandSlug: "charles-tyrwhitt", name: "Non-Iron Poplin Formal Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 119, colors: ["White", "Light Blue"], sizes: SHIRT_SIZES, path: "/p/non-iron-poplin-dress-shirt" },
  { brandSlug: "charles-tyrwhitt", name: "Merino Zip-Neck Quarter-Zip Sweater", breadcrumb: "Men > Knitwear", msrpDollars: 139, colors: ["Navy", "Charcoal", "Burgundy"], sizes: ALPHA_SIZES, path: "/p/merino-quarter-zip-sweater" },
  { brandSlug: "charles-tyrwhitt", name: "Goodyear Welted Cap-Toe Oxford", breadcrumb: "Men > Shoes", msrpDollars: 299, colors: ["Black", "Espresso"], sizes: SHOE_SIZES, path: "/p/goodyear-welted-cap-toe-oxford" },
  { brandSlug: "charles-tyrwhitt", name: "Goodyear Welted Calfskin Penny Loafer", breadcrumb: "Men > Shoes", msrpDollars: 279, colors: ["Dark Brown", "Black"], sizes: SHOE_SIZES, path: "/p/goodyear-welted-penny-loafer" },
  { brandSlug: "charles-tyrwhitt", name: "Pure Silk Twill Tie", breadcrumb: "Men > Ties", msrpDollars: 79, colors: ["Navy", "Burgundy", "Light Blue"], sizes: ["One Size"], path: "/p/pure-silk-twill-tie" },

  // Banana Republic
  { brandSlug: "banana-republic", name: "Rapid Movement Chino", breadcrumb: "Men > Pants > Chinos", msrpDollars: 100, colors: ["Khaki", "Navy", "Charcoal", "Stone"], sizes: PANT_SIZES, path: "/p/rapid-movement-chino" },
  { brandSlug: "banana-republic", name: "Italian Wool Dress Pant", breadcrumb: "Men > Tailoring > Pants", msrpDollars: 160, colors: ["Charcoal", "Navy", "Light Gray"], sizes: PANT_SIZES, path: "/p/italian-wool-dress-pant" },
  { brandSlug: "banana-republic", name: "Italian Double-Faced Wool Overcoat", breadcrumb: "Men > Outerwear", msrpDollars: 450, colors: ["Camel", "Charcoal", "Navy"], sizes: ALPHA_SIZES, path: "/p/italian-wool-overcoat" },
  { brandSlug: "banana-republic", name: "Luxury-Touch Pique Polo", breadcrumb: "Men > Polos", msrpDollars: 65, colors: ["Navy", "White", "Olive"], sizes: ALPHA_SIZES, path: "/p/luxury-touch-polo" },
  { brandSlug: "banana-republic", name: "Italian Merino Quarter-Zip Pullover", breadcrumb: "Men > Sweaters", msrpDollars: 120, colors: ["Navy", "Oatmeal", "Charcoal"], sizes: ALPHA_SIZES, path: "/p/italian-merino-quarter-zip" },

  // Todd Snyder
  { brandSlug: "todd-snyder", name: "Sutton Italian Tropical Wool Suit", breadcrumb: "Men > Tailoring > Suits", msrpDollars: 1196, colors: ["True Navy", "Charcoal"], sizes: SUIT_SIZES, path: "/p/sutton-tropical-wool-suit" },
  { brandSlug: "todd-snyder", name: "Italian Merino Full-Placket Knit Polo", breadcrumb: "Men > Sweaters > Polos", msrpDollars: 248, colors: ["Navy", "Camel", "Forest Green"], sizes: ALPHA_SIZES, path: "/p/merino-knit-polo" },
  { brandSlug: "todd-snyder", name: "Madison Italian Calfskin Penny Loafer", breadcrumb: "Men > Shoes", msrpDollars: 428, colors: ["Dark Brown", "Black", "Burgundy"], sizes: SHOE_SIZES, path: "/p/madison-penny-loafer" },
  { brandSlug: "todd-snyder", name: "Sutton Navy Hopsack Sport Coat", breadcrumb: "Men > Tailoring", msrpDollars: 798, colors: ["French Navy"], sizes: SUIT_SIZES, path: "/p/sutton-hopsack-sport-coat" },
  { brandSlug: "todd-snyder", name: "Italian Cashmere-Merino Half-Zip", breadcrumb: "Men > Sweaters", msrpDollars: 298, colors: ["Oatmeal", "Charcoal", "Navy"], sizes: ALPHA_SIZES, path: "/p/cashmere-merino-half-zip" },

  // Suitsupply
  { brandSlug: "suitsupply", name: "Napoli Navy Super 110s Wool Suit", breadcrumb: "Men > Suits", msrpDollars: 599, colors: ["True Navy"], sizes: SUIT_SIZES, path: "/p/napoli-navy-wool-suit" },
  { brandSlug: "suitsupply", name: "Perennial Charcoal Worsted Wool Suit", breadcrumb: "Men > Suits", msrpDollars: 599, colors: ["Dark Charcoal"], sizes: SUIT_SIZES, path: "/p/perennial-charcoal-suit" },
  { brandSlug: "suitsupply", name: "Havana Navy Hopsack Blazer", breadcrumb: "Men > Jackets", msrpDollars: 449, colors: ["French Navy"], sizes: SUIT_SIZES, path: "/p/havana-hopsack-blazer" },
  { brandSlug: "suitsupply", name: "Brescia Flat-Front Wool Dress Trouser", breadcrumb: "Men > Trousers", msrpDollars: 179, colors: ["Dark Grey", "Navy", "Stone"], sizes: PANT_SIZES, path: "/p/brescia-wool-trouser" },
  { brandSlug: "suitsupply", name: "Calfskin Double Monk Strap Dress Shoe", breadcrumb: "Men > Shoes", msrpDollars: 299, colors: ["Dark Brown", "Black"], sizes: SHOE_SIZES, path: "/p/calfskin-monk-strap" },
  { brandSlug: "suitsupply", name: "Pure White Linen Pocket Square", breadcrumb: "Men > Accessories", msrpDollars: 45, colors: ["Crisp White"], sizes: ["One Size"], path: "/p/white-linen-pocket-square" },

  // Spier & Mackay
  { brandSlug: "spier-mackay", name: "Core Navy VBC Super 110s Wool Suit", breadcrumb: "Men > Suits", msrpDollars: 448, colors: ["True Navy", "Dark Charcoal"], sizes: SUIT_SIZES, path: "/p/core-navy-vbc-suit" },
  { brandSlug: "spier-mackay", name: "High-Rise VBC Wool Flannel Trouser", breadcrumb: "Men > Trousers", msrpDollars: 168, colors: ["Charcoal", "Light Gray", "Navy"], sizes: PANT_SIZES, path: "/p/high-rise-flannel-trouser" },
  { brandSlug: "spier-mackay", name: "Neapolitan Navy Hopsack Sport Coat", breadcrumb: "Men > Sport Coats", msrpDollars: 378, colors: ["French Navy"], sizes: SUIT_SIZES, path: "/p/neapolitan-hopsack-sport-coat" },
  { brandSlug: "spier-mackay", name: "Garza Grossa Grenadine Tie", breadcrumb: "Men > Ties", msrpDollars: 68, colors: ["Navy", "Burgundy", "Forest Green"], sizes: ["One Size"], path: "/p/garza-grossa-grenadine-tie" },
  { brandSlug: "spier-mackay", name: "Fine Twill Non-Iron Dress Shirt", breadcrumb: "Men > Dress Shirts", msrpDollars: 68, colors: ["White", "Sky Blue"], sizes: SHIRT_SIZES, path: "/p/fine-twill-dress-shirt" },
  { brandSlug: "spier-mackay", name: "Goodyear Welted Cap-Toe Oxford", breadcrumb: "Men > Footwear", msrpDollars: 278, colors: ["Black", "Dark Brown"], sizes: SHOE_SIZES, path: "/p/goodyear-welted-oxford" },

  // Public Rec
  { brandSlug: "public-rec", name: "Workday Performance Commuter Pant", breadcrumb: "Men > Pants", msrpDollars: 138, colors: ["Navy", "Charcoal", "Stone", "Khaki"], sizes: PANT_SIZES, path: "/p/workday-pant" },
  { brandSlug: "public-rec", name: "Gamechanger Performance Polo", breadcrumb: "Men > Polos", msrpDollars: 88, colors: ["Navy", "White", "Slate"], sizes: ALPHA_SIZES, path: "/p/gamechanger-polo" },
  { brandSlug: "public-rec", name: "All Day Every Day Commuter Pant", breadcrumb: "Men > Pants", msrpDollars: 118, colors: ["Dark Navy", "Charcoal"], sizes: PANT_SIZES, path: "/p/aded-commuter-pant" },
  { brandSlug: "public-rec", name: "Crosstown Quarter-Zip Pullover", breadcrumb: "Men > Tops", msrpDollars: 118, colors: ["Navy", "Heather Grey", "Black"], sizes: ALPHA_SIZES, path: "/p/crosstown-quarter-zip" },
  { brandSlug: "public-rec", name: "Dealmaker Stretch Travel Trouser", breadcrumb: "Men > Pants", msrpDollars: 148, colors: ["Charcoal", "Navy"], sizes: PANT_SIZES, path: "/p/dealmaker-travel-trouser" },
];

const EDITION_VARIANTS: Array<{ suffix: string; priceFactor: number; colorShift: string }> = [
  { suffix: "Classic Edition", priceFactor: 1.0, colorShift: "Navy" },
  { suffix: "Seasonal Archive", priceFactor: 0.96, colorShift: "Charcoal" },
  { suffix: "Lightweight Edition", priceFactor: 1.04, colorShift: "Light Blue" },
];

type PriceRegime =
  | "lowest_90d"
  | "real_deal"
  | "below_median"
  | "fake_sale"
  | "tracking_new"
  | "full_price";

function buildRegimeSnapshots(
  msrpCents: number,
  regime: PriceRegime,
  rng: () => number,
  asOf: Date
): { snapshots: PriceSnapshotPoint[]; currentPriceCents: number; inStock: boolean } {
  const dayMs = 86_400_000;
  const ago = (d: number) => new Date(asOf.getTime() - d * dayMs);
  const roundDollar = (cents: number) => Math.max(1500, Math.round(cents / 100) * 100);

  if (regime === "lowest_90d") {
    const baseline = roundDollar(msrpCents * (0.9 + rng() * 0.1));
    const priorPromo = roundDollar(baseline * (0.82 + rng() * 0.06));
    const current = roundDollar(baseline * (0.62 + rng() * 0.13));
    const dropDaysAgo = Math.floor(rng() * 5);
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: baseline, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(88) },
      { priceCents: priorPromo, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(55) },
      { priceCents: baseline, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(46) },
      { priceCents: current, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(dropDaysAgo) },
    ];
    return { snapshots, currentPriceCents: current, inStock: true };
  }

  if (regime === "real_deal") {
    const baseline = roundDollar(msrpCents * (0.92 + rng() * 0.08));
    const briefFlashLow = roundDollar(baseline * 0.65);
    const current = roundDollar(baseline * (0.74 + rng() * 0.09));
    const dropDaysAgo = 1 + Math.floor(rng() * 10);
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: baseline, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(84) },
      { priceCents: briefFlashLow, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(48) },
      { priceCents: baseline, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(43) },
      { priceCents: current, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(dropDaysAgo) },
    ];
    return { snapshots, currentPriceCents: current, inStock: true };
  }

  if (regime === "below_median") {
    const baseline = roundDollar(msrpCents * (0.94 + rng() * 0.06));
    const current = roundDollar(baseline * (0.86 + rng() * 0.035));
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: baseline, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(76) },
      { priceCents: current, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(4 + Math.floor(rng() * 8)) },
    ];
    return { snapshots, currentPriceCents: current, inStock: true };
  }

  if (regime === "fake_sale") {
    const streetMedian = roundDollar(msrpCents * (0.64 + rng() * 0.1));
    const current = roundDollar(streetMedian * (0.95 + rng() * 0.06));
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: streetMedian, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(86) },
      { priceCents: roundDollar(streetMedian * 1.04), originalPriceCents: msrpCents, inStock: true, capturedAt: ago(38) },
      { priceCents: current, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(5) },
    ];
    return { snapshots, currentPriceCents: current, inStock: true };
  }

  if (regime === "tracking_new") {
    const daysTracked = 4 + Math.floor(rng() * 14);
    const startPrice = roundDollar(msrpCents * 0.95);
    const current = roundDollar(msrpCents * (0.72 + rng() * 0.12));
    const snapshots: PriceSnapshotPoint[] = [
      { priceCents: startPrice, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(daysTracked) },
      { priceCents: current, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(Math.max(1, Math.floor(daysTracked / 3))) },
    ];
    return { snapshots, currentPriceCents: current, inStock: true };
  }

  const inStock = rng() > 0.25;
  const snapshots: PriceSnapshotPoint[] = [
    { priceCents: msrpCents, originalPriceCents: msrpCents, inStock: true, capturedAt: ago(80) },
    { priceCents: msrpCents, originalPriceCents: msrpCents, inStock, capturedAt: ago(2) },
  ];
  return { snapshots, currentPriceCents: msrpCents, inStock };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const REGIME_DISTRIBUTION: PriceRegime[] = [
  "lowest_90d",
  "lowest_90d",
  "lowest_90d",
  "real_deal",
  "real_deal",
  "real_deal",
  "real_deal",
  "below_median",
  "below_median",
  "fake_sale",
  "fake_sale",
  "tracking_new",
  "full_price",
];

export function generateSeedCatalog(asOf = new Date("2026-11-26T17:30:00Z")): SeededProductRecord[] {
  const rng = createRng(20261126);
  const brandLookup = Object.fromEntries(BRANDS.map((b) => [b.slug, b]));
  const items: SeededProductRecord[] = [];

  let seq = 1;
  for (const base of BASE_CATALOG_TEMPLATES) {
    const brand = brandLookup[base.brandSlug];
    if (!brand) continue;

    const variantCount = seq % 3 === 0 ? 3 : 2;

    for (let v = 0; v < variantCount; v++) {
      const variant = EDITION_VARIANTS[v];
      const title = v === 0 ? base.name : `${base.name} — ${variant.suffix}`;
      const msrpCents = Math.round((base.msrpDollars * variant.priceFactor) / 5) * 500;
      const regime = REGIME_DISTRIBUTION[Math.floor(rng() * REGIME_DISTRIBUTION.length)];

      const { snapshots, currentPriceCents, inStock } = buildRegimeSnapshots(
        msrpCents,
        regime,
        rng,
        asOf
      );

      const sizeSubset = inStock
        ? base.sizes.filter((_, idx) => idx === 0 || rng() > 0.22)
        : [];

      const rawColors =
        v === 0 ? base.colors : Array.from(new Set([variant.colorShift, ...base.colors.slice(0, 2)]));

      const classified = classifyProduct({
        title,
        breadcrumb: base.breadcrumb,
        brandSlug: brand.slug,
        colors: rawColors,
        sizes: sizeSubset,
      });

      const evaluation = evaluateProductDeal({
        currentPriceCents,
        originalPriceCents: msrpCents,
        inStock,
        availableSizesCount: classified.normalizedSizes.length,
        snapshots,
        asOf,
      });

      const id = `tt-${String(seq).padStart(4, "0")}`;
      const slug = `${brand.slug}-${slugify(title)}-${seq}`;
      const productUrl = `${brand.baseUrl}${base.path}${v > 0 ? `?edition=${v + 1}` : ""}`;
      const outbound = validateAndBuildOutboundUrl(brand.slug, productUrl);
      const checkedMinutesAgo = 18 + Math.floor(rng() * 195);
      const lastCheckedAt = new Date(asOf.getTime() - checkedMinutesAgo * 60_000);

      items.push({
        id,
        brandSlug: brand.slug,
        brandName: brand.name,
        brandCode: brand.code,
        brandSwatchHex: brand.swatchHex,
        externalId: `${brand.code}-${1000 + seq}`,
        slug,
        name: title,
        rawBreadcrumb: base.breadcrumb,
        dataSource: "demo",
        category: classified.category,
        subcategory: classified.subcategory,
        occasions: classified.occasions,
        colors: classified.normalizedColors,
        sizes: classified.normalizedSizes,
        matchedRuleId: classified.matchedRuleId,
        classificationStatus: classified.status,
        currentPriceCents: evaluation.currentPriceCents,
        originalPriceCents: evaluation.originalPriceCents,
        currency: "USD",
        productUrl,
        affiliateUrl: outbound.ok && outbound.isAffiliate ? outbound.url : null,
        imageUrl: null,
        inStock,
        dataNote: evaluation.dataNote,
        firstSeenAt: snapshots[0].capturedAt,
        lastSeenAt: lastCheckedAt,
        lastCheckedAt,
        median30dCents: evaluation.median30dCents,
        median90dCents: evaluation.median90dCents,
        low90dCents: evaluation.low90dCents,
        allTimeLowCents: evaluation.allTimeLowCents,
        timesAtOrBelowCurrent: evaluation.timesAtOrBelowCurrent,
        lastPriceChangeCents: evaluation.lastPriceChangeCents,
        lastPriceChangeAt: evaluation.lastPriceChangeAt,
        pctBelowMedian: evaluation.pctBelowMedian,
        pctBelowOriginal: evaluation.pctBelowOriginal,
        historyDays: evaluation.historyDays,
        dealLabel: evaluation.dealLabel,
        dealScore: evaluation.dealScore,
        dealScoreBreakdown: evaluation.dealScoreBreakdown,
        dealBlurb: evaluation.dealBlurb,
        snapshots,
      });

      seq += 1;
    }
  }

  const unclassifiedSamples = [
    { brandSlug: "brooks-brothers", name: "Aromatic Cedar Shoe Tree Set", breadcrumb: "Men > Footwear Care", msrpDollars: 45, path: "/p/cedar-shoe-trees" },
    { brandSlug: "peter-millar", name: "Leather Passport & Card Holder", breadcrumb: "Men > Travel Accessories", msrpDollars: 115, path: "/p/leather-passport-holder" },
    { brandSlug: "suitsupply", name: "Canvas Suit Garment Bag", breadcrumb: "Men > Luggage", msrpDollars: 149, path: "/p/canvas-garment-bag" },
  ];

  for (const sample of unclassifiedSamples) {
    const brand = brandLookup[sample.brandSlug];
    if (!brand) continue;
    const msrpCents = sample.msrpDollars * 100;
    const { snapshots, currentPriceCents } = buildRegimeSnapshots(msrpCents, "real_deal", rng, asOf);
    const classified = classifyProduct({
      title: sample.name,
      breadcrumb: sample.breadcrumb,
      brandSlug: brand.slug,
      colors: ["Brown"],
      sizes: ["One Size"],
    });
    const evaluation = evaluateProductDeal({
      currentPriceCents,
      originalPriceCents: msrpCents,
      inStock: true,
      availableSizesCount: 1,
      snapshots,
      asOf,
    });
    const id = `tt-${String(seq).padStart(4, "0")}`;
    items.push({
      id,
      brandSlug: brand.slug,
      brandName: brand.name,
      brandCode: brand.code,
      brandSwatchHex: brand.swatchHex,
      externalId: `${brand.code}-${1000 + seq}`,
      slug: `${brand.slug}-${slugify(sample.name)}-${seq}`,
      name: sample.name,
      rawBreadcrumb: sample.breadcrumb,
      dataSource: "demo",
      category: classified.category,
      subcategory: classified.subcategory,
      occasions: classified.occasions,
      colors: classified.normalizedColors,
      sizes: classified.normalizedSizes,
      matchedRuleId: classified.matchedRuleId,
      classificationStatus: classified.status,
      currentPriceCents: evaluation.currentPriceCents,
      originalPriceCents: evaluation.originalPriceCents,
      currency: "USD",
      productUrl: `${brand.baseUrl}${sample.path}`,
      affiliateUrl: null,
      imageUrl: null,
      inStock: true,
      dataNote: evaluation.dataNote,
      firstSeenAt: snapshots[0].capturedAt,
      lastSeenAt: asOf,
      lastCheckedAt: asOf,
      median30dCents: evaluation.median30dCents,
      median90dCents: evaluation.median90dCents,
      low90dCents: evaluation.low90dCents,
      allTimeLowCents: evaluation.allTimeLowCents,
      timesAtOrBelowCurrent: evaluation.timesAtOrBelowCurrent,
      lastPriceChangeCents: evaluation.lastPriceChangeCents,
      lastPriceChangeAt: evaluation.lastPriceChangeAt,
      pctBelowMedian: evaluation.pctBelowMedian,
      pctBelowOriginal: evaluation.pctBelowOriginal,
      historyDays: evaluation.historyDays,
      dealLabel: evaluation.dealLabel,
      dealScore: evaluation.dealScore,
      dealScoreBreakdown: evaluation.dealScoreBreakdown,
      dealBlurb: evaluation.dealBlurb,
      snapshots,
    });
    seq += 1;
  }

  return items;
}
