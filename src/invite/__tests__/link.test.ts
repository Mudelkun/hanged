import { acceptsByItself, inviteCodeIn } from '../link';

test('finds the code in every form of the link and in the install referrer', () => {
  for (const text of [
    'https://hanged.up.railway.app/i/ABCD2345',
    'https://hanged.up.railway.app/i/abcd2345?utm=x',
    'hanged://i/ABCD2345',
    'exp://192.168.1.4:8081/--/i/ABCD2345',
    'invite=ABCD2345',
    'utm_source=google-play&invite=abcd2345&utm_medium=x',
    'Float with me in Hanged! https://x.dev/i/ABCD2345',
  ])
    expect(inviteCodeIn(text)).toBe('ABCD2345');
});

test('ignores anything else', () => {
  for (const text of [null, '', 'https://x.dev/', 'https://x.dev/i/ABCD234', 'https://x.dev/i/ABCD23456', 'https://x.dev/i/ABCD2O45', 'https://x.dev/hi/ABCD2345', 'utm_source=google-play'])
    expect(inviteCodeIn(text)).toBeNull();
});

test('accepts by itself only an invite that came before onboarding finished', () => {
  const invite = { code: 'ABCD2345', at: 1_000 };
  expect(acceptsByItself(invite, { acceptedAt: 2_000 })).toBe(true);
  expect(acceptsByItself(invite, { acceptedAt: 500 })).toBe(false);
  expect(acceptsByItself(invite, null)).toBe(false);
});
