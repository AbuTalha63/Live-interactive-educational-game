import { Profile, BadgeId } from '../../../shared/types.js';

const STORAGE_KEY = 'profile';

export const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 500, 700, 950, 1250, 1600];

export const BADGE_DETAILS: Record<BadgeId, { title: string; description: string; icon: string }> = {
  first_game: {
    title: 'First Game',
    description: 'Completed your first live quiz game',
    icon: '🎯',
  },
  perfect_game: {
    title: 'Flawless',
    description: 'Answered every single question correctly',
    icon: '👑',
  },
  speed_demon: {
    title: 'Speed Demon',
    description: 'Answered correctly in under 2 seconds',
    icon: '⚡',
  },
  on_fire: {
    title: 'On Fire',
    description: 'Got a 5-question answer streak',
    icon: '🔥',
  },
  podium: {
    title: 'Podium Finisher',
    description: 'Finished in the top 3 of a game',
    icon: '🏆',
  },
};

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generatePlayerId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'p_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function getOrCreateProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.playerId === 'string') {
        return parsed as Profile;
      }
    }
  } catch (err) {
    console.error('Error loading profile from localStorage', err);
  }

  const newProfile: Profile = {
    playerId: generatePlayerId(),
    name: '',
    xp: 0,
    streakDays: 0,
    lastPlayedDay: null,
    badges: [],
  };

  saveProfile(newProfile);
  return newProfile;
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Error saving profile to localStorage', err);
  }
}

export function calculateLevel(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  progressPercent: number;
} {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }

  const currentLevelXp = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextLevelXp = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : null;

  let progressPercent = 100;
  if (nextLevelXp !== null) {
    const range = nextLevelXp - currentLevelXp;
    const earnedInRange = xp - currentLevelXp;
    progressPercent = Math.min(100, Math.max(0, Math.round((earnedInRange / range) * 100)));
  }

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressPercent,
  };
}

export function applyGameEndProgression(final: {
  xpEarned: number;
  badges: BadgeId[];
  correctCount: number;
}): {
  updatedProfile: Profile;
  newBadges: BadgeId[];
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
} {
  const profile = getOrCreateProfile();
  const oldLevel = calculateLevel(profile.xp).level;

  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  let streakDays = profile.streakDays;
  if (profile.lastPlayedDay === today) {
    // already played today, streak remains same
  } else if (profile.lastPlayedDay === yesterday) {
    streakDays += 1;
  } else {
    streakDays = 1;
  }

  const existingBadgeSet = new Set(profile.badges);
  const newBadges: BadgeId[] = [];

  for (const b of final.badges) {
    if (!existingBadgeSet.has(b)) {
      existingBadgeSet.add(b);
      newBadges.push(b);
    }
  }

  const newXp = profile.xp + final.xpEarned;
  const newLevel = calculateLevel(newXp).level;
  const leveledUp = newLevel > oldLevel;

  const updatedProfile: Profile = {
    ...profile,
    xp: newXp,
    streakDays,
    lastPlayedDay: today,
    badges: Array.from(existingBadgeSet),
  };

  saveProfile(updatedProfile);

  return {
    updatedProfile,
    newBadges,
    leveledUp,
    oldLevel,
    newLevel,
  };
}
