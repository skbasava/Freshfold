import React from "react";

interface IconProps {
  className?: string;
}

/** Flaticon-style Colorful Washing Machine Icon (Wash & Fold) */
export function WashingMachineIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Machine Body */}
      <rect x="8" y="6" width="48" height="52" rx="8" fill="#0284C7" />
      <rect x="11" y="9" width="42" height="46" rx="6" fill="#F0F9FF" />
      {/* Top Control Panel */}
      <rect x="14" y="12" width="36" height="8" rx="3" fill="#E0F2FE" />
      <circle cx="20" cy="16" r="2.5" fill="#0284C7" />
      <circle cx="27" cy="16" r="2" fill="#38BDF8" />
      <rect x="33" y="14" width="13" height="4" rx="2" fill="#0369A1" />
      {/* Drum Outer Ring */}
      <circle cx="32" cy="37" r="16" fill="#BAE6FD" />
      <circle cx="32" cy="37" r="13" fill="#0284C7" />
      {/* Glass & Water */}
      <circle cx="32" cy="37" r="10.5" fill="#38BDF8" />
      <path
        d="M23 40C26 38 29 42 32 40C35 38 38 42 41 40V47.5H23V40Z"
        fill="#0284C7"
      />
      {/* Glass Glare */}
      <path
        d="M26 31C28 29 34 29 36 30"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Bubbles */}
      <circle cx="27" cy="36" r="1.5" fill="#FFFFFF" />
      <circle cx="36" cy="38" r="1.2" fill="#FFFFFF" />
      <circle cx="31" cy="33" r="1" fill="#FFFFFF" />
    </svg>
  );
}

/** Flaticon-style Colorful Steam Iron Icon (Wash & Iron) */
export function SteamIronIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Steam puffs */}
      <path
        d="M12 48C9 48 8 51 10 53C12 55 16 54 17 51"
        stroke="#60A5FA"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M20 52C18 52 18 55 20 57C22 58 25 57 26 54"
        stroke="#93C5FD"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Soleplate */}
      <path
        d="M12 44L48 44C54 44 57 41 57 41L48 37H12C10 37 9 40 10 42L12 44Z"
        fill="#64748B"
      />
      {/* Iron Main Body */}
      <path
        d="M13 37L48 37C53 37 56 33 52 26L45 18H28C22 18 16 22 13 37Z"
        fill="#2563EB"
      />
      <path
        d="M20 37L44 37C48 37 50 34 47 28L43 22H30C26 22 22 25 20 37Z"
        fill="#60A5FA"
      />
      {/* Handle */}
      <path
        d="M22 18V12C22 9 25 7 28 7H42C45 7 47 9 47 12V18"
        stroke="#1E40AF"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Water Tank Window */}
      <ellipse cx="34" cy="30" rx="5" ry="3" fill="#BFDBFE" />
    </svg>
  );
}

/** Flaticon-style Colorful Dry Clean Hanger & Suit Icon (Dry Clean) */
export function DryCleanIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Golden Hanger */}
      <path
        d="M32 10C34 10 36 12 36 14C36 16 34 18 32 18C30 18 29 16 29 15L32 18L14 26H50L32 18"
        stroke="#F59E0B"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Suit Coat */}
      <path
        d="M16 26L12 54C12 56 14 58 16 58H48C50 58 52 56 52 54L48 26H16Z"
        fill="#7C3AED"
      />
      {/* Lapels */}
      <path d="M16 26L26 44L28 26H16Z" fill="#5B21B6" />
      <path d="M48 26L38 44L36 26H48Z" fill="#5B21B6" />
      {/* Shirt & Red Tie */}
      <polygon points="28,26 36,26 32,38" fill="#F8FAFC" />
      <polygon points="31,28 33,28 34,35 32,39 30,35" fill="#EF4444" />
      {/* Gold Buttons */}
      <circle cx="32" cy="45" r="1.5" fill="#FBBF24" />
      <circle cx="32" cy="51" r="1.5" fill="#FBBF24" />
      {/* Clean sparkles */}
      <path
        d="M50 14L52 18L56 20L52 22L50 26L48 22L44 20L48 18L50 14Z"
        fill="#FBBF24"
      />
      <circle cx="12" cy="20" r="2" fill="#FBBF24" />
    </svg>
  );
}

