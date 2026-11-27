import {
  OUT_OF_SCOPE_CATEGORY,
  type AllCategorySlug,
  type CategorySlug,
  type OccasionTag,
} from "@config/categories";
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
          normalizedColors,
          normalizedSizes,
          matchedRuleId: rule.id,
          status: "out_of_scope",
        };
      }
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        occasions: deriveOccasions(rule.category, rule.subcategory, haystack),
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
    normalizedColors,
    normalizedSizes,
    matchedRuleId: null,
    status: "unclassified",
  };
}
