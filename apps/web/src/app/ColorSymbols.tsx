// eslint-disable-next-line @next/next/no-img-element
export function ColorSymbols({ colors, size = 14 }: { colors: string[]; size?: number }) {
  const pips = colors.length === 0 ? ["C"] : colors;
  return (
    <>
      {pips.map((c) => (
        <img
          key={c}
          src={`https://svgs.scryfall.io/card-symbols/${c}.svg`}
          alt={c}
          width={size}
          height={size}
          className="inline-block"
        />
      ))}
    </>
  );
}