/** Flaticon-style Colorful Steam Press / Ironing Board Icon (Steam Iron) */
export function SteamPressIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Heat / Steam rays */}
      <path d="M22 10L24 16M32 8L32 15M42 10L40 16" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      {/* Press Head / Iron */}
      <path
        d="M14 26C14 22 18 19 23 19H45C49 19 53 22 53 26L50 36H17L14 26Z"
        fill="#EA580C"
      />
      <rect x="18" y="22" width="28" height="6" rx="2" fill="#FDBA74" />
      {/* Plate */}
      <rect x="12" y="36" width="40" height="5" rx="2" fill="#475569" />
      {/* Fabric beneath */}
      <path d="M10 44C10 42 12 41 15 41H49C52 41 54 42 54 44L52 54C52 56 50 58 47 58H17C14 58 12 56 12 54L10 44Z" fill="#FBBF24" />
      <line x1="16" y1="49" x2="48" y2="49" stroke="#D97706" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  );
}

/** Flaticon-style Formal Buttoned Shirt */
export function ShirtGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Sleeves */}
      <path d="M8 20L20 14L22 28L12 36L8 20Z" fill="#2563EB" />
      <path d="M56 20L44 14L42 28L52 36L56 20Z" fill="#2563EB" />
      {/* Body */}
      <path
        d="M18 14H46L48 54C48 56 46 58 44 58H20C18 58 16 56 16 54L18 14Z"
        fill="#3B82F6"
      />
      {/* Pocket */}
      <rect x="34" y="26" width="9" height="10" rx="1.5" fill="#2563EB" />
      <path d="M34 29H43" stroke="#60A5FA" strokeWidth="1.5" />
      {/* Collar */}
      <path d="M22 14L32 24L26 14H22Z" fill="#1D4ED8" />
      <path d="M42 14L32 24L38 14H42Z" fill="#1D4ED8" />
      <polygon points="26,14 38,14 32,20" fill="#F8FAFC" />
      {/* Placket & Buttons */}
      <line x1="32" y1="20" x2="32" y2="58" stroke="#1D4ED8" strokeWidth="2" />
      <circle cx="32" cy="28" r="1.5" fill="#FFFFFF" />
      <circle cx="32" cy="38" r="1.5" fill="#FFFFFF" />
      <circle cx="32" cy="48" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}

/** Flaticon-style Casual T-Shirt */
export function TShirtGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Sleeves */}
      <path d="M6 24L18 14L22 26L12 33L6 24Z" fill="#0D9488" />
      <path d="M58 24L46 14L42 26L52 33L58 24Z" fill="#0D9488" />
      {/* Body */}
      <path
        d="M18 14H46L47 54C47 56 45 58 43 58H21C19 58 17 56 17 54L18 14Z"
        fill="#14B8A6"
      />
      {/* Crew Neck */}
      <path
        d="M26 14C26 18 38 18 38 14H46C46 14 40 22 24 22C18 22 18 14 18 14H26Z"
        fill="#0F766E"
      />
      {/* Modern graphic line */}
      <circle cx="32" cy="34" r="5" fill="#2DD4BF" opacity="0.6" />
    </svg>
  );
}

/** Flaticon-style Trousers / Jeans */
export function TrouserGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Waistband */}
      <rect x="18" y="10" width="28" height="6" rx="2" fill="#312E81" />
      <rect x="29" y="11" width="6" height="4" rx="1" fill="#F59E0B" />
      {/* Legs */}
      <path
        d="M18 16L21 56C21 57 23 58 24 58H28C29 58 31 57 31 56L32 30L33 56C33 57 35 58 36 58H40C41 58 43 57 43 56L46 16H18Z"
        fill="#4338CA"
      />
      {/* Crease & Pockets */}
      <path d="M22 19L27 23" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 19L37 23" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
      <line x1="25" y1="32" x2="25" y2="54" stroke="#3730A3" strokeWidth="1.5" />
      <line x1="39" y1="32" x2="39" y2="54" stroke="#3730A3" strokeWidth="1.5" />
    </svg>
  );
}

