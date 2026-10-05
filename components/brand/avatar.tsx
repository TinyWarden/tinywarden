import type { SVGProps } from "react";

export const wardenBody = [[20, 4, 24], [12, 12, 40], [4, 20, 56], [4, 28, 8],
  [52, 28, 8], [4, 36, 56], [12, 44, 40], [20, 52, 8], [36, 52, 8]] as const;

export function WardenAvatar({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 64 64" shapeRendering="crispEdges" {...props}>
    <g fill="currentColor">{wardenBody.map(([x, y, width]) =>
      <rect key={`${x}-${y}`} x={x} y={y} width={width} height="8" />)}</g>
    <rect x="12" y="28" width="40" height="8" fill="#100c22" />
    {children ?? <rect x="20" y="28" width="24" height="8" fill="#d8ff3f" />}
  </svg>;
}
