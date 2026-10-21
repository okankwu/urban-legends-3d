export interface Garage {
  id: string
  name: string
  x: number
  z: number
  /** where a vehicle taken out of this garage appears */
  exit: { x: number; z: number; yaw: number }
  /** unlock required for this garage to open */
  requires?: string
}

export const GARAGES: Garage[] = [
  { id: 'g1', name: 'Central Garage', x: 50, z: -10.4, exit: { x: 50, z: -4, yaw: -Math.PI / 2 } },
  { id: 'g2', name: 'West Side Garage', x: -110, z: -10.4, exit: { x: -110, z: -4, yaw: -Math.PI / 2 }, requires: 'garages' },
  { id: 'g3', name: 'East Side Garage', x: 150, z: 10.4, exit: { x: 150, z: 4, yaw: Math.PI / 2 }, requires: 'garages' },
]

export const activeGarages = (unlocks: string[]) => GARAGES.filter((g) => !g.requires || unlocks.includes(g.requires))
export const garage = (id: string) => GARAGES.find((g) => g.id === id)