/** Flaticon-style Suit Blazer */
export function BlazerGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Sleeves */}
      <path d="M8 22L18 14L20 48L11 48L8 22Z" fill="#0F172A" />
      <path d="M56 22L46 14L44 48L53 48L56 22Z" fill="#0F172A" />
      {/* Jacket Body */}
      <path
        d="M18 14H46L48 55C48 57 46 58 44 58H20C18 58 16 57 16 55L18 14Z"
        fill="#1E293B"
      />
      {/* Shirt & Tie */}
      <polygon points="27,14 37,14 32,28" fill="#F8FAFC" />
      <polygon points="31,17 33,17 34,26 32,30 30,26" fill="#DC2626" />
      {/* Lapels */}
      <path d="M18 14L28 36H23L18 14Z" fill="#334155" />
      <path d="M46 14L36 36H41L46 14Z" fill="#334155" />
      {/* Gold Buttons */}
      <circle cx="32" cy="40" r="1.5" fill="#F59E0B" />
      <circle cx="32" cy="48" r="1.5" fill="#F59E0B" />
      {/* Pocket square */}
      <rect x="21" y="30" width="6" height="2" rx="0.5" fill="#FFFFFF" />
    </svg>
  );
}

/** Flaticon-style Saree / Traditional Ethnic Wear */
export function SareeGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Blouse */}
      <path d="M22 14L14 20L18 28L25 28L25 18L32 23L39 18L39 28L46 28L50 20L42 14H22Z" fill="#991B1B" />
      {/* Flowing Pleated Saree & Pallu */}
      <path
        d="M22 28L15 56C15 57 17 58 18 58H46C47 58 49 57 49 56L42 28H22Z"
        fill="#E11D48"
      />
      {/* Pallu Drape across chest */}
      <path d="M18 20L46 48L42 54L14 26L18 20Z" fill="#BE123C" />
      {/* Golden Zari Borders */}
      <path d="M18 56H46" stroke="#F59E0B" strokeWidth="3" />
      <path d="M18 20L46 48" stroke="#F59E0B" strokeWidth="2.5" />
      {/* Pleat Lines */}
      <line x1="28" y1="36" x2="27" y2="56" stroke="#FDA4AF" strokeWidth="1.5" />
      <line x1="34" y1="36" x2="33" y2="56" stroke="#FDA4AF" strokeWidth="1.5" />
      <line x1="40" y1="42" x2="39" y2="56" stroke="#FDA4AF" strokeWidth="1.5" />
    </svg>
  );
}

/** Flaticon-style Bedsheet / Quilt Linen */
export function BedLinenGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Pillow on top */}
      <rect x="20" y="10" width="24" height="12" rx="4" fill="#C4B5FD" />
      <rect x="23" y="12" width="18" height="8" rx="2" fill="#EDE9FE" />
      {/* Folded Quilt / Comforter Layers */}
      <rect x="12" y="24" width="40" height="10" rx="3" fill="#8B5CF6" />
      <rect x="14" y="26" width="36" height="6" rx="1.5" fill="#A78BFA" />
      <rect x="10" y="36" width="44" height="10" rx="3" fill="#6D28D9" />
      <rect x="12" y="38" width="40" height="6" rx="1.5" fill="#8B5CF6" />
      <rect x="8" y="48" width="48" height="10" rx="3" fill="#5B21B6" />
      <rect x="10" y="50" width="44" height="6" rx="1.5" fill="#7C3AED" />
    </svg>
  );
}

/** Flaticon-style Rolled Fluffy Towels */
export function TowelsGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Top Towel (Mint) */}
      <rect x="16" y="14" width="32" height="11" rx="5" fill="#34D399" />
      <circle cx="21" cy="19.5" r="3.5" fill="#10B981" />
      {/* Middle Towel (Teal) */}
      <rect x="12" y="28" width="40" height="12" rx="5" fill="#10B981" />
      <circle cx="18" cy="34" r="4" fill="#059669" />
      {/* Bottom Towel (Emerald) */}
      <rect x="8" y="43" width="48" height="13" rx="5.5" fill="#047857" />
      <circle cx="15" cy="49.5" r="4.5" fill="#065F46" />
    </svg>
  );
}

