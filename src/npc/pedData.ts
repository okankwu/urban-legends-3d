/** Read-only-ish view of pedestrians shared with the interaction system. */
export interface PedInfo {
  x: number
  z: number
  name: string
  type: 'local' | 'jogger' | 'shopper' | 'tourist' | 'worker'
  /** performance.now() until which the ped is facing/talking to the player */
  talkUntil: number
  active: boolean
}
export const pedInfos: PedInfo[] = []

const GREET = ['Morning!', 'Hey there.', 'Hello!', 'Evening.']
const AREA = [
  'Downtown gets crazy at rush hour. Watch the signals.',
  'If you need supplies, the shops around here are open all day.',
  'I heard there is a street race going on later this week.',
  'Nice ride, if you can find it. The blue Subaru nobody claims?',
  'Traffic lights are the only thing keeping this city sane.',
  'The diners here are great. Grab a burger if you are hurt.',
]
const BY_TYPE: Record<PedInfo['type'], string[]> = {
  local: ['I have lived here for twenty years. Still get lost downtown.', 'Quiet neighbourhood, mostly. Keep it that way.'],
  jogger: ["Can't stop, got a PB to beat!", 'Best time to run is early morning, before the traffic.'],
  shopper: ['Sales on at the clothing store. I may have overspent.', 'The QuickMart is out of milk again.'],
  tourist: ['Is this the way to downtown? The towers are huge!', 'Everyone here drives so fast!'],
  worker: ["Running late for my shift, sorry!", 'Long day. I just want a coffee.'],
}

export function dialogueFor(p: PedInfo, hour: number, rnd: () => number): string {
  const greeting = hour < 12 ? 'Morning!' : hour < 18 ? 'Afternoon!' : hour < 22 ? 'Evening.' : "Late night, huh?"
  const pool = [...BY_TYPE[p.type], ...AREA]
  void GREET
  return `${greeting} ${pool[Math.floor(rnd() * pool.length)]}`
}
