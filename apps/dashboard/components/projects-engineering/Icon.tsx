const icons:Record<string,string> = {
  dashboard:'▦',projects:'▣',planning:'◫',engineering:'⌘',document:'▤',procurement:'⌑',cost:'₦',resources:'♙',construction:'⌂',quality:'◇',hse:'✚',risk:'△',change:'⇄',action:'✓',client:'◎',progress:'↗',reports:'▥',ai:'✦',closeout:'◉',search:'⌕',bell:'♢',settings:'⚙',plus:'＋',filter:'≡',export:'⇩',calendar:'▦',chev:'›',more:'•••',info:'i'
};
export function Icon({name,size=18}:{name:string,size?:number}){return <span className="icon" style={{fontSize:size}} aria-hidden>{icons[name]||'•'}</span>}
