import { useState, useEffect, useRef } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
}

const AnimatedNumber = ({ value, duration = 400, decimals = 1, className }: AnimatedNumberProps) => {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (prevValue.current === value) return;
    const start = prevValue.current;
    const diff = value - start;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    prevValue.current = value;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{display.toFixed(decimals)}</span>;
};

export default AnimatedNumber;