/** Flaticon-style Curtain / Drapery */
export function CurtainGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Rod */}
      <rect x="6" y="8" width="52" height="4" rx="2" fill="#D97706" />
      <circle cx="6" cy="10" r="3" fill="#F59E0B" />
      <circle cx="58" cy="10" r="3" fill="#F59E0B" />
      {/* Left Curtain Drape */}
      <path d="M12 12C12 12 20 28 15 54C20 54 26 52 26 52C22 36 24 12 24 12H12Z" fill="#4F46E5" />
      {/* Right Curtain Drape */}
      <path d="M52 12C52 12 44 28 49 54C44 54 38 52 38 52C42 36 40 12 40 12H52Z" fill="#4F46E5" />
      {/* Tiebacks */}
      <path d="M12 32H20" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 32H52" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Generic Garment Fallback */
export function GenericGarmentIcon({ className = "size-10" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="32" cy="32" r="24" fill="#F1F5F9" />
      <path
        d="M32 18C34 18 36 20 36 22C36 24 34 26 32 26L20 32H44L32 26"
        stroke="#64748B"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="22" y="32" width="20" height="18" rx="2" fill="#CBD5E1" />
      <circle cx="32" cy="40" r="2" fill="#475569" />
    </svg>
  );
}

/** Helper dispatcher for items */
export function renderFlaticonGarment(code?: string | null, name?: string | null, className = "size-12") {
  const text = `${code ?? ""} ${name ?? ""}`.toUpperCase();
  if (text.includes("TSHIRT") || text.includes("T-SHIRT") || text.includes("POLO")) {
    return <TShirtGarmentIcon className={className} />;
  }
  if (text.includes("SHIRT") || text.includes("TOP") || text.includes("KURTI")) {
    return <ShirtGarmentIcon className={className} />;
  }
  if (text.includes("TROUSER") || text.includes("PANT") || text.includes("JEAN") || text.includes("BOTTOM")) {
    return <TrouserGarmentIcon className={className} />;
  }
  if (text.includes("SUIT") || text.includes("BLAZER") || text.includes("COAT") || text.includes("TUXEDO")) {
    return <BlazerGarmentIcon className={className} />;
  }
  if (text.includes("SAREE") || text.includes("LEHENGA") || text.includes("ETHNIC") || text.includes("ANARKALI")) {
    return <SareeGarmentIcon className={className} />;
  }
  if (text.includes("BED") || text.includes("LINEN") || text.includes("QUILT") || text.includes("BLANKET") || text.includes("DUVET")) {
    return <BedLinenGarmentIcon className={className} />;
  }
  if (text.includes("TOWEL") || text.includes("BATH") || text.includes("NAPKIN")) {
    return <TowelsGarmentIcon className={className} />;
  }
  if (text.includes("CURTAIN") || text.includes("DRAPE")) {
    return <CurtainGarmentIcon className={className} />;
  }
  return <GenericGarmentIcon className={className} />;
}

/** Helper dispatcher for services */
export function renderFlaticonService(code?: string | null, className = "size-7") {
  const c = (code ?? "").toUpperCase();
  if (c.includes("FOLD") || c.includes("KG")) {
    return <WashingMachineIcon className={className} />;
  }
  if (c.includes("DRY")) {
    return <DryCleanIcon className={className} />;
  }
  if (c.includes("STEAM") || c.includes("PRESS")) {
    return <SteamPressIcon className={className} />;
  }
  return <SteamIronIcon className={className} />;
}


