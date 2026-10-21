import { useGame, useGameFields } from '../store/game'
import { MENUS, shops } from './shops'
import { lockPointer } from '../engine/input'
import { sfx } from '../engine/audio'

let toastTimer = 0

export function toast(text: string) {
  useGame.getState().set({ toast: text })
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => useGame.getState().set({ toast: '' }), 2600)
}

/** Overlay shown while browsing a shop counter. */
export default function ShopUI() {
  const s = useGameFields(['phase', 'inShop', 'money', 'health', 'set'] as const)
  if (s.phase !== 'shop') return null
  const shop = shops.find((x) => x.id === s.inShop)
  if (!shop) return null
  const menu = MENUS[shop.kind]

  const close = () => {
    s.set({ phase: 'playing' })
    lockPointer()
  }
  const buy = (id: string) => {
    const item = menu.lines.find((l) => l.id === id)!
    const st = useGame.getState()
    if (st.money < item.price) {
      sfx('deny')
      return toast('Not enough money')
    }
    if (item.health && st.health >= 100) return toast('Already at full health')
    st.set({
      money: st.money - item.price,
      health: item.health ? Math.min(100, st.health + item.health) : st.health,
      stamina: item.stamina ? 100 : st.stamina,
    })
    sfx('buy')
    toast(`Bought ${item.label.split('  ')[0]}`)
  }

  return (
    <div className="menu shop-ui" role="dialog" aria-label={shop.name}>
      <div className="menu-card">
        <h1 style={{ fontSize: 30 }}>{shop.name}</h1>
        <p className="sub">{menu.title}</p>
        <div className="panel">
          <div className="shop-money">Cash: <b>${s.money}</b> · Health <b>{Math.round(s.health)}</b></div>
          {menu.lines.map((l) => (
            <button key={l.id} className="shop-line" onClick={() => buy(l.id)}>
              <span>{l.label}</span>
              <b>${l.price}</b>
            </button>
          ))}
          <button className="primary" onClick={close}>Leave counter</button>
        </div>
      </div>
    </div>
  )
}
