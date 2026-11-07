/** Player avatars. The keys are stored by the server (app/services/players.py: AVATARS). */
export const AVATARS = [
  { key: "fox", emoji: "🦊", label: "Fox" },
  { key: "cat", emoji: "🐱", label: "Cat" },
  { key: "frog", emoji: "🐸", label: "Frog" },
  { key: "panda", emoji: "🐼", label: "Panda" },
  { key: "owl", emoji: "🦉", label: "Owl" },
  { key: "octopus", emoji: "🐙", label: "Octopus" },
  { key: "penguin", emoji: "🐧", label: "Penguin" },
  { key: "tiger", emoji: "🐯", label: "Tiger" },
  { key: "unicorn", emoji: "🦄", label: "Unicorn" },
  { key: "bear", emoji: "🐻", label: "Bear" },
  { key: "wizard", emoji: "🧙", label: "Wizard" },
  { key: "ninja", emoji: "🥷", label: "Ninja" },
  { key: "hero", emoji: "🦸", label: "Superhero" },
  { key: "cowboy", emoji: "🤠", label: "Cowboy" },
  { key: "alien", emoji: "👽", label: "Alien" },
  { key: "robot", emoji: "🤖", label: "Robot" },
] as const;

export type AvatarKey = (typeof AVATARS)[number]["key"];

export function avatarEmoji(key: string): string {
  return AVATARS.find((a) => a.key === key)?.emoji ?? "🙂";
}

export function avatarLabel(key: string): string {
  return AVATARS.find((a) => a.key === key)?.label ?? "Player";
}

export function randomAvatar(): AvatarKey {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].key;
}