/** Flaticon-style Laundry Basket with Clothes & Bubbles (Empty State / Hero) */
export function LaundryBasketEmptyIllustration({ className = "size-24" }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Floating Bubbles */}
      <circle cx="24" cy="20" r="5" fill="#BAE6FD" opacity="0.8" />
      <circle cx="26" cy="19" r="1.5" fill="#FFFFFF" />
      <circle cx="72" cy="18" r="6" fill="#7DD3FC" opacity="0.7" />
      <circle cx="74" cy="16" r="2" fill="#FFFFFF" />
      <circle cx="82" cy="30" r="4" fill="#BAE6FD" opacity="0.9" />
      <circle cx="16" cy="32" r="3" fill="#BAE6FD" />

      {/* Sparkles */}
      <path d="M48 6L50 12L56 14L50 16L48 22L46 16L40 14L46 12L48 6Z" fill="#FBBF24" />
      <path d="M80 44L81 47L84 48L81 49L80 52L79 49L76 48L79 47L80 44Z" fill="#FBBF24" />

      {/* Clothes Peeking Out of Basket */}
      {/* Blue Shirt */}
      <path d="M26 40C26 30 38 28 44 32C48 35 52 35 56 32C62 28 72 30 70 42H26Z" fill="#3B82F6" />
      {/* Lavender Towel */}
      <path d="M34 32C34 26 42 24 48 27C54 30 58 26 62 30L60 38H32L34 32Z" fill="#A78BFA" />
      {/* Coral Fabric */}
      <circle cx="48" cy="28" r="6" fill="#F43F5E" />

      {/* Basket Body */}
      <path
        d="M20 42L26 84C26 87 29 90 32 90H64C67 90 70 87 70 84L76 42H20Z"
        fill="#F59E0B"
      />
      {/* Basket Rim */}
      <rect x="16" y="38" width="64" height="6" rx="3" fill="#D97706" />

      {/* Woven Pattern Stripes */}
      <path d="M24 50H72" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M25 60H71" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M27 70H69" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 80H68" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />

      {/* Vertical Weave Accents */}
      <line x1="36" y1="44" x2="38" y2="86" stroke="#B45309" strokeWidth="2" strokeDasharray="4 4" />
      <line x1="48" y1="44" x2="48" y2="86" stroke="#B45309" strokeWidth="2" strokeDasharray="4 4" />
      <line x1="60" y1="44" x2="58" y2="86" stroke="#B45309" strokeWidth="2" strokeDasharray="4 4" />

      {/* Side Handles */}
      <path d="M16 48C11 48 11 58 16 58" stroke="#D97706" strokeWidth="4" strokeLinecap="round" />
      <path d="M80 48C85 48 85 58 80 58" stroke="#D97706" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Flaticon-style Delivery Van Icon */
export function LaundryDeliveryVanIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Van Body */}
      <path
        d="M8 22C8 19 10 17 13 17H40V45H8V22Z"
        fill="#0284C7"
      />
      {/* Cabin Front */}
      <path
        d="M40 24H48C51 24 54 26 55 29L58 36V45H40V24Z"
        fill="#0369A1"
      />
      {/* Windshield */}
      <path
        d="M42 27H47L52 35H42V27Z"
        fill="#BAE6FD"
      />
      {/* Hanger Logo on Van Side */}
      <path
        d="M24 26L18 33H30L24 26Z"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="1.5" stroke="#FFFFFF" strokeWidth="1.5" />
      <line x1="16" y1="36" x2="32" y2="36" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />

      {/* Bumpers & Chassis */}
      <rect x="6" y="44" width="54" height="4" rx="2" fill="#334155" />
      {/* Headlight */}
      <rect x="56" y="38" width="3" height="4" rx="1" fill="#FBBF24" />

      {/* Wheels */}
      <circle cx="18" cy="46" r="6" fill="#1E293B" />
      <circle cx="18" cy="46" r="3" fill="#94A3B8" />
      <circle cx="48" cy="46" r="6" fill="#1E293B" />
      <circle cx="48" cy="46" r="3" fill="#94A3B8" />
    </svg>
  );
}

/** Flaticon-style Stack of Folded Fresh Laundry with Ribbon */
export function FoldedLaundryStackIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Sparkles */}
      <path d="M50 8L51 11L54 12L51 13L50 16L49 13L46 12L49 11L50 8Z" fill="#F59E0B" />
      <circle cx="14" cy="18" r="2" fill="#F59E0B" />

      {/* Top Folded Garment (Mint) */}
      <rect x="14" y="20" width="36" height="9" rx="4" fill="#34D399" />
      <rect x="18" y="22" width="28" height="5" rx="2" fill="#6EE7B7" />

      {/* Middle Folded Garment (Lavender) */}
      <rect x="10" y="30" width="44" height="10" rx="4" fill="#A78BFA" />
      <rect x="14" y="32" width="36" height="6" rx="2" fill="#C4B5FD" />

      {/* Bottom Folded Garment (Sky Blue) */}
      <rect x="6" y="41" width="52" height="11" rx="4.5" fill="#38BDF8" />
      <rect x="10" y="43" width="44" height="6" rx="2" fill="#7DD3FC" />

      {/* Golden Clean Star Badge */}
      <circle cx="46" cy="42" r="6" fill="#F59E0B" />
      <path d="M46 38L47 41L50 41.5L47.5 43.5L48 46L46 44.5L44 46L44.5 43.5L42 41.5L45 41L46 38Z" fill="#FFFFFF" />
    </svg>
  );
}

