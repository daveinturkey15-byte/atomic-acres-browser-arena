export type GuestRejoinAffordance = Readonly<{
  available: boolean;
  label: 'JOIN' | 'REJOIN LAST MATCH';
  title: string;
}>;

/**
 * A remembered room is an explicit recovery target, not a hidden convenience.
 * Keep the affordance tied to the exact room in the input so editing or pasting
 * a different invite immediately returns the action to a normal join.
 */
export function guestRejoinAffordance(
  inputRoomCode: string,
  lastRoomCode: string | null,
): GuestRejoinAffordance {
  const input = inputRoomCode.trim();
  const remembered = lastRoomCode?.trim() ?? '';
  const available = input.length > 0 && input === remembered;
  return Object.freeze(available
    ? {
      available: true,
      label: 'REJOIN LAST MATCH',
      title: 'Reconnect to your last room. Your saved player identity is restored when it is still within the rejoin grace period.',
    }
    : {
      available: false,
      label: 'JOIN',
      title: 'Join the room code shown in this field.',
    });
}
