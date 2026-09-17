import {
  addMinutesToTime,
  formatDuration,
  formatPrice,
  formatTime,
  initials,
  isoToWeekday,
  minutesToTime,
  timeToMinutes,
  toApiTime,
  todayIso,
  WEEKDAY_LABELS,
} from './datetime';

/**
 * The weekday mapping is the highest-risk piece of logic in the availability
 * screen: the backend numbers Monday as 0 while JavaScript numbers Sunday as 0.
 * Getting this wrong silently books people on the wrong day.
 */
describe('datetime', () => {
  describe('isoToWeekday', () => {
    // 2026-09-14 is a Monday, so 14..20 walks a full Mon..Sun week.
    const mondayThroughSunday = [
      ['2026-09-14', 0, 'Monday'],
      ['2026-09-15', 1, 'Tuesday'],
      ['2026-09-16', 2, 'Wednesday'],
      ['2026-09-17', 3, 'Thursday'],
      ['2026-09-18', 4, 'Friday'],
      ['2026-09-19', 5, 'Saturday'],
      ['2026-09-20', 6, 'Sunday'],
    ] as const;

    it.each(mondayThroughSunday)(
      'maps %s to %i (%s) using the backend numbering',
      (iso, expected, label) => {
        expect(isoToWeekday(iso)).toBe(expected);
        expect(WEEKDAY_LABELS[expected]).toBe(label);
      },
    );

    it('returns null for an unparsable date', () => {
      expect(isoToWeekday('not-a-date')).toBeNull();
      expect(isoToWeekday('')).toBeNull();
    });
  });

  describe('time helpers', () => {
    it('drops the seconds the API always appends', () => {
      expect(formatTime('09:00:00')).toBe('09:00');
      expect(formatTime('17:30:00')).toBe('17:30');
    });

    it('adds seconds back for the API', () => {
      expect(toApiTime('09:00')).toBe('09:00:00');
      expect(toApiTime('09:00:00')).toBe('09:00:00');
      expect(toApiTime('')).toBe('');
    });

    it('round-trips through minutes', () => {
      expect(timeToMinutes('09:30:00')).toBe(570);
      expect(minutesToTime(570)).toBe('09:30');
    });

    it('previews the end time from a service duration', () => {
      expect(addMinutesToTime('09:00', 30)).toBe('09:30');
      expect(addMinutesToTime('09:45', 90)).toBe('11:15');
      // Crossing midnight is clamped rather than wrapping to a bogus time.
      expect(addMinutesToTime('23:50', 30)).toBe('23:59');
      expect(addMinutesToTime('', 30)).toBeNull();
      expect(addMinutesToTime('09:00', 0)).toBeNull();
    });
  });

  describe('formatting', () => {
    it('renders durations readably', () => {
      expect(formatDuration(30)).toBe('30m');
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(90)).toBe('1h 30m');
    });

    it('renders prices with two decimals', () => {
      expect(formatPrice('15.00')).toBe('$15.00');
      expect(formatPrice(15)).toBe('$15.00');
      expect(formatPrice(null)).toBe('—');
    });

    it('builds initials', () => {
      expect(initials('John Doe')).toBe('JD');
      expect(initials('Priya Ann Nair')).toBe('PN');
      expect(initials('Madonna')).toBe('MA');
      expect(initials('')).toBe('?');
    });
  });

  it('produces a local YYYY-MM-DD string for today', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
