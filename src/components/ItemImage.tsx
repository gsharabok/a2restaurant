import Image from "next/image";

/** Menu art is either a local icon or a product photo hosted by the restaurant, which fills a rounded frame. */
export function ItemImage({ src, size, className = "" }: { src: string; size: number; className?: string }) {
  if (!src.startsWith("http")) {
    // eslint-disable-next-line @next/next/no-img-element -- small local SVGs, no optimisation needed
    return <img src={src} alt="" className={`drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)] ${className}`} />;
  }
  return (
    <span className={`relative block overflow-hidden rounded-2xl bg-white/5 ${className}`}>
      <Image src={src} alt="" fill sizes={`${size * 2}px`} className="object-cover" />
    </span>
  );
}