/** Flaticon-style Laundry Order Ticket / Receipt Tag */
export function LaundryOrderTagIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Tag Body */}
      <path
        d="M16 12C16 10 18 8 20 8H44C46 8 48 10 48 12V54C48 56 46 58 44 58H20C18 58 16 56 16 54V12Z"
        fill="#3B82F6"
      />
      <rect x="20" y="12" width="24" height="42" rx="3" fill="#EFF6FF" />

      {/* Hanger Icon on Ticket Header */}
      <path d="M32 16C31 16 30 17 30 18C30 19 31 20 32 20C33 20 34 19 34 18M32 20L25 24H39L32 20Z" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />

      {/* Barcode Lines */}
      <line x1="24" y1="28" x2="24" y2="40" stroke="#1E293B" strokeWidth="2" />
      <line x1="28" y1="28" x2="28" y2="40" stroke="#1E293B" strokeWidth="1" />
      <line x1="31" y1="28" x2="31" y2="40" stroke="#1E293B" strokeWidth="2.5" />
      <line x1="36" y1="28" x2="36" y2="40" stroke="#1E293B" strokeWidth="1.5" />
      <line x1="40" y1="28" x2="40" y2="40" stroke="#1E293B" strokeWidth="2" />

      {/* Order Total / Paid Badge */}
      <rect x="23" y="44" width="18" height="6" rx="2" fill="#10B981" />
      <path d="M28 47L30 49L36 45" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Flaticon-style Colorful Invoice / Billing Receipt Icon */
export function LaundryInvoiceIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Paper Drop Shadow */}
      <path d="M14 10C14 7.79086 15.7909 6 18 6H40L52 18V54C52 56.2091 50.2091 58 48 58H18C15.7909 58 14 56.2091 14 54V10Z" fill="#3B82F6" />
      {/* Inner Paper Sheet */}
      <path d="M17 9H38L49 20V55H17V9Z" fill="#FFFFFF" />
      {/* Folded Corner */}
      <path d="M38 6V18C38 19.1046 38.8954 20 40 20H52L38 6Z" fill="#93C5FD" />
      <path d="M40 20H52L38 6V18C38 19.1046 38.8954 20 40 20Z" fill="#1D4ED8" fillOpacity="0.2" />
      {/* Header Band */}
      <rect x="22" y="14" width="12" height="3" rx="1.5" fill="#2563EB" />
      {/* Text Lines */}
      <rect x="22" y="24" width="22" height="2.5" rx="1" fill="#94A3B8" />
      <rect x="22" y="29" width="18" height="2.5" rx="1" fill="#CBD5E1" />
      <rect x="22" y="34" width="22" height="2.5" rx="1" fill="#E2E8F0" />
      {/* Rupee / Price Seal */}
      <circle cx="34" cy="44" r="7" fill="#10B981" />
      <path d="M32 40H36.5M32 42.5H36M32 40V48M34.5 42.5C35.5 42.5 36.5 43.5 36 45L32 48" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Flaticon-style Colorful Clock & Calendar Delivery Schedule Icon */
