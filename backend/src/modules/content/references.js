/** References follow exercises when they are reused or reviewed. */
export function lessonReferences(C, lesson) {
    const references = new Map();
    for (const id of Object.values(lesson.parts ?? {}).flat()) {
        const reference = C.ITEMS[id]?.reference;
        if (!reference?.url) continue;
        const previous = references.get(reference.url);
        if (previous) {
            if (!previous.locators.includes(reference.locator)) previous.locators.push(reference.locator);
        } else references.set(reference.url, { ...reference, locators: [reference.locator] });
    }
    return [...references.values()].map(({ locators, ...reference }) => ({ ...reference, locator: locators.filter(Boolean).join('; ') }));
}
