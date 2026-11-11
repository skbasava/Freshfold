export interface Clock {
  now(): Date;
}

export function createFixedClock(iso: string): Clock {
  const instant = new Date(iso);
  return {
    now: () => new Date(instant.getTime()),
  };
}

export function createSteppingClock(startIso: string, stepMs: number): Clock {
  let current = new Date(startIso).getTime();
  return {
    now: () => {
      const value = new Date(current);
      current += stepMs;
      return value;
    },
  };
}
