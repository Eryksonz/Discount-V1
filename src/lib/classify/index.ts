import {
  OUT_OF_SCOPE_CATEGORY,
  type AllCategorySlug,
  type CategorySlug,
  type OccasionTag,
} from "@config/categories";
import { FORMALITY_RANK, type FormalityLevel } from "@config/kit-rules";
import {
  CATEGORY_RULES,
  COLOR_NORMALIZATION_MAP,
  OCCASION_BY_CATEGORY,
  OUT_OF_SCOPE_RULES,
  type CategoryRule,
} from "./rules";

export interface ClassificationInput {
  title: string;
  breadcrumb?: string;
  brandSlug?: string;
  colors?: string[];
  sizes?: string[];
}

export interface ClassificationResult {
  category: AllCategorySlug | null;
  subcategory: string | null;
  occasions: OccasionTag[];
  formality: FormalityLevel;
  formalityScore: number;
  normalizedColors: string[];
  normalizedSizes: string[];
  matchedRuleId: string | null;
  status: "classified" | "out_of_scope" | "unclassified";
}

export interface CustomRuleDefinition {
  ruleId: string;
  category: AllCategorySlug;
  subcategory: string;
  keywords: string[];
  regexPattern?: string | null;
  brandSlug?: string | null;
  priority?: number;
}

const ALPHA_SIZE_MAP: Record<string, string> = {
  "extra small": "XS",
  "x-small": "XS",
  xs: "XS",
  small: "S",
  s: "S",
  medium: "M",
  med: "M",
  m: "M",
  large: "L",
  lg: "L",
  l: "L",
  "extra large": "XL",
  "x-large": "XL",
  xl: "XL",
  "xx-large": "XXL",
  "2xl": "XXL",
  xxl: "XXL",
  "3xl": "XXXL",
  "one size": "OS",
  os: "OS",
  osfa: "OS",
};

