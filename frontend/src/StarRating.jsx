export default function StarRating({ value, onRate }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= (value || 0) ? "star filled" : "star"}
          onClick={() => onRate(n)}
        >
          &#9733;
        </span>
      ))}
    </span>
  );
}
