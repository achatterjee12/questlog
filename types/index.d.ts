export type Deed = 'craft' | 'battle' | 'scout' | 'lore' | 'summon' | 'misc'

export type HeroClass =
  | 'Adventurer'
  | 'Artificer'
  | 'Warrior'
  | 'Ranger'
  | 'Wizard'
  | 'Necromancer'

export type Hero = {
  // The HERO_VERSION it was saved under; migrateHero reads older ones.
  version: number
  sessionId: string
  name: string
  heroClass: HeroClass
  level: number
  xp: number
  deeds: Record<Deed, number>
  quests: number
  fumbles: number
}

declare module 'claude-code' {
  interface PluginState {
    questlog: { hero: Shaped<Hero | null>; sheetTick: number }
  }
}
