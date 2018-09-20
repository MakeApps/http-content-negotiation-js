'use strict';

const {
    awsNegotiateEncoding,
    awsSplitHeaderValue,
    performNegotiation,
    parseValueTuple,
    splitHeaderValue,
    mediaRangeValueMatch,
    mediaRangeValueCompare,
    parameterMatch,
    parameterCompare,
    wildcardValueMatch,
    wildcardValueCompare,
    ValueTuple } = require('../http-content-negotiation.js');
const { deepStrictEqual, equal, ok } = require('assert');

/*
 * Helper to create a Map from an Object.
 */
const VP = (object) => {
    if (object === null || object === undefined) {
        object = {};
    }

    return new Map(Object.entries(object));
};

/*
 * Helper to construct a ValueTuple from an Object
 */
const VT = (value, object) => {
    return new ValueTuple(value, VP(object));
};

describe('splitHeaderValue()', () => {
    it('should split a simple single header', () => {
        deepStrictEqual(splitHeaderValue('a, b, c'), ['a', 'b', 'c']);
    });
    it('should strip optional whitespace', () => {
        deepStrictEqual(splitHeaderValue('a , b,c '), ['a', 'b', 'c']);
    });
    it('should not be confused by / characters', () => {
        deepStrictEqual(splitHeaderValue('image/a, image/b'), ['image/a', 'image/b']);
    });
    it('should not be confused by * characters', () => {
        deepStrictEqual(splitHeaderValue('image/*, */*'), ['image/*', '*/*']);
    });
});

describe('parseValueTuple()', () => {
    it('should handle items with no attributes', () => {
        deepStrictEqual(
            parseValueTuple('foo'),
            VT('foo', {q: 1}));
    });
    it('should parse multiple attributes with values', () => {
        deepStrictEqual(
            parseValueTuple('foo;a=1;b=2'),
            VT('foo', {q: 1, a: '1', b: '2'}));
    });
    it('should handle attributes after wildcards', () => {
        deepStrictEqual(
            parseValueTuple('image/*;a=1;b=2'),
            VT('image/*', {q: 1, a: '1', b: '2'}));
    });
    it('should not override an explicitly specified q parameter', () => {
        deepStrictEqual(
            parseValueTuple('image/*;a=1;b=2;q=0.25'),
            VT('image/*', {a: '1', b: '2', q: 0.25}));
    });
});

describe('performNegotiation()', () => {
    it('should select the common value', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('b', {q: 1}), VT('c', {q: 1})],
                [VT('c', {q: 1}), VT('z', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('c', {q: 1}));
    });
    it('should fail if there are no common values', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('b', {q: 1}), VT('c', {q: 1})],
                [VT('z', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            null);
    });
    it('should take client weights into account', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('b', {q: 1}), VT('c', {q: 0.8})],
                [VT('b', {q: 0.9}), VT('c', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('b', {q: 0.9}));
    });
    it('should take server weights into account', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('b', {q: 1}), VT('c', {q: 1})],
                [VT('b', {q: 0.9}), VT('c', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('c', {q: 1}));
    });
    it('should consider 0-weights as a non-match', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1})],
                [VT('a', {q: 0})],
                wildcardValueMatch,
                wildcardValueCompare),
            null);
    });
    it('should support wildcard matching', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('*', {q: 0.5})],
                [VT('a', {q: 0.25}), VT('b', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('b', {q: 1}));
    });
    it('should not apply wildcard to earlier values', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a', {q: 1}), VT('*', {q: 0.5})],
                [VT('a', {q: 0.8}), VT('b', {q: 1})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('a', {q: 0.8}));
    });
    it('should pass server parameters through to negotiated result', () => {
        deepStrictEqual(
            performNegotiation(
                [VT('a'), VT('b'), VT('*', {q: 0.5})],
                [VT('a', {q: 0.8}), VT('b', {z: 'yabba'})],
                wildcardValueMatch,
                wildcardValueCompare),
            VT('b', {z: 'yabba'}));
    });
});