export function normalizeColor(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (COLOR_NORMALIZATION_MAP[cleaned]) {
    return COLOR_NORMALIZATION_MAP[cleaned];
  }
  for (const [key, canonical] of Object.entries(COLOR_NORMALIZATION_MAP)) {
    if (cleaned.includes(key)) {
      return canonical;
    }
  }
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function normalizeSize(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();

  if (ALPHA_SIZE_MAP[lower]) {
    return ALPHA_SIZE_MAP[lower];
  }

  const waistInseam = lower.match(/^(\d{2})\s*w?\s*[x/]\s*(\d{2})\s*l?$/);
  if (waistInseam) {
    return `${waistInseam[1]}x${waistInseam[2]}`;
  }

  const neckSleeve = lower.match(/^(\d{2}(?:\.5)?)\s*[-/ ]\s*(\d{2}(?:\/\d{2})?)$/);
  if (neckSleeve) {
    return `${neckSleeve[1]}/${neckSleeve[2]}`;
  }

  const suitSize = lower.match(/^(\d{2})\s*([srl])$/);
  if (suitSize) {
    return `${suitSize[1]}${suitSize[2].toUpperCase()}`;
  }

  const shoeSize = lower.match(/^(\d{1,2}(?:\.5)?)\s*([de]{1,2})?$/);
  if (shoeSize) {
    return shoeSize[2] ? `${shoeSize[1]}${shoeSize[2].toUpperCase()}` : shoeSize[1];
  }

  return cleaned.toUpperCase();
}

function deriveOccasions(
  category: CategorySlug,
  subcategory: string,
  haystack: string
): OccasionTag[] {
  const tags = new Set<OccasionTag>(OCCASION_BY_CATEGORY[category] ?? []);

  if (subcategory === "Wool Dress Pant" || subcategory === "Flannel Trouser") {
    tags.add("Interview");
    tags.add("Superday");
  }
  if (subcategory === "Knit Blazer" || /\b(unstructured|linen)\b/i.test(haystack)) {
    tags.delete("Superday");
    tags.add("Summer internship");
  }
  if (
    subcategory === "OCBD" ||
    subcategory === "Twill Shirt" ||
    subcategory === "Casual Button-Down"
  ) {
    tags.delete("Superday");
    if (subcategory === "Casual Button-Down") {
      tags.delete("Interview");
    }
  }
  if (subcategory === "Penny Loafer" && /\b(suede|driving)\b/i.test(haystack)) {
    tags.delete("Interview");
    tags.delete("Superday");
    tags.add("Summer internship");
  }
  if (/\b(lightweight|breathable|summer|moisture[- ]?wicking)\b/i.test(haystack)) {
    tags.add("Summer internship");
  }

  return Array.from(tags);
}

function compileCustomRules(customRules: CustomRuleDefinition[] = []): CategoryRule[] {
  return customRules.map((rule) => {
    let pattern: RegExp;
    if (rule.regexPattern) {
      pattern = new RegExp(rule.regexPattern, "i");
    } else {
      const escaped = rule.keywords
        .map((kw) => kw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .filter(Boolean);
      pattern = escaped.length > 0 ? new RegExp(`\\b(${escaped.join("|")})\\b`, "i") : /$^/;
    }
    return {
      id: rule.ruleId,
      category: rule.category,
      subcategory: rule.subcategory,
      pattern,
      brandSlugs: rule.brandSlug ? [rule.brandSlug] : undefined,
      priority: rule.priority ?? 0, // Admin custom rules take top priority
    };
  });
}

/**
 * Deterministic formality tier derived purely from classified category, subcategory, and title tokens:
 *  - high (3): suits, structured blazers, dress shirts/OCBDs, wool/flannel dress trousers, ties, leather dress shoes & dress belts
 *  - medium (2): chinos, performance/commuter trousers, polos, quarter-zips/sweaters, casual button-downs, knit/unstructured blazers, canvas/bungee belts, suede loafers
 *  - low (1): out_of_scope or unclassified items
 */
export function deriveProductFormality(input: {
  category: string | null | undefined;
  subcategory?: string | null;
  title?: string;
}): { formality: FormalityLevel; formalityScore: number } {
  const cat = input.category;
  const sub = (input.subcategory ?? "").trim();
  const title = (input.title ?? "").toLowerCase();

  if (!cat || cat === OUT_OF_SCOPE_CATEGORY) {
    return { formality: "low", formalityScore: FORMALITY_RANK.low };
  }

  if (cat === "suits" || cat === "ties-pocket-squares") {
    return { formality: "high", formalityScore: FORMALITY_RANK.high };
  }

  if (cat === "blazers-sport-coats") {
    if (
      sub === "Knit Blazer" ||
      sub === "Unstructured Blazer" ||
      /\b(knit|unstructured|chore|linen|jersey|sweatshirt)\b/i.test(title)
    ) {
      return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
    }
    return { formality: "high", formalityScore: FORMALITY_RANK.high };
  }

  if (cat === "dress-shirts-ocbds") {
    if (
      sub === "Casual Button-Down" ||
      /\b(short[- ]?sleeve|flannel|chambray|linen|camp|western|untucked)\b/i.test(title)
    ) {
      return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
    }
    return { formality: "high", formalityScore: FORMALITY_RANK.high };
  }

  if (cat === "chinos-dress-pants") {
    if (
      sub === "Wool Dress Pant" ||
      sub === "Flannel Trouser" ||
      /\b(dress\s+pant|dress\s+trouser|wool\s+(pant|trouser)|gabardine|suit\s+pant)\b/i.test(title)
    ) {
      return { formality: "high", formalityScore: FORMALITY_RANK.high };
    }
    return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
  }

  if (cat === "shoes-belts") {
    if (sub === "Oxford Dress Shoe" || sub === "Derby / Monk Strap") {
      return { formality: "high", formalityScore: FORMALITY_RANK.high };
    }
    if (sub === "Penny Loafer") {
      if (/\b(suede|driving|boat|canvas)\b/i.test(title)) {
        return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
      }
      return { formality: "high", formalityScore: FORMALITY_RANK.high };
    }
    if (sub === "Dress Belt") {
      if (/\b(bungee|canvas|club|woven|braided|webbing|elastic|stretch|needlepoint)\b/i.test(title)) {
        return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
      }
      return { formality: "high", formalityScore: FORMALITY_RANK.high };
    }
    return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
  }

  // polos, quarter-zips-pullovers, performance-trousers, outerwear -> medium
  return { formality: "medium", formalityScore: FORMALITY_RANK.medium };
}

export function classifyProduct(
  input: ClassificationInput,
  customRules: CustomRuleDefinition[] = []
): ClassificationResult {
  const haystack = `${input.title} ${input.breadcrumb ?? ""}`.trim();

  const normalizedColors = Array.from(
    new Set((input.colors ?? []).map(normalizeColor).filter(Boolean))
  );
  const normalizedSizes = Array.from(
    new Set((input.sizes ?? []).map(normalizeSize).filter(Boolean))
  );

  // Order: custom admin rules -> out_of_scope rules -> in-scope category rules
  const allRules = [
    ...compileCustomRules(customRules),
    ...OUT_OF_SCOPE_RULES,
    ...CATEGORY_RULES,
  ].sort((a, b) => a.priority - b.priority);

  for (const rule of allRules) {
    if (rule.brandSlugs && input.brandSlug && !rule.brandSlugs.includes(input.brandSlug)) {
      continue;
    }
    if (rule.exclude && rule.exclude.test(haystack)) {
      continue;
    }
    if (rule.pattern.test(haystack)) {
      if (rule.category === OUT_OF_SCOPE_CATEGORY) {
        return {
          category: OUT_OF_SCOPE_CATEGORY,
          subcategory: rule.subcategory,
          occasions: [],
          formality: "low",
          formalityScore: FORMALITY_RANK.low,
          normalizedColors,
          normalizedSizes,
          matchedRuleId: rule.id,
          status: "out_of_scope",
        };
      }
      const { formality, formalityScore } = deriveProductFormality({
        category: rule.category,
        subcategory: rule.subcategory,
        title: input.title,
      });
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        occasions: deriveOccasions(rule.category, rule.subcategory, haystack),
        formality,
        formalityScore,
        normalizedColors,
        normalizedSizes,
        matchedRuleId: rule.id,
        status: "classified",
      };
    }
  }

  return {
    category: null,
    subcategory: null,
    occasions: [],
    formality: "low",
    formalityScore: FORMALITY_RANK.low,
    normalizedColors,
    normalizedSizes,
    matchedRuleId: null,
    status: "unclassified",
  };
}
