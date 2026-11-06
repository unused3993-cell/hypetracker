import { DemoPlate } from "../../demo/plates"; // demo
import type { DiscoveryImage } from "@/lib/types";

/** Renders a discovery's lead image: a URL, or (in demo mode) an illustrated plate. */
export function Figure({ image, id }: { image: DiscoveryImage; id: string }) {
  if (image.src.startsWith("plate:")) return <DemoPlate name={image.src.slice(6)} id={id} />; // demo
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.src} alt={image.alt} />;
}
