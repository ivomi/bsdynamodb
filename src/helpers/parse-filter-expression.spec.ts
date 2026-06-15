import { describe, expect, it } from 'vitest';
import { parseFilterExpression } from './parse-filter-expression.js';

const noNames = {};
const noValues = {};

describe('parseFilterExpression', () => {
  it('parses simple equality', () => {
    const result = parseFilterExpression('status = :val', noNames, { ':val': 'active' });
    expect(result).toEqual({ status: 'active' });
  });

  it('parses not-equal operator', () => {
    const result = parseFilterExpression('status <> :val', noNames, { ':val': 'deleted' });
    expect(result).toEqual({ status: { $ne: 'deleted' } });
  });

  it('parses < <= > >= operators', () => {
    expect(parseFilterExpression('age > :n', noNames, { ':n': 18 })).toEqual({ age: { $gt: 18 } });
    expect(parseFilterExpression('age >= :n', noNames, { ':n': 18 })).toEqual({ age: { $gte: 18 } });
    expect(parseFilterExpression('age < :n', noNames, { ':n': 65 })).toEqual({ age: { $lt: 65 } });
    expect(parseFilterExpression('age <= :n', noNames, { ':n': 65 })).toEqual({ age: { $lte: 65 } });
  });

  it('resolves ExpressionAttributeNames', () => {
    const result = parseFilterExpression('#s = :val', { '#s': 'status' }, { ':val': 'active' });
    expect(result).toEqual({ status: 'active' });
  });

  it('parses AND', () => {
    const result = parseFilterExpression('age > :min AND age < :max', noNames, { ':min': 10, ':max': 50 });
    expect(result).toEqual({ $and: [{ age: { $gt: 10 } }, { age: { $lt: 50 } }] });
  });

  it('parses OR', () => {
    const result = parseFilterExpression('status = :a OR status = :b', noNames, { ':a': 'active', ':b': 'pending' });
    expect(result).toEqual({ $or: [{ status: 'active' }, { status: 'pending' }] });
  });

  it('parses NOT', () => {
    const result = parseFilterExpression('NOT status = :val', noNames, { ':val': 'deleted' });
    expect(result).toEqual({ $nor: [{ status: 'deleted' }] });
  });

  it('parses parentheses grouping', () => {
    const result = parseFilterExpression(
      '(status = :a OR status = :b) AND age > :min',
      noNames,
      { ':a': 'active', ':b': 'pending', ':min': 18 },
    );
    expect(result).toEqual({
      $and: [
        { $or: [{ status: 'active' }, { status: 'pending' }] },
        { age: { $gt: 18 } },
      ],
    });
  });

  it('parses BETWEEN', () => {
    const result = parseFilterExpression('age BETWEEN :lo AND :hi', noNames, { ':lo': 18, ':hi': 65 });
    expect(result).toEqual({ age: { $gte: 18, $lte: 65 } });
  });

  it('parses IN', () => {
    const result = parseFilterExpression('status IN (:a, :b, :c)', noNames, { ':a': 'a', ':b': 'b', ':c': 'c' });
    expect(result).toEqual({ status: { $in: ['a', 'b', 'c'] } });
  });

  it('parses attribute_exists', () => {
    const result = parseFilterExpression('attribute_exists(email)', noNames, noValues);
    expect(result).toEqual({ email: { $exists: true } });
  });

  it('parses attribute_not_exists', () => {
    const result = parseFilterExpression('attribute_not_exists(deletedAt)', noNames, noValues);
    expect(result).toEqual({ deletedAt: { $exists: false } });
  });

  it('parses begins_with', () => {
    const result = parseFilterExpression('begins_with(name, :prefix)', noNames, { ':prefix': 'Al' });
    expect(result).toMatchObject({ name: { $regex: expect.any(RegExp) } });
    const regex = (result['name'] as { $regex: RegExp })['$regex'];
    expect(regex.test('Alice')).toBe(true);
    expect(regex.test('Bob')).toBe(false);
  });

  it('parses contains (string)', () => {
    const result = parseFilterExpression('contains(bio, :sub)', noNames, { ':sub': 'developer' });
    expect(result).toMatchObject({ bio: { $regex: expect.any(RegExp) } });
    const regex = (result['bio'] as { $regex: RegExp })['$regex'];
    expect(regex.test('senior developer')).toBe(true);
    expect(regex.test('manager')).toBe(false);
  });

  it('resolves nested path with dot notation', () => {
    const result = parseFilterExpression('#a.#b = :val', { '#a': 'address', '#b': 'city' }, { ':val': 'Prague' });
    expect(result).toEqual({ 'address.city': 'Prague' });
  });
});