export function LaundryClockDeliveryIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Calendar Base */}
      <rect x="10" y="14" width="44" height="42" rx="8" fill="#0284C7" />
      <rect x="13" y="24" width="38" height="29" rx="5" fill="#F0F9FF" />
      {/* Calendar Binder Rings */}
      <rect x="18" y="8" width="4" height="10" rx="2" fill="#38BDF8" />
      <rect x="42" y="8" width="4" height="10" rx="2" fill="#38BDF8" />
      {/* Calendar Grid Dot Accents */}
      <circle cx="21" cy="32" r="2" fill="#BAE6FD" />
      <circle cx="29" cy="32" r="2" fill="#BAE6FD" />
      <circle cx="21" cy="40" r="2" fill="#BAE6FD" />
      {/* Circular Clock Badge in bottom right */}
      <circle cx="41" cy="41" r="13" fill="#0284C7" />
      <circle cx="41" cy="41" r="10.5" fill="#FFFFFF" />
      {/* Clock Hands pointing to delivery hour */}
      <path d="M41 34V41L45 43" stroke="#0284C7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="41" cy="41" r="1.5" fill="#38BDF8" />
    </svg>
  );
}

/** Flaticon-style Colorful Customer Profile Icon */
export function LaundryCustomerProfileIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Circular Backdrop */}
      <circle cx="32" cy="32" r="26" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="2" />
      {/* Head */}
      <circle cx="32" cy="24" r="9" fill="#3B82F6" />
      <path d="M26 21C26 17.6863 28.6863 15 32 15C35.3137 15 38 17.6863 38 21" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" />
      {/* Torso */}
      <path
        d="M17 50C17 42.8203 23.268 37 31 37H33C40.732 37 47 42.8203 47 50C47 51.1046 46.1046 52 45 52H19C17.8954 52 17 51.1046 17 50Z"
        fill="#2563EB"
      />
      {/* Tie / Shirt Collar Accent */}
      <path d="M29 37L32 44L35 37" fill="#93C5FD" />
      {/* Verified Customer Star Badge */}
      <circle cx="45" cy="21" r="6" fill="#10B981" />
      <path d="M42.5 21L44.5 23L47.5 19.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Flaticon-style Colorful Hold / Pause Alert Icon */
export function LaundryHoldIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Warning Triangle Base */}
      <path
        d="M27.5 10.2C29.5 6.7 34.5 6.7 36.5 10.2L55.5 43.1C57.5 46.6 55 51 51 51H13C9 51 6.5 46.6 8.5 43.1L27.5 10.2Z"
        fill="#F59E0B"
      />
      {/* Inner Soft Gradient Surface */}
      <path
        d="M30 14L13 45.5H51L34 14C33 12 31 12 30 14Z"
        fill="#FEF3C7"
      />
      {/* Pause Double Bars */}
      <rect x="27" y="24" width="3.5" height="15" rx="1.5" fill="#D97706" />
      <rect x="33.5" y="24" width="3.5" height="15" rx="1.5" fill="#D97706" />
    </svg>
  );
}

/** Flaticon-style Cash Register / POS Till Icon */
export function LaundryCashRegisterIcon({ className = "size-8" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="10" y="24" width="44" height="28" rx="5" fill="#2563EB" />
      <rect x="13" y="27" width="38" height="22" rx="3" fill="#EFF6FF" />
      {/* Till Display */}
      <rect x="18" y="10" width="28" height="15" rx="3" fill="#1E293B" />
      <rect x="21" y="13" width="22" height="9" rx="1.5" fill="#10B981" />
      <text x="32" y="20" fill="#FFFFFF" fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="monospace">₹ 0.00</text>
      {/* Till Keys */}
      <circle cx="20" cy="33" r="2" fill="#3B82F6" />
      <circle cx="26" cy="33" r="2" fill="#3B82F6" />
      <circle cx="32" cy="33" r="2" fill="#3B82F6" />
      <circle cx="38" cy="33" r="2" fill="#10B981" />
      <circle cx="44" cy="33" r="2" fill="#F59E0B" />
      <circle cx="20" cy="40" r="2" fill="#3B82F6" />
      <circle cx="26" cy="40" r="2" fill="#3B82F6" />
      <circle cx="32" cy="40" r="2" fill="#3B82F6" />
      <circle cx="38" cy="40" r="2" fill="#3B82F6" />
      <circle cx="44" cy="40" r="2" fill="#3B82F6" />
      {/* Cash Drawer Base */}
      <rect x="6" y="51" width="52" height="7" rx="2" fill="#1D4ED8" />
      <rect x="28" y="53" width="8" height="2" rx="1" fill="#93C5FD" />
    </svg>
  );
}

