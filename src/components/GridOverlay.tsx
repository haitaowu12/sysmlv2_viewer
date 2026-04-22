/**
 * GridOverlay
 * Shows a 20px grid pattern on the diagram canvas during active drag.
 */

interface GridOverlayProps {
  active: boolean;
}

export default function GridOverlay({ active }: GridOverlayProps) {
  if (!active) return null;

  return (
    <div
      className="grid-overlay"
      aria-hidden="true"
    />
  );
}
