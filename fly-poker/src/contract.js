/**
 * Public API for the Hold'em table. UI and simulation code should import this
 * module and not reach into poker/ or brains/.
 *
 * Flies, in seat order: Vera (tight-aggressive, top-hat), Buzz (loose-aggressive, scarf),
 * Nib (tight-passive, monocle), Callie (loose-passive, bow), Mani (maniac, crown).
 * The dealer is Chip, a beetle, and is not a seated player.
 *
 * createTable(config?) merges style numbers as defaults <- config/styles.json <- config.styles.
 * dealHand(table) deals or, if fewer than two players have chips, leaves the table between hands.
 * step(table) returns the action just taken, or null between hands.
 * The action that ends a hand has handEnded and learningApplied set; the next step returns null.
 * getFlyInspection reads the live actor's decision without changing the table.
 * Learning runs inside the hand-ending step and is not exported.
 */

export { FLIES, DEALER, DEFAULT_STYLES } from './brains/styles.js';
export { createTable, dealHand, step, getPublicState, getFlyInspection, killFly, sponsorFly } from './table.js';
