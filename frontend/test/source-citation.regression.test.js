import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

test('source citations display precise attribution, locator and dialect limits with safe external links', () => {
    const h = hookHarness('../../src/components/SourceCitation.jsx');
    const reference = { title: 'Author, journal, 2014', url: 'https://example.org/paper', locator: 'pp. 112–113', dialect: 'Not assigned to a single dialect', note: 'Original spelling retained' };
    const tree = h.render({ reference });
    const link = nodes(tree, (n) => n.type === 'a')[0];
    assert.equal(link.props.href, reference.url);
    assert.equal(link.props.rel, 'noopener noreferrer');
    assert.match(textOf(tree), /112–113/);
    assert.match(textOf(tree), /Not assigned to a single dialect/);
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org/paper', 'broken']) {
        assert.equal(nodes(h.render({ reference: { ...reference, url } }), (n) => n.type === 'a').length, 0);
    }
    assert.equal(h.render({}), null);
    h.unmount();
});
