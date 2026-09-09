import { ArkConstellationMark } from "./ArkConstellationMark.js";

type ChainLogo = "ark" | "ethereum" | "base" | "bnb";

export function ChainMark({
  chainKey,
  label,
  logo,
}: {
  readonly chainKey: string;
  readonly label: string;
  readonly logo?: ChainLogo | undefined;
}) {
  if (logo !== undefined) {
    return (
      <span className="ark-mark" data-logo={logo} aria-hidden="true">
        <Logo name={logo} />
      </span>
    );
  }

  let hash = 0;
  for (let i = 0; i < chainKey.length; i++) hash = (hash * 31 + chainKey.charCodeAt(i)) % 360;
  return (
    <span
      className="ark-mark"
      aria-hidden="true"
      style={{
        background: `hsl(${hash} 55% 22%)`,
        borderColor: `hsl(${hash} 70% 45%)`,
        color: `hsl(${hash} 80% 78%)`,
      }}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Logo({ name }: { readonly name: ChainLogo }) {
  if (name === "ethereum")
    return (
      <svg viewBox="0 0 32 32" role="presentation">
        <path fill="#627EEA" d="M16 2 7 16l9 5.3 9-5.3L16 2Z" />
        <path fill="#4557B8" d="m7 17.8 9 12.1 9-12.1-9 5.3-9-5.3Z" />
        <path fill="#FFF" fillOpacity=".28" d="M16 2v19.3L7 16l9-14Z" />
      </svg>
    );
  if (name === "base")
    return (
      <svg viewBox="0 0 32 32" role="presentation">
        <circle cx="16" cy="16" r="15" fill="#0052FF" />
        <path
          fill="#FFF"
          d="M16.2 25.4a9.4 9.4 0 1 1 8.9-12.5H12.4v6.2h12.7a9.4 9.4 0 0 1-8.9 6.3Z"
        />
      </svg>
    );
  if (name === "bnb")
    return (
      <svg viewBox="0 0 32 32" role="presentation">
        <circle cx="16" cy="16" r="15" fill="#F3BA2F" />
        <g fill="#171717">
          <path d="m16 6 4 4-2.3 2.3-1.7-1.7-1.7 1.7L12 10l4-4Z" />
          <path d="m10 12 2.3 2.3-1.7 1.7 1.7 1.7L10 20l-4-4 4-4ZM22 12l4 4-4 4-2.3-2.3 1.7-1.7-1.7-1.7L22 12Z" />
          <path d="m16 13 3 3-3 3-3-3 3-3Zm0 8.4 1.7-1.7L20 22l-4 4-4-4 2.3-2.3 1.7 1.7Z" />
        </g>
      </svg>
    );
  // "ark" and anything unrecognised fall through to the network mark rather
  // than to nothing, so a chain whose logo is misspelled in the registry gets a
  // shape instead of an empty box.
  return <ArkConstellationMark />;
}