describe('parameterMatch()', () => {
    it('should match on exact parameters', () => {
        ok(parameterMatch(VT('a', {a: '1', b: '2'}), VT('a', {a: '1', b: '2'})));
    });
    it('should not match on subset of client parameters', () => {
        ok(!parameterMatch(VT('a', {a: '1'}), VT('a', {a: '1', b: '2'})));
    });
    it('should match on superset of client parameters', () => {
        ok(parameterMatch(VT('a', {a: '1', b: '2'}), VT('a', {a: '1'})));
    });
    it('should ignore q attribute from server', () => {
        ok(parameterMatch(VT('a', {a: '1', b: '2', q: 3}), VT('a', {a: '1', b: '2'})));
    });
    it('should ignore q attribute from client', () => {
        ok(parameterMatch(VT('a', {a: '1', b: '2'}), VT('a', {a: '1', b: '2', q: 3})));
    });
    it('should ignore mismached q attributes', () => {
        ok(parameterMatch(VT('a', {a: '1', b: '2', q: 4}), VT('a', {a: '1', b: '2', q: 3})));
    });
});

describe('parameterCompare()', () => {
    it('should prefer more specific matches', () => {
        ok(parameterCompare(VT('a', {a: '1', b: '2'}), VT('a', {a: '1'}), VT('a')) < 0);
        ok(parameterCompare(VT('a', {a: '1', b: '2'}), VT('a'), VT('a', {a: '1'})) > 0);
    });
    it('should consider equal number of matched parameters equivalent', () => {
        equal(parameterCompare(VT('a', {a: '1', b: '2'}), VT('a', {a: '1'}), VT('a', {b: '2'})), 0);
        equal(parameterCompare(VT('a', {a: '1', b: '2'}), VT('a'), VT('a')), 0);
    });
    it('should fall back to qvalues', () => {
        ok(parameterCompare(VT('a', {a: '1'}), VT('a'), VT('a', {q: 0.5})) < 0);
        ok(parameterCompare(VT('a', {a: '1'}), VT('a'), VT('a', {q: 2})) > 0);
    });
});

describe('wildcardValueMatch()', () => {
    it('should match on identical values', () => {
        ok(wildcardValueMatch(VT('a'), VT('a')));
    });
    it('should not match on different values', () => {
        ok(!wildcardValueMatch(VT('a'), VT('b')));
    });
    it('should match on client wildcard', () => {
        ok(wildcardValueMatch(VT('a'), VT('*')));
    });
    it('should not match on server wildcard', () => {
        ok(!wildcardValueMatch(VT('*'), VT('a')));
    });
    it('should use parameterMatch()', () => {
        ok(!wildcardValueMatch(VT('a'), VT('*', {a: '1'})));
        ok(wildcardValueMatch(VT('a', {a: '1'}), VT('*')));
        ok(wildcardValueMatch(VT('a'), VT('*', {q: 13})));
    });
});

describe('wildcardValueCompare()', () => {
    it('should compare wildcards after exact matches', () => {
        ok(wildcardValueCompare(VT('a'), VT('a'), VT('*')) < 0);
        ok(wildcardValueCompare(VT('a'), VT('*'), VT('a')) > 0);
    });
    it('should compare identical values to 0', () => {
        equal(wildcardValueCompare(VT('a'), VT('a'), VT('a')), 0);
        equal(wildcardValueCompare(VT('a'), VT('*'), VT('*')), 0);
    });
    it('should use parameterCompare()', () => {
        ok(wildcardValueCompare(VT('a', {a: '1'}), VT('a', {a: '1'}), VT('a')) < 0);
        ok(wildcardValueCompare(VT('a', {a: '1'}), VT('a'), VT('a', {a: '1'})) > 0);
    });
});

