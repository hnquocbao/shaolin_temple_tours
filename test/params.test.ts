import { describe, expect, it } from 'vitest';
import { parseRunParams } from '../src/engine/params';

describe('parseRunParams', () => {
  it('defaults to live play with the interface on', () => {
    expect(parseRunParams('')).toEqual({ place: undefined, stop: undefined, freeze: false, ui: true, arrival: true, arrivalT: undefined });
  });

  it('reads place, stop and flags', () => {
    expect(parseRunParams('?place=shaolin&stop=arrival-2&freeze=1&ui=0')).toEqual({
      place: 'shaolin',
      stop: 'arrival-2',
      freeze: true,
      ui: false,
      arrival: true,
      arrivalT: undefined,
    });
  });

  it('can switch the arrival flight off and ask for a frozen moment of it', () => {
    expect(parseRunParams('?arrival=0').arrival).toBe(false);
    expect(parseRunParams('?arrival=1').arrival).toBe(true);
    expect(parseRunParams('?arrival-t=0.25&freeze=1').arrivalT).toBe(0.25);
    expect(parseRunParams('?arrival-t=0').arrivalT).toBe(0);
    expect(parseRunParams('?arrival-t=7').arrivalT).toBe(1);
    expect(parseRunParams('?arrival-t=-1').arrivalT).toBe(0);
    expect(parseRunParams('?arrival-t=soon').arrivalT).toBeUndefined();
    expect(parseRunParams('?arrival-t=').arrivalT).toBeUndefined();
  });

  it('treats a bare flag as on', () => {
    expect(parseRunParams('?freeze').freeze).toBe(true);
  });

  it('normalises case and rejects ids that are not kebab-case', () => {
    expect(parseRunParams('?place=Shaolin').place).toBe('shaolin');
    expect(parseRunParams('?place=../etc').place).toBeUndefined();
    expect(parseRunParams('?stop=<script>').stop).toBeUndefined();
  });
});
