import * as assert from 'assert';
import { addRecentItem, getRecentItems, removeRecentItem, MAX_RECENT_ITEMS, MementoLike, RecentItem } from '../startPage/recentItems';

class FakeMemento implements MementoLike {
    private store = new Map<string, unknown>();

    get<T>(key: string, defaultValue: T): T {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T;
    }

    async update(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
    }
}

suite('recentItems', () => {
    test('addRecentItem stores newest first', async () => {
        const state = new FakeMemento();

        await addRecentItem(state, { kind: 'project', name: 'First', folderPath: 'C:\\First' });
        await addRecentItem(state, { kind: 'project', name: 'Second', folderPath: 'C:\\Second' });

        const items = getRecentItems(state);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].name, 'Second');
        assert.strictEqual(items[1].name, 'First');
    });

    test('addRecentItem dedupes by folderPath (case-insensitive) and moves to front', async () => {
        const state = new FakeMemento();

        await addRecentItem(state, { kind: 'project', name: 'First', folderPath: 'C:\\Proj' });
        await addRecentItem(state, { kind: 'project', name: 'Second', folderPath: 'C:\\Other' });
        await addRecentItem(state, { kind: 'project', name: 'First Again', folderPath: 'c:\\proj' });

        const items = getRecentItems(state);
        assert.strictEqual(items.length, 2);
        assert.strictEqual(items[0].name, 'First Again');
        assert.strictEqual(items[1].name, 'Second');
    });

    test('addRecentItem caps the list at MAX_RECENT_ITEMS', async () => {
        const state = new FakeMemento();

        for (let i = 0; i < MAX_RECENT_ITEMS + 5; i++) {
            await addRecentItem(state, { kind: 'project', name: `Item ${i}`, folderPath: `C:\\Item${i}` });
        }

        const items = getRecentItems(state);
        assert.strictEqual(items.length, MAX_RECENT_ITEMS);
        assert.strictEqual(items[0].name, `Item ${MAX_RECENT_ITEMS + 4}`);
    });

    test('removeRecentItem removes the matching entry', async () => {
        const state = new FakeMemento();

        await addRecentItem(state, { kind: 'project', name: 'First', folderPath: 'C:\\First' });
        await addRecentItem(state, { kind: 'solution', name: 'Second', folderPath: 'C:\\Second' });

        await removeRecentItem(state, 'C:\\First');

        const items: RecentItem[] = getRecentItems(state);
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].name, 'Second');
    });
});