describe('mediaRangeValueMatch()', () => {
    it('should match on identical values', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('a/aa')), true);
    });
    it('should not match on different types', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('b/aa')), false);
    });
    it('should not match on different subtypes', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('a/bb')), false);
    });
    it('should match on type wildcard', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('*/aa')), true);
    });
    it('should match on subtype wildcard', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('a/*')), true);
    });
    it('should match on type and subtype wildcards', () => {
        equal(mediaRangeValueMatch(VT('a/aa'), VT('*/*')), true);
    });
    it('should use parameterMatch()', () => {
        ok(!mediaRangeValueMatch(VT('a/aa'), VT('a/aa', {a: '1'})));
        ok(mediaRangeValueMatch(VT('a/aa', {a: '1'}), VT('a/aa')));
        ok(mediaRangeValueMatch(VT('a/aa'), VT('a/aa', {q: 13})));
    });
});

describe('mediaRangeValueCompare()', () => {
    it ('should support the full matrix of wildcard positions', () => {
        equal(mediaRangeValueCompare(VT('a/aa'), VT('a/aa'), VT('a/aa')), 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/aa'), VT('a/*')) < 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/aa'), VT('*/aa')) < 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/aa'), VT('*/*')) < 0);

        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/*'), VT('a/aa')) > 0);
        equal(mediaRangeValueCompare(VT('a/aa'), VT('a/*'), VT('a/*')), 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/*'), VT('*/aa')) < 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('a/*'), VT('*/*')) < 0);

        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/aa'), VT('a/aa')) > 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/aa'), VT('a/*')) > 0);
        equal(mediaRangeValueCompare(VT('a/aa'), VT('*/aa'), VT('*/aa')), 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/aa'), VT('*/*')) < 0);

        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/*'), VT('a/aa')) > 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/*'), VT('a/*')) > 0);
        ok(mediaRangeValueCompare(VT('a/aa'), VT('*/*'), VT('*/aa')) > 0);
        equal(mediaRangeValueCompare(VT('a/aa'), VT('*/*'), VT('*/*')), 0);
    });
    it('should use parameterCompare()', () => {
        ok(wildcardValueCompare(VT('a', {a: '1'}), VT('a', {a: '1'}), VT('a')) < 0);
        ok(wildcardValueCompare(VT('a', {a: '1'}), VT('a'), VT('a', {a: '1'})) > 0);
    });
});

describe('awsSplitHeaderValue', () => {
    it('should combine and split multiple headers', () => {
        deepStrictEqual(
            awsSplitHeaderValue([
                {'key': 'Accept-Encoding', 'value': 'deflate, gzip, br'},
                {'key': 'Accept-Encoding', 'value': 'identity, deflate'}]),
            ['deflate', 'gzip', 'br', 'identity', 'deflate']
        );
    });
});

describe('awsNegotiateEncoding', () => {
    it('should return the best server value if no Accept-Encoding found', () => {
        equal(
            awsNegotiateEncoding(
                {'user-agent': [{'key': 'User-Agent', 'value': 'Firefox'}]},
                [VT('gzip', {q: 0.5}), VT('br', {q: 1}), VT('identity', {q: 0.1})]),
            'br');
    });
    it('should assume an implicit identity;q=1 value', () => {
        equal(
            awsNegotiateEncoding(
                {'accept-encoding':
                    [{'key': 'Accept-Encoding', 'value': 'gzip;q=0.5'}]},
                [VT('identity', {q: 1}), VT('gzip', {q: 1})]),
            'identity');
    });
    it('should allow implicit identity value to be overridden explicitly', () => {
        equal(
            awsNegotiateEncoding(
                {'accept-encoding':
                    [{'key': 'Accept-Encoding', 'value': 'gzip;q=0.5, identity;q=0'}]},
                [VT('identity', {q: 1}), VT('gzip', {q: 1})]),
            'gzip');
    });
    it('should allow implicit identity value to be overridden by wildcard', () => {
        equal(
            awsNegotiateEncoding(
                {'accept-encoding':
                    [{'key': 'Accept-Encoding', 'value': 'gzip;q=0.5, *;q=0'}]},
                [VT('identity', {q: 1}), VT('gzip', {q: 1})]),
            'gzip');
    });
});
