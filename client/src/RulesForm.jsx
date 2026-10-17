import { useId } from 'react';
import { FieldHead, Options, Opt } from './Info.jsx';

export const DEFAULT_RULES = {
  structure: 'nl', forcedBets: 'blinds', smallBlind: 5, bigBlind: 10, ante: 1,
  startingStack: 1000, raiseCap: 0, minRaise: 10, flSmallBet: 10, flBigBet: 20,
  turnTimeSec: 0, autoFoldOnTimeout: false, rabbitHunt: false, allowRebuys: true,
};

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v}
          className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Num({ label, hint, info, value, onChange, min = 0 }) {
  const id = useId();
  return (
    <div className="field">
      <FieldHead label={label} info={info} htmlFor={id} />
      <input id={id} type="number" inputMode="numeric" min={min} step="1" value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Toggle({ label, hint, info, checked, onChange, disabled }) {
  return (
    <div className={`toggle ${disabled ? 'disabled' : ''}`}>
      <div className="toggle-text">
        <FieldHead label={label} info={info} />
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <input type="checkbox" role="switch" aria-label={label} checked={!!checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export const INFO = {
  structure: (
    <>
      <p>How much a player is allowed to bet or raise at once.</p>
      <Options>
        <Opt name="No-limit">Any bet from the minimum raise up to all of your chips. The classic way Hold’em is played on TV.</Opt>
        <Opt name="Pot-limit">You can raise by at most the current size of the pot. Big swings are possible, but not unlimited.</Opt>
        <Opt name="Fixed-limit">Bets and raises are always a set size (the small bet before the turn, the big bet from the turn on). Good for slower, lower-risk games.</Opt>
      </Options>
    </>
  ),
  forcedBets: (
    <>
      <p>Forced bets go into the pot before anyone looks at their cards, so there is always something to play for.</p>
      <Options>
        <Opt name="Blinds">Two players next to the dealer button post a small and a big blind each hand. The standard for most games.</Opt>
        <Opt name="Antes">Everyone pays the same small amount into the pot every hand.</Opt>
        <Opt name="Both">Blinds and an ante together. Bigger pots, faster action.</Opt>
      </Options>
    </>
  ),
  smallBlind: <p>The chips posted by the player directly left of the dealer button before the cards are dealt. Usually half the big blind.</p>,
  bigBlind: <p>The chips posted by the second player left of the dealer button. It sets the minimum opening bet, and it is the amount everyone has to match to play before the flop.</p>,
  ante: <p>A small amount every player puts into the pot at the start of each hand, on top of any blinds. A player who can’t cover it goes all-in.</p>,
  startingStack: <p>How many chips each player begins with, and what a rebuy gives back. Deep stacks (100 big blinds or more) allow more bluffing and long games; shallow stacks end faster.</p>,
  minRaise: <p>The smallest amount a bet or raise has to add. For example, with a minimum raise of 10, a bet of 20 must be raised to at least 30.</p>,
  flSmallBet: <p>The fixed size of every bet and raise before the flop and on the flop. Players can only bet this amount, no more and no less.</p>,
  flBigBet: <p>The fixed size of every bet and raise on the turn and the river. Normally double the small bet.</p>,
  raiseCap: <p>The maximum number of raises allowed in one betting round, to stop endless re-raising. The opening bet doesn’t count. Enter 0 for no limit.</p>,
  turnTimeSec: <p>How many seconds a player has to act before time runs out. It keeps the game moving when someone is slow. Enter 0 to switch the clock off; otherwise the minimum is 5 seconds.</p>,
  autoFold: <p>When someone runs out of time, fold their hand for them. If they could have checked for free, the game checks instead so nobody is punished for nothing. Needs the turn timer to be on.</p>,
  rabbit: <p>After a hand ends early (everyone else folded, or all-in before the river), show the cards that would have come next, faded out. Just for fun; it never changes the result.</p>,
  rebuys: <p>Lets a player who has lost all their chips buy back in with a fresh starting stack and keep playing. Switch it off for a winner-takes-all game where busted players watch.</p>,
  tableName: <p>A label everyone sees at the top of the table, like “Friday at Priya’s”. It has no effect on the game.</p>,
  cardMode: (
    <>
      <p>Decide once, before you create the table. It can’t be changed afterwards.</p>
      <Options>
        <Opt name="Digital cards">The app shuffles and deals. Each phone shows only its owner’s two hole cards, the board appears on every screen, and the app works out who wins.</Opt>
        <Opt name="Physical cards">You deal a real deck at the table. The app only tracks chips, bets, blinds and whose turn it is. At showdown, you tell the app who won.</Opt>
      </Options>
    </>
  ),
  hostRole: (
    <>
      <p>Whether you take a seat at the table or just run it.</p>
      <Options>
        <Opt name="I’m playing">You get a seat, chips and cards like everyone else, plus the host controls.</Opt>
        <Opt name="Only running the table">You don’t get a seat. You deal (in physical mode), pick winners, and manage the game from the sidelines.</Opt>
      </Options>
    </>
  ),
  hostName: <p>The name shown on your seat to the other players.</p>,
};

export default function RulesForm({ rules, onChange, cardMode, lockStack }) {
  const set = (k) => (v) => onChange({ ...rules, [k]: v });
  const blinds = rules.forcedBets !== 'antes';
  const antes = rules.forcedBets !== 'blinds';
  const fl = rules.structure === 'fl';

  return (
    <div className="rules-form">
      <div className="field">
        <FieldHead label="Betting structure" info={INFO.structure} />
        <Segmented label="Betting structure" value={rules.structure} onChange={set('structure')}
          options={[['nl', 'No-limit'], ['pl', 'Pot-limit'], ['fl', 'Fixed-limit']]} />
      </div>
      <div className="field">
        <FieldHead label="Forced bets" info={INFO.forcedBets} />
        <Segmented label="Forced bets" value={rules.forcedBets} onChange={set('forcedBets')}
          options={[['blinds', 'Blinds'], ['antes', 'Antes'], ['both', 'Both']]} />
      </div>
      <div className="grid-2">
        {blinds && <Num label="Small blind" info={INFO.smallBlind} value={rules.smallBlind} onChange={set('smallBlind')} min={1} />}
        {blinds && <Num label="Big blind" info={INFO.bigBlind} value={rules.bigBlind} onChange={set('bigBlind')} min={1} />}
        {antes && <Num label="Ante" info={INFO.ante} hint="Paid by every player" value={rules.ante} onChange={set('ante')} min={1} />}
        <Num label="Starting stack" info={INFO.startingStack} value={rules.startingStack} onChange={set('startingStack')} min={1}
          hint={lockStack ? 'Applies to new players and rebuys' : null} />
        {!fl && <Num label="Minimum raise" info={INFO.minRaise} hint="Each bet or raise adds at least this" value={rules.minRaise} onChange={set('minRaise')} min={1} />}
        {fl && <Num label="Small bet" info={INFO.flSmallBet} hint="Pre-flop and flop" value={rules.flSmallBet} onChange={set('flSmallBet')} min={1} />}
        {fl && <Num label="Big bet" info={INFO.flBigBet} hint="Turn and river" value={rules.flBigBet} onChange={set('flBigBet')} min={1} />}
        <Num label="Raises per round" info={INFO.raiseCap} hint={Number(rules.raiseCap) === 0 ? 'Unlimited' : 'Opening bet not counted'} value={rules.raiseCap} onChange={set('raiseCap')} />
        <Num label="Turn timer (sec)" info={INFO.turnTimeSec} hint={Number(rules.turnTimeSec) === 0 ? 'Off' : 'Minimum 5'} value={rules.turnTimeSec} onChange={set('turnTimeSec')} />
      </div>
      <Toggle label="Auto-fold when time runs out" info={INFO.autoFold} hint="Checks instead when checking is free"
        checked={rules.autoFoldOnTimeout} disabled={!Number(rules.turnTimeSec)} onChange={set('autoFoldOnTimeout')} />
      {cardMode === 'digital' && (
        <Toggle label="Rabbit hunting" info={INFO.rabbit} hint="Show the cards that would have come after a hand ends early"
          checked={rules.rabbitHunt} onChange={set('rabbitHunt')} />
      )}
      <Toggle label="Allow rebuys" info={INFO.rebuys} hint="Busted players can buy back in for the starting stack"
        checked={rules.allowRebuys} onChange={set('allowRebuys')} />
    </div>
  );
}

const STRUCT = { nl: 'No-limit', pl: 'Pot-limit', fl: 'Fixed-limit' };
export function rulesSummary(r) {
  const out = [STRUCT[r.structure]];
  if (r.bigBlind) out.push(`Blinds ${r.smallBlind}/${r.bigBlind}`);
  if (r.ante) out.push(`Ante ${r.ante}`);
  out.push(`Stack ${r.startingStack}`);
  out.push(r.structure === 'fl' ? `Bets ${r.flSmallBet}/${r.flBigBet}` : `Min raise ${r.minRaise}`);
  out.push(r.raiseCap ? `${r.raiseCap} raise${r.raiseCap > 1 ? 's' : ''} max per round` : 'Unlimited raises');
  if (r.turnTimeSec) out.push(`${r.turnTimeSec}s turns${r.autoFoldOnTimeout ? ', auto-fold' : ''}`);
  if (r.rabbitHunt) out.push('Rabbit hunting');
  out.push(r.allowRebuys ? 'Rebuys on' : 'No rebuys');
  return out;
}