/** Flaticon-style UPI / QR Payment Icon */
export function UpiPaymentFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#F0FDF4" stroke="#22C55E" strokeWidth="2" />
      <path d="M12 12H20V20H12V12Z" fill="#16A34A" />
      <path d="M28 12H36V20H28V12Z" fill="#16A34A" />
      <path d="M12 28H20V36H12V28Z" fill="#16A34A" />
      <rect x="26" y="26" width="4" height="4" fill="#15803D" />
      <rect x="32" y="26" width="4" height="4" fill="#15803D" />
      <rect x="26" y="32" width="4" height="4" fill="#15803D" />
      <rect x="32" y="32" width="4" height="4" fill="#15803D" />
    </svg>
  );
}

/** Flaticon-style Banknote / Cash Icon */
export function CashPaymentFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="4" y="10" width="40" height="28" rx="5" fill="#10B981" stroke="#059669" strokeWidth="2" />
      <rect x="8" y="14" width="32" height="20" rx="3" fill="#D1FAE5" />
      <circle cx="24" cy="24" r="6" fill="#10B981" />
      <text x="24" y="28" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">₹</text>
    </svg>
  );
}

/** Flaticon-style Credit Card Icon */
export function CardPaymentFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="4" y="10" width="40" height="28" rx="5" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="2" />
      <rect x="4" y="17" width="40" height="6" fill="#1E293B" />
      <rect x="10" y="28" width="8" height="5" rx="1" fill="#F59E0B" />
      <circle cx="34" cy="30" r="3" fill="#EF4444" />
      <circle cx="38" cy="30" r="3" fill="#F59E0B" fillOpacity="0.8" />
    </svg>
  );
}

/** Flaticon-style Refund & Reversal Icon */
export function RefundReturnFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="24" cy="24" r="20" fill="#FAF5FF" stroke="#A855F7" strokeWidth="2" />
      <path d="M16 22L12 18L16 14" stroke="#9333EA" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18H28C33.5228 18 38 22.4772 38 28C38 33.5228 33.5228 38 28 38H18" stroke="#9333EA" strokeWidth="2.5" strokeLinecap="round" />
      <text x="26" y="32" fill="#7E22CE" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">₹</text>
    </svg>
  );
}

/** Flaticon-style WhatsApp Icon */
export function WhatsAppFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="24" cy="24" r="22" fill="#25D366" />
      <path
        d="M34.8 28.6C34.2 28.3 31.4 26.9 30.9 26.7C30.4 26.5 30 26.4 29.6 27C29.2 27.6 28.1 28.9 27.7 29.3C27.4 29.8 27 29.8 26.4 29.5C25.8 29.2 23.9 28.5 21.6 26.5C19.8 24.9 18.6 22.9 18.2 22.3C17.9 21.7 18.2 21.4 18.5 21.1C18.8 20.8 19.1 20.4 19.4 20.1C19.7 19.8 19.8 19.5 20 19.1C20.2 18.7 20.1 18.3 19.9 18C19.8 17.7 18.6 14.8 18.1 13.6C17.6 12.4 17.1 12.6 16.7 12.6C16.3 12.6 15.9 12.6 15.5 12.6C15.1 12.6 14.4 12.8 13.9 13.4C13.3 14 11.8 15.4 11.8 18.2C11.8 21 13.9 23.7 14.2 24.1C14.5 24.5 18.3 30.3 24 32.8C25.4 33.4 26.4 33.7 27.3 34C28.7 34.4 29.9 34.3 30.9 34.2C32 34 34.2 32.8 34.7 31.5C35.2 30.1 35.2 28.9 34.8 28.6Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/** Flaticon-style SMS Message Notification Icon */
export function SmsMessageFlaticonIcon({ className = "size-6" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="4" y="6" width="40" height="30" rx="8" fill="#3B82F6" />
      <polygon points="12,36 20,36 12,44" fill="#3B82F6" />
      <circle cx="16" cy="21" r="2.5" fill="#FFFFFF" />
      <circle cx="24" cy="21" r="2.5" fill="#FFFFFF" />
      <circle cx="32" cy="21" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}
