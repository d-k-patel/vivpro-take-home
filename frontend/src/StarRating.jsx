export default function StarRating({ value, onRate }) {
  return (
    <span className="cursor-pointer">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`text-base ${n <= (value || 0) ? "text-amber-400" : "text-gray-300"}`}
          onClick={() => onRate(n)}
        >
          &#9733;
        </span>
      ))}
    </span>
  );
}
