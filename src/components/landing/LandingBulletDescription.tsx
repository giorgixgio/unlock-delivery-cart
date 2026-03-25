interface LandingBulletDescriptionProps {
  /** Raw HTML description from product */
  description: string;
  dark?: boolean;
}

/**
 * Converts product description into scannable bullet points.
 * Parses <li>, <p>, or line-break separated content into clean bullets.
 * Falls back to short paragraph if no structure is found.
 */
const LandingBulletDescription = ({ description, dark = false }: LandingBulletDescriptionProps) => {
  if (!description) return null;

  // Strip HTML and extract text chunks
  const tempDiv = typeof document !== "undefined" ? document.createElement("div") : null;
  let bullets: string[] = [];

  if (tempDiv) {
    tempDiv.innerHTML = description;

    // Try to extract from <li> elements first
    const lis = tempDiv.querySelectorAll("li");
    if (lis.length > 0) {
      bullets = Array.from(lis)
        .map((li) => li.textContent?.trim() || "")
        .filter(Boolean);
    } else {
      // Try <p> elements
      const ps = tempDiv.querySelectorAll("p");
      if (ps.length > 1) {
        bullets = Array.from(ps)
          .map((p) => p.textContent?.trim() || "")
          .filter(Boolean);
      } else {
        // Split by periods or line breaks
        const text = tempDiv.textContent || "";
        bullets = text
          .split(/[.!?\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 5);
      }
    }
  }

  // Limit to 5 bullets max
  bullets = bullets.slice(0, 5);

  if (bullets.length === 0) return null;

  // If only 1 item, show as paragraph
  if (bullets.length === 1) {
    return (
      <div className={`rounded-xl border p-4 ${dark ? "bg-white/5 border-white/10" : "bg-card border-border"}`}>
        <p className={`text-base font-bold mb-2 ${dark ? "text-white" : "text-foreground"}`}>
          პროდუქტის შესახებ
        </p>
        <p className={`text-sm leading-relaxed ${dark ? "text-white/60" : "text-muted-foreground"}`}>
          {bullets[0]}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 space-y-2.5 ${dark ? "bg-white/5 border-white/10" : "bg-card border-border"}`}>
      <p className={`text-base font-bold ${dark ? "text-white" : "text-foreground"}`}>
        პროდუქტის შესახებ
      </p>
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-2.5">
          <span className="text-base leading-none mt-0.5">✅</span>
          <span className={`text-sm leading-relaxed ${dark ? "text-white/70" : "text-foreground"}`}>
            {b}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LandingBulletDescription;
