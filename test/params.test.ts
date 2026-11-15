import { describe, expect, it } from 'vitest';
import { parseRunParams } from '../src/engine/params';

describe('parseRunParams', () => {
  it('defaults to live play with the interface on', () => {
    expect(parseRunParams('')).toEqual({ place: undefined, stop: undefined, freeze: false, ui: true });
  });

  it('reads place, stop and flags', () => {
    expect(parseRunParams('?place=shaolin&stop=arrival-2&freeze=1&ui=0')).toEqual({
      place: 'shaolin',
      stop: 'arrival-2',
      freeze: true,
      ui: false,
    });
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
