import { describe, expect, it } from 'vitest'
import type { Card } from '../data/cards'
import { distance, isExact, judge, mistakenFor, normalize } from './answerMatch'

const card = (kanji: string, meaning: string): Card => ({
  kanji, meaning, level: 'N5', onyomi: [], kunyomi: [], ambiguous: false,
})

describe('normalize', () => {
  it('lowercases, strips punctuation, articles and parentheticals', () => {
    expect(normalize('  To  Eat! ')).toBe('eat')
    expect(normalize('the Sun (day)')).toBe('sun')
  })
})

describe('distance', () => {
  it('counts a transposition as one edit', () => {
    expect(distance('mountian', 'mountain')).toBe(1)
    expect(distance('cat', 'cut')).toBe(1)
  })
})

describe('isExact', () => {
  it('matches ignoring case and articles', () => {
    expect(isExact('EAT', card('食', 'to eat'))).toBe(true)
    expect(isExact('ea', card('食', 'eat'))).toBe(false)
  })
})

describe('judge', () => {
  const mountain = card('山', 'mountain')
  it('accepts exact answers', () => {
    expect(judge('mountain', mountain)).toBe('exact')
  })
  it('forgives typos in longer words', () => {
    expect(judge('mountian', mountain)).toBe('typo')
    expect(judge('mountin', mountain)).toBe('typo')
  })
  it('does not forgive short words', () => {
    expect(judge('son', card('日', 'sun'))).toBe('wrong')
  })
  it('rejects a near-miss that is closer to another card', () => {
    const pool = [card('A', 'fountain'), mountain]
    expect(judge('fountain', mountain, pool)).toBe('wrong')
  })
  it('rejects empty input', () => {
    expect(judge('  ', mountain)).toBe('wrong')
  })
})

describe('mistakenFor', () => {
  it('finds the card whose meaning was typed', () => {
    const sun = card('日', 'sun')
    const moon = card('月', 'moon')
    expect(mistakenFor('moon', sun, [sun, moon])?.kanji).toBe('月')
    expect(mistakenFor('zzzz', sun, [sun, moon])).toBeUndefined()
  })
})
