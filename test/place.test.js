import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createTree, putNode, ancestors, pathLabel, siblings, children,
    linkNeighbors, canMove, validatePlace, genPlaceName, hash32,
} from '../src/core/place/tree.js';

function sample() {
    const tree = createTree();
    putNode(tree, { id: 'p_yanhui', name: '雁回县', parent: null, scale: 'place' });
    putNode(tree, { id: 'p_wuli', name: '北门外五里', parent: 'p_yanhui', scene: 'roadside' });
    putNode(tree, { id: 'p_gate', name: '北门', parent: 'p_yanhui', scene: 'gate' });
    putNode(tree, { id: 'p_road', name: '驿道', parent: null, scene: 'roadside' });
    linkNeighbors(tree, 'p_wuli', 'p_gate');
    linkNeighbors(tree, 'p_gate', 'p_road');
    return tree;
}

test('祖先链与路径', () => {
    const tree = sample();
    assert.deepEqual(ancestors(tree, 'p_wuli'), ['p_yanhui', 'p_wuli']);
    assert.equal(pathLabel(tree, 'p_wuli'), '雁回县>北门外五里');
    assert.deepEqual(children(tree, 'p_yanhui').map(n => n.id).sort(), ['p_gate', 'p_wuli']);
});

test('兄弟节点', () => {
    const tree = sample();
    assert.deepEqual(siblings(tree, 'p_wuli'), ['p_gate']);
});

test('邻接：只能走到相邻或原地', () => {
    const tree = sample();
    assert.equal(canMove(tree, 'p_wuli', 'p_gate'), true);
    assert.equal(canMove(tree, 'p_wuli', 'p_wuli'), true);
    assert.equal(canMove(tree, 'p_wuli', 'p_road'), false);
});

test('地点校验', () => {
    const tree = sample();
    assert.equal(validatePlace(tree, 'p_wuli').ok, true);
    assert.equal(validatePlace(tree, 'p_nowhere').ok, false);
});

test('确定性命名：同参数永远同名，换参数会变', () => {
    const a1 = genPlaceName('beiliang', 'p_wf', 1);
    const a2 = genPlaceName('beiliang', 'p_wf', 1);
    const b = genPlaceName('beiliang', 'p_wf', 2);
    const c = genPlaceName('other', 'p_wf', 1);
    assert.equal(a1, a2);
    assert.notEqual(a1, b);
    assert.notEqual(a1, c);
});

test('hash32 稳定且为无符号', () => {
    assert.equal(hash32('abc'), hash32('abc'));
    assert.ok(hash32('abc') >= 0);
    assert.ok(hash32('中文') >= 0);
});

test('putNode 不接受空 id', () => {
    const tree = createTree();
    assert.throws(() => putNode(tree, {}), /id/);
});
