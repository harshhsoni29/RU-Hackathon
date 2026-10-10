/** 52-card deck. Internal cards are integers 0..51: rank = id >> 2 (0 = deuce … 12 = ace), suit = id & 3. */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['c', 'd', 'h', 's'];

export function cardId(rankIndex, suitIndex) {
  return (rankIndex << 2) | suitIndex;
}

export function rankIndex(id) {
  return id >> 2;
}

export function suitIndex(id) {
  return id & 3;
}

export function rankValue(id) {
  return (id >> 2) + 2;
}

export function makeDeck() {
  const deck = new Array(52);
  for (let i = 0; i < 52; i++) deck[i] = i;
  return deck;
}

export function shuffle(deck, rand) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

export function toCard(id) {
  const rank = RANKS[id >> 2];
  const suit = SUITS[id & 3];
  return { rank, suit, code: rank + suit };
}

export function toCards(ids) {
  return ids.map(toCard);
}

export function parseCode(code) {
  const r = RANKS.indexOf(code[0]);
  const s = SUITS.indexOf(code[1]);
  if (r < 0 || s < 0 || code.length !== 2) throw new Error(`bad card ${code}`);
  return cardId(r, s);
}

export function parseCodes(codes) {
  return codes.map(parseCode);
}
