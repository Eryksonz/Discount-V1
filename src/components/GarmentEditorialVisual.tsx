import Image from "next/image";

interface GarmentEditorialVisualProps {
  imageUrl: string | null;
  name: string;
  brandCode: string;
  brandSwatchHex: string;
  category: string | null;
  subcategory: string | null;
  colors: string[];
  inStock: boolean;
  tall?: boolean;
}

const COLOR_DOT_HEX: Record<string, string> = {
  Navy: "#162A47",
  "Light Blue": "#8BB5D9",
  Blue: "#2B5B9E",
  Slate: "#5A6E7F",
  White: "#FFFFFF",
  Cream: "#F2ECE1",
  Stone: "#CFC6B8",
  Oatmeal: "#D6CBB8",
  Gray: "#8B939C",
  "Light Gray": "#C5CBD2",
  Charcoal: "#343B43",
  Black: "#181A1C",
  Khaki: "#BBA482",
  Tan: "#B68F62",
  Camel: "#B88A52",
  Cognac: "#8E4B22",
  Brown: "#6B442A",
  "Dark Brown": "#3D2619",
  "Forest Green": "#1B4332",
  Olive: "#556241",
  Sage: "#8B9D8B",
  Burgundy: "#631D2A",
  "Light Pink": "#E8C5CC",
  Lavender: "#C6BCD6",
};

function CategorySilhouette({ category }: { category: string | null }) {
  switch (category) {
    case "quarter-zips-pullovers":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M28 16 L40 12 L52 16 L66 26 L60 44 L54 41 L54 66 L26 66 L26 41 L20 44 L14 26 Z" />
          <path d="M34 15 L40 24 L46 15" />
          <line x1="40" y1="24" x2="40" y2="38" strokeWidth="1.8" />
        </svg>
      );
    case "polos":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M30 16 L40 13 L50 16 L65 26 L58 39 L53 36 L53 66 L27 66 L27 36 L22 39 L15 26 Z" />
          <path d="M33 15 L40 23 L47 15" />
          <line x1="40" y1="23" x2="40" y2="33" />
          <circle cx="40" cy="27" r="1" fill="currentColor" />
          <circle cx="40" cy="31" r="1" fill="currentColor" />
        </svg>
      );
    case "dress-shirts-ocbds":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M30 15 L40 12 L50 15 L66 25 L62 56 L55 56 L54 34 L54 67 L26 67 L26 34 L25 56 L18 56 L14 25 Z" />
          <path d="M32 14 L40 23 L48 14" />
          <line x1="40" y1="23" x2="40" y2="67" strokeDasharray="1 5" strokeWidth="1.8" />
        </svg>
      );
    case "chinos-dress-pants":
    case "performance-trousers":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M25 14 L55 14 L58 67 L44 67 L40 35 L36 67 L22 67 Z" />
          <line x1="25" y1="20" x2="55" y2="20" />
          <line x1="40" y1="14" x2="40" y2="28" />
        </svg>
      );
    case "blazers-sport-coats":
    case "suits":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M28 14 L40 28 L52 14 L66 24 L62 58 L55 58 L54 34 L56 67 L24 67 L26 34 L25 58 L18 58 L14 24 Z" />
          <path d="M31 16 L36 38 L40 42 L44 38 L49 16" />
          <line x1="40" y1="42" x2="40" y2="67" />
          <circle cx="40" cy="48" r="1.2" fill="currentColor" />
          <circle cx="40" cy="56" r="1.2" fill="currentColor" />
        </svg>
      );
    case "ties-pocket-squares":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M34 14 L46 14 L43 22 L47 58 L40 67 L33 58 L37 22 Z" />
          <line x1="35" y1="34" x2="45" y2="29" />
          <line x1="34" y1="46" x2="46" y2="41" />
        </svg>
      );
    case "shoes-belts":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M16 48 L22 30 L34 34 L46 42 C58 43 65 46 65 52 L65 55 L16 55 Z" />
          <line x1="16" y1="52" x2="65" y2="52" />
          <path d="M35 39 L44 43" />
        </svg>
      );
    case "outerwear":
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/75" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M29 14 L40 18 L51 14 L57 24 L54 34 L55 66 L25 66 L26 34 L23 24 Z" />
          <line x1="40" y1="18" x2="40" y2="66" />
          <line x1="26" y1="36" x2="54" y2="36" strokeDasharray="2 3" />
          <line x1="26" y1="49" x2="54" y2="49" strokeDasharray="2 3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 80 80" className="w-14 h-14 text-[#0F1D32]/65" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="20" y="20" width="40" height="40" rx="4" />
          <line x1="20" y1="34" x2="60" y2="34" />
        </svg>
      );
  }
}

export function GarmentEditorialVisual({
  imageUrl,
  name,
  brandCode,
  brandSwatchHex,
  category,
  subcategory,
  colors,
  inStock,
  tall = false,
}: GarmentEditorialVisualProps) {
  if (imageUrl) {
    return (
      <div
        className={`relative ${tall ? "h-80" : "h-36"} w-full overflow-hidden rounded-md border border-[#E6E0D4] bg-[#F5F2EB]`}
      >
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={tall ? "(max-width: 1024px) 100vw, 360px" : "(max-width: 768px) 100vw, 320px"}
          className="object-cover object-center"
        />
        {!inStock && (
          <span className="absolute top-2 right-2 rounded bg-[#0F1D32]/85 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-white">
            Out of Stock
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative ${tall ? "h-64" : "h-32"} w-full overflow-hidden rounded-md border border-[#E6E0D4] flex flex-col justify-between p-3`}
      style={{
        backgroundColor: "#F5F1E8",
        borderTopWidth: "3px",
        borderTopColor: brandSwatchHex,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C6776]">
          {subcategory ?? "Menswear"}
        </span>
        {!inStock ? (
          <span className="rounded bg-[#8C3426] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-white">
            Out of Stock
          </span>
        ) : (
          <span className="font-mono text-[10px] font-semibold tracking-widest text-[#0F1D32]/35">
            {brandCode}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center -my-2">
        <CategorySilhouette category={category} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {colors.slice(0, 4).map((color) => (
            <span
              key={color}
              title={color}
              className="h-3 w-3 rounded-full border border-[#0F1D32]/25 shadow-xs"
              style={{ backgroundColor: COLOR_DOT_HEX[color] ?? "#7C8794" }}
            />
          ))}
          {colors.length > 0 && (
            <span className="font-mono text-[10px] text-[#5C6776] truncate max-w-[110px]">
              {colors[0]}
              {colors.length > 1 ? ` +${colors.length - 1}` : ""}
            </span>
          )}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#7A8490]">
          Direct Retail
        </span>
      </div>
    </div>
  );
}
