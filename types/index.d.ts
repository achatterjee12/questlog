export type Deed = 'craft' | 'battle' | 'scout' | 'lore' | 'summon' | 'misc'

export type HeroClass =
  | 'Novice'
  | 'Artificer'
  | 'Berserker'
  | 'Ranger'
  | 'Sage'
  | 'Summoner'

export type Hero = {
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
    questlog: { hero: Shaped<Hero | null> }
  }
}
