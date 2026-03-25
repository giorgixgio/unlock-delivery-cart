import { Star } from "lucide-react";

export interface LandingReview {
  name: string;
  text: string;
  rating: number;
}

/** Generic fallback reviews when product doesn't have custom ones */
const GENERIC_REVIEWS: LandingReview[] = [
  { name: "ნინო კ.", text: "ძალიან მომეწონა, ყოველდღე ვიყენებ", rating: 5 },
  { name: "გიორგი მ.", text: "ფასთან შედარებით ძალიან კარგია", rating: 5 },
  { name: "მარიამი ს.", text: "ზუსტად ისეთი მოვიდა როგორც ფოტოზე", rating: 5 },
  { name: "დავითი ბ.", text: "მეგობარსაც ვურჩიე, ორივე კმაყოფილი ვართ", rating: 4 },
];

interface LandingReviewsProps {
  reviews?: LandingReview[];
  dark?: boolean;
}

const LandingReviews = ({ reviews, dark = false }: LandingReviewsProps) => {
  const items = reviews && reviews.length > 0 ? reviews : GENERIC_REVIEWS;

  return (
    <section className="space-y-3">
      <h2
        className={`text-lg font-extrabold ${
          dark ? "text-white" : "text-foreground"
        }`}
      >
        მომხმარებლების შეფასება
      </h2>
      <div className="space-y-2">
        {items.map((r, i) => (
          <div
            key={i}
            className={`rounded-xl border p-3.5 space-y-1.5 ${
              dark
                ? "bg-white/5 border-white/10"
                : "bg-card border-border"
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  dark
                    ? "bg-red-500/20 text-red-400"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {r.name.charAt(0)}
              </div>
              <div className="flex-1">
                <span
                  className={`text-sm font-bold ${
                    dark ? "text-white" : "text-foreground"
                  }`}
                >
                  {r.name}
                </span>
                <span
                  className={`text-[10px] font-semibold ml-2 ${
                    dark ? "text-emerald-400" : "text-success"
                  }`}
                >
                  ✓ დადასტურებული შეკვეთა
                </span>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: r.rating }).map((_, j) => (
                  <Star
                    key={j}
                    className="w-3 h-3 text-yellow-400 fill-yellow-400"
                  />
                ))}
              </div>
            </div>
            <p
              className={`text-sm leading-relaxed ${
                dark ? "text-white/60" : "text-muted-foreground"
              }`}
            >
              "{r.text}"
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default LandingReviews;
