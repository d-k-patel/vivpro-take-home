export default function StarRating({ value, onRate }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`text-lg leading-none cursor-pointer transition-colors ${
            n <= (value || 0) ? "text-amber-400" : "text-slate-200 hover:text-amber-200"
          }`}
          onClick={() => onRate(n)}
        >
          &#9733;
        </span>
      ))}
    </span>
  );
}
